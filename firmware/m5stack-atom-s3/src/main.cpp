#include <M5AtomS3.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "secrets.h"

namespace {
constexpr unsigned long WIFI_TIMEOUT_MS = 15000;
constexpr unsigned long STATUS_REFRESH_MS = 60000;
constexpr char STATUS_URL[] = "https://plantory.ytkg.workers.dev/api/status";
constexpr uint8_t SOIL_SENSOR_ANALOG_PIN = 1;  // ATOM S3 G1 / Earth Unit white wire
unsigned long lastStatusAt = 0;

void showMessage(const char* message) {
  M5.Display.clear(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setTextSize(2);
  M5.Display.drawString(message, M5.Display.width() / 2, M5.Display.height() / 2);
}

void showStatus() {
  HTTPClient http;
  http.begin(STATUS_URL);
  const int statusCode = http.GET();
  if (statusCode != HTTP_CODE_OK) {
    showMessage("API error");
    Serial.printf("Status API failed: %d\n", statusCode);
    http.end();
    return;
  }

  JsonDocument document;
  const DeserializationError error = deserializeJson(document, http.getString());
  http.end();
  if (error) {
    showMessage("JSON error");
    Serial.println("Status API returned invalid JSON");
    return;
  }

  JsonArray statuses = document.as<JsonArray>();
  if (statuses.isNull() || statuses.size() == 0) {
    showMessage("No plants");
    return;
  }

  M5.Display.clear(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextDatum(middle_left);
  M5.Display.setFont(&fonts::lgfxJapanGothic_12);
  M5.Display.setTextSize(1);

  const int rowHeight = 28;
  const int firstRowY = 22;
  for (size_t index = 0; index < statuses.size(); ++index) {
    JsonObject status = statuses[index];
    const int y = firstRowY + static_cast<int>(index) * rowHeight;
    if (y > M5.Display.height() - 8) {
      break;
    }

    String name = status["name"] | "(unknown)";
    while (name.length() > 0 && M5.Display.textWidth(name) > 82) {
      size_t length = name.length() - 1;
      while (length > 0 && (static_cast<uint8_t>(name[length]) & 0xc0) == 0x80) {
        --length;
      }
      name.remove(length);
    }
    M5.Display.drawString(name, 6, y);
    M5.Display.setTextDatum(middle_right);
    M5.Display.drawString(String(status["moisture"] | 0) + "%", M5.Display.width() - 6, y);
    M5.Display.setTextDatum(middle_left);
  }

  M5.Display.setTextDatum(middle_left);
  M5.Display.drawString("ADC: " + String(analogRead(SOIL_SENSOR_ANALOG_PIN)), 6, 108);
}
}

void setup() {
  auto config = M5.config();
  M5.begin(config);
  analogReadResolution(12);

  showMessage("WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_TIMEOUT_MS) {
    delay(250);
    M5.update();
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
    showStatus();
    lastStatusAt = millis();
  } else {
    showMessage("WiFi error");
    Serial.println("Wi-Fi connection failed");
  }
}

void loop() {
  M5.update();
  if (WiFi.status() == WL_CONNECTED && millis() - lastStatusAt >= STATUS_REFRESH_MS) {
    showStatus();
    lastStatusAt = millis();
  }
}
