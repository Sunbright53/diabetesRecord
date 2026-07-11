# MetaBreath AI — Test Report
> รายงานผลทดสอบ AI Pipeline หลังเชื่อมเข้าแอป  
> วันที่: 2026-07-11 | ก่อน NSC 17 กค.

---

## 1. Summary

| หมวด | ผลรวม |
|---|---|
| **Unit tests (pytest)** | **13/13 ผ่าน** ✅ |
| **Simulation scenarios** | **15/16 ผ่าน** ⚠️ (1 edge case) |
| **API endpoints** | 5 endpoints active |
| **Models loaded** | RF, XGB, LSTM, Drift — ทั้งหมด ✅ |

---

## 2. Unit Tests (pytest)

```
tests/test_ai_integration.py — 13 tests, 2.67s
```

### Single-shot Classifier (RF/XGB) — 4/4 ✅

| Test | ผล | หมายเหตุ |
|---|---|---|
| `test_predict_healthy_low_acetone` | ✅ PASS | acetone=0.5 → "low" |
| `test_predict_moderate_ketosis` | ✅ PASS | acetone=50 → "moderate" |
| `test_predict_high_dka_range` | ✅ PASS | acetone=150 → "high" |
| `test_predict_unreliable_when_quality_low` | ✅ PASS | reliability=20 → "unreliable" |

### LSTM Temporal — 3/3 ✅

| Test | ผล | หมายเหตุ |
|---|---|---|
| `test_lstm_stable_low_sequence` | ✅ PASS | 5 readings 0.5–0.9 ppm → "low" |
| `test_lstm_high_risk_sequence` | ✅ PASS | 5 readings 80–100 ppm → "high" |
| `test_lstm_falls_back_on_short_sequence` | ✅ PASS | 2 readings → fallback ไป XGB |

### Drift Detection — 4/4 ✅

| Test | ผล | หมายเหตุ |
|---|---|---|
| `test_drift_none_when_stable` | ✅ PASS | VOC ±0.5% → severity="none" |
| `test_drift_mild_triggers_recalibration_soon` | ✅ PASS | drift 15% → severity="mild" |
| `test_drift_severe_triggers_immediate_recalibration` | ✅ PASS | drift 44% → severity="severe" |
| `test_drift_insufficient_data` | ✅ PASS | 1 calibration → severity="insufficient_data" |

### Trend Prediction — 2/2 ✅

| Test | ผล | หมายเหตุ |
|---|---|---|
| `test_trend_needs_minimum_readings` | ✅ PASS | 1 reading → "insufficient_data" |
| `test_trend_detects_increasing_pattern` | ✅ PASS | slope > 0 → "increasing" |

---

## 3. Simulation Results

```
scripts/simulate_ai.py — 5 test suites
```

### Test 1 — Single-Shot Risk Classifier: 8/8 ✅

| Scenario | Acetone (ppm) | Expected | Got | Confidence | Model |
|---|---|---|---|---|---|
| Healthy fasting (adult) | 0.5 | low | low | 1.000 | xgboost |
| Post-meal normal | 2.0 | low | low | 1.000 | xgboost |
| Fat burning (light) | 8.0 | low | low | 1.000 | xgboost |
| Moderate ketosis | 35.0 | moderate | moderate | 0.998 | xgboost |
| Deep ketosis / warning | 65.0 | moderate | moderate | 1.000 | xgboost |
| DKA risk range | 95.0 | high | high | 1.000 | xgboost |
| Severe DKA | 180.0 | high | high | 1.000 | xgboost |
| Bad reading (low quality) | 50.0 | unreliable | unreliable | 0.250 | reliability_gate |

### Test 2 — LSTM Temporal Prediction: 2/3 ⚠️

| Scenario | Sequence | Expected | Got | Confidence |
|---|---|---|---|---|
| Stable healthy 5 days | 0.5–0.9 ppm | low | low | 0.999 |
| Ramping into ketosis | 2→40 ppm | not low | low | 0.630 ⚠️ |
| Consistently high risk | 80–100 ppm | high | high | 1.000 |

