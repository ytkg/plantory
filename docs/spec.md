# Plantory 仕様

最終更新: 2026-09-04

## 目的

Plantoryは、室内植物の状態をセンサーから記録し、AIが日々の変化を観察日記にまとめる植物管理アプリである。

## 現在の画面

| URL | 公開範囲 | 内容 |
| --- | --- | --- |
| `/` | 公開 | 「植物のようす」と、全植物をまとめた観察日記を公開する。ログイン状態では管理用ナビゲーションを表示する。 |
| `/login` | 公開 | 管理画面へのログインフォーム。通常はログイン後に `/` へ移動する。 |
| `/plants` | 要ログイン | 植物一覧、植物追加、相対水分量の要約を表示する。 |
| `/plants/:plantId/metrics` | 要ログイン | 植物ごとの計測生値をグラフと履歴で確認する。 |
| `/settings/api-keys` | 要ログイン | APIキーの発行、無効化、削除を行う。発行はモーダルで行う。 |

保護ページを未ログインで開いた場合は、`/login?next=…` に移動する。ログイン成功後は元の保護ページへ戻る。

共通UIは固定ヘッダーと `© 2026 Plantory` のフッターで構成する。管理用ヘッダーはモバイルではメニューに集約し、現在のページを色と下線で示す。

ヘッダーとフッターは `scripts/build-layouts.mjs` の共通レイアウトから生成する。全画面のナビゲーション、モバイルメニュー、ログアウト導線、フッターはこの部品を変更して更新する。

一覧の状態カードと日時表示は `public/ui.js` の共通UI部品を使用する。

一覧の読み込み中・空・エラー状態は、各一覧と同じ角丸と影を持つカードで表示する。日時は日本語表記で表示する。

### 植物一覧

- 植物は名前だけを登録する。追加は一覧ページのモーダルから行う。
- 植物カードには、水分量の要約を表示する。水分量グラフがあるカードでは、その下の右端に「計測データを見る」を表示する。グラフがないカードでも、同じ専用ページへのリンクを表示する。
- 土壌水分または重量がある植物は、それらの実測値を表示せず、同じ植物・種類の全履歴から計算するP5/P95を基準にした「水分量」だけを0〜100%の単一グラフで表示する。`soil_moisture`は値が小さいほど水分量が多く、`weight`は値が大きいほど水分量が多い。両方ある場合は土壌水分を優先する。
- metricsがない植物は、名前と計測データへのリンクだけを表示する。
- 水分量を算出できない場合は「まだ測定がありません」または「水分量を算出できるデータがありません」と表示する。

### 計測データ

- 計測データページは植物名、ページタイトル、植物一覧へ戻るリンクを表示する。読み取り専用であり、補正・正規化・ゼロリセット・編集は行わない。
- 記録されたすべての`metric_type`を対象にする。1種類なら見出しだけを表示し、複数種類なら選択ボックスで切り替える。`weight`は「重量」と`g`、`soil_moisture`は「土壌水分（生値）」として表示する。未知の種類は保存された`metric_type`をそのまま表示し、単位を推測しない。
- 上部には選択種類の全期間における最新値、最新2件の生値から求めた前回比、記録日時を表示する。期間の選択によってこの要約は変えない。生値は保存値を表示し、小数桁の制限や水分量への変換を行わない。計算時の浮動小数点誤差だけは表示しない。
- 初期表示は直近30件。期間は直近30件、過去7日、過去30日、過去90日から選ぶ。過去N日は選択時点からN×24時間さかのぼるUTC時刻範囲であり、日本時間の暦日には丸めない。
- グラフは選択期間内の全実測点を時刻に比例する連続軸で表示する。Chart.jsの単調補間で点をつなぐが、実測値・APIレスポンスに補間値を追加しない。縦軸は表示中の生値の範囲と余白に合わせ、0始まりや0〜100%固定にしない。1件だけは点として表示する。
- tooltipと履歴一覧は日本時間の記録日時と保存された生値を表示する。履歴は新しい順で初回30件、以降は「もっと見る」で30件ずつ追加する。自動更新はせず、ページ表示時と「更新」操作時だけ取得する。
- metricsが1件以上ある場合、ページ下部に危険操作として全測定データの削除を表示する。削除対象は選択中の種類・期間にかかわらず対象植物の全metricsであり、確認ダイアログに植物名・全件数・取り消せないことを表示する。削除中は二重送信を防ぎ、成功後は植物レコードを残して空状態へ更新する。

