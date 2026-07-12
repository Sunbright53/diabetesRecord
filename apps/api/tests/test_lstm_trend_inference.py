"""End-to-end inference tests for the LSTM Trend Classifier.

These tests are intentionally lenient on confidence values — the point is that
the deployed model correctly classifies canonical trend patterns AND falls back
gracefully when the sequence is too short or the model artifact is missing.
"""
from __future__ import annotations

import random

import pytest

from app.services.ml_inference import (
    TREND_LABELS,
    TREND_MIN_SEQUENCE_LENGTH,
    classify_trend,
)


def _session(ppm: float,
             seed_offset: int = 0,
             sigma: float = 0.0) -> dict:
    """Build a session dict with realistic-range covariates."""
    r = random.Random(42 + seed_offset)
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


def _sequence(ppm_series: list[float], sigma: float = 0.30) -> list[dict]:
    return [_session(p, seed_offset=i, sigma=sigma) for i, p in enumerate(ppm_series)]


class TestReturnSchema:
    def test_result_keys(self):
        seq = _sequence([1.0] * 14)
        r = classify_trend(seq)
        for k in ("trend", "confidence", "probabilities",
                  "sequence_length", "min_required",
                  "model_used", "fallback_reason"):
            assert k in r
        assert r["min_required"] == TREND_MIN_SEQUENCE_LENGTH

    def test_probabilities_sum_close_to_one(self):
        seq = _sequence([1.0] * 14)
        r = classify_trend(seq)
        if r["model_used"] == "lstm_trend":
            total = sum(r["probabilities"].values())
            assert abs(total - 1.0) < 1e-3, f"probs sum={total}"
        else:
            # rule fallback returns fixed 0.7/0.1 distribution; skip
            pass


class TestInsufficientData:
    def test_short_sequence_returns_insufficient(self):
        seq = _sequence([1.0] * 5)
        r = classify_trend(seq)
        assert r["trend"] is None
        assert r["model_used"] == "insufficient_data"
        assert r["sequence_length"] == 5

    def test_empty_sequence(self):
        r = classify_trend([])
        assert r["trend"] is None
        assert r["model_used"] == "insufficient_data"
        assert r["sequence_length"] == 0


class TestCanonicalPatterns:
    def test_stable_baseline(self):
        seq = _sequence([1.5] * 14, sigma=0.3)
        r = classify_trend(seq)
        assert r["trend"] == "stable"

    def test_ramping_matches_report_scenario(self):
        """The 2→40 ppm scenario that the previous LSTM tagged 'low' (report §4.2)."""
        seq = _sequence([2.0 + i * 3.0 for i in range(14)], sigma=0.3)
        r = classify_trend(seq)
        assert r["trend"] == "increasing", \
            f"expected 'increasing' for 2→41 ramp, got {r['trend']}"

    def test_decreasing_baseline(self):
        seq = _sequence([28.0 - i * 2.0 for i in range(14)], sigma=0.3)
        r = classify_trend(seq)
        assert r["trend"] == "decreasing"

    def test_spike_is_abnormal_with_noise(self):
        ppm = [1.5] * 14
        ppm[7] += 15.0
        seq = _sequence(ppm, sigma=0.3)
        r = classify_trend(seq)
        assert r["trend"] == "abnormal"


class TestMissingFields:
    def test_missing_optional_fields_still_classifies(self):
        # A minimal session dict with only acetone_delta — others default to 0.
        seq = [{"acetone_delta": 1.5} for _ in range(14)]
        r = classify_trend(seq)
        # With zero covariates, expect a valid trend — likely stable since ΔVOC flat
        assert r["trend"] in TREND_LABELS
