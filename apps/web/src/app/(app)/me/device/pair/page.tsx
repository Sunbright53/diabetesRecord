"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

// ─── BLE UUIDs (must match ESP32 firmware) ───────────────────────────────────
const SERVICE_UUID  = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHAR_SSID     = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CHAR_PASSWORD = "beb5483e-36e1-4688-b7f5-ea07361b26a9";
const CHAR_TOKEN    = "beb5483e-36e1-4688-b7f5-ea07361b26aa";
const CHAR_API_URL  = "beb5483e-36e1-4688-b7f5-ea07361b26ab";
const CHAR_STATUS   = "beb5483e-36e1-4688-b7f5-ea07361b26ac";
const CHAR_CMD      = "beb5483e-36e1-4688-b7f5-ea07361b26ad";

// ─── Multi-packet protocol ──────────────────────────────────────────────────
// ESP32 default BLE MTU = 23 (payload ~20). Long strings (JWT ~200B) must be chunked.
// We terminate each characteristic write with '\n' so firmware knows when payload ends.
const CHUNK_SIZE = 18;   // MTU 23 - 3 header - 2 safety
const EOF_MARKER = "\n";
const WAITING_TIMEOUT_MS = 60_000;

const STATUS: Record<number, { label: string; detail: string; done?: boolean; error?: boolean }> = {
  0x00: { label: "รอรับข้อมูล",        detail: "ESP32 พร้อมรับการตั้งค่า" },
  0x01: { label: "ได้รับข้อมูลแล้ว",   detail: "กำลังเชื่อมต่อ WiFi..." },
  0x02: { label: "กำลังต่อ WiFi",       detail: "กำลังเชื่อมต่อกับเครือข่าย..." },
  0x03: { label: "WiFi เชื่อมต่อแล้ว", detail: "กำลังลงทะเบียนกับ server..." },
  0x04: { label: "กำลังลงทะเบียน",     detail: "กำลัง pair กับ account ของคุณ..." },
  0x05: { label: "สำเร็จ!",            detail: "อุปกรณ์พร้อมใช้งานแล้ว", done: true },
  0xFF: { label: "เกิดข้อผิดพลาด",     detail: "ตรวจสอบรหัส WiFi แล้วลองใหม่", error: true },
};

type Step = "idle" | "scanning" | "connected" | "sending" | "waiting" | "done" | "error";

const enc = new TextEncoder();

async function writeLong(char: BluetoothRemoteGATTCharacteristic, text: string) {
  const payload = text + EOF_MARKER;
  const bytes = enc.encode(payload);
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, Math.min(i + CHUNK_SIZE, bytes.length));
    await char.writeValueWithResponse(chunk);
  }
}

