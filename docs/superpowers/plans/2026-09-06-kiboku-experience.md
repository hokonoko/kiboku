# 亀卜シミュレーター体験拡充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現行の単一HTML亀卜シミュレーターを複数ファイル構成に分割し、占い結果の充実（型判定・カテゴリ別解釈・根拠ハイライト）、演出強化（音響・パーティクル）、描画品質改善（ひび焼き付け・2重ストローク）、PNG保存を実装する。

**Architecture:** 通常 `<script src>` ＋ `window.Kiboku` 名前空間で分割し `file://` 直開きを維持。純粋ロジック（core/sim/fortune）はDOM非依存を保ち、Node.js vm ハーネスで検証。読込順は `core → sim → fortune → plastron → effects → audio → app`。

**Tech Stack:** HTML / CSS / Vanilla JS (Canvas 2D, Path2D, Web Audio API) / 検証: Node.js (vm モジュール)

**Spec:** `docs/superpowers/specs/2026-09-06-kiboku-experience-design.md`

**注意:** このディレクトリはgitリポジトリではないため、コミットステップは省略する。

---

## ファイル構成

| ファイル | 責務 |
|---|---|
| `index.html` | マークアップ・CSS・scriptタグ列挙（JSロジックは全て src/ へ移動） |
| `src/core.js` | 名前空間初期化、mulberry32/makeNoise1D/lerp/clamp/dist |
| `src/sim.js` | simulateCracks, computeMetrics（純粋ロジック、sideBalance/upwardRatio追加） |
| `src/fortune.js` | judgeFortune, classifyPattern, interpretFortune（純粋ロジック） |
| `src/plastron.js` | 腹甲パス・ベースレイヤー描画 |
| `src/effects.js` | 加熱グロー、煙・火花パーティクル |
| `src/audio.js` | Web Audio 音響 |
| `src/app.js` | 状態機械・イベント配線・メインループ・PNG保存 |
| `tools/headless-check.js` | core/sim/fortune を順に vm 評価して検証（拡張） |

### 型定義（全タスク共通）

```js
// metrics オブジェクト（computeMetrics の戻り値）
{
  mainLen: number,        // 主線の総延長(px)
  straightness: number,   // 0..1 主線の真っ直ぐさ
  branchCount: number,    // 枝の本数
  avgTiltDeg: number,     // 枝の平均傾き(度、正=上向き)
  avgBranchLen: number,   // 枝の平均長(px)
  sideBalance: number,    // 0..1 左右枝数比 (min/(max||1))
  upwardRatio: number     // 0..1 上向き枝の割合
}

// interpretFortune の戻り値
{
  rank: string,               // '大吉'|'吉'|'中吉'|'小吉'|'凶'
  score: number,              // 0..100
  reasons: string[],          // 解釈文
  evidenceIndices: number[]   // 根拠ポリラインのインデックス
}

// classifyPattern の戻り値
{ name: string, description: string }
```

---

### Task 1: ファイル分割（コアロジック）

**Files:**
- Create: `src/core.js`
- Create: `src/sim.js`
- Create: `src/fortune.js`
- Create: `index.html`（最小骨格）
- Modify: `tools/headless-check.js`

- [ ] **Step 1: `src/core.js` を作成**

```js
'use strict';
/* ===== 亀卜シミュレーター コア: 名前空間・乱数・ノイズ・ユーティリティ ===== */
window.Kiboku = window.Kiboku || {};

(function (K) {
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

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }

  K.mulberry32 = mulberry32;
  K.makeNoise1D = makeNoise1D;
  K.lerp = lerp;
  K.clamp = clamp;
  K.dist = dist;
})(window.Kiboku);
```

- [ ] **Step 2: `src/sim.js` を作成（sideBalance/upwardRatio 追加のため spawn に side パラメータを導入）**

```js
'use strict';
/* ===== ひび成長シミュレータ（純粋ロジック） ===== */
(function (K) {
  function simulateCracks(opts) {
    const seed = opts.seed, ox = opts.x, oy = opts.y;
    const s = K.clamp(opts.strength, 0, 100) / 100;
    const d = K.clamp(opts.duration, 0, 100) / 100;
    const isInside = opts.isInside;
    const rand = K.mulberry32(seed);

    const STEP = 1.6;
    const mainEnergy = 130 + d * 230;
    const wobbleAmp = K.lerp(0.85, 0.16, d);
    const maxBranches = 1 + Math.round(s * 4) * 2;
    const branchSpacing = K.lerp(52, 26, s);
    const branchLen = 26 + s * 92;
    const tiltRange = K.lerp(0.25, 0.8, s);

    const polylines = [];
    const fronts = [];

    function spawn(x, y, baseAngle, energy, amp, kind, parentIdx, parentDist, tilt, side) {
      const pl = { kind: kind, points: [{ x: x, y: y, d: 0 }], parentIdx: parentIdx, parentDist: parentDist, tilt: tilt || 0, side: side || 0 };
      const idx = polylines.push(pl) - 1;
      fronts.push({
        x: x, y: y, angle: baseAngle, base: baseAngle, energy: energy, amp: amp,
        noise: K.makeNoise1D(rand), nt: rand() * 100, dist: 0, alive: true,
        nextBranch: branchSpacing * (0.7 + rand() * 0.6), pl: pl, idx: idx
      });
    }

    spawn(ox, oy, -Math.PI / 2, mainEnergy, wobbleAmp, 'main', -1, 0, 0, 0);
    spawn(ox, oy, Math.PI / 2, mainEnergy, wobbleAmp, 'main', -1, 0, 0, 0);

    let branchCount = 0, guard = 0;
    while (fronts.some(function (f) { return f.alive; }) && guard++ < 40000) {
      for (let fi = 0; fi < fronts.length; fi++) {
        const f = fronts[fi];
        if (!f.alive) continue;
        f.angle += (f.base - f.angle) * 0.06;
        f.angle += f.noise(f.nt) * f.amp * 0.35;
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
            const tilt = (rand() * 2 - 1) * tiltRange;
            const ba = side > 0 ? -tilt : Math.PI + tilt;
            spawn(f.x, f.y, ba, branchLen * (0.55 + 0.5 * rand()), 0.35, 'branch', f.idx, f.dist, tilt, side);
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
      if (p.kind === 'main') { mainLen += last.d; chord += K.dist(pts[0], last); }
      else branches.push(p);
    }
    const n = branches.length;
    let tiltSum = 0, lenSum = 0, leftCount = 0, rightCount = 0, upCount = 0;
    for (const b of branches) {
      tiltSum += b.tilt;
      lenSum += b.points[b.points.length - 1].d;
      if (b.side < 0) leftCount++;
      else if (b.side > 0) rightCount++;
      if (b.tilt > 0) upCount++;
    }
    return {
      mainLen: mainLen,
      straightness: mainLen > 0 ? K.clamp(chord / mainLen, 0, 1) : 0,
      branchCount: n,
      avgTiltDeg: n ? (tiltSum / n) * 180 / Math.PI : 0,
      avgBranchLen: n ? lenSum / n : 0,
      sideBalance: n ? Math.min(leftCount, rightCount) / (Math.max(leftCount, rightCount) || 1) : 0,
      upwardRatio: n ? upCount / n : 0
    };
  }

  K.simulateCracks = simulateCracks;
  K.computeMetrics = computeMetrics;
})(window.Kiboku);
```

