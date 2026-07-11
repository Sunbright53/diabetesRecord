"""
Metabolic Flexibility Score engine.

Score 0–100 computed from recent breath sessions across three dimensions:
  Amplitude (40pts)     — how high acetone rises in expected contexts (fasting/exercise)
  Return Speed (35pts)  — how quickly acetone returns to baseline after peak
  Appropriateness (25pts) — does the reading match the context expectation?

Requires at least 3 sessions to compute a meaningful score.
"""
from __future__ import annotations

from typing import Optional
import statistics as _stats

# Zone thresholds matching riskLabel.ts (4-zone Layer 2 system)
# context_tag → (min_ppm_expected, max_ppm_expected_for_bonus)
_CONTEXT_EXPECTATIONS = {
    "fasting":        (2.0,  40.0),   # expect transitional → fat_oxidation
    "post_meal":      (0.0,   8.0),   # expect fed_resting after meal
    "post_exercise":  (2.0,  40.0),   # expect transitional → fat_oxidation
    "evening":        (0.0,  20.0),   # broad window — any metabolic state OK
}

_ZONE_MIDPOINTS = {
    "fed_resting":   1.0,
    "transitional":  5.0,
    "fat_oxidation": 20.0,
    "extended_fast": 55.0,
    "safety_alert":  100.0,
}


def _metabolic_zone(ppm: float) -> str:
    if ppm < 2:   return "fed_resting"
    if ppm < 8:   return "transitional"
    if ppm < 40:  return "fat_oxidation"
    if ppm < 75:  return "extended_fast"
    return "safety_alert"


def _amplitude_score(sessions: list[dict]) -> float:
    """
    40 pts max. Measures swing range across sessions.
    Ideal: some sessions in fat_oxidation range (8–40 ppm), some near baseline.
    Score = 40 × clamp(max_range / 30, 0, 1)
    """
    values = [s.get("peak_ppm") or s.get("mean_ppm") or 0.0 for s in sessions if s.get("peak_ppm") is not None or s.get("mean_ppm") is not None]
    if not values:
        return 0.0
    max_v = max(values)
    min_v = min(values)
    swing = max_v - min_v
    # Ideal swing is 15–30 ppm (enough metabolic flexibility, not dangerous)
    score = min(1.0, swing / 30.0) * 40.0
    return round(score, 1)


def _return_speed_score(sessions: list[dict]) -> float:
    """
    35 pts max. Proxy: std-dev of values in fasting/exercise sessions
    compared to post_meal sessions. Higher std-dev with appropriate context = good speed.
    Fallback: if no paired context data, use ratio of min/max (lower ratio = faster return).
    """
    fasting_vals = [
        s.get("peak_ppm") or s.get("mean_ppm") or 0.0
        for s in sessions
        if s.get("context_tag") in ("fasting", "post_exercise") and (s.get("peak_ppm") is not None)
    ]
    postmeal_vals = [
        s.get("peak_ppm") or s.get("mean_ppm") or 0.0
        for s in sessions
        if s.get("context_tag") == "post_meal" and (s.get("peak_ppm") is not None)
    ]

    if fasting_vals and postmeal_vals:
        fasting_avg = _stats.mean(fasting_vals)
        postmeal_avg = _stats.mean(postmeal_vals)
        ratio = postmeal_avg / fasting_avg if fasting_avg > 0 else 1.0
        # Good flexibility: postmeal should be lower than fasting (ratio < 1)
        # score = 35 if ratio <= 0.5, 0 if ratio >= 1.5
        score = max(0.0, min(35.0, (1.5 - ratio) / 1.0 * 35.0))
    else:
        all_vals = [s.get("peak_ppm") or s.get("mean_ppm") or 0.0 for s in sessions if s.get("peak_ppm") is not None]
        if len(all_vals) < 2:
            return 17.5  # neutral default
        rng = max(all_vals) - min(all_vals)
        # Some variation is good — no variation means no flexibility
        score = min(35.0, rng / 20.0 * 35.0)

    return round(score, 1)


