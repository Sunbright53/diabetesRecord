"use client";

import { useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { convertFromMv } from "@/lib/units";

// ─── Zone data ──────────────────────────────────────────────────────────────

type ZoneDetail = {
  heading: string;
  body: string;
};

type Zone = {
  n: 1 | 2 | 3 | 4 | 5;
  name: string;
  rangeText: string;
  lo: number;   // ppm — inclusive
  hi: number;   // ppm — exclusive (Infinity for last)
  desc: string;
  color: string;
  details: ZoneDetail[];
};

const ZONES: Zone[] = [
  {
    n: 1,
    name: "Rest zone",
    rangeText: "0.5–2 ppm",
    lo: 0,
    hi: 2,
    desc: "ร่างกายกำลังใช้พลังงานจากอาหารมื้อล่าสุด",
    color: "#6C9BFF",
    details: [
      {
        heading: "อะไรกำลังเกิดขึ้นในร่างกาย",
        body:
          "ร่างกายกำลังเผาไหม้ glucose (น้ำตาลจากคาร์บ) เป็นเชื้อเพลิงหลัก ระดับ insulin ในเลือดยังสูงอยู่ " +
          "ซึ่งจะยับยั้งกระบวนการเผาผลาญไขมัน (lipolysis) เอาไว้ ดังนั้นค่า acetone ในลมหายใจจึงต่ำมาก",
      },
      {
        heading: "พบเมื่อไหร่",
        body:
          "1–3 ชั่วโมงหลังกินอาหาร (โดยเฉพาะมื้อที่มีคาร์โบไฮเดรตสูง) หรือหลังตื่นนอนใหม่ ๆ ในคนที่กินอาหารเย็นดึก",
      },
      {
        heading: "หมายความว่าอย่างไร",
        body:
          "ปกติ — นี่คือสภาวะที่ร่างกายควรอยู่หลังกินอาหาร ไม่ได้แย่ แต่ถ้าอยู่โซนนี้ตลอด 24 ชม. " +
          "แม้จะอดอาหารนาน อาจแปลว่าร่างกาย “ติดที่โหมดคาร์บ” และยังไม่ค่อยยืดหยุ่นเปลี่ยนไปเผาไขมัน",
      },
      {
        heading: "คำแนะนำ",
        body:
          "หากอยากเห็นค่าไต่ขึ้นโซนถัดไป ลองอดอาหาร 4–8 ชั่วโมง หรือออกกำลังกายเบา ๆ แล้ววัดใหม่",
      },
    ],
  },
  {
    n: 2,
    name: "Fat-burn zone",
    rangeText: "2–8 ppm",
    lo: 2,
    hi: 8,
    desc: "เยี่ยม! ร่างกายเริ่มดึงไขมันสะสมมาใช้เป็นพลังงานแล้ว",
    color: "#7BC97C",
    details: [
      {
        heading: "อะไรกำลังเกิดขึ้นในร่างกาย",
        body:
          "ร่างกายอยู่ในโหมด mixed oxidation — เผาทั้งน้ำตาลและไขมันพร้อมกัน ระดับ insulin เริ่มลดลง " +
          "ตับเริ่มผลิต ketone bodies (β-hydroxybutyrate, acetoacetate, acetone) ในระดับต่ำ ๆ acetone " +
          "ที่วัดได้ในลมหายใจเป็น byproduct ของกระบวนการนี้",
      },
      {
        heading: "พบเมื่อไหร่",
        body:
          "4–8 ชั่วโมงหลังมื้ออาหาร ระหว่าง intermittent fasting เบา ๆ หรือหลังออกกำลังกายปานกลาง 30 นาที+",
      },
      {
        heading: "หมายความว่าอย่างไร",
        body:
          "เป็นสัญญาณที่ดี — ร่างกายสามารถ switch จาก glucose ไปเผาไขมันได้ตามธรรมชาติ " +
          "แสดงว่ากลไก metabolic flexibility ทำงาน คน keto-adapted จะอยู่โซนนี้ได้ง่ายและเปลี่ยนไปโซน 3 ได้เร็ว",
      },
      {
        heading: "คำแนะนำ",
        body:
          "หากอยากคง Zone นี้ต่อ ลองยืดเวลา fasting อีก 2–4 ชั่วโมง หรือกินคาร์บต่ำในมื้อถัดไป " +
          "สายกีฬาสามารถออกกำลังในโซนนี้เพื่อ burn fat โดยไม่ crash",
      },
    ],
  },
  {
    n: 3,
    name: "Deep burn zone",
    rangeText: "8–40 ppm",
    lo: 8,
    hi: 40,
    desc: "ร่างกายอยู่ในโหมดเผาผลาญไขมันเต็มที่",
    color: "#E0A63C",
    details: [
      {
        heading: "อะไรกำลังเกิดขึ้นในร่างกาย",
        body:
          "เข้าสู่สภาวะ nutritional ketosis อย่างสมบูรณ์ — ตับผลิต ketone bodies ในระดับ " +
          "0.5–3.0 mmol/L ในเลือด ร่างกายพึ่ง fat oxidation เป็นเชื้อเพลิงหลัก แทน glucose " +
          "สมองก็เริ่มใช้ ketone แทนน้ำตาลได้ (~70% ของพลังงานสมอง)",
      },
      {
        heading: "พบเมื่อไหร่",
        body:
          "ผู้ที่ทำ ketogenic diet ต่อเนื่อง 3–7 วัน, intermittent fasting 16+ ชั่วโมง, " +
          "หลังออกกำลังกายหนักต่อเนื่อง หรือช่วง keto-adaptation ที่ปรับตัวได้แล้ว",
      },
      {
        heading: "หมายความว่าอย่างไร",
        body:
          "โซนที่คน weight-loss / keto มักตั้งเป้า — ระดับพลังงานคงที่ ไม่หิวจัด ความคิดชัด " +
          "ลดการอักเสบ ลดความอยากน้ำตาล เป็นสภาวะที่ปลอดภัยและได้ประโยชน์สำหรับคนสุขภาพดี",
      },
      {
        heading: "คำแนะนำ",
        body:
          "ดื่มน้ำมากขึ้นเพื่อชดเชย electrolyte loss (โซเดียม โพแทสเซียม แมกนีเซียม) " +
          "หากอยู่โซนนี้ต่อเนื่องหลายวัน ควรเสริมเกลือแร่ / bone broth",
      },
    ],
  },
  {
    n: 4,
    name: "Peak zone",
    rangeText: "40–170 ppm",
    lo: 40,
    hi: 170,
    desc: "ร่างกายอยู่ในภาวะเผาผลาญไขมันระดับสูง",
    color: "#E27245",
    details: [
      {
        heading: "อะไรกำลังเกิดขึ้นในร่างกาย",
        body:
          "Extended / therapeutic ketosis — ระดับ ketone bodies ในเลือด 3–5 mmol/L " +
          "ร่างกายอยู่ใน deep fat-burning mode เพื่อรักษาพลังงาน glucose ไว้ให้อวัยวะที่จำเป็น " +
          "(RBC, บางส่วนของสมอง)",
      },
      {
        heading: "พบเมื่อไหร่",
        body:
          "Prolonged fasting 24–72 ชั่วโมง, therapeutic ketogenic diet (สำหรับ epilepsy, glioblastoma), " +
          "หรือคน keto-adapted ที่ออกกำลังแบบ endurance นาน",
      },
      {
        heading: "หมายความว่าอย่างไร",
        body:
          "ยัง safe ในคนสุขภาพดี แต่ไม่ควรอยู่ต่อเนื่องนานเกินไปโดยไม่มีการดูแล " +
          "อาจมี side effect: keto flu, ลมหายใจมีกลิ่นผลไม้ (acetone), ท้องผูก, ปวดหัว",
      },
      {
        heading: "คำแนะนำ",
        body:
          "หากไม่ได้ตั้งใจอยู่โซนนี้ ควรกลับมากินอาหารตามปกติ ดื่มน้ำและเกลือแร่ให้เพียงพอ " +
          "หากมีโรคประจำตัว (เบาหวาน, โรคไต, โรคตับ) ควรปรึกษาแพทย์ก่อนอยู่โซนนี้",
      },
    ],
  },
  {
    n: 5,
    name: "Caution zone",
    rangeText: "มากกว่า 170 ppm",
    lo: 170,
    hi: Infinity,
    desc: "ค่าที่วัดได้สูงผิดปกติ — ลองสังเกตอาการตัวเองสักหน่อยนะ",
    color: "#D97B7B",
    details: [
      {
        heading: "อะไรกำลังเกิดขึ้นในร่างกาย",
        body:
          "ค่าสูงผิดปกติ — ในผู้ป่วยเบาหวานประเภท 1 อาจเป็นสัญญาณของ Diabetic Ketoacidosis (DKA) " +
          "ซึ่งเป็นภาวะฉุกเฉินทางการแพทย์ ระดับ ketone ในเลือดสูงเกิน 5 mmol/L พร้อมกับ acidosis " +
          "ในคนทั่วไปที่ไม่มีเบาหวาน โอกาสเกิด DKA ต่ำมาก มักจะเป็น sensor drift หรือการวัดผิดปกติ",
      },
      {
        heading: "อาการที่ควรระวัง (โดยเฉพาะผู้ป่วยเบาหวาน)",
        body:
          "กระหายน้ำมากผิดปกติ, ปัสสาวะบ่อย, คลื่นไส้ อาเจียน, ปวดท้อง, " +
          "หายใจเร็วและลึก (Kussmaul breathing), ลมหายใจกลิ่นผลไม้ชัดเจน, สับสน อ่อนเพลียมาก",
      },
      {
        heading: "หมายความว่าอย่างไร",
        body:
          "หากเป็นเบาหวาน (T1DM) และมีอาการข้างต้น ควรพบแพทย์ทันที ไม่ควรรอ " +
          "หากไม่ได้เป็นเบาหวานและไม่มีอาการ ให้วัดใหม่หลังพักเซนเซอร์ 5–10 นาที ในบริเวณอากาศบริสุทธิ์ " +
          "อาจเป็น interference จาก VOC ในสิ่งแวดล้อม (แอลกอฮอล์, solvent, บุหรี่)",
      },
      {
        heading: "คำแนะนำ",
        body:
          "1) วัดซ้ำในสภาพแวดล้อมที่สะอาด 2) ตรวจ ketone strip ในปัสสาวะ/เลือด เพื่อยืนยัน " +
          "3) หากมีอาการหรือเป็นเบาหวานให้พบแพทย์ทันที",
      },
    ],
  },
];

function zoneOf(ppm: number): Zone {
  return ZONES.find((z) => ppm >= z.lo && ppm < z.hi) ?? ZONES[ZONES.length - 1];
}

/** Position of the current value on the gradient bar (0..1).
 *  Each zone occupies 1/N of the bar; within a zone the position is proportional
 *  to how far the value has advanced from its `lo` to `hi`. Values above the last
 *  finite `hi` are clamped to the right edge. */
function markerPosition(ppm: number): number {
  const n = ZONES.length;
  const idx = ZONES.findIndex((z) => ppm >= z.lo && ppm < z.hi);
  if (idx === -1) return 1;
  const z = ZONES[idx];
  const span = Number.isFinite(z.hi) ? z.hi - z.lo : Math.max(20, z.lo * 0.2);
  const frac = Math.min(1, Math.max(0, (ppm - z.lo) / span));
  return (idx + frac) / n;
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function ZoneDetailModal({ zone, onClose }: { zone: Zone; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-bg-surface rounded-t-3xl sm:rounded-3xl pb-8 px-5 pt-5 max-h-[85vh] flex flex-col">
        <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto mb-4 sm:hidden shrink-0" />

        <div className="flex items-start justify-between mb-4 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="h-4 w-4 rounded-full shrink-0"
              style={{ background: zone.color, boxShadow: `0 0 0 4px ${zone.color}22` }}
            />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest" style={{ color: zone.color }}>
                Zone {zone.n}
              </p>
              <h2 className="text-lg font-semibold text-text-primary leading-tight truncate">
                {zone.name}
              </h2>
              <p className="text-xs text-text-muted mt-0.5 font-mono">{zone.rangeText}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-xl text-text-muted hover:text-text-primary transition-colors shrink-0"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-1">
          {zone.details.map((d) => (
            <div key={d.heading}>
              <p
                className="text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: zone.color }}
              >
                {d.heading}
              </p>
              <p className="text-sm text-text-primary leading-relaxed">{d.body}</p>
            </div>
          ))}

          <div className="bg-bg-elevated rounded-xl p-3 text-xs text-text-muted leading-relaxed">
            เนื้อหานี้เป็นข้อมูลเชิงสุขภาพทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ —
            หากมีข้อสงสัยเกี่ยวกับสุขภาพเฉพาะบุคคล ควรปรึกษาแพทย์
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────

interface Props {
  currentMv: number | null;
  live?: boolean;
}

export function AcetoneZoneCard({ currentMv, live = false }: Props) {
  const ppm = currentMv != null ? convertFromMv(currentMv, "ppm") : null;
  const activeZone = ppm != null ? zoneOf(ppm) : null;
  const markerPct = ppm != null ? markerPosition(ppm) * 100 : null;

  // Accordion: one expanded row at a time. Default to the active zone.
  const [expandedZoneN, setExpandedZoneN] = useState<number | null>(activeZone?.n ?? null);
  useEffect(() => {
    // When the active zone shifts (e.g. new reading arrives), auto-expand it.
    if (activeZone?.n) setExpandedZoneN(activeZone.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeZone?.n]);

  const [modalZone, setModalZone] = useState<Zone | null>(null);

  // Rainbow gradient built from zone colors, one stop per zone (5 equal segments).
  const gradient = `linear-gradient(90deg, ${ZONES.map(
    (z, i) => `${z.color} ${(i / ZONES.length) * 100}%, ${z.color} ${((i + 1) / ZONES.length) * 100}%`,
  ).join(", ")})`;

  return (
    <>
      <div className="bg-bg-elevated rounded-2xl p-4 space-y-4">
        {/* Header: current value + active zone label */}
        <div className="flex items-baseline justify-between gap-3">
          {ppm != null && activeZone ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-text-primary">{ppm.toFixed(2)}</span>
                <span className="text-sm text-text-muted">ppm</span>
                {live && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-mint-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-mint-500 animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <span className="text-sm font-medium" style={{ color: activeZone.color }}>
                Zone {activeZone.n} · {activeZone.name}
              </span>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-text-disabled">—</span>
                <span className="text-sm text-text-muted">ppm</span>
              </div>
              <span className="text-xs text-text-muted">ยังไม่มีข้อมูล</span>
            </>
          )}
        </div>

        {/* Gradient bar with marker */}
        <div className="relative h-2.5 rounded-full overflow-visible" style={{ background: gradient }}>
          {markerPct != null && (
            <div
              className="absolute -top-1 h-4.5 w-4.5 rounded-full bg-bg-elevated border-2 border-text-primary shadow-md pointer-events-none"
              style={{ left: `calc(${markerPct}% - 9px)`, height: "1.125rem", width: "1.125rem" }}
              aria-hidden="true"
            />
          )}
        </div>

        {/* Zone rows — single-line, accordion expand */}
        <div className="divide-y divide-border-subtle">
          {ZONES.map((z) => {
            const isExpanded = expandedZoneN === z.n;
            const isActive = activeZone?.n === z.n;
            return (
              <div key={z.n}>
                <button
                  type="button"
                  onClick={() => setExpandedZoneN(isExpanded ? null : z.n)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center gap-2.5 py-3 text-left hover:bg-bg-raised/40 rounded-lg px-1 -mx-1 transition-colors"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{
                      background: z.color,
                      boxShadow: isActive ? `0 0 0 3px ${z.color}33` : "none",
                    }}
                  />
                  <p
                    className={`text-sm ${isActive ? "font-semibold text-text-primary" : "font-medium text-text-primary/90"}`}
                  >
                    {z.name}
                  </p>
                  <span className="ml-auto text-xs text-text-muted font-mono">{z.rangeText}</span>
                  <ChevronDown
                    size={16}
                    className={`text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {isExpanded && (
                  <div className="pb-3 pl-5 pr-1 space-y-2">
                    <p className="text-xs text-text-muted leading-relaxed">{z.desc}</p>
                    <button
                      type="button"
                      onClick={() => setModalZone(z)}
                      className="text-xs font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                      style={{ color: z.color }}
                    >
                      ดูรายละเอียด →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modalZone && <ZoneDetailModal zone={modalZone} onClose={() => setModalZone(null)} />}
    </>
  );
}