- [ ] **Step 3: `src/fortune.js` を作成（judgeFortune は現行ロジックを維持）**

```js
'use strict';
/* ===== 吉凶判定・型判定・カテゴリ別解釈（純粋ロジック） ===== */
(function (K) {
  function judgeFortune(m) {
    let score = 20;
    score += K.clamp(m.avgTiltDeg / 40, -1, 1) * 26 + (m.avgTiltDeg > 0 ? 4 : 0);
    score += K.clamp(m.avgBranchLen * Math.pow(m.branchCount, 0.7) / 300, 0, 1) * 30;
    score += K.clamp((m.straightness - 0.6) / 0.35, 0, 1) * 24;
    score = Math.round(K.clamp(score, 0, 100));
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

  function classifyPattern(m) {
    if (m.branchCount === 0) {
      return { name: '細流型', description: '枝を持たず細く流れる卜兆。内なる声に耳を澄ませる時。' };
    }
    if (m.straightness >= 0.95 && m.upwardRatio >= 0.6) {
      return { name: '直達型', description: '主筋が真っ直ぐで枝も上向きの、勢いのある卜兆。願いは天に届きやすい。' };
    }
    if (m.upwardRatio >= 0.7) {
      return { name: '昇枝型', description: '枝の多くが上を向く卜兆。物事が上向きに進む兆し。' };
    }
    if (m.upwardRatio <= 0.3) {
      return { name: '垂蔭型', description: '枝が垂れ下がる卜兆。慎重さと休息が求められる。' };
    }
    if (m.branchCount >= 6 && m.sideBalance >= 0.6) {
      return { name: '分岐型', description: '左右にバランスよく枝が分かれる卜兆。選択肢が豊かにある。' };
    }
    return { name: '中庸型', description: '突出した特徴のない、穏やかな卜兆。平穏な運気。' };
  }

  function interpretFortune(m, category) {
    category = category || 'overall';
    if (category === 'overall') {
      const j = judgeFortune(m);
      return { rank: j.rank, score: j.score, reasons: j.reasons, evidenceIndices: [] };
    }

    let score = 20;
    const reasons = [];
    if (category === 'work') {
      score += K.clamp((m.straightness - 0.6) / 0.35, 0, 1) * 40;
      score += K.clamp(m.mainLen / 500, 0, 1) * 25;
      score += K.clamp(m.avgBranchLen * Math.pow(m.branchCount, 0.7) / 300, 0, 1) * 15;
      reasons.push(m.straightness >= 0.9 ? '主筋が安定しており、仕事の基盤は固いでしょう' : '主筋が揺らいでおり、仕事では足元を固める時期です');
    } else if (category === 'love') {
      score += K.clamp(m.avgTiltDeg / 40, -1, 1) * 30 + (m.avgTiltDeg > 0 ? 5 : 0);
      score += K.clamp(m.sideBalance, 0, 1) * 30;
      score += K.clamp(m.upwardRatio, 0, 1) * 20;
      reasons.push(m.sideBalance >= 0.6 ? '左右の枝が調和しており、相手とのバランスが取れています' : '枝の偏りが見られ、関係に一方通行の気配があります');
    } else if (category === 'health') {
      score += K.clamp(m.mainLen / 500, 0, 1) * 45;
      score += K.clamp((m.straightness - 0.6) / 0.35, 0, 1) * 20;
      score += K.clamp(m.avgBranchLen / 100, 0, 1) * 15;
      reasons.push(m.mainLen >= 400 ? '主筋が長く伸びており、気力・体力ともに充実しています' : '主筋が短めで、無理をせず養生するのが吉です');
    }
    score = Math.round(K.clamp(score, 0, 100));
    const rank = score >= 80 ? '大吉' : score >= 60 ? '吉' : score >= 40 ? '中吉' : score >= 25 ? '小吉' : '凶';
    return { rank: rank, score: score, reasons: reasons, evidenceIndices: [] };
  }

  K.judgeFortune = judgeFortune;
  K.classifyPattern = classifyPattern;
  K.interpretFortune = interpretFortune;
})(window.Kiboku);
```

