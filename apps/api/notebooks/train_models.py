"""
MetaBreath AI Model Training Script — Anderson 2015 Five-Class Edition
Train Random Forest + XGBoost on the acetone delta demo dataset.

Labels follow Anderson (2015) five-pattern breath acetone classification:
  basal              0.5–2 ppm   standard diet
  light_ketosis      2–4 ppm     mild caloric restriction
  nutritional_ketosis 4–30 ppm   HFLC/keto diet, BOHB 0.5–3 mM
  deep_ketosis       30–75 ppm   fasting / extended restriction
  dka_risk           ≥ 75 ppm    diabetic ketoacidosis range
Source: Anderson JC. Obesity (2015) 23:2327-2334. doi:10.1002/oby.21242

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
from sklearn.metrics import classification_report, f1_score
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

# Anderson 2015 five-class thresholds applied to acetone_delta (ppm)
FIVE_CLASS_THRESHOLDS = [(2.0, "basal"), (4.0, "light_ketosis"),
                          (30.0, "nutritional_ketosis"), (75.0, "deep_ketosis")]
TRAIN_LABELS = ["basal", "light_ketosis", "nutritional_ketosis", "deep_ketosis", "dka_risk"]
LABEL_ORDER = TRAIN_LABELS


def anderson_label(ppm: float) -> str:
    for thresh, lbl in FIVE_CLASS_THRESHOLDS:
        if ppm < thresh:
            return lbl
    return "dka_risk"


# ─── Load data ────────────────────────────────────────────────────────────────
print(f"Loading dataset: {DATASET}")
df = pd.read_csv(DATASET, encoding="utf-8-sig")
print(f"  Rows total: {len(df)} | Original labels: {df['label'].value_counts().to_dict()}")

# Drop unreliable rows (handled by reliability gate at inference)
df = df[df["label"] != "unreliable"].copy()

# Re-label all rows using Anderson 2015 thresholds
df["label"] = df["acetone_delta"].apply(anderson_label)
print(f"  5-class label distribution:\n{df['label'].value_counts().to_dict()}")

X = df[FEATURE_COLS].copy()
y_raw = df["label"].copy()

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
n_classes = len(TRAIN_LABELS)

xgb = XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
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
    "label_classes": TRAIN_LABELS,
    "label_encoder_classes": le.classes_.tolist(),
    "anderson_five_class_labels": TRAIN_LABELS,
    "anderson_thresholds_ppm": [t for t, _ in FIVE_CLASS_THRESHOLDS],
    "anderson_reference": "Anderson JC. Obesity (2015) 23:2327-2334. doi:10.1002/oby.21242",
}
with open(MODEL_DIR / "feature_columns.json", "w") as f:
    json.dump(feature_meta, f, indent=2)
print(f"Saved: {MODEL_DIR / 'feature_columns.json'}")

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
    "labels": TRAIN_LABELS,
    "label_system": "Anderson 2015 five-class",
}
with open(MODEL_DIR / "training_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2, ensure_ascii=False)

print("\n=== Summary ===")
print(f"RF  F1: {rf_f1:.4f} (CV: {rf_cv.mean():.4f})")
print(f"XGB F1: {xgb_f1:.4f} (CV: {xgb_cv.mean():.4f})")
print(f"\nAll files saved to: {MODEL_DIR}")
print("Done.")
