#!/usr/bin/env python3
"""
MetaBreath — Serial Bridge
อ่านค่าเซ็นเซอร์จาก ESP32 ผ่าน USB serial แล้ว POST เข้า API โดยตรง
(ไม่ต้องผ่าน WiFi + MQTT)

ติดตั้ง:
  pip install pyserial requests

วิธีใช้:
  # 1. หา port ของ ESP32
  ls /dev/cu.*          # macOS
  ls /dev/ttyUSB*       # Linux

  # 2. ตั้ง env vars แล้วรัน
  export MB_PORT=/dev/cu.usbserial-0001
  export MB_USERNAME=pranai
  export MB_PASSWORD=yourpassword
  export MB_DEVICE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # optional, auto-detect ถ้าไม่ตั้ง
  python scripts/serial_bridge.py

  # บันทึก CSV เพิ่มด้วย:
  export MB_CSV=breath_data.csv
  python scripts/serial_bridge.py
"""

import os, re, sys, csv, time, json
from datetime import datetime, timezone
from pathlib import Path

try:
    import serial
except ImportError:
    sys.exit("ติดตั้ง pyserial ก่อน: pip install pyserial")

try:
    import requests
except ImportError:
    sys.exit("ติดตั้ง requests ก่อน: pip install requests")

# ─── Config from env ──────────────────────────────────────────────────────────
PORT      = os.getenv("MB_PORT", "")
BAUD      = int(os.getenv("MB_BAUD", "115200"))
API_URL   = os.getenv("MB_API_URL", "http://localhost:8010")
USERNAME  = os.getenv("MB_USERNAME", "")
PASSWORD  = os.getenv("MB_PASSWORD", "")
DEVICE_ID = os.getenv("MB_DEVICE_ID", "")
CSV_FILE  = os.getenv("MB_CSV", "")

# ─── Auth ─────────────────────────────────────────────────────────────────────

