// チューニング用スイープ（開発時のみ手動実行）
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ['core.js', 'classics.js', 'sim.js', 'fortune.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), sandbox, { filename: f });
}
const K = sandbox.window.Kiboku;
const isInside = (x, y) => ((x - 260) / 240) ** 2 + ((y - 320) / 300) ** 2 <= 1;

function sweep(label, strength, duration, n) {
  const ranks = {}, omens = {}, angles = [];
  let stSum = 0;
  for (let i = 1; i <= n; i++) {
    const m = K.simulateCracks({ seed: i * 1013 + 7, x: 260, y: 320, strength, duration, isInside }).metrics;
    const j = K.judgeFortune(m);
    ranks[j.rank] = (ranks[j.rank] || 0) + 1;
    const o = K.classifyPattern(m).name;
    omens[o] = (omens[o] || 0) + 1;
    if (m.avgBranchAngleDeg !== null) angles.push(Math.round(m.avgBranchAngleDeg));
    stSum += m.straightness;
  }
  console.log(label);
  console.log('  ranks :', JSON.stringify(ranks));
  console.log('  omens :', JSON.stringify(omens));
  console.log('  straightness avg:', (stSum / n).toFixed(3),
    ' angle range:', Math.min(...angles) + '..' + Math.max(...angles));
}

const N = 120;
sweep('--- s=60 d=60 (既定値) ---', 60, 60, N);
sweep('--- s=0 d=0 ---', 0, 0, N);
sweep('--- s=100 d=100 ---', 100, 100, N);
sweep('--- s=100 d=0 ---', 100, 0, N);
sweep('--- s=0 d=100 ---', 0, 100, N);
