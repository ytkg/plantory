# metrics送信API

M5Stackは、測定値ごとにPlantoryのREST APIへ `POST` します。送信には、その端末専用の `write` APIキーを使います。

## リクエスト

```text
POST https://plantory.ytkg.workers.dev/api/plants/:plantId/metrics
Authorization: Bearer plnt_...
Content-Type: application/json
```

`:plantId` は、Plantoryで登録済みの植物IDです。

本文は次のJSONです。

```json
{
  "metric_type": "soil_moisture",
  "value": 62.4
}
```

- `metric_type` は先頭を小文字にした1〜50文字の小文字・数字・アンダースコアで指定する。
- `value` は有限の数値で指定する。
- 1回のリクエストで送るmetricsは1件だけにする。
- 計測時刻は送らない。Plantoryが受信時刻を `created_at` として保存する。
- 単位も送らない。グラフで分かるように、`metric_type` を用途ごとに統一する。

水分量の算出には`soil_moisture`を優先し、なければ`weight`を使います。ほかの`metric_type`も保存でき、計測データページでは生値として確認できます。種類ごとの表示名や単位を推測しないため、端末ごとに`metric_type`を統一します。

## 成功と失敗

成功時は `201 Created` と保存されたmetricを返します。

```json
{
  "metric": {
    "id": 1,
    "plant_id": 2,
    "metric_type": "soil_moisture",
    "value": 62.4,
    "created_at": "2026-09-04 12:00:00"
  }
}
```

主なエラーは次のとおりです。

| ステータス | 原因 | 端末側の対応 |
| --- | --- | --- |
| `400` | JSONまたは値が不正 | ファームウェアの送信内容を修正する。 |
| `401` | APIキーがない、無効、または`write`権限ではない | 端末用キーを確認し、必要なら発行し直す。 |
| `404` | 植物IDが存在しない | Plantoryの植物ID設定を確認する。 |
| `500` | 一時的なサーバーエラー | 次の計測タイミングで再試行する。 |

## 送信間隔の取得

3機種（`soil-moisture-atom-s3`、`weight-atom-s3`、`weight-m5stickc-plus2`）は、日本時間の毎正時に共通設定を取得します。metricsの送信に使う既存のwrite APIキーをそのまま利用します。

```text
GET https://plantory.ytkg.workers.dev/api/settings/metrics
Authorization: Bearer plnt_...
```

成功時は`200 OK`と次のJSONを返します。

```json
{ "interval_hours": 3 }
```

- 許可値は`1 / 2 / 3 / 4 / 6 / 8 / 12 / 24`時間。Plantory側で保存時に検証し、端末では応答の読み取り成功と正の整数であることを確認します。
- 設定取得後、取得を開始した正時の「時」が間隔の倍数なら計測・送信します。3時間なら0・3・6・9・12・15・18・21時、6時間なら0・6・12・18時、24時間なら0時です。設定APIに時間がかかっても、同じ正時の送信判定を維持します。
- 14:30に6時間から3時間へ変更すると、15:00の取得で3時間へ切り替え、そのまま送信します。前回送信からの経過時間は使いません。
- 起動直後は設定を取得しません。起動完了時（未同期なら最初に時刻を取得できた時）を基準に、次の正時から処理します。正時に起動した場合もその時刻は処理しません。
- 一度も取得に成功していなければ3時間を使用します。成功後はメモリ上で最後の値を保持し、通信・HTTP・JSONの取得失敗時もその値で判定します。端末には永続保存せず、再起動後は3時間に戻ります。
- 毎時0分台で時刻の切り替わりを検出した最初のループで処理し、同じ時刻では再取得・再送信しません。0分台を過ぎた分の追いかけ取得・送信は行いません。Wi-Fi未接続時は通信できないため、その時刻の処理を終えて次の正時を待ちます。
- メッセージ表示中や重量センサー未接続時も、Wi-Fi接続済みなら設定取得を行います。計測・送信にはWi-Fiと利用可能なセンサーが必要です。
- 次回送信の表示は、現在保持している間隔を基準に計算します。ダブルタップによる即時送信は設定間隔にかかわらず利用できます。

最初にPlantory側の設定API・管理画面を反映し、この機能に対応したファームウェアを各端末へ一度書き込みます。以後は管理画面の「送信間隔」（`/settings/metrics`）で変更でき、間隔変更のためのファームウェア更新は不要です。設定APIが未反映の間は、取得失敗として3時間の既定値を使用します。

## 動作確認

端末へ書き込む前に、同じAPIキーで次のように確認できます。キーはシェルの環境変数にだけ設定してください。

```bash
export PLANTORY_API_KEY="plnt_..."

curl -X POST "https://plantory.ytkg.workers.dev/api/plants/2/metrics" \
  -H "Authorization: Bearer $PLANTORY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"metric_type":"soil_moisture","value":62.4}'
```
