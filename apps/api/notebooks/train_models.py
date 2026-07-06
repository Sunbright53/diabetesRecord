"""
MetaBreath AI Model Training Script
Train Random Forest + XGBoost on the acetone delta demo dataset.

Usage:
    python apps/api/notebooks/train_models.py

Output:
    apps/api/models/rf_classifier.joblib
    apps/api/models/xgb_classifier.joblib
    apps/api/models/feature_columns.json
    apps/api/models/training_metrics.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent.parent.parent   # repo root
DATASET = (
    ROOT
    / "แข่งชนะ by Coach Bright_NSC"
    / "NSC 2026"
    / "1. Data set สำหรับเทรน AI"
    / "metabreath_acetone_delta_demo_dataset.csv"
)
MODEL_DIR = ROOT / "apps" / "api" / "models"
MODEL_DIR.mkdir(exist_ok=True)

# Features to use for training (must exist in CSV and be available at inference time)
FEATURE_COLS = [
    "acetone_delta",
    "quality_score",
    "reliability_score",
    "ambient_voc",
    "pressure_mean",
    "pressure_std",
    "breath_duration",
    "temperature",
    "humidity",
    "environment_penalty",
    "ketosis_index",
    "metabolic_score",
    "fat_burning_index",
]
LABEL_COL = "label"
# "unreliable" is handled by reliability_score gate at inference — not trained
TRAIN_LABELS = ["low", "moderate", "high"]
LABEL_ORDER = TRAIN_LABELS  # what the model outputs


# ─── Load data ────────────────────────────────────────────────────────────────
print(f"Loading dataset: {DATASET}")
df = pd.read_csv(DATASET, encoding="utf-8-sig")
print(f"  Rows total: {len(df)} | Labels: {df[LABEL_COL].value_counts().to_dict()}")

# Drop "unreliable" rows (only 1 sample — handled by rule gate at inference)
df = df[df[LABEL_COL].isin(TRAIN_LABELS)].copy()
print(f"  Rows after dropping 'unreliable': {len(df)}")

X = df[FEATURE_COLS].copy()
y_raw = df[LABEL_COL].copy()

# Encode labels as integers: low=0, moderate=1, high=2
le = LabelEncoder()
le.fit(TRAIN_LABELS)
y = le.transform(y_raw)

# Stratified 80/20 split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"  Train: {len(X_train)} | Test: {len(X_test)}")

# ─── Random Forest ────────────────────────────────────────────────────────────
print("\n=== Training Random Forest ===")
rf = RandomForestClassifier(
    n_estimators=200,
    max_depth=10,
    min_samples_leaf=3,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1,
)
rf.fit(X_train, y_train)

rf_pred = rf.predict(X_test)
rf_f1 = f1_score(y_test, rf_pred, average="weighted")
print(classification_report(y_test, rf_pred, target_names=LABEL_ORDER, zero_division=0))
print(f"Random Forest Weighted F1: {rf_f1:.4f}")

rf_cv = cross_val_score(rf, X, y, cv=StratifiedKFold(5, shuffle=True, random_state=42),
                         scoring="f1_weighted", n_jobs=-1)
print(f"Random Forest 5-fold CV F1: {rf_cv.mean():.4f} ± {rf_cv.std():.4f}")

rf_path = MODEL_DIR / "rf_classifier.joblib"
joblib.dump(rf, rf_path)
print(f"Saved: {rf_path}")

# Feature importances
feat_imp = sorted(zip(FEATURE_COLS, rf.feature_importances_),
                  key=lambda x: -x[1])
print("\nTop-5 RF feature importances:")
for feat, imp in feat_imp[:5]:
    print(f"  {feat}: {imp:.4f}")

# ─── XGBoost ──────────────────────────────────────────────────────────────────
print("\n=== Training XGBoost ===")
n_classes = len(LABEL_ORDER)

xgb = XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    use_label_encoder=False,
    eval_metric="mlogloss",
    num_class=n_classes,
    objective="multi:softprob",
    random_state=42,
    n_jobs=-1,
)
xgb.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    verbose=False,
)

xgb_pred = xgb.predict(X_test)
xgb_f1 = f1_score(y_test, xgb_pred, average="weighted")
print(classification_report(y_test, xgb_pred, target_names=LABEL_ORDER, zero_division=0))
print(f"XGBoost Weighted F1: {xgb_f1:.4f}")

xgb_cv = cross_val_score(xgb, X, y, cv=StratifiedKFold(5, shuffle=True, random_state=42),
                          scoring="f1_weighted", n_jobs=-1)
print(f"XGBoost 5-fold CV F1: {xgb_cv.mean():.4f} ± {xgb_cv.std():.4f}")

xgb_path = MODEL_DIR / "xgb_classifier.joblib"
joblib.dump(xgb, xgb_path)
print(f"Saved: {xgb_path}")

# ─── Save metadata ────────────────────────────────────────────────────────────
feature_meta = {
    "feature_columns": FEATURE_COLS,
    "label_classes": LABEL_ORDER,
    "label_encoder_classes": le.classes_.tolist(),
}
with open(MODEL_DIR / "feature_columns.json", "w") as f:
    json.dump(feature_meta, f, indent=2)

metrics = {
    "rf": {
        "f1_weighted_test": round(rf_f1, 4),
        "f1_weighted_cv_mean": round(float(rf_cv.mean()), 4),
        "f1_weighted_cv_std": round(float(rf_cv.std()), 4),
    },
    "xgb": {
        "f1_weighted_test": round(xgb_f1, 4),
        "f1_weighted_cv_mean": round(float(xgb_cv.mean()), 4),
        "f1_weighted_cv_std": round(float(xgb_cv.std()), 4),
    },
    "n_train": int(len(X_train)),
    "n_test": int(len(X_test)),
    "dataset_rows": int(len(df)),
    "feature_columns": FEATURE_COLS,
    "labels": LABEL_ORDER,
}
with open(MODEL_DIR / "training_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2, ensure_ascii=False)

print("\n=== Summary ===")
print(f"RF  F1: {rf_f1:.4f} (CV: {rf_cv.mean():.4f})")
print(f"XGB F1: {xgb_f1:.4f} (CV: {xgb_cv.mean():.4f})")
print(f"\nAll files saved to: {MODEL_DIR}")
print("Done.")
