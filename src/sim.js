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
