#pragma once

namespace plantory::sensor {

using KeepAliveHandler = void (*)();

void begin();
int measureAverage(KeepAliveHandler keepAlive);

}  // namespace plantory::sensor
