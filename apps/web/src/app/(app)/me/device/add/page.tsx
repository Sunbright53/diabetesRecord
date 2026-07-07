"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, QrCode, Cpu, Loader2, Check, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

type Method = "scan" | "qr" | "manual";

const MODELS = [
  { value: "TGS1820", label: "MetaBreath TGS1820 v1 (ค่าเริ่มต้น)" },
  { value: "TGS2600", label: "TGS2600 (Air quality)" },
  { value: "custom",  label: "Custom firmware" },
];

interface PairResult {
  device_id: string;
  mqtt_topic: string;
  mqtt_user: string;
  mqtt_broker: string;
  mqtt_port: number;
  secret: string;
  message: string;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="bg-bg-raised rounded-xl p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-text-muted mb-0.5">{label}</p>
        <p className="text-sm font-mono text-text-primary truncate">{value}</p>
      </div>
      <button
        onClick={copy}
        className="shrink-0 h-8 w-8 rounded-lg bg-bg-elevated flex items-center justify-center transition-colors hover:bg-border-strong"
      >
        {copied ? <Check size={14} className="text-mint-500" /> : <Copy size={14} className="text-text-muted" />}
      </button>
    </div>
  );
}

export default function AddDevicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMethod = searchParams.get("method") === "qr" ? "qr" : "scan";

  const [method, setMethod] = useState<Method>(initialMethod);
  const [selectedModel, setSelectedModel] = useState("TGS1820");
  const [pairing, setPairing] = useState(false);
  const [result, setResult] = useState<PairResult | null>(null);

  const handlePair = async () => {
    setPairing(true);
    try {
      const res = await api.sensor.pairDevice({ sensor_model: selectedModel });
      setResult(res as PairResult);
      toast.success("จับคู่อุปกรณ์สำเร็จ!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPairing(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-text-muted hover:text-text-primary">
          <ArrowLeft size={18} />
          <span className="text-sm">Back</span>
        </button>

        <div className="bg-mint-500/10 border border-mint-500/30 rounded-2xl p-5 text-center">
          <div className="h-12 w-12 rounded-full bg-mint-500 flex items-center justify-center mx-auto mb-3">
            <Check size={24} className="text-white" />
          </div>
          <p className="text-base font-semibold text-text-primary">จับคู่สำเร็จ!</p>
          <p className="text-sm text-text-muted mt-1">บันทึก credentials เพื่อตั้งค่า firmware</p>
        </div>

        <div className="space-y-2">
          <CopyField label="Device ID"   value={result.device_id} />
          <CopyField label="MQTT Broker" value={result.mqtt_broker} />
          <CopyField label="MQTT Port"   value={String(result.mqtt_port)} />
          <CopyField label="MQTT Topic"  value={result.mqtt_topic} />
          <CopyField label="MQTT User"   value={result.mqtt_user} />
          <CopyField label="Secret Key"  value={result.secret} />
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
          <p className="text-xs text-amber-400 font-semibold">⚠️ Secret Key จะแสดงครั้งเดียว</p>
          <p className="text-xs text-text-muted mt-1">คัดลอกและบันทึกไว้ก่อนออกจากหน้านี้</p>
        </div>

        <button
          onClick={() => router.replace("/me/device")}
          className="w-full bg-mint-500 text-white rounded-full py-3 text-sm font-semibold hover:bg-mint-400 transition-colors"
        >
          ดูอุปกรณ์ของฉัน →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center">
          <ArrowLeft size={18} className="text-text-muted" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">Add device</h1>
      </div>

      {/* BLE scanning status */}
      {method === "scan" && (
        <div className="bg-bg-elevated rounded-2xl p-4 flex items-center gap-3">
          <Loader2 size={18} className="text-mint-500 animate-spin" />
          <p className="text-sm text-text-muted">Searching for devices…</p>
        </div>
      )}

      {/* QR scan */}
      {method === "qr" && (
        <div className="bg-bg-elevated rounded-2xl p-6 text-center space-y-3">
          <div className="h-48 bg-bg-raised rounded-xl flex items-center justify-center">
            <p className="text-text-muted text-sm">Camera feed (HTTPS required)</p>
          </div>
          <p className="text-xs text-text-muted">สแกน QR บน MetaBreath device</p>
        </div>
      )}

      {/* Manual model picker */}
      {method === "manual" && (
        <div className="bg-bg-elevated rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold text-text-primary">เลือกรุ่นอุปกรณ์</p>
          <div className="space-y-2">
            {MODELS.map((m) => (
              <button
                key={m.value}
                onClick={() => setSelectedModel(m.value)}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-colors ${
                  selectedModel === m.value
                    ? "border-mint-500 bg-mint-500/10 text-text-primary"
                    : "border-border-soft text-text-muted hover:border-border-strong"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={handlePair}
            disabled={pairing}
            className="w-full bg-mint-500 text-white rounded-full py-3 text-sm font-semibold hover:bg-mint-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {pairing ? (
              <><Loader2 size={16} className="animate-spin" /> กำลังจับคู่...</>
            ) : (
              "Pair device"
            )}
          </button>
        </div>
      )}

      {/* Method picker buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMethod("qr")}
          className={`flex items-center gap-3 p-4 rounded-2xl border transition-colors ${
            method === "qr" ? "border-mint-500 bg-mint-500/10" : "border-border-soft bg-bg-elevated hover:bg-bg-raised"
          }`}
        >
          <QrCode size={20} className="text-mint-500" />
          <span className="text-sm font-medium text-text-primary">Scan QR</span>
        </button>
        <button
          onClick={() => setMethod("manual")}
          className={`flex items-center gap-3 p-4 rounded-2xl border transition-colors ${
            method === "manual" ? "border-mint-500 bg-mint-500/10" : "border-border-soft bg-bg-elevated hover:bg-bg-raised"
          }`}
        >
          <Cpu size={20} className="text-blue-400" />
          <span className="text-sm font-medium text-text-primary">Add model</span>
        </button>
      </div>

      <p className="text-center text-xs text-text-muted">
        มีปัญหา?{" "}
        <button className="text-mint-500 underline">ดูวิธีช่วยเหลือ</button>
      </p>
    </div>
  );
}
