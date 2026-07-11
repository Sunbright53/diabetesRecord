# แผนการทำ Reset WiFi ของ ESP32 ผ่านเว็บแอป (MQTT-based)

## เป้าหมาย

ให้ user สามารถกดปุ่มบนหน้า Device ในเว็บ MetaBreath เพื่อสั่งให้ ESP32 ล้าง WiFi credentials ที่บันทึกไว้ในตัวเอง (NVS flash) แล้วกลับไปเป็น AP mode (`MetaBreath-Setup-XXXX`) เพื่อให้ตั้งค่า WiFi ใหม่ได้ — โดยไม่ต้อง flash firmware ใหม่ ไม่ต้องเปิด Arduino IDE

---

## ทำไมเลือกแนวทาง MQTT command (ไม่ใช่ Web server บน ESP32)

| ประเด็น | Web server บน ESP32 | MQTT command (เลือกแนวนี้) |
|---|---|---|
| ต้องอยู่ WiFi เดียวกัน? | ✅ ต้อง | ❌ ไม่ต้อง — ใช้ที่ไหนก็ได้ |
| ต้องเพิ่ม mDNS + web server ใน firmware | ✅ ต้อง (~80 บรรทัด) | ❌ ไม่ต้อง — reuse MQTT client เดิม |
| ต้องเพิ่ม authentication แยก | ✅ ต้อง | ❌ ไม่ต้อง — auth ผ่าน API เดิม |
| Backend infra ต้องเพิ่ม | ❌ ไม่ต้อง | ✅ MQTT publisher (เล็กมาก) |
| ทำงานตอน ESP32 offline | ❌ ไม่ได้ | ❌ ไม่ได้ (broker queue command ให้ได้ถ้าใช้ QoS 1 + retained) |

**สรุป**: MQTT ชนะทั้งด้าน UX และการ implement — โครงสร้าง ESP32↔broker↔API มีอยู่แล้ว แค่เพิ่มทิศทางย้อนกลับ

---

## Architecture Diagram

```
┌─────────────┐   POST /devices/{id}/reset-wifi   ┌─────────────┐
│  Web app    │──────────────────────────────────▶│   API       │
│  (Next.js)  │◀── 202 Accepted ──────────────────│  (FastAPI)  │
└─────────────┘                                    └──────┬──────┘
                                                          │ publish
                                                          ▼
                                                   ┌─────────────┐
                                                   │ MQTT broker │
                                                   │ (Mosquitto) │
                                                   └──────┬──────┘
                                                          │ subscribe:
                                                          │ metabreath/{id}/command
                                                          ▼
                                                   ┌─────────────┐
                                                   │   ESP32     │
                                                   │             │
                                                   │ handle → 　  │
                                                   │ resetSettings│
                                                   │ + restart   │
                                                   └─────────────┘
```

---

## MQTT Topic Design

| Topic | ทิศทาง | QoS | Retained | Payload |
|---|---|---|---|---|
| `metabreath/{deviceId}/reading` | ESP32 → server (existing) | 1 | ❌ | sensor JSON |
| `metabreath/{deviceId}/command` | server → ESP32 (**new**) | 1 | ❌ | `{"action": "reset_wifi", "cmd_id": "<uuid>"}` |
| `metabreath/{deviceId}/ack` | ESP32 → server (**new, optional**) | 1 | ❌ | `{"cmd_id": "<uuid>", "status": "received"}` |

**หมายเหตุเรื่อง retained**:
- ❌ ไม่ใช้ retained สำหรับ `command` — ถ้าใช้ retained แปลว่า ESP32 ที่บูตขึ้นมาใหม่ทีหลังจะได้รับ command เดิมซ้ำ ซึ่งไม่ต้องการ
- ควรใช้ QoS 1 พอ ให้แน่ใจว่า command ถึงตัว device (broker จะ queue ให้ระหว่าง disconnect ถ้าใช้ persistent session)

**Payload format**:
```json
{
  "action": "reset_wifi",
  "cmd_id": "8f3e2b1a-...",
  "issued_at": "2026-07-10T12:34:56Z"
}
```