- [ ] **Step 4: `index.html` を最小骨格で作成（UIは Task 4 で追加）**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>亀卜シミュレーター</title>
</head>
<body>
<script src="src/core.js"></script>
<script src="src/sim.js"></script>
<script src="src/fortune.js"></script>
</body>
</html>
```

- [ ] **Step 5: `tools/headless-check.js` を書き換え（3ファイル評価方式）**

```js
// 亀卜シミュレーター ヘッドレス検証ハーネス
// src/core.js, src/sim.js, src/fortune.js を順に vm 評価してロジックを検証する。
// 使い方: node tools/headless-check.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ['core.js', 'sim.js', 'fortune.js']) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}
const ex = sandbox.window.Kiboku;

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

// 3. 全ポイントが腹甲内
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
check('sideBalance が [0,1]', mm.sideBalance >= 0 && mm.sideBalance <= 1);
check('upwardRatio が [0,1]', mm.upwardRatio >= 0 && mm.upwardRatio <= 1);

// 7. 吉凶判定の各ランク到達と理由
const ranks = new Set([
  ex.judgeFortune({ mainLen: 600, straightness: 0.995, branchCount: 8, avgTiltDeg: 30, avgBranchLen: 100 }).rank,
  ex.judgeFortune({ mainLen: 100, straightness: 0.85, branchCount: 0, avgTiltDeg: -30, avgBranchLen: 0 }).rank,
]);
check('大吉に到達できる', ranks.has('大吉'));
check('凶に到達できる', ranks.has('凶'));
check('理由が返る', ex.judgeFortune(mm).reasons.length > 0);

// 8. 型判定
const pats = new Set([
  ex.classifyPattern({ mainLen: 100, straightness: 0.85, branchCount: 0, avgTiltDeg: 0, avgBranchLen: 0, sideBalance: 0, upwardRatio: 0 }).name,
  ex.classifyPattern({ mainLen: 600, straightness: 0.99, branchCount: 6, avgTiltDeg: 30, avgBranchLen: 90, sideBalance: 0.8, upwardRatio: 0.8 }).name,
  ex.classifyPattern({ mainLen: 300, straightness: 0.85, branchCount: 6, avgTiltDeg: 25, avgBranchLen: 80, sideBalance: 0.5, upwardRatio: 0.75 }).name,
  ex.classifyPattern({ mainLen: 300, straightness: 0.85, branchCount: 6, avgTiltDeg: -25, avgBranchLen: 80, sideBalance: 0.5, upwardRatio: 0.2 }).name,
  ex.classifyPattern({ mainLen: 300, straightness: 0.85, branchCount: 8, avgTiltDeg: 5, avgBranchLen: 80, sideBalance: 0.75, upwardRatio: 0.5 }).name,
  ex.classifyPattern({ mainLen: 300, straightness: 0.85, branchCount: 4, avgTiltDeg: 0, avgBranchLen: 60, sideBalance: 0.3, upwardRatio: 0.5 }).name,
]);
check('細流型に分類できる', pats.has('細流型'));
check('直達型に分類できる', pats.has('直達型'));
check('昇枝型に分類できる', pats.has('昇枝型'));
check('垂蔭型に分類できる', pats.has('垂蔭型'));
check('分岐型に分類できる', pats.has('分岐型'));
check('中庸型に分類できる', pats.has('中庸型'));
check('型の説明文が返る', ex.classifyPattern(mm).description.length > 0);

// 9. カテゴリ別解釈
const ov = ex.interpretFortune(mm, 'overall');
const wk = ex.interpretFortune(mm, 'work');
const lv = ex.interpretFortune(mm, 'love');
const hl = ex.interpretFortune(mm, 'health');
check('総合のランクが返る', !!ov.rank);
check('仕事のランクと理由が返る', !!wk.rank && wk.reasons.length > 0);
check('恋愛のランクと理由が返る', !!lv.rank && lv.reasons.length > 0);
check('健康のランクと理由が返る', !!hl.rank && hl.reasons.length > 0);
check('evidenceIndices が配列で返る', Array.isArray(ov.evidenceIndices) && Array.isArray(wk.evidenceIndices));

