#include "plantory_api.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include <cmath>

#include "app/config.h"
#include "secrets.h"

namespace plantory::api {
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
bool sendWeight(float value) {
  if (!std::isfinite(value)) return false;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  const String url = String(config::METRICS_URL) + String(PLANT_ID) + "/metrics";
  if (!http.begin(client, url)) return false;
  http.addHeader("Authorization", "Bearer " PLANTORY_API_KEY);
  http.addHeader("Content-Type", "application/json");
  JsonDocument document;
  document["metric_type"] = "weight";
  document["value"] = value;
  String body;
  serializeJson(document, body);
  const int statusCode = http.POST(body);
  http.end();
  return statusCode == HTTP_CODE_CREATED || statusCode == HTTP_CODE_OK;
}
}  // namespace plantory::api
