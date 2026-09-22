'use strict';
/* ===== 腹甲パス・ベースレイヤー描画 =====
   実際の亀の腹甲に則して、6対の盾甲（scute）と縫合線、盾甲の成長輪（annuli）、
   角質の辺縁（limbus）、骨面の染みを描き、
   占い前に内側に穿たれる「鑽（円・浅い）」「鑿（楕円・深い）」を表現する。
   出典: 漢字文化資料館「漢字の来た道 PartⅠ」（甲橋の切断・鑽鑿の穿ち）ほか。 */
(function (K) {
  const LW = 720, LH = 820;
  const PC = { x: 360, y: 408, rx: 238, ry: 318 };

  // 盾甲の境界（上＝前部 喉甲から下＝後部 肛甲まで）
  // 喉甲 / 上腕甲 / 胸甲 / 腹甲 / 股甲 / 肛甲 の6対＝横縫合5本
  const SCUTE_BOUNDS = [-0.70, -0.42, -0.12, 0.24, 0.60];
  const BANDS = [-1].concat(SCUTE_BOUNDS, [1]);
  const OUT_MARGIN = 80; // 腹甲外まで伸ばす（クリップで切り落とす）

  function buildPlastronPath() {
    const x = PC.x, y = PC.y, rx = PC.rx, ry = PC.ry;
    const p = new Path2D();
    p.moveTo(x, y - ry);
    p.bezierCurveTo(x + rx * 0.62, y - ry, x + rx * 0.99, y - ry * 0.68, x + rx, y - ry * 0.34);
    p.bezierCurveTo(x + rx * 1.01, y - ry * 0.02, x + rx * 0.88, y + ry * 0.52, x + rx * 0.62, y + ry * 0.82);
    p.bezierCurveTo(x + rx * 0.44, y + ry * 1.02, x + rx * 0.16, y + ry, x + rx * 0.07, y + ry * 0.985);
    // 肛甲の間の後方切れこみ
    p.lineTo(x, y + ry * 0.92);
    p.lineTo(x - rx * 0.07, y + ry * 0.985);
    p.bezierCurveTo(x - rx * 0.16, y + ry, x - rx * 0.44, y + ry * 1.02, x - rx * 0.62, y + ry * 0.82);
    p.bezierCurveTo(x - rx * 0.88, y + ry * 0.52, x - rx * 1.01, y - ry * 0.02, x - rx, y - ry * 0.34);
    p.bezierCurveTo(x - rx * 0.99, y - ry * 0.68, x - rx * 0.62, y - ry, x, y - ry);
    p.closePath();
    return p;
  }

  // 楕円近似で横方向の有効幅を求める（縫合線の端を甲羅内に収めるため）
  function halfWidthAt(t) {
    const k = 1 - t * t;
    return PC.rx * (k > 0 ? Math.sqrt(k) : 0) * 0.97;
  }

  // --- 幾何: 縫合線と正中線 ---
  // i番目の横縫合の y（x は腹甲外でも定義され、クリップで切られる）
  function sutureY(i, x) {
    const t = SCUTE_BOUNDS[i];
    const sy = PC.y + t * PC.ry;
    const hw = Math.max(halfWidthAt(t), 1);
    const u = (x - (PC.x - hw)) / (2 * hw);
    return sy + Math.sin(u * Math.PI * (2 + (i % 3))) * 9;
  }

  // 正中縫合の x（ゆらぎのある不整な線）
  function medX(y) {
    const v = (y - (PC.y - PC.ry)) / (2 * PC.ry);
    return PC.x + Math.sin(v * Math.PI * 6.5) * 6 + Math.sin(v * Math.PI * 17) * 2.5;
  }

  // band i（0..5）の片側の盾甲領域。隣接する盾甲は同じ曲線を共有する。
  function scutePath(side, i) {
    const y0 = PC.y + BANDS[i] * PC.ry;
    const y1 = PC.y + BANDS[i + 1] * PC.ry;
    const OUT = PC.x + side * (PC.rx + OUT_MARGIN);
    const last = i === BANDS.length - 2;
    function topY(x) { return i === 0 ? y0 : sutureY(i - 1, x); }
    function botY(x) { return last ? y1 : sutureY(i, x); }

    // 上辺と下辺が正中線と交わる点（数回の反復で収束させる）
    let x0 = medX(y0), yt = topY(x0);
    for (let k = 0; k < 3; k++) { x0 = medX(yt); yt = topY(x0); }
    let x1 = medX(y1), yb = botY(x1);
    for (let k = 0; k < 3; k++) { x1 = medX(yb); yb = botY(x1); }

    const N = 18;
    const p = new Path2D();
    p.moveTo(x0, yt);
    for (let k = 1; k <= N; k++) { const x = x0 + (OUT - x0) * k / N; p.lineTo(x, topY(x)); }
    p.lineTo(OUT, botY(OUT));
    for (let k = N - 1; k >= 0; k--) { const x = x1 + (OUT - x1) * k / N; p.lineTo(x, botY(x)); }
    const M = 12;
    for (let k = 1; k <= M; k++) { const y = yb + (yt - yb) * k / M; p.lineTo(medX(y), y); }
    p.closePath();
    return p;
  }

  function scuteCenter(side, i) {
    const t = (BANDS[i] + BANDS[i + 1]) / 2;
    const cy = PC.y + t * PC.ry;
    const inner = medX(cy);
    const outer = PC.x + side * halfWidthAt(t);
    return {
      cx: (inner + outer) / 2,
      cy: cy,
      hw: Math.abs(outer - inner) / 2,
      hh: Math.abs(BANDS[i + 1] - BANDS[i]) * PC.ry / 2
    };
  }

  // --- 鑽・鑿（事前に穿たれた凹み） ---
  // 内側列＝鑿（アーモンド形・深い溝）、外側列＝鑽（円形・浅い孔）
  function buildHollows() {
    const list = [];
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const t = -0.70 + r * (1.40 / (rows - 1));
      const y = PC.y + t * PC.ry;
      const odd = r % 2 === 1;
      for (let s = 0; s < 2; s++) {
        const dir = s === 0 ? -1 : 1;
        const inner = 34 + (odd ? 14 : 0);
        list.push({ x: PC.x + dir * inner, y: y, kind: 'chisel', rx: 11, ry: 21, row: r, side: dir });
        list.push({ x: PC.x + dir * (inner + 66), y: y, kind: 'drill', rx: 13, ry: 13, row: r, side: dir });
      }
    }
    return list;
  }

  const HOLLOWS = buildHollows();

  // クリック位置から最も近い鑽・鑿を返す（maxDist 未満のみ）
  function nearestHollow(x, y, maxDist) {
    let best = null, bd = Infinity;
    const lim = (maxDist === undefined ? 80 : maxDist);
    for (const h of HOLLOWS) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = h; }
    }
    return (best && bd <= lim) ? best : null;
  }

  // 凹み: 左上から照らした場合の陰影（左上の内壁＝影、右下の内壁＝光）
  function drawHollowFeature(c, h) {
    c.save();
    c.translate(h.x, h.y);

    const g = c.createLinearGradient(-h.rx, -h.ry, h.rx, h.ry);
    g.addColorStop(0, 'rgba(48,33,16,0.72)');
    g.addColorStop(0.5, 'rgba(96,74,42,0.34)');
    g.addColorStop(1, 'rgba(255,240,204,0.30)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, h.rx, h.ry, 0, 0, Math.PI * 2);
    c.fill();

    // 底の暗部（深いほど中心寄りに暗い）
    const depth = c.createRadialGradient(0, -h.ry * 0.12, 1, 0, -h.ry * 0.12, Math.max(h.rx, h.ry) * 0.85);
    depth.addColorStop(0, 'rgba(36,23,10,0.55)');
    depth.addColorStop(1, 'rgba(36,23,10,0)');
    c.fillStyle = depth;
    c.beginPath();
    c.ellipse(0, -h.ry * 0.12, h.rx * 0.8, h.ry * 0.8, 0, 0, Math.PI * 2);
    c.fill();

    // 穿ち口の縁
    c.strokeStyle = 'rgba(62,44,22,0.55)';
    c.lineWidth = 1.3;
    c.beginPath();
    c.ellipse(0, 0, h.rx, h.ry, 0, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = 'rgba(255,246,214,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(0, 0.8, h.rx + 1, h.ry + 1, 0, Math.PI * 0.1, Math.PI * 0.9);
    c.stroke();
    c.restore();
  }

  // 選択中・加熱中の鑽鑿を強調する
  function drawActiveHollow(c, h, alpha) {
    if (!h) return;
    c.save();
    c.translate(h.x, h.y);
    c.strokeStyle = 'rgba(255,178,86,' + alpha + ')';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(0, 0, h.rx + 5, h.ry + 5, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  // --- 盾甲の内側: 盛り上がりの陰影と成長輪 ---
  function drawScute(c, path, ctr, rand) {
    c.save();
    c.clip(path);

    // 盾甲ごとの地色の差（同じ甲でも盾甲ごとに色が多少違う）
    c.fillStyle = 'rgba('
      + (rand() < 0.5 ? '150,120,74' : '186,158,110') + ','
      + (0.03 + rand() * 0.05).toFixed(3) + ')';
    c.fillRect(0, 0, LW, LH);

    const g = c.createRadialGradient(
      ctr.cx - ctr.hw * 0.35, ctr.cy - ctr.hh * 0.35, ctr.hh * 0.12,
      ctr.cx, ctr.cy, Math.max(ctr.hw, ctr.hh) * 1.25
    );
    g.addColorStop(0, 'rgba(255,247,226,0.20)');
    g.addColorStop(0.45, 'rgba(236,220,184,0.04)');
    g.addColorStop(1, 'rgba(72,52,26,0.30)');
    c.fillStyle = g;
    c.fillRect(0, 0, LW, LH);

    // 成長輪（annuli）: 中心（後部）から外へ何年も成長した跡
    const rings = 7 + Math.floor(rand() * 6);
    for (let k = 1; k <= rings; k++) {
      const s = k / (rings + 1);
      const jx = ctr.cx + (rand() * 2 - 1) * ctr.hw * 0.07;
      const jy = ctr.cy + (rand() * 2 - 1) * ctr.hh * 0.07;
      const rx = ctr.hw * s * 0.94, ry = ctr.hh * s * 0.94;
      // 摩耗で欠けた輪もある（完全な円にならない）
      const partial = rand() < 0.45;
      const a0 = partial ? rand() * Math.PI * 2 : 0;
      const a1 = partial ? a0 + Math.PI * (1.1 + rand() * 0.7) : Math.PI * 2;
      c.beginPath();
      c.ellipse(jx, jy + 1.4, rx, ry, 0, a0, a1);
      c.strokeStyle = 'rgba(255,246,220,0.08)';
      c.lineWidth = 1;
      c.stroke();
      c.beginPath();
      c.ellipse(jx, jy, rx, ry, 0, a0, a1);
      c.strokeStyle = 'rgba(96,70,38,' + (0.06 + rand() * 0.08).toFixed(3) + ')';
      c.lineWidth = 1.2;
      c.stroke();
    }

    // 骨面の染み（辺縁と縫合線の近くに溜まりやすい）
    for (let k = 0; k < 5; k++) {
      const bx = ctr.cx + (rand() * 2 - 1) * ctr.hw;
      const by = ctr.cy + (rand() * 2 - 1) * ctr.hh;
      const br = 12 + rand() * 34;
      const bg = c.createRadialGradient(bx, by, 2, bx, by, br);
      bg.addColorStop(0, 'rgba(112,82,44,' + (0.05 + rand() * 0.07).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(112,82,44,0)');
      c.fillStyle = bg;
      c.beginPath();
      c.arc(bx, by, br, 0, 7);
      c.fill();
    }

    // 盾甲の際がわずかに沈む
    c.strokeStyle = 'rgba(64,45,22,0.32)';
    c.lineWidth = 9;
    c.stroke(path);
    c.restore();
  }

  // --- 縫合線（窪み＋その下の光） ---
  const H_PASSES = [
    { dy: 4, style: 'rgba(70,50,26,0.07)', w: 16 },       // 縫合の周囲の染み
    { dy: 2.4, style: 'rgba(255,247,222,0.32)', w: 1.5 }, // 窪み下辺の光
    { dy: 0, style: 'rgba(62,43,21,0.85)', w: 2.2 }       // 縫合そのもの
  ];
  const V_PASSES = [
    { dx: 3, style: 'rgba(70,50,26,0.07)', w: 16 },
    { dx: 2.6, style: 'rgba(255,247,222,0.32)', w: 1.5 },
    { dx: 0, style: 'rgba(62,43,21,0.85)', w: 2.2 }
  ];

  function drawSeams(c) {
    // 横縫合: 光は下側に、窪みはその上に
    for (let i = 0; i < SCUTE_BOUNDS.length; i++) {
      const hw = halfWidthAt(SCUTE_BOUNDS[i]);
      const a = PC.x - hw - 30, b = PC.x + hw + 30, n = 56;
      H_PASSES.forEach(function (p) {
        c.beginPath();
        for (let k = 0; k <= n; k++) {
          const x = a + (b - a) * k / n;
          const y = sutureY(i, x) + p.dy;
          if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.strokeStyle = p.style;
        c.lineWidth = p.w;
        c.stroke();
      });
    }
    // 正中縫合
    const ya = PC.y - PC.ry - 30, yb = PC.y + PC.ry + 30, n2 = 72;
    V_PASSES.forEach(function (p) {
      c.beginPath();
      for (let k = 0; k <= n2; k++) {
        const y = ya + (yb - ya) * k / n2;
        const x = medX(y) + p.dx;
        if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = p.style;
      c.lineWidth = p.w;
      c.stroke();
    });
  }

  function renderBaseLayer(plastron, dpr) {
    const off = document.createElement('canvas');
    off.width = LW * dpr;
    off.height = LH * dpr;
    const c = off.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rand = K.mulberry32(20260725);

    // 背景（卓上の影）
    const bg = c.createLinearGradient(0, 0, 0, LH);
    bg.addColorStop(0, '#241f16');
    bg.addColorStop(1, '#191510');
    c.fillStyle = bg;
    c.fillRect(0, 0, LW, LH);

    // 甲羅が卓上に載っている影
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = 24;
    c.shadowOffsetY = 12;
    c.fillStyle = 'rgba(6,5,4,1)';
    c.fill(plastron);
    c.restore();

    c.save();
    c.clip(plastron);

    // 角質・骨面の地色（左上からの斜光）
    const g = c.createLinearGradient(PC.x - PC.rx, PC.y - PC.ry, PC.x + PC.rx, PC.y + PC.ry);
    g.addColorStop(0, '#e9dcba');
    g.addColorStop(0.4, '#dcc79d');
    g.addColorStop(0.75, '#c2a879');
    g.addColorStop(1, '#a4885c');
    c.fillStyle = g;
    c.fillRect(0, 0, LW, LH);

    // 骨面の粒子
    for (let i = 0; i < 5200; i++) {
      const sx = rand() * LW, sy = rand() * LH;
      c.fillStyle = rand() < 0.6 ? 'rgba(84,60,32,0.06)' : 'rgba(255,246,220,0.05)';
      c.beginPath();
      c.arc(sx, sy, 0.5 + rand() * 1.8, 0, 7);
      c.fill();
    }

    // 全体の湾曲（周辺減光）
    c.strokeStyle = 'rgba(58,40,18,0.16)';
    c.lineWidth = 34;
    c.stroke(plastron);

    // --- 盾甲ごとに盛り上がりと成長輪を描く ---
    for (let i = 0; i < BANDS.length - 1; i++) {
      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1;
        drawScute(c, scutePath(side, i), scuteCenter(side, i), rand);
      }
    }

    // --- 縫合線 ---
    drawSeams(c);

    // --- 鑽・鑿 ---
    for (const h of HOLLOWS) drawHollowFeature(c, h);

    c.restore();

    // 角質の辺縁（外縁が太く見える）
    c.save();
    c.clip(plastron);
    c.strokeStyle = 'rgba(50,34,16,0.55)';
    c.lineWidth = 18;
    c.stroke(plastron);
    c.strokeStyle = 'rgba(146,116,70,0.45)';
    c.lineWidth = 7;
    c.stroke(plastron);
    c.restore();

    c.strokeStyle = 'rgba(44,30,15,0.9)';
    c.lineWidth = 3;
    c.stroke(plastron);
    return off;
  }

  K.LW = LW;
  K.LH = LH;
  K.PC = PC;
  K.hollows = HOLLOWS;
  K.buildPlastronPath = buildPlastronPath;
  K.nearestHollow = nearestHollow;
  K.drawActiveHollow = drawActiveHollow;
  K.renderBaseLayer = renderBaseLayer;
})(window.Kiboku);
