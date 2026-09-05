#include <M5AtomS3.h>

void setup() {
  auto config = M5.config();
  M5.begin(config);

  M5.Display.clear(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextDatum(middle_center);
  M5.Display.setTextSize(2);
  M5.Display.drawString("Hello", M5.Display.width() / 2, M5.Display.height() / 2);
}

void loop() {
  M5.update();
}
