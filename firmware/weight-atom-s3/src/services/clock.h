#pragma once
#include <Arduino.h>
#include <time.h>
namespace plantory::clock {
bool syncJst(void (*onWait)());
bool getLocalTimeNow(struct tm& localTime);
String formatTime(time_t timestamp);
}  // namespace plantory::clock
