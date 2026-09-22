'use strict';
/* ===== チュートリアルポップアップ（初回訪問時のみ自動表示） ===== */
(function (K) {
  const SEEN_KEY = 'kiboku-tutorial-seen-v1';
  const STEPS = [
    {
      title: '亀卜シミュレーターへようこそ',
      body: '殷墟の卜法に則して、亀の腹甲に穿たれた「鑽・鑿」を灼し、生じた卜兆（ぼくちょう）を読む古代の占いを体験できます。3ステップで使い方を紹介します。'
    },
    {
      title: '鑽・鑿を灼く',
      body: '腹甲には事前に穿たれたくぼみが並んでいます。光っている最も近いくぼみをクリックすると、そこに灼が当てられ、縦の兆幹と横の兆枝からなる「卜」字型の裂が走ります。灼の「強さ」と「時間」は下のスライダーで変えられます。'
    },
    {
      title: '五兆を読み、卜辞を刻む',
      body: '兆が出そろうと結果パネルが開きます。兆は『書経・洪範』の五兆（雨・霽・蒙・驛・克）に分類され、殷墟卜辞の四部構成（叙辞・命辞・占辞・驗辞）で記録されます。「総合・仕事・恋愛・健康」で解釈が変わり、「画像を保存」で結果を持ち帰れます。'
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
