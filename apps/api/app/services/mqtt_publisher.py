"""
One-shot MQTT publisher for device commands.

Reuses config from mqtt_subscriber.py env vars. Opens a short-lived
connection per publish — simple, no long-lived state to manage.
"""
import json
import logging
import os
from datetime import datetime, timezone
from uuid import uuid4

import aiomqtt

log = logging.getLogger("mqtt_publisher")

MQTT_BROKER = os.getenv("MQTT_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "api")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD") or os.getenv("MQTT_PASS", "")


async def publish_device_command(device_id: str, action: str) -> str:
    """
    Publish a command to metabreath/{device_id}/command.
    Returns the generated cmd_id for tracing.
    """
    cmd_id = str(uuid4())
    payload = {
        "action": action,
        "cmd_id": cmd_id,
        "issued_at": datetime.now(timezone.utc).isoformat(),
    }
    topic = f"metabreath/{device_id}/command"

    async with aiomqtt.Client(
        hostname=MQTT_BROKER,
        port=MQTT_PORT,
        username=MQTT_USER,
        password=MQTT_PASSWORD,
        identifier=f"api-cmd-{cmd_id[:8]}",
    ) as client:
        await client.publish(topic, json.dumps(payload).encode(), qos=1)

    log.info("Published cmd %s action=%s to device=%s", cmd_id, action, device_id[:8])
    return cmd_id
