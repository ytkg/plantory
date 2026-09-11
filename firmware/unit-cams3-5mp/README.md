# Unit CamS3 5MP

Unit CamS3 5MPを自宅Wi-Fiへ接続し、同じネットワーク上のブラウザでライブプレビューを確認するためのファームウェアです。

Unit CamS3 5MPの実機仕様に合わせ、16MB QIOフラッシュと8MB OPI PSRAMを明示した専用ボード設定を使います。

PY260カメラに対応するM5Stack由来のカメラドライバも、`lib/m5-esp32-camera` としてこのプロジェクトに同梱しています。

カメラは `http://plantory-camera.local/` で開けます。mDNSが使えない環境では、シリアル出力に表示されるIPアドレスを開きます。

ライブ映像と音声は最大3閲覧者が同時に利用できます。4人目はページ自体を開けますが、「接続上限です」と表示され、空きができるまで自動で再接続を試みます。Wi-Fiが一時的に切れた場合も5秒ごとに再接続を試みます。`.local`名だけが開けない場合は、シリアル出力のIPアドレスで本体とmDNSを切り分けてください。

長時間・複数端末の検証手順と、未確認事項は[接続安定性の調査記録](connection-investigation.md)に記録します。

Wi-Fiへ接続できない場合は、`Plantory-Cam-Setup` という一時アクセスポイントを開きます。接続後、`http://192.168.4.1/` を開いてカメラを確認できます。

## 設定

```bash
cp include/secrets.example.h include/secrets.h
```

`include/secrets.h` に自宅Wi-FiのSSIDとパスワードを設定します。このファイルはGit管理対象外です。

## 書き込み

Unit CamS3 5MPでは、付属のGrove2USB-CでMacへ接続します。書き込みモードに入れるため、電源接続前に基板上のG0とGNDをジャンパ線で短絡してください。

```bash
pio run -e usb --target upload
pio device monitor
```

書き込みが終わったらG0とGNDのジャンパ線を外し、カメラを再起動します。

## Wi-Fi経由の更新（OTA）

最初にUSBでこのファームウェアを書き込んだ後は、カメラとMacが同じ自宅Wi-Fiに接続されていれば、ジャンパ線もUSBも不要です。

```bash
pio run -e ota --target upload
```

OTAの宛先は `plantory-camera.local` です。mDNSで見つからないときは、カメラのシリアル出力でIPアドレスを確認し、次のように指定します。

```bash
pio run -e ota --target upload --upload-port 192.168.x.x
```

## ハードウェア確認

Unit CamS3 5MPにはカメラドライバが異なる2種類のハードウェアがあります。確認用プログラムは次で書き込みます。書き込み手順はUSB書き込みと同じです。

```bash
pio run -e hardware-check --target upload
pio device monitor --port /dev/cu.usbmodem14401 --baud 115200
```
