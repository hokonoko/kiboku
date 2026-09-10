# 作業ルール

## 作業完了時のフロー

作業（機能追加・修正など）が終わったら、ユーザーに言われなくても以下を必ず行うこと。

1. 変更内容を確認する（`git status` / `git diff`）
2. テストを実行する（`node tools/headless-check.js`、`node --check src/*.js` など）
3. 変更をコミットする（コミットメッセージは英語・命令形で簡潔に）
4. `origin/main` へ push する

## 補足

- このリポジトリは GitHub Pages（https://hokonoko.github.io/kiboku/）で公開されている。
- `main` への push がそのまま公開反映になるため、push 前にテストを通すこと。
