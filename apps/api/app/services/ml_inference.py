"""
MetaBreath AI inference service.

Models trained on metabreath_acetone_delta_demo_dataset.csv (1199 samples).
Training: apps/api/notebooks/train_models.py
Models:   apps/api/models/{rf,xgb}_classifier.joblib + feature_columns.json

Feature order and label mapping are read from feature_columns.json at startup
so inference always matches training exactly.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Optional

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")

_rf_model = None
_xgb_model = None
_feature_columns: list[str] = []
_label_classes: list[str] = []   # ordered by integer class index (from LabelEncoder)


def _load_models():
    global _rf_model, _xgb_model, _feature_columns, _label_classes
    if _feature_columns:
        return
    try:
        import joblib

        meta_path = os.path.join(_MODEL_DIR, "feature_columns.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                meta = json.load(f)
            _feature_columns = meta["feature_columns"]
            # label_encoder_classes is the alphabetically-sorted mapping from int→label
            _label_classes = meta.get("label_encoder_classes", meta.get("label_classes", ["low", "moderate", "high"]))

        rf_path = os.path.join(_MODEL_DIR, "rf_classifier.joblib")
        xgb_path = os.path.join(_MODEL_DIR, "xgb_classifier.joblib")
        if os.path.exists(rf_path):
            _rf_model = joblib.load(rf_path)
        if os.path.exists(xgb_path):
            _xgb_model = joblib.load(xgb_path)
    except Exception:
        pass


def _build_feature_vector(features: dict) -> list[float]:
    """
    Build a feature vector in the exact order the models expect.

    Accepts keys using inference naming (temp_c, humidity_pct) and maps
    them to training naming (temperature, humidity). Missing derived
    features (ketosis_index, metabolic_score, fat_burning_index) default
    to 0 — acetone_delta alone is sufficient for correct classification.
    """
    alias = {
        "temp_c": "temperature",
        "humidity_pct": "humidity",
    }
    lookup = {}
    for k, v in features.items():
        lookup[alias.get(k, k)] = v if v is not None else 0.0

    return [float(lookup.get(col, 0.0)) for col in _feature_columns]


def _rule_based_risk(acetone_delta: Optional[float]) -> dict:
    """
    Reference thresholds from NSC 2026 guidelines (aจารย์):
      healthy / low ketosis: < 30 ppm
      moderate ketosis:      30–74 ppm
      high / DKA risk:       ≥ 75 ppm
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
    Predict metabolic risk label from sensor features.

    Priority: XGBoost → RandomForest → rule-based fallback.
    Returns: label, metabolic_risk_index, confidence_score, model_used.
    """
    _load_models()

    reliability = features.get("reliability_score", 100) or 100
    if reliability < 40:
        return {
            "label": "unreliable",
            "metabolic_risk_index": None,
            "confidence_score": round(reliability / 100, 4),
            "model_used": "reliability_gate",
            "recalibration_needed": True,
        }

    feat_vec = _build_feature_vector(features)

    for model, model_name in [(_xgb_model, "xgboost"), (_rf_model, "random_forest")]:
        if model is None:
            continue
        try:
            import numpy as np
            arr = np.array([feat_vec])
            proba = model.predict_proba(arr)[0]
            pred_idx = int(proba.argmax())
            confidence = float(proba.max())

            # Map integer → label using label_encoder_classes (alphabetical order)
            if _label_classes and pred_idx < len(_label_classes):
                label = _label_classes[pred_idx]
            else:
                label = ["low", "moderate", "high"][min(pred_idx, 2)]

            if confidence < 0.6:
                label = "unreliable"

            label_to_mri = {"low": 0, "moderate": 1, "high": 2, "unreliable": None}
            return {
                "label": label,
                "metabolic_risk_index": label_to_mri.get(label),
                "confidence_score": round(confidence, 4),
                "model_used": model_name,
                "recalibration_needed": confidence < 0.6,
            }
        except Exception:
            continue

    result = _rule_based_risk(features.get("acetone_delta"))
    result["model_used"] = "rule_based"
    result["recalibration_needed"] = result["confidence_score"] < 0.6
    return result


def predict_trend(readings: list[dict], horizon_days: int = 7) -> dict:
    """
    Linear regression trend on acetone_delta over time.
    Minimum 3 readings required.
    """
    if len(readings) < 3:
        return {
            "trend_direction": "insufficient_data",
            "slope_ppm_per_day": None,
            "predicted_points": [],
            "confidence": 0.0,
        }

    times = [
        r["time"] if isinstance(r["time"], datetime) else datetime.fromisoformat(str(r["time"]))
        for r in readings
    ]
    values = [float(r.get("acetone_delta") or 0.0) for r in readings]

    t0 = times[0]
    xs = [(t - t0).total_seconds() / 86400 for t in times]

    import statistics as _stats
    x_mean = _stats.mean(xs)
    y_mean = _stats.mean(values)

    num = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, values))
    den = sum((x - x_mean) ** 2 for x in xs)
    slope = num / den if den else 0.0
    intercept = y_mean - slope * x_mean

    last_x = xs[-1]
    last_time = times[-1]

    predicted_points = [
        {
            "time": (last_time + timedelta(days=d)).isoformat(),
            "predicted_acetone": round(max(0.0, intercept + slope * (last_x + d)), 4),
        }
        for d in range(1, horizon_days + 1)
    ]

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
