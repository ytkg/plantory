#include <Arduino.h>
#include <Wire.h>

namespace {
constexpr uint8_t CAMERA_I2C_ADDRESS = 0x1f;
constexpr int CAMERA_SDA_PIN = 17;
constexpr int CAMERA_SCL_PIN = 41;

uint8_t readCameraVersion() {
  Wire.beginTransmission(CAMERA_I2C_ADDRESS);
  Wire.write(0x02);
  Wire.write(0x00);
  if (Wire.endTransmission(false) != 0) {
    return 0x00;
  }

  if (Wire.requestFrom(CAMERA_I2C_ADDRESS, static_cast<uint8_t>(1)) == 1 && Wire.available()) {
    return Wire.read();
  }

  return 0x00;
}
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Wire.begin(CAMERA_SDA_PIN, CAMERA_SCL_PIN);
  Serial.println("Unit CamS3 5MP hardware check");
}

void loop() {
  const uint8_t version = readCameraVersion();
  if (version == 0x01) {
    Serial.println("New hardware (0x01): standard camera driver supported");
  } else if (version == 0xff) {
    Serial.println("Old hardware (0xFF): M5Stack camera driver required");
  } else {
    Serial.printf("Could not identify hardware (0x%02X)\n", version);
  }
  delay(1000);
}
