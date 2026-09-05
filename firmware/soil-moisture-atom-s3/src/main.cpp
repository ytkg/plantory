#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <HTTPClient.h>
#include <M5AtomS3.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

#include "secrets.h"

namespace {
constexpr unsigned long WIFI_TIMEOUT_MS = 15000;
constexpr unsigned long TIME_SYNC_TIMEOUT_MS = 10000;
constexpr unsigned long DISPLAY_REFRESH_MS = 1000;
constexpr unsigned long MESSAGE_DISPLAY_MS = 2500;
constexpr size_t MEASUREMENT_COUNT = 10;
constexpr char PLANTS_URL[] = "https://plantory.ytkg.workers.dev/api/plants";
constexpr char METRICS_URL[] = "https://plantory.ytkg.workers.dev/api/plants/";
constexpr char OTA_HOSTNAME[] = "soil-moisture-atom-s3";
constexpr int SEND_HOURS[] = {0, 6, 12, 18};

String plantName = "Plantory";
unsigned long lastDisplayAt = 0;
unsigned long messageUntil = 0;
time_t lastSentAt = 0;
long lastAutoSlotKey = -1;
int lastMeasuredValue = -1;
bool timeSynced = false;

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
  M5.Display.setTextSize(2);
  M5.Display.drawString(lastMeasuredValue < 0 ? "ADC --" : "ADC " + String(lastMeasuredValue), 64, 38);
  M5.Display.setFont(&fonts::lgfxJapanGothic_12);
  M5.Display.setTextSize(1);
  M5.Display.drawString(hasTime ? "現在時刻: " + clockText(time(nullptr)) : "現在時刻: 未同期", 64, 66);
  M5.Display.drawString(hasTime ? "次回送信: " + nextSendText(current) : "次回送信: --:--:--", 64, 86);
  M5.Display.drawString("最終送信: " + clockText(lastSentAt), 64, 106);
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

int measureAverage() {
  long total = 0;
  for (size_t index = 0; index < MEASUREMENT_COUNT; ++index) {
    total += analogRead(SOIL_SENSOR_ANALOG_PIN);
    delay(1000);
    M5.update();
    ArduinoOTA.handle();
  }
  lastMeasuredValue = static_cast<int>(total / static_cast<long>(MEASUREMENT_COUNT));
  return lastMeasuredValue;
}

bool sendMetric(int value) {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, String(METRICS_URL) + String(PLANT_ID) + "/metrics")) return false;
  http.addHeader("Authorization", "Bearer " PLANTORY_API_KEY);
  http.addHeader("Content-Type", "application/json");
  JsonDocument document;
  document["metric_type"] = "soil_moisture";
  document["value"] = value;
  String body; serializeJson(document, body);
  const int statusCode = http.POST(body);
  http.end();
  return statusCode == HTTP_CODE_CREATED || statusCode == HTTP_CODE_OK;
}

void measureAndSend() {
  showMessage("測定中…");
  const int value = measureAverage();
  showMessage("送信中…");
  if (WiFi.status() == WL_CONNECTED && sendMetric(value)) {
    lastSentAt = time(nullptr);
    showMessage("送信完了\nADC: " + String(value));
  } else {
    showMessage("送信失敗");
  }
  messageUntil = millis() + MESSAGE_DISPLAY_MS;
}
}

void setup() {
  auto config = M5.config();
  M5.begin(config);
  analogReadResolution(12);
  showMessage("WiFi…");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_TIMEOUT_MS) { delay(250); M5.update(); }
  configTime(9 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  const unsigned long timeStartedAt = millis();
  while (WiFi.status() == WL_CONNECTED && time(nullptr) < 100000 && millis() - timeStartedAt < TIME_SYNC_TIMEOUT_MS) { delay(250); M5.update(); }
  timeSynced = time(nullptr) >= 100000;
  if (WiFi.status() == WL_CONNECTED) fetchPlantName();
  if (WiFi.status() == WL_CONNECTED) {
    ArduinoOTA.setHostname(OTA_HOSTNAME);
    ArduinoOTA.begin();
  }
  showMainScreen();
}

void loop() {
  M5.update();
  ArduinoOTA.handle();
  const unsigned long now = millis();
  if (now - lastDisplayAt >= DISPLAY_REFRESH_MS && now >= messageUntil) { showMainScreen(); lastDisplayAt = now; }

  if (M5.BtnA.wasPressed() && now >= messageUntil) {
    if (WiFi.status() == WL_CONNECTED) measureAndSend();
    else { showMessage("WiFi未接続"); messageUntil = now + MESSAGE_DISPLAY_MS; }
  }

  struct tm current;
  if (timeSynced && WiFi.status() == WL_CONNECTED && getLocalTimeNow(current) && current.tm_min == 0 && current.tm_sec < 5) {
    int slot = -1;
    for (int index = 0; index < 4; ++index) if (SEND_HOURS[index] == current.tm_hour) slot = index;
    const long slotKey = static_cast<long>(current.tm_yday) * 4 + slot;
    if (slot >= 0 && slotKey != lastAutoSlotKey && now >= messageUntil) {
      lastAutoSlotKey = slotKey;
      measureAndSend();
    }
  }
}
