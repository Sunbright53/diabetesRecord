"""
MetaBreath AI inference service.

Provides risk classification and 7-day trend prediction endpoints.
At NSC demo time: uses rule-based fallback + pre-trained sklearn/XGBoost
models loaded from disk (models/*.joblib).

Model training is done in notebooks/02_random_forest.ipynb and
notebooks/03_xgboost_optuna.ipynb. Deploy by copying *.joblib files
into apps/api/models/.
"""
from __future__ import annotations

import os
import json
from datetime import datetime, timedelta
from typing import Optional

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")

# Lazy-loaded models (populated on first call)
_rf_model = None
_xgb_model = None


def _load_models():
    global _rf_model, _xgb_model
    if _rf_model is not None:
        return
    try:
        import joblib
        rf_path = os.path.join(_MODEL_DIR, "rf_classifier.joblib")
        xgb_path = os.path.join(_MODEL_DIR, "xgb_classifier.joblib")
        if os.path.exists(rf_path):
            _rf_model = joblib.load(rf_path)
        if os.path.exists(xgb_path):
            _xgb_model = joblib.load(xgb_path)
    except ImportError:
        pass  # joblib not available — use rule-based fallback


def _rule_based_risk(acetone_delta: Optional[float]) -> dict:
    """
    Rule-based classifier matching MetaBreath demo dataset boundaries (NSC 2026).
    Labels: low / moderate / high / unreliable
    """
    if acetone_delta is None or acetone_delta < 0:
        return {"label": "unreliable", "metabolic_risk_index": None, "confidence_score": 0.0}
    elif acetone_delta < 30.0:
        return {"label": "low", "metabolic_risk_index": 0, "confidence_score": 0.78}
    elif acetone_delta < 75.0:
        return {"label": "moderate", "metabolic_risk_index": 1, "confidence_score": 0.80}
    else:
        return {"label": "high", "metabolic_risk_index": 2, "confidence_score": 0.82}


def predict_risk(features: dict) -> dict:
    """
    Predict metabolic risk from a feature dict.

    features keys: acetone_delta, quality_score, reliability_score,
                   breath_duration, slope, time_to_peak, recovery_rate,
                   temp_c, humidity_pct.

    Returns: label, metabolic_risk_index, confidence_score, model_used.
    If confidence_score < 0.6, label is overridden to 'unreliable' and
    the caller should prompt device recalibration.
    """
    _load_models()

    acetone = features.get("acetone_delta")
    reliability = features.get("reliability_score", 100) or 100

    # Low reliability → return unreliable without running model
    if reliability < 40:
        return {
            "label": "unreliable",
            "metabolic_risk_index": None,
            "confidence_score": reliability / 100,
            "model_used": "reliability_gate",
            "recalibration_needed": True,
        }

    # Try XGBoost model first (better calibrated)
    if _xgb_model is not None:
        try:
            import numpy as np
            feat_arr = np.array([[
                features.get("acetone_delta", 0),
                features.get("quality_score", 100),
                features.get("reliability_score", 100),
                features.get("breath_duration", 3),
                features.get("slope", 0),
                features.get("time_to_peak", 0),
                features.get("recovery_rate", 0),
                features.get("temp_c", 20),
                features.get("humidity_pct", 65),
            ]])
            proba = _xgb_model.predict_proba(feat_arr)[0]
            pred_class = int(proba.argmax())
            confidence = float(proba.max())
            labels = ["low", "moderate", "high"]
            label = labels[pred_class] if pred_class < len(labels) else "unreliable"
            if confidence < 0.6:
                label = "unreliable"
            return {
                "label": label,
                "metabolic_risk_index": pred_class if confidence >= 0.6 else None,
                "confidence_score": round(confidence, 4),
                "model_used": "xgboost",
                "recalibration_needed": confidence < 0.6,
            }
        except Exception:
            pass

    # RF fallback
    if _rf_model is not None:
        try:
            import numpy as np
            feat_arr = np.array([[
                features.get("acetone_delta", 0),
                features.get("quality_score", 100),
                features.get("reliability_score", 100),
                features.get("breath_duration", 3),
                features.get("slope", 0),
            ]])
            proba = _rf_model.predict_proba(feat_arr)[0]
            pred_class = int(proba.argmax())
            confidence = float(proba.max())
            labels = ["low", "moderate", "high"]
            label = labels[pred_class] if pred_class < len(labels) else "unreliable"
            if confidence < 0.6:
                label = "unreliable"
            return {
                "label": label,
                "metabolic_risk_index": pred_class if confidence >= 0.6 else None,
                "confidence_score": round(confidence, 4),
                "model_used": "random_forest",
                "recalibration_needed": confidence < 0.6,
            }
        except Exception:
            pass

    # Pure rule-based fallback
    result = _rule_based_risk(acetone)
    result["model_used"] = "rule_based"
    result["recalibration_needed"] = result["confidence_score"] < 0.6
    return result


def predict_trend(readings: list[dict], horizon_days: int = 7) -> dict:
    """
    Predict acetone trend over the next horizon_days.

    readings: list of dicts with keys time (datetime) and acetone_delta (float),
              ordered oldest-first. Minimum 3 points required.

    Returns: trend_direction, slope_ppm_per_day, predicted_points (list of
             {time, predicted_acetone}), confidence.
    """
    if len(readings) < 3:
        return {
            "trend_direction": "insufficient_data",
            "slope_ppm_per_day": None,
            "predicted_points": [],
            "confidence": 0.0,
        }

    # Simple linear regression on acetone_delta vs time
    times = [r["time"] if isinstance(r["time"], datetime) else datetime.fromisoformat(str(r["time"])) for r in readings]
    values = [r.get("acetone_delta") or 0.0 for r in readings]

    t0 = times[0]
    xs = [(t - t0).total_seconds() / 86400 for t in times]  # days since first reading

    import statistics as _stats
    x_mean = _stats.mean(xs)
    y_mean = _stats.mean(values)

    num = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, values))
    den = sum((x - x_mean) ** 2 for x in xs)
    slope = num / den if den else 0.0
    intercept = y_mean - slope * x_mean

    last_x = xs[-1]
    last_time = times[-1]

    predicted_points = []
    for d in range(1, horizon_days + 1):
        pred_val = max(0.0, intercept + slope * (last_x + d))
        predicted_points.append({
            "time": (last_time + timedelta(days=d)).isoformat(),
            "predicted_acetone": round(pred_val, 4),
        })

    # Confidence: based on R² of the linear fit
    ss_res = sum((v - (intercept + slope * x)) ** 2 for x, v in zip(xs, values))
    ss_tot = sum((v - y_mean) ** 2 for v in values)
    r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    confidence = max(0.0, min(1.0, r2))

    if slope > 0.05:
        direction = "increasing"
    elif slope < -0.05:
        direction = "decreasing"
    else:
        direction = "stable"

    return {
        "trend_direction": direction,
        "slope_ppm_per_day": round(slope, 4),
        "predicted_points": predicted_points,
        "confidence": round(confidence, 4),
    }
