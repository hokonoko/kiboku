'use strict';
/* ===== Web Audio プロシージャル音響 ===== */
(function (K) {
  let actx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (actx || typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = 0.6;
    master.connect(actx.destination);
    const len = actx.sampleRate;
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  function resume() {
    ensure();
    if (actx && actx.state === 'suspended') actx.resume();
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.6;
  }

  function isMuted() { return muted; }

  // 短いノイズバースト（炭のパチパチ・ひび割れ用）
  function burst(freq, q, dur, gain) {
    if (!actx || muted) return;
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = actx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = actx.createGain();
    const t = actx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  // トーン（結果音用）
  function tone(freq, dur, gain, type) {
    if (!actx || muted) return;
    const o = actx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = actx.createGain();
    const t = actx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + dur);
  }

  // 灼き中のループ音（低音の唸り）
  let humNodes = null;
  function startHum() {
    if (!actx || muted || humNodes) return;
    const o = actx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = actx.createGain();
    g.gain.value = 0.05;
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start();
    humNodes = { o: o, g: g };
  }

  function stopHum() {
    if (!humNodes) return;
    const t = actx.currentTime;
    humNodes.g.gain.setTargetAtTime(0, t, 0.1);
    humNodes.o.stop(t + 0.4);
    humNodes = null;
  }

  function emberCrackle() { burst(1800 + Math.random() * 2200, 6, 0.06, 0.12); }
  function crackSnap(isMain) { burst(isMain ? 900 : 1600, 8, 0.05, isMain ? 0.2 : 0.14); }

  function resultChime(rank) {
    if (rank === '大吉') { tone(523, 0.9, 0.18); setTimeout(function () { tone(784, 1.1, 0.15); }, 180); }
    else if (rank === '吉') { tone(440, 0.8, 0.15); setTimeout(function () { tone(659, 0.9, 0.12); }, 160); }
    else if (rank === '中吉') { tone(392, 0.8, 0.13); }
    else if (rank === '小吉') { tone(330, 0.8, 0.12); }
    else { tone(196, 1.4, 0.16, 'triangle'); }
  }

  K.audio = {
    resume: resume,
    setMuted: setMuted,
    isMuted: isMuted,
    startHum: startHum,
    stopHum: stopHum,
    emberCrackle: emberCrackle,
    crackSnap: crackSnap,
    resultChime: resultChime
  };
})(window.Kiboku);
