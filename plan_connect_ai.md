# แผนเชื่อม AI ใหม่เข้าแอป + ทดสอบ
> สร้าง: 2026-07-11 | ก่อน NSC 17 กค.

---

## สภาพปัจจุบัน (ก่อนทำ)

```
แอปตอนนี้ใช้:                     เพิ่งเทรนมา:
──────────────────────────         ──────────────────────────
rf_classifier.joblib    ✅         rf_model.joblib      ❌ ยังไม่ต่อ
xgb_classifier.joblib   ✅         xgb_model.joblib     ❌ ยังไม่ต่อ
(ไม่มี LSTM)                       lstm_model.pt        ❌ ยังไม่ต่อ
(ไม่มี Drift)                      drift_model.joblib   ❌ ยังไม่ต่อ
```

### ปัญหาหลักที่ต้องแก้

model เก่า (rf_classifier) ใช้ **13 features** จาก sensor จริง:
```
acetone_delta, quality_score, reliability_score, ambient_voc,
pressure_mean, pressure_std, breath_duration, temperature,
humidity, environment_penalty, ketosis_index, metabolic_score,
fat_burning_index
```

model ใหม่ (rf_model) ใช้ **8 features** จาก mixed datasets:
```
f0–f7  ← normalize จาก eNose/DiabetesDB/Synthetic
       ← ไม่ตรงกับที่ sensor ส่งมา
```

→ **ต้อง retrain RF/XGB ใหม่** ให้ใช้ 13 features เดิม + data เพิ่ม  
→ **เพิ่ม LSTM** เข้า ml_inference.py (features ตรงอยู่แล้ว 8/13)  
→ **เพิ่ม Drift Detection** เป็น endpoint ใหม่

---

## แผนทำ 4 Phase

---

### Phase 1 — Retrain RF + XGB ด้วย features ถูกต้อง
> เป้า: แทนที่ rf_classifier.joblib + xgb_classifier.joblib ด้วย model ที่แม่นกว่าเดิม

**ทำอะไร:**
- เทรนด้วย metabreath_demo (1,199 rows) เหมือนเดิม แต่เพิ่ม data จาก:
  - eNose Human Disease → map TGS2602 → acetone_delta proxy
  - DiabetesDB → Acetona → acetone_delta proxy  
- ใช้ 13 features เดิม (ตาม feature_columns.json)
- บันทึกทับ `rf_classifier.joblib` และ `xgb_classifier.joblib`
- อัปเดต `training_metrics.json`

**ผลที่ได้:**
- แอปยังทำงานปกติ แต่ model แม่นขึ้น
- `/ai/predict` ยังใช้งานได้เหมือนเดิม

---

### Phase 2 — เพิ่ม LSTM เข้า ml_inference.py
> เป้า: เพิ่ม endpoint `/ai/predict/lstm` ที่ดู sequence 5 readings ย้อนหลัง

**ทำอะไร:**

**2A — เพิ่ม function ใน ml_inference.py:**
```python
# โหลด lstm_model.pt ตอนเริ่ม
_lstm_model = None

def predict_risk_lstm(sequence: list[dict]) -> dict:
    """
    sequence = list ของ 5 readings ล่าสุด
    แต่ละ reading มี: acetone_delta, quality_score, reliability_score,
                      ketosis_index, metabolic_score, pressure_mean,
                      temperature, humidity
    return: label, confidence, trend
    """
```

**2B — เพิ่ม endpoint ใน ai.py:**
```python
POST /ai/predict/lstm
  body: { device_id, readings: [...5 readings] }
  response: { label, confidence, model_used: "lstm", ... }
```

**2C — เพิ่ม sequence tracking:**
- ดึง 5 readings ล่าสุดจาก DB โดยอัตโนมัติ
- ถ้ามีน้อยกว่า 5 → fallback ไป XGBoost แทน

---

