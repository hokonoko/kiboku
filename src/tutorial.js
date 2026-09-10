'use strict';
/* ===== チュートリアルポップアップ（初回訪問時のみ自動表示） ===== */
(function (K) {
  const SEEN_KEY = 'kiboku-tutorial-seen-v1';
  const STEPS = [
    {
      title: '亀卜シミュレーターへようこそ',
      body: '亀の腹甲に熱を加えてひび（卜兆）を走らせ、その形から吉凶を読む——古代の占い「亀卜」をブラウザで体験できます。3ステップで使い方を紹介します。'
    },
    {
      title: '占いたい場所を灼く',
      body: '腹甲の内側をクリックすると、その場所が熱せられてひびが現れます。熱の「強さ」と「時間」は下のスライダーで自由に変えられます。'
    },
    {
      title: 'ひびの結果を読む',
      body: 'ひびが出そろうと結果パネルが開きます。「総合・仕事・恋愛・健康」のタブで解釈が変わり、「画像を保存」で結果を持ち帰れます。「同じ条件でもう一度」で同じひびを再現することもできます。'
    }
  ];

  let overlay = null;
  let titleEl = null;
  let bodyEl = null;
  let stepEl = null;
  let dotsEl = null;
  let backBtn = null;
  let nextBtn = null;
  let lastFocus = null;
  let idx = 0;

  function readSeen() {
    try {
      return window.localStorage.getItem(SEEN_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function markSeen() {
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch (e) {
      /* プライベートモード等で保存できない場合は毎回表示する */
    }
  }

  function render() {
    const step = STEPS[idx];
    stepEl.textContent = '使い方 ' + (idx + 1) + ' / ' + STEPS.length;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    dotsEl.innerHTML = '';
    for (let i = 0; i < STEPS.length; i++) {
      const dot = document.createElement('span');
      if (i === idx) dot.className = 'on';
      dotsEl.appendChild(dot);
    }
    backBtn.disabled = idx === 0;
    nextBtn.textContent = idx === STEPS.length - 1 ? '占いをはじめる' : '次へ';
  }

  function open() {
    lastFocus = document.activeElement;
    idx = 0;
    render();
    overlay.hidden = false;
    nextBtn.focus();
  }

  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    markSeen();
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function goNext() {
    if (idx < STEPS.length - 1) {
      idx++;
      render();
      nextBtn.focus();
    } else {
      close();
    }
  }

  function goBack() {
    if (idx > 0) {
      idx--;
      render();
      backBtn.focus();
    }
  }

  function init() {
    overlay = document.getElementById('tutorial');
    if (!overlay) return;
    titleEl = document.getElementById('tutTitle');
    bodyEl = document.getElementById('tutBody');
    stepEl = document.getElementById('tutStep');
    dotsEl = document.getElementById('tutDots');
    backBtn = document.getElementById('tutBack');
    nextBtn = document.getElementById('tutNext');

    document.getElementById('tutClose').addEventListener('click', close);
    document.getElementById('tutSkip').addEventListener('click', close);
    backBtn.addEventListener('click', goBack);
    nextBtn.addEventListener('click', goNext);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function (e) {
      if (overlay.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goBack();
    });
    document.getElementById('help').addEventListener('click', open);

    if (!readSeen()) open();
  }

  K.tutorial = { init: init, open: open };
  init();
})(window.Kiboku);
