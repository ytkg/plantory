# 本番運用

確認日: 2026-09-08

この文書は、Plantoryの本番WorkerとD1に対して確認済みの操作だけを記す。画面、API、データの振る舞いは[仕様書](spec.md)を正本とする。

## デプロイの経路

通常の本番反映は、`main`へのpushで成功したGitHub Actionsの`Test`ワークフローを起点にする。`Deploy`ワークフローは次の順序で実行する。

1. 成功した`main`の`Test`実行だけを受け付ける。pull requestと開発ブランチの実行は受け付けない。
2. テスト済みSHAが開始時点の`main`先頭と一致することを確認する。待機中に新しいmainがある場合は古いSHAを反映せず、成功した新しい実行へ譲る。
3. 未適用のD1 migrationを本番へ適用する。
4. Workerと静的アセットをデプロイし、現在の本番デプロイ状態をActionsログへ出力する。

同時に実行できる本番デプロイは1件だけであり、実行中のデプロイは新しいpushでキャンセルしない。ローカルからの手動デプロイはこの制御の対象外である。

デプロイ用Secretsが未設定の場合、`Deploy`は実行できない。設定前にmainへマージして本番反映を試みない。

## GitHub Actionsの認証情報

リポジトリのActions Secretsに次を登録する。値はコミット、PR本文、ログに書かない。

| Secret | 値 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Plantoryを所有するCloudflareアカウントID。`npx wrangler whoami`で確認できる。 |
| `CLOUDFLARE_API_TOKEN` | Plantory専用のCloudflare APIトークン。 |

トークンは対象アカウントだけに絞り、少なくとも次の権限だけを付与する。

- `Workers Scripts: Edit` — Workerと静的アセットを反映するため。
- `D1: Edit` — 本番D1へmigrationを適用するため。

`wrangler`を対話的に使う個人のログイン情報とは別に管理する。PRのLint・TestジョブにはこれらのSecretsを渡さない。

## D1 migration

- `src/db/schema.ts`を正本としてDrizzle Kitでmigration SQLを生成し、`migrations/`はWranglerで適用する。生成・ローカル検証の詳細は[migration手順](migrations.md)を参照する。
- 本番確認は`npx wrangler d1 migrations list plantory --remote`を使う。既存の0001〜0005は変更しない。
- `npx wrangler d1 migrations apply plantory --remote`は未適用分だけを適用する。CIではmigrationの確認入力を待たない。
- 2026-09-08の確認時点で、本番D1に未適用migrationはなかった。
- migration適用に失敗した場合、`Deploy`はWorkerを反映しない。Workerの反映に失敗しても、D1を自動で元へ戻さない。
- D1はmigration適用時にバックアップを取得する。破壊的変更の前にはPRへ既存データへの影響、互換性を保つ適用順、復旧方針を記載し、レビューする。

復旧操作は本番データを変更するため、障害対応として明示的に判断してから行う。現在の復旧可能な時点は`npx wrangler d1 time-travel info plantory`で確認する。必要な場合だけ、表示されたbookmarkまたは対象時刻を使って`npx wrangler d1 time-travel restore plantory --bookmark <bookmark>`を実行する。

## デプロイ結果と障害確認

- 現在の本番デプロイは`npx wrangler deployments status`で確認する。過去のデプロイは`npx wrangler deployments list`、Workerバージョンは`npx wrangler versions list`で確認する。
- 実行中のWorkerログは`npx wrangler tail plantory --format pretty`で確認する。CronとHTTPリクエストの失敗はGitHub Actionsの実行ログとこのログから調べる。追加通知は設定していない。
- Workerだけを以前の版へ戻す必要がある場合は、現在のデプロイとバージョンを確認し、`npx wrangler versions deploy <version-id>@100 --yes`を使う。D1は同時に戻らないため、互換性と必要なD1復旧を個別に判断する。
- ローカルでの手動反映は、まず本番migrationを適用してから`npm run deploy`を実行する。自動デプロイと重ならないよう、実行前にGitHub Actionsの`Deploy`が動作中でないことを確認する。

バックアップの保持期間、通知、完全なゼロダウンタイム移行はこのリポジトリで設定・保証していない。
