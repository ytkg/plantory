# M5Stack ATOM S3 Hello

M5Stack ATOM S3のディスプレイ中央に`Hello`と表示する最小サンプルです。

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
