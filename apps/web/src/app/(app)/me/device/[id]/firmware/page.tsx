"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Eye, EyeOff, Cpu, Info, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "/api";

export default function FirmwareDownloadPage() {
  const router = useRouter();
  const params = useParams();
  const deviceId = params.id as string;

  const [ssid, setSsid] = useState("");
  const [wifiPw, setWifiPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  async function downloadFirmware() {
    if (!ssid.trim()) {
      toast.error("กรุณากรอกชื่อ WiFi");
      return;
    }
    if (!wifiPw) {
      toast.error("กรุณากรอกรหัส WiFi");
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE}/sensor/device/${deviceId}/firmware`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ wifi_ssid: ssid, wifi_password: wifiPw }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "ไม่สามารถสร้างไฟล์ได้");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `metabreath_${deviceId.slice(0, 8)}.ino`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloaded(true);
      toast.success("ดาวน์โหลดสำเร็จ — ไปเปิดใน Arduino IDE");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-text-muted" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Firmware Configurator</h1>
          <p className="text-xs text-text-muted font-mono mt-0.5">{deviceId.slice(0, 8)}…</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-bg-elevated rounded-2xl p-4 flex gap-3">
        <div className="h-9 w-9 rounded-xl bg-mint-500/15 flex items-center justify-center shrink-0">
          <Cpu size={18} className="text-mint-500" strokeWidth={1.6} />
        </div>
        <div className="text-sm">
          <p className="font-semibold text-text-primary">.ino สำหรับ Arduino IDE</p>
          <p className="text-text-muted text-xs mt-1 leading-relaxed">
            สร้างไฟล์ firmware ที่ฝัง WiFi + Device ID + MQTT
            ให้เรียบร้อยแล้ว เปิดใน Arduino IDE แล้ว Upload ได้เลย
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-bg-elevated rounded-2xl p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-text-muted mb-1.5 block">
            ชื่อ WiFi (SSID)
          </label>
          <input
            type="text"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            placeholder="MyWiFiNetwork"
            maxLength={32}
            className="w-full bg-bg-raised border border-border-soft rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-mint-500 transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-text-muted mb-1.5 block">
            รหัส WiFi
          </label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={wifiPw}
              onChange={(e) => setWifiPw(e.target.value)}
              placeholder="••••••••"
              maxLength={63}
              className="w-full bg-bg-raised border border-border-soft rounded-xl px-4 py-3 pr-11 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-mint-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-3 text-text-muted hover:text-text-primary"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          onClick={downloadFirmware}
          disabled={loading}
          className="w-full bg-mint-500 text-white font-semibold py-3 rounded-full text-sm hover:bg-mint-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> กำลังสร้างไฟล์...
            </>
          ) : downloaded ? (
            <>
              <CheckCircle2 size={16} /> ดาวน์โหลดอีกครั้ง
            </>
          ) : (
            <>
              <Download size={16} /> ดาวน์โหลด .ino
            </>
          )}
        </button>
      </div>

      {/* Instructions */}
      <div className="bg-bg-elevated rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Info size={16} className="text-blue-400" strokeWidth={1.6} />
          <p className="text-sm font-semibold text-text-primary">ขั้นตอนหลังดาวน์โหลด</p>
        </div>
        <ol className="space-y-2.5 text-xs text-text-muted leading-relaxed">
          {[
            "ติดตั้ง Arduino IDE (arduino.cc/en/software)",
            "เพิ่ม ESP32 board package: File → Preferences → Additional Board URL: https://espressif.github.io/arduino-esp32/package_esp32_index.json",
            "Install libraries ผ่าน Library Manager: PubSubClient, ArduinoJson",
            "เปิดไฟล์ .ino ที่ดาวน์โหลด",
            "เลือก Board: Tools → Board → ESP32 Dev Module",
            "เสียบ ESP32 กับคอม → เลือก Port → กด Upload (→)",
            "เปิด Serial Monitor 115200 baud ดู log — จะเห็น calibration + WiFi + MQTT connect",
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-4 h-4 rounded-full bg-mint-500/20 text-mint-500 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Extras */}
      <div className="bg-warning/10 border border-warning/20 rounded-2xl p-4">
        <p className="text-xs text-warning font-semibold mb-1">🔐 Security note</p>
        <p className="text-xs text-text-muted">
          ไฟล์ .ino ที่ได้จะมี WiFi password + MQTT credentials ฝังอยู่ในโค้ด — อย่าแชร์กับคนอื่น
        </p>
      </div>

      <Link
        href={`/me/device`}
        className="block text-center text-xs text-text-muted hover:text-text-primary"
      >
        ← กลับไปหน้าอุปกรณ์
      </Link>
    </div>
  );
}
