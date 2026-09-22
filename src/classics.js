'use strict';
/* ===== 文献データ: 殷墟卜辞・周礼・書経洪範・対馬亀卜神事 =====
   本ファイルの用語・文例は下記の文献に基づく（詳細は docs/research/2026-09-22-kiboku-literature.md）。
   - 『周礼』春官（大卜・卜師）/ 『書経』洪範 七稽疑 / 『史記』龜策列伝 / 『礼記』玉藻
   - 殷墟卜辞（叙辞・命辞・占辞・驗辞の構成、干支記日、貞人名）
   - 『新撰亀相記』『延喜神祇式』対馬・豆酘雷神社「亀卜神事」の判定語 */
(function (K) {
  const TIANKAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  // 六十甲子（干支）。index 0 = 甲子
  const GANSHI = [];
  for (let i = 0; i < 60; i++) GANSHI.push(TIANKAN[i % 10] + DIZHI[i % 12]);

  // 殷墟卜辞に見える貞人名（甲骨学上の貞人組）
  const DIVINERS = ['殻', '賓', '亘', '韋', '行', '旅', '尹', '古', '永', '狄', '何', '爭', '出', '黃'];

  // 癸日の干支（旬末の旬卜に用いられる6日）
  const GUIRI = [];
  for (let i = 9; i < 60; i += 10) GUIRI.push(GANSHI[i]);

  // 命辞（卜問の文）。殷墟卜辞の文例にならった再構成。
  // text = 日本語訳 / src = 漢文原文 / gloss = 分かりやすい長い説明文（表示の主役）
  const QUESTIONS = {
    overall: {
      text: 'これから十日間、禍はなきや？', src: '旬亡禍？',
      gloss: 'これから10日間（殷は10日を「一旬」と呼んだ）に、災いが降るかどうかをたずねた占いです。殷の王は旬の終わりの癸の日に、次の旬の安全を亀に問いかけました。'
    },
    work: {
      text: '事業を興しても、禍はなきや？', src: '作邑，亡禍？',
      gloss: '仕事や造営を始めてよいかをたずねた占いです。殷では「作邑」（都邑をつくる）のような国家の大事は、必ず亀に問うてから決められました。'
    },
    love: {
      text: 'この縁、嘉しきものとなるや？', src: '娶婦，嘉？',
      gloss: '嫁娶（よめとり・婚礼）がよいかをたずねた占いです。殷の王家の縁組みは国家の行事でもあり、嘉しき結びつきとなるかを亀に問いかけました。'
    },
    health: {
      text: 'この病、憂いに足らざるや？', src: '有疾，亡憂？',
      gloss: 'この病は重いか、心配のないものかをたずねた占いです。殷墟卜辞には王や身内にまつわる病の記録が多く残り、治病や養生の判断に用いられました。'
    }
  };

  // 占辞（視兆の後の判断）。殷墟卜辞の語彙のみを使用。ja = 訳 / src = 原文
  const ZHAN = {
    '大吉': { ja: '王が占って曰く、大吉。', src: '王占曰：大吉。' },
    '吉': { ja: '王が占って曰く、吉。', src: '王占曰：吉。' },
    '安': { ja: '王が占って曰く、吉。', src: '王占曰：吉。' },
    '並': { ja: '王が占って曰く、禍なし。', src: '王占曰：亡禍。' },
    '不吉': { ja: '王が占って曰く、不吉。', src: '王占曰：不吉。' }
  };

  // 驗辞（後の応験）。ja = 訳 / src = 原文
  const YAN = {
    ok: { ja: 'まことに禍なし。', src: '允亡禍。' },
    ng: { ja: '十二日を経て、まことに禍あり。', src: '旬有二日，允有禍。' }
  };

  // 判定5段階。殷墟卜辞（大吉・吉・不吉）と対馬亀卜神事（安・並）に実際見える語。
  const RANKS = [
    { key: '大吉', min: 80, source: '殷墟卜辞・対馬亀卜神事' },
    { key: '吉', min: 60, source: '殷墟卜辞・対馬亀卜神事' },
    { key: '安', min: 40, source: '対馬亀卜神事（2020年「豆酘地区 安」）' },
    { key: '並', min: 25, source: '対馬亀卜神事（天候「並」）' },
    { key: '不吉', min: 0, source: '殷墟卜辞' }
  ];

  function rankOf(score) {
    const s = K.clamp(score, 0, 100);
    for (const r of RANKS) if (s >= r.min) return r.key;
    return RANKS[RANKS.length - 1].key;
  }

  // 洪範の五兆（『書経（尚書）』洪範 七稽疑「曰雨、曰霽、曰蒙、曰驛、曰克」＝卜五）
  const FIVE_OMENS = {
    ji: { key: 'ji', name: '霽兆', reading: 'はれ', omen: '霽',
      gloss: '「霽」は開く。晴れ渡るように開いて明快な兆。五兆のうち最も吉とされる。' },
    u: { key: 'u', name: '雨兆', reading: 'あめ', omen: '雨',
      gloss: '「雨」は雨の如し。枝が数多く四方に降るが如き兆。' },
    mo: { key: 'mo', name: '蒙兆', reading: 'もう', omen: '蒙',
      gloss: '「蒙」は翳る。輪郭が曖昧で読み取りにくい兆。' },
    eki: { key: 'eki', name: '驛兆', reading: 'えき', omen: '驛',
      gloss: '「驛」は絶え絶え。主兆・枝が短く途切れがちな兆。' },
    koku: { key: 'koku', name: '克兆', reading: 'こく', omen: '克',
      gloss: '「克」は相剋。枝が左右に偏り、互いに交錯し合う兆。' }
  };

  // 『周礼』に見える兆の分類（解説用）
  const ZHOU_LI = {
    san: { title: '三兆（周礼・大卜）', items: ['玉兆', '瓦兆', '原兆'],
      quote: '掌三兆之法，一曰玉兆，二曰瓦兆，三曰原兆。',
      ja: '三兆の法を掌る。一つ目を玉兆、二つ目を瓦兆、三つ目を原兆という。' },
    si: { title: '四兆（周礼・卜師）', items: ['方兆', '功兆', '義兆', '弓兆'],
      quote: '掌開龜之四兆，一曰方兆，二曰功兆，三曰義兆，四曰弓兆。',
      ja: '亀を開く四兆を掌る。一つ目を方兆、二つ目を功兆、三つ目を義兆、四つ目を弓兆という。' }
  };

  const SOURCES = [
    { title: '周礼・春官宗伯（大卜・卜師・龜人）', note: '三兆・四兆。原文「揚火以作龜，致其墨」／訳：火を上げて亀を作り、その墨を致す' },
    { title: '書経（尚書）・洪範 七稽疑', note: '卜五＝雨・霽・蒙・驛・克。原文「三人占則從二人之言」／訳：三人が占えば、二人の言に従う' },
    { title: '史記・巻128 龜策列伝', note: '荊枝・堅木で灼く。原文「灼亀観兆」／訳：亀を灼いて兆を観る、原文「其卜必北向」／訳：占うときは必ず北を向く' },
    { title: '礼記・玉藻', note: '原文「卜人定龜，史定墨，君定体」／訳：卜人は亀を選び、史が墨で兆を定め、君が体を定める' },
    { title: '殷墟卜辞（甲骨刻辞）', note: '叙辞・命辞・占辞・驗辞の四部構成、干支記日、貞人名' },
    { title: '新撰亀相記（830年 卜部遠継撰）', note: '日本における亀卜の由来・作法を伝える卜占書' },
    { title: '延喜神祇式 臨時祭', note: '卜部は伊豆5・壱岐5・対馬10から選抜' },
    { title: '対馬国亀卜次第（元禄九年 藤斎延）／正卜考（伴信友）', note: '対馬亀卜の作法書' },
    { title: '対州神社誌（貞享3年）', note: '焼占の日取りと前後7日の往来不通' },
    { title: '亀卜神事（サンゾーロー祭）国選択無形民俗文化財', note: '判定語「吉・安・並・上々・良」等の実例' }
  ];

  // 卜辞を組み立てる（純粋・決定的関数）
  // opts: { seed, category, rank, wish }
  function buildOracleText(opts) {
    const rand = K.mulberry32((opts.seed >>> 0) ^ 0x9e3779b9);
    const category = opts.category || 'overall';
    // 総合（旬卜）は殷人が好んだ癸日の6日に限定する
    const day = category === 'overall'
      ? GUIRI[Math.floor(rand() * GUIRI.length)]
      : GANSHI[Math.floor(rand() * GANSHI.length)];
    const diviner = DIVINERS[Math.floor(rand() * DIVINERS.length)];
    const q = QUESTIONS[category] || QUESTIONS.overall;
    const rank = opts.rank || '吉';
    const xuci = day + 'に卜し、' + diviner + 'が貞す：';
    const xuciSrc = day + '卜，' + diviner + '貞：';
    const zhan = ZHAN[rank] || ZHAN['吉'];
    const yan = (rank === '不吉' || rank === '並') ? YAN.ng : YAN.ok;
    // 訳（日本語・太字表示）と漢文原文（小さい表示）の対
    const pairs = [
      { label: '叙辞・命辞', ja: xuci + q.text, src: xuciSrc + (q.src || q.text) },
      { label: '占辞', ja: zhan.ja, src: zhan.src },
      { label: '驗辞', ja: yan.ja, src: yan.src }
    ];
    return {
      lines: [pairs[0].ja, pairs[1].ja, pairs[2].ja],
      original: [pairs[0].src, pairs[1].src, pairs[2].src],
      pairs: pairs,
      text: pairs[0].ja + '\n' + pairs[1].ja + '\n' + pairs[2].ja,
      day: day,
      diviner: diviner,
      question: q,
      zhan: zhan.ja,
      zhanSrc: zhan.src,
      yan: yan.ja,
      yanSrc: yan.src
    };
  }

  K.classics = {
    GANSHI: GANSHI,
    DIVINERS: DIVINERS,
    RANKS: RANKS,
    rankOf: rankOf,
    FIVE_OMENS: FIVE_OMENS,
    ZHOU_LI: ZHOU_LI,
    SOURCES: SOURCES,
    QUESTIONS: QUESTIONS,
    buildOracleText: buildOracleText
  };
})(window.Kiboku);
