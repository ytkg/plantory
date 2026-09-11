#include <cassert>
#include <iostream>
#include "app/metrics_schedule.h"

using plantory::MetricsSchedule;

static struct tm at(int day, int hour, int minute = 0, int second = 0, int year = 126) {
  struct tm value = {};
  value.tm_year = year;
  value.tm_yday = day;
  value.tm_hour = hour;
  value.tm_min = minute;
  value.tm_sec = second;
  return value;
}

int main() {
  const auto unavailable = [](int&) { return false; };
  for (const int interval : {1, 2, 3, 4, 6, 8, 12, 24}) {
    MetricsSchedule schedule;
    schedule.start(at(0, 23, 30));
    int fetches = 0;
    for (int hour = 0; hour < 24; ++hour) {
      const auto fetch = [&](int& value) { ++fetches; value = interval; return true; };
      assert(schedule.onHour(at(1, hour), fetch) == (hour % interval == 0));
      assert(!schedule.onHour(at(1, hour, 0, 2), fetch));
      assert(!schedule.onHour(at(1, hour, 30), fetch));
      assert(schedule.intervalHours() == interval);
      const int next = schedule.nextSendHour(at(1, hour));
      assert(next == ((hour / interval + 1) * interval) % 24);
    }
    assert(fetches == 24);
  }

  // Startup at a scheduled hour does not GET or send, even with repeated loops.
  for (const auto startup : {at(1, 14, 30), at(1, 15), at(1, 15, 0, 3)}) {
    MetricsSchedule schedule;
    int fetches = 0;
    const auto fetch = [&](int& value) { ++fetches; value = 1; return true; };
    assert(!schedule.onHour(startup, fetch));
    assert(!schedule.onHour(startup, fetch));
    assert(fetches == 0);
    assert(schedule.intervalHours() == 3);
    assert(schedule.onHour(at(1, startup.tm_hour + 1), fetch));
    assert(fetches == 1);
  }

  // The new setting is used during the same hour it was fetched.
  MetricsSchedule changes;
  changes.start(at(1, 13, 30));
  assert(!changes.onHour(at(1, 14), [](int& value) { value = 6; return true; }));
  assert(changes.nextSendHour(at(1, 14, 30)) == 18);
  assert(changes.onHour(at(1, 15), [](int& value) { value = 3; return true; }));
  assert(changes.nextSendHour(at(1, 15)) == 18);
  assert(!changes.onHour(at(1, 15), [](int&) { assert(false); return true; }));
  assert(!changes.onHour(at(1, 16), [](int& value) { value = 24; return true; }));
  assert(changes.nextSendHour(at(1, 16)) == 0);
  assert(changes.onHour(at(2, 0), unavailable));

  // Failed initial fetch uses 3h; later failures keep the last successful value.
  MetricsSchedule failures;
  failures.start(at(1, 14, 59));
  assert(failures.onHour(at(1, 15), unavailable));
  assert(failures.intervalHours() == 3);
  assert(failures.onHour(at(1, 16), [](int& value) { value = 2; return true; }));
  assert(!failures.onHour(at(1, 17), [](int& value) { value = 24; return false; }));
  assert(failures.intervalHours() == 2);
  assert(failures.onHour(at(1, 18), unavailable));
  MetricsSchedule rebooted;
  rebooted.start(at(1, 18));
  assert(rebooted.intervalHours() == 3);
  assert(!rebooted.onHour(at(1, 19), unavailable));
  assert(rebooted.onHour(at(1, 21), unavailable));

  // Request latency cannot change the hour used for the send decision.
  MetricsSchedule delayed;
  delayed.start(at(1, 14, 59));
  auto current = at(1, 15);
  assert(delayed.onHour(current, [&](int& value) {
    current = at(1, 16, 1);
    value = 3;
    return true;
  }));
  assert(!delayed.onHour(current, [](int&) { assert(false); return false; }));

  // A busy loop can observe xx:00 late, but missed hours aren't replayed.
  MetricsSchedule busy;
  busy.start(at(1, 14, 59));
  assert(busy.onHour(at(1, 15, 0, 12), unavailable));
  assert(!busy.onHour(at(1, 16, 1), [](int&) { assert(false); return false; }));
  assert(!busy.onHour(at(1, 18, 2), [](int&) { assert(false); return false; }));
  assert(!busy.onHour(at(1, 17), [](int&) { assert(false); return false; }));
  assert(busy.onHour(at(1, 21), unavailable));

  // Year and date boundaries have distinct keys, including leap years.
  MetricsSchedule yearEnd;
  yearEnd.start(at(365, 23, 59, 59, 128));
  assert(yearEnd.onHour(at(0, 0, 0, 0, 129), unavailable));
  assert(!yearEnd.onHour(at(0, 0, 0, 1, 129), unavailable));
  assert(yearEnd.onHour(at(0, 3, 0, 0, 129), unavailable));
  assert(yearEnd.nextSendHour(at(0, 23)) == 0);

  std::cout << "PASS: 8 intervals, hourly GET, same-hour changes, defaults, failures, reboot, latency, startup, duplicates, clock rollback and year rollover\n";
}