### 観察日記

- 最新の観察日記を最初に大きく表示し、過去の記録はその下に時系列で表示する。
- 観察日記の本文はMarkdownとして保存し、安全に無害化して表示する。本文先頭のMarkdown見出しをカードのタイトルとして使うため、カード側に日付を別途表示しない。

### 植物のようす

- 公開ステータスAPIから取得した植物名、相対水分量、最終計測時刻を、観察日記より上にカードで表示する。
- APIの並び順を維持し、植物ごとに同じ幅のカードをスマートフォンでは2列、広い画面では最大4列で表示する。
- 各カードには植物名、水分量、0〜100%のプログレスバー、`最終計測`として最終計測時刻の相対表記を表示する。カードは操作不可とする。鮮度の閾値・警告表示は設けない。
- 読み込み中、空配列、取得失敗時はセクション全体を表示しない。観察日記の表示には影響させない。

### 部屋の環境

- 公開トップページでは、最上部に「観察日記」と説明文を表示する。その下に植物のようす、部屋の環境、最新の観察日記をこの順で表示する。
- 部屋の環境には、最新の室温・湿度・CO₂濃度と最終取得時刻を表示する。
- 3種類がそろっていない、読み込みに失敗した場合はセクション全体を表示しない。履歴グラフは表示しない。

## データモデル

```text
plants(id INTEGER PRIMARY KEY, name TEXT, created_at DATETIME, updated_at DATETIME)
metrics(id INTEGER PRIMARY KEY, plant_id INTEGER, metric_type TEXT, value REAL, created_at DATETIME)
daily_reports(id INTEGER PRIMARY KEY, date DATE UNIQUE, content TEXT, created_at DATETIME, updated_at DATETIME)
api_keys(id INTEGER PRIMARY KEY, name TEXT, key_hash TEXT, scope TEXT, created_at DATETIME, last_used_at DATETIME, revoked_at DATETIME)
environment_metrics(id INTEGER PRIMARY KEY, temperature REAL, humidity REAL, co2 INTEGER, created_at DATETIME)
```

- `metrics.plant_id` は植物を参照する。
- センサーを管理するテーブルは作らない。
- `species`、`unit`、`measured_at` は保存しない。metricsの記録日時はWorkerが受信時に `created_at` として設定する。
- `daily_reports` は全植物をまとめた公開用の観察日記である。1日につき1件だけ保存し、同日の再実行では内容を更新する。
- `environment_metrics` は部屋にひも付かない環境観測スナップショットである。1レコードに温度・湿度・CO₂濃度をまとめて保存する。

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
| `GET` | `/api/plants/:plantId/metrics` | read | 指定した植物の水分量を新しい順に返す。植物がなければ404。 |
| `GET` | `/api/plants/:plantId/metrics/raw` | read | 指定した種類の生値を時刻精度の範囲・カーソルでページングして返す。 |
| `POST` | `/api/plants/:plantId/metrics` | write | `{ "metric_type": "soil_moisture", "value": 62.4 }` で記録する。 |
| `DELETE` | `/api/plants/:plantId/metrics` | write | 指定した植物のmetricsをすべて削除する。植物は残し、成功時は204。 |

- `metric_type` は先頭を小文字にした1〜50文字の小文字・数字・アンダースコアで指定する。
- `value` は有限の数値で指定する。
- `POST` の `value` はセンサーから受け取った生値として保存する。一方、`GET` は画面や観察日記で使う解釈済みの水分量だけを返す。
- `GET /api/plants/:plantId/metrics` は任意の `from`・`to`（`YYYY-MM-DD`、日本時間の暦日・両端を含む）と `limit`（1〜1000、デフォルト100）で返却対象を絞り込める。`from` は `to` 以前でなければならない。
- `metrics` の各要素は `id`、`plant_id`、水分量を表す `value`（0〜100の整数）、UTCを明示したISO 8601形式の`created_at`を返す。ADC値や重量などの生値、センサー種別、P5/P95レンジは返さない。
- 水分量は、土壌水分を優先し、なければ重量の全履歴をP5/P95で正規化して算出する。`totalCount`は選択された水分量の記録総数を返す。範囲を算出できない場合、`metrics` は空配列になる。
- metricsの削除は対象が0件でも204を返す。存在しない植物は404。
- `GET /api/plants/:plantId/metrics/raw` は`metric_type`（必須）、`from`・`to`（任意、UTC ISO 8601形式、両端を含む）、`limit`（1〜500、デフォルト100）、`cursor`（任意）を受け付ける。`from`・`to`は日時精度で比較し、`from`は`to`以前でなければならない。
- 生値APIは`plant`、全種類の`metricTypes`（種類ごとの総件数・全期間の最新値・前回値）、選択した`metric_type`、`metrics`、その種類の全期間`totalCount`、次ページ用`nextCursor`を返す。各metricは`id`、`plant_id`、`metric_type`、保存した`value`、UTC ISO 8601形式の`created_at`を含む。存在しない植物は404、記録のない種類は空の`metrics`を返す。
- `nextCursor`を使うと同じ条件で新しい順に続きのページを取得できる。計測データページは1回あたり最大500件ずつ取得し、グラフでは選択期間内の全点を表示する。履歴一覧は取得済みの同じデータから30件ずつ表示する。