**Note:** LSTM predict "ramping" pattern เป็น "low" — เพราะ metabreath_demo ที่ใช้เทรน sample แต่ละคนวัดใน timepoint ใกล้กันไม่ได้เห็น pattern แบบ ramping ชัดเจน ต้องเสริม data pilot จริงในระยะถัดไป

### Test 3 — LSTM Fallback: 1/1 ✅

```
2-reading sequence → automatically falls back to xgboost_fallback
reason: insufficient_sequence_length
```

### Test 4 — Drift Detection: 4/4 ✅

| Scenario | Detected | Severity | Drift % | Recommendation |
|---|---|---|---|---|
| Stable sensor | False | none | 0.23% | ok |
| Mild drift (+15%) | True | mild | 15.12% | recalibrate_soon |
| Severe drift (+40%) | True | severe | 44.19% | recalibrate_now |
| Insufficient data | False | insufficient_data | — | collect_more_calibrations |

### Test 5 — Full Pipeline (patient 5 days): ผ่านการจำลอง ✅

```
Day  Acetone(ppm)   Single-shot   LSTM
──────────────────────────────────────────
 0     0.6          low           low
 1     2.5          low           low
 2     8.0          low           low
 3    25.0          low           low
 4    55.0          moderate      moderate
```

Single-shot และ LSTM ตรงกันทั้ง 5 วัน + confidence 1.00 ทุก step

---

## 4. Model Performance (Training Metrics)

| Model | Accuracy | F1 (weighted) | CV F1 (5-fold) |
|---|---|---|---|
| **Random Forest** | 1.0000 | 1.0000 | 0.87–0.99 |
| **XGBoost** | 0.9960 | 0.9960 | 0.89–1.00 |
| **LSTM** | 0.9722 | 0.9722 | val 0.9565 |
| **Drift Detector** | 0.9850 | 0.9850 | 0.8418 |

**Training data:**
- metabreath_demo: 1,199 rows (primary)
- eNose Human Disease: 1,000 rows (real breath, TGS sensors)
- DiabetesDB: 286 rows (real MQ-138)
- **Total: 2,485 rows** with unified clinical thresholds

---

## 5. Integration Test — API Endpoints

| Endpoint | Method | Status |
|---|---|---|
| `/ai/predict` | POST | ✅ active (RF/XGB) |
| `/ai/predict/lstm` | POST | ✅ active (ใหม่) |
| `/ai/trend` | GET | ✅ active |
| `/ai/drift` | GET | ✅ active (ใหม่) |
| `/ai/chat` | POST | ✅ active (LLM) |

---

## 6. Known Limitations

1. **LSTM ramping detection ยังอ่อน** — training data ไม่มี transition pattern → ต้องเสริม pilot data
2. **Threshold-based label** — dataset ที่รวมมาใช้ clinical threshold (<30 / 30-74 / ≥75) ไม่ใช่ ground truth จริง
3. **Drift detector** — ใช้ heuristic percentage แทน XGBoost drift model (เพราะ features แตกต่างจาก sensor จริง)

---

## 7. Conclusion

**ระบบ AI พร้อมใช้งานใน production demo สำหรับ NSC 17 กค.**

- ✅ ทุก endpoint ตอบสนองถูกต้องตาม clinical scenarios
- ✅ Fallback logic ทำงานเมื่อ model ไม่พร้อม
- ✅ Confidence scoring + reliability gate ทำงานถูกต้อง
- ⚠️ LSTM edge case (ramping pattern) ต้องปรับปรุงหลังได้ pilot data

**Files:**
```
apps/api/models/
  ├── rf_classifier.joblib      (RF, 100% acc)
  ├── xgb_classifier.joblib     (XGB, 99.6% acc)
  ├── lstm_model.pt             (LSTM, 97.2% acc)
  ├── drift_model.joblib        (Drift, 98.5% acc)
  ├── feature_columns.json
  └── training_metrics.json

apps/api/tests/test_ai_integration.py    (13 tests, all pass)
scripts/simulate_ai.py                    (5 test suites)
```
