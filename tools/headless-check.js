// 亀卜シミュレーター ヘッドレス検証ハーネス
// src/core.js, src/classics.js, src/sim.js, src/fortune.js を順に vm 評価してロジックを検証する。
// 使い方: node tools/headless-check.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ['core.js', 'classics.js', 'sim.js', 'fortune.js']) {
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

// 4. 強さと兆枝本数の相関（5シード平均）
function avgBranches(strength) {
  let sum = 0;
  for (let i = 0; i < 5; i++) sum += ex.simulateCracks({ seed: 100 + i, x: 260, y: 320, strength, duration: 60, isInside }).metrics.branchCount;
  return sum / 5;
}
check('強さ100は強さ0より兆枝が多い', avgBranches(100) > avgBranches(0));

// 5. 時間と兆幹長の相関（5シード平均）
function avgMainLen(duration) {
  let sum = 0;
  for (let i = 0; i < 5; i++) sum += ex.simulateCracks({ seed: 200 + i, x: 260, y: 320, strength: 60, duration, isInside }).metrics.mainLen;
  return sum / 5;
}
check('時間100は時間0より兆幹が長い', avgMainLen(100) > avgMainLen(0));

// 6. メトリクス範囲
const mm = a.metrics;
check('straightness が (0,1]', mm.straightness > 0 && mm.straightness <= 1);
check('avgTiltDeg が ±90 以内', Math.abs(mm.avgTiltDeg) <= 90);
check('sideBalance が [0,1]', mm.sideBalance >= 0 && mm.sideBalance <= 1);
check('upwardRatio が [0,1]', mm.upwardRatio >= 0 && mm.upwardRatio <= 1);
check('angleScore が [0,1]', mm.angleScore >= 0 && mm.angleScore <= 1);
check('crossings が非負整数', Number.isInteger(mm.crossings) && mm.crossings >= 0);
check('avgBranchAngleDeg は null または [0,180]',
  mm.avgBranchAngleDeg === null ||
  (mm.avgBranchAngleDeg >= 0 && mm.avgBranchAngleDeg <= 180));

// 7. 兆幹と兆枝の夾角がおおむね直角寄り（殷代の吉兆帯 70〜120°）
const angles = [];
for (let i = 1; i <= 40; i++) {
  const m = ex.simulateCracks({ seed: 900 + i, x: 260, y: 320, strength: 60, duration: 60, isInside }).metrics;
  if (m.avgBranchAngleDeg !== null) angles.push(m.avgBranchAngleDeg);
}
const inBand = angles.filter((v) => v >= 70 && v <= 120).length;
console.log('  夾角サンプル ' + angles.length + '件中 ' + inBand + '件が70〜120°');
check('夾角の過半が70〜120°に入る', angles.length > 0 && inBand / angles.length > 0.5);

// 8. 吉凶判定の各ランク到達と理由
const rankHigh = ex.judgeFortune({
  straightness: 0.97, branchCount: 8, avgBranchLen: 80, avgTiltDeg: 20,
  crossings: 0, angleScore: 1, avgBranchAngleDeg: 92, mainLen: 380
}).rank;
const rankLow = ex.judgeFortune({
  straightness: 0.72, branchCount: 0, avgBranchLen: 0, avgTiltDeg: -20,
  crossings: 2, angleScore: 0, avgBranchAngleDeg: 30, mainLen: 180
}).rank;
console.log('  rankHigh=' + rankHigh + ' rankLow=' + rankLow);
check('大吉に到達できる', rankHigh === '大吉');
check('不吉に到達できる', rankLow === '不吉');
check('判定語は5段階のいずれか',
  ['大吉', '吉', '安', '並', '不吉'].indexOf(rankHigh) >= 0 &&
  ['大吉', '吉', '安', '並', '不吉'].indexOf(rankLow) >= 0);
check('理由が返る', ex.judgeFortune(mm).reasons.length > 0);