// 参考: メトリクス実測値の表示（チューニング確認用）
console.log('\n--- metrics samples (seed 1-3, strength=60, duration=60) ---');
for (let i = 1; i <= 3; i++) {
  console.log(ex.simulateCracks({ seed: i, x: 260, y: 320, strength: 60, duration: 60, isInside }).metrics);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 6: ハーネスを実行**

Run: `node tools/headless-check.js`
Expected: 全て `PASS`、`0 failed`

---

### Task 2: 描画層の分割（plastron.js / effects.js）

**Files:**
- Create: `src/plastron.js`
- Create: `src/effects.js`

- [ ] **Step 1: `src/plastron.js` を作成**

```js
'use strict';
/* ===== 腹甲パス・ベースレイヤー描画 ===== */
(function (K) {
  const LW = 720, LH = 820;
  const PC = { x: 360, y: 408, rx: 238, ry: 318 };

  function buildPlastronPath() {
    const x = PC.x, y = PC.y, rx = PC.rx, ry = PC.ry;
    const p = new Path2D();
    p.moveTo(x, y - ry);
    p.bezierCurveTo(x + rx * 0.62, y - ry, x + rx * 0.99, y - ry * 0.68, x + rx, y - ry * 0.34);
    p.bezierCurveTo(x + rx * 1.01, y - ry * 0.02, x + rx * 0.88, y + ry * 0.52, x + rx * 0.62, y + ry * 0.82);
    p.bezierCurveTo(x + rx * 0.44, y + ry * 1.02, x + rx * 0.18, y + ry, x, y + ry);
    p.bezierCurveTo(x - rx * 0.18, y + ry, x - rx * 0.44, y + ry * 1.02, x - rx * 0.62, y + ry * 0.82);
    p.bezierCurveTo(x - rx * 0.88, y + ry * 0.52, x - rx * 1.01, y - ry * 0.02, x - rx, y - ry * 0.34);
    p.bezierCurveTo(x - rx * 0.99, y - ry * 0.68, x - rx * 0.62, y - ry, x, y - ry);
    p.closePath();
    return p;
  }

  function renderBaseLayer(plastron, dpr) {
    const off = document.createElement('canvas');
    off.width = LW * dpr;
    off.height = LH * dpr;
    const c = off.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    c.fillStyle = '#211c14';
    c.fillRect(0, 0, LW, LH);

    c.save();
    c.clip(plastron);
    const g = c.createRadialGradient(PC.x - 60, PC.y - 120, 60, PC.x, PC.y, 460);
    g.addColorStop(0, '#f2e6c4');
    g.addColorStop(0.55, '#dcc59a');
    g.addColorStop(1, '#a98d5f');
    c.fillStyle = g;
    c.fillRect(0, 0, LW, LH);

    const r = K.mulberry32(20260725);
    for (let i = 0; i < 5200; i++) {
      const sx = r() * LW, sy = r() * LH;
      c.fillStyle = r() < 0.5 ? 'rgba(90,66,38,0.05)' : 'rgba(255,246,220,0.05)';
      c.beginPath();
      c.arc(sx, sy, 0.5 + r() * 1.8, 0, 7);
      c.fill();
    }
    for (let i = 0; i < 14; i++) {
      const bx = PC.x + (r() * 2 - 1) * PC.rx * 0.7;
      const by = PC.y + (r() * 2 - 1) * PC.ry * 0.7;
      const br = 20 + r() * 60;
      const bg = c.createRadialGradient(bx, by, 2, bx, by, br);
      bg.addColorStop(0, 'rgba(120,90,50,0.06)');
      bg.addColorStop(1, 'rgba(120,90,50,0)');
      c.fillStyle = bg;
      c.beginPath();
      c.arc(bx, by, br, 0, 7);
      c.fill();
    }

    c.strokeStyle = 'rgba(96,72,42,0.5)';
    c.lineWidth = 2;
    for (let k = 1; k < 6; k++) {
      const sy = PC.y - PC.ry + (2 * PC.ry) * k / 6;
      c.beginPath();
      c.moveTo(PC.x - PC.rx, sy);
      c.quadraticCurveTo(PC.x, sy + (k % 2 ? 16 : -16), PC.x + PC.rx, sy);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(PC.x, PC.y - PC.ry);
    c.quadraticCurveTo(PC.x + 10, PC.y, PC.x, PC.y + PC.ry);
    c.stroke();
    c.restore();

    c.strokeStyle = 'rgba(70,50,26,0.8)';
    c.lineWidth = 3;
    c.stroke(plastron);
    return off;
  }

  K.LW = LW;
  K.LH = LH;
  K.PC = PC;
  K.buildPlastronPath = buildPlastronPath;
  K.renderBaseLayer = renderBaseLayer;
})(window.Kiboku);
```

- [ ] **Step 2: `src/effects.js` を作成（煙・火花パーティクル＋加熱グロー）**

```js
'use strict';
/* ===== 演出: 加熱グロー・煙・火花パーティクル ===== */
(function (K) {
  function drawHollow(c, origin, alpha) {
    c.save();
    c.translate(origin.x, origin.y);
    c.scale(1.4, 1);
    const cg = c.createRadialGradient(0, 0, 1, 0, 0, 11);
    cg.addColorStop(0, 'rgba(38,22,10,' + alpha + ')');
    cg.addColorStop(1, 'rgba(38,22,10,0)');
    c.fillStyle = cg;
    c.beginPath();
    c.arc(0, 0, 11, 0, 7);
    c.fill();
    c.restore();
  }

  function drawHeating(c, origin, t, heatT) {
    const pulse = 0.5 + 0.5 * Math.sin(heatT * 0.25);
    const rad = 26 + t * 30 + pulse * 10;
    const g = c.createRadialGradient(origin.x, origin.y, 2, origin.x, origin.y, rad);
    g.addColorStop(0, 'rgba(255,190,90,0.85)');
    g.addColorStop(0.35, 'rgba(255,110,40,' + (0.45 * t + 0.2) + ')');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.beginPath();
    c.arc(origin.x, origin.y, rad, 0, 7);
    c.fill();
    c.restore();
    drawHollow(c, origin, 0.75 * t);
  }

  // --- パーティクル ---
  function createParticles() { return { smoke: [], sparks: [] }; }

  function spawnSmoke(P, x, y, rand) {
    if (P.smoke.length >= 30) return;
    P.smoke.push({
      x: x + (rand() * 2 - 1) * 6, y: y,
      r: 3 + rand() * 3, grow: 0.12 + rand() * 0.1,
      vy: -(0.35 + rand() * 0.4), vx: (rand() * 2 - 1) * 0.15,
      life: 1, decay: 0.006 + rand() * 0.005
    });
  }

  function spawnSparks(P, x, y, rand, n) {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const sp = 0.8 + rand() * 1.6;
      P.sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6,
        life: 1, decay: 0.02 + rand() * 0.02
      });
    }
  }

  function updateParticles(P) {
    for (let i = P.smoke.length - 1; i >= 0; i--) {
      const s = P.smoke[i];
      s.x += s.vx; s.y += s.vy; s.r += s.grow; s.life -= s.decay;
      if (s.life <= 0) P.smoke.splice(i, 1);
    }
    for (let i = P.sparks.length - 1; i >= 0; i--) {
      const s = P.sparks[i];
      s.x += s.vx; s.y += s.vy; s.vy += 0.03; s.life -= s.decay;
      if (s.life <= 0) P.sparks.splice(i, 1);
    }
  }

  function drawParticles(c, P) {
    c.save();
    for (const s of P.smoke) {
      const g = c.createRadialGradient(s.x, s.y, 0.5, s.x, s.y, s.r);
      g.addColorStop(0, 'rgba(120,110,100,' + (0.16 * s.life) + ')');
      g.addColorStop(1, 'rgba(120,110,100,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, 7);
      c.fill();
    }
    c.globalCompositeOperation = 'lighter';
    for (const s of P.sparks) {
      c.fillStyle = 'rgba(255,' + Math.round(140 + 80 * s.life) + ',60,' + (0.8 * s.life) + ')';
      c.beginPath();
      c.arc(s.x, s.y, 1.4, 0, 7);
      c.fill();
    }
    c.restore();
  }

  K.drawHollow = drawHollow;
  K.drawHeating = drawHeating;
  K.createParticles = createParticles;
  K.spawnSmoke = spawnSmoke;
  K.spawnSparks = spawnSparks;
  K.updateParticles = updateParticles;
  K.drawParticles = drawParticles;
})(window.Kiboku);
```

- [ ] **Step 3: 構文チェック**

Run: `node --check src/plastron.js; node --check src/effects.js`
Expected: エラーなし

---

### Task 3: 音響（audio.js）

**Files:**
- Create: `src/audio.js`

- [ ] **Step 1: `src/audio.js` を作成**

```js
'use strict';
/* ===== Web Audio プロシージャル音響 ===== */
(function (K) {
  let actx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (actx || typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = 0.6;
    master.connect(actx.destination);
    const len = actx.sampleRate;
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  function resume() {
    ensure();
    if (actx && actx.state === 'suspended') actx.resume();
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.6;
  }

  function isMuted() { return muted; }

  // 短いノイズバースト（炭のパチパチ・ひび割れ用）
  function burst(freq, q, dur, gain) {
    if (!actx || muted) return;
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = actx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = actx.createGain();
    const t = actx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  // トーン（結果音用）
  function tone(freq, dur, gain, type) {
    if (!actx || muted) return;
    const o = actx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = actx.createGain();
    const t = actx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + dur);
  }

  // 灼き中のループ音（低音の唸り）
  let humNodes = null;
  function startHum() {
    if (!actx || muted || humNodes) return;
    const o = actx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = actx.createGain();
    g.gain.value = 0.05;
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start();
    humNodes = { o: o, g: g };
  }

  function stopHum() {
    if (!humNodes) return;
    const t = actx.currentTime;
    humNodes.g.gain.setTargetAtTime(0, t, 0.1);
    humNodes.o.stop(t + 0.4);
    humNodes = null;
  }

  function emberCrackle() { burst(1800 + Math.random() * 2200, 6, 0.06, 0.12); }
  function crackSnap(isMain) { burst(isMain ? 900 : 1600, 8, 0.05, isMain ? 0.2 : 0.14); }

  function resultChime(rank) {
    if (rank === '大吉') { tone(523, 0.9, 0.18); setTimeout(function () { tone(784, 1.1, 0.15); }, 180); }
    else if (rank === '吉') { tone(440, 0.8, 0.15); setTimeout(function () { tone(659, 0.9, 0.12); }, 160); }
    else if (rank === '中吉') { tone(392, 0.8, 0.13); }
    else if (rank === '小吉') { tone(330, 0.8, 0.12); }
    else { tone(196, 1.4, 0.16, 'triangle'); }
  }

  K.audio = {
    resume: resume,
    setMuted: setMuted,
    isMuted: isMuted,
    startHum: startHum,
    stopHum: stopHum,
    emberCrackle: emberCrackle,
    crackSnap: crackSnap,
    resultChime: resultChime
  };
})(window.Kiboku);
```

- [ ] **Step 2: 構文チェック**

Run: `node --check src/audio.js`
Expected: エラーなし

---

### Task 4: アプリ層（app.js）と index.html 完成

**Files:**
- Create: `src/app.js`
- Modify: `index.html`

- [ ] **Step 1: `src/app.js` を作成**

ひび焼き付け（crackLayer）・2重ストローク・カテゴリタブ・根拠ハイライト・PNG保存・ミュートボタンを含む完全版。

```js
'use strict';
/* ===== UI: 状態機械・イベント配線・メインループ ===== */
(function (K) {
  const LW = K.LW, LH = K.LH, PC = K.PC;
  const RANK_COLORS = { '大吉': '#ffd75e', '吉': '#ff9d5c', '中吉': '#e8e0cf', '小吉': '#a9c48a', '凶': '#8fa0b3' };
  const S = { IDLE: 'idle', HEATING: 'heating', CRACKING: 'cracking', RESULT: 'result' };
  const CATEGORIES = [
    { key: 'overall', label: '総合' },
    { key: 'work', label: '仕事' },
    { key: 'love', label: '恋愛' },
    { key: 'health', label: '健康' }
  ];

  // --- DOM ---
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = LW * DPR;
  cv.height = LH * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const resultEl = document.getElementById('result');
  const rankEl = document.getElementById('rank');
  const patternEl = document.getElementById('pattern');
  const tabsEl = document.getElementById('tabs');
  const reasonsEl = document.getElementById('reasons');
  const seedlineEl = document.getElementById('seedline');
  const strengthEl = document.getElementById('strength');
  const durationEl = document.getElementById('duration');
  const strengthVEl = document.getElementById('strengthV');
  const durationVEl = document.getElementById('durationV');
  const hintEl = document.getElementById('hint');
  const muteEl = document.getElementById('mute');

  // --- 腹甲 ---
  const PLASTRON = K.buildPlastronPath();
  const hitCtx = document.createElement('canvas').getContext('2d');
  function isInsidePlastron(x, y) { return hitCtx.isPointInPath(PLASTRON, x, y); }
  const baseLayer = K.renderBaseLayer(PLASTRON, DPR);

  // --- ひび焼き付けレイヤー ---
  const crackLayer = document.createElement('canvas');
  crackLayer.width = LW * DPR;
  crackLayer.height = LH * DPR;
  const crackCtx = crackLayer.getContext('2d');
  crackCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // --- 状態 ---
  let state = S.IDLE;
  let sim = null;
  let lastSnap = null;
  let heatT = 0, heatDur = 60, holdT = 0;
  let reveal = [];
  let baked = [];
  let particles = K.createParticles();
  let currentCategory = 'overall';
  let interpCache = {};
  let highlightT = 0;
  let crackleTimer = 0;

  // --- ひび描画 ---
  function strokePolyline(c, pts, rd) {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < pts.length; j++) {
      if (pts[j].d <= rd) {
        c.lineTo(pts[j].x, pts[j].y);
      } else {
        const p0 = pts[j - 1], p1 = pts[j];
        const tt = (rd - p0.d) / (p1.d - p0.d);
        c.lineTo(p0.x + (p1.x - p0.x) * tt, p0.y + (p1.y - p0.y) * tt);
        break;
      }
    }
    c.stroke();
  }

  function drawGrowingCracks(c) {
    c.save();
    c.clip(PLASTRON);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let i = 0; i < sim.polylines.length; i++) {
      if (baked[i]) continue;
      const pl = sim.polylines[i];
      const rd = reveal[i];
      if (rd <= 0) continue;
      c.strokeStyle = '#2c1d10';
      c.lineWidth = pl.kind === 'main' ? 2.8 : 1.8;
      strokePolyline(c, pl.points, rd);
    }
    c.restore();
  }

  function bakePolyline(i) {
    const pl = sim.polylines[i];
    const total = pl.points[pl.points.length - 1].d;
    crackCtx.save();
    crackCtx.clip(PLASTRON);
    crackCtx.lineCap = 'round';
    crackCtx.lineJoin = 'round';
    // 縁（やや明るい太線）
    crackCtx.strokeStyle = 'rgba(120,90,55,0.55)';
    crackCtx.lineWidth = (pl.kind === 'main' ? 2.8 : 1.8) + 1.6;
    strokePolyline(crackCtx, pl.points, total);
    // 芯（暗い細線）
    crackCtx.strokeStyle = '#2c1d10';
    crackCtx.lineWidth = pl.kind === 'main' ? 2.8 : 1.8;
    strokePolyline(crackCtx, pl.points, total);
    crackCtx.restore();
    baked[i] = true;
  }

  function tipPos(pl, rd) {
    const pts = pl.points;
    const total = pts[pts.length - 1].d;
    if (rd <= 0 || rd >= total) return null;
    for (let j = 1; j < pts.length; j++) {
      if (pts[j].d > rd) {
        const p0 = pts[j - 1], p1 = pts[j];
        const t = (rd - p0.d) / (p1.d - p0.d);
        return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
      }
    }
    return null;
  }

  function drawTips(c) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < sim.polylines.length; i++) {
      if (baked[i]) continue;
      const tp = tipPos(sim.polylines[i], reveal[i]);
      if (!tp) continue;
      const g = c.createRadialGradient(tp.x, tp.y, 0.5, tp.x, tp.y, 7);
      g.addColorStop(0, 'rgba(255,176,102,0.8)');
      g.addColorStop(1, 'rgba(255,120,50,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(tp.x, tp.y, 7, 0, 7);
      c.fill();
    }
    c.restore();
  }

  function drawHighlight(c, indices, t) {
    if (!indices || indices.length === 0) return;
    const alpha = 0.35 + 0.3 * Math.sin(t * 0.08);
    c.save();
    c.clip(PLASTRON);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(255,215,94,' + alpha + ')';
    for (const i of indices) {
      const pl = sim.polylines[i];
      if (!pl) continue;
      c.lineWidth = (pl.kind === 'main' ? 2.8 : 1.8) + 2.5;
      strokePolyline(c, pl.points, 1e9);
    }
    c.restore();
  }

  function advanceReveal() {
    const MAIN_RATE = 6.5, BR_RATE = 8.5;
    let allDone = true;
    for (let i = 0; i < sim.polylines.length; i++) {
      const pl = sim.polylines[i];
      const total = pl.points[pl.points.length - 1].d;
      if (baked[i]) continue;
      if (pl.kind === 'main') {
        reveal[i] = Math.min(total, reveal[i] + MAIN_RATE);
      } else if (reveal[pl.parentIdx] >= pl.parentDist) {
        reveal[i] = Math.min(total, reveal[i] + BR_RATE);
      }
      if (reveal[i] >= total) {
        bakePolyline(i);
        K.audio.crackSnap(pl.kind === 'main');
      } else {
        allDone = false;
      }
    }
    return allDone;
  }

  // --- 結果表示 ---
  function buildTabs() {
    tabsEl.innerHTML = '';
    CATEGORIES.forEach(function (cat) {
      const b = document.createElement('button');
      b.textContent = cat.label;
      b.className = 'tab' + (cat.key === currentCategory ? ' active' : '');
      b.addEventListener('click', function () {
        currentCategory = cat.key;
        buildTabs();
        showCategory();
      });
      tabsEl.appendChild(b);
    });
  }

  function showCategory() {
    const interp = interpCache[currentCategory];
    rankEl.textContent = interp.rank;
    rankEl.style.color = RANK_COLORS[interp.rank];
    reasonsEl.innerHTML = '';
    interp.reasons.forEach(function (r) {
      const li = document.createElement('li');
      li.textContent = r;
      reasonsEl.appendChild(li);
    });
  }

  function showResult() {
    const pat = K.classifyPattern(sim.metrics);
    patternEl.textContent = '【' + pat.name + '】' + pat.description;
    interpCache = {};
    CATEGORIES.forEach(function (cat) {
      interpCache[cat.key] = K.interpretFortune(sim.metrics, cat.key);
    });
    // 根拠ハイライト: 総合判定の根拠として全枝（型の特徴となる枝群）を使う
    const ev = [];
    for (let i = 0; i < sim.polylines.length; i++) {
      if (sim.polylines[i].kind === 'branch') ev.push(i);
    }
    interpCache.overall.evidenceIndices = ev;
    currentCategory = 'overall';
    buildTabs();
    showCategory();
    seedlineEl.textContent = 'シード: ' + lastSnap.seed + ' ／ スコア: ' + interpCache.overall.score;
    resultEl.hidden = false;
    highlightT = 0;
    K.audio.resultChime(interpCache.overall.rank);
  }

  // --- 操作 ---
  function runDivination(seed, x, y, strength, duration) {
    sim = K.simulateCracks({ seed: seed, x: x, y: y, strength: strength, duration: duration, isInside: isInsidePlastron });
    lastSnap = { seed: seed, x: x, y: y, strength: strength, duration: duration };
    resultEl.hidden = true;
    heatT = 0;
    heatDur = Math.round(60 + (K.clamp(duration, 0, 100) / 100) * 180);
    holdT = 0;
    reveal = sim.polylines.map(function () { return 0; });
    baked = sim.polylines.map(function () { return false; });
    particles = K.createParticles();
    crackCtx.clearRect(0, 0, LW, LH);
    crackleTimer = 0;
    state = S.HEATING;
    K.audio.startHum();
  }

  function resetAll() {
    state = S.IDLE;
    sim = null;
    resultEl.hidden = true;
    K.audio.stopHum();
  }

  function syncLabels() {
    strengthVEl.textContent = strengthEl.value;
    durationVEl.textContent = durationEl.value;
  }

  let hintTimer = null;
  function flashHint() {
    hintEl.style.color = '#e0a060';
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintEl.style.color = ''; }, 700);
  }

  cv.addEventListener('click', function (e) {
    if (state !== S.IDLE) return;
    K.audio.resume();
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * LW;
    const y = (e.clientY - r.top) / r.height * LH;
    if (!isInsidePlastron(x, y)) { flashHint(); return; }
    const seed = (Math.random() * 4294967296) >>> 0;
    runDivination(seed, x, y, Number(strengthEl.value), Number(durationEl.value));
  });

  document.getElementById('reset').addEventListener('click', resetAll);
  document.getElementById('reset2').addEventListener('click', resetAll);
  document.getElementById('again').addEventListener('click', function () {
    if (!lastSnap) return;
    strengthEl.value = lastSnap.strength;
    durationEl.value = lastSnap.duration;
    syncLabels();
    K.audio.resume();
    runDivination(lastSnap.seed, lastSnap.x, lastSnap.y, lastSnap.strength, lastSnap.duration);
  });
  document.getElementById('savepng').addEventListener('click', function () {
    const a = document.createElement('a');
    a.download = 'kiboku-' + (lastSnap ? lastSnap.seed : 'result') + '.png';
    a.href = cv.toDataURL('image/png');
    a.click();
  });
  muteEl.addEventListener('click', function () {
    K.audio.resume();
    K.audio.setMuted(!K.audio.isMuted());
    muteEl.textContent = K.audio.isMuted() ? '音: OFF' : '音: ON';
  });
  strengthEl.addEventListener('input', syncLabels);
  durationEl.addEventListener('input', syncLabels);

  // --- メインループ ---
  function frame() {
    ctx.drawImage(baseLayer, 0, 0, LW, LH);
    ctx.drawImage(crackLayer, 0, 0, LW, LH);
    if (state === S.HEATING) {
      heatT++;
      K.drawHeating(ctx, sim.origin, heatT / heatDur, heatT);
      if (Math.random() < 0.5) K.spawnSmoke(particles, sim.origin.x, sim.origin.y, Math.random);
      if (Math.random() < 0.25) K.spawnSparks(particles, sim.origin.x, sim.origin.y, Math.random, 2);
      crackleTimer--;
      if (crackleTimer <= 0) { K.audio.emberCrackle(); crackleTimer = 6 + Math.floor(Math.random() * 18); }
      if (heatT >= heatDur) { state = S.CRACKING; K.audio.stopHum(); }
    } else if (state === S.CRACKING) {
      K.drawHollow(ctx, sim.origin, 0.75);
      const done = advanceReveal();
      drawGrowingCracks(ctx);
      drawTips(ctx);
      if (Math.random() < 0.3) K.spawnSmoke(particles, sim.origin.x, sim.origin.y, Math.random);
      if (done) {
        holdT++;
        if (holdT > 30) { showResult(); state = S.RESULT; }
      }
    } else if (state === S.RESULT && sim) {
      K.drawHollow(ctx, sim.origin, 0.75);
      highlightT++;
      drawHighlight(ctx, interpCache.overall ? interpCache.overall.evidenceIndices : [], highlightT);
    }
    K.updateParticles(particles);
    K.drawParticles(ctx, particles);
    requestAnimationFrame(frame);
  }
  syncLabels();
  requestAnimationFrame(frame);
})(window.Kiboku);
```

- [ ] **Step 2: `index.html` を完成版に書き換え**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>亀卜シミュレーター</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #17140f;
    color: #e8e0cf;
    font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
    display: flex;
    justify-content: center;
  }
  main { width: min(96vw, 780px); padding: 16px 0 40px; }
  h1 { font-size: 20px; text-align: center; letter-spacing: .25em; margin: 12px 0 4px; }
  .sub { text-align: center; font-size: 12px; color: #9a8f78; margin: 0 0 12px; }
  #stage { position: relative; }
  canvas {
    display: block;
    width: 100%;
    background: #211c14;
    border-radius: 12px;
    cursor: crosshair;
  }
  #result {
    position: absolute;
    right: 12px;
    bottom: 12px;
    width: 270px;
    background: rgba(20, 16, 10, .9);
    border: 1px solid #5a4a30;
    border-radius: 10px;
    padding: 12px 16px 14px;
  }
  #pattern { font-size: 11.5px; color: #c9b896; line-height: 1.6; margin: 0 0 8px; }
  #tabs { display: flex; gap: 4px; margin-bottom: 6px; }
  #tabs .tab {
    flex: 1;
    padding: 4px 0;
    font-size: 11px;
    background: #2a2318;
    border: 1px solid #4a3d28;
    border-radius: 6px;
    color: #b0a188;
  }
  #tabs .tab.active { background: #4a3c26; color: #f0e6d0; border-color: #6b573a; }
  #rank { font-size: 42px; font-weight: 700; text-align: center; margin: 2px 0 6px; }
  #reasons { font-size: 12.5px; line-height: 1.7; margin: 8px 0; padding-left: 1.2em; }
  #seedline { font-size: 11px; color: #9a8f78; margin-top: 6px; }
  #result button { width: 100%; margin-top: 6px; }
  #panel {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    background: rgba(36, 32, 23, .6);
    padding: 12px 14px;
    border-radius: 10px;
    margin-top: 12px;
  }
  label { font-size: 13px; display: flex; align-items: center; gap: 8px; }
  input[type=range] { width: 140px; accent-color: #d78a3c; }
  .val { font-size: 12px; color: #9a8f78; width: 2.2em; text-align: right; }
  button {
    background: #3a2f1e;
    color: #f0e6d0;
    border: 1px solid #6b573a;
    border-radius: 8px;
    padding: 8px 16px;
    cursor: pointer;
    font-size: 13px;
  }
  button:hover { background: #4a3c26; }
  #hint { width: 100%; font-size: 12px; color: #9a8f78; margin: 2px 0 0; transition: color .2s; }
</style>
</head>
<body>
<main>
  <h1>亀卜シミュレーター</h1>
  <p class="sub">腹甲を灼き、卜兆（ひび）で吉凶を読む — 古代日本の占い</p>
  <div id="stage">
    <canvas id="cv" width="720" height="820"></canvas>
    <div id="result" hidden>
      <p id="pattern"></p>
      <div id="tabs"></div>
      <div id="rank"></div>
      <ul id="reasons"></ul>
      <div id="seedline"></div>
      <button id="savepng">画像を保存</button>
      <button id="again">同じ条件でもう一度</button>
      <button id="reset2">占い直す</button>
    </div>
  </div>
  <div id="panel">
    <label>強さ <input type="range" id="strength" min="0" max="100" value="60"><span class="val" id="strengthV">60</span></label>
    <label>時間 <input type="range" id="duration" min="0" max="100" value="60"><span class="val" id="durationV">60</span></label>
    <button id="reset">占い直す</button>
    <button id="mute">音: ON</button>
    <p id="hint">腹甲の内側をクリックすると、灼いたひび（卜兆）が現れます。</p>
  </div>
</main>
<script src="src/core.js"></script>
<script src="src/sim.js"></script>
<script src="src/fortune.js"></script>
<script src="src/plastron.js"></script>
<script src="src/effects.js"></script>
<script src="src/audio.js"></script>
<script src="src/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: 構文チェック**

Run: `node --check src/app.js`
Expected: エラーなし

- [ ] **Step 4: ヘッドレスハーネス再実行（分割後もロジックが壊れていないことを確認）**

Run: `node tools/headless-check.js`
Expected: 全て `PASS`、`0 failed`

---

### Task 5: 手動確認チェックリスト

**Files:**
- なし（動作確認のみ）

- [ ] **Step 1: ブラウザで `index.html` をダブルクリックして開き、以下を確認**

- 腹甲が表示され、クリックで灼き演出（グロー＋唸り音＋パチパチ音＋煙＋火花）が始まる
- ひびが成長し、成長中に「ピシッ」音が鳴り、完成したひびは焼き付けられて滑らかに表示される
- 結果パネルに型名・説明、総合/仕事/恋愛/健康タブ、ランク、理由、シードが表示される
- タブ切替で各カテゴリのランクと解釈が変わる
- 枝のひびが金色にフェード強調される
- 「画像を保存」で `kiboku-<seed>.png` がダウンロードされ、腹甲＋ひびが写っている
- 「同じ条件でもう一度」で同じひびが再現される
- 「音: ON/OFF」ボタンでミュートが切り替わる
- 「占い直す」で初期状態に戻る

---

## Self-Review 結果

- **Spec coverage**: ファイル分割(T1,T2,T4)・型判定(T1 fortune.js, T4 表示)・カテゴリ別解釈(T1, T4 タブ)・根拠ハイライト(T4)・音響(T3, T4 配線)・パーティクル(T2, T4 ループ)・焼き付け/2重ストローク(T4)・PNG保存(T4)・ヘッドレス拡張(T1) — 仕様の全項目をカバー
- **Placeholder scan**: 全ステップに完全なコードを記載。TBD/TODO なし
- **Type consistency**: `metrics`（sideBalance/upwardRatio 含む）、`interpretFortune` の戻り値 `{rank, score, reasons, evidenceIndices}`、`classifyPattern` の戻り値 `{name, description}` で Task 1/4 間統一。`spawn` の `side` パラメータは sim.js 内で完結
- **注意点**: 音響・パーティクル・ハイライト・PNG保存はブラウザ手動確認（Task 5）で担保
