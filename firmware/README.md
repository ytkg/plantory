# Plantory firmware

Plantory用のM5Stackファームウェアを管理する場所です。各ディレクトリは独立したPlatformIOプロジェクトです。

## プロジェクト

| ディレクトリ | 対象 | 用途 |
| --- | --- | --- |
| [`soil-moisture-atom-s3/`](soil-moisture-atom-s3/) | ATOM S3 + Earth Unit | 土壌水分を読み取り、`soil_moisture` としてPlantoryへ送信 |
| [`weight-atom-s3/`](weight-atom-s3/) | ATOM S3 + Unit Mini Scales（U177） | 重量を読み取り、`weight` としてPlantoryへ送信 |
| [`weight-m5stickc-plus2/`](weight-m5stickc-plus2/) | M5StickC PLUS2 + Unit Mini Scales（U177） | 重量を読み取り、`weight`としてPlantoryへ送信 |
| [`unit-cams3-5mp/`](unit-cams3-5mp/) | Unit CamS3 5MP | 自宅Wi-Fi上でライブプレビュー、音声、静止画取得を提供 |
| [`sample/`](sample/) | ATOM S3 | Wi-Fi接続と公開ステータス表示の動作確認用サンプル |

各プロジェクト固有の配線、設定、USB書き込み、OTA更新の手順は、それぞれのREADMEを参照してください。

送信するHTTP APIの契約は [metrics-api.md](metrics-api.md) を参照してください。

metricsを送信する3機種は、毎正時にPlantoryの共通設定を取得します。送信間隔は管理画面の「送信間隔」で変更します。起動直後は設定を取得せず、初期値は3時間おきです。取得後の値はメモリだけに保持し、取得失敗時も最後の値を使います。

## 送信スケジュールのテスト

リポジトリのルートで`npm run test:firmware`を実行すると、各機種の`metrics_schedule.h`をC++17コンパイラで検証します（依存パッケージ・実機・秘密情報は不要）。8種類の間隔、毎正時の取得、設定変更直後の送信、取得失敗、再起動、通信待ち、重複処理、年またぎを確認します。GitHub Actionsでも同じテストを実行します。

HTTP通信やデバイス固有部分を含むビルドは、各プロジェクトで`pio run -e usb -e ota`を実行します。

## APIキーの準備

M5Stackごとに、専用の `write` APIキーを1本発行します。

1. Plantoryへログインして、APIキー管理を開く。
2. 用途名には、端末と設置場所が分かる名前を入力する。例: `リビングのM5Stack`。
3. 権限は `write — 登録・取得` を選ぶ。
4. 発行直後に一度だけ表示されるキーを、端末の設定へ保存する。

キーはリポジトリ、ソースコード、スクリーンショットへ保存しません。端末ごとにキーを分けることで、端末の故障・紛失・交換時は該当キーだけを無効化できます。

## このディレクトリに置くもの

- M5Stack機種ごとのソースコード
- Wi-FiとAPIキーを端末に設定する方法
- 利用するセンサーの配線図とキャリブレーション手順
- ビルド・書き込み手順
