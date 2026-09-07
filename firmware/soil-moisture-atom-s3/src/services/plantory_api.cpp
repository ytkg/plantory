#include "plantory_api.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <cstdio>
#include <time.h>

#include "app/config.h"
#include "secrets.h"

namespace plantory::api {
namespace {
bool parseUtcTimestamp(const char* timestamp, time_t& result) {
  if (timestamp == nullptr) return false;
  struct tm utc = {};
  if (sscanf(timestamp, "%d-%d-%dT%d:%d:%dZ", &utc.tm_year, &utc.tm_mon, &utc.tm_mday, &utc.tm_hour, &utc.tm_min, &utc.tm_sec) != 6) return false;
  utc.tm_year -= 1900;
  utc.tm_mon -= 1;
  // The device timezone is JST; compensate after parsing the API's UTC timestamp.
  result = mktime(&utc) + (9 * 60 * 60);
  return result >= 100000;
}

LatestRecordResult readLatestRecord(AppState& state) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, config::STATUS_URL)) return LatestRecordResult::Failed;
  if (http.GET() != HTTP_CODE_OK) { http.end(); return LatestRecordResult::Failed; }
  JsonDocument document;
  const auto error = deserializeJson(document, http.getString());
  http.end();
  if (error) return LatestRecordResult::Failed;
  for (JsonObject status : document.as<JsonArray>()) {
    if ((status["plant_id"] | -1) != PLANT_ID) continue;
    time_t recordedAt = 0;
    if (!parseUtcTimestamp(status["recorded_at"], recordedAt)) return LatestRecordResult::Failed;
    state.lastRecordedAt = recordedAt;
    return LatestRecordResult::Found;
  }
  state.lastRecordedAt = 0;
  return LatestRecordResult::Missing;
}
}  // namespace

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
    time_t recordedAt = 0;
    if (parseUtcTimestamp(status["recorded_at"], recordedAt)) state.lastRecordedAt = recordedAt;
    return true;
  }
  return false;
}

LatestRecordResult fetchLatestRecord(AppState& state) {
  return readLatestRecord(state);
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
