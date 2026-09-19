#include "soil_sensor.h"

#include <Arduino.h>

#include "app/config.h"
#include "secrets.h"

namespace plantory::sensor {

void begin() {
  pinMode(SOIL_SENSOR_POWER_PIN, OUTPUT);
  powerOff();
  analogReadResolution(12);
}

void powerOff() {
  digitalWrite(SOIL_SENSOR_POWER_PIN, LOW);
}

namespace {
bool waitWhileKeepingAlive(unsigned long durationMs, KeepAliveHandler keepAlive) {
  const unsigned long startedAt = millis();
  while (millis() - startedAt < durationMs) {
    delay(25);
    if (keepAlive != nullptr && !keepAlive()) return false;
  }
  return true;
}
}  // namespace

bool measureAverage(int& average, KeepAliveHandler keepAlive) {
  digitalWrite(SOIL_SENSOR_POWER_PIN, HIGH);
  if (!waitWhileKeepingAlive(SOIL_SENSOR_STABILIZATION_MS, keepAlive)) {
    powerOff();
    return false;
  }

  long total = 0;
  for (size_t index = 0; index < config::MEASUREMENT_COUNT; ++index) {
    total += analogRead(SOIL_SENSOR_ANALOG_PIN);
    if (!waitWhileKeepingAlive(1000, keepAlive)) {
      powerOff();
      return false;
    }
  }
  powerOff();
  average = static_cast<int>(total / static_cast<long>(config::MEASUREMENT_COUNT));
  return true;
}

}  // namespace plantory::sensor
