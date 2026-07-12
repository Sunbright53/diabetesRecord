"""
Phase 5A — End-to-end simulation of the Trend LSTM against the canonical
scenarios listed in plan.md §8.3.

Purpose:
    1. Reproducible evidence that the deployed Trend LSTM handles the six
       clinical scenarios from the plan (S1-S6).
    2. Machine-readable JSON output that other tools (report, cheat-sheet)
       can reference.
    3. Human-readable table printed to stdout for defense demos.

Usage:
    python apps/api/notebooks/simulate_scenarios.py

Output:
    apps/api/models/simulation_results.json
    stdout table
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.services.ml_inference import (  # noqa: E402
    TREND_LABELS,
    TREND_MIN_SEQUENCE_LENGTH,
    classify_trend,
)


def _session(ppm: float, seed: int, sigma: float = 0.30) -> dict:
    r = random.Random(seed)
    return {
        "acetone_delta":     max(0.0, ppm + r.gauss(0, sigma)),
        "pressure_mean":     115.0 + r.gauss(0, 6),
        "pressure_std":      max(0.5, 5.0 + r.gauss(0, 1.5)),
        "breath_duration":   max(3.0, 8.0 + r.gauss(0, 2)),
        "temperature":       28.0 + r.gauss(0, 2),
        "humidity":          60.0 + r.gauss(0, 8),
        "quality_score":     min(100.0, max(0.0, 90.0 + r.gauss(0, 5))),
        "reliability_score": min(100.0, max(0.0, 88.0 + r.gauss(0, 6))),
    }


def _seq(ppms: list[float], sigma: float = 0.30) -> list[dict]:
    return [_session(p, seed=42 + i, sigma=sigma) for i, p in enumerate(ppms)]


def _short(session: dict, unreliable_score: float | None = None) -> dict:
    """Return a copy of a session dict with an optional reliability override."""
    s = dict(session)
    if unreliable_score is not None:
        s["reliability_score"] = unreliable_score
    return s


SCENARIOS = [
    {
        "id": "S1",
        "name": "Stable healthy (14 sessions @ ~1.5 ppm)",
        "expected": "stable",
        "sequence": _seq([1.5] * 14, sigma=0.3),
    },
    {
        "id": "S2",
        "name": "Ramping into ketosis (2 → 41 ppm over 14 sessions)",
        "expected": "increasing",
        "note": "Report §4.2 FAIL case — legacy LSTM predicted 'low'.",
        "sequence": _seq([2.0 + i * 3.0 for i in range(14)], sigma=0.3),
    },
    {
        "id": "S3",
        "name": "Decreasing (28 → 2 ppm over 14 sessions)",
        "expected": "decreasing",
        "sequence": _seq([28.0 - i * 2.0 for i in range(14)], sigma=0.3),
    },
    {
        "id": "S4",
        "name": "Stable + spike at day 7 (+15 ppm)",
        "expected": "abnormal",
        "sequence": _seq(
            [1.5 + (15.0 if i == 7 else 0) for i in range(14)], sigma=0.3
        ),
    },
    {
        "id": "S5",
        "name": "Short sequence — only 5 sessions",
        "expected": "insufficient_data (min 7)",
        "sequence": _seq([1.5] * 5, sigma=0.3),
    },
    {
        "id": "S6",
        "name": "Missing optional fields (breath_duration + humidity = None)",
        "expected": "stable (resilient to missing covariates)",
        "note": "Simulates a firmware version that stops reporting two fields; "
                "the acetone_delta sequence itself is stable so the answer "
                "should stay stable.",
        "sequence": [
            {**s, "breath_duration": None, "humidity": None}
            for s in _seq([1.5] * 14, sigma=0.3)
        ],
    },
]


def _evaluate(exp: str, got: str | None) -> tuple[str, bool]:
    """Return (display_result, is_pass)."""
    exp_key = exp.split()[0] if exp else ""
    if exp_key == "insufficient_data":
        ok = got is None
    else:
        ok = got == exp_key
    return ("PASS" if ok else "FAIL", ok)


def main() -> None:
    print(f"Simulating {len(SCENARIOS)} scenarios (min_sequence={TREND_MIN_SEQUENCE_LENGTH})")
    print(f"Labels supported: {TREND_LABELS}")
    print()

    results = []
    header = f"{'ID':<4} {'Scenario':<52} {'Expected':<28} {'Got':<14} {'Conf':<7} {'Model':<22} {'Result':<6}"
    print(header)
    print("-" * len(header))

    for sc in SCENARIOS:
        r = classify_trend(sc["sequence"])
        result_text, ok = _evaluate(sc["expected"], r["trend"])
        got = r["trend"] or "insufficient_data"

        print(f"{sc['id']:<4} {sc['name'][:50]:<52} {sc['expected'][:26]:<28} "
              f"{got:<14} {r['confidence']:<7.3f} {r['model_used']:<22} "
              f"{result_text:<6}")

        results.append({
            "id": sc["id"],
            "name": sc["name"],
            "expected": sc["expected"],
            "note": sc.get("note"),
            "got": got,
            "confidence": r["confidence"],
            "probabilities": r["probabilities"],
            "sequence_length": r["sequence_length"],
            "model_used": r["model_used"],
            "fallback_reason": r["fallback_reason"],
            "result": result_text,
            "passed": ok,
        })

    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    print()
    print(f"Summary: {passed}/{total} scenarios PASSED")

    out_path = ROOT / "apps" / "api" / "models" / "simulation_results.json"
    with open(out_path, "w") as f:
        json.dump({
            "min_sequence": TREND_MIN_SEQUENCE_LENGTH,
            "trend_labels": TREND_LABELS,
            "scenarios": results,
            "summary": {"passed": passed, "total": total},
        }, f, indent=2, ensure_ascii=False)
    print(f"Saved: {out_path.relative_to(ROOT)}")

    # Exit code so this can gate CI later.
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
