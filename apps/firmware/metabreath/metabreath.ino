/**
 * MetaBreath ESP32 Firmware
 *
 * Boot flow:
 *   1. Check NVS for saved credentials
 *   2a. If found → WiFi → MQTT → publish sensor readings
 *   2b. If not found → BLE advertising mode (LED blinks blue)
 *       Web app connects via BLE, sends WiFi + token + API URL
 *       ESP32 connects WiFi → calls /sensor/device/pair → stores creds in NVS
 *       Restarts → goes to 2a
 *
 * BLE GATT Service UUID:  4fafc201-1fb5-459e-8fcc-c5c9c331914b
 * Characteristics:
 *   SSID        beb5483e-36e1-4688-b7f5-ea07361b26a8  write
 *   Password    beb5483e-36e1-4688-b7f5-ea07361b26a9  write
 *   Token       beb5483e-36e1-4688-b7f5-ea07361b26aa  write
 *   API URL     beb5483e-36e1-4688-b7f5-ea07361b26ab  write
 *   Status      beb5483e-36e1-4688-b7f5-ea07361b26ac  notify
 *   Command     beb5483e-36e1-4688-b7f5-ea07361b26ad  write
 *
 * Status codes sent to web app:
 *   0x00 Idle/Ready     0x01 Got creds    0x02 Connecting WiFi
 *   0x03 WiFi OK        0x04 Calling API  0x05 Paired OK
 *   0xFF Error
 *
 * Hardware:
 *   TGS1820 sensor on ADC pin 34 (ambient) and 35 (breath)
 *   SHT35 on I2C SDA=21 SCL=22 (optional — comment out if not present)
 *   LED on pin 2 (built-in)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ─── Pin config ───────────────────────────────────────────────────────────────
#define PIN_AMBIENT_VOC  34
#define PIN_BREATH_VOC   35
#define PIN_LED          2

// ─── BLE UUIDs ────────────────────────────────────────────────────────────────
#define SVC_UUID   "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHAR_SSID  "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define CHAR_PW    "beb5483e-36e1-4688-b7f5-ea07361b26a9"
#define CHAR_TOKEN "beb5483e-36e1-4688-b7f5-ea07361b26aa"
#define CHAR_API   "beb5483e-36e1-4688-b7f5-ea07361b26ab"
#define CHAR_STAT  "beb5483e-36e1-4688-b7f5-ea07361b26ac"
#define CHAR_CMD   "beb5483e-36e1-4688-b7f5-ea07361b26ad"

// ─── Status codes ─────────────────────────────────────────────────────────────
#define ST_IDLE      0x00
#define ST_GOT_CREDS 0x01
#define ST_WIFI_CONN 0x02
#define ST_WIFI_OK   0x03
#define ST_API_CALL  0x04
#define ST_PAIRED    0x05
#define ST_ERROR     0xFF

// ─── NVS keys ────────────────────────────────────────────────────────────────
#define NVS_NS        "metabreath"
#define NVS_SSID      "ssid"
#define NVS_WPWD      "wpwd"
#define NVS_DEV_ID    "device_id"
#define NVS_MQTT_HOST "mqtt_host"
#define NVS_MQTT_PORT "mqtt_port"
#define NVS_MQTT_USER "mqtt_user"
#define NVS_MQTT_PASS "mqtt_pass"
#define NVS_MQTT_TOP  "mqtt_topic"

// ─── Globals ──────────────────────────────────────────────────────────────────
Preferences prefs;
BLECharacteristic* pStatChar = nullptr;
BLEServer*         pServer    = nullptr;

String g_ssid, g_wpwd, g_token, g_apiUrl;
volatile bool g_gotCmd = false;

WiFiClient    wifiClient;
PubSubClient  mqttClient(wifiClient);

// ─── Helpers ──────────────────────────────────────────────────────────────────
void ledBlink(int ms = 200) {
  digitalWrite(PIN_LED, HIGH); delay(ms);
  digitalWrite(PIN_LED, LOW);  delay(ms);
}

void setStatus(uint8_t code) {
  if (!pStatChar) return;
  pStatChar->setValue(&code, 1);
  pStatChar->notify();
  delay(50);
}

// ─── BLE Callbacks ────────────────────────────────────────────────────────────
class ProvisionCallbacks : public BLECharacteristicCallbacks {
public:
  BLECharacteristic* statusChar;

  void onWrite(BLECharacteristic* pChar) override {
    String uuid = pChar->getUUID().toString().c_str();
    String val  = pChar->getValue().c_str();

    if (uuid == CHAR_SSID)  { g_ssid   = val; Serial.println("[BLE] SSID: " + val); }
    if (uuid == CHAR_PW)    { g_wpwd   = val; Serial.println("[BLE] WiFi PW received"); }
    if (uuid == CHAR_TOKEN) { g_token  = val; Serial.println("[BLE] Token received"); }
    if (uuid == CHAR_API)   { g_apiUrl = val; Serial.println("[BLE] API URL: " + val); }
    if (uuid == CHAR_CMD && val == "GO") {
      Serial.println("[BLE] GO command received");
      setStatus(ST_GOT_CREDS);
      g_gotCmd = true;
    }
  }
};

// ─── BLE Provisioning mode ────────────────────────────────────────────────────
void runBLEProvisioning() {
  Serial.println("[BLE] Starting provisioning mode...");

  // Device name: MetaBreath-XXXX (last 4 of MAC)
  uint8_t mac[6]; esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char name[20];
  snprintf(name, sizeof(name), "MetaBreath-%02X%02X", mac[4], mac[5]);

  BLEDevice::init(name);
  pServer = BLEDevice::createServer();
  BLEService* pSvc = pServer->createService(BLEUUID(SVC_UUID));

  auto mkChar = [&](const char* uuid, uint32_t props) {
    return pSvc->createCharacteristic(BLEUUID(uuid), props);
  };

  uint32_t W  = BLECharacteristic::PROPERTY_WRITE;
  uint32_t WN = BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY;

  BLECharacteristic* cSsid  = mkChar(CHAR_SSID,  W);
  BLECharacteristic* cPw    = mkChar(CHAR_PW,    W);
  BLECharacteristic* cToken = mkChar(CHAR_TOKEN, W);
  BLECharacteristic* cApi   = mkChar(CHAR_API,   W);
  BLECharacteristic* cStat  = mkChar(CHAR_STAT,  WN);
  BLECharacteristic* cCmd   = mkChar(CHAR_CMD,   W);

  cStat->addDescriptor(new BLE2902());
  pStatChar = cStat;

  auto* cb = new ProvisionCallbacks();
  cSsid->setCallbacks(cb);  cPw->setCallbacks(cb);
  cToken->setCallbacks(cb); cApi->setCallbacks(cb);
  cCmd->setCallbacks(cb);

  pSvc->start();
  BLEAdvertising* pAdv = BLEDevice::getAdvertising();
  pAdv->addServiceUUID(BLEUUID(SVC_UUID));
  pAdv->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.printf("[BLE] Advertising as: %s\n", name);
  setStatus(ST_IDLE);

  // Blink LED while waiting
  while (!g_gotCmd) {
    ledBlink(300);
    delay(300);
  }

  // Stop BLE
  BLEDevice::stopAdvertising();
  delay(100);

  // Connect WiFi
  Serial.printf("[WiFi] Connecting to: %s\n", g_ssid.c_str());
  setStatus(ST_WIFI_CONN);
  WiFi.begin(g_ssid.c_str(), g_wpwd.c_str());

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(1000); tries++;
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Failed!");
    setStatus(ST_ERROR);
    delay(3000);
    ESP.restart();
    return;
  }

  Serial.println("[WiFi] Connected: " + WiFi.localIP().toString());
  setStatus(ST_WIFI_OK);
  delay(500);

  // Call /sensor/device/pair
  setStatus(ST_API_CALL);
  String pairUrl = g_apiUrl + "/sensor/device/pair";
  Serial.println("[API] POST " + pairUrl);

  HTTPClient http;
  http.begin(pairUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + g_token);

  StaticJsonDocument<128> body;
  body["kind"] = "breath";
  body["sensor_model"] = "TGS1820";
  body["firmware_version"] = "1.0.0";
  String bodyStr;
  serializeJson(body, bodyStr);

  int code = http.POST(bodyStr);
  Serial.printf("[API] Response: %d\n", code);

  if (code != 201) {
    Serial.println("[API] Error: " + http.getString());
    setStatus(ST_ERROR);
    http.end();
    delay(5000);
    ESP.restart();
    return;
  }

  // Parse response
  StaticJsonDocument<512> resp;
  deserializeJson(resp, http.getString());
  http.end();

  String deviceId  = resp["device_id"].as<String>();
  String mqttTopic = resp["mqtt_topic"].as<String>();
  String mqttUser  = resp["mqtt_user"].as<String>();
  String mqttBrk   = resp["mqtt_broker"].as<String>();
  int    mqttPort  = resp["mqtt_port"].as<int>();
  // Note: ESP32 MQTT password must be pre-provisioned in firmware or sent separately

  // Save to NVS
  prefs.begin(NVS_NS, false);
  prefs.putString(NVS_SSID,      g_ssid);
  prefs.putString(NVS_WPWD,      g_wpwd);
  prefs.putString(NVS_DEV_ID,    deviceId);
  prefs.putString(NVS_MQTT_HOST, mqttBrk);
  prefs.putInt(   NVS_MQTT_PORT, mqttPort);
  prefs.putString(NVS_MQTT_USER, mqttUser);
  prefs.putString(NVS_MQTT_TOP,  mqttTopic);
  prefs.end();

  Serial.println("[NVS] Credentials saved. Device ID: " + deviceId);
  setStatus(ST_PAIRED);
  delay(2000);

  ESP.restart();
}

// ─── Sensor reading ───────────────────────────────────────────────────────────
float readAmbientVOC() {
  int raw = analogRead(PIN_AMBIENT_VOC);
  // TGS1820: convert ADC to ppm (calibration needed — placeholder formula)
  return (float)raw / 4095.0f * 1000.0f;
}

float readBreathVOC() {
  int raw = analogRead(PIN_BREATH_VOC);
  return (float)raw / 4095.0f * 1000.0f;
}

// ─── MQTT mode ────────────────────────────────────────────────────────────────
void runMQTT(const String& host, int port, const String& user,
             const String& pass, const String& topic, const String& deviceId) {
  mqttClient.setServer(host.c_str(), port);
  mqttClient.setKeepAlive(60);

  Serial.printf("[MQTT] Connecting to %s:%d as %s\n", host.c_str(), port, user.c_str());

  while (!mqttClient.connected()) {
    String clientId = "metabreath-" + deviceId.substring(0, 8);
    if (mqttClient.connect(clientId.c_str(), user.c_str(), pass.c_str())) {
      Serial.println("[MQTT] Connected");
      digitalWrite(PIN_LED, HIGH);  // solid LED = ready
    } else {
      Serial.printf("[MQTT] Failed rc=%d — retry in 5s\n", mqttClient.state());
      delay(5000);
    }
  }

  // Publish loop
  while (true) {
    mqttClient.loop();

    // Read sensors
    float ambient = readAmbientVOC();
    float breath  = readBreathVOC();

    // TODO: add SHT35 for temp/humidity and pressure sensor
    StaticJsonDocument<256> doc;
    doc["ambient_voc"]     = ambient;
    doc["breath_voc"]      = breath;
    doc["pressure_mean"]   = 0;   // replace with real pressure sensor
    doc["pressure_std"]    = 0;
    doc["breath_duration"] = 0;
    doc["temperature"]     = 0;
    doc["humidity"]        = 0;

    char buf[256];
    serializeJson(doc, buf);

    if (mqttClient.publish(topic.c_str(), buf)) {
      Serial.println("[MQTT] Published: " + String(buf));
    } else {
      Serial.println("[MQTT] Publish failed — reconnecting...");
      mqttClient.disconnect();
      delay(1000);
      while (!mqttClient.connect(("mb-" + deviceId.substring(0, 8)).c_str(),
                                  user.c_str(), pass.c_str())) {
        delay(3000);
      }
    }

    // Publish every 30 seconds
    delay(30000);
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  analogReadResolution(12);

  Serial.println("\n[MetaBreath] Booting...");

  // Check NVS for saved credentials
  prefs.begin(NVS_NS, true);  // read-only
  String savedSsid    = prefs.getString(NVS_SSID, "");
  String savedWpwd    = prefs.getString(NVS_WPWD, "");
  String savedDevId   = prefs.getString(NVS_DEV_ID, "");
  String savedMqttH   = prefs.getString(NVS_MQTT_HOST, "");
  int    savedMqttP   = prefs.getInt(   NVS_MQTT_PORT, 1883);
  String savedMqttU   = prefs.getString(NVS_MQTT_USER, "");
  String savedMqttPw  = prefs.getString(NVS_MQTT_PASS, "esp32");  // set by admin
  String savedTopic   = prefs.getString(NVS_MQTT_TOP, "");
  prefs.end();

  if (savedSsid.length() == 0 || savedDevId.length() == 0) {
    // No credentials saved → BLE provisioning mode
    Serial.println("[Boot] No credentials → BLE mode");
    runBLEProvisioning();  // restarts when done
  } else {
    // Credentials found → WiFi → MQTT
    Serial.println("[Boot] Credentials found → WiFi+MQTT mode");
    Serial.println("  SSID: " + savedSsid);
    Serial.println("  Device: " + savedDevId);

    WiFi.begin(savedSsid.c_str(), savedWpwd.c_str());
    Serial.print("[WiFi] Connecting");
    int t = 0;
    while (WiFi.status() != WL_CONNECTED && t < 30) {
      delay(1000); Serial.print("."); t++;
    }
    Serial.println();

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] Failed — rebooting in 10s");
      delay(10000);
      ESP.restart();
    }

    Serial.println("[WiFi] Connected: " + WiFi.localIP().toString());
    runMQTT(savedMqttH, savedMqttP, savedMqttU, savedMqttPw, savedTopic, savedDevId);
  }
}

void loop() {
  // Not used — runMQTT has its own loop / runBLEProvisioning blocks
}
