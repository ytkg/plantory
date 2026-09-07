#pragma once
#include <stdint.h>
namespace plantory::network {
using WaitHandler = void (*)();
enum class ReconnectEvent { None, Attempting, Connected, Failed };
bool connectWifi(WaitHandler onWait);
bool isConnected();
void beginOta();
void handleOta();
void startReconnect();
ReconnectEvent updateReconnect();
bool reconnecting();
uint8_t reconnectAttempt();
}  // namespace plantory::network
