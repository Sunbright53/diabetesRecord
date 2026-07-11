/**
 * Anderson (2015) five-pattern breath acetone label system.
 * Single source of truth for colors, Thai/EN text, and thresholds.
 * Source: Obesity 23:2327-2334. doi:10.1002/oby.21242
 */

export type AcetoneLabel =
  | "basal"
  | "light_ketosis"
  | "nutritional_ketosis"
  | "deep_ketosis"
  | "dka_risk"
  | "unreliable"
  | "clean";

/** Anderson 2015 thresholds in ppm — used for client-side display hints */
export const ANDERSON_THRESHOLDS: [number, AcetoneLabel][] = [
  [2,  "basal"],
  [4,  "light_ketosis"],
  [30, "nutritional_ketosis"],
  [75, "deep_ketosis"],
];

export function andersonLabel(ppm: number | null): AcetoneLabel {
  if (ppm == null || ppm < 0) return "unreliable";
  for (const [thresh, lbl] of ANDERSON_THRESHOLDS) {
    if (ppm < thresh) return lbl;
  }
  return "dka_risk";
}

interface LabelStyle {
  color: string;
  grad: [string, string];
  tailwind: string;
}

export const LABEL_STYLE: Record<string, LabelStyle> = {
  clean:               { color: "#38BDF8", grad: ["#38BDF8", "#7DD3FC"], tailwind: "text-sky-400" },
  basal:               { color: "#00C896", grad: ["#00C896", "#22D6B2"], tailwind: "text-emerald-400" },
  light_ketosis:       { color: "#34D399", grad: ["#34D399", "#6EE7B7"], tailwind: "text-green-400" },
  nutritional_ketosis: { color: "#FBBF24", grad: ["#FBBF24", "#FDE68A"], tailwind: "text-amber-400" },
  deep_ketosis:        { color: "#F97316", grad: ["#F97316", "#FDBA74"], tailwind: "text-orange-400" },
  dka_risk:            { color: "#EF4444", grad: ["#EF4444", "#F87171"], tailwind: "text-red-400" },
  unreliable:          { color: "#6B7280", grad: ["#4A4A4A", "#7A7A7A"], tailwind: "text-text-muted" },
};

export const LABEL_EN: Record<string, string> = {
  clean:               "Clean air",
  basal:               "Basal",
  light_ketosis:       "Light ketosis",
  nutritional_ketosis: "Nutritional ketosis",
  deep_ketosis:        "Deep ketosis",
  dka_risk:            "DKA risk",
  unreliable:          "Unreliable",
};

export const LABEL_TH: Record<string, string> = {
  clean:               "อากาศสะอาด",
  basal:               "ปกติ",
  light_ketosis:       "คีโตเริ่มต้น",
  nutritional_ketosis: "คีโตโภชนาการ",
  deep_ketosis:        "คีโตลึก",
  dka_risk:            "เสี่ยง DKA",
  unreliable:          "ไม่แน่ใจ",
};

/** Range description for tooltip / detail view */
export const LABEL_RANGE: Record<string, string> = {
  basal:               "0.5–2 ppm",
  light_ketosis:       "2–4 ppm",
  nutritional_ketosis: "4–30 ppm",
  deep_ketosis:        "30–75 ppm",
  dka_risk:            "≥ 75 ppm",
};
