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

  // --- 共有URL用クエリ（純粋関数: ビルドとパース） ---
  // snap: { seed, x, y, strength, duration }, wish: 文字列
  function buildShareQuery(snap, wish) {
    const p = [];
    p.push('seed=' + (snap.seed >>> 0));
    p.push('x=' + Math.round(snap.x * 10) / 10);
    p.push('y=' + Math.round(snap.y * 10) / 10);
    p.push('s=' + clamp(Math.round(snap.strength), 0, 100));
    p.push('d=' + clamp(Math.round(snap.duration), 0, 100));
    const q = (wish || '').trim().slice(0, 60);
    if (q) p.push('q=' + encodeURIComponent(q));
    return '?' + p.join('&');
  }

  // qs: "?seed=..." または "seed=..."。不正なら null。
  function parseShareQuery(qs) {
    if (!qs) return null;
    const s = String(qs).replace(/^[?#]/, '');
    if (!s) return null;
    const m = {};
    const parts = s.split('&');
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const k = part.slice(0, eq);
      const v = part.slice(eq + 1);
      if (!(k in m)) m[k] = v;
    }
    if (m.seed === undefined || m.x === undefined || m.y === undefined) return null;
    const seed = Number(m.seed);
    const x = Number(m.x);
    const y = Number(m.y);
    if (!isFinite(seed) || seed < 0 || seed > 4294967295) return null;
    if (!isFinite(x) || !isFinite(y)) return null;
    let wish = '';
    if (m.q !== undefined) {
      try { wish = decodeURIComponent(m.q).slice(0, 60); }
      catch (e) { wish = ''; }
    }
    return {
      seed: seed >>> 0,
      x: x,
      y: y,
      strength: m.s === undefined ? 60 : clamp(Math.round(Number(m.s)), 0, 100),
      duration: m.d === undefined ? 60 : clamp(Math.round(Number(m.d)), 0, 100),
      wish: wish
    };
  }

  K.mulberry32 = mulberry32;
  K.makeNoise1D = makeNoise1D;
  K.lerp = lerp;
  K.clamp = clamp;
  K.dist = dist;
  K.buildShareQuery = buildShareQuery;
  K.parseShareQuery = parseShareQuery;
})(window.Kiboku);