### 観察日記

観察日記は誰でも閲覧できる。更新には `write` 権限のAPIキーまたはログインCookieが必要である。

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/reports` | 公開 | 新しい順に最大30件の観察日記を返す。 |
| `PUT` | `/api/reports/:date` | write | `{ "content": "…" }` で指定日のMarkdown観察日記を作成または更新する。`date` は `YYYY-MM-DD`。 |

### 公開ステータス

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/status` | 公開 | 植物ID昇順で、`plant_id`、植物名、現在の相対水分量、算出元metricの最新保存時刻`recorded_at`を配列で返す。 |

- 水分系metricは `soil_moisture` を優先し、なければ `weight` を使う。
- 選択した種類の全履歴からP5/P95を線形補間で求める。`soil_moisture`はP5を100%、P95を0%、`weight`はP5を0%、P95を100%として最新値を四捨五入する。範囲外は0〜100%にクランプする。
- 方向が定義されていない種類、またはP5とP95が同じ植物は除外する。
- `recorded_at`は、水分量の算出元として選択した種類の最新metricにある`created_at`をUTCを明示したISO 8601形式で返す。`soil_moisture`を優先するため、より新しい`weight`が存在しても`soil_moisture`の時刻を返す。
- `GET` 以外は405を返す。CORSとキャッシュは設定しない。
- `soil-moisture-atom-s3` は起動時と土壌水分の送信成功後にこのAPIから設定済みの`PLANT_ID`の水分量を取得して表示する。通常表示中の定期取得は行わない。取得に失敗しても最後に取得した値を維持し、未取得の場合は`--%`を表示する。

### 公開環境情報

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/environment` | 公開 | 最新の環境観測スナップショットを `environment` として返す。観測がなければ `environment: null` を返す。 |

- `created_at` は最新の環境観測をWorkerが取得した時刻を返す。
- `GET` 以外は405を返す。CORSとキャッシュは設定しない。

### 環境履歴

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/environment/metrics` | read | 室内環境の観測履歴を新しい順に `environmentMetrics` として返す。 |

- 任意の `from`・`to`（`YYYY-MM-DD`、日本時間の暦日・両端を含む）と `limit`（1〜1000、デフォルト100）で返却対象を絞り込める。`from` は `to` 以前でなければならない。
- 公開の `/api/environment` はトップページ用の最新値のみを返し、履歴は公開しない。

### 屋外天気情報

| メソッド | URL | 権限 | 内容 |
| --- | --- | --- | --- |
| `GET` | `/api/weather` | read | 指定期間の西東京市周辺の屋外天気を日別配列 `weather` として返す。 |

- `from`・`to`（ともに`YYYY-MM-DD`、両端を含む）は必須である。
- 各日には日付、WMO weather code、最高／最低気温（℃）、平均相対湿度（%）、降水量（mm）、日照時間（秒）を含める。
- Open-Meteoの履歴天気APIから取得し、天気情報はD1へ保存しない。定期取得・公開API・画面表示は行わない。
- 公開APIを増やさず、詳細な天気情報はread権限のAPIキーまたはログインCookieが必要である。

- 観察日記は、AIがその時点で取得できるmetricsの量・直近性・変化を判断して、全植物をまとめて考察する。
- metricsがない場合は観察日記を作成しない。

### MCP

