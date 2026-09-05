# Plantory 仕様

最終更新: 2026-09-04

## 目的

Plantoryは、室内植物の状態をセンサーから記録し、AIが日々の変化を観察日記にまとめる植物管理アプリである。

## 現在の画面

| URL | 公開範囲 | 内容 |
| --- | --- | --- |
| `/` | 公開 | 「植物のようす」と、全植物をまとめた観察日記を公開する。ログイン状態では管理用ナビゲーションを表示する。 |
| `/login` | 公開 | 管理画面へのログインフォーム。通常はログイン後に `/` へ移動する。 |
| `/plants` | 要ログイン | 植物一覧、植物追加、各植物のmetricsグラフを表示する。 |
| `/settings/api-keys` | 要ログイン | APIキーの発行、無効化、削除を行う。発行はモーダルで行う。 |

保護ページを未ログインで開いた場合は、`/login?next=…` に移動する。ログイン成功後は元の保護ページへ戻る。

共通UIは固定ヘッダーと `© 2026 Plantory` のフッターで構成する。管理用ヘッダーはモバイルではメニューに集約し、現在のページを色と下線で示す。

ヘッダーとフッターは `scripts/build-layouts.mjs` の共通レイアウトから生成する。全画面のナビゲーション、モバイルメニュー、ログアウト導線、フッターはこの部品を変更して更新する。

一覧の状態カードと日時表示は `public/ui.js` の共通UI部品を使用する。

一覧の読み込み中・空・エラー状態は、各一覧と同じ角丸と影を持つカードで表示する。日時は日本語表記で表示する。

### 植物一覧

- 植物は名前だけを登録する。追加は一覧ページのモーダルから行う。
- 植物カードには、登録済みのメトリクスを種類ごとに縦並びで表示する。
- グラフはChart.js v4.5.1を使用する折れ線グラフで、各種類の直近30件を時系列順に描画する。ホバーすると受信時刻と値を確認できる。
- 各グラフにはメトリクス名、最新値、最新の受信時刻、前回値との差分を表示する。単位は保存しないため表示しない。`temperature`、`humidity`、`light` は日本語表示し、それ以外はアンダースコアを空白に置き換えて表示する。
- 土壌水分または重量がある植物は、それらの実測値を表示せず、同じ植物の過去最小値を0%、過去最大値を100%に換算した「水分量」だけを0〜100%の単一グラフで表示する。両方ある場合は土壌水分を優先する。
- metricsがない植物は、名前だけのカードを表示する。
- metricsがある植物には「測定データを削除」を表示し、確認モーダルで植物名と総件数を示す。削除後は測定なしの状態に更新する。
- 植物カードには、最新metricsの種類・値・受信時刻を表示する。metricsがない場合は「まだ測定がありません」と表示する。

### 観察日記

- 最新の観察日記を最初に大きく表示し、過去の記録はその下に時系列で表示する。

### 植物のようす

- 公開ステータスAPIから取得した植物名と相対水分量を、観察日記より上にカードで表示する。
- APIの並び順を維持し、植物ごとに同じ幅のカードをスマートフォンでは2列、広い画面では最大4列で表示する。
- 各カードには植物名、水分量、0〜100%のプログレスバーを表示する。カードは操作不可とする。
- 読み込み中、空配列、取得失敗時はセクション全体を表示しない。観察日記の表示には影響させない。

## データモデル

```text
plants(id INTEGER PRIMARY KEY, name TEXT, created_at DATETIME, updated_at DATETIME)
metrics(id INTEGER PRIMARY KEY, plant_id INTEGER, metric_type TEXT, value REAL, created_at DATETIME)
daily_reports(id INTEGER PRIMARY KEY, date DATE UNIQUE, content TEXT, created_at DATETIME, updated_at DATETIME)
api_keys(id INTEGER PRIMARY KEY, name TEXT, key_hash TEXT, scope TEXT, created_at DATETIME, last_used_at DATETIME, revoked_at DATETIME)
```

- `metrics.plant_id` は植物を参照する。
- センサーを管理するテーブルは作らない。
- `species`、`unit`、`measured_at` は保存しない。metricsの記録日時はWorkerが受信時に `created_at` として設定する。
- `daily_reports` は全植物をまとめた公開用の観察日記である。1日につき1件だけ保存し、同日の再実行では内容を更新する。

## API

ルーティングはHonoの機能別ルーター（`src/routes/`）で管理し、各ルーターから処理本体を呼び出す。Workerのエントリポイント（`src/index.ts`）はルーターの組み立てと共通エラーハンドリングのみを担当する。

