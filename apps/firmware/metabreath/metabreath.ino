// =====================================================
// MetaBreath Firmware v2 — WiFiManager Edition
// =====================================================
// Libraries ที่ต้องติดตั้งใน Arduino Library Manager:
//   - WiFiManager by tzapu (>= 2.0.17)
//   - PubSubClient by Nick O'Leary
//   - ArduinoJson by Benoit Blanchon
// (Wire, WiFi, Preferences มากับ ESP32 core อยู่แล้ว)
//
// ── Device ID = MAC address ของตัวเอง (ไม่ต้องตั้งค่าใดๆ) ──
//   MQTT topic: metabreath/<MAC_NO_COLONS>/reading
//   เช่น MAC 88:F1:55:30:28:10 → metabreath/88F155302810/reading
//
// ── วิธี user ตั้งค่า WiFi (ครั้งแรก หรือเปลี่ยน WiFi) ──
//   1. เสียบไฟ → รอ MetaBreath-Setup-XXXX ปรากฏใน WiFi list
//   2. เชื่อม MetaBreath-Setup-XXXX → เปิด 192.168.4.1
//   3. เลือก WiFi บ้าน → กรอกรหัส → Save → เสร็จ
//
// ── รีเซ็ต WiFi จากระยะไกล (ผ่านเว็บแอป) ──
//   Subscribe: metabreath/<MAC>/command
//   Payload:   {"action": "reset_wifi", "cmd_id": "<uuid>"}
// =====================================================
#include <Wire.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// =====================================================
// MQTT SERVER
// =====================================================
#define MQTT_BROKER  "metabreath.duckdns.org"
#define MQTT_PORT    1883
#define MQTT_USER    "esp32"
#define MQTT_PASS    "0511182c23b48b7a07c274c2"

// =====================================================
// PIN CONFIG
// =====================================================
#define TGS1820_PIN  34
#define PRESSURE_PIN 32
#define SDA_PIN      21
#define SCL_PIN      22
#define LED_PIN      2

// =====================================================
// SHT31 CONFIG
// =====================================================
#define SHT31_ADDRESS 0x44

// =====================================================
// TGS1820 CONFIG
// =====================================================
const int TGS_SAMPLE_COUNT = 50;   // 100→50 for faster loop (~250ms savings)
const int BASELINE_SECONDS = 10;
float tgsBaselineVoltage   = 0.0;

// =====================================================
// XGZP6847A PRESSURE CONFIG
// =====================================================
float PRESSURE_MIN_KPA      = 0.0;
float PRESSURE_MAX_KPA      = 10.0;
float ADC_MAX               = 4095.0;
float ESP32_ADC_VOLTAGE     = 3.3;
float SENSOR_SUPPLY_VOLTAGE = 3.3;
float SENSOR_MIN_RATIO      = 0.10;
float SENSOR_MAX_RATIO      = 0.90;

int readingNumber = 1;

// =====================================================
// NETWORK GLOBALS
// =====================================================
WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);
Preferences  prefs;

char mqttTopic[128];
char mqttCommandTopic[128];
char mqttClientId[64];
char deviceId[20] = "";   // MAC address ไม่มี colon เช่น 88F155302810
char lastCmdId[40] = "";  // idempotency: กัน replay command เดิมซ้ำ

bool mqttEnabled = false;

// =====================================================
// LED
// =====================================================
void ledOn()  { digitalWrite(LED_PIN, HIGH); }
void ledOff() { digitalWrite(LED_PIN, LOW);  }

