"use client";

import { useState, useRef, useCallback } from "react";
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

// Status codes from ESP32
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

function writeChar(char: BluetoothRemoteGATTCharacteristic, text: string) {
  return char.writeValueWithResponse(enc.encode(text));
}

// ─── Step indicator ───────────────────────────────────────────────────────────
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
          <div className={`flex flex-col items-center gap-1`}>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
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

  const addLog = useCallback((msg: string) => {
    setLog((l) => [...l.slice(-6), msg]);
  }, []);

  const isBLESupported = typeof navigator !== "undefined" && "bluetooth" in navigator;

  async function startPairing() {
    if (!ssid.trim()) { setError("กรุณาใส่ชื่อ WiFi"); return; }
    if (!wifiPw) { setError("กรุณาใส่รหัส WiFi"); return; }
    setError("");
    setLog([]);

    // 1. Get provision token from API
    addLog("กำลังสร้าง provision token...");
    let token: string, apiBase: string;
    try {
      const resp = await api.sensor.provisionToken();
      token = resp.token;
      apiBase = resp.api_base;
      addLog("ได้ token แล้ว (10 นาที)");
    } catch (e) {
      setError("ไม่สามารถสร้าง token ได้ กรุณา login ใหม่");
      return;
    }

    // 2. Scan for MetaBreath BLE device
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
    } catch (e: unknown) {
      if ((e as Error).name === "NotFoundError") {
        setStep("idle");
        setError("ไม่พบอุปกรณ์ MetaBreath ใกล้เคียง");
      } else {
        setStep("idle");
        setError("ยกเลิกการสแกน");
      }
      return;
    }

    // 3. Connect GATT
    setStep("connected");
    addLog("กำลังเชื่อมต่อ BLE...");
    let server: BluetoothRemoteGATTServer;
    try {
      server = await device.gatt!.connect();
      addLog("เชื่อมต่อ BLE สำเร็จ");
    } catch (e) {
      setStep("error");
      setError("ไม่สามารถเชื่อมต่อ BLE ได้");
      return;
    }

    // 4. Get service & characteristics
    let service: BluetoothRemoteGATTService;
    try {
      service = await server.getPrimaryService(SERVICE_UUID);
    } catch (e) {
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

    // 5. Subscribe to status notifications
    await cStatus.startNotifications();
    cStatus.addEventListener("characteristicvaluechanged", (e: Event) => {
      const val = (e.target as BluetoothRemoteGATTCharacteristic).value!.getUint8(0);
      setStatusCode(val);
      const s = STATUS[val];
      if (s) {
        addLog(`[ESP32] ${s.label}`);
        if (s.done) { setStep("done"); }
        if (s.error) { setStep("error"); setError(s.detail); }
      }
    });

    // 6. Send WiFi + token + API URL
    setStep("sending");
    addLog("กำลังส่งข้อมูล WiFi...");
    try {
      await writeChar(cSsid, ssid);
      addLog("ส่ง SSID แล้ว");
      await writeChar(cPw, wifiPw);
      addLog("ส่ง WiFi password แล้ว");
      await writeChar(cToken, token);
      addLog("ส่ง token แล้ว");
      await writeChar(cApiUrl, apiBase);
      addLog("ส่ง API URL แล้ว");

      // 7. Send GO command
      setStep("waiting");
      addLog("สั่งให้อุปกรณ์เริ่มเชื่อมต่อ...");
      await writeChar(cCmd, "GO");
    } catch (e) {
      setStep("error");
      setError("ส่งข้อมูลไม่ได้ ตรวจสอบการเชื่อมต่อ BLE");
    }
  }

  function reset() {
    deviceRef.current?.gatt?.disconnect();
    setStep("idle");
    setStatusCode(null);
    setLog([]);
    setError("");
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Header */}
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
              {/* WiFi fields */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">ชื่อ WiFi (SSID)</label>
                  <input
                    type="text"
                    value={ssid}
                    onChange={(e) => setSsid(e.target.value)}
                    disabled={step !== "idle"}
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
                      disabled={step !== "idle"}
                      placeholder="••••••••"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-gray-50 disabled:text-gray-400 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    >
                      {showPw ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Log */}
              {log.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                  {log.map((l, i) => (
                    <div key={i} className="text-xs text-gray-500 font-mono">{l}</div>
                  ))}
                </div>
              )}

              {/* Status from ESP32 */}
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

              {/* Action button */}
              <button
                onClick={step === "idle" ? startPairing : reset}
                disabled={!isBLESupported || ["scanning", "sending", "waiting"].includes(step)}
                className={`w-full font-semibold py-3.5 rounded-xl text-sm transition-all disabled:opacity-40 ${
                  step === "error"
                    ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {step === "idle"    && "เริ่มสแกนหาอุปกรณ์"}
                {step === "scanning" && (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    กำลังสแกน...
                  </span>
                )}
                {step === "connected" && "กำลังเชื่อมต่อ..."}
                {step === "sending"   && "กำลังส่งข้อมูล..."}
                {step === "waiting"   && (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    รออุปกรณ์ต่อ WiFi...
                  </span>
                )}
                {step === "error"    && "ลองใหม่"}
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 mt-4">
              เปิดอุปกรณ์ MetaBreath ให้ LED กะพริบสีน้ำเงินก่อนกด "เริ่มสแกน"
            </p>
          </>
        )}

        {/* Done screen */}
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
                ครั้งต่อไปแค่เปิดเครื่องและต่อ WiFi — พร้อมใช้เลย
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
