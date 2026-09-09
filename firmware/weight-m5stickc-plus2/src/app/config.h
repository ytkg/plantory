#pragma once

#include <Arduino.h>

namespace plantory::config {
constexpr unsigned long WIFI_TIMEOUT_MS = 15000;
constexpr unsigned long TIME_SYNC_TIMEOUT_MS = 10000;
constexpr unsigned long DISPLAY_REFRESH_MS = 1000;
constexpr unsigned long MESSAGE_DISPLAY_MS = 2500;
constexpr unsigned long LONG_PRESS_MS = 2000;
constexpr uint8_t WIFI_RECONNECT_MAX_ATTEMPTS = 5;
constexpr unsigned long DOUBLE_TAP_WINDOW_MS = 350;
constexpr unsigned long SAMPLE_INTERVAL_MS = 100;
constexpr size_t MEASUREMENT_COUNT = 10;
constexpr float ZERO_DEADBAND_GRAMS = 1.0F;
constexpr uint8_t SCALES_ADDRESS = 0x26;
constexpr int I2C_SDA_PIN = 32;
constexpr int I2C_SCL_PIN = 33;
constexpr char PLANTS_URL[] = "https://plantory.ytkg.workers.dev/api/plants";
constexpr char METRICS_URL[] = "https://plantory.ytkg.workers.dev/api/plants/";
constexpr char OTA_HOSTNAME[] = "weight-m5stickc-plus2";
constexpr int SEND_HOURS[] = {0, 3, 6, 9, 12, 15, 18, 21};
constexpr size_t SEND_HOUR_COUNT = sizeof(SEND_HOURS) / sizeof(SEND_HOURS[0]);
}  // namespace plantory::config
