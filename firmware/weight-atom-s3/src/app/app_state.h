#pragma once

#include <Arduino.h>
#include <time.h>

namespace plantory {
struct AppState {
  String plantName = "Plantory";
  time_t lastRecordedAt = 0;
  unsigned long lastStatusCheckAt = 0;
  bool statusChecked = false;
  float lastMeasuredValue = NAN;
  bool timeSynced = false;
  bool scalesReady = false;
  uint8_t readFailureCount = 0;
};
struct UiState { unsigned long lastDisplayAt = 0; unsigned long messageUntil = 0; };
struct ButtonState {
  unsigned long pressedAt = 0;
  unsigned long firstTapAt = 0;
  bool pressActive = false;
  bool longPressHandled = false;
  bool singleTapPending = false;
};
}  // namespace plantory
