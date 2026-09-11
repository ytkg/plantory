# Soil Moisture ATOM S3

M5Stack ATOM S3でEarth Unitの土壌水分を読み取り、Plantoryへ送信するファームウェアです。

毎正時にPlantoryの共通設定を取得し、日本時間の時刻が送信間隔の倍数に当たる場合だけ自動送信します（未取得時は3時間おき）。起動直後は設定取得・自動送信を行いません。ADC値は送信時に1秒ごとに10回読み取り、その平均を`soil_moisture`として記録します。ダブルタップで任意の即時送信、2秒長押しで最大5回のWi-Fi再接続を開始できます。シングルタップは何もしません。送信成功後は相対水分量を再取得します。

送信間隔の変更方法・取得失敗時の動作は[共通の送信間隔仕様](../metrics-api.md#送信間隔の取得)を参照してください。端末内の時刻判定と間隔の保持は`src/app/metrics_schedule.h`が担当します。

## 設定

```bash
cp include/secrets.example.h include/secrets.h
```

`include/secrets.h`にSSID、パスワード、`PLANT_ID`、端末専用の`PLANTORY_API_KEY`を設定します。このファイルはGit管理対象外です。

Earth UnitをATOM S3のHY2.0-4Pポートへ接続すると、白線（Analog Output）がG1（GPIO1）に入ります。

## PlatformIO

```bash
pio run
pio run -e usb --target upload
pio device monitor
```

## ソース構成

`src/main.cpp`は起動・ボタン操作・定時送信の流れだけを担当します。Wi-FiとOTAは`src/services/network.*`、時刻は`src/services/clock.*`、Plantory APIは`src/services/plantory_api.*`、Earth UnitのADC読み取りは`src/device/soil_sensor.*`、画面描画は`src/ui/display.*`に分けています。設定値と画面・アプリの状態はそれぞれ`src/app/config.h`と`src/app/app_state.h`です。

## OTA更新

ATOM S3がWi-Fiに接続した状態で、次のコマンドを実行します。OTAパスワードは設定していません。

```bash
pio run -e ota --target upload
```

ホスト名は`soil-moisture-atom-s3.local`です。初回のOTA対応ファームウェアだけは、USBで書き込む必要があります。
