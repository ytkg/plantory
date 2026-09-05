# Weight ATOM S3

M5Stack ATOM S3でUnit Mini Scales（U177）の重量を読み取り、Plantoryへ送信するファームウェアです。

重量をグラムで1秒ごとに大きく表示します。ゼロ付近（±1.0g）は`0.0g`として扱います。日本時間の0/6/12/18時とATOM S3の画面を1回タップしたときに、100ms間隔で10回測定した平均を`weight`として送信します。

画面を350ms以内に2回タップすると、現在の荷重をゼロ点として調整します。Mini Scales本体のボタンを使う必要はありません。

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
