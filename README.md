# Plantory

センサーで植物の状態を記録し、AIが日々の変化を観察日記にする植物管理アプリ。

現在の仕様は [docs/spec.md](docs/spec.md) にまとめています。

## 構成

- Cloudflare Workers（TypeScript）
- Cloudflare D1
- Tailwind CSS v4
- auth.takagi.dev（ログインとトークン検証）
- D1 migrations: `migrations/0001_initial_schema.sql`、`migrations/0002_create_api_keys.sql`、`migrations/0003_make_daily_reports_aggregate.sql`
- `firmware/`（M5Stackからmetricsを送るファームウェアと送信仕様）

## データモデル

```text
plants(id INTEGER PRIMARY KEY, name TEXT, created_at DATETIME, updated_at DATETIME)
metrics(id INTEGER PRIMARY KEY, plant_id INTEGER, metric_type TEXT, value REAL, created_at DATETIME)
daily_reports(id INTEGER PRIMARY KEY, date DATE UNIQUE, content TEXT, created_at DATETIME, updated_at DATETIME)
```

`metrics.plant_id` は `plants.id` を参照します。`daily_reports` は全植物をまとめた日付ごとの観察日記です。現段階では、センサー自体を管理するテーブル、`species`、`unit`、`measured_at` は設けません。

## はじめかた

```bash
npm install
npm run dev
```

ローカル D1 に初期スキーマを反映するには、次を実行します。

```bash
npx wrangler d1 migrations apply plantory --local
```

本番 D1 を作成するには、次を実行し、表示される UUID で `wrangler.jsonc` の `database_id` を置き換えます。

```bash
npx wrangler d1 create plantory
npx wrangler d1 migrations apply plantory --remote
```

API キーを使う前に、キーのハッシュ化に使う秘密値を Cloudflare へ設定します。値は十分に長いランダム文字列にし、リポジトリへ保存しないでください。

```bash
npx wrangler secret put API_KEY_PEPPER
```

## 利用可能なスクリプト

- `npm run dev` — ローカル Worker を起動
- `npm run build` — Tailwind CSS と TypeScript を検証
- `npm run check` — TypeScript を検証
- `npm test` — ローカルD1を使い、APIの認証・権限・登録・取得・APIキー削除を検証
- `npm run test:watch` — テストを監視実行
- `npm run deploy` — Worker をデプロイ

## API

M5Stackなどの端末からmetricsを送る方法は、[firmware/metrics-api.md](firmware/metrics-api.md)にまとめています。

### 植物一覧

`GET /api/plants`

```json
{
  "plants": [
    {
      "id": 1,
      "name": "モンステラ",
      "created_at": "2026-09-04 10:00:00",
      "updated_at": "2026-09-04 10:00:00"
    }
  ]
}
```

### 植物を登録

`POST /api/plants`

```json
{
  "name": "モンステラ"
}
```

成功時は `201 Created` と登録済みの植物を返します。`name` は前後の空白を除いた 1〜100 文字で指定します。

### 植物のmetricsを取得

`GET /api/plants/:plantId/metrics`

植物ごとのmetricsを新しい順に最大100件返します。

```bash
curl https://plantory.ytkg.workers.dev/api/plants/2/metrics \
  -H "Authorization: Bearer plnt_..."
```

### 植物のmetricを登録

`POST /api/plants/:plantId/metrics`

```bash
curl -X POST https://plantory.ytkg.workers.dev/api/plants/2/metrics \
  -H "Authorization: Bearer plnt_..." \
  -H "Content-Type: application/json" \
  -d '{"metric_type":"soil_moisture","value":62.4}'
```

`metric_type` は1〜50文字の小文字・数字・アンダースコアで指定します。`value` は有限の数値です。`created_at` はWorkerが受信時に自動で記録します。

### 公開ステータス

`GET /api/status` は認証なしで、植物IDの新しい順に相対水分量を返します。`soil_moisture` を優先し、なければ `weight` を使います。選択した種類の全期間の最小値を0%、最大値を100%として、最新値を整数に丸めます。記録がない植物や最小値と最大値が同じ植物は含まれません。

```json
[
  { "name": "カランコエ", "moisture": 42 }
]
```

## トップページ

`/` は公開の観察日記トップページです。全植物をまとめた観察日記を新しい順に表示します。植物一覧は認証必須の `/plants` にあり、Tailwind CSS でビルドした静的アセットを Cloudflare Workers から配信します。

## 認証と API キー

- `/plants` と植物管理 API はログイン Cookie または API キーで保護します。
- `/api/auth/login` は auth.takagi.dev に資格情報を送信し、アクセストークンとリフレッシュトークンを `HttpOnly` Cookie として保存します。
- API キーは `/settings/api-keys` で発行・無効化できます。キーは発行時に一度だけ表示され、D1 にはハッシュだけを保存します。
- API キーは `Authorization: Bearer plnt_...` で送信します。`read` は取得のみ、`write` は登録・取得に利用できます。
