# M5Stack ATOM S3 Hello

M5Stack ATOM S3でWi-Fiへ接続し、Plantoryの公開ステータスAPIから植物名と水分量を取得して表示するサンプルです。

起動時にWi-Fiへ接続し、植物名と水分量（%）を一覧表示します。その後60秒ごとに再取得します。

## Wi-Fi設定

秘密情報ファイルを作成してからビルドしてください。

```bash
cp include/secrets.example.h include/secrets.h
```

`include/secrets.h`に自分のSSIDとパスワードを設定します。このファイルはGit管理対象外です。

## PlatformIO

このディレクトリでビルド・書き込みを実行します。

```bash
pio run
pio run --target upload
pio device monitor
```

USB接続されたポートを自動検出できない場合は、`platformio.ini`に次を追加してポートを指定してください。

```ini
upload_port = /dev/cu.usbmodemXXXX
```
