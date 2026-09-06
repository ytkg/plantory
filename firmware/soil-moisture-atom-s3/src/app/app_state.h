#pragma once

#include <Arduino.h>
#include <time.h>

namespace plantory {

struct AppState {
  String plantName = "Plantory";
  time_t lastSentAt = 0;
  long lastAutoSlotKey = -1;
  int lastMeasuredValue = -1;
  int moisturePercentage = -1;
  bool timeSynced = false;
};

struct UiState {
  unsigned long lastDisplayAt = 0;
  unsigned long lastOrientationCheckAt = 0;
  unsigned long orientationCandidateSince = 0;
  unsigned long messageUntil = 0;
  bool mainScreenNeedsRedraw = false;
  String lastTimeSignature;
  int displayRotation = 2;
  int pendingRotation = -1;
};

}  // namespace plantory
