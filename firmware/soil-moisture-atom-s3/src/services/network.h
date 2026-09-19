#pragma once

#include <stdint.h>

namespace plantory::network {

using WaitHandler = void (*)();
using OtaStartHandler = void (*)();

enum class ReconnectEvent { None, Attempting, Connected, Failed };

bool connectWifi(WaitHandler onWait);
bool isConnected();
void beginOta();
void handleOta();
void setOtaStartHandler(OtaStartHandler handler);
bool otaInProgress();
void startReconnect();
ReconnectEvent updateReconnect();
bool reconnecting();
uint8_t reconnectAttempt();

}  // namespace plantory::network
