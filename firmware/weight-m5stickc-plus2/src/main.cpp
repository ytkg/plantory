#include <M5Unified.h>
#include <time.h>

#include "app/app_state.h"
#include "app/config.h"
#include "device/weight_sensor.h"
#include "services/clock.h"
#include "services/network.h"
#include "services/plantory_api.h"
#include "ui/display.h"

namespace {
plantory::AppState appState;
plantory::UiState uiState;
plantory::ButtonState buttonState;

void updateM5() { M5.update(); }
void keepAlive() {
  M5.update();
  plantory::network::handleOta();
}
void showTransientMessage(const String& message, unsigned long now) {
  plantory::display::showMessage(message);
  uiState.messageUntil = now + plantory::config::MESSAGE_DISPLAY_MS;
}
void measureAndSend() {
  plantory::display::showMessage("測定中…");
  appState.lastMeasuredValue = plantory::sensor::measureAverage(keepAlive);
  if (!std::isfinite(appState.lastMeasuredValue)) {
    showTransientMessage("測定失敗", millis());
    return;
  }
  plantory::display::showMessage("送信中…");
  if (plantory::network::isConnected() && plantory::api::sendWeight(appState.lastMeasuredValue)) {
    appState.lastSentAt = time(nullptr);
    showTransientMessage("送信完了\n重量: " + String(lroundf(appState.lastMeasuredValue)) + "g", millis());
  } else {
    showTransientMessage("送信失敗", millis());
  }
}
void showReconnectProgress() {
  plantory::display::showMessage("Wi-Fi再接続\n" + String(plantory::network::reconnectAttempt()) + "/" + String(plantory::config::WIFI_RECONNECT_MAX_ATTEMPTS));
}
void handleReconnectEvent(unsigned long now) {
  switch (plantory::network::updateReconnect()) {
    case plantory::network::ReconnectEvent::Attempting: showReconnectProgress(); break;
    case plantory::network::ReconnectEvent::Connected:
      plantory::network::beginOta(); plantory::api::fetchPlantName(appState); showTransientMessage("Wi-Fi接続完了", now); break;
    case plantory::network::ReconnectEvent::Failed: showTransientMessage("Wi-Fi接続失敗", now); break;
    case plantory::network::ReconnectEvent::None: break;
  }
}
bool scheduledSendIsDue() {
  struct tm current;
  if (!plantory::clock::getLocalTimeNow(current)) return false;
  appState.timeSynced = true;
  const bool due = appState.metricsSchedule.onHour(current, [](int& intervalHours) {
    return plantory::network::isConnected() && plantory::api::fetchMetricsInterval(intervalHours);
  });
  return due && appState.scalesReady && plantory::network::isConnected();
}
}  // namespace

void setup() {
  auto m5Config = M5.config(); M5.begin(m5Config); M5.Display.setRotation(0); M5.Display.setFont(&fonts::lgfxJapanGothic_12); Serial.begin(115200);
  plantory::display::showMessage("センサー…");
  appState.scalesReady = plantory::sensor::begin();
  if (!appState.scalesReady) plantory::display::showMessage("センサー未接続");
  plantory::network::connectWifi(updateM5);
  appState.timeSynced = plantory::clock::syncJst(updateM5);
  if (plantory::network::isConnected()) plantory::api::fetchPlantName(appState);
  plantory::network::beginOta();
  plantory::display::showMainScreen(appState);
  struct tm current;
  if (plantory::clock::getLocalTimeNow(current)) appState.metricsSchedule.start(current);
}

void loop() {
  M5.update(); plantory::network::handleOta();
  if (scheduledSendIsDue()) measureAndSend();
  const unsigned long now = millis();
  handleReconnectEvent(now);
  if (appState.scalesReady && now - uiState.lastDisplayAt >= plantory::config::DISPLAY_REFRESH_MS && now >= uiState.messageUntil) {
    appState.lastMeasuredValue = plantory::sensor::normalize(plantory::sensor::readGrams());
    if (isnan(appState.lastMeasuredValue)) { if (++appState.readFailureCount >= 5) appState.scalesReady = false; } else { appState.readFailureCount = 0; }
    plantory::display::showMainScreen(appState); uiState.lastDisplayAt = now;
  }
  if (!appState.scalesReady && now - uiState.lastDisplayAt >= plantory::config::DISPLAY_REFRESH_MS) {
    appState.scalesReady = plantory::sensor::begin(); if (appState.scalesReady) appState.readFailureCount = 0; uiState.lastDisplayAt = now;
  }
  if (M5.BtnA.wasPressed() && now >= uiState.messageUntil) {
    buttonState.pressActive = true; buttonState.longPressHandled = false; buttonState.pressedAt = now;
  }
  if (buttonState.pressActive && M5.BtnA.isPressed() && !buttonState.longPressHandled && now - buttonState.pressedAt >= plantory::config::LONG_PRESS_MS) {
    buttonState.longPressHandled = true; buttonState.singleTapPending = false; plantory::network::startReconnect(); showReconnectProgress();
  }
  if (buttonState.pressActive && M5.BtnA.wasReleased()) {
    buttonState.pressActive = false;
    if (!buttonState.longPressHandled) {
      if (buttonState.singleTapPending && now - buttonState.firstTapAt <= plantory::config::DOUBLE_TAP_WINDOW_MS) {
        buttonState.singleTapPending = false;
        if (!appState.scalesReady) showTransientMessage("センサー未接続", now);
        else if (plantory::network::isConnected()) measureAndSend();
        else showTransientMessage("Wi-Fi未接続", now);
      } else { buttonState.singleTapPending = true; buttonState.firstTapAt = now; }
    }
  }
  if (buttonState.singleTapPending && now - buttonState.firstTapAt > plantory::config::DOUBLE_TAP_WINDOW_MS && now >= uiState.messageUntil) {
    buttonState.singleTapPending = false;
    if (appState.scalesReady && plantory::sensor::resetZeroOffset()) { appState.lastMeasuredValue = 0.0F; showTransientMessage("ゼロ調整完了", now); }
    else { showTransientMessage("ゼロ調整失敗", now); }
  }
}
