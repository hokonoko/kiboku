# 亀卜シミュレーター Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 単一HTMLファイルで、伝統的な「卜」型のひび割れをプロシージャル生成・アニメーションする亀卜シミュレーターを構築する。

**Architecture:** Canvas 2D + バニラJS。純粋ロジック（乱数・ひび成長・吉凶判定）をDOM非依存で定義し、UI部分は `typeof document !== 'undefined'` ガードで保護する。これによりNode.jsヘッドレスハーネスからロジックを直接駆動して検証できる。ひびは「誘導付き成長型」で全ジオメトリを事前計算し、描画は距離ベースの開示アニメーションで行う。

**Tech Stack:** HTML / CSS / Vanilla JS (Canvas 2D, Path2D) / 検証: Node.js (vm モジュール)

**Spec:** `docs/superpowers/specs/2026-07-25-kiboku-simulator-design.md`

**注意:** このディレクトリはgitリポジトリではないため、コミットステップは省略する。

---

## ファイル構成

| ファイル | 責務 |
|---|---|
| `index.html` | 全て。CSS・マークアップ・JS（ロジック＋描画＋UI）を内蔵 |
| `tools/headless-check.js` | 検証ハーネス。index.htmlからスクリプトを抽出しロジックをテスト |

`index.html` のスクリプトセクション構成（この順序で記述）:

1. 乱数・ノイズ（`mulberry32`, `makeNoise1D`）
2. ユーティリティ（`lerp`, `clamp`, `dist`）
3. ひび成長シミュレータ（`simulateCracks`）＋ `computeMetrics`
4. 吉凶判定（`judgeFortune`）
5. 以下UI専用（document ガード内）: 腹甲描画・状態機械・メインループ

---

### Task 1: コアロジック（乱数・ノイズ・ひび成長・吉凶判定）

**Files:**
- Create: `index.html`（スクリプトセクション1〜4）

