#include "display.h"

#include <M5AtomS3.h>
#include <math.h>
#include <time.h>

#include "app/config.h"
#include "services/clock.h"

namespace plantory::display {
namespace {

void drawTimeLines(const AppState& state) {
  struct tm current;
  const bool hasTime = state.timeSynced && clock::getLocalTimeNow(current);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setFont(&fonts::lgfxJapanGothic_12);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setTextSize(1);
  M5.Display.fillRect(0, 60, M5.Display.width(), 64, TFT_BLACK);
  M5.Display.drawString(hasTime ? "現在時刻: " + clock::formatTime(time(nullptr)) : "現在時刻: 未同期", 64, 72);
  M5.Display.drawString(hasTime ? "次回送信: " + clock::nextSendText(current) : "次回送信: --:--:--", 64, 92);
  M5.Display.drawString("最終送信: " + clock::formatTime(state.lastSentAt), 64, 112);
}

String timeSignature(const AppState& state) {
  struct tm current;
  const bool hasTime = state.timeSynced && clock::getLocalTimeNow(current);
  return (hasTime ? clock::formatTime(time(nullptr)) : "未同期") + "|" +
         (hasTime ? clock::nextSendText(current) : "--:--:--") + "|" +
         clock::formatTime(state.lastSentAt);
}

int rotationForCurrentOrientation() {
  if (!M5.Imu.update()) return -1;
  const auto data = M5.Imu.getImuData();
  const float x = data.accel.x;
  const float y = data.accel.y;
  if (fabsf(x) < config::VERTICAL_ACCELERATION_THRESHOLD &&
      fabsf(y) < config::VERTICAL_ACCELERATION_THRESHOLD) {
    return -1;
  }
  if (fabsf(x) > fabsf(y)) return x > 0 ? 1 : 3;
  return y > 0 ? 0 : 2;
}

}  // namespace

void begin(UiState& ui) {
  M5.Display.setRotation(ui.displayRotation);
}

void showMessage(const String& message) {
  M5.Display.clear(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setFont(&fonts::lgfxJapanGothic_12);
  M5.Display.setTextSize(1);
  M5.Display.drawString(message, M5.Display.width() / 2, M5.Display.height() / 2);
}

void showMainScreen(const AppState& state, UiState& ui) {
  M5.Display.clear(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setFont(&fonts::lgfxJapanGothic_12);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setTextSize(1.25F);
  M5.Display.drawString(state.plantName, 64, 18);
  M5.Display.setTextSize(2);
  M5.Display.drawString(state.lastMeasuredValue < 0 ? "ADC --" : "ADC " + String(state.lastMeasuredValue), 64, 44);
  drawTimeLines(state);
  ui.lastTimeSignature = timeSignature(state);
}

void refreshTimeIfNeeded(const AppState& state, UiState& ui) {
  const String currentSignature = timeSignature(state);
  if (currentSignature == ui.lastTimeSignature) return;
  drawTimeLines(state);
  ui.lastTimeSignature = currentSignature;
}

void refreshOrientationIfNeeded(const AppState& state, UiState& ui, unsigned long now) {
  if (now - ui.lastOrientationCheckAt < config::ORIENTATION_CHECK_MS) return;
  ui.lastOrientationCheckAt = now;

  const int candidate = rotationForCurrentOrientation();
  if (candidate < 0) {
    ui.pendingRotation = -1;
    return;
  }
  if (candidate != ui.pendingRotation) {
    ui.pendingRotation = candidate;
    ui.orientationCandidateSince = now;
    return;
  }
  if (candidate == ui.displayRotation ||
      now - ui.orientationCandidateSince < config::ORIENTATION_STABLE_MS) {
    return;
  }

  ui.displayRotation = candidate;
  M5.Display.setRotation(ui.displayRotation);
  showMainScreen(state, ui);
}

}  // namespace plantory::display
