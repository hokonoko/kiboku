'use strict';
/* ===== 腹甲パス・ベースレイヤー描画 =====
   実際の亀の腹甲に則して、盾甲（scute）の縫合線と、
   占い前に内側に穿たれる「鑽（円・浅い）」「鑿（楕円・深い）」を表現する。
   出典: 漢字文化資料館「漢字の来た道 PartⅠ」（甲橋の切断・鑽鑿の穿ち）ほか。 */
(function (K) {
  const LW = 720, LH = 820;
  const PC = { x: 360, y: 408, rx: 238, ry: 318 };

  // 盾甲の境界（上＝前部 喉甲から下＝後部 尾甲まで）
  // 喉甲 / 胸甲 / 腹甲 / 股甲 / 尾甲 の5対＝横縫合は4本
  const SCUTE_BOUNDS = [-0.66, -0.30, 0.22, 0.62];

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

  // 楕円近似で横方向の有効幅を求める（縫合線の端を甲羅内に収めるため）
  function halfWidthAt(t) {
    const k = 1 - t * t;
    return PC.rx * (k > 0 ? Math.sqrt(k) : 0) * 0.97;
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

  function drawHollowFeature(c, h) {
    const r = Math.max(h.rx, h.ry);
    // くぼみの陰影（上辺に影、下辺に光）
    c.save();
    c.translate(h.x, h.y);
    const g = c.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, 'rgba(58,42,22,0.55)');
    g.addColorStop(0.5, 'rgba(120,96,58,0.18)');
    g.addColorStop(1, 'rgba(255,244,214,0.30)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, h.rx, h.ry, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(78,58,32,0.45)';
    c.lineWidth = 1.4;
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

    // --- 盾甲の縫合線 ---
    // 横縫合（喉甲|胸甲 / 胸甲|腹甲 / 腹甲|股甲 / 股甲|尾甲）
    c.strokeStyle = 'rgba(96,72,42,0.55)';
    c.lineWidth = 2.2;
    SCUTE_BOUNDS.forEach(function (t, i) {
      const sy = PC.y + t * PC.ry;
      const hw = halfWidthAt(t);
      c.beginPath();
      c.moveTo(PC.x - hw, sy + (i % 2 ? 7 : -7));
      const seg = 5;
      for (let k = 1; k <= seg; k++) {
        const u = k / seg;
        const px = PC.x - hw + 2 * hw * u;
        const py = sy + Math.sin(u * Math.PI * (2 + (i % 3))) * 9;
        c.lineTo(px, py);
      }
      c.stroke();
    });

    // 正中縫合（左右の盾甲の境）— ゆらぎのある不整な線
    c.beginPath();
    const steps = 46;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const py = PC.y - PC.ry + 2 * PC.ry * u;
      const wob = Math.sin(u * Math.PI * 6.5) * 6 + Math.sin(u * Math.PI * 17) * 2.5;
      const px = PC.x + wob;
      if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();

    // 盾甲ごとの陰影（盾甲がわずかに盛り上がる）
    const bands = [
      [-1.0, -0.66], [-0.66, -0.30], [-0.30, 0.22], [0.22, 0.62], [0.62, 1.0]
    ];
    for (const b of bands) {
      const y0 = PC.y + b[0] * PC.ry, y1 = PC.y + b[1] * PC.ry;
      const bg2 = c.createLinearGradient(PC.x - 60, y0, PC.x - 60, y1);
      bg2.addColorStop(0, 'rgba(255,247,224,0.10)');
      bg2.addColorStop(0.5, 'rgba(96,72,42,0.05)');
      bg2.addColorStop(1, 'rgba(255,247,224,0.07)');
      c.fillStyle = bg2;
      c.fillRect(PC.x - PC.rx, y0, PC.rx * 2, y1 - y0);
    }

    // --- 鑽・鑿 ---
    for (const h of HOLLOWS) drawHollowFeature(c, h);

    c.restore();

    c.strokeStyle = 'rgba(70,50,26,0.8)';
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
