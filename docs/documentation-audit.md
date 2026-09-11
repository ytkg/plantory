# ドキュメント監査

確認日: 2026-09-08

この文書は、資料の役割と確認結果を記録する監査メモである。プロダクト仕様そのものは重複して書かず、[仕様書](spec.md)を正本とする。

## 資料の役割

| 資料 | 主な読者 | 役割 | 判定 |
| --- | --- | --- | --- |
| `README.md` | 開発者・利用開始者 | リポジトリの入口、ローカル起動、主要資料への導線 | 導線とスクリプト一覧を更新した。 |
| `docs/operations.md` | リリース・障害対応担当者 | 確認済みの本番デプロイ、D1 migration、障害確認と復旧の制約 | 製品仕様と区別して追加した。 |
| `docs/spec.md` | 開発・運用担当者 | 実装済みの画面、API、認証、データ、運用の正本 | API・Cron・MCPを実装と照合し、アプリケーションの参照先を`app/`に統一した。 |
| `firmware/README.md` と各機種のREADME | ファームウェア利用者 | 端末ごとの配線、秘密情報、書き込み、OTA操作 | 各機種のREADMEを正本とし、一覧の古い試作表記を修正した。 |
| `firmware/metrics-api.md` | 端末開発者 | metrics送信のHTTP契約と動作確認 | 水分量以外のmetricを植物カードに表示するという古い記述を修正した。 |
| `hardware/mini-scales-carrier/README.md` | 3Dプリント利用者 | キャリアの設計値、印刷、調整 | ATOM S3重量計のゼロ調整操作を実装どおりに修正した。 |
| `.agents/skills/plantory-observation-draft/SKILL.md` | Codexで観察日記を作る利用者 | MCPを使う観察日記作成・保存時の制約 | MCPのツール、認可、保存条件と照合済み。接続設定はクライアント側の責務であり、ここには秘密情報を置かない。 |
| `AGENTS.md` | リポジトリを変更する開発者 | 仕様書更新の必須ルール | 現在の運用と一致している。 |

## 充足状況

| 領域 | 確認できる資料 | 結論 |
| --- | --- | --- |
| アーキテクチャ・データフロー | `docs/spec.md`のデータモデル、API、MCP節と`app/src/` | 十分。仕様は1か所に集約されており、別の設計書は増やさない。 |
| ローカル開発・Lint・テスト | `README.md`、`app/package.json`、`.github/workflows/test.yml` | 十分。アプリケーションのコマンドは`app/`で実行し、CIの詳細は仕様書を参照する。 |
| D1 migration・Secrets・Cron | `README.md`、`docs/spec.md`、`docs/operations.md`、`app/wrangler.jsonc` | 開発用・本番用migration、Secret名、Cronの振る舞いと、確認済みのログ・復旧手段を分離して記録した。 |
| デプロイ | `README.md`、`docs/spec.md`、`docs/operations.md`、`.github/workflows/deploy.yml` | mainの成功したCIからの自動反映、結果確認、WorkerとD1の復旧制約を記録した。 |
| ファームウェア | `firmware/README.md`、各プロジェクトのREADME、`firmware/metrics-api.md` | 十分。機種別の配線・設定・USB/OTA手順と共通API契約を分けており、重複した総合手順は作らない。 |
| ハードウェア | `hardware/mini-scales-carrier/README.md`とOpenSCAD正本 | 十分。寸法と印刷・調整方法に到達できる。 |
| MCP・AI観察日記 | `docs/spec.md`のMCP節、観察日記Skill | 十分。外部MCPクライアント固有の接続設定はこのリポジトリの範囲外であり、未確認の設定例は追加しない。 |

## 今回の判断

- 新しい利用者向けの設計書は作らない。正本と役割が重複するためである。本番運用は製品仕様と目的が異なるため、確認済みの操作だけを`docs/operations.md`へ分離する。
- 監査結果そのものは後続変更の根拠としてこの文書に残す。
- 本番運用は#35で実環境の確認後に記録した。未確認のバックアップ保持期間や通知は手順として案内しない。
