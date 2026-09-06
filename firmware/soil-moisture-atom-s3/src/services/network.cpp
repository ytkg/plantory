#include "network.h"

#include <ArduinoOTA.h>
#include <WiFi.h>

#include "app/config.h"
#include "secrets.h"

namespace plantory::network {

bool connectWifi(WaitHandler onWait) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < config::WIFI_TIMEOUT_MS) {
    delay(250);
    if (onWait != nullptr) onWait();
  }
  return isConnected();
}

bool isConnected() {
  return WiFi.status() == WL_CONNECTED;
}

void beginOta() {
  if (!isConnected()) return;
  ArduinoOTA.setHostname(config::OTA_HOSTNAME);
  ArduinoOTA.begin();
}

void handleOta() {
  ArduinoOTA.handle();
}

}  // namespace plantory::network