// =====================================================
// FORWARD DECLARATIONS
// =====================================================
void handleMqttMessage(char* topic, byte* payload, unsigned int len);
void handleResetWifi();
void connectMQTT();
void ensureNetwork();

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_PIN, OUTPUT);
  ledOff();

  analogReadResolution(12);
  analogSetPinAttenuation(TGS1820_PIN, ADC_11db);
  analogSetPinAttenuation(PRESSURE_PIN, ADC_11db);
  Wire.begin(SDA_PIN, SCL_PIN);

  Serial.println();
  Serial.println("==============================================");
  Serial.println("        MetaBreath Sensor System v2");
  Serial.println("        TGS1820 + XGZP6847A + SHT31");
  Serial.println("==============================================");
  Serial.println();

  // --------------------------------------------------
  // Load persisted lastCmdId (idempotency across reboots)
  // --------------------------------------------------
  prefs.begin("metabreath", true);
  String saved = prefs.getString("lastCmdId", "");
  saved.toCharArray(lastCmdId, sizeof(lastCmdId));
  prefs.end();

  // --------------------------------------------------
  // Device ID = MAC address (ไม่ต้องตั้งค่า ได้จากฮาร์ดแวร์เลย)
  // getEfuseMac() อ่าน MAC จาก eFuse โดยตรง ไม่ต้องรอ WiFi init
  // bytes เก็บแบบ little-endian: bit[7:0] = mac[0] (byte แรกของ MAC)
  // --------------------------------------------------
  {
    uint64_t chipid = ESP.getEfuseMac();
    snprintf(deviceId, sizeof(deviceId), "%02X%02X%02X%02X%02X%02X",
             (uint8_t)(chipid),
             (uint8_t)(chipid >> 8),
             (uint8_t)(chipid >> 16),
             (uint8_t)(chipid >> 24),
             (uint8_t)(chipid >> 32),
             (uint8_t)(chipid >> 40));
  }
  Serial.print("[Config] Device ID (MAC): ");
  Serial.println(deviceId);

  // --------------------------------------------------
  // Calibrate TGS1820
  // --------------------------------------------------
  Serial.println("Calibrating TGS1820 baseline...");
  tgsBaselineVoltage = calibrateTGSBaseline();
  Serial.print("TGS1820 Baseline Voltage: ");
  Serial.print(tgsBaselineVoltage, 4);
  Serial.println(" V");

  // --------------------------------------------------
  // WiFiManager — portal แสดงแค่ WiFi เท่านั้น
  // ไม่มีช่อง UUID — user ไม่ต้องรู้จัก UUID
  // --------------------------------------------------
  WiFiManager wm;
  wm.setConnectTimeout(30);
  wm.setConfigPortalTimeout(300);

  String apName = "MetaBreath-Setup-" + String(deviceId).substring(8);

  wm.setTitle("MetaBreath");
  wm.setCustomHeadElement(
    "<style>"
      "body{font-family:sans-serif;background:#f0f9ff;margin:0;padding:16px}"
      ".wrap{background:#fff;border-radius:12px;padding:20px;max-width:400px;margin:auto}"
      "h1{color:#0891b2;font-size:1.2em}"
      "input{border-radius:8px!important;font-size:1em}"
      "input[type=submit]{background:#0891b2!important;color:#fff!important;"
        "border:none!important;border-radius:8px!important;padding:14px!important;"
        "font-size:1.1em!important;width:100%!important}"
    "</style>"
  );
  wm.setCustomMenuHTML(
    "<p style='color:#64748b;font-size:1em;margin-bottom:20px;text-align:center'>"
      "เลือก WiFi ที่บ้าน<br>แล้วกรอกรหัสผ่าน"
    "</p>"
  );

  Serial.println();
  Serial.print("[WiFi] AP: ");
  Serial.println(apName);

  bool connected = wm.autoConnect(apName.c_str());

  if (!connected) {
    Serial.println("[WiFi] Portal timeout — restarting");
    delay(1000);
    ESP.restart();
  }

  Serial.print("[WiFi] Connected: ");
  Serial.println(WiFi.localIP());
  ledOn();

  // --------------------------------------------------
  // MQTT — ใช้ MAC เป็น topic เสมอ
  // --------------------------------------------------
  snprintf(mqttTopic,        sizeof(mqttTopic),        "metabreath/%s/reading", deviceId);
  snprintf(mqttCommandTopic, sizeof(mqttCommandTopic), "metabreath/%s/command", deviceId);
  snprintf(mqttClientId,     sizeof(mqttClientId),     "metabreath-%s",         deviceId);
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(512);
  mqttClient.setKeepAlive(60);
  mqttClient.setCallback(handleMqttMessage);
  connectMQTT();
  mqttEnabled = true;

  Serial.println();
  Serial.println("Starting sensor readings...");
  Serial.println("==============================================");
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  if (mqttEnabled) {
    ensureNetwork();
    mqttClient.loop();
  }

  // --------------------------------------------------
  // TGS1820
  // --------------------------------------------------
  int   tgsADC          = readAverageADC(TGS1820_PIN, TGS_SAMPLE_COUNT);
  float tgsVoltage      = adcToVoltage(tgsADC);
  float acetoneDelta_mV = (tgsVoltage - tgsBaselineVoltage) * 1000.0;

  String tgsStatus = (tgsVoltage < 0.05)
    ? "Sensor not connected"
    : classifyAcetone(acetoneDelta_mV);

  // --------------------------------------------------
  // PRESSURE
  // --------------------------------------------------
  int   pressureADC     = readAverageADC(PRESSURE_PIN, 20);  // 50→20 samples
  float pressureVoltage = adcToVoltage(pressureADC);
  float pressureKPa     = voltageToPressureKPa(pressureVoltage);
  float pressurePa      = pressureKPa * 1000.0;
  float pressureBar     = pressureKPa / 100.0;

  String pressureStatus = (pressureVoltage < 0.05) ? "Sensor not connected" : "OK";

  // --------------------------------------------------
  // SHT31
  // --------------------------------------------------
  float temperature = 0.0;
  float humidity    = 0.0;
  bool  shtOK       = readSHT31(temperature, humidity);

  // --------------------------------------------------
  // SERIAL OUTPUT
  // --------------------------------------------------
  Serial.println();
  Serial.println("==============================================");
  Serial.print("Reading No. ");  Serial.print(readingNumber);
  Serial.print("     Time: ");   Serial.print(millis() / 1000);
  Serial.println(" seconds");
  Serial.println("==============================================");

  Serial.println();
  Serial.println("TGS1820 ACETONE / VOC SENSOR");
  Serial.println("----------------------------------------------");
  Serial.print("Raw ADC Value      : "); Serial.println(tgsADC);
  Serial.print("Sensor Voltage     : "); Serial.print(tgsVoltage, 4);     Serial.println(" V");
  Serial.print("Baseline Voltage   : "); Serial.print(tgsBaselineVoltage, 4); Serial.println(" V");
  Serial.print("Acetone Delta      : "); Serial.print(acetoneDelta_mV, 2); Serial.println(" mV");
  Serial.print("Gas Status         : "); Serial.println(tgsStatus);

  Serial.println();
  Serial.println("XGZP6847A PRESSURE SENSOR");
  Serial.println("----------------------------------------------");
  Serial.print("Raw ADC Value      : "); Serial.println(pressureADC);
  Serial.print("Sensor Voltage     : "); Serial.print(pressureVoltage, 4); Serial.println(" V");
  Serial.print("Pressure           : "); Serial.print(pressureKPa, 3);     Serial.println(" kPa");
  Serial.print("Pressure           : "); Serial.print(pressurePa, 2);      Serial.println(" Pa");
  Serial.print("Pressure           : "); Serial.print(pressureBar, 5);     Serial.println(" bar");
  Serial.print("Pressure Status    : "); Serial.println(pressureStatus);

  Serial.println();
  Serial.println("SHT31 TEMPERATURE / HUMIDITY SENSOR");
  Serial.println("----------------------------------------------");
  if (shtOK) {
    Serial.print("Temperature        : "); Serial.print(temperature, 2); Serial.println(" C");
    Serial.print("Humidity           : "); Serial.print(humidity, 2);    Serial.println(" %");
    Serial.println("SHT31 Status       : OK");
  } else {
    Serial.println("Temperature        : Failed");
    Serial.println("Humidity           : Failed");
    Serial.println("SHT31 Status       : Check wiring or I2C address");
  }

  Serial.println();
  Serial.println("SYSTEM SUMMARY");
  Serial.println("----------------------------------------------");
  Serial.println(tgsVoltage < 0.05 ? "TGS1820            : CHECK SENSOR" : "TGS1820            : OK");
  Serial.print("Pressure Sensor    : "); Serial.println(pressureStatus);
  Serial.println(shtOK ? "SHT31              : OK" : "SHT31              : CHECK SENSOR");
  Serial.print("Network            : WiFi=");
  Serial.print(WiFi.isConnected() ? "OK" : "DOWN");
  Serial.print("  MQTT=");
  Serial.println(mqttClient.connected() ? "OK" : "DOWN");
  Serial.println("==============================================");

  if (mqttEnabled) {
    publishReading(tgsVoltage, tgsBaselineVoltage, acetoneDelta_mV,
                   pressureKPa, temperature, humidity, shtOK);
  }

  readingNumber++;
  delay(500);   // 3000→500ms; backend gate discards outside sessions anyway
}

