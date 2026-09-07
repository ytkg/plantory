#pragma once
#include "app/app_state.h"
namespace plantory::api {
bool fetchPlantName(AppState& state);
bool sendWeight(float value);
}  // namespace plantory::api
