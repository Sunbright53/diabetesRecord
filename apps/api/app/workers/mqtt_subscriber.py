"""
MetaBreath MQTT Subscriber

Runs as a standalone asyncio process (not Celery).
Subscribes to metabreath/+/reading, processes each ESP32 payload
through the signal_processing pipeline, and stores results in TimescaleDB.

Run: python -m app.workers.mqtt_subscriber
Or via docker-compose service: mqtt-sub
"""
import asyncio
import json
import logging
import os
import signal
from datetime import datetime
from pathlib import Path

import aiomqtt
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from app.core.config import settings
from app.models.health import Device, SensorReading, DeviceCalibration
from app.services import signal_processing as sp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [mqtt-sub] %(levelname)s %(message)s",
)
log = logging.getLogger("mqtt_subscriber")

MQTT_BROKER = os.getenv("MQTT_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "api")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD") or os.getenv("MQTT_PASS", "")
MQTT_TOPIC_PREFIX = os.getenv("MQTT_TOPIC_PREFIX", "metabreath")
SUBSCRIBE_TOPIC = f"{MQTT_TOPIC_PREFIX}/+/reading"

HEARTBEAT_FILE = Path("/tmp/mqtt-sub.heartbeat")

engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _touch_heartbeat() -> None:
    try:
        HEARTBEAT_FILE.touch(exist_ok=True)
    except OSError:
        pass


async def process_reading(device_id_str: str, payload: dict):
    """Run signal processing pipeline and persist to TimescaleDB."""
    async with Session() as db:
        try:
            from uuid import UUID
            device_uuid = UUID(device_id_str)
        except ValueError:
            log.warning("Invalid device_id in topic: %s", device_id_str)
            return

        device_result = await db.exec(
            select(Device).where(Device.id == device_uuid, Device.active == True)
        )
        device = device_result.first()
        if not device:
            log.warning("Unknown or inactive device: %s — skipping", device_id_str)
            return

        cal_result = await db.exec(
            select(DeviceCalibration)
            .where(DeviceCalibration.device_id == device_uuid)
            .order_by(DeviceCalibration.calibrated_at.desc())
        )
        calibration = cal_result.first()

        # Firmware payload (metabreath.ino):
        #   sensor_voltage    (V)  — TGS1820 direct reading
        #   baseline_voltage  (V)  — TGS1820 calibrated in clean air at boot
        #   acetone_delta_mv  (mV) — (sensor - baseline) * 1000, computed on-chip
        #   pressure_kpa      (kPa) — XGZP6847A breath differential pressure (0–10 kPa)
        #   temperature       (°C) — SHT31
        #   humidity          (%)  — SHT31
        sensor_voltage    = payload.get("sensor_voltage")
        baseline_voltage  = payload.get("baseline_voltage")
        pressure_kpa      = payload.get("pressure_kpa")
        temp_c            = payload.get("temperature")
        humidity          = payload.get("humidity")

        # Prefer server-calibrated baseline when available (overrides on-chip baseline)
        if calibration and calibration.baseline_voc:
            effective_baseline = calibration.baseline_voc
        else:
            effective_baseline = baseline_voltage

        if sensor_voltage is not None and effective_baseline is not None:
            acetone_delta_mv = (sensor_voltage - effective_baseline) * 1000.0
        else:
            acetone_delta_mv = payload.get("acetone_delta_mv") or 0.0

        q_score = sp.quality_score(
            sensor_voltage=sensor_voltage,
            baseline_voltage=effective_baseline,
            pressure_kpa=pressure_kpa,
            temp_c=temp_c,
            humidity_pct=humidity,
        )

        cal_age_days = 0.0
        if calibration:
            cal_age_days = (datetime.utcnow() - calibration.calibrated_at).total_seconds() / 86400
        r_score = sp.reliability_score(
            q_score,
            calibration.drift_score if calibration else 0.0,
            cal_age_days,
        )

        env_pen = sp.environment_penalty(temp_c, humidity)
        confidence = r_score / 100.0
        classification = sp.classify_acetone(acetone_delta_mv, confidence)

        # NOTE: acetone_delta is stored in **millivolts** (voltage delta from baseline),
        #       aligned with firmware `classifyAcetone(delta_mV)` semantics.
        #       ambient_voc = baseline_voltage (V), breath_voc = sensor_voltage (V),
        #       pressure_mean = pressure_kpa (kPa) — reused legacy columns to avoid migration.
        reading = SensorReading(
            time=datetime.utcnow(),
            device_id=device_uuid,
            ambient_voc=baseline_voltage,
            breath_voc=sensor_voltage,
            acetone_delta=round(acetone_delta_mv, 4),
            pressure_mean=pressure_kpa,
            pressure_std=None,
            breath_duration=None,
            temp_c=temp_c,
            humidity_pct=humidity,
            quality_score=round(q_score, 2),
            reliability_score=round(r_score, 2),
            environment_penalty=env_pen,
            metabolic_risk_index=classification["metabolic_risk_index"],
            confidence_score=round(confidence, 4),
            label=classification["label"],
            raw=payload,
        )
        db.add(reading)

        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
            ws_payload = json.dumps({
                "device_id": device_id_str,
                "time": reading.time.isoformat(),
                "acetone_delta_mv": reading.acetone_delta,
                "sensor_voltage": sensor_voltage,
                "baseline_voltage": effective_baseline,
                "pressure_kpa": pressure_kpa,
                "temperature": temp_c,
                "humidity": humidity,
                "label": reading.label,
                "quality_score": reading.quality_score,
                "confidence_score": reading.confidence_score,
            })
            await r.publish(f"readings:{device.user_id}", ws_payload)
            await r.aclose()
        except Exception as e:
            log.debug("Redis publish failed (non-critical): %s", e)

        await db.commit()

        log.info(
            "device=%s Δ=%.1f mV label=%s p=%.2f kPa T=%s H=%s q=%.0f",
            device_id_str[:8],
            acetone_delta_mv,
            classification["label"],
            pressure_kpa or 0.0,
            "-" if temp_c is None else f"{temp_c:.1f}°C",
            "-" if humidity is None else f"{humidity:.0f}%",
            q_score,
        )


