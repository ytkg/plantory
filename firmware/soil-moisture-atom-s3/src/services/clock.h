#pragma once

#include <Arduino.h>
#include <time.h>
#include "app/metrics_schedule.h"

namespace plantory::clock {

using WaitHandler = void (*)();

bool syncJst(WaitHandler onWait);
bool getLocalTimeNow(struct tm& localTime);
String formatTime(time_t timestamp);
String nextSendText(const struct tm& current, const MetricsSchedule& schedule);

}  // namespace plantory::clock
