#pragma once

namespace plantory::sensor {
bool begin();
float readGrams();
float measureAverage(void (*keepAlive)());
float normalize(float value);
bool resetZeroOffset();
}  // namespace plantory::sensor