`cmd_id` — server-generated UUID ทำหน้าที่ 3 อย่าง:
1. Idempotency — ESP32 ไม่ execute ซ้ำถ้าเห็น cmd_id เดิม (กัน replay)
2. Correlation — ผูก ack กลับกับ request ต้นทาง
3. Debug tracing — log ตรงกันทุก layer

---

## 1. Firmware (`apps/firmware/metabreath/metabreath.ino`)

### สิ่งที่ต้องเพิ่ม

**1.1 Command topic + last cmd_id storage**

```cpp
char mqttCommandTopic[128];
char lastCmdId[40] = "";  // เก็บใน Preferences (NVS) ป้องกัน replay หลัง reboot
```

**1.2 ตอน connect MQTT — subscribe เพิ่ม**

ใน `connectMQTT()`:
```cpp
snprintf(mqttCommandTopic, sizeof(mqttCommandTopic),
         "metabreath/%s/command", deviceId);
mqttClient.subscribe(mqttCommandTopic, 1);  // QoS 1
```

**1.3 ตอน setup MQTT — ต่อ callback**

ใน `setup()` ก่อน `connectMQTT()`:
```cpp
mqttClient.setCallback(handleMqttMessage);
```

**1.4 Callback handler**

```cpp
void handleMqttMessage(char* topic, byte* payload, unsigned int len) {
  if (strcmp(topic, mqttCommandTopic) != 0) return;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, len);
  if (err) {
    Serial.printf("[CMD] JSON parse error: %s\n", err.c_str());
    return;
  }

  const char* action = doc["action"] | "";
  const char* cmdId  = doc["cmd_id"] | "";

  if (strlen(cmdId) == 0 || strcmp(cmdId, lastCmdId) == 0) {
    Serial.println("[CMD] duplicate or missing cmd_id — ignoring");
    return;
  }

  // Persist cmd_id ก่อนดำเนินการ (idempotency)
  strncpy(lastCmdId, cmdId, sizeof(lastCmdId) - 1);
  prefs.begin("metabreath", false);
  prefs.putString("lastCmdId", lastCmdId);
  prefs.end();

  Serial.printf("[CMD] received action=%s cmd_id=%s\n", action, cmdId);

  if (strcmp(action, "reset_wifi") == 0) {
    handleResetWifi();
  } else {
    Serial.printf("[CMD] unknown action: %s\n", action);
  }
}
```

**1.5 Reset handler**

```cpp
void handleResetWifi() {
  Serial.println("[CMD] Resetting WiFi credentials — device will restart");

  // Blink LED เพื่อ feedback ก่อนรีเซ็ต
  for (int i = 0; i < 6; i++) {
    ledOn();  delay(100);
    ledOff(); delay(100);
  }

  WiFiManager wm;
  wm.resetSettings();

  // ลบ lastCmdId ด้วย — session ใหม่หลังตั้งค่า WiFi
  prefs.begin("metabreath", false);
  prefs.clear();
  prefs.end();

  delay(500);
  ESP.restart();
}
```

**1.6 Load lastCmdId ตอน boot**

ใน `setup()` หลัง Serial.begin:
```cpp
prefs.begin("metabreath", true);
String saved = prefs.getString("lastCmdId", "");
saved.toCharArray(lastCmdId, sizeof(lastCmdId));
prefs.end();
```

**1.7 อัพเดต MQTT buffer size (ถ้าจำเป็น)**

`mqttClient.setBufferSize(512)` — พอสำหรับ command payload (~200 bytes)

### สิ่งที่ **ไม่** ต้องเปลี่ยน

- Loop logic, sensor reading, publish logic — คงเดิมหมด
- Publish rate — คงเดิม
- WiFi/MQTT reconnect logic — คงเดิม

---

## 2. API (`apps/api/app/`)

### 2.1 เพิ่ม MQTT publisher helper

**ไฟล์ใหม่**: `apps/api/app/services/mqtt_publisher.py`

```python
"""
One-shot MQTT publisher for device commands.

Reuses config from mqtt_subscriber.py env vars. Opens a short-lived
connection per publish — simple, no long-lived state to manage.
For bursty workloads later, replace with a pooled publisher.
"""
import json
import logging
import os
from uuid import uuid4
from datetime import datetime, timezone

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
```

