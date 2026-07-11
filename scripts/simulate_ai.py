"""
End-to-end AI simulation for MetaBreath.

Runs 5 realistic scenarios through predict_risk, predict_risk_lstm, and
check_drift — verifies the full inference stack matches clinical expectations.

Usage:
    python scripts/simulate_ai.py
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta

# Add API app to path so we can import ml_inference directly
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "apps", "api"))

from app.services import ml_inference

RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
GRAY = "\033[90m"


def color_label(label: str | None) -> str:
    if label is None:
        return f"{GRAY}unknown{RESET}"
    palette = {
        "basal":               f"{GREEN}basal{RESET}",
        "light_ketosis":       f"{GREEN}light_ketosis{RESET}",
        "nutritional_ketosis": f"{YELLOW}nutritional_ketosis{RESET}",
        "deep_ketosis":        f"{YELLOW}deep_ketosis{RESET}",
        "dka_risk":            f"{RED}dka_risk{RESET}",
        "unreliable":          f"{GRAY}unreliable{RESET}",
        # legacy aliases kept for backward compat
        "low":        f"{GREEN}low{RESET}",
        "moderate":   f"{YELLOW}moderate{RESET}",
        "high":       f"{RED}high{RESET}",
    }
    return palette.get(label, label)


def build_reading(acetone_delta, quality=90, reliability=90, temp=28, humidity=65,
                  pressure_mean=120, pressure_std=5, breath_duration=8,
                  ambient_voc=430, ketosis=None, metabolic=None, fat_burning=None):
    if ketosis is None:      ketosis = acetone_delta * 0.85
    if metabolic is None:    metabolic = acetone_delta * 0.6 + 30
    if fat_burning is None:  fat_burning = acetone_delta * 0.55
    return {
        "acetone_delta": acetone_delta,
        "quality_score": quality,
        "reliability_score": reliability,
        "ambient_voc": ambient_voc,
        "pressure_mean": pressure_mean,
        "pressure_std": pressure_std,
        "breath_duration": breath_duration,
        "temperature": temp,
        "humidity": humidity,
        "environment_penalty": 2.0,
        "ketosis_index": ketosis,
        "metabolic_score": metabolic,
        "fat_burning_index": fat_burning,
    }


def run_scenario(name, reading, expected_label):
    """Test single-shot RF/XGB prediction against expected clinical label."""
    result = ml_inference.predict_risk(reading)
    got_label = result.get("label")
    ok = "✓" if got_label == expected_label else "✗"
    color = GREEN if got_label == expected_label else RED
    print(f"  {color}{ok}{RESET} {BOLD}{name:<28}{RESET} "
          f"expected={color_label(expected_label):<20} "
          f"got={color_label(got_label):<20} "
          f"conf={result.get('confidence_score', 0):.3f}  "
          f"model={GRAY}{result.get('model_used')}{RESET}")
    return got_label == expected_label


def print_header(title):
    print(f"\n{BOLD}{BLUE}{'=' * 78}{RESET}")
    print(f"{BOLD}{BLUE}{title}{RESET}")
    print(f"{BOLD}{BLUE}{'=' * 78}{RESET}")


def main():
    print(f"\n{BOLD}MetaBreath AI End-to-End Simulation{RESET}")
    print(f"{GRAY}Models loaded from apps/api/models/{RESET}")

    # ─── 1. Single-shot classifier scenarios ───────────────────────────────
    print_header("Test 1 — Single-Shot Risk Classifier (RF/XGB)")

    # Anderson 2015 five-pattern expected labels (doi:10.1002/oby.21242)
    scenarios = [
        ("Healthy basal (adult)",      build_reading(0.5),                    "basal"),
        ("Post-meal normal",           build_reading(2.0),                    "light_ketosis"),
        ("Fat burning (light)",        build_reading(8.0),                    "nutritional_ketosis"),
        ("Nutritional ketosis",        build_reading(20.0),                   "nutritional_ketosis"),
        ("Deep ketosis / fasting",     build_reading(35.0),                   "deep_ketosis"),
        ("Deep ketosis / warning",     build_reading(65.0),                   "deep_ketosis"),
        ("DKA risk range",             build_reading(95.0),                   "dka_risk"),
        ("Severe DKA",                 build_reading(180.0),                  "dka_risk"),
        ("Bad reading (low quality)",  build_reading(50.0, quality=20,
                                                     reliability=25),         "unreliable"),
    ]
    ok_count = sum(run_scenario(n, r, exp) for n, r, exp in scenarios)
    print(f"\n  {BOLD}Result: {ok_count}/{len(scenarios)} passed{RESET}")

    # ─── 2. LSTM sequence scenarios ───────────────────────────────────────
    print_header("Test 2 — LSTM Temporal Prediction (5 readings)")

    sequences = [
        ("Stable healthy 5 days",
         [build_reading(0.5 + i * 0.1) for i in range(5)],
         "basal"),               # last reading 0.9 ppm → basal
        ("Ramping into ketosis",
         [build_reading(v) for v in [2, 5, 12, 25, 40]],
         "deep_ketosis"),        # last reading 40 ppm → deep_ketosis
        ("Consistently high risk",
         [build_reading(v) for v in [80, 85, 90, 95, 100]],
         "dka_risk"),            # last reading 100 ppm → dka_risk
    ]
    for name, seq, expected in sequences:
        result = ml_inference.predict_risk_lstm(seq)
        got = result.get("label")
        ok = got == expected
        mark = f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
        exp_str = expected
        print(f"  {mark} {BOLD}{name:<28}{RESET} "
              f"expected={color_label(exp_str) if expected else exp_str:<20} "
              f"got={color_label(got):<20} "
              f"conf={result.get('confidence_score', 0):.3f}  "
              f"model={GRAY}{result.get('model_used')}{RESET}")

    # ─── 3. LSTM fallback (short sequence) ────────────────────────────────
    print_header("Test 3 — LSTM Fallback (insufficient readings)")

    short_seq = [build_reading(3.0), build_reading(5.0)]
    result = ml_inference.predict_risk_lstm(short_seq)
    ok = "fallback" in result.get("model_used", "")
    mark = f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
    print(f"  {mark} 2-reading sequence → falls back to single-shot  "
          f"model={GRAY}{result.get('model_used')}{RESET}  "
          f"reason={GRAY}{result.get('reason')}{RESET}")

    # ─── 4. Drift detection scenarios ─────────────────────────────────────
    print_header("Test 4 — Drift Detection")

    def cal(ambient_voc, days_ago):
        return {"ambient_voc": ambient_voc,
                "time": datetime.utcnow() - timedelta(days=days_ago)}

    drift_scenarios = [
        ("Stable sensor",       [cal(430, 30), cal(432, 25), cal(431, 20),
                                  cal(433, 10), cal(430, 0)],       False, "none"),
        ("Mild drift (+15%)",   [cal(430, 30), cal(430, 25), cal(430, 20),
                                  cal(485, 10), cal(495, 0)],       True,  "mild"),
        ("Severe drift (+40%)", [cal(430, 30), cal(430, 25), cal(430, 20),
                                  cal(580, 10), cal(620, 0)],       True,  "severe"),
        ("Insufficient data",   [cal(430, 5)],                       False, "insufficient_data"),
    ]
    for name, hist, exp_detect, exp_sev in drift_scenarios:
        result = ml_inference.check_drift(hist)
        detected = result["drift_detected"]
        severity = result["severity"]
        ok = detected == exp_detect and severity == exp_sev
        mark = f"{GREEN}✓{RESET}" if ok else f"{RED}✗{RESET}"
        print(f"  {mark} {BOLD}{name:<24}{RESET} "
              f"detected={detected!s:<5}  severity={severity:<20}  "
              f"drift_pct={result.get('drift_pct')}  "
              f"→ {result.get('recommendation')}")

    # ─── 5. Full pipeline simulation ──────────────────────────────────────
    print_header("Test 5 — Full Pipeline (patient over 5 days)")

    patient_readings = [
        (0, build_reading(0.6)),
        (1, build_reading(2.5)),
        (2, build_reading(8.0)),
        (3, build_reading(25.0)),
        (4, build_reading(55.0)),
    ]
    print(f"  {BOLD}Day  Acetone   Single-shot label       LSTM label{RESET}")
    for day, reading in patient_readings:
        single = ml_inference.predict_risk(reading)
        seq_upto = [r for _, r in patient_readings[: day + 1]]
        while len(seq_upto) < 5:
            seq_upto.insert(0, seq_upto[0])
        lstm = ml_inference.predict_risk_lstm(seq_upto)
        print(f"  Day {day}  {reading['acetone_delta']:5.1f}    "
              f"{color_label(single['label']):<24} "
              f"{color_label(lstm['label']):<24} "
              f"{GRAY}(conf={lstm['confidence_score']:.2f}){RESET}")

    print(f"\n{BOLD}{GREEN}Simulation complete.{RESET}\n")


if __name__ == "__main__":
    main()
