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

最初に使う候補は `soil_moisture`、`temperature`、`humidity`、`light` です。Plantoryの植物カードでは、これらをそれぞれ土壌水分、温度、湿度、照度として表示します。

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

## 動作確認

端末へ書き込む前に、同じAPIキーで次のように確認できます。キーはシェルの環境変数にだけ設定してください。

```bash
export PLANTORY_API_KEY="plnt_..."

curl -X POST "https://plantory.ytkg.workers.dev/api/plants/2/metrics" \
  -H "Authorization: Bearer $PLANTORY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"metric_type":"soil_moisture","value":62.4}'
```
