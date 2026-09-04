# Plantory

センサーで植物の状態を記録し、AIが日々の変化を日報にする植物管理アプリ。

## 構成

- Cloudflare Workers（TypeScript）
- Cloudflare D1
- D1 migration: `migrations/0001_initial_schema.sql`

## データモデル

```text
plants(id INTEGER PRIMARY KEY, name TEXT, created_at DATETIME, updated_at DATETIME)
metrics(id INTEGER PRIMARY KEY, plant_id INTEGER, metric_type TEXT, value REAL, created_at DATETIME)
daily_reports(id INTEGER PRIMARY KEY, plant_id INTEGER, date DATE, content TEXT, created_at DATETIME, updated_at DATETIME)
```

`metrics.plant_id` と `daily_reports.plant_id` は `plants.id` を参照します。現段階では、センサー自体を管理するテーブル、`species`、`unit`、`measured_at` は設けません。

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

## 利用可能なスクリプト

- `npm run dev` — ローカル Worker を起動
- `npm run check` — TypeScript を検証
- `npm run deploy` — Worker をデプロイ