// =====================================================
// ADC FUNCTIONS
// =====================================================
int readAverageADC(int pin, int sampleCount) {
  long sum = 0;
  for (int i = 0; i < sampleCount; i++) {
    sum += analogRead(pin);
    delay(5);
  }
  return sum / sampleCount;
}

float adcToVoltage(int adcValue) {
  return adcValue * ESP32_ADC_VOLTAGE / ADC_MAX;
}

// =====================================================
// TGS1820 FUNCTIONS
// =====================================================
float calibrateTGSBaseline() {
  float sumVoltage = 0;
  for (int i = 0; i < BASELINE_SECONDS; i++) {
    int   adcValue = readAverageADC(TGS1820_PIN, TGS_SAMPLE_COUNT);
    float voltage  = adcToVoltage(adcValue);
    sumVoltage += voltage;
    Serial.print("Baseline sample ");
    Serial.print(i + 1);
    Serial.print("/");
    Serial.print(BASELINE_SECONDS);
    Serial.print(" | Voltage: ");
    Serial.print(voltage, 4);
    Serial.println(" V");
    delay(1000);
  }
  return sumVoltage / BASELINE_SECONDS;
}

String classifyAcetone(float delta_mV) {
  if (delta_mV < 5)  return "Clean Air";
  if (delta_mV < 30) return "Low";
  if (delta_mV < 80) return "Moderate";
  return "High";
}