### Phase 3 — เพิ่ม Drift Detection
> เป้า: endpoint `/ai/drift` บอกว่า sensor เพี้ยนไหม

**ทำอะไร:**

**3A — เพิ่ม function ใน ml_inference.py:**
```python
def check_drift(calibration_history: list[dict]) -> dict:
    """
    รับ calibration history ของ device
    return: { drift_detected: bool, severity: str, confidence: float }
    """
```

**3B — เพิ่ม endpoint ใน ai.py:**
```python
GET /ai/drift?device_id=xxx
  response: {
    drift_detected: bool,
    severity: "none" | "mild" | "severe",
    confidence: float,
    recommendation: "ok" | "recalibrate" | "replace"
  }
```

---

### Phase 4 — ทดสอบและจำลอง
> เป้า: พิสูจน์ว่า AI ทำงานถูกต้องก่อนนำเสนอ NSC

**4A — Unit test แต่ละ model:**
```python
# test_ai_integration.py
def test_predict_risk_with_low_acetone()    # → label = "low"
def test_predict_risk_with_high_acetone()   # → label = "high"
def test_predict_lstm_sequence()            # → returns label
def test_drift_detected()                   # → drift_detected = True
def test_drift_not_detected()              # → drift_detected = False
def test_fallback_to_xgb_if_lstm_fails()   # → graceful fallback
```

**4B — Simulation script (จำลอง sensor จริง):**
```python
# simulate_sensor.py
# สร้าง readings จำลอง 10 ครั้ง แล้วเรียก API จริง
# แสดงผลว่า label เปลี่ยนอย่างไร

scenarios = [
    {"name": "healthy fasting",  "acetone": 0.5,  "expected": "low"},
    {"name": "fat burning",      "acetone": 3.0,  "expected": "moderate"},
    {"name": "deep ketosis",     "acetone": 15.0, "expected": "moderate"},
    {"name": "high risk / DKA",  "acetone": 85.0, "expected": "high"},
    {"name": "noisy / bad read", "quality_score": 20, "expected": "unreliable"},
]
```

**4C — ทดสอบ end-to-end:**
```
ESP32 → MQTT → API → ml_inference → label → แอป
                 ↑
          จำลองด้วย script ก่อน hardware จริงพร้อม
```

---

## Timeline

| วัน | Phase | งาน |
|---|---|---|
| 11 กค. (วันนี้) | Phase 1 | Retrain RF/XGB features ถูก → ทับ classifier เดิม |
| 12 กค. | Phase 2A–B | เพิ่ม LSTM ใน ml_inference + endpoint |
| 12 กค. | Phase 3 | เพิ่ม Drift Detection |
| 13 กค. | Phase 4A | เขียน unit tests |
| 13 กค. | Phase 4B–C | Simulation script + end-to-end test |
| 14 กค. | — | buffer / แก้ bug |
| 16 กค. | — | ใส่ผลทดสอบใน slide NSC |
| 17 กค. | — | นำเสนอ 🏆 |

---

## ผลที่จะได้หลังทำครบ

```
POST /ai/predict          ← RF/XGB (เหมือนเดิม แต่ model ดีขึ้น)
POST /ai/predict/lstm     ← LSTM (ใหม่ — ดู 5 readings ย้อนหลัง)
GET  /ai/trend            ← linear trend (เหมือนเดิม)
GET  /ai/drift            ← Drift Detection (ใหม่)
POST /ai/chat             ← LLM coach (เหมือนเดิม)
```

---

## ข้อสำคัญ

- Phase 1 และ 2 ทำพร้อมกันไม่ได้ — Phase 1 ต้องเสร็จก่อนเพราะ Phase 2 ใช้ feature space เดียวกัน
- ถ้า LSTM predict ช้าเกิน 200ms → fallback ไป XGBoost อัตโนมัติ
- Drift model ใช้ข้อมูล calibration history ไม่ใช่ real-time sensor → ต้องมี calibration records ใน DB ก่อน