### 2.2 เพิ่ม endpoint ใน `sensor.py`

**เพิ่มหลัง `list_devices` (บรรทัด ~160)**:

```python
@router.post("/device/{device_id}/reset-wifi", status_code=202)
async def reset_device_wifi(
    device_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send WiFi reset command to device via MQTT.
    Device will erase saved credentials, restart, and re-enter AP mode.
    """
    # Verify user owns the device
    result = await db.exec(
        select(Device).where(Device.id == device_id, Device.owner_id == user.id)
    )
    device = result.first()
    if not device:
        raise HTTPException(404, "Device not found or not owned by user")

    # Device must have MQTT topic (MAC-based devices)
    if not device.mqtt_topic:
        raise HTTPException(400, "Device does not support remote commands")

    # Extract MAC from mqtt_topic: metabreath/{MAC}/reading
    mac = device.mqtt_topic.split("/")[1]

    from app.services.mqtt_publisher import publish_device_command
    cmd_id = await publish_device_command(mac, "reset_wifi")

    return {"cmd_id": cmd_id, "status": "sent"}
```

### 2.3 (Optional) ACK subscription ใน mqtt_subscriber.py

ถ้าอยาก track ว่า device ได้รับ command จริงไหม → เพิ่ม subscribe `metabreath/+/ack` แล้ว log
(ระยะแรก skip ก่อน — ไม่จำเป็นสำหรับ MVP)

---

## 3. Web app (`apps/web/src/app/(app)/me/device/page.tsx`)

### 3.1 เพิ่ม API client method

**ไฟล์**: `apps/web/src/lib/api.ts` (หรือที่ `api.sensor.*` อยู่)

```typescript
sensor: {
  // ... existing methods
  resetWifi: (deviceId: string) =>
    apiFetch<{ cmd_id: string; status: string }>(
      `/sensor/device/${deviceId}/reset-wifi`,
      { method: "POST" }
    ),
}
```

### 3.2 เพิ่ม state + handler ในหน้า Device

```tsx
const [resetOpen, setResetOpen] = useState(false);
const [resetPending, setResetPending] = useState(false);

async function handleResetWifi() {
  if (!device) return;
  setResetPending(true);
  try {
    await api.sensor.resetWifi(device.id);
    toast.success("ส่งคำสั่งรีเซ็ตแล้ว — รอ ~5 วินาที อุปกรณ์จะรีสตาร์ท");
    setResetOpen(false);
  } catch (e) {
    toast.error("ส่งคำสั่งไม่สำเร็จ ลองอีกครั้ง");
  } finally {
    setResetPending(false);
  }
}
```

### 3.3 เพิ่ม Menu item

ในลิสต์ `MENU_ITEMS` (บรรทัด 23–31) เพิ่ม:

```tsx
{ icon: RefreshCw, label: "รีเซ็ต WiFi ของอุปกรณ์", danger: true,
  onClick: () => setResetOpen(true) },
```

*(อาจต้องปรับ structure ของ MENU_ITEMS เพื่อรองรับ `onClick` แทน `href` — ทำ union type)*

### 3.4 เพิ่ม Confirmation modal

```tsx
{resetOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div className="bg-bg-elevated rounded-2xl p-5 max-w-sm w-full space-y-4">
      <h2 className="text-lg font-bold text-text-primary">
        รีเซ็ต WiFi ของอุปกรณ์?
      </h2>
      <p className="text-sm text-text-muted leading-relaxed">
        อุปกรณ์จะลืมรหัส WiFi ที่บันทึกไว้ และรีสตาร์ทเข้าโหมด setup
        ({<code className="text-blue-300">MetaBreath-Setup-XXXX</code>})
        <br />
        คุณจะต้องตั้งค่า WiFi ใหม่ผ่านโทรศัพท์/คอมพิวเตอร์
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => setResetOpen(false)}
          disabled={resetPending}
          className="flex-1 bg-bg-raised text-text-primary rounded-full py-2.5 text-sm"
        >
          ยกเลิก
        </button>
        <button
          onClick={handleResetWifi}
          disabled={resetPending}
          className="flex-1 bg-red-500 text-white rounded-full py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {resetPending ? "กำลังส่ง..." : "รีเซ็ต"}
        </button>
      </div>
    </div>
  </div>
)}
```