// =====================================================
// PRESSURE CONVERSION
// =====================================================
float voltageToPressureKPa(float voltage) {
  float sensorMinVoltage = SENSOR_SUPPLY_VOLTAGE * SENSOR_MIN_RATIO;
  float sensorMaxVoltage = SENSOR_SUPPLY_VOLTAGE * SENSOR_MAX_RATIO;
  float pressure = (voltage - sensorMinVoltage) *
                   (PRESSURE_MAX_KPA - PRESSURE_MIN_KPA) /
                   (sensorMaxVoltage - sensorMinVoltage) +
                   PRESSURE_MIN_KPA;
  if (pressure < PRESSURE_MIN_KPA) pressure = PRESSURE_MIN_KPA;
  if (pressure > PRESSURE_MAX_KPA) pressure = PRESSURE_MAX_KPA;
  return pressure;
}

// =====================================================
// SHT31
// =====================================================
bool readSHT31(float &temperature, float &humidity) {
  Wire.beginTransmission(SHT31_ADDRESS);
  Wire.write(0x24);
  Wire.write(0x00);
  if (Wire.endTransmission() != 0) return false;
  delay(20);
  Wire.requestFrom(SHT31_ADDRESS, 6);
  if (Wire.available() != 6) return false;
  uint16_t rawTemp = Wire.read() << 8; rawTemp |= Wire.read(); Wire.read();
  uint16_t rawHum  = Wire.read() << 8; rawHum  |= Wire.read(); Wire.read();
  temperature = -45.0  + 175.0 * ((float)rawTemp / 65535.0);
  humidity    = 100.0  *         ((float)rawHum  / 65535.0);
  return true;
}