def get_token(username: str, password: str) -> str:
    r = requests.post(
        f"{API_URL}/login",
        json={"username": username, "password": password},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def get_first_device(token: str) -> str:
    r = requests.get(
        f"{API_URL}/sensor/devices",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    r.raise_for_status()
    devices = r.json()
    if not devices:
        sys.exit("ไม่พบ device ใน account — ลอง pair device ในเว็บก่อน")
    d = devices[0]
    print(f"[Device] ใช้: {d['id']} ({d['sensor_model']} / {d['kind']})")
    return d["id"]

# ─── Parsing serial output ────────────────────────────────────────────────────
# รูปแบบที่ firmware พิมพ์ออกมา:
#   Sensor Voltage     : 1.2345 V
#   Baseline Voltage   : 1.1000 V
#   Acetone Delta      : 134.50 mV
#   Pressure           : 2.345 kPa     ← บรรทัดแรกที่มี kPa
#   Temperature        : 36.50 C
#   Humidity           : 75.00 %

PATTERNS = {
    "sensor_voltage":   re.compile(r"Sensor Voltage\s*:\s*([\d.]+)\s*V"),
    "baseline_voltage": re.compile(r"Baseline Voltage\s*:\s*([\d.]+)\s*V"),
    "acetone_delta_mv": re.compile(r"Acetone Delta\s*:\s*([-\d.]+)\s*mV"),
    "pressure_kpa":     re.compile(r"^Pressure\s*:\s*([\d.]+)\s*kPa"),
    "temp_c":           re.compile(r"Temperature\s*:\s*([\d.]+)\s*C"),
    "humidity_pct":     re.compile(r"Humidity\s*:\s*([\d.]+)\s*%"),
    "reading_number":   re.compile(r"Reading No\.\s+(\d+)"),
}

def parse_line(line: str, current: dict) -> dict:
    for key, pat in PATTERNS.items():
        m = pat.search(line)
        if m:
            current[key] = float(m.group(1))
    return current

def reading_complete(d: dict) -> bool:
    required = {"sensor_voltage", "baseline_voltage", "acetone_delta_mv", "pressure_kpa"}
    return required.issubset(d.keys())

# ─── POST to API ──────────────────────────────────────────────────────────────

def post_reading(token: str, device_id: str, data: dict) -> bool:
    payload = {
        "time":             datetime.now(timezone.utc).isoformat(),
        "device_id":        device_id,
        "sensor_voltage":   data.get("sensor_voltage"),
        "baseline_voltage": data.get("baseline_voltage"),
        "acetone_delta_mv": data.get("acetone_delta_mv"),
        "pressure_kpa":     data.get("pressure_kpa"),
        "temperature":      data.get("temp_c"),
        "humidity":         data.get("humidity_pct"),
    }
    try:
        r = requests.post(
            f"{API_URL}/sensor/readings",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        r.raise_for_status()
        out = r.json()
        print(
            f"[API] Reading #{int(data.get('reading_number', 0)):>4} | "
            f"Δacetone={data.get('acetone_delta_mv', 0):.1f}mV | "
            f"P={data.get('pressure_kpa', 0):.2f}kPa | "
            f"label={out.get('label', '?')} | "
            f"risk={out.get('metabolic_risk_index', '?')}"
        )
        return True
    except requests.HTTPError as e:
        print(f"[API] Error {e.response.status_code}: {e.response.text[:120]}")
        return False
    except Exception as e:
        print(f"[API] Failed: {e}")
        return False

# ─── CSV logger ───────────────────────────────────────────────────────────────

CSV_COLS = [
    "timestamp", "reading_number",
    "sensor_voltage", "baseline_voltage", "acetone_delta_mv",
    "pressure_kpa", "temp_c", "humidity_pct",
]

def init_csv(path: str):
    p = Path(path)
    if not p.exists():
        with p.open("w", newline="") as f:
            csv.writer(f).writerow(CSV_COLS)
    return p

def append_csv(path: Path, data: dict):
    with path.open("a", newline="") as f:
        csv.writer(f).writerow([
            datetime.now(timezone.utc).isoformat(),
            int(data.get("reading_number", 0)),
            data.get("sensor_voltage", ""),
            data.get("baseline_voltage", ""),
            data.get("acetone_delta_mv", ""),
            data.get("pressure_kpa", ""),
            data.get("temp_c", ""),
            data.get("humidity_pct", ""),
        ])

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    if not PORT:
        print("ตั้งค่า port ก่อน:")
        print("  export MB_PORT=/dev/cu.usbserial-XXXX   # macOS")
        print("  export MB_PORT=/dev/ttyUSB0             # Linux")
        print("\nหา port ได้ด้วย:  ls /dev/cu.*  หรือ  ls /dev/ttyUSB*")
        sys.exit(1)

    if not USERNAME or not PASSWORD:
        print("ตั้งค่า username/password ก่อน:")
        print("  export MB_USERNAME=your_username")
        print("  export MB_PASSWORD=your_password")
        sys.exit(1)

    # Auth
    print(f"[Auth] กำลัง login เป็น {USERNAME}...")
    token = get_token(USERNAME, PASSWORD)
    print("[Auth] OK")

    # Device
    device_id = DEVICE_ID or get_first_device(token)

    # CSV
    csv_path = init_csv(CSV_FILE) if CSV_FILE else None
    if csv_path:
        print(f"[CSV] บันทึกที่ {csv_path}")

    # Serial
    print(f"\n[Serial] เปิด {PORT} @ {BAUD} baud...")
    try:
        ser = serial.Serial(PORT, BAUD, timeout=1)
    except serial.SerialException as e:
        sys.exit(f"[Serial] เปิดไม่ได้: {e}")
    print("[Serial] OK — รอข้อมูลจาก ESP32...\n")

    current: dict = {}
    token_refresh_at = time.time() + 3300  # refresh token ทุก 55 นาที

    try:
        while True:
            # Refresh token ก่อนหมดอายุ
            if time.time() > token_refresh_at:
                try:
                    token = get_token(USERNAME, PASSWORD)
                    token_refresh_at = time.time() + 3300
                    print("[Auth] Token refreshed")
                except Exception:
                    pass

            raw = ser.readline()
            if not raw:
                continue

            line = raw.decode("utf-8", errors="replace").rstrip()

            # เริ่ม reading ใหม่เมื่อเจอ "Reading No."
            if "Reading No." in line:
                current = {}

            parse_line(line, current)

            # ครบแล้ว → ส่ง
            if reading_complete(current):
                ok = post_reading(token, device_id, current)
                if csv_path:
                    append_csv(csv_path, current)
                current = {}

    except KeyboardInterrupt:
        print("\n[Bridge] หยุดแล้ว")
    finally:
        ser.close()


if __name__ == "__main__":
    main()
