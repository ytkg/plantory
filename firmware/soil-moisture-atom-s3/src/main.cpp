#include <M5AtomS3.h>
#include <time.h>

#include "app/app_state.h"
#include "app/config.h"
#include "device/soil_sensor.h"
#include "services/clock.h"
#include "services/network.h"
#include "services/plantory_api.h"
#include "ui/display.h"

namespace {
plantory::AppState appState;
plantory::UiState uiState;
plantory::ButtonState buttonState;

void updateM5() {
  M5.update();
}

void keepAlive() {
  M5.update();
  plantory::network::handleOta();
}

void showTransientMessage(const String& message, unsigned long now) {
  plantory::display::showMessage(message);
  uiState.messageUntil = now + plantory::config::MESSAGE_DISPLAY_MS;
  uiState.mainScreenNeedsRedraw = true;
}

void measureAndSend() {
  plantory::display::showMessage("測定中…");
  appState.lastMeasuredValue = plantory::sensor::measureAverage(keepAlive);

  plantory::display::showMessage("送信中…");
  if (plantory::network::isConnected() && plantory::api::sendSoilMoisture(appState.lastMeasuredValue)) {
    appState.lastSentAt = time(nullptr);
    if (plantory::api::fetchMoisturePercentage(appState)) {
      plantory::display::showMessage("送信完了\n水分量: " + String(appState.moisturePercentage) + "%");
    } else {
      plantory::display::showMessage("送信完了\n水分量取得失敗");
    }
  } else {
    plantory::display::showMessage("送信失敗");
  }

  uiState.messageUntil = millis() + plantory::config::MESSAGE_DISPLAY_MS;
  uiState.mainScreenNeedsRedraw = true;
}

void showReconnectProgress() {
  plantory::display::showMessage("Wi-Fi再接続\n" + String(plantory::network::reconnectAttempt()) + "/" +
                                 String(plantory::config::WIFI_RECONNECT_MAX_ATTEMPTS));
}

void handleReconnectEvent(unsigned long now) {
  switch (plantory::network::updateReconnect()) {
    case plantory::network::ReconnectEvent::Attempting:
      showReconnectProgress();
      break;
    case plantory::network::ReconnectEvent::Connected:
      plantory::network::beginOta();
      plantory::api::fetchPlantName(appState);
      if (plantory::api::fetchMoisturePercentage(appState)) {
        showTransientMessage("Wi-Fi接続完了", now);
      } else {
        showTransientMessage("Wi-Fi接続完了\n水分量取得失敗", now);
      }
      break;
    case plantory::network::ReconnectEvent::Failed:
      showTransientMessage("Wi-Fi接続失敗", now);
      break;
    case plantory::network::ReconnectEvent::None:
      break;
  }
}

bool scheduledSendIsDue(unsigned long now) {
  struct tm current;
  if (!appState.timeSynced || !plantory::network::isConnected() || !plantory::clock::getLocalTimeNow(current) ||
      current.tm_min != 0 || current.tm_sec >= 5 || now < uiState.messageUntil) {
    return false;
  }
  int slot = -1;
  for (size_t index = 0; index < plantory::config::SEND_HOUR_COUNT; ++index) {
    if (plantory::config::SEND_HOURS[index] == current.tm_hour) { slot = static_cast<int>(index); break; }
  }
  if (slot < 0) return false;
  const long slotKey = static_cast<long>(current.tm_yday) * static_cast<long>(plantory::config::SEND_HOUR_COUNT) + slot;
  if (slotKey == appState.lastAutoSlotKey) return false;
  appState.lastAutoSlotKey = slotKey;
  return true;
}
}  // namespace

void setup() {
  auto m5Config = M5.config();
  M5.begin(m5Config);

  plantory::display::begin(uiState);
  plantory::sensor::begin();
  plantory::display::showMessage("Wi-Fi…");

  plantory::network::connectWifi(updateM5);
  appState.timeSynced = plantory::clock::syncJst(updateM5);
  if (plantory::network::isConnected()) plantory::api::fetchPlantName(appState);
  plantory::network::beginOta();

  if (plantory::network::isConnected() && !plantory::api::fetchMoisturePercentage(appState)) {
    showTransientMessage("水分量取得失敗", millis());
  } else {
    plantory::display::showMainScreen(appState, uiState);
  }
}

void loop() {
  M5.update();
  plantory::network::handleOta();

  const unsigned long now = millis();
  handleReconnectEvent(now);
  const bool showingMessage = now < uiState.messageUntil;
  if (!showingMessage) plantory::display::refreshOrientationIfNeeded(appState, uiState, now);

  if (!showingMessage && uiState.mainScreenNeedsRedraw) {
    plantory::display::showMainScreen(appState, uiState);
    uiState.mainScreenNeedsRedraw = false;
  }

  if (!showingMessage && now - uiState.lastDisplayAt >= plantory::config::CLOCK_CHECK_MS) {
    plantory::display::refreshTimeIfNeeded(appState, uiState);
    uiState.lastDisplayAt = now;
  }

  if (M5.BtnA.wasPressed() && !showingMessage) {
    buttonState.pressActive = true;
    buttonState.longPressHandled = false;
    buttonState.pressedAt = now;
  }

  if (buttonState.pressActive && M5.BtnA.isPressed() && !buttonState.longPressHandled &&
      now - buttonState.pressedAt >= plantory::config::LONG_PRESS_MS) {
    buttonState.longPressHandled = true;
    buttonState.singleTapPending = false;
    plantory::network::startReconnect();
    showReconnectProgress();
  }

  if (buttonState.pressActive && M5.BtnA.wasReleased()) {
    buttonState.pressActive = false;
    if (!buttonState.longPressHandled) {
      if (buttonState.singleTapPending && now - buttonState.firstTapAt <= plantory::config::DOUBLE_TAP_WINDOW_MS) {
        buttonState.singleTapPending = false;
        if (plantory::network::isConnected()) {
          measureAndSend();
        } else {
          showTransientMessage("Wi-Fi未接続", now);
        }
      } else {
        buttonState.singleTapPending = true;
        buttonState.firstTapAt = now;
      }
    }
  }

  if (buttonState.singleTapPending && now - buttonState.firstTapAt > plantory::config::DOUBLE_TAP_WINDOW_MS) {
    buttonState.singleTapPending = false;
  }

  if (scheduledSendIsDue(now)) measureAndSend();
}
