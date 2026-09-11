# D1 migrationの作成と適用

アプリケーション向けのコマンドはリポジトリルートから `cd app` して実行する。`app/src/db/schema.ts`をデータベーススキーマの正本とする。スキーマを変更したら、Drizzle KitでSQL migrationを生成し、WranglerでD1へ適用する。

```bash
cd app
npm run db:generate -- --name add_example_column
npm run db:check
npm run db:migrate:local
```

`db:generate`は`app/migrations/`へ日時を接頭辞にしたSQLを作る。生成されたSQLはPRで確認し、`npm run db:check`が成功することを確認してからコミットする。ローカルD1への適用は`db:migrate:local`を使う。既存のアプリケーションテストも実行する。

本番反映は通常、main上のDeployワークフローが`npx wrangler d1 migrations apply plantory --remote`で行う。手動で本番へ適用する場合も同じWranglerコマンドを使う。`drizzle-kit push`、`drizzle-kit migrate`、`wrangler d1 execute`によるスキーマ変更は、Wranglerの適用履歴を経由しないため通常のmigrationには使わない。

## 既存環境との互換性

`app/migrations/0001_initial_schema.sql`から`0005_recreate_environment_metrics.sql`は、既存D1でWranglerが適用済みとして記録している履歴である。これらのSQLは書き換えず、再適用もしない。

`app/migrations/meta/`は現在の`app/src/db/schema.ts`を表すDrizzle Kitのベースラインである。ベースラインに対応するSQLは置かないため、既存D1にも新規D1にも重複した`CREATE TABLE`は実行されない。以後のDrizzle生成SQLだけが新しいWrangler migrationとして追加される。

新規のローカルD1では、最初の`npm run db:migrate:local`で0001〜0005が適用される。既存D1では同じコマンドが適用済みの名前を履歴から認識し、以後に生成されたSQLだけを実行する。
