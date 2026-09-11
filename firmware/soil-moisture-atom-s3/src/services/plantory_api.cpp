#include "plantory_api.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include "app/config.h"
#include "secrets.h"

namespace plantory::api {
bool fetchMetricsInterval(int& intervalHours) {
  WiFiClientSecure client;
  client.setInsecure();
  client.setHandshakeTimeout(5);
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  if (!http.begin(client, config::METRICS_SETTINGS_URL)) return false;
  http.addHeader("Authorization", "Bearer " PLANTORY_API_KEY);
  if (http.GET() != HTTP_CODE_OK) {
    http.end();
    return false;
  }
  JsonDocument document;
  const auto error = deserializeJson(document, http.getString());
  http.end();
  // Check the response shape; Plantory validates the allowed interval values.
  if (error || !document["interval_hours"].is<int>() || document["interval_hours"].as<int>() <= 0) return false;
  intervalHours = document["interval_hours"].as<int>();
  return true;
}

bool fetchPlantName(AppState& state) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, config::PLANTS_URL)) return false;
  http.addHeader("Authorization", "Bearer " PLANTORY_API_KEY);
  if (http.GET() != HTTP_CODE_OK) {
    http.end();
    return false;
  }

  JsonDocument document;
  const auto error = deserializeJson(document, http.getString());
  http.end();
  if (error) return false;

  for (JsonObject plant : document["plants"].as<JsonArray>()) {
    if (plant["id"] == PLANT_ID) {
      state.plantName = plant["name"] | state.plantName;
      return true;
    }
  }
  return false;
}

bool fetchMoisturePercentage(AppState& state) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, config::STATUS_URL)) return false;
  if (http.GET() != HTTP_CODE_OK) {
    http.end();
    return false;
  }

  JsonDocument document;
  const auto error = deserializeJson(document, http.getString());
  http.end();
  if (error) return false;

  for (JsonObject status : document.as<JsonArray>()) {
    const int plantId = status["plant_id"] | -1;
    if (plantId != PLANT_ID || !status["moisture"].is<int>()) continue;
    state.moisturePercentage = status["moisture"].as<int>();
    return true;
  }
  return false;
}

bool sendSoilMoisture(int value) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  const String url = String(config::METRICS_URL) + String(PLANT_ID) + "/metrics";
  if (!http.begin(client, url)) return false;

  http.addHeader("Authorization", "Bearer " PLANTORY_API_KEY);
  http.addHeader("Content-Type", "application/json");
  JsonDocument document;
  document["metric_type"] = "soil_moisture";
  document["value"] = value;
  String body;
  serializeJson(document, body);
  const int statusCode = http.POST(body);
  http.end();
  return statusCode == HTTP_CODE_CREATED || statusCode == HTTP_CODE_OK;
}

}  // namespace plantory::api
