#pragma once

#include <Arduino.h>
#include <time.h>

namespace plantory::clock {

using WaitHandler = void (*)();

bool syncJst(WaitHandler onWait);
bool getLocalTimeNow(struct tm& localTime);
String formatTime(time_t timestamp);

}  // namespace plantory::clock
