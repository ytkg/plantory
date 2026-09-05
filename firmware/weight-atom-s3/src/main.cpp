#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <HTTPClient.h>
#include <M5AtomS3.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <cstring>
#include <cmath>
#include <time.h>

#include "secrets.h"

namespace {
constexpr unsigned long WIFI_TIMEOUT_MS = 15000;
constexpr unsigned long TIME_SYNC_TIMEOUT_MS = 10000;
constexpr unsigned long DISPLAY_REFRESH_MS = 1000;
constexpr unsigned long MESSAGE_DISPLAY_MS = 2500;
constexpr unsigned long DOUBLE_TAP_WINDOW_MS = 350;
constexpr unsigned long SAMPLE_INTERVAL_MS = 100;
constexpr size_t MEASUREMENT_COUNT = 10;
constexpr float ZERO_DEADBAND_GRAMS = 1.0f;
constexpr uint8_t SCALES_ADDRESS = 0x26;
constexpr int I2C_SDA_PIN = 2;
constexpr int I2C_SCL_PIN = 1;
constexpr char PLANTS_URL[] = "https://plantory.ytkg.workers.dev/api/plants";
constexpr char METRICS_URL[] = "https://plantory.ytkg.workers.dev/api/plants/";
constexpr char OTA_HOSTNAME[] = "weight-atom-s3";
constexpr int SEND_HOURS[] = {0, 6, 12, 18};

String plantName = "Plantory";
unsigned long lastDisplayAt = 0;
unsigned long messageUntil = 0;
time_t lastSentAt = 0;
long lastAutoSlotKey = -1;
float lastMeasuredValue = NAN;
bool timeSynced = false;
bool scalesReady = false;
uint8_t readFailureCount = 0;
unsigned long firstTapAt = 0;
bool singleTapPending = false;

bool connectScales() {
  Wire.end();
  if (!Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 100000)) return false;
  Wire.setTimeOut(50);
  Wire.beginTransmission(SCALES_ADDRESS);
  const uint8_t status = Wire.endTransmission();
  Serial.printf("Mini Scales probe: %u\n", status);
  return status == 0;
}

float readWeightGrams() {
  for (int attempt = 0; attempt < 3; ++attempt) {
    Wire.beginTransmission(SCALES_ADDRESS);
    Wire.write(0x10); // U177: little-endian IEEE-754 float, grams
    if (Wire.endTransmission(false) == 0 && Wire.requestFrom(SCALES_ADDRESS, (uint8_t)4) == 4) {
      uint8_t data[4];
      for (auto& byte : data) byte = static_cast<uint8_t>(Wire.read());
      float weight = 0.0f;
      std::memcpy(&weight, data, sizeof(weight));
      Serial.printf("Weight bytes=%02x %02x %02x %02x grams=%.3f\n",
                    data[0], data[1], data[2], data[3], weight);
      return std::isfinite(weight) ? weight : NAN;
    }
    delay(10);
  }
  return NAN;
}

float normalizedWeight(float value) {
  if (!std::isfinite(value)) return NAN;
  return std::fabs(value) <= ZERO_DEADBAND_GRAMS ? 0.0f : value;
}

bool resetZeroOffset() {
  Wire.beginTransmission(SCALES_ADDRESS);
  Wire.write(0x50); // U177: set current load as the zero offset
  Wire.write(1);
  return Wire.endTransmission() == 0;
}

void showMessage(const String& message) {
  M5.Display.clear(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setFont(&fonts::lgfxJapanGothic_12);
  M5.Display.setTextSize(1);
  M5.Display.drawString(message, M5.Display.width() / 2, M5.Display.height() / 2);
}

String clockText(time_t timestamp) {
  if (timestamp == 0) return "--:--:--";
  struct tm localTime;
  if (!localtime_r(&timestamp, &localTime)) return "--:--:--";
  char buffer[9];
  strftime(buffer, sizeof(buffer), "%H:%M:%S", &localTime);
  return String(buffer);
}

bool getLocalTimeNow(struct tm& localTime) {
  time_t now = time(nullptr);
  if (now < 100000) return false;
  return localtime_r(&now, &localTime) != nullptr;
}

String nextSendText(const struct tm& current) {
  for (int hour : SEND_HOURS) {
    if (current.tm_hour < hour || (current.tm_hour == hour && current.tm_min == 0 && current.tm_sec < 1)) {
      char buffer[9];
      snprintf(buffer, sizeof(buffer), "%02d:00:00", hour);
      return String(buffer);
    }
  }
  return "00:00:00";
}

void showMainScreen() {
  struct tm current;
  const bool hasTime = timeSynced && getLocalTimeNow(current);
  M5.Display.clear(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setFont(&fonts::lgfxJapanGothic_12);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setTextSize(1);
  M5.Display.drawString(plantName, 64, 12);
  M5.Display.drawString("重量", 64, 28);
  const String weightText = isnan(lastMeasuredValue) ? "--g" : String(lastMeasuredValue, 1) + "g";
  M5.Display.setTextSize(weightText.length() <= 6 ? 2 : 1);
  M5.Display.drawString(weightText, 64, 46);
  M5.Display.setTextSize(1);
  M5.Display.drawString(hasTime ? "現在時刻: " + clockText(time(nullptr)) : "現在時刻: 未同期", 64, 74);
  M5.Display.drawString(hasTime ? "次回送信: " + nextSendText(current) : "次回送信: --:--:--", 64, 94);
  M5.Display.drawString("最終送信: " + clockText(lastSentAt), 64, 114);
}

bool fetchPlantName() {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, PLANTS_URL)) return false;
  http.addHeader("Authorization", "Bearer " PLANTORY_API_KEY);
  if (http.GET() != HTTP_CODE_OK) { http.end(); return false; }
  JsonDocument document;
  const auto error = deserializeJson(document, http.getString());
  http.end();
  if (error) return false;
  for (JsonObject plant : document["plants"].as<JsonArray>()) {
    if (plant["id"] == PLANT_ID) { plantName = plant["name"] | plantName; return true; }
  }
  return false;
}

