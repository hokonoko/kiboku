'use strict';
/* ===== 卜兆シミュレータ（純粋ロジック） =====
   殷墟出土の卜兆に則し、灼点から伸びる縦の「兆幹」と、そこからほぼ直角に分岐する
   横の「兆枝」という「卜」字形の亀裂を生成する。
   兆幹と兆枝の夾角は殷代の吉凶判断と関係する（70〜120°のものが吉兆とされた確率が高い）。
   出典: 台大科教中心「商代晚期の『占』『卜』と吉凶判断」、漢字文化資料館「漢字の来た道」。 */
(function (K) {
  function normalizeDeg(a) {
    let d = a % 360;
    if (d < 0) d += 360;
    return d;
  }

  // 線分 p1p2 と q1q2 の交差判定
  function segHit(p1, p2, q1, q2) {
    const d = (p2.x - p1.x) * (q2.y - q1.y) - (p2.y - p1.y) * (q2.x - q1.x);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((q1.x - p1.x) * (q2.y - q1.y) - (q1.y - p1.y) * (q2.x - q1.x)) / d;
    const u = ((q1.x - p1.x) * (p2.y - p1.y) - (q1.y - p1.y) * (p2.x - p1.x)) / d;
    return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
  }

  // 枝どうしの交錯数（「克兆」＝相剋・交錯の判定に用いる）
  function countCrossings(polylines) {
    const brs = [];
    for (const p of polylines) {
      if (p.kind !== 'branch') continue;
      const pts = [];
      for (let i = 0; i < p.points.length; i += 2) pts.push(p.points[i]);
      const last = p.points[p.points.length - 1];
      if (pts[pts.length - 1] !== last) pts.push(last);
      brs.push(pts);
    }
    let n = 0;
    for (let i = 0; i < brs.length; i++) {
      for (let j = i + 1; j < brs.length; j++) {
        for (let a = 0; a + 1 < brs[i].length; a++) {
          for (let b = 0; b + 1 < brs[j].length; b++) {
            if (segHit(brs[i][a], brs[i][a + 1], brs[j][b], brs[j][b + 1])) { n++; a = brs[i].length; break; }
          }
        }
      }
    }
    return n;
  }

  // 兆幹と兆枝の夾角（度）の吉兆度。70〜120°を最良とする。
  function angleScoreOf(avgDeg) {
    if (avgDeg === null || avgDeg === undefined) return 0;
    if (avgDeg >= 70 && avgDeg <= 120) return 1;
    const gap = Math.min(Math.abs(avgDeg - 70), Math.abs(avgDeg - 120));
    return K.clamp(1 - gap / 30, 0, 1);
  }

  function simulateCracks(opts) {
    const seed = opts.seed, ox = opts.x, oy = opts.y;
    const s = K.clamp(opts.strength, 0, 100) / 100;
    const d = K.clamp(opts.duration, 0, 100) / 100;
    const isInside = opts.isInside;
    const rand = K.mulberry32(seed);

    const STEP = 1.6;
    const mainEnergy = 150 + d * 250;
    // 卜兆の乱れ：灼が長く丁寧ほど直進し、熱が強すぎるほど走査が乱れる。
    const chaos = K.lerp(0.95, 0.0, d) + s * 0.90;
    const wobbleAmp = 0.05 + chaos * 0.50;
    const maxBranches = 1 + Math.round(s * 8);
    const branchSpacing = K.lerp(60, 24, s);
    // 兆枝は短い（実際の卜兆の枝は主幹に比べかなり短い）
    const branchLen = 24 + s * 58;
    // 兆幹と兆枝の夾角（度）。基準は直角だが、灼が強いほどばらつく。
    const angleCenter = 90 + (rand() * 2 - 1) * (5 + s * 22);
    const angleJitter = 10 + s * 46;

    const polylines = [];
    const fronts = [];

    function spawn(x, y, baseAngle, energy, amp, kind, parentIdx, parentDist, side, theta) {
      const pl = {
        kind: kind, points: [{ x: x, y: y, d: 0 }],
        parentIdx: parentIdx, parentDist: parentDist,
        tilt: 0, side: side || 0, theta: theta || 0
      };
      const idx = polylines.push(pl) - 1;
      fronts.push({
        x: x, y: y, angle: baseAngle, base: baseAngle, energy: energy, amp: amp,
        noise: K.makeNoise1D(rand), nt: rand() * 100, dist: 0, alive: true,
        nextBranch: branchSpacing * (0.75 + rand() * 0.5), pl: pl, idx: idx
      });
      return pl;
    }

    // 兆幹：灼点から腹甲の長軸方向（上下）へ走る
    spawn(ox, oy, -Math.PI / 2, mainEnergy, wobbleAmp, 'main', -1, 0, 0, 0);
    spawn(ox, oy, Math.PI / 2, mainEnergy, wobbleAmp, 'main', -1, 0, 0, 0);

    let branchCount = 0, guard = 0;
    while (fronts.some(function (f) { return f.alive; }) && guard++ < 40000) {
      for (let fi = 0; fi < fronts.length; fi++) {
        const f = fronts[fi];
        if (!f.alive) continue;
        f.angle += (f.base - f.angle) * 0.10;
        f.angle += f.noise(f.nt) * f.amp * 0.30;
        f.nt += 0.09;
        const nx = f.x + Math.cos(f.angle) * STEP;
        const ny = f.y + Math.sin(f.angle) * STEP;
        if (!isInside(nx, ny)) { f.alive = false; continue; }
        f.x = nx; f.y = ny; f.dist += STEP; f.energy -= STEP;
        f.pl.points.push({ x: f.x, y: f.y, d: f.dist });
        if (f.energy <= 0) { f.alive = false; continue; }

        if (f.pl.kind === 'main' && f.dist >= f.nextBranch && branchCount < maxBranches) {
          f.nextBranch += branchSpacing * (0.75 + rand() * 0.5);
          if (rand() < 0.88) {
            branchCount++;
            const side = rand() < 0.5 ? -1 : 1;
            const theta = angleCenter + (rand() * 2 - 1) * angleJitter;
            const ba = f.angle + side * theta * Math.PI / 180;
            // 兆枝の傾き（水平を0、上向きを正）
            const tilt = -Math.sin(ba);
            const pl = spawn(f.x, f.y, ba, branchLen * (0.5 + 0.6 * rand()), 0.06,
              'branch', f.idx, f.dist, side, theta);
            pl.tilt = tilt;
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
    let angleSum = 0, angleN = 0, angleScoreSum = 0;
    for (const b of branches) {
      tiltSum += b.tilt;
      lenSum += b.points[b.points.length - 1].d;
      if (b.side < 0) leftCount++;
      else if (b.side > 0) rightCount++;
      if (b.tilt > 0) upCount++;
      if (b.theta > 0) {
        angleSum += b.theta;
        angleScoreSum += angleScoreOf(b.theta);
        angleN++;
      }
    }
    const avgBranchAngleDeg = angleN ? angleSum / angleN : null;
    return {
      mainLen: mainLen,
      straightness: mainLen > 0 ? K.clamp(chord / mainLen, 0, 1) : 0,
      branchCount: n,
      avgTiltDeg: n ? (tiltSum / n) * 180 / Math.PI : 0,
      avgBranchLen: n ? lenSum / n : 0,
      sideBalance: n ? Math.min(leftCount, rightCount) / (Math.max(leftCount, rightCount) || 1) : 0,
      upwardRatio: n ? upCount / n : 0,
      avgBranchAngleDeg: avgBranchAngleDeg,
      angleScore: angleN ? angleScoreSum / angleN : 0,
      crossings: countCrossings(polylines)
    };
  }

  K.simulateCracks = simulateCracks;
  K.computeMetrics = computeMetrics;
  K.angleScoreOf = angleScoreOf;
})(window.Kiboku);
