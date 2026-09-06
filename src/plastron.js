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
