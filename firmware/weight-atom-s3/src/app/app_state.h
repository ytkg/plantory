#pragma once

#include <Arduino.h>
#include <time.h>

namespace plantory {
struct AppState {
  String plantName = "Plantory";
  time_t lastSentAt = 0;
  long lastAutoSlotKey = -1;
  float lastMeasuredValue = NAN;
  bool timeSynced = false;
  bool scalesReady = false;
  uint8_t readFailureCount = 0;
};
struct UiState { unsigned long lastDisplayAt = 0; unsigned long messageUntil = 0; };
struct ButtonState { unsigned long firstTapAt = 0; bool singleTapPending = false; };
}  // namespace plantory
