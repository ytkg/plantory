#include "weight_sensor.h"

#include <Arduino.h>
#include <Wire.h>
#include <cmath>
#include <cstring>

#include "app/config.h"

namespace plantory::sensor {
bool begin() {
  Wire.end();
  if (!Wire.begin(config::I2C_SDA_PIN, config::I2C_SCL_PIN, 100000)) return false;
  Wire.setTimeOut(50);
  Wire.beginTransmission(config::SCALES_ADDRESS);
  const uint8_t status = Wire.endTransmission();
  Serial.printf("Mini Scales probe: %u\n", status);
  return status == 0;
}
float readGrams() {
  for (int attempt = 0; attempt < 3; ++attempt) {
    Wire.beginTransmission(config::SCALES_ADDRESS);
    Wire.write(0x10);
    if (Wire.endTransmission(false) == 0 && Wire.requestFrom(config::SCALES_ADDRESS, static_cast<uint8_t>(4)) == 4) {
      uint8_t data[4];
      for (auto& byte : data) byte = static_cast<uint8_t>(Wire.read());
      float weight = 0.0F;
      std::memcpy(&weight, data, sizeof(weight));
      Serial.printf("Weight bytes=%02x %02x %02x %02x grams=%.3f\n", data[0], data[1], data[2], data[3], weight);
      return std::isfinite(weight) ? weight : NAN;
    }
    delay(10);
  }
  return NAN;
}
float normalize(float value) {
  if (!std::isfinite(value)) return NAN;
  return std::fabs(value) <= config::ZERO_DEADBAND_GRAMS ? 0.0F : value;
}
float measureAverage(void (*keepAlive)()) {
  float total = 0.0F;
  for (size_t index = 0; index < config::MEASUREMENT_COUNT; ++index) {
    const float value = readGrams();
    if (!std::isfinite(value)) return NAN;
    total += value;
    if (index + 1 < config::MEASUREMENT_COUNT) delay(config::SAMPLE_INTERVAL_MS);
    if (keepAlive != nullptr) keepAlive();
  }
  return normalize(total / static_cast<float>(config::MEASUREMENT_COUNT));
}
bool resetZeroOffset() {
  Wire.beginTransmission(config::SCALES_ADDRESS);
  Wire.write(0x50);
  Wire.write(1);
  return Wire.endTransmission() == 0;
}
}  // namespace plantory::sensor
