#pragma once

#include <Arduino.h>

#include "app/app_state.h"

namespace plantory::display {

void begin(UiState& ui);
void showMessage(const String& message);
void showMainScreen(const AppState& state, UiState& ui);
void refreshTimeIfNeeded(const AppState& state, UiState& ui);
void refreshOrientationIfNeeded(const AppState& state, UiState& ui, unsigned long now);

}  // namespace plantory::display