---

## Security Considerations

| ประเด็น | มาตรการ |
|---|---|
| ป้องกัน user รีเซ็ต device คนอื่น | Check `device.owner_id == user.id` ใน endpoint |
| ป้องกันคน publish MQTT command ตรงๆ | Mosquitto ACL: จำกัด user `esp32` publish/subscribe ได้เฉพาะ own topic; user `api` publish `command` ได้อย่างเดียว |
| Replay attack | `cmd_id` UUID + firmware idempotency check |
| Rate limit | เพิ่ม rate limit ที่ endpoint (เช่น max 5 reset/user/hour) เพื่อกันการโดน abuse |
| Log audit trail | เพิ่ม `DeviceCommand` table (device_id, user_id, action, cmd_id, issued_at) — optional Phase 2 |

---

## Testing Plan

### Firmware (unit-level, manual)
- [ ] Flash firmware → publish command ผ่าน `mosquitto_pub` → ESP32 รีเซ็ต + บูตเป็น AP
- [ ] ส่ง command ที่ cmd_id เดิมซ้ำ → ESP32 ignore (log แสดง "duplicate")
- [ ] ส่ง action ที่ไม่รู้จัก → ESP32 ignore + log warning
- [ ] Restart ESP32 → publish command เดิมอีกครั้ง → ต้อง ignore (persisted lastCmdId)

### API
- [ ] `POST /sensor/device/{id}/reset-wifi` โดย user เจ้าของ → 202 + cmd_id
- [ ] เดียวกันโดย user อื่น → 404
- [ ] Device ที่ไม่มี mqtt_topic → 400
- [ ] MQTT broker down → ควร return 5xx ไม่ hang

### End-to-end
- [ ] กดปุ่มบนเว็บ → dialog แสดง → confirm → toast success
- [ ] ~5 วินาที device offline → หน้า Device เปลี่ยนเป็น `waiting` state (มีอยู่แล้ว)
- [ ] เห็น `MetaBreath-Setup-XXXX` ใน WiFi list
- [ ] Setup WiFi ใหม่ → device online กลับมา → มี reading ใหม่เข้ามา

---

## Rollout Order

1. **Firmware** — แก้ + flash เข้า ESP32 ที่มีอยู่ก่อน ทดสอบด้วย `mosquitto_pub` จาก terminal
2. **MQTT publisher service** — เพิ่มไฟล์ + unit test simple
3. **API endpoint** — เพิ่ม route + test ด้วย curl/postman
4. **Web UI** — เพิ่มปุ่ม + dialog + hook API
5. **E2E test** — วนทดสอบทั้ง flow

**ไม่ควร merge จนกว่าทุกขั้นตอนจะเทสผ่าน** เพราะถ้า firmware ไม่ subscribe → API ส่งไปก็ไม่เกิดอะไร (silent failure)

---

## Extensions ต่อยอด (Phase 2+)

- **Reboot command** — action `reboot` เพิ่มใน handler เดียวกัน
- **Recalibrate command** — action `recalibrate_baseline` → ESP32 ทำ TGS baseline ใหม่
- **OTA update trigger** — action `ota_update` → ESP32 ดาวน์โหลด firmware ใหม่
- **Command audit log** — DeviceCommand table + admin view
- **Ack tracking** — subscribe `metabreath/+/ack` → เก็บสถานะว่า command reached device จริงไหม → แสดงใน UI

---

## Files ที่ต้องแก้/สร้าง

| File | Action | Est. LOC |
|---|---|---|
| `apps/firmware/metabreath/metabreath.ino` | Modify — เพิ่ม callback + reset handler + subscribe | +60 |
| `apps/api/app/services/mqtt_publisher.py` | **New** | +40 |
| `apps/api/app/routers/sensor.py` | Modify — เพิ่ม endpoint | +25 |
| `apps/web/src/lib/api.ts` | Modify — เพิ่ม client method | +5 |
| `apps/web/src/app/(app)/me/device/page.tsx` | Modify — ปุ่ม + modal | +50 |

**รวม ~180 บรรทัด** กระจายใน 5 ไฟล์
