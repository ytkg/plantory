#pragma once

#include "app/app_state.h"

namespace plantory::api {

bool fetchPlantName(AppState& state);
bool sendSoilMoisture(int value);

}  // namespace plantory::api
