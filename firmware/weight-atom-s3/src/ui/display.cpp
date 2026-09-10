#include "display.h"
#include <M5AtomS3.h>
#include "services/clock.h"
namespace plantory::display {
void showMessage(const String& message) {
  M5.Display.clear(TFT_BLACK); M5.Display.setTextColor(TFT_WHITE, TFT_BLACK); M5.Display.setTextDatum(middle_center); M5.Display.setFont(&fonts::lgfxJapanGothic_12); M5.Display.setTextSize(1); M5.Display.drawString(message, M5.Display.width() / 2, M5.Display.height() / 2);
}
void showMainScreen(const AppState& state) {
  struct tm current; const bool hasTime = state.timeSynced && clock::getLocalTimeNow(current);
  M5.Display.clear(TFT_BLACK); M5.Display.setTextColor(TFT_WHITE, TFT_BLACK); M5.Display.setFont(&fonts::lgfxJapanGothic_12); M5.Display.setTextDatum(middle_center); M5.Display.setTextSize(1);
  M5.Display.drawString(state.plantName, 64, 12); M5.Display.drawString("重量", 64, 28);
  const String weightText = isnan(state.lastMeasuredValue) ? "--g" : String(state.lastMeasuredValue, 1) + "g";
  M5.Display.setTextSize(weightText.length() <= 6 ? 2 : 1); M5.Display.drawString(weightText, 64, 46); M5.Display.setTextSize(1);
  M5.Display.drawString(hasTime ? "現在時刻: " + clock::formatTime(time(nullptr)) : "現在時刻: 未同期", 64, 74);
  M5.Display.drawString(hasTime ? "次回送信: " + clock::nextSendText(current, state.metricsSchedule) : "次回送信: --:--:--", 64, 94);
  M5.Display.drawString("最終送信: " + clock::formatTime(state.lastSentAt), 64, 114);
}
}  // namespace plantory::display
