# Soil Moisture ATOM S3

M5Stack ATOM S3でEarth Unitの土壌水分を読み取り、Plantoryへ送信するファームウェアです。

起動時にWi-Fiへ接続して植物名を取得します。ADC値は1秒ごとに読み取り、直近10件の平均値を画面に表示します。毎分自動送信するほか、ATOM S3のボタンを押して任意のタイミングでも送信できます。送信値は`soil_moisture`として記録します。

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

## OTA更新

ATOM S3がWi-Fiに接続した状態で、次のコマンドを実行します。OTAパスワードは設定していません。

```bash
pio run -e ota --target upload
```

ホスト名は`soil-moisture-atom-s3.local`です。初回のOTA対応ファームウェアだけは、USBで書き込む必要があります。
