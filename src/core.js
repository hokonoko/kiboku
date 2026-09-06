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

  K.mulberry32 = mulberry32;
  K.makeNoise1D = makeNoise1D;
  K.lerp = lerp;
  K.clamp = clamp;
  K.dist = dist;
})(window.Kiboku);
