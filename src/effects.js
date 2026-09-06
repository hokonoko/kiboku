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