function Steps({ current }: { current: Step }) {
  const steps = [
    { id: "scanning",  label: "สแกน" },
    { id: "connected", label: "เชื่อม" },
    { id: "sending",   label: "ส่งข้อมูล" },
    { id: "waiting",   label: "รอ" },
    { id: "done",      label: "เสร็จ" },
  ];
  const idx = steps.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < idx ? "bg-emerald-500 text-white" :
              i === idx ? "bg-slate-900 text-white ring-4 ring-slate-200" :
              "bg-gray-100 text-gray-400"
            }`}>
              {i < idx ? "✓" : i + 1}
            </div>
            <span className={`text-[10px] ${i === idx ? "text-slate-900 font-semibold" : "text-gray-400"}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-0.5 mb-4 mx-1 ${i < idx ? "bg-emerald-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function BLEPairPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [ssid, setSsid] = useState("");
  const [wifiPw, setWifiPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLog = useCallback((msg: string) => {
    setLog((l) => [...l.slice(-6), msg]);
  }, []);

  const clearWaitingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearWaitingTimeout();
      deviceRef.current?.gatt?.disconnect();
    };
  }, [clearWaitingTimeout]);

  const isBLESupported = typeof navigator !== "undefined" && "bluetooth" in navigator;

  async function startPairing() {
    if (!ssid.trim()) { setError("กรุณาใส่ชื่อ WiFi"); return; }
    if (!wifiPw)     { setError("กรุณาใส่รหัส WiFi"); return; }
    setError("");
    setLog([]);
    clearWaitingTimeout();

    addLog("กำลังสร้าง provision token...");
    let token: string, apiBase: string;
    try {
      const resp = await api.sensor.provisionToken();
      token = resp.token;
      apiBase = resp.api_base;
      addLog(`ได้ token แล้ว (${token.length} bytes)`);
    } catch {
      setError("ไม่สามารถสร้าง token ได้ กรุณา login ใหม่");
      return;
    }

    setStep("scanning");
    addLog("กำลังสแกนหาอุปกรณ์...");
    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "MetaBreath" }],
        optionalServices: [SERVICE_UUID],
      });
      deviceRef.current = device;
      addLog(`พบอุปกรณ์: ${device.name}`);

      device.addEventListener("gattserverdisconnected", () => {
        clearWaitingTimeout();
        addLog("[BLE] อุปกรณ์ตัดการเชื่อมต่อ");
        setStep((cur) => {
          if (cur === "done") return cur;
          setError("อุปกรณ์หลุดการเชื่อมต่อ BLE ก่อนตั้งค่าเสร็จ — ลองใหม่");
          return "error";
        });
      });
    } catch (e: unknown) {
      const name = (e as Error).name;
      setStep("idle");
      setError(name === "NotFoundError" ? "ไม่พบอุปกรณ์ MetaBreath ใกล้เคียง" : "ยกเลิกการสแกน");
      return;
    }

    setStep("connected");
    addLog("กำลังเชื่อมต่อ BLE...");
    let server: BluetoothRemoteGATTServer;
    try {
      server = await device.gatt!.connect();
      addLog("เชื่อมต่อ BLE สำเร็จ");
    } catch {
      setStep("error");
      setError("ไม่สามารถเชื่อมต่อ BLE ได้");
      return;
    }

    let service: BluetoothRemoteGATTService;
    try {
      service = await server.getPrimaryService(SERVICE_UUID);
    } catch {
      setStep("error");
      setError("ไม่พบ MetaBreath service บนอุปกรณ์นี้");
      return;
    }

    const [cSsid, cPw, cToken, cApiUrl, cStatus, cCmd] = await Promise.all([
      service.getCharacteristic(CHAR_SSID),
      service.getCharacteristic(CHAR_PASSWORD),
      service.getCharacteristic(CHAR_TOKEN),
      service.getCharacteristic(CHAR_API_URL),
      service.getCharacteristic(CHAR_STATUS),
      service.getCharacteristic(CHAR_CMD),
    ]);

    await cStatus.startNotifications();
    cStatus.addEventListener("characteristicvaluechanged", (e: Event) => {
      const val = (e.target as BluetoothRemoteGATTCharacteristic).value!.getUint8(0);
      setStatusCode(val);
      const s = STATUS[val];
      if (!s) return;
      addLog(`[ESP32] ${s.label}`);
      if (s.done)  { clearWaitingTimeout(); setStep("done"); }
      if (s.error) { clearWaitingTimeout(); setStep("error"); setError(s.detail); }
    });

    setStep("sending");
    addLog("กำลังส่งข้อมูล WiFi...");
    try {
      await writeLong(cSsid, ssid);
      addLog(`ส่ง SSID (${ssid.length} chars)`);
      await writeLong(cPw, wifiPw);
      addLog(`ส่ง WiFi password (${wifiPw.length} chars)`);
      await writeLong(cToken, token);
      addLog(`ส่ง token (${token.length} chars)`);
      await writeLong(cApiUrl, apiBase);
      addLog(`ส่ง API URL: ${apiBase}`);

      setStep("waiting");
      addLog("สั่งให้อุปกรณ์เริ่มเชื่อมต่อ...");
      await writeLong(cCmd, "GO");

      timeoutRef.current = setTimeout(() => {
        setStep((cur) => {
          if (cur === "done" || cur === "error") return cur;
          setError("ไม่ตอบสนองภายใน 60 วิ — ตรวจสอบ WiFi/สัญญาณ แล้วลองใหม่");
          return "error";
        });
      }, WAITING_TIMEOUT_MS);
    } catch {
      setStep("error");
      setError("ส่งข้อมูลไม่ได้ ตรวจสอบการเชื่อมต่อ BLE");
    }
  }

  function reset() {
    clearWaitingTimeout();
    deviceRef.current?.gatt?.disconnect();
    setStep("idle");
    setStatusCode(null);
    setLog([]);
    setError("");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">เพิ่มอุปกรณ์ MetaBreath</h1>
          <p className="text-sm text-gray-400 mt-1">เชื่อมต่อผ่าน Bluetooth — ไม่ต้องกรอกรหัสอุปกรณ์</p>
        </div>

        {!isBLESupported && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-sm text-amber-700">
            <strong>ต้องใช้ Chrome</strong> — Web Bluetooth ไม่รองรับ Safari/Firefox
            <br />ใช้ Chrome บน Desktop หรือ Android
          </div>
        )}

        {step !== "done" && (
          <>
            <Steps current={step} />

            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">ชื่อ WiFi (SSID)</label>
                  <input
                    type="text"
                    value={ssid}
                    onChange={(e) => setSsid(e.target.value)}
                    disabled={step !== "idle" && step !== "error"}
                    placeholder="MyWiFiNetwork"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-gray-50 disabled:text-gray-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">รหัส WiFi</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={wifiPw}
                      onChange={(e) => setWifiPw(e.target.value)}
                      disabled={step !== "idle" && step !== "error"}
                      placeholder="••••••••"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-gray-50 disabled:text-gray-400 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    >
                      {showPw ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm">
                  {error}
                </div>
              )}

              {log.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                  {log.map((l, i) => (
                    <div key={i} className="text-xs text-gray-500 font-mono">{l}</div>
                  ))}
                </div>
              )}

              {statusCode !== null && STATUS[statusCode] && (
                <div className={`rounded-xl px-4 py-3 text-sm font-medium text-center ${
                  STATUS[statusCode].error ? "bg-red-50 text-red-700" :
                  STATUS[statusCode].done ? "bg-emerald-50 text-emerald-700" :
                  "bg-blue-50 text-blue-700"
                }`}>
                  {STATUS[statusCode].label}
                  <div className="text-xs font-normal mt-0.5 opacity-70">{STATUS[statusCode].detail}</div>
                </div>
              )}

              <button
                onClick={step === "idle" || step === "error" ? startPairing : reset}
                disabled={!isBLESupported || ["scanning", "sending", "waiting", "connected"].includes(step)}
                className={`w-full font-semibold py-3.5 rounded-xl text-sm transition-all disabled:opacity-40 ${
                  step === "error"
                    ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {step === "idle"     && "เริ่มสแกนหาอุปกรณ์"}
                {step === "scanning" && "กำลังสแกน..."}
                {step === "connected"&& "กำลังเชื่อมต่อ..."}
                {step === "sending"  && "กำลังส่งข้อมูล..."}
                {step === "waiting"  && "รออุปกรณ์ต่อ WiFi..."}
                {step === "error"    && "ลองใหม่"}
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 mt-4">
              เปิดอุปกรณ์ MetaBreath ให้ LED กะพริบสีน้ำเงินก่อนกด &quot;เริ่มสแกน&quot;
            </p>
          </>
        )}

        {step === "done" && (
          <div className="bg-white rounded-2xl border border-emerald-100 p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">จับคู่สำเร็จ!</h2>
              <p className="text-sm text-gray-400 mt-1">
                อุปกรณ์ MetaBreath เชื่อมต่อกับ account ของคุณแล้ว<br />
                ครั้งต่อไปแค่เปิดเครื่อง — พร้อมใช้เลย
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <button
                onClick={() => router.push("/home")}
                className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-sm hover:bg-slate-800 transition"
              >
                ไปหน้าหลัก
              </button>
              <button
                onClick={() => router.push("/me/device")}
                className="w-full text-gray-500 text-sm py-2 hover:text-gray-700 transition"
              >
                ดูอุปกรณ์ทั้งหมด
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