float measureAverage() {
  float total = 0;
  for (size_t index = 0; index < MEASUREMENT_COUNT; ++index) {
    const float value = readWeightGrams();
    if (!std::isfinite(value)) return NAN;
    total += value;
    if (index + 1 < MEASUREMENT_COUNT) delay(SAMPLE_INTERVAL_MS);
    M5.update();
    ArduinoOTA.handle();
  }
  lastMeasuredValue = normalizedWeight(total / static_cast<float>(MEASUREMENT_COUNT));
  return lastMeasuredValue;
}

bool sendMetric(float value) {
  if (!std::isfinite(value)) return false;
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, String(METRICS_URL) + String(PLANT_ID) + "/metrics")) return false;
  http.addHeader("Authorization", "Bearer " PLANTORY_API_KEY);
  http.addHeader("Content-Type", "application/json");
  JsonDocument document;
  document["metric_type"] = "weight";
  document["value"] = value;
  String body; serializeJson(document, body);
  const int statusCode = http.POST(body);
  http.end();
  return statusCode == HTTP_CODE_CREATED || statusCode == HTTP_CODE_OK;
}

void measureAndSend() {
  showMessage("測定中…");
  const float value = measureAverage();
  if (!std::isfinite(value)) {
    showMessage("測定失敗");
    messageUntil = millis() + MESSAGE_DISPLAY_MS;
    return;
  }
  showMessage("送信中…");
  if (WiFi.status() == WL_CONNECTED && sendMetric(value)) {
    lastSentAt = time(nullptr);
    showMessage("送信完了\\n重量: " + String(value, 1) + "g");
  } else {
    showMessage("送信失敗");
  }
  messageUntil = millis() + MESSAGE_DISPLAY_MS;
}
}

void setup() {
  auto config = M5.config();
  M5.begin(config);
  Serial.begin(115200);
  showMessage("センサー…");
  scalesReady = connectScales();
  if (!scalesReady) showMessage("センサー未接続");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_TIMEOUT_MS) { delay(250); M5.update(); }
  configTime(9 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  const unsigned long timeStartedAt = millis();
  while (WiFi.status() == WL_CONNECTED && time(nullptr) < 100000 && millis() - timeStartedAt < TIME_SYNC_TIMEOUT_MS) { delay(250); M5.update(); }
  timeSynced = time(nullptr) >= 100000;
  if (WiFi.status() == WL_CONNECTED) fetchPlantName();
  if (WiFi.status() == WL_CONNECTED) { ArduinoOTA.setHostname(OTA_HOSTNAME); ArduinoOTA.begin(); }
  showMainScreen();
}

void loop() {
  M5.update();
  ArduinoOTA.handle();
  const unsigned long now = millis();
  if (scalesReady && now - lastDisplayAt >= DISPLAY_REFRESH_MS && now >= messageUntil) {
    lastMeasuredValue = normalizedWeight(readWeightGrams());
    if (isnan(lastMeasuredValue)) {
      if (++readFailureCount >= 5) scalesReady = false;
    } else {
      readFailureCount = 0;
    }
    showMainScreen();
    lastDisplayAt = now;
  }
  if (!scalesReady && now - lastDisplayAt >= DISPLAY_REFRESH_MS) {
    scalesReady = connectScales();
    if (scalesReady) readFailureCount = 0;
    lastDisplayAt = now;
  }
  if (M5.BtnA.wasPressed() && now >= messageUntil) {
    if (singleTapPending && now - firstTapAt <= DOUBLE_TAP_WINDOW_MS) {
      singleTapPending = false;
      if (scalesReady && resetZeroOffset()) {
        lastMeasuredValue = 0.0f;
        showMessage("ゼロ調整完了");
      } else {
        showMessage("ゼロ調整失敗");
      }
      messageUntil = now + MESSAGE_DISPLAY_MS;
    } else {
      singleTapPending = true;
      firstTapAt = now;
    }
  }
  if (singleTapPending && now - firstTapAt > DOUBLE_TAP_WINDOW_MS && now >= messageUntil) {
    singleTapPending = false;
    if (!scalesReady) { showMessage("センサー未接続"); messageUntil = now + MESSAGE_DISPLAY_MS; }
    else if (WiFi.status() == WL_CONNECTED) measureAndSend();
    else { showMessage("WiFi未接続"); messageUntil = now + MESSAGE_DISPLAY_MS; }
  }
  struct tm current;
  if (scalesReady && timeSynced && WiFi.status() == WL_CONNECTED && getLocalTimeNow(current) && current.tm_min == 0 && current.tm_sec < 5) {
    int slot = -1;
    for (int index = 0; index < 4; ++index) if (SEND_HOURS[index] == current.tm_hour) slot = index;
    const long slotKey = static_cast<long>(current.tm_yday) * 4 + slot;
    if (slot >= 0 && slotKey != lastAutoSlotKey && now >= messageUntil) { lastAutoSlotKey = slotKey; measureAndSend(); }
  }
}
