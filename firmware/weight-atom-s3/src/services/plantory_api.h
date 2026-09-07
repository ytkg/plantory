#pragma once
#include "app/app_state.h"
namespace plantory::api {
enum class LatestRecordResult { Failed, Missing, Found };
bool fetchPlantName(AppState& state);
LatestRecordResult fetchLatestRecord(AppState& state);
bool sendWeight(float value);
}  // namespace plantory::api
