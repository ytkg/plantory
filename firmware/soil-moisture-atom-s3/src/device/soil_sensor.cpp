#include "soil_sensor.h"

#include <Arduino.h>

#include "app/config.h"
#include "secrets.h"

namespace plantory::sensor {

void begin() {
  analogReadResolution(12);
}

int measureAverage(KeepAliveHandler keepAlive) {
  long total = 0;
  for (size_t index = 0; index < config::MEASUREMENT_COUNT; ++index) {
    total += analogRead(SOIL_SENSOR_ANALOG_PIN);
    delay(1000);
    if (keepAlive != nullptr) keepAlive();
  }
  return static_cast<int>(total / static_cast<long>(config::MEASUREMENT_COUNT));
}

}  // namespace plantory::sensor
