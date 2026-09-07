# Weight ATOM S3

M5Stack ATOM S3でUnit Mini Scales（U177）の重量を読み取り、Plantoryへ送信するファームウェアです。

重量をグラムで1秒ごとに大きく表示します。ゼロ付近（±1.0g）は`0.0g`として扱います。日本時間の0時・6時・12時・18時に自動送信し、起動直後に自動送信することはありません。ダブルタップで、100ms間隔で10回測定した平均を`weight`として即時送信します。2秒長押しでは最大5回のWi-Fi再接続を開始できます。

シングルタップで、現在の荷重をゼロ点として調整します。Mini Scales本体のボタンを使う必要はありません。

## ソース構成

`src/main.cpp`は起動・操作・定時送信を担当します。重量計測は`src/device/weight_sensor.*`、Wi-FiとOTAは`src/services/network.*`、時刻は`src/services/clock.*`、Plantory APIは`src/services/plantory_api.*`、画面描画は`src/ui/display.*`、状態と設定は`src/app/`に分けています。

## 設定

```bash
cp include/secrets.example.h include/secrets.h
```

`include/secrets.h`にSSID、パスワード、`PLANT_ID`、端末専用の`PLANTORY_API_KEY`を設定します。このファイルはGit管理対象外です。

Mini ScalesをHY2.0-4Pポートへ接続します。SDA=G2、SCL=G1、100kHz、アドレスは`0x26`です。

## PlatformIO

```bash
pio run
pio run -e usb --target upload
pio device monitor
```

## OTA更新

ATOM S3がWi-Fiに接続した状態で実行します。OTAパスワードは設定していません。

```bash
pio run -e ota --target upload
```

ホスト名は`weight-atom-s3.local`です。初回のOTA対応ファームウェアだけはUSBで書き込む必要があります。
