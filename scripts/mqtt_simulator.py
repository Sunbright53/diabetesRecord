#!/usr/bin/env python3
"""
Cheewarun — MQTT Simulator
Publishes fake breath VOC sensor readings every 5s to test the full pipeline
without physical hardware.

Usage:
  pip install paho-mqtt
  python scripts/mqtt_simulator.py
"""
import time, random, json, os
import paho.mqtt.client as mqtt

BROKER   = os.getenv("MQTT_HOST", "localhost")
PORT     = int(os.getenv("MQTT_PORT", "1893"))
USER     = os.getenv("MQTT_USER", "cheewarun_server")
PASS     = os.getenv("MQTT_PASS", "changeme")
TOPIC    = os.getenv("MQTT_TOPIC", "cheewarun/sensor/sim-device-01")
INTERVAL = int(os.getenv("INTERVAL", "5"))

def on_connect(client, userdata, flags, rc, properties=None):
    status = {0: "OK", 1: "Wrong protocol", 4: "Bad credentials", 5: "Not authorized"}
    print(f"[MQTT] Connected: {status.get(rc, rc)}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="simulator")
client.username_pw_set(USER, PASS)
client.on_connect = on_connect
client.connect(BROKER, PORT, 60)
client.loop_start()

print(f"[Sim] Publishing to {BROKER}:{PORT} → {TOPIC} every {INTERVAL}s")
print("[Sim] Ctrl-C to stop\n")

try:
    while True:
        payload = {
            "ts": time.time(),
            "voc_ppb": round(random.uniform(50, 800), 2),
            "ketone_mmol": round(random.uniform(0.1, 5.0), 2),
            "temp_c": round(random.uniform(35.5, 37.5), 1),
            "humidity_pct": round(random.uniform(60, 95), 1),
            "device_id": "sim-device-01",
        }
        client.publish(TOPIC, json.dumps(payload), qos=1)
        print(f"[Sim] {payload}")
        time.sleep(INTERVAL)
except KeyboardInterrupt:
    print("\n[Sim] Stopped")
    client.loop_stop()