// =====================================================
// MQTT COMMAND HANDLER
// =====================================================
void handleResetWifi() {
  Serial.println("[CMD] Resetting WiFi credentials — device will restart");

  for (int i = 0; i < 6; i++) {
    ledOn();  delay(100);
    ledOff(); delay(100);
  }

  WiFiManager wm;
  wm.resetSettings();

  prefs.begin("metabreath", false);
  prefs.clear();
  prefs.end();

  delay(500);
  ESP.restart();
}

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

  strncpy(lastCmdId, cmdId, sizeof(lastCmdId) - 1);
  prefs.begin("metabreath", false);
  prefs.putString("lastCmdId", lastCmdId);
  prefs.end();

  Serial.printf("[CMD] action=%s cmd_id=%s\n", action, cmdId);

  if (strcmp(action, "reset_wifi") == 0) {
    handleResetWifi();
  } else {
    Serial.printf("[CMD] unknown action: %s\n", action);
  }
}

// =====================================================
// NETWORK — MQTT
// =====================================================
void connectMQTT() {
  if (!WiFi.isConnected()) return;
  if (mqttClient.connected()) return;
  Serial.print("[MQTT] Connecting... ");
  if (mqttClient.connect(mqttClientId, MQTT_USER, MQTT_PASS)) {
    Serial.println("Connected");
    Serial.print("[MQTT] Topic: ");
    Serial.println(mqttTopic);
    mqttClient.subscribe(mqttCommandTopic, 1);
    Serial.print("[MQTT] Subscribed: ");
    Serial.println(mqttCommandTopic);
  } else {
    Serial.print("[MQTT] Failed rc=");
    Serial.println(mqttClient.state());
  }
}

void ensureNetwork() {
  if (!WiFi.isConnected()) {
    Serial.println("[Net] WiFi dropped — reconnecting");
    WiFi.reconnect();
    unsigned long start = millis();
    while (!WiFi.isConnected() && millis() - start < 15000) {
      delay(500);
      Serial.print(".");
    }
    Serial.println();
  }
  if (WiFi.isConnected() && !mqttClient.connected()) {
    connectMQTT();
  }
}

void publishReading(float sensorVoltage,
                    float baselineVoltage,
                    float acetoneDeltaMV,
                    float pressureKPa,
                    float temperature,
                    float humidity,
                    bool  shtOK) {
  if (!mqttClient.connected()) return;
  JsonDocument doc;
  doc["sensor_voltage"]   = sensorVoltage;
  doc["baseline_voltage"] = baselineVoltage;
  doc["acetone_delta_mv"] = acetoneDeltaMV;
  doc["pressure_kpa"]     = pressureKPa;
  doc["temperature"]      = shtOK ? (float)temperature : (float)NAN;
  doc["humidity"]         = shtOK ? (float)humidity    : (float)NAN;
  doc["reading_number"]   = readingNumber;

  char   buf[384];
  size_t n = serializeJson(doc, buf);

  if (mqttClient.publish(mqttTopic, (const uint8_t*)buf, n, false)) {
    Serial.print("[MQTT] Published ");
    Serial.print((int)n);
    Serial.print(" bytes -> ");
    Serial.println(buf);
  } else {
    Serial.print("[MQTT] Publish FAILED rc=");
    Serial.println(mqttClient.state());
  }
}