async def _heartbeat_loop(stop_event: asyncio.Event):
    """Update heartbeat file every 10s while broker is connected."""
    while not stop_event.is_set():
        _touch_heartbeat()
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=10)
        except asyncio.TimeoutError:
            pass


async def main():
    log.info("Starting MQTT subscriber → %s:%d topic=%s user=%s",
             MQTT_BROKER, MQTT_PORT, SUBSCRIBE_TOPIC, MQTT_USER)

    reconnect_delay = 5
    while True:
        stop_event = asyncio.Event()
        heartbeat_task = None
        try:
            async with aiomqtt.Client(
                hostname=MQTT_BROKER,
                port=MQTT_PORT,
                username=MQTT_USER,
                password=MQTT_PASSWORD,
                keepalive=60,
                identifier=f"cheewarun-mqtt-sub-{os.getpid()}",
            ) as client:
                log.info("Connected to MQTT broker")
                reconnect_delay = 5
                _touch_heartbeat()
                heartbeat_task = asyncio.create_task(_heartbeat_loop(stop_event))

                await client.subscribe(SUBSCRIBE_TOPIC, qos=1)
                log.info("Subscribed to %s", SUBSCRIBE_TOPIC)

                async for message in client.messages:
                    topic = str(message.topic)
                    parts = topic.split("/")
                    if len(parts) != 3:
                        continue
                    device_id_str = parts[1]

                    try:
                        payload = json.loads(message.payload)
                    except json.JSONDecodeError:
                        log.warning("Invalid JSON from %s: %s",
                                    device_id_str, bytes(message.payload)[:100])
                        continue

                    try:
                        await process_reading(device_id_str, payload)
                    except Exception as e:
                        log.error("Error processing reading from %s: %s", device_id_str, e)

        except aiomqtt.MqttError as e:
            log.error("MQTT error: %s — reconnecting in %ds", e, reconnect_delay)
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 60)
        except Exception as e:
            log.error("Unexpected error: %s", e)
            await asyncio.sleep(reconnect_delay)
        finally:
            stop_event.set()
            if heartbeat_task:
                try:
                    await heartbeat_task
                except Exception:
                    pass


def handle_shutdown(signum, frame):
    log.info("Received signal %d — shutting down", signum)
    raise SystemExit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)
    asyncio.run(main())
