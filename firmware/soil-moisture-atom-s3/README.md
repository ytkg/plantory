# Soil Moisture ATOM S3

M5Stack ATOM S3でEarth Unitの土壌水分を読み取り、Plantoryへ送信するファームウェアです。

起動直後と以降1時間ごとにPlantoryの最終記録を確認し、対象植物の記録から6時間以上空いているときだけ自動送信します。ADC値は送信時に1秒ごとに10回読み取り、その平均を`soil_moisture`として記録します。ダブルタップで任意の即時送信、2秒長押しで最大5回のWi-Fi再接続を開始できます。シングルタップは何もしません。送信成功後は相対水分量を再取得します。

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

`src/main.cpp`は起動・ボタン操作・最終記録に基づく送信判定の流れだけを担当します。Wi-FiとOTAは`src/services/network.*`、時刻は`src/services/clock.*`、Plantory APIは`src/services/plantory_api.*`、Earth UnitのADC読み取りは`src/device/soil_sensor.*`、画面描画は`src/ui/display.*`に分けています。設定値と画面・アプリの状態はそれぞれ`src/app/config.h`と`src/app/app_state.h`です。

## OTA更新

ATOM S3がWi-Fiに接続した状態で、次のコマンドを実行します。OTAパスワードは設定していません。

```bash
pio run -e ota --target upload
```

ホスト名は`soil-moisture-atom-s3.local`です。初回のOTA対応ファームウェアだけは、USBで書き込む必要があります。
