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

bool scheduledSendIsDue(unsigned long now) {
  struct tm current;
  if (!appState.timeSynced || !plantory::network::isConnected() || !plantory::clock::getLocalTimeNow(current) ||
      current.tm_min != 0 || current.tm_sec >= 5 || now < uiState.messageUntil) {
    return false;
  }

  int slot = -1;
  for (size_t index = 0; index < plantory::config::SEND_HOUR_COUNT; ++index) {
    if (plantory::config::SEND_HOURS[index] == current.tm_hour) {
      slot = static_cast<int>(index);
      break;
    }
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
    if (plantory::network::isConnected()) {
      measureAndSend();
    } else {
      showTransientMessage("Wi-Fi未接続", now);
    }
  }

  if (scheduledSendIsDue(now)) measureAndSend();
}