| ツール | 権限 | 内容 |
| --- | --- | --- |
| `list_plants` | read | 植物をID昇順で取得する。 |
| `get_plant_moisture_history` | read | 指定した植物の正規化済み水分量履歴を取得する。 |
| `get_plant_observation_data` | read | 観察日記用に、指定した植物の正規化済み水分量履歴、生値の履歴、正規化の採用元・方向・P5/P95をまとめて取得する。 |
| `get_environment_history` | read | 室内環境の観測履歴を取得する。 |
| `get_daily_weather` | read | 西東京市周辺の屋外天気を日別で取得する。 |
| `get_observation_reports` | read | 過去の観察日記を新しい日付順に最大30件取得する。 |
| `upsert_observation_report` | write | 指定日の観察日記を作成または更新する。 |

- MCPは `https://plantory.ytkg.workers.dev/mcp` で提供する。read APIキーでは取得ツールのみ、write APIキーまたはログインCookieでは取得・書き込みツールを利用できる。
- `get_plant_moisture_history` と `get_environment_history` の`from`・`to`は日本時間の暦日として扱う。返すmetricsの時刻はUTCを明示したISO 8601形式である。
- `get_plant_observation_data` は、すべての`metric_type`の生値を種類ごとに返す。正規化済み水分量には、従来と同じ土壌水分優先・重量フォールバックを用いる。`moistureSource`がある場合は、採用した種類、増減の方向、全履歴から求めたP5/P95も返す。
- 観察日記Skillは、REST APIを直接呼ばずにこのMCPツールを使う。過去の観察日記を参照し、`upsert_observation_report` で指定日の観察日記を保存または更新できる。

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
- ログアウト時はアクセストークンとリフレッシュトークンの両方のCookieを削除する。
- `API_KEY_PEPPER` はCloudflare Secretとして設定し、リポジトリには保存しない。
- SwitchBot連携の `SWITCHBOT_TOKEN`、`SWITCHBOT_SECRET`、`SWITCHBOT_DEVICE_ID` はCloudflare Secretとして設定し、リポジトリには保存しない。

## 運用

- 技術構成: Cloudflare Workers、Cloudflare D1、TypeScript、Tailwind CSS v4、Chart.js v4.5.1。
- `npm run build` でTailwind CSSとChart.jsアセットを生成し、TypeScriptを検証する。
- `npm test` でVitestとCloudflare Workers用テスト環境を使い、ローカルD1に対するAPIの認証・登録・取得・APIキー管理を検証する。
- 本番反映は `npx wrangler deploy` を実行する。
- D1のマイグレーションは `migrations/` で管理する。`0003_make_daily_reports_aggregate.sql` は、既存の植物単位の日報テーブルを日付ごとの集約観察日記へ移行する。
- 観察日記の定期更新は現在設定しない。M5Stackから十分なmetricsが蓄積してから、D1の情報をもとに作成・更新する仕組みを設定する。
- 毎時0分（UTC）にWorker CronでSwitchBot CO₂センサーの温度・湿度・CO₂濃度を取得し、`environment_metrics` へ1件の環境観測スナップショットとして保存する。3値すべてが有限な数値で取得できた場合だけ保存する。取得失敗・不正値・欠損時は保存、通知、リトライを行わない。SwitchBotとの通信、HTTP応答、APIエラー、不正な環境値については、認証情報やレスポンス本文を含めず原因別にWorkerログへ記録する。
- `firmware/` にはPlantory専用のM5Stackファームウェアを置く。`soil-moisture-atom-s3/`、`weight-atom-s3/`、`weight-m5stickc-plus2/`、`unit-cams3-5mp/` はそれぞれ独立したPlatformIOプロジェクトで、`sample/` はWi-Fi接続と公開ステータス表示の動作確認用サンプルとする。
- `hardware/mini-scales-carrier/` にはUnit Mini Scales用の3Dプリント可能な皿用キャリアを置く。OpenSCADファイルを正本とし、STLも同じディレクトリで管理する。キャリアはねじ止めせずMini Scalesの上に載せ、皿の高台を浅いくぼみで位置決めする。

## 仕様更新ルール

### Unit CamS3 5MP プレビュー（実機検証中）

