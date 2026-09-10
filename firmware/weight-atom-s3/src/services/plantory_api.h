#pragma once
#include "app/app_state.h"
namespace plantory::api {
bool fetchPlantName(AppState& state);
bool fetchMetricsInterval(int& intervalHours);
bool sendWeight(float value);
}  // namespace plantory::api