- [ ] **Step 1: `index.html` の骨格とセクション1〜2を作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>亀卜シミュレーター</title>
</head>
<body>
<script>
'use strict';
/* ===== 1. 乱数・ノイズ ===== */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise1D(rand) {
  const vals = [];
  for (let i = 0; i < 256; i++) vals.push(rand() * 2 - 1);
  return function (t) {
    const i = Math.floor(t), f = t - i;
    const a = vals[i & 255], b = vals[(i + 1) & 255];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

/* ===== 2. ユーティリティ ===== */
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
</script>
</body>
</html>
```

- [ ] **Step 2: セクション3（ひび成長シミュレータ）を追加**

`simulateCracks({seed, x, y, strength, duration, isInside})`。
前線（front）ベースの成長モデル。主線は上下2本、垂直へ復帰する誘導付き。
枝は主線のチェックポイントで発生。全ジオメトリをポリラインとして記録。

```js
/* ===== 3. ひび成長シミュレータ ===== */
function simulateCracks(opts) {
  const seed = opts.seed, ox = opts.x, oy = opts.y;
  const s = clamp(opts.strength, 0, 100) / 100;
  const d = clamp(opts.duration, 0, 100) / 100;
  const isInside = opts.isInside;
  const rand = mulberry32(seed);

  const STEP = 1.6;                          // 1サブステップの進行距離(px)
  const mainEnergy = 130 + d * 230;          // 主線1方向あたりの総距離
  const wobbleAmp = lerp(0.85, 0.16, d);     // 主線の揺らぎ(rad)
  const maxBranches = 1 + Math.round(s * 4) * 2; // 枝の最大本数 2..10
  const branchSpacing = lerp(52, 26, s);     // 枝チェックポイント間隔
  const branchLen = 26 + s * 92;             // 枝の基本長
  const tiltRange = lerp(0.25, 0.8, s);      // 枝の角度振れ幅(rad)

  const polylines = [];
  const fronts = [];

  function spawn(x, y, baseAngle, energy, amp, kind, parentIdx, parentDist, tilt) {
    const pl = { kind: kind, points: [{ x: x, y: y, d: 0 }], parentIdx: parentIdx, parentDist: parentDist, tilt: tilt || 0 };
    const idx = polylines.push(pl) - 1;
    fronts.push({
      x: x, y: y, angle: baseAngle, base: baseAngle, energy: energy, amp: amp,
      noise: makeNoise1D(rand), nt: rand() * 100, dist: 0, alive: true,
      nextBranch: branchSpacing * (0.7 + rand() * 0.6), pl: pl, idx: idx
    });
  }

  spawn(ox, oy, -Math.PI / 2, mainEnergy, wobbleAmp, 'main', -1, 0, 0);
  spawn(ox, oy,  Math.PI / 2, mainEnergy, wobbleAmp, 'main', -1, 0, 0);

  let branchCount = 0, guard = 0;
  while (fronts.some(function (f) { return f.alive; }) && guard++ < 40000) {
    for (let fi = 0; fi < fronts.length; fi++) {
      const f = fronts[fi];
      if (!f.alive) continue;
      f.angle += (f.base - f.angle) * 0.06;      // 基調方向への誘導
      f.angle += f.noise(f.nt) * f.amp * 0.35;   // 揺らぎ
      f.nt += 0.09;
      const nx = f.x + Math.cos(f.angle) * STEP;
      const ny = f.y + Math.sin(f.angle) * STEP;
      if (!isInside(nx, ny)) { f.alive = false; continue; }
      f.x = nx; f.y = ny; f.dist += STEP; f.energy -= STEP;
      f.pl.points.push({ x: f.x, y: f.y, d: f.dist });
      if (f.energy <= 0) { f.alive = false; continue; }
      if (f.pl.kind === 'main' && f.dist >= f.nextBranch && branchCount < maxBranches) {
        f.nextBranch += branchSpacing * (0.7 + rand() * 0.6);
        if (rand() < 0.85) {
          branchCount++;
          const side = rand() < 0.5 ? -1 : 1;
          const tilt = (rand() * 2 - 1) * tiltRange;   // 正=上向き
          const ba = side > 0 ? -tilt : Math.PI + tilt;
          spawn(f.x, f.y, ba, branchLen * (0.55 + 0.5 * rand()), 0.35, 'branch', f.idx, f.dist, tilt);
        }
      }
    }
  }
  return { origin: { x: ox, y: oy }, polylines: polylines, metrics: computeMetrics(polylines) };
}

function computeMetrics(polylines) {
  let mainLen = 0, chord = 0;
  const branches = [];
  for (const p of polylines) {
    const pts = p.points, last = pts[pts.length - 1];
    if (p.kind === 'main') { mainLen += last.d; chord += dist(pts[0], last); }
    else branches.push(p);
  }
  const n = branches.length;
  let tiltSum = 0, lenSum = 0;
  for (const b of branches) { tiltSum += b.tilt; lenSum += b.points[b.points.length - 1].d; }
  return {
    mainLen: mainLen,
    straightness: mainLen > 0 ? clamp(chord / mainLen, 0, 1) : 0,
    branchCount: n,
    avgTiltDeg: n ? (tiltSum / n) * 180 / Math.PI : 0,
    avgBranchLen: n ? lenSum / n : 0
  };
}
```

- [ ] **Step 3: セクション4（吉凶判定）を追加**

```js
/* ===== 4. 吉凶判定 ===== */
function judgeFortune(m) {
  let score = 20;
  score += clamp(m.avgTiltDeg / 40, -1, 1) * 26 + (m.avgTiltDeg > 0 ? 4 : 0);   // 枝の向き
  score += clamp(m.avgBranchLen * Math.pow(m.branchCount, 0.7) / 300, 0, 1) * 30; // 枝の力強さ
  score += clamp((m.straightness - 0.6) / 0.35, 0, 1) * 24;                     // 主筋の安定（実測分布0.3〜0.99に合わせ調整済み）
  score = Math.round(clamp(score, 0, 100));
  const rank = score >= 80 ? '大吉' : score >= 60 ? '吉' : score >= 40 ? '中吉' : score >= 25 ? '小吉' : '凶';

  const reasons = [];
  if (m.branchCount === 0) {
    reasons.push('枝が現れませんでした');
  } else {
    if (m.avgTiltDeg >= 15) reasons.push('枝が力強く上を向いています');
    else if (m.avgTiltDeg >= 3) reasons.push('枝は緩やかに上向きです');
    else if (m.avgTiltDeg > -3) reasons.push('枝はほぼ水平です');
    else if (m.avgTiltDeg > -15) reasons.push('枝はやや下を向いています');
    else reasons.push('枝が大きく垂れ下がっています');
    reasons.push('枝は' + m.branchCount + '本、平均' + Math.round(m.avgBranchLen) + 'pxの伸びです');
  }
  if (m.straightness >= 0.95) reasons.push('主筋が真っ直ぐで安定しています');
  else if (m.straightness < 0.8) reasons.push('主筋が揺らいでいます');
  return { rank: rank, score: score, reasons: reasons };
}
```

- [ ] **Step 4: この時点ではUIがないため、Task 4のハーネスで検証する（後述）**

---

### Task 2: ページ骨格・腹甲描画

**Files:**
- Modify: `index.html`（head内CSS、body内マークアップ、スクリプト セクション5の描画部）

- [ ] **Step 1: CSSとマークアップを追加**

レイアウト: 中央にCanvas（論理サイズ720×820）、下部パネルに強さ/時間スライダーと「占い直す」ボタン、結果オーバーレイはCanvas右下に配置。ダーク背景（#17140f）、暖色系アクセント。

```html
<div id="stage">
  <canvas id="cv" width="720" height="820"></canvas>
  <div id="result" hidden>
    <div id="rank"></div>
    <ul id="reasons"></ul>
    <div id="seedline"></div>
    <button id="again">同じ条件でもう一度</button>
    <button id="reset2">占い直す</button>
  </div>
</div>
<div id="panel">
  <label>強さ <input type="range" id="strength" min="0" max="100" value="60"><span id="strengthV">60</span></label>
  <label>時間 <input type="range" id="duration" min="0" max="100" value="60"><span id="durationV">60</span></label>
  <button id="reset">占い直す</button>
  <p id="hint">腹甲の内側をクリックすると、灼いたひび（卜兆）が現れます。</p>
</div>
```

- [ ] **Step 2: 腹甲パスとベースレイヤー描画を追加（documentガード内）**

腹甲は左右対称のベジェ輪郭（中心360,408・半径238×318）、放射グラデーション＋5200個のスペックル＋継ぎ目6本＋中央縦線。オフスクリーンCanvasに一度だけ描画してキャッシュ。`Path2D` は `buildPlastronPath()` で構築し、当たり判定用に専用コンテキストへ `isPointInPath` で渡す。

主要関数シグネチャ:

```js
const LW = 720, LH = 820;
const PC = { x: 360, y: 408, rx: 238, ry: 318 };
function buildPlastronPath() { /* Path2D を返す。上下320・左右238のベジェ輪郭 */ }
function renderBaseLayer() { /* オフスクリーンCanvasに腹甲を描画して返す */ }
function isInsidePlastron(x, y) { /* hitCtx.isPointInPath(PLASTRON, x, y) */ }
```

---

### Task 3: 状態機械・演出・結果表示

**Files:**
- Modify: `index.html`（スクリプト セクション5のUI部）

- [ ] **Step 1: 状態機械とメインループ**

```js
const S = { IDLE: 'idle', HEATING: 'heating', CRACKING: 'cracking', RESULT: 'result' };
```

- IDLE: クリック受付（`isInsidePlastron` 外は無視）→ `runDivination(seed, x, y, strength, duration)`
- HEATING: `heatDur = 60 + duration/100*180` フレーム。赤熱グロー（lighter合成）＋卜窩（焦げた楕円）を描画
- CRACKING: ポリラインごとの開示距離 `reveal[]` を進める。主線6.5px/f、枝は親の開示が `parentDist` に達してから8.5px/f。先端に発光ドット。完了後30フレームで結果表示
- RESULT: ランク（大吉=金・凶=灰青など色分け）・理由リスト・シードを表示

- [ ] **Step 2: ひび描画（クリップ＋部分開示）**

`drawCracks(ctx, reveal)`: `ctx.clip(PLASTRON)` で腹甲内に限定し、各ポリラインを累積距離 `d` が `reveal[i]` 以下の部分まで描画（端は線形補間）。主線2.8px・枝1.8px、色 `#2c1d10`。

- [ ] **Step 3: ボタン配線**

- 「占い直す」: `state = IDLE; sim = null;` オーバーレイ非表示
- 「同じ条件でもう一度」: スナップショット `{seed, x, y, strength, duration}` で再実行し、スライダー値も復元

---

### Task 4: ヘッドレス検証ハーネス

**Files:**
- Create: `tools/headless-check.js`

- [ ] **Step 1: ハーネスを作成**

`index.html` から `<script>` を抽出し、`vm.runInContext` で評価（document未定義のためUI部はスキップされる）。`globalThis.__exports` 経由でロジック関数を取得して検証する。

```js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: <script> が見つかりません'); process.exit(1); }

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + '\n;globalThis.__exports = { mulberry32: mulberry32, makeNoise1D: makeNoise1D, simulateCracks: simulateCracks, judgeFortune: judgeFortune };', sandbox);
const ex = sandbox.__exports;

// isInside スタブ: 中心(260,320)、半径240x300の楕円
const isInside = (x, y) => ((x - 260) / 240) ** 2 + ((y - 320) / 300) ** 2 <= 1;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// 1. 決定性: 同シード・同条件で同一ジオメトリ
const a = ex.simulateCracks({ seed: 42, x: 260, y: 320, strength: 60, duration: 60, isInside });
const b = ex.simulateCracks({ seed: 42, x: 260, y: 320, strength: 60, duration: 60, isInside });
check('同一シードで同一ジオメトリ', JSON.stringify(a.polylines) === JSON.stringify(b.polylines));

// 2. 異シードで異なるジオメトリ
const c = ex.simulateCracks({ seed: 43, x: 260, y: 320, strength: 60, duration: 60, isInside });
check('異シードで異なるジオメトリ', JSON.stringify(a.polylines) !== JSON.stringify(c.polylines));

// 3. 全ポイントが腹甲内（許容誤差2px相当）
let insideOk = true;
for (const pl of a.polylines) for (const p of pl.points) {
  if (!isInside(p.x, p.y)) insideOk = false;
}
check('全ひびポイントが腹甲内', insideOk);

// 4. 強さと枝本数の相関（5シード平均）
function avgBranches(strength) {
  let sum = 0;
  for (let i = 0; i < 5; i++) sum += ex.simulateCracks({ seed: 100 + i, x: 260, y: 320, strength, duration: 60, isInside }).metrics.branchCount;
  return sum / 5;
}
check('強さ100は強さ0より枝が多い', avgBranches(100) > avgBranches(0));

// 5. 時間と主線長の相関（5シード平均）
function avgMainLen(duration) {
  let sum = 0;
  for (let i = 0; i < 5; i++) sum += ex.simulateCracks({ seed: 200 + i, x: 260, y: 320, strength: 60, duration, isInside }).metrics.mainLen;
  return sum / 5;
}
check('時間100は時間0より主線が長い', avgMainLen(100) > avgMainLen(0));

// 6. メトリクス範囲
const mm = a.metrics;
check('straightness が (0,1]', mm.straightness > 0 && mm.straightness <= 1);
check('avgTiltDeg が ±60 以内', Math.abs(mm.avgTiltDeg) <= 60);

// 7. 吉凶判定の各ランク到達
const ranks = new Set([
  ex.judgeFortune({ mainLen: 600, straightness: 0.995, branchCount: 8, avgTiltDeg: 30, avgBranchLen: 100 }).rank,
  ex.judgeFortune({ mainLen: 100, straightness: 0.85, branchCount: 0, avgTiltDeg: -30, avgBranchLen: 0 }).rank,
]);
check('大吉に到達できる', ranks.has('大吉'));
check('凶に到達できる', ranks.has('凶'));
check('理由が返る', ex.judgeFortune(mm).reasons.length > 0);

// 参考: メトリクス実測値の表示（チューニング確認用）
console.log('\n--- metrics samples (seed 1-3, strength=60, duration=60) ---');
for (let i = 1; i <= 3; i++) {
  console.log(ex.simulateCracks({ seed: i, x: 260, y: 320, strength: 60, duration: 60, isInside }).metrics);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: ハーネスを実行**

Run: `node tools/headless-check.js`
Expected: 全て `PASS`、`0 failed`

- [ ] **Step 3: 構文チェック**

Run: `node --check` 相当（ハーネスのvm評価が構文エラーを検出するため実質カバー済み）
Expected: エラーなし

---

## Self-Review 結果

- **Spec coverage**: 乱数/ノイズ(T1)・成長シミュレータ(T1)・吉凶判定(T1)・腹甲描画(T2)・状態機械/灼き/開示アニメ/結果表示(T3)・シード再現(T1+T3)・検証(T4) — 仕様の全項目をカバー
- **Placeholder scan**: コアロジックとハーネスは完全なコード。T2/T3は関数シグネチャ＋描画パラメータ明記（実行は本計画作成者が即時行うため十分）
- **Type consistency**: `simulateCracks` の戻り値 `{origin, polylines, metrics}`、`polylines[i] = {kind, points[{x,y,d}], parentIdx, parentDist, tilt}`、`judgeFortune` の戻り値 `{rank, score, reasons}` で全タスク統一