- `firmware/unit-cams3-5mp/` は自宅Wi-Fiに接続し、`http://plantory-camera.local/` でVGA（640×480）のMJPEGライブ映像を提供する。Wi-Fi設定はGit管理外の `include/secrets.h` に置く。
- `http://plantory-camera.local/capture?full=1` は要求時に5MP（2592×1944）の静止画を返す。保存はしない。
- プレビュー画面の明るさスライダーは-4から+4まで調整でき、カメラへ即時反映する。起動時の明るさは0である。
- 内蔵PDMマイクの16kHzモノラル音声は保存せず、プレビュー画面の再生操作中だけ小さなPCMチャンクとしてブラウザへ連続配信する。画面側はWeb Audioで再生し、音量を調整できる。
- 同梱のPY260ドライバはJPEGバッファ1枚あたり約5MBを確保するため、8MB PSRAMに収まる1枚構成を使う。
- 自宅Wi-Fi接続時はパスワードなしArduinoOTAを利用する。カメラ初期化がエラーで終了してもOTAの処理を継続し、画面・画像取得は503を返す。
- Wi-Fi接続に20秒で成功しない場合、`Plantory-Cam-Setup` APを開く。このAPではOTAを開始しない。

### ATOM S3 センサー送信

- `soil-moisture-atom-s3` と `weight-atom-s3` は日本時間の0時・6時・12時・18時に自動計測・送信する。起動直後は自動送信しない。
- どちらもダブルタップで計測・即時送信する。2秒長押しでは最大5回のWi-Fi再接続を開始し、画面に試行中・成功・失敗を表示する。再接続はループ内で進め、失敗後は再度長押しでやり直せる。

### ATOM S3 土壌水分センサー

- `firmware/soil-moisture-atom-s3/` はEarth Unit用。ADC値は送信時に1秒ごとに10回読み取り、その平均を`soil_moisture`として送信する。シングルタップでは何もしない。
- 起動時、再接続成功時、送信成功後に`/api/status`から相対水分量を取得して表示する。取得に失敗しても最後に取得した値を維持し、未取得の場合は`--%`を表示する。
- OTAホスト名は`soil-moisture-atom-s3.local`である。

### ATOM S3 重量センサー

- `firmware/weight-atom-s3/` はUnit Mini Scales（U177）用。植物ID、Wi-Fi、APIキーはGit管理外の `include/secrets.h` で指定する。
- I²CはSDA=G2、SCL=G1、100kHz、アドレス0x26。重量はレジスタ0x10の4バイトをlittle-endian float（g）として読み取る。
- 重量は数値を大きくして1秒ごとに表示する。桁数が多いときは画面内に収まる大きさに縮小する。±1.0gは0.0gとして扱う。送信時は100ms間隔で10回測定し、平均を`weight`として送信する。
- シングルタップでMini Scalesの現在の荷重をゼロ点として調整する。読み取り失敗や非有限値は送信しない。連続失敗時はI²Cを終了・再初期化して接続を試みる。起動時にゼロ点は変更しない。
- OTAホスト名は `weight-atom-s3.local`。測定値と受信バイトをシリアルログへ出力する。

### M5StickC PLUS2 重量センサー

- `firmware/weight-m5stickc-plus2/` はUnit Mini Scales（U177）用。植物ID、Wi-Fi、APIキーはGit管理外の `include/secrets.h` で指定する。Mini ScalesをHY2.0-4Pへ接続し、SDA=G32、SCL=G33、100kHz、I²Cアドレス`0x26`で通信する。
- USB Type-C端子を下にした縦画面で重量を1秒ごとに整数グラムで表示する。±1.0gは0gとして扱い、表示・Plantoryへの送信値は四捨五入する。送信時は100ms間隔で10回測定した平均を`weight`として送信する。読み取り失敗や非有限値は送信しない。連続失敗時はI²Cを終了・再初期化して接続を試みる。起動時にゼロ点は変更しない。
- 日本時間の0時・6時・12時・18時に自動計測・送信し、起動直後に自動送信はしない。BtnAの短押しはゼロ点調整、ダブルタップは即時送信、2秒長押しは最大5回のWi-Fi再接続である。再接続の試行中・成功・失敗は画面に表示し、失敗後は再度長押しでやり直せる。
- OTAホスト名は`weight-m5stickc-plus2.local`である。OTA用に2つのアプリ領域を確保し、無線更新中も直前のファームウェアを保持する。測定値と受信バイトをシリアルログへ出力する。

画面、API、認証、データモデル、運用の振る舞いを変更したときは、実装と同じ変更内でこの文書を更新する。詳細な実装手順や検討中の案ではなく、現時点で動作する仕様を記載する。
