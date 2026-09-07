#include "network.h"

#include <ArduinoOTA.h>
#include <WiFi.h>

#include "app/config.h"
#include "secrets.h"

namespace plantory::network {
namespace {
bool reconnectActive = false;
uint8_t reconnectTry = 0;
unsigned long reconnectStartedAt = 0;
void beginReconnectAttempt() {
  ++reconnectTry;
  reconnectStartedAt = millis();
  WiFi.disconnect(false, false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}
}  // namespace

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
bool isConnected() { return WiFi.status() == WL_CONNECTED; }
void beginOta() {
  if (!isConnected()) return;
  ArduinoOTA.setHostname(config::OTA_HOSTNAME);
  ArduinoOTA.begin();
}
void handleOta() { ArduinoOTA.handle(); }
void startReconnect() {
  if (reconnectActive) return;
  WiFi.mode(WIFI_STA);
  reconnectActive = true;
  reconnectTry = 0;
  beginReconnectAttempt();
}
ReconnectEvent updateReconnect() {
  if (!reconnectActive) return ReconnectEvent::None;
  if (isConnected()) {
    reconnectActive = false;
    return ReconnectEvent::Connected;
  }
  if (millis() - reconnectStartedAt < config::WIFI_TIMEOUT_MS) return ReconnectEvent::None;
  if (reconnectTry >= config::WIFI_RECONNECT_MAX_ATTEMPTS) {
    reconnectActive = false;
    return ReconnectEvent::Failed;
  }
  beginReconnectAttempt();
  return ReconnectEvent::Attempting;
}
uint8_t reconnectAttempt() { return reconnectTry; }
}  // namespace plantory::network
