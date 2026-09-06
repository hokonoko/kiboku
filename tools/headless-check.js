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
