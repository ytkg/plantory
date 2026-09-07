# Weight M5StickC PLUS2

M5StickC PLUS2でUnit Mini Scales（U177）の重量を読み取り、Plantoryへ送信するファームウェアです。

USB Type-C端子を下にした縦画面へ重量を1秒ごとに整数グラムで表示します。ゼロ付近（±1.0g）は`0g`として扱い、表示・Plantoryへの送信値は四捨五入します。日本時間の0時・6時・12時・18時に自動送信し、起動直後に自動送信することはありません。

BtnAの短押しはゼロ点調整、ダブルタップは100ms間隔で10回測定した平均の即時送信、2秒長押しは最大5回のWi-Fi再接続です。Mini Scales本体のボタンを使う必要はありません。

## 設定

```bash
cp include/secrets.example.h include/secrets.h
```

`include/secrets.h`にSSID、パスワード、`PLANT_ID`、端末専用の`PLANTORY_API_KEY`を設定します。このファイルはGit管理対象外です。

## 接続

Mini ScalesをM5StickC PLUS2のHY2.0-4P（Grove）ポートへ接続します。

| 信号 | M5StickC PLUS2 |
| --- | --- |
| SDA | G32 |
| SCL | G33 |
| 電源 | 5V / GND |

## ビルド・USB書き込み

```bash
pio run
pio run -e usb --target upload
pio device monitor
```

画面が上下逆なら、`src/main.cpp`の`setRotation(0)`を`setRotation(2)`へ変更して確認します。

## OTA更新

M5StickC PLUS2がWi-Fiに接続した状態で実行します。OTAパスワードは設定していません。OTA用に2つのアプリ領域を確保しており、更新中に電源が切れても、直前のファームウェアを残せます。

```bash
pio run -e ota --target upload
```

ホスト名は`weight-m5stickc-plus2.local`です。初回のOTA対応ファームウェアだけはUSBで書き込む必要があります。