処理本体（D1アクセスとドメイン処理）は`src/services/`に集約し、ルート定義と分離する。認証などの共通処理は`src/auth.ts`、ページ配信は`src/pages.ts`で管理する。

HTTPレスポンスの共通処理は、サービス層のJSON／エラー生成とCookie付与に必要な最小限だけを`src/http.ts`に残し、ルーター自身の404・500はHonoの標準レスポンスを利用する。

APIキーは `Authorization: Bearer plnt_...` で送る。`read` は取得のみ、`write` は取得と登録に利用できる。管理画面からのログインCookieでも、植物・metrics APIを利用できる。

### 植物

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/plants` | read | 植物をID昇順で取得する。 |
| `POST` | `/api/plants` | write | `{ "name": "…" }` で植物を登録する。名前は前後空白を除き1〜100文字。 |

### metrics

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/plants/:plantId/metrics` | read | 指定した植物のmetricsを新しい順に最大100件と、水分量計算用のP5/P95レンジを返す。植物がなければ404。 |
| `POST` | `/api/plants/:plantId/metrics` | write | `{ "metric_type": "soil_moisture", "value": 62.4 }` で記録する。 |
| `DELETE` | `/api/plants/:plantId/metrics` | write | 指定した植物のmetricsをすべて削除する。植物は残し、成功時は204。 |

- `metric_type` は先頭を小文字にした1〜50文字の小文字・数字・アンダースコアで指定する。
- `value` は有限の数値で指定する。
- `GET /api/plants/:plantId/metrics` の `moistureRanges` は種類ごとのP5（`lower`）／P95（`upper`）、`totalCount`はmetricsの総件数を返す。
- metricsの削除は対象が0件でも204を返す。存在しない植物は404。

### 観察日記

観察日記は誰でも閲覧できる。更新には `write` 権限のAPIキーまたはログインCookieが必要である。

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/reports` | 公開 | 新しい順に最大30件の観察日記を返す。 |
| `PUT` | `/api/reports/:date` | write | `{ "content": "…" }` で指定日の観察日記を作成または更新する。`date` は `YYYY-MM-DD`。 |

### 公開ステータス

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/status` | 公開 | 植物ID昇順で、植物名と現在の相対水分量だけを配列で返す。 |

- 水分系metricは `soil_moisture` を優先し、なければ `weight` を使う。
- 選択した種類の全期間の最小値を0%、最大値を100%として最新値を四捨五入する。
- 水分系metricがない、または最小値と最大値が同じ植物は除外する。
- `GET` 以外は405を返す。CORSとキャッシュは設定しない。

- 観察日記は、AIがその時点で取得できるmetricsの量・直近性・変化を判断して、全植物をまとめて考察する。
- metricsがない場合は観察日記を作成しない。

### APIキー管理

APIキー管理APIはログインCookieでのみ利用できる。

| メソッド | URL | 内容 |
| --- | --- | --- |
| `GET` | `/api/api-keys` | 発行済みキーのメタデータを取得する。 |
| `POST` | `/api/api-keys` | 用途名と `read` / `write` 権限で新しいキーを発行する。 |
| `POST` | `/api/api-keys/:id/revoke` | 有効なキーを無効化する。無効化は取り消せない。 |
| `DELETE` | `/api/api-keys/:id` | 無効化済みキーだけを完全に削除する。 |

- 実際のキー値は発行時に一度だけ表示する。
- 発行直後のキーは画面からコピーできる。発行・無効化・削除の結果は画面に表示する。
- 一覧ではキーごとに有効・無効の状態を明示する。
- D1にはキー値ではなく、`API_KEY_PEPPER` を加えたSHA-256ハッシュだけを保存する。
- 有効なキーは削除できない。先に無効化してから削除する。
- M5Stackなどの端末には、端末ごとに専用の `write` APIキーを発行する。端末用のキー値はリポジトリに保存しない。

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
- D1のマイグレーションは `migrations/` で管理する。`0003_make_daily_reports_aggregate.sql` は、既存の植物単位の日報テーブルを日付ごとの集約観察日記へ移行する。
- 観察日記の定期更新は現在設定しない。M5Stackから十分なmetricsが蓄積してから、D1の情報をもとに作成・更新する仕組みを設定する。
- `firmware/` にはPlantory専用のM5Stackファームウェアを置く。機種が未決定の間は、機種に依存しない送信仕様とセットアップ方針だけを管理する。

## 仕様更新ルール

画面、API、認証、データモデル、運用の振る舞いを変更したときは、実装と同じ変更内でこの文書を更新する。詳細な実装手順や検討中の案ではなく、現時点で動作する仕様を記載する。
