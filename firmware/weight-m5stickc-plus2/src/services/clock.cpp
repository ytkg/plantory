#include "clock.h"

#include <time.h>

#include "app/config.h"
#include "services/network.h"

namespace plantory::clock {
bool syncJst(void (*onWait)()) {
  configTime(9 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  const unsigned long startedAt = millis();
  while (network::isConnected() && time(nullptr) < 100000 && millis() - startedAt < config::TIME_SYNC_TIMEOUT_MS) {
    delay(250);
    if (onWait != nullptr) onWait();
  }
  return time(nullptr) >= 100000;
}
bool getLocalTimeNow(struct tm& localTime) {
  const time_t now = time(nullptr);
  return now >= 100000 && localtime_r(&now, &localTime) != nullptr;
}
String formatTime(time_t timestamp) {
  if (timestamp == 0) return "--:--:--";
  struct tm localTime;
  if (!localtime_r(&timestamp, &localTime)) return "--:--:--";
  char buffer[9];
  strftime(buffer, sizeof(buffer), "%H:%M:%S", &localTime);
  return String(buffer);
}
String nextSendText(const struct tm& current) {
  for (size_t index = 0; index < config::SEND_HOUR_COUNT; ++index) {
    const int hour = config::SEND_HOURS[index];
    if (current.tm_hour < hour || (current.tm_hour == hour && current.tm_min == 0 && current.tm_sec < 1)) {
      char buffer[9];
      snprintf(buffer, sizeof(buffer), "%02d:00:00", hour);
      return String(buffer);
    }
  }
  return "00:00:00";
}
}  // namespace plantory::clock
