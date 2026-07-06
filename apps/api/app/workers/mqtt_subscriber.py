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

import asyncio_mqtt as aiomqtt
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

MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "api")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_TOPIC_PREFIX = os.getenv("MQTT_TOPIC_PREFIX", "metabreath")
SUBSCRIBE_TOPIC = f"{MQTT_TOPIC_PREFIX}/+/reading"

engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def process_reading(device_id_str: str, payload: dict):
    """Run signal processing pipeline and persist to TimescaleDB."""
    async with Session() as db:
        # Verify device exists and get calibration
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

        # Fetch latest calibration
        cal_result = await db.exec(
            select(DeviceCalibration)
            .where(DeviceCalibration.device_id == device_uuid)
            .order_by(DeviceCalibration.calibrated_at.desc())
        )
        calibration = cal_result.first()

        # Extract raw values from payload
        ambient = payload.get("ambient_voc", 0.0) or 0.0
        breath = payload.get("breath_voc", 0.0) or 0.0
        temp_c = payload.get("temperature")
        humidity = payload.get("humidity")
        pressure_mean = payload.get("pressure_mean")
        pressure_std = payload.get("pressure_std")
        breath_duration = payload.get("breath_duration")

        # Signal processing pipeline
        if calibration:
            breath_corrected = sp.baseline_subtract(
                breath, calibration.baseline_voc,
                calibration.gain_factor, calibration.offset
            )
        else:
            breath_corrected = breath - ambient

        breath_compensated = sp.env_compensate(breath_corrected, temp_c, humidity)
        acetone_delta = sp.pressure_normalize(breath_compensated, pressure_mean, breath_duration)

        q_score = sp.quality_score(
            ambient_voc=ambient,
            breath_voc=breath if breath > 0 else None,
            breath_duration=breath_duration,
            pressure_mean=pressure_mean,
            pressure_std=pressure_std,
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
        classification = sp.classify_acetone(acetone_delta, confidence)

        reading = SensorReading(
            time=datetime.utcnow(),
            device_id=device_uuid,
            ambient_voc=ambient,
            breath_voc=breath,
            acetone_delta=round(acetone_delta, 4),
            pressure_mean=pressure_mean,
            pressure_std=pressure_std,
            breath_duration=breath_duration,
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

        # Publish to WebSocket via Redis pub/sub
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
            ws_payload = json.dumps({
                "device_id": device_id_str,
                "time": reading.time.isoformat(),
                "acetone_delta": reading.acetone_delta,
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
            "device=%s acetone_delta=%.2f label=%s quality=%.0f",
            device_id_str[:8],
            acetone_delta,
            classification["label"],
            q_score,
        )


async def main():
    log.info("Starting MQTT subscriber → %s:%d topic=%s", MQTT_BROKER, MQTT_PORT, SUBSCRIBE_TOPIC)

    reconnect_delay = 5
    while True:
        try:
            async with aiomqtt.Client(
                hostname=MQTT_BROKER,
                port=MQTT_PORT,
                username=MQTT_USER,
                password=MQTT_PASSWORD,
                keepalive=60,
            ) as client:
                log.info("Connected to MQTT broker")
                reconnect_delay = 5  # reset on successful connection

                async with client.messages() as messages:
                    await client.subscribe(SUBSCRIBE_TOPIC, qos=1)
                    log.info("Subscribed to %s", SUBSCRIBE_TOPIC)

                    async for message in messages:
                        topic = str(message.topic)
                        # topic format: metabreath/<device_id>/reading
                        parts = topic.split("/")
                        if len(parts) != 3:
                            continue
                        device_id_str = parts[1]

                        try:
                            payload = json.loads(message.payload)
                        except json.JSONDecodeError:
                            log.warning("Invalid JSON from device %s: %s", device_id_str, message.payload[:100])
                            continue

                        try:
                            await process_reading(device_id_str, payload)
                        except Exception as e:
                            log.error("Error processing reading from %s: %s", device_id_str, e)

        except aiomqtt.MqttError as e:
            log.error("MQTT connection error: %s — reconnecting in %ds", e, reconnect_delay)
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, 60)
        except Exception as e:
            log.error("Unexpected error: %s", e)
            await asyncio.sleep(reconnect_delay)


def handle_shutdown(signum, frame):
    log.info("Received signal %d — shutting down", signum)
    raise SystemExit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)
    asyncio.run(main())
