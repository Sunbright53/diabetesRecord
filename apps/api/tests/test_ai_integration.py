"""Integration tests for MetaBreath AI inference — RF/XGB, LSTM, Drift.

Labels follow the Anderson (2015) five-pattern classification:
  basal, light_ketosis, nutritional_ketosis, deep_ketosis, dka_risk
Source: Obesity (2015) 23:2327-2334
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pytest

from app.services import ml_inference


def _reading(acetone_delta: float, quality: float = 90, reliability: float = 90,
             **extras: Any) -> dict:
    base = {
        "acetone_delta": acetone_delta,
        "quality_score": quality,
        "reliability_score": reliability,
        "ambient_voc": 430,
        "pressure_mean": 120,
        "pressure_std": 5,
        "breath_duration": 8,
        "temperature": 28,
        "humidity": 65,
        "environment_penalty": 2.0,
        "ketosis_index": acetone_delta * 0.85,
        "metabolic_score": acetone_delta * 0.6 + 30,
        "fat_burning_index": acetone_delta * 0.55,
    }
    base.update(extras)
    return base


# ─── Anderson 2015 label helper ───────────────────────────────────────────

def test_anderson_label_boundaries():
    """Verify the five-pattern classification thresholds."""
    assert ml_inference._anderson_label(1.0)  == "basal"
    assert ml_inference._anderson_label(3.0)  == "light_ketosis"
    assert ml_inference._anderson_label(15.0) == "nutritional_ketosis"
    assert ml_inference._anderson_label(50.0) == "deep_ketosis"
    assert ml_inference._anderson_label(100.0) == "dka_risk"
    assert ml_inference._anderson_label(None)  == "unreliable"


# ─── Single-shot RF/XGB predictions ────────────────────────────────────────

def test_predict_healthy_low_acetone():
    result = ml_inference.predict_risk(_reading(0.5))
    assert result["label"] == "basal"
    assert result["confidence_score"] > 0.6
    assert result["model_used"] in ("xgboost", "random_forest")


def test_predict_light_caloric_restriction():
    result = ml_inference.predict_risk(_reading(2.5))
    assert result["label"] == "light_ketosis"


def test_predict_nutritional_ketosis():
    result = ml_inference.predict_risk(_reading(15.0))
    assert result["label"] == "nutritional_ketosis"


def test_predict_deep_ketosis():
    result = ml_inference.predict_risk(_reading(50.0))
    assert result["label"] == "deep_ketosis"


def test_predict_dka_risk():
    result = ml_inference.predict_risk(_reading(150.0))
    assert result["label"] == "dka_risk"
    assert result["metabolic_risk_index"] == 4


def test_predict_unreliable_when_quality_low():
    result = ml_inference.predict_risk(_reading(50.0, reliability=20))
    assert result["label"] == "unreliable"
    assert result["recalibration_needed"] is True


# ─── LSTM temporal predictions ────────────────────────────────────────────

def test_lstm_stable_low_sequence():
    seq = [_reading(0.5 + i * 0.1) for i in range(5)]
    result = ml_inference.predict_risk_lstm(seq)
    assert result["label"] == "basal"  # last reading 0.9 ppm → basal
    assert result["model_used"] == "lstm"


def test_lstm_high_risk_sequence():
    seq = [_reading(v) for v in [80, 85, 90, 95, 100]]
    result = ml_inference.predict_risk_lstm(seq)
    assert result["label"] == "dka_risk"  # last reading 100 ppm → dka_risk


def test_lstm_falls_back_on_short_sequence():
    seq = [_reading(3.0), _reading(5.0)]
    result = ml_inference.predict_risk_lstm(seq)
    assert "fallback" in result["model_used"]
    assert result.get("reason") == "insufficient_sequence_length"


# ─── Drift detection ──────────────────────────────────────────────────────

def _cal(voc: float, days_ago: int) -> dict:
    return {"ambient_voc": voc,
            "time": datetime.utcnow() - timedelta(days=days_ago)}


def test_drift_none_when_stable():
    hist = [_cal(430, 30), _cal(432, 25), _cal(431, 20),
            _cal(433, 10), _cal(430, 0)]
    result = ml_inference.check_drift(hist)
    assert result["drift_detected"] is False
    assert result["severity"] == "none"
    assert result["recommendation"] == "ok"


def test_drift_mild_triggers_recalibration_soon():
    hist = [_cal(430, 30), _cal(430, 25), _cal(430, 20),
            _cal(485, 10), _cal(495, 0)]
    result = ml_inference.check_drift(hist)
    assert result["drift_detected"] is True
    assert result["severity"] == "mild"
    assert result["recommendation"] == "recalibrate_soon"


def test_drift_severe_triggers_immediate_recalibration():
    hist = [_cal(430, 30), _cal(430, 25), _cal(430, 20),
            _cal(580, 10), _cal(620, 0)]
    result = ml_inference.check_drift(hist)
    assert result["drift_detected"] is True
    assert result["severity"] == "severe"
    assert result["recommendation"] == "recalibrate_now"
    assert result["drift_pct"] > 25


def test_drift_insufficient_data():
    result = ml_inference.check_drift([_cal(430, 0)])
    assert result["severity"] == "insufficient_data"
    assert result["drift_detected"] is False


# ─── Trend prediction (existing endpoint) ─────────────────────────────────

def test_trend_needs_minimum_readings():
    result = ml_inference.predict_trend([{"time": datetime.utcnow(),
                                          "acetone_delta": 1.0}])
    assert result["trend_direction"] == "insufficient_data"


def test_trend_detects_increasing_pattern():
    now = datetime.utcnow()
    readings = [
        {"time": now - timedelta(days=4), "acetone_delta": 1.0},
        {"time": now - timedelta(days=3), "acetone_delta": 2.5},
        {"time": now - timedelta(days=2), "acetone_delta": 4.0},
        {"time": now - timedelta(days=1), "acetone_delta": 6.5},
        {"time": now,                     "acetone_delta": 9.0},
    ]
    result = ml_inference.predict_trend(readings)
    assert result["trend_direction"] == "increasing"
    assert result["slope_ppm_per_day"] > 0