// 9. 洪範の五兆への分類
const omenCases = [
  { name: '蒙兆', m: { straightness: 0.70, branchCount: 8, avgBranchLen: 60, mainLen: 350, sideBalance: 0.8, crossings: 0 } },
  { name: '雨兆', m: { straightness: 0.90, branchCount: 8, avgBranchLen: 60, mainLen: 350, sideBalance: 0.8, crossings: 0 } },
  { name: '克兆', m: { straightness: 0.90, branchCount: 5, avgBranchLen: 60, mainLen: 350, sideBalance: 0.30, crossings: 0 } },
  { name: '驛兆', m: { straightness: 0.90, branchCount: 0, avgBranchLen: 0, mainLen: 350, sideBalance: 0, crossings: 0 } },
  { name: '霽兆', m: { straightness: 0.90, branchCount: 4, avgBranchLen: 60, mainLen: 350, sideBalance: 0.70, crossings: 0 } }
];
for (const cse of omenCases) {
  check(cse.name + ' に分類できる', ex.classifyPattern(cse.m).name === cse.name);
}
check('五兆の説明文が返る', ex.classifyPattern(mm).gloss.length > 0);
check('五兆に reading が付く', typeof ex.classifyPattern(mm).reading === 'string');

// 10. 実シードからの五兆分布（情報表示）
const dist = {};
for (let i = 1; i <= 60; i++) {
  const st = (i * 17) % 101, du = (i * 29) % 101;
  const m = ex.simulateCracks({ seed: i * 7, x: 260, y: 320, strength: st, duration: du, isInside }).metrics;
  const n = ex.classifyPattern(m).name;
  dist[n] = (dist[n] || 0) + 1;
}
console.log('  五兆の分布(60件): ' + JSON.stringify(dist));
check('五兆が複数出現する', Object.keys(dist).length >= 3);

// 11. カテゴリ別解釈
const ov = ex.interpretFortune(mm, 'overall');
const wk = ex.interpretFortune(mm, 'work');
const lv = ex.interpretFortune(mm, 'love');
const hl = ex.interpretFortune(mm, 'health');
check('総合のランクが返る', !!ov.rank);
check('仕事のランクと理由が返る', !!wk.rank && wk.reasons.length > 0);
check('恋愛のランクと理由が返る', !!lv.rank && lv.reasons.length > 0);
check('健康のランクと理由が返る', !!hl.rank && hl.reasons.length > 0);
check('evidenceIndices が配列で返る', Array.isArray(ov.evidenceIndices) && Array.isArray(wk.evidenceIndices));

// 12. 文献データ（classics.js）
const CL = ex.classics;
check('六十甲子が60個', CL && CL.GANSHI && CL.GANSHI.length === 60 && CL.GANSHI[0] === '甲子');
check('癸日が6個', CL && CL.GANSHI.filter((g) => g[0] === '癸').length === 6);
check('rankOf: 80以上は大吉', CL.rankOf(80) === '大吉' && CL.rankOf(79) === '吉');
check('rankOf: 25未満は不吉', CL.rankOf(24) === '不吉' && CL.rankOf(25) === '並');

const o1 = CL.buildOracleText({ seed: 1, category: 'overall', rank: '吉' });
check('卜辞が叙辞から始まる', /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]に卜し、.+が貞す：/.test(o1.lines[0]));
check('卜辞に命辞が含まれる', o1.lines[0].indexOf('禍はなきや？') >= 0);
check('卜辞に占辞(王が占って曰く)がある', o1.lines[1] === '王が占って曰く、吉。');
check('卜辞に驗辞がある', o1.lines[2] === 'まことに禍なし。');
check('総合は癸日の卜になる', o1.day[0] === '癸');
const o2 = CL.buildOracleText({ seed: 5, category: 'health', rank: '不吉' });
check('不吉の占辞・驗辞', o2.lines[1] === '王が占って曰く、不吉。' && o2.lines[2].indexOf('禍あり') >= 0);
check('同一シードで同一卜辞',
  CL.buildOracleText({ seed: 7, category: 'work', rank: '吉' }).text ===
  CL.buildOracleText({ seed: 7, category: 'work', rank: '吉' }).text);
check('出典リストが定義されている', Array.isArray(CL.SOURCES) && CL.SOURCES.length >= 8);

// 参考: メトリクス実測値の表示（チューニング確認用）
console.log('\n--- metrics samples (seed 1-3, strength=60, duration=60) ---');
for (let i = 1; i <= 3; i++) {
  const m = ex.simulateCracks({ seed: i, x: 260, y: 320, strength: 60, duration: 60, isInside }).metrics;
  console.log(m, '=> ' + ex.classifyPattern(m).name + ' / ' + ex.judgeFortune(m).rank);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
