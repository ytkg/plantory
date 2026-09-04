# Plantory 仕様

最終更新: 2026-09-04

## 目的

Plantoryは、室内植物の状態をセンサーから記録し、将来的にAIが日々の変化を日報にまとめる植物管理アプリである。

## 現在の画面

| URL | 公開範囲 | 内容 |
| --- | --- | --- |
| `/` | 公開 | 将来公開する日報のトップ。現在は準備中を表示する。ログイン状態では管理用ナビゲーションを表示する。 |
| `/login` | 公開 | 管理画面へのログインフォーム。通常はログイン後に `/` へ移動する。 |
| `/plants` | 要ログイン | 植物一覧、植物追加、各植物のmetricsグラフを表示する。 |
| `/settings/api-keys` | 要ログイン | APIキーの発行、無効化、削除を行う。 |

保護ページを未ログインで開いた場合は、`/login?next=…` に移動する。ログイン成功後は元の保護ページへ戻る。

共通UIは固定ヘッダーと `© 2026 Plantory` のフッターで構成する。

### 植物一覧

- 植物は名前だけを登録する。追加は一覧ページのモーダルから行う。
- 植物カードには、登録済みのメトリクスを種類ごとに縦並びで表示する。
- グラフはChart.js v4.5.1を使用する折れ線グラフで、各種類の直近30件を時系列順に描画する。
- 各グラフにはメトリクス名と最新値を表示する。`soil_moisture`、`temperature`、`humidity`、`light` は日本語表示し、それ以外はアンダースコアを空白に置き換えて表示する。
- metricsがない植物は、名前だけのカードを表示する。

## データモデル

```text
plants(id INTEGER PRIMARY KEY, name TEXT, created_at DATETIME, updated_at DATETIME)
metrics(id INTEGER PRIMARY KEY, plant_id INTEGER, metric_type TEXT, value REAL, created_at DATETIME)
daily_reports(id INTEGER PRIMARY KEY, plant_id INTEGER, date DATE, content TEXT, created_at DATETIME, updated_at DATETIME)
api_keys(id INTEGER PRIMARY KEY, name TEXT, key_hash TEXT, scope TEXT, created_at DATETIME, last_used_at DATETIME, revoked_at DATETIME)
```

- `metrics.plant_id` と `daily_reports.plant_id` は植物を参照する。
- センサーを管理するテーブルは作らない。
- `species`、`unit`、`measured_at` は保存しない。metricsの記録日時はWorkerが受信時に `created_at` として設定する。
- `daily_reports` は将来の公開日報用であり、まだ生成・表示機能は実装していない。

## API

APIキーは `Authorization: Bearer plnt_...` で送る。`read` は取得のみ、`write` は取得と登録に利用できる。管理画面からのログインCookieでも、植物・metrics APIを利用できる。

### 植物

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/plants` | read | 植物をID降順で取得する。 |
| `POST` | `/api/plants` | write | `{ "name": "…" }` で植物を登録する。名前は前後空白を除き1〜100文字。 |

### metrics

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/plants/:plantId/metrics` | read | 指定した植物のmetricsを新しい順に最大100件返す。植物がなければ404。 |
| `POST` | `/api/plants/:plantId/metrics` | write | `{ "metric_type": "soil_moisture", "value": 62.4 }` で記録する。 |

- `metric_type` は先頭を小文字にした1〜50文字の小文字・数字・アンダースコアで指定する。
- `value` は有限の数値で指定する。

### APIキー管理

APIキー管理APIはログインCookieでのみ利用できる。

| メソッド | URL | 内容 |
| --- | --- | --- |
| `GET` | `/api/api-keys` | 発行済みキーのメタデータを取得する。 |
| `POST` | `/api/api-keys` | 用途名と `read` / `write` 権限で新しいキーを発行する。 |
| `POST` | `/api/api-keys/:id/revoke` | 有効なキーを無効化する。無効化は取り消せない。 |
| `DELETE` | `/api/api-keys/:id` | 無効化済みキーだけを完全に削除する。 |

- 実際のキー値は発行時に一度だけ表示する。
- D1にはキー値ではなく、`API_KEY_PEPPER` を加えたSHA-256ハッシュだけを保存する。
- 有効なキーは削除できない。先に無効化してから削除する。

## 認証

- 認証サービスは `auth.takagi.dev` を使用する。
- アクセストークンは `plantory_access` Cookie、リフレッシュトークンは `plantory_refresh` Cookieに保存する。どちらも `HttpOnly`、`SameSite=Lax` とする。HTTPSでは `Secure` も付ける。
- アクセストークンの検証に失敗した場合はリフレッシュを試みる。更新したCookieは、静的アセットを複製したレスポンスに付与する。
- `API_KEY_PEPPER` はCloudflare Secretとして設定し、リポジトリには保存しない。

## 運用

- 技術構成: Cloudflare Workers、Cloudflare D1、TypeScript、Tailwind CSS v4、Chart.js v4.5.1。
- `npm run build` でTailwind CSSとChart.jsアセットを生成し、TypeScriptを検証する。
- `npm test` でVitestとCloudflare Workers用テスト環境を使い、ローカルD1に対するAPIの認証・登録・取得・APIキー管理を検証する。
- 本番反映は `npx wrangler deploy` を実行する。
- D1のマイグレーションは `migrations/` で管理する。既存の本番環境には `0001_initial_schema.sql` と `0002_create_api_keys.sql` が適用済みである。

## 仕様更新ルール

画面、API、認証、データモデル、運用の振る舞いを変更したときは、実装と同じ変更内でこの文書を更新する。詳細な実装手順や検討中の案ではなく、現時点で動作する仕様を記載する。
