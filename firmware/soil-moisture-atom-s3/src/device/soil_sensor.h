#pragma once

namespace plantory::sensor {

using KeepAliveHandler = bool (*)();

void begin();
void powerOff();
bool measureAverage(int& average, KeepAliveHandler keepAlive);

}  // namespace plantory::sensor
