"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, DeviceOut } from "@/lib/api";

interface PairResponse {
  device_id: string;
  mqtt_topic: string;
  mqtt_user: string;
  mqtt_broker: string;
  mqtt_port: number;
  secret: string;
  message: string;
}

export default function DeviceSettingsPage() {
  const [devices, setDevices] = useState<DeviceOut[]>([]);
  const [pairing, setPairing] = useState(false);
  const [pairResult, setPairResult] = useState<PairResponse | null>(null);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState("");

  useEffect(() => {
    api.sensor.listDevices().then(setDevices).catch(console.error);
  }, []);

  async function pairDevice() {
    setPairing(true);
    setError("");
    setPairResult(null);
    try {
      const res = await api.sensor.pairDevice();
      setPairResult(res);
      const refreshed = await api.sensor.listDevices();
      setDevices(refreshed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPairing(false);
    }
  }

  function copy(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(""), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">MetaBreath Device</h1>
      <p className="text-gray-500 text-sm mb-6">จับคู่ ESP32 + TGS1820 กับบัญชีของคุณ</p>

      {/* Existing devices */}
      {devices.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">อุปกรณ์ที่เชื่อมต่อแล้ว</h2>
          <div className="space-y-3">
            {devices.map((d) => (
              <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full ${d.active ? "bg-emerald-400" : "bg-gray-300"}`} />
                <div className="flex-1">
                  <div className="font-mono text-sm text-gray-800">{d.id.slice(0, 8)}…</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {d.sensor_model} · {d.kind}
                    {d.needs_recalibration && (
                      <span className="ml-2 text-amber-600 font-medium">⚠ ต้อง calibrate</span>
                    )}
                  </div>
                </div>
                {d.last_calibrated_at && (
                  <div className="text-xs text-gray-400">
                    Calibrated: {new Date(d.last_calibrated_at).toLocaleDateString("th-TH")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BLE Pairing — recommended */}
      <Link
        href="/me/device/pair"
        className="flex items-center gap-4 bg-slate-900 text-white rounded-xl p-5 hover:bg-slate-800 transition mb-4"
      >
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">เพิ่มอุปกรณ์ด้วย Bluetooth</div>
          <div className="text-xs text-white/60 mt-0.5">เชื่อมต่ออัตโนมัติ ไม่ต้องกรอกรหัสอุปกรณ์</div>
        </div>
        <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Pair new device */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="font-semibold text-gray-800 mb-1">จับคู่อุปกรณ์ใหม่</h2>
        <p className="text-sm text-gray-500 mb-4">
          กด &quot;จับคู่&quot; เพื่อรับ MQTT credentials สำหรับตั้งค่า ESP32 firmware
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-600 text-sm">{error}</div>
        )}

        <button
          onClick={pairDevice}
          disabled={pairing}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
        >
          {pairing ? "กำลังจับคู่..." : "จับคู่ MetaBreath Device"}
        </button>

        {pairResult && (
          <div className="mt-5 space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-700 text-sm">
              {pairResult.message}
            </div>

            <h3 className="text-sm font-semibold text-gray-700 mt-4">
              ตั้งค่า ESP32 firmware ด้วยค่าต่อไปนี้:
            </h3>

            {[
              { label: "Device ID", value: pairResult.device_id, field: "device_id" },
              { label: "MQTT Topic", value: pairResult.mqtt_topic, field: "topic" },
              { label: "MQTT Broker", value: pairResult.mqtt_broker, field: "broker" },
              { label: "MQTT Port", value: String(pairResult.mqtt_port), field: "port" },
              { label: "MQTT User", value: pairResult.mqtt_user, field: "user" },
              { label: "Secret Key", value: pairResult.secret, field: "secret" },
            ].map(({ label, value, field }) => (
              <div key={field} className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                  <code className="text-sm font-mono text-gray-900 break-all">{value}</code>
                </div>
                <button
                  onClick={() => copy(value, field)}
                  className="shrink-0 text-xs text-gray-500 hover:text-emerald-600 border border-gray-200 hover:border-emerald-300 rounded px-2 py-1 transition"
                >
                  {copiedField === field ? "Copied!" : "Copy"}
                </button>
              </div>
            ))}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              <strong>หมายเหตุ:</strong> บันทึก Secret Key ไว้ก่อน จะแสดงครั้งเดียว
            </div>

            <details className="mt-3">
              <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                ESP32 Arduino firmware template
              </summary>
              <pre className="mt-2 bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap">
{`#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI";
const char* password = "YOUR_WIFI_PASS";
const char* mqtt_broker = "${pairResult.mqtt_broker}";
const int   mqtt_port   = ${pairResult.mqtt_port};
const char* mqtt_user   = "${pairResult.mqtt_user}";
const char* mqtt_pass   = "YOUR_ESP32_MQTT_PASSWORD";
const char* topic       = "${pairResult.mqtt_topic}";

// TGS1820 on GPIO34 (ADC)
// SHT35  on I2C SDA=21 SCL=22
// Pressure sensor on GPIO35 (ADC)

void publishReading() {
  StaticJsonDocument<256> doc;
  doc["ambient_voc"]    = readAmbientVOC();   // ppm
  doc["breath_voc"]     = readBreathVOC();    // ppm
  doc["pressure_mean"]  = readPressure();     // hPa
  doc["pressure_std"]   = pressureStd();
  doc["breath_duration"]= breathDuration();   // seconds
  doc["temperature"]    = readTemp();         // °C
  doc["humidity"]       = readHumidity();     // %RH

  char buf[256];
  serializeJson(doc, buf);
  client.publish(topic, buf);
}`}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
