#pragma once

#include <time.h>

namespace plantory {

// RAM-only state. A new instance always starts with the three-hour default.
class MetricsSchedule {
 public:
  void start(const struct tm& current) { lastHourKey_ = hourKey(current); }
  int intervalHours() const { return intervalHours_; }

  template <typename FetchSettings>
  bool onHour(const struct tm current, FetchSettings fetchSettings) {
    if (lastHourKey_ < 0) {
      // First valid clock reading after startup only arms the schedule.
      start(current);
      return false;
    }
    const long key = hourKey(current);
    if (key <= lastHourKey_) return false;
    // Mark the hour before any I/O; an error must not cause repeated GETs.
    lastHourKey_ = key;
    if (current.tm_min != 0) return false;

    int fetchedInterval = intervalHours_;
    if (fetchSettings(fetchedInterval)) intervalHours_ = fetchedInterval;
    // Keep the triggering hour even if the request crosses a time boundary.
    return current.tm_hour % intervalHours_ == 0;
  }

  int nextSendHour(const struct tm& current) const {
    for (int hour = current.tm_hour + 1; hour < 24; ++hour) {
      if (hour % intervalHours_ == 0) return hour;
    }
    return 0;
  }

 private:
  static long hourKey(const struct tm& current) {
    return (static_cast<long>(current.tm_year) * 366 + current.tm_yday) * 24 + current.tm_hour;
  }

  int intervalHours_ = 3;
  long lastHourKey_ = -1;
};

}  // namespace plantory
