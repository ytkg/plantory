#pragma once

#include "app/app_state.h"

namespace plantory::display {
void showMessage(const String& message);
void showMainScreen(const AppState& state);
}  // namespace plantory::display
