#pragma once

#include "app/app_state.h"

namespace plantory::api {

enum class LatestRecordResult { Failed, Missing, Found };

bool fetchPlantName(AppState& state);
bool fetchMoisturePercentage(AppState& state);
LatestRecordResult fetchLatestRecord(AppState& state);
bool sendSoilMoisture(int value);

}  // namespace plantory::api
