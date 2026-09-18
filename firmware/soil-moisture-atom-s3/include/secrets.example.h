#pragma once

#define WIFI_SSID "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"
#define PLANT_ID 1
#define PLANTORY_API_KEY "plnt_your_write_api_key"
#define SOIL_SENSOR_ANALOG_PIN 1
// 外付け電源スイッチのEN端子。HIGHでEarth Unitへの給電を開始する。
#define SOIL_SENSOR_POWER_PIN 2
// 給電開始から最初のADC読み取りまでの待機時間（実機で調整する）。
#define SOIL_SENSOR_STABILIZATION_MS 1000
