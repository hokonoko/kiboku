'use strict';
/* ===== UI: 状態機械・イベント配線・メインループ ===== */
(function (K) {
  const LW = K.LW, LH = K.LH, PC = K.PC;
  const RANK_COLORS = { '大吉': '#ffd75e', '吉': '#ff9d5c', '安': '#cfe0a8', '並': '#e8e0cf', '不吉': '#8fa0b3' };
  const S = { IDLE: 'idle', HEATING: 'heating', CRACKING: 'cracking', RESULT: 'result' };
  const CATEGORIES = [
    { key: 'overall', label: '総合' },
    { key: 'work', label: '仕事' },
    { key: 'love', label: '恋愛' },
    { key: 'health', label: '健康' }
  ];

  // --- DOM ---
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = LW * DPR;
  cv.height = LH * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const resultEl = document.getElementById('result');
  const rankEl = document.getElementById('rank');
  const patternEl = document.getElementById('pattern');
  const oracleEl = document.getElementById('oracle');
  const tabsEl = document.getElementById('tabs');
  const reasonsEl = document.getElementById('reasons');
  const seedlineEl = document.getElementById('seedline');
  const strengthEl = document.getElementById('strength');
  const durationEl = document.getElementById('duration');
  const strengthVEl = document.getElementById('strengthV');
  const durationVEl = document.getElementById('durationV');
  const hintEl = document.getElementById('hint');
  const muteEl = document.getElementById('mute');
  const wishEl = document.getElementById('wish');
  const wishlineEl = document.getElementById('wishline');
  const copyLinkEl = document.getElementById('copyLink');
  const shareXEl = document.getElementById('shareX');
  const copyDoneEl = document.getElementById('copyDone');
  const historySectionEl = document.getElementById('history');
  const historyListEl = document.getElementById('historyList');
  const historyEmptyEl = document.getElementById('historyEmpty');
  const HISTORY_KEY = 'kiboku-history-v1';
  const HISTORY_MAX = 10;

  // --- 腹甲 ---
  const PLASTRON = K.buildPlastronPath();
  const hitCtx = document.createElement('canvas').getContext('2d');
  function isInsidePlastron(x, y) { return hitCtx.isPointInPath(PLASTRON, x, y); }
  const baseLayer = K.renderBaseLayer(PLASTRON, DPR);

  // --- ひび焼き付けレイヤー ---
  const crackLayer = document.createElement('canvas');
  crackLayer.width = LW * DPR;
  crackLayer.height = LH * DPR;
  const crackCtx = crackLayer.getContext('2d');
  crackCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // --- 状態 ---
  let state = S.IDLE;
  let sim = null;
  let lastSnap = null;
  let heatT = 0, heatDur = 60, holdT = 0;
  let reveal = [];
  let baked = [];
  let particles = K.createParticles();
  let currentCategory = 'overall';
  let interpCache = {};
  let highlightT = 0;
  let crackleTimer = 0;
  let currentPattern = null;
  let activeHollow = null;
  let scorched = false;
  let hoverPos = null;
  let frameT = 0;

  // --- ひび描画 ---
  function strokePolyline(c, pts, rd) {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let j = 1; j < pts.length; j++) {
      if (pts[j].d <= rd) {
        c.lineTo(pts[j].x, pts[j].y);
      } else {
        const p0 = pts[j - 1], p1 = pts[j];
        const tt = (rd - p0.d) / (p1.d - p0.d);
        c.lineTo(p0.x + (p1.x - p0.x) * tt, p0.y + (p1.y - p0.y) * tt);
        break;
      }
    }
    c.stroke();
  }

  function drawGrowingCracks(c) {
    c.save();
    c.clip(PLASTRON);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let i = 0; i < sim.polylines.length; i++) {
      if (baked[i]) continue;
      const pl = sim.polylines[i];
      const rd = reveal[i];
      if (rd <= 0) continue;
      c.strokeStyle = '#2c1d10';
      c.lineWidth = pl.kind === 'main' ? 2.8 : 1.8;
      strokePolyline(c, pl.points, rd);
    }
    c.restore();
  }

  function bakePolyline(i) {
    const pl = sim.polylines[i];
    const total = pl.points[pl.points.length - 1].d;
    crackCtx.save();
    crackCtx.clip(PLASTRON);
    crackCtx.lineCap = 'round';
    crackCtx.lineJoin = 'round';
    // 縁（やや明るい太線）
    crackCtx.strokeStyle = 'rgba(120,90,55,0.55)';
    crackCtx.lineWidth = (pl.kind === 'main' ? 2.8 : 1.8) + 1.6;
    strokePolyline(crackCtx, pl.points, total);
    // 芯（暗い細線）
    crackCtx.strokeStyle = '#2c1d10';
    crackCtx.lineWidth = pl.kind === 'main' ? 2.8 : 1.8;
    strokePolyline(crackCtx, pl.points, total);
    crackCtx.restore();
    baked[i] = true;
  }

  function tipPos(pl, rd) {
    const pts = pl.points;
    const total = pts[pts.length - 1].d;
    if (rd <= 0 || rd >= total) return null;
    for (let j = 1; j < pts.length; j++) {
      if (pts[j].d > rd) {
        const p0 = pts[j - 1], p1 = pts[j];
        const t = (rd - p0.d) / (p1.d - p0.d);
        return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
      }
    }
    return null;
  }

  function drawTips(c) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < sim.polylines.length; i++) {
      if (baked[i]) continue;
      const tp = tipPos(sim.polylines[i], reveal[i]);
      if (!tp) continue;
      const g = c.createRadialGradient(tp.x, tp.y, 0.5, tp.x, tp.y, 7);
      g.addColorStop(0, 'rgba(255,176,102,0.8)');
      g.addColorStop(1, 'rgba(255,120,50,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(tp.x, tp.y, 7, 0, 7);
      c.fill();
    }
    c.restore();
  }

  function drawHighlight(c, indices, t) {
    if (!indices || indices.length === 0) return;
    const alpha = 0.35 + 0.3 * Math.sin(t * 0.08);
    c.save();
    c.clip(PLASTRON);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(255,215,94,' + alpha + ')';
    for (const i of indices) {
      const pl = sim.polylines[i];
      if (!pl) continue;
      c.lineWidth = (pl.kind === 'main' ? 2.8 : 1.8) + 2.5;
      strokePolyline(c, pl.points, 1e9);
    }
    c.restore();
  }

  function advanceReveal() {
    const MAIN_RATE = 6.5, BR_RATE = 8.5;
    let allDone = true;
    for (let i = 0; i < sim.polylines.length; i++) {
      const pl = sim.polylines[i];
      const total = pl.points[pl.points.length - 1].d;
      if (baked[i]) continue;
      if (pl.kind === 'main') {
        reveal[i] = Math.min(total, reveal[i] + MAIN_RATE);
      } else if (reveal[pl.parentIdx] >= pl.parentDist) {
        reveal[i] = Math.min(total, reveal[i] + BR_RATE);
      }
      if (reveal[i] >= total) {
        bakePolyline(i);
        K.audio.crackSnap(pl.kind === 'main');
      } else {
        allDone = false;
      }
    }
    return allDone;
  }

  // --- 結果表示 ---
  function buildTabs() {
    tabsEl.innerHTML = '';
    CATEGORIES.forEach(function (cat) {
      const b = document.createElement('button');
      b.textContent = cat.label;
      b.className = 'tab' + (cat.key === currentCategory ? ' active' : '');
      b.addEventListener('click', function () {
        currentCategory = cat.key;
        buildTabs();
        showCategory();
      });
      tabsEl.appendChild(b);
    });
  }

  function showCategory() {
    const interp = interpCache[currentCategory];
    rankEl.textContent = interp.rank;
    rankEl.style.color = RANK_COLORS[interp.rank];
    reasonsEl.innerHTML = '';
    interp.reasons.forEach(function (r) {
      const li = document.createElement('li');
      li.textContent = r;
      reasonsEl.appendChild(li);
    });
    renderOracle(interp.rank);
  }

  // 殷墟卜辞の四部構成（叙辞・命辞・占辞・驗辞）にならって占いの記録を組み立てる
  function renderOracle(rank) {
    if (!oracleEl || !lastSnap) return;
    let o = null;
    try {
      o = K.classics.buildOracleText({
        seed: lastSnap.seed, category: currentCategory, rank: rank, wish: getWish()
      });
    } catch (e) {
      o = null;
    }
    if (!o) { oracleEl.hidden = true; return; }
    oracleEl.innerHTML = '';
    const head = document.createElement('span');
    head.className = 'oracle-head';
    head.textContent = '卜辞（ぼくじ）';
    oracleEl.appendChild(head);

    // まず分かりやすい説明文を大きく見せ、その下に訳と漢文原文を小さく並べる
    if (o.question && o.question.gloss) {
      const explain = document.createElement('span');
      explain.className = 'oracle-explain';
      explain.textContent = o.question.gloss;
      oracleEl.appendChild(explain);
    }

    const pairs = o.pairs || (o.lines || []).map(function (l) { return { ja: l, src: '' }; });
    pairs.forEach(function (p) {
      const pair = document.createElement('span');
      pair.className = 'oracle-pair';
      const jaRow = document.createElement('span');
      jaRow.className = 'oracle-ja';
      const tag = document.createElement('span');
      tag.className = 'oracle-tag';
      tag.textContent = p.label || '訳';
      jaRow.appendChild(tag);
      const ja = document.createElement('span');
      ja.className = 'oracle-line';
      ja.textContent = p.ja;
      jaRow.appendChild(ja);
      pair.appendChild(jaRow);
      if (p.src) {
        const src = document.createElement('span');
        src.className = 'oracle-src';
        src.textContent = p.src;
        pair.appendChild(src);
      }
      oracleEl.appendChild(pair);
    });
    oracleEl.hidden = false;
  }

  function showResult() {
    const pat = K.classifyPattern(sim.metrics);
    currentPattern = pat;
    patternEl.textContent = '【' + pat.name + (pat.reading ? '（' + pat.reading + '）' : '') + '】' + pat.gloss;
    const wish = getWish();
    if (wish) {
      wishlineEl.textContent = '願い事: ' + wish;
      wishlineEl.hidden = false;
    } else {
      wishlineEl.textContent = '';
      wishlineEl.hidden = true;
    }
    interpCache = {};
    CATEGORIES.forEach(function (cat) {
      interpCache[cat.key] = K.interpretFortune(sim.metrics, cat.key);
    });
    // 根拠ハイライト: 総合判定の根拠として全枝（型の特徴となる枝群）を使う
    const ev = [];
    for (let i = 0; i < sim.polylines.length; i++) {
      if (sim.polylines[i].kind === 'branch') ev.push(i);
    }
    interpCache.overall.evidenceIndices = ev;
    currentCategory = 'overall';
    buildTabs();
    showCategory();
    const ang = sim.metrics.avgBranchAngleDeg;
    seedlineEl.textContent = 'シード: ' + lastSnap.seed
      + ' ／ スコア: ' + interpCache.overall.score
      + ' ／ 夾角: ' + (ang === null ? '—' : Math.round(ang) + '°');
    resultEl.hidden = false;
    highlightT = 0;
    K.audio.resultChime(interpCache.overall.rank);
    saveHistory({
      seed: lastSnap.seed, x: lastSnap.x, y: lastSnap.y,
      strength: lastSnap.strength, duration: lastSnap.duration,
      wish: wish, rank: interpCache.overall.rank,
      score: interpCache.overall.score, pattern: pat.name, t: Date.now()
    });
  }

  // --- 願い事・共有・履歴 ---
  function getWish() {
    return wishEl ? (wishEl.value || '').trim().slice(0, 60) : '';
  }

  function buildShareURL() {
    if (!lastSnap) return location.href;
    const base = location.href.split('?')[0].split('#')[0];
    return base + K.buildShareQuery(lastSnap, getWish());
  }

  let copyDoneTimer = null;
  function flashCopyDone(text) {
    copyDoneEl.textContent = text;
    copyDoneEl.hidden = false;
    if (copyDoneTimer) clearTimeout(copyDoneTimer);
    copyDoneTimer = setTimeout(function () { copyDoneEl.hidden = true; }, 2000);
  }

  function copyShareLink() {
    const url = buildShareURL();
    function done() { flashCopyDone('コピーしました'); }
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { flashCopyDone(url); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
  }

  function shareToX() {
    if (!lastSnap || !interpCache.overall || !currentPattern) return;
    const wish = getWish();
    const text = '亀卜: ' + interpCache.overall.rank + '【' + currentPattern.name + '】'
      + (wish ? '「' + wish + '」' : '')
      + '\n#亀卜 #亀卜シミュレーター #占い';    const url = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text)
      + '&url=' + encodeURIComponent(buildShareURL());
    window.open(url, '_blank', 'noopener');
  }

  function loadHistory() {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(entry) {
    try {
      const arr = loadHistory();
      arr.unshift(entry);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_MAX)));
    } catch (e) {
      /* プライベートモード等では保存しない */
    }
    renderHistory();
  }

  function formatDate(t) {
    try {
      const d = new Date(t);
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':'
        + ('0' + d.getMinutes()).slice(-2);
    } catch (e) {
      return '';
    }
  }

  function renderHistory() {
    const arr = loadHistory();
    historySectionEl.hidden = false;
    historyListEl.innerHTML = '';
    historyEmptyEl.hidden = arr.length !== 0;
    arr.forEach(function (h) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      const label = document.createElement('span');
      const rank = document.createElement('span');
      rank.className = 'h-rank';
      rank.textContent = h.rank || '';
      rank.style.color = RANK_COLORS[h.rank] || '';
      label.appendChild(rank);
      label.appendChild(document.createTextNode((h.pattern || '')
        + (h.wish ? '「' + h.wish + '」' : '')));
      const date = document.createElement('span');
      date.className = 'h-date';
      date.textContent = formatDate(h.t);
      b.appendChild(label);
      b.appendChild(date);
      b.addEventListener('click', function () {
        strengthEl.value = h.strength;
        durationEl.value = h.duration;
        if (wishEl) wishEl.value = h.wish || '';
        syncLabels();
        K.audio.resume();
        runDivination(h.seed, h.x, h.y, h.strength, h.duration);
      });
      li.appendChild(b);
      historyListEl.appendChild(li);
    });
  }

  // --- 操作 ---
  function runDivination(seed, x, y, strength, duration) {
    // 灼は事前に穿たれた鑽・鑿の位置でしか行えない（殷の攻龜・鑽鑿に倣う）
    const h = K.nearestHollow(x, y, 90);
    const ox = h ? h.x : x, oy = h ? h.y : y;
    activeHollow = h;
    sim = K.simulateCracks({ seed: seed, x: ox, y: oy, strength: strength, duration: duration, isInside: isInsidePlastron });
    lastSnap = { seed: seed, x: x, y: y, strength: strength, duration: duration, wish: getWish() };
    resultEl.hidden = true;
    heatT = 0;
    heatDur = Math.round(60 + (K.clamp(duration, 0, 100) / 100) * 180);
    holdT = 0;
    reveal = sim.polylines.map(function () { return 0; });
    baked = sim.polylines.map(function () { return false; });
    particles = K.createParticles();
    crackCtx.clearRect(0, 0, LW, LH);
    scorched = false;
    crackleTimer = 0;
    state = S.HEATING;
    K.audio.startHum();
  }

  // 灼痕：兆の裏（施熱点）には円状の焦げが残る
  function bakeScorch() {
    if (scorched || !sim) return;
    scorched = true;
    const o = sim.origin;
    crackCtx.save();
    crackCtx.clip(PLASTRON);
    const g = crackCtx.createRadialGradient(o.x, o.y, 1, o.x, o.y, 22);
    g.addColorStop(0, 'rgba(46,26,12,0.88)');
    g.addColorStop(0.55, 'rgba(74,42,18,0.62)');
    g.addColorStop(1, 'rgba(96,58,26,0)');
    crackCtx.fillStyle = g;
    crackCtx.beginPath();
    crackCtx.ellipse(o.x, o.y, 22, 20, 0, 0, Math.PI * 2);
    crackCtx.fill();
    crackCtx.strokeStyle = 'rgba(38,20,8,0.5)';
    crackCtx.lineWidth = 2;
    crackCtx.beginPath();
    crackCtx.ellipse(o.x, o.y, 15, 13, 0, 0, Math.PI * 2);
    crackCtx.stroke();
    crackCtx.restore();
  }

  function resetAll() {
    state = S.IDLE;
    sim = null;
    resultEl.hidden = true;
    K.audio.stopHum();
  }

  function syncLabels() {
    strengthVEl.textContent = strengthEl.value;
    durationVEl.textContent = durationEl.value;
  }

  let hintTimer = null;
  function flashHint() {
    hintEl.style.color = '#e0a060';
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintEl.style.color = ''; }, 700);
  }

  cv.addEventListener('mousemove', function (e) {
    if (state !== S.IDLE) { hoverPos = null; return; }
    const r = cv.getBoundingClientRect();
    hoverPos = {
      x: (e.clientX - r.left) / r.width * LW,
      y: (e.clientY - r.top) / r.height * LH
    };
  });
  cv.addEventListener('mouseleave', function () { hoverPos = null; });

  cv.addEventListener('click', function (e) {
    if (state !== S.IDLE) return;
    K.audio.resume();
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * LW;
    const y = (e.clientY - r.top) / r.height * LH;
    if (!isInsidePlastron(x, y)) { flashHint(); return; }
    const seed = (Math.random() * 4294967296) >>> 0;
    runDivination(seed, x, y, Number(strengthEl.value), Number(durationEl.value));
  });

  document.getElementById('reset').addEventListener('click', resetAll);
  document.getElementById('reset2').addEventListener('click', resetAll);
  document.getElementById('again').addEventListener('click', function () {
    if (!lastSnap) return;
    strengthEl.value = lastSnap.strength;
    durationEl.value = lastSnap.duration;
    if (wishEl && lastSnap.wish !== undefined) wishEl.value = lastSnap.wish;
    syncLabels();
    K.audio.resume();
    runDivination(lastSnap.seed, lastSnap.x, lastSnap.y, lastSnap.strength, lastSnap.duration);
  });
  function wrapText(c, text, x, y, maxW, lineH) {
    let line = '';
    let yy = y;
    for (const ch of text) {
      if (c.measureText(line + ch).width > maxW) {
        c.fillText(line, x, yy);
        yy += lineH;
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) c.fillText(line, x, yy);
    return yy + lineH;
  }

  function buildExportCanvas() {
    const wish = getWish();
    const interp = interpCache[currentCategory];
    const usable = !!(interp && lastSnap);
    const minFooter = wish ? 316 : 290;
    let footerH = minFooter;

    // まず描画内容から高さを実測し、原文併記でも溢れないフッター高さを決める
    if (usable) {
      const probe = document.createElement('canvas');
      probe.width = LW * DPR;
      probe.height = (LH + minFooter) * DPR;
      const pc = probe.getContext('2d');
      pc.setTransform(DPR, 0, 0, DPR, 0, 0);
      const endY = drawFooter(pc, wish, interp, minFooter, false);
      footerH = Math.max(minFooter, Math.ceil(endY - LH + 16));
    }

    const out = document.createElement('canvas');
    out.width = LW * DPR;
    out.height = (LH + footerH) * DPR;
    const c = out.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.drawImage(cv, 0, 0, LW, LH);
    if (usable) drawFooter(c, wish, interp, footerH, true);
    return out;
  }

  // 結果フッター（ランク・型・理由・卜辞・シード）を描画し、描画した最終Yを返す
  function drawFooter(c, wish, interp, footerH, paintBg) {
    if (paintBg) {
      c.fillStyle = '#17140f';
      c.fillRect(0, LH, LW, footerH);
      c.strokeStyle = '#5a4a30';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, LH + 1);
      c.lineTo(LW, LH + 1);
      c.stroke();
    }

    c.textBaseline = 'middle';
    c.fillStyle = RANK_COLORS[interp.rank] || '#e8e0cf';
    c.font = '700 64px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
    c.textAlign = 'center';
    c.fillText(interp.rank, 110, LH + footerH / 2);

    c.textAlign = 'left';
    const rx = 220, maxW = LW - rx - 24;
    c.fillStyle = '#c9b896';
    c.font = '600 18px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
    let yy = wrapText(c, '【' + currentPattern.name + '】' + currentPattern.gloss, rx, LH + 34, maxW, 26);
    if (wish) {
      c.fillStyle = '#d9c69a';
      c.font = '600 16px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
      yy = wrapText(c, '願い事: ' + wish, rx, yy + 2, maxW, 24);
    }

    c.fillStyle = '#e8e0cf';
    c.font = '15px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
    for (const r of interp.reasons) {
      yy = wrapText(c, r, rx, yy + 2, maxW, 22);
    }

    // 卜辞（叙辞・命辞・占辞・驗辞）— 日本語訳に漢文原文を小さく併記
    try {
      const o = K.classics.buildOracleText({
        seed: lastSnap.seed, category: currentCategory, rank: interp.rank, wish: wish
      });
      const pairs = o.pairs || (o.lines || []).map(function (l) { return { ja: l, src: '' }; });
      yy += 8;
      c.fillStyle = '#b08d52';
      c.font = '600 13px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
      c.fillText('卜辞', rx, yy);
      yy += 6;
      for (const p of pairs) {
        c.fillStyle = '#d9c69a';
        c.font = '15px "Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif';
        yy = wrapText(c, p.ja, rx, yy + 2, maxW, 24);
        if (p.src) {
          const tag = (p.label || '原文') + ' ';
          c.fillStyle = '#a3854e';
          c.font = '600 11px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
          const tagW = c.measureText(tag).width;
          c.fillText(tag, rx, yy + 2);
          c.fillStyle = '#8f8570';
          c.font = '11px "Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif';
          yy = wrapText(c, p.src, rx + tagW, yy + 2, maxW - tagW, 16);
        }
      }
    } catch (e) { /* 文献データ未読込時は省略 */ }

    const ang = sim && sim.metrics ? sim.metrics.avgBranchAngleDeg : null;
    c.fillStyle = '#9a8f78';
    c.font = '13px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
    const seedY = Math.min(yy + 10, LH + footerH - 14);
    c.fillText('シード: ' + lastSnap.seed
      + ' ／ スコア: ' + interp.score
      + (ang === null ? '' : ' ／ 夾角: ' + Math.round(ang) + '°'),
      rx, seedY);
    return seedY + 14;
  }

  document.getElementById('savepng').addEventListener('click', function () {
    const a = document.createElement('a');
    a.download = 'kiboku-' + (lastSnap ? lastSnap.seed : 'result') + '.png';
    a.href = buildExportCanvas().toDataURL('image/png');
    a.click();
  });
  muteEl.addEventListener('click', function () {
    K.audio.resume();
    K.audio.setMuted(!K.audio.isMuted());
    muteEl.textContent = K.audio.isMuted() ? '音: OFF' : '音: ON';
  });
  strengthEl.addEventListener('input', syncLabels);
  durationEl.addEventListener('input', syncLabels);
  copyLinkEl.addEventListener('click', copyShareLink);
  shareXEl.addEventListener('click', shareToX);
  document.getElementById('historyClear').addEventListener('click', function () {
    try { window.localStorage.removeItem(HISTORY_KEY); } catch (e) { /* ignore */ }
    renderHistory();
  });

  // --- 共有URLからの復元 (?seed=&x=&y=&s=&d=&q=) ---
  function restoreFromQuery() {
    let q = null;
    try {
      q = K.parseShareQuery(location.search);
    } catch (e) {
      q = null;
    }
    if (!q) return;
    if (!isInsidePlastron(q.x, q.y)) return;
    strengthEl.value = q.strength;
    durationEl.value = q.duration;
    if (wishEl && q.wish) wishEl.value = q.wish;
    syncLabels();
    runDivination(q.seed, q.x, q.y, q.strength, q.duration);
  }

  // --- メインループ ---
  function frame() {
    ctx.drawImage(baseLayer, 0, 0, LW, LH);
    ctx.drawImage(crackLayer, 0, 0, LW, LH);
    if (state === S.IDLE) {
      // 次に灼できる鑽・鑿を光らせて示す
      const hv = hoverPos ? K.nearestHollow(hoverPos.x, hoverPos.y, 90) : null;
      if (hv) K.drawActiveHollow(ctx, hv, 0.45 + 0.25 * Math.sin(frameT * 0.1));
    } else if (state === S.HEATING) {
      heatT++;
      if (activeHollow) K.drawActiveHollow(ctx, activeHollow, 0.6 + 0.3 * Math.sin(heatT * 0.2));
      K.drawHeating(ctx, sim.origin, heatT / heatDur, heatT);
      if (Math.random() < 0.5) K.spawnSmoke(particles, sim.origin.x, sim.origin.y, Math.random);
      if (Math.random() < 0.25) K.spawnSparks(particles, sim.origin.x, sim.origin.y, Math.random, 2);
      crackleTimer--;
      if (crackleTimer <= 0) { K.audio.emberCrackle(); crackleTimer = 6 + Math.floor(Math.random() * 18); }
      if (heatT >= heatDur) { bakeScorch(); state = S.CRACKING; K.audio.stopHum(); }
    } else if (state === S.CRACKING) {
      K.drawHollow(ctx, sim.origin, 0.75);
      const done = advanceReveal();
      drawGrowingCracks(ctx);
      drawTips(ctx);
      if (Math.random() < 0.3) K.spawnSmoke(particles, sim.origin.x, sim.origin.y, Math.random);
      if (done) {
        holdT++;
        if (holdT > 30) { showResult(); state = S.RESULT; }
      }
    } else if (state === S.RESULT && sim) {
      K.drawHollow(ctx, sim.origin, 0.75);
      highlightT++;
      drawHighlight(ctx, interpCache.overall ? interpCache.overall.evidenceIndices : [], highlightT);
    }
    K.updateParticles(particles);
    K.drawParticles(ctx, particles);
    frameT++;
    requestAnimationFrame(frame);
  }
  syncLabels();
  renderHistory();
  restoreFromQuery();
  requestAnimationFrame(frame);
})(window.Kiboku);
