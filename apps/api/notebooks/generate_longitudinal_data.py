"""
Phase 3A — Synthetic longitudinal dataset generator for LSTM Trend Classifier.

Design (see plan.md §5.3):
  100 virtual patients × 14 sessions/patient = 1,400 rows
  4 trend patterns per patient (uniformly assigned):
    stable      — ΔVOC ~ baseline + N(0, σ)     ~ zero slope
    increasing  — ΔVOC = baseline + s·slope     positive slope (~+0.4 ppm/session)
    decreasing  — ΔVOC = baseline+6 − s·slope   negative slope
    abnormal    — stable baseline + spike at s=7 (~+15 ppm) and back

Other features (pressure, temperature, humidity, quality, reliability, breath duration)
are drawn INDEPENDENTLY of ppm so they carry no signal about ΔVOC. This is deliberate:
we want the LSTM to learn trend from the ΔVOC sequence itself, not from spurious
per-session correlations. Feature ranges match apps/api/notebooks/train_models.py
demo dataset so downstream inference sees realistic values.

The trend_label column is filled by importing app.services.trend_label so the
data-generation logic and the runtime label rule stay in lock-step. Sliding-window
sequences (L=7, 14) are constructed downstream in 05_lstm_trend.ipynb, not here.

Usage:
    python apps/api/notebooks/generate_longitudinal_data.py

Output:
    data/processed/longitudinal_synthetic.csv
"""
from __future__ import annotations

import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.services.trend_label import compute_trend_label  # noqa: E402

OUT_PATH = ROOT / "data" / "processed" / "longitudinal_synthetic.csv"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

N_PATIENTS = 100
SESSIONS_PER_PT = 14
TREND_TYPES = ["stable", "increasing", "decreasing", "abnormal"]
SEED = 42

# Slopes / spike chosen to sit safely on either side of the trend_label rule
# thresholds (slope ±0.3, spike max_jump 4.0) so the generator produces
# unambiguous training targets that a well-fit LSTM ought to reach ~95%+ on.
SLOPE_INCREASING = 0.45   # ppm / session
SLOPE_DECREASING = -0.45
SPIKE_MAGNITUDE = 15.0
SPIKE_SESSION = 7
NOISE_SIGMA_STABLE = 0.35
NOISE_SIGMA_TREND = 0.30
NOISE_SIGMA_ABNORMAL = 0.35


def _sample_baseline() -> float:
    """Each patient gets a personal basal ΔVOC drawn from a realistic mix."""
    # 70% healthy basal (~1-2 ppm), 25% mild keto (~3-6 ppm), 5% deep keto (~8-15 ppm)
    r = random.random()
    if r < 0.70:
        return random.uniform(0.6, 2.0)
    if r < 0.95:
        return random.uniform(3.0, 6.0)
    return random.uniform(8.0, 15.0)


def _session_ppm(trend: str, baseline: float, s: int, rng: np.random.Generator) -> float:
    if trend == "stable":
        return max(0.0, baseline + rng.normal(0.0, NOISE_SIGMA_STABLE))
    if trend == "increasing":
        return max(0.0, baseline + s * SLOPE_INCREASING + rng.normal(0.0, NOISE_SIGMA_TREND))
    if trend == "decreasing":
        # Start high enough to still be non-negative after 13 downward steps
        top = baseline + abs(SLOPE_DECREASING) * (SESSIONS_PER_PT - 1) + 1.0
        return max(0.0, top + s * SLOPE_DECREASING + rng.normal(0.0, NOISE_SIGMA_TREND))
    if trend == "abnormal":
        val = baseline + rng.normal(0.0, NOISE_SIGMA_ABNORMAL)
        if s == SPIKE_SESSION:
            val += SPIKE_MAGNITUDE
        return max(0.0, val)
    raise ValueError(f"unknown trend {trend!r}")


def _session_covariates(rng: np.random.Generator) -> dict:
    """Independent-of-ppm sensor/environment features, realistic ranges."""
    return {
        "pressure_mean":      float(np.clip(rng.normal(115.0, 6.0),  90.0, 140.0)),
        "pressure_std":       float(np.clip(rng.normal(5.0, 1.5),    0.5, 12.0)),
        "breath_duration":    float(np.clip(rng.normal(8.0, 2.0),    3.0, 20.0)),
        "temperature":        float(np.clip(rng.normal(28.0, 2.0),   18.0, 35.0)),
        "humidity":           float(np.clip(rng.normal(60.0, 8.0),   35.0, 85.0)),
        "quality_score":      float(np.clip(rng.normal(90.0, 5.0),   0.0, 100.0)),
        "reliability_score":  float(np.clip(rng.normal(88.0, 6.0),   0.0, 100.0)),
    }


def generate() -> pd.DataFrame:
    random.seed(SEED)
    rng = np.random.default_rng(SEED)

    rows = []
    # For per-patient trend labelling we buffer the ppm sequence, run the rule
    # over the full 14 sessions, then propagate the label to every row of that
    # patient. This mirrors the "one label per sequence" convention used by
    # 05_lstm_trend.ipynb.
    for pid in range(N_PATIENTS):
        trend_assignment = TREND_TYPES[pid % len(TREND_TYPES)]  # balanced classes
        baseline = _sample_baseline()

        patient_rows = []
        ppm_series = []
        for s in range(SESSIONS_PER_PT):
            ppm = _session_ppm(trend_assignment, baseline, s, rng)
            ppm_series.append(ppm)
            cov = _session_covariates(rng)
            patient_rows.append({
                "patient_id":         f"L{pid:03d}",
                "session_idx":         s,
                "acetone_delta":       round(ppm, 4),
                "assigned_trend":      trend_assignment,
                **{k: round(v, 4) for k, v in cov.items()},
            })

        # Ground-truth label derived from the sequence via the same rule the
        # backend will use at inference time.
        derived_label = compute_trend_label(ppm_series)
        for r in patient_rows:
            r["trend_label"] = derived_label
            rows.append(r)

    df = pd.DataFrame(rows)
    return df


def main() -> None:
    df = generate()
    df.to_csv(OUT_PATH, index=False)

    print(f"Wrote {len(df):,} rows for {df['patient_id'].nunique()} patients")
    print(f"       {OUT_PATH.relative_to(ROOT)}")
    print()

    dist = df.drop_duplicates("patient_id")["trend_label"].value_counts()
    print("Trend label distribution (per patient):")
    for lbl, n in dist.items():
        print(f"  {lbl:<12s} {n}")

    print()
    print("Assigned vs. derived agreement (per patient):")
    agree = df.drop_duplicates("patient_id").apply(
        lambda r: r["assigned_trend"] == r["trend_label"], axis=1
    )
    print(f"  {agree.sum()}/{len(agree)} = {agree.mean():.2%}")
    print()
    print("Feature ranges (all sessions):")
    for col in ["acetone_delta", "pressure_mean", "pressure_std",
                "breath_duration", "temperature", "humidity",
                "quality_score", "reliability_score"]:
        print(f"  {col:<20s} min={df[col].min():7.2f}  "
              f"mean={df[col].mean():7.2f}  max={df[col].max():7.2f}")


if __name__ == "__main__":
    main()
