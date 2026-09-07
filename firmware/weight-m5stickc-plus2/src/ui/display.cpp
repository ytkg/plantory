#include "display.h"

#include <M5Unified.h>

#include "services/clock.h"

namespace plantory::display {
namespace {
void drawCenteredLines(const String& message, int centerY, uint8_t textSize) {
  const int lineHeight = 16 * textSize;
  int lineCount = 1;
  for (size_t index = 0; index < message.length(); ++index) if (message[index] == '\n') ++lineCount;
  int y = centerY - ((lineCount - 1) * lineHeight) / 2;
  int start = 0;
  while (start <= message.length()) {
    const int end = message.indexOf('\n', start);
    const String line = end < 0 ? message.substring(start) : message.substring(start, end);
    M5.Display.drawString(line, M5.Display.width() / 2, y);
    if (end < 0) break;
    start = end + 1;
    y += lineHeight;
  }
}
}  // namespace

void showMessage(const String& message) {
  M5.Display.clear(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setFont(&fonts::lgfxJapanGothic_12);
  M5.Display.setTextSize(1);
  drawCenteredLines(message, M5.Display.height() / 2, 1);
}
void showMainScreen(const AppState& state) {
  struct tm current;
  const bool hasTime = state.timeSynced && clock::getLocalTimeNow(current);
  M5.Display.clear(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setFont(&fonts::lgfxJapanGothic_12);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setTextSize(1);
  M5.Display.drawString(state.plantName, M5.Display.width() / 2, 15);
  M5.Display.drawString("重量", M5.Display.width() / 2, 37);
  const String weightText = isnan(state.lastMeasuredValue)
                                ? "--g"
                                : String(lroundf(state.lastMeasuredValue)) + "g";
  M5.Display.setTextSize(weightText.length() <= 6 ? 3 : 2);
  M5.Display.setTextColor(TFT_GREEN, TFT_BLACK);
  M5.Display.drawString(weightText, M5.Display.width() / 2, 78);
  M5.Display.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  M5.Display.setTextSize(1);
  M5.Display.drawString(hasTime ? "現在: " + clock::formatTime(time(nullptr)) : "現在: 未同期", M5.Display.width() / 2, 119);
  M5.Display.drawString(hasTime ? "次回: " + clock::nextSendText(current) : "次回: --:--:--", M5.Display.width() / 2, 145);
  M5.Display.drawString("最終: " + clock::formatTime(state.lastSentAt), M5.Display.width() / 2, 171);
  M5.Display.setTextColor(TFT_DARKGREY, TFT_BLACK);
  M5.Display.drawString("短押し:ゼロ  ダブル:送信", M5.Display.width() / 2, 207);
  M5.Display.drawString("長押し:Wi-Fi再接続", M5.Display.width() / 2, 225);
}
}  // namespace plantory::display
