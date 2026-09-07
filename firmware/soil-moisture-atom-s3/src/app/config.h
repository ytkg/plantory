#pragma once

#include <Arduino.h>

namespace plantory::config {

constexpr unsigned long WIFI_TIMEOUT_MS = 15000;
constexpr unsigned long TIME_SYNC_TIMEOUT_MS = 10000;
constexpr unsigned long CLOCK_CHECK_MS = 1000;
constexpr unsigned long ORIENTATION_CHECK_MS = 250;
constexpr unsigned long ORIENTATION_STABLE_MS = 500;
constexpr unsigned long MESSAGE_DISPLAY_MS = 2500;
constexpr unsigned long LONG_PRESS_MS = 2000;
constexpr uint8_t WIFI_RECONNECT_MAX_ATTEMPTS = 5;
constexpr size_t MEASUREMENT_COUNT = 10;
constexpr float VERTICAL_ACCELERATION_THRESHOLD = 0.65F;

constexpr char PLANTS_URL[] = "https://plantory.ytkg.workers.dev/api/plants";
constexpr char STATUS_URL[] = "https://plantory.ytkg.workers.dev/api/status";
constexpr char METRICS_URL[] = "https://plantory.ytkg.workers.dev/api/plants/";
constexpr char OTA_HOSTNAME[] = "soil-moisture-atom-s3";
constexpr int SEND_HOURS[] = {0, 6, 12, 18};
constexpr size_t SEND_HOUR_COUNT = sizeof(SEND_HOURS) / sizeof(SEND_HOURS[0]);

}  // namespace plantory::config
