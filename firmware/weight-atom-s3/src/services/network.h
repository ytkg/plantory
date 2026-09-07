#pragma once
namespace plantory::network {
using WaitHandler = void (*)();
bool connectWifi(WaitHandler onWait);
bool isConnected();
void beginOta();
void handleOta();
}  // namespace plantory::network
