# PNG保存への占い結果同梱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PNG保存時に、選択中タブの占い結果（ランク・型・理由・シード）を画像下部のフッター帯に焼き込んで保存できるようにする。

**Architecture:** 保存専用のエクスポートCanvasを都度組み立てる（画面Canvasは無変更）。cv ビットマップ＋フッター帯（論理220px）を縦連結し、フッターに `interpCache[currentCategory]` と保持済み型情報からテキストを描画する。結果未表示時は従来どおり腹甲のみ。

**Tech Stack:** Vanilla JS (Canvas 2D) / 検証: Node.js (vm モジュール)

**Spec:** `docs/superpowers/specs/2026-09-07-png-include-result-design.md`

**注意:** このディレクトリはgitリポジトリではないため、コミットステップは省略する。

---

### Task 1: savepng ハンドラの再実装（src/app.js のみ変更）

**Files:**
- Modify: `src/app.js`（3箇所: 状態変数追加、showResult への1行追加、savepng ハンドラ置換＋ヘルパー関数追加）

- [ ] **Step 1: 状態変数 `currentPattern` を追加**

`src/app.js` 内の状態宣言ブロック（`let crackleTimer = 0;` の直後）に1行追加:

```js
  let crackleTimer = 0;
  let currentPattern = null;
```

- [ ] **Step 2: `showResult` で型情報を保持**

`showResult` 関数冒頭の `const pat = K.classifyPattern(sim.metrics);` の直後に1行追加:

```js
  function showResult() {
    const pat = K.classifyPattern(sim.metrics);
    currentPattern = pat;
    patternEl.textContent = '【' + pat.name + '】' + pat.description;
```

- [ ] **Step 3: savepng ハンドラを置換し、ヘルパー関数を追加**

既存の savepng リスナー全体を、以下の `wrapText` / `buildExportCanvas` / 新リスナーで置き換える:

```js
  function wrapText(c, text, x, y, maxW, lineH) {
    let line = '';
    let yy = y;
    for (const ch of text) {
      if (c.measureText(line + ch).width > maxW) {
        c.fillText(line, x, yy);
        yy += lineH;
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) c.fillText(line, x, yy);
    return yy + lineH;
  }

  function buildExportCanvas() {
    const FOOTER_H = 220;
    const out = document.createElement('canvas');
    out.width = LW * DPR;
    out.height = (LH + FOOTER_H) * DPR;
    const c = out.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.drawImage(cv, 0, 0, LW, LH);

    const interp = interpCache[currentCategory];
    if (!interp || !lastSnap) return out;

    c.fillStyle = '#17140f';
    c.fillRect(0, LH, LW, FOOTER_H);
    c.strokeStyle = '#5a4a30';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, LH + 1);
    c.lineTo(LW, LH + 1);
    c.stroke();

    c.textBaseline = 'middle';
    c.fillStyle = RANK_COLORS[interp.rank] || '#e8e0cf';
    c.font = '700 64px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
    c.textAlign = 'center';
    c.fillText(interp.rank, 110, LH + FOOTER_H / 2);

    c.textAlign = 'left';
    const rx = 220, maxW = LW - rx - 24;
    c.fillStyle = '#c9b896';
    c.font = '600 18px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
    let yy = wrapText(c, '【' + currentPattern.name + '】' + currentPattern.description, rx, LH + 34, maxW, 26);

    c.fillStyle = '#e8e0cf';
    c.font = '15px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
    for (const r of interp.reasons) {
      yy = wrapText(c, r, rx, yy + 2, maxW, 22);
    }

    c.fillStyle = '#9a8f78';
    c.font = '13px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
    c.fillText('シード: ' + lastSnap.seed + ' ／ スコア: ' + interp.score, rx, Math.min(yy + 6, LH + FOOTER_H - 14));
    return out;
  }

  document.getElementById('savepng').addEventListener('click', function () {
    const a = document.createElement('a');
    a.download = 'kiboku-' + (lastSnap ? lastSnap.seed : 'result') + '.png';
    a.href = buildExportCanvas().toDataURL('image/png');
    a.click();
  });
```

- [ ] **Step 4: 構文チェック**

Run: `node --check src/app.js`
Expected: エラーなし

- [ ] **Step 5: ヘッドレスハーネス再実行（ロジック無影響を確認）**

Run: `node tools/headless-check.js`
Expected: 24 passed, 0 failed

- [ ] **Step 6: 手動確認（ブラウザ）**

- 結果表示中に「画像を保存」→ 画像下部にランク・型名＋説明・理由・シード／スコアが含まれる
- タブ切替後に保存 → 選択中カテゴリの内容が保存される
- 結果未表示で保存（旧UIからは不可だが念のため）→ 腹甲のみ
- 画像サイズが縦に220px（DPR倍）伸びている

---

## Self-Review 結果

- **Spec coverage**: エクスポートCanvas組み込み(Task1 S3)・フッター帯220px(S3)・ランク色分け(S3)・型名＋説明/理由/シード描画(S3)・選択中タブ反映(interpCache[currentCategory], S3)・結果未表示フォールバック(S3)・テスト(S4-S6) — 仕様の全項目をカバー
- **Placeholder scan**: 全ステップに完全なコードを記載。TBD/TODO なし
- **Type consistency**: `currentPattern`（Task1 S1宣言, S2代入, S3使用）、`interpCache[currentCategory]`（既存のapp.js変数）、`RANK_COLORS`/`LW`/`LH`/`DPR`/`cv`/`lastSnap`（既存）で整合