def _appropriateness_score(sessions: list[dict]) -> float:
    """
    25 pts max. For each tagged session, check if the reading matches expectation.
    Untagged sessions contribute 0 to numerator/denominator.
    """
    tagged = [s for s in sessions if s.get("context_tag") and s.get("context_tag") in _CONTEXT_EXPECTATIONS]
    if not tagged:
        return 12.5  # neutral: no context data

    hits = 0
    for s in tagged:
        tag = s["context_tag"]
        ppm = s.get("peak_ppm") or s.get("mean_ppm") or 0.0
        lo, hi = _CONTEXT_EXPECTATIONS[tag]
        if lo <= ppm <= hi:
            hits += 1
        elif tag == "post_meal" and ppm < lo + 5:
            hits += 0.5  # partial credit for close readings

    score = (hits / len(tagged)) * 25.0
    return round(score, 1)


def _trend_direction(sessions: list[dict]) -> str:
    """Compare average score of first half vs second half of sessions."""
    values = [s.get("peak_ppm") or s.get("mean_ppm") or 0.0 for s in sessions if s.get("peak_ppm") is not None]
    if len(values) < 4:
        return "insufficient_data"
    mid = len(values) // 2
    first_avg = _stats.mean(values[:mid])
    second_avg = _stats.mean(values[mid:])
    diff = second_avg - first_avg
    if diff > 2.0:    return "increasing"
    if diff < -2.0:   return "decreasing"
    return "stable"


def _message_th(score: float, zone: str, context_tag: Optional[str]) -> str:
    """Non-judgmental Thai message for the flexibility score."""
    if score >= 80:
        return "ระบบเผาผลาญยืดหยุ่นมาก — สลับระหว่างน้ำตาลและไขมันได้ดี"
    if score >= 60:
        return "ระบบเผาผลาญยืดหยุ่นพอใช้ — ยังมีโอกาสพัฒนาต่อ"
    if score >= 40:
        return "เริ่มมีความยืดหยุ่น — ลองวัดในหลายช่วงเวลาเพิ่มขึ้น"
    return "ข้อมูลยังไม่เพียงพอ — วัดเพิ่มในหลายบริบทเพื่อคำนวณความแม่นยำ"


def compute_flexibility(
    sessions: list[dict],
    latest_ppm: Optional[float] = None,
    context_tag: Optional[str] = None,
) -> dict:
    """
    Compute Flexibility Score from a list of recent sessions.

    Each session dict should have:
      peak_ppm, mean_ppm, context_tag (optional)

    Returns:
      score, zone, breakdown, trend, n_sessions, message_th
    """
    valid = [s for s in sessions if s.get("peak_ppm") is not None or s.get("mean_ppm") is not None]

    if len(valid) < 3:
        return {
            "score": 0,
            "zone": "unreliable",
            "breakdown": {"amplitude": 0, "return_speed": 0, "appropriateness": 0},
            "trend": "insufficient_data",
            "n_sessions": len(valid),
            "message_th": "วัดอย่างน้อย 3 ครั้งในหลายบริบทเพื่อคำนวณ Flexibility Score",
        }

    amp   = _amplitude_score(valid)
    spd   = _return_speed_score(valid)
    appr  = _appropriateness_score(valid)
    total = round(min(100.0, amp + spd + appr))

    current_ppm = latest_ppm
    if current_ppm is None and valid:
        current_ppm = valid[-1].get("peak_ppm") or valid[-1].get("mean_ppm")

    zone = _metabolic_zone(current_ppm) if current_ppm is not None else "unreliable"

    return {
        "score": total,
        "zone": zone,
        "breakdown": {
            "amplitude": amp,
            "return_speed": spd,
            "appropriateness": appr,
        },
        "trend": _trend_direction(valid),
        "n_sessions": len(valid),
        "message_th": _message_th(total, zone, context_tag),
    }
