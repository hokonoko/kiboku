'use strict';
/* ===== 吉凶判定・型判定・カテゴリ別解釈（純粋ロジック） ===== */
(function (K) {
  function judgeFortune(m) {
    let score = 20;
    score += K.clamp(m.avgTiltDeg / 40, -1, 1) * 26 + (m.avgTiltDeg > 0 ? 4 : 0);
    score += K.clamp(m.avgBranchLen * Math.pow(m.branchCount, 0.7) / 300, 0, 1) * 30;
    score += K.clamp((m.straightness - 0.6) / 0.35, 0, 1) * 24;
    score = Math.round(K.clamp(score, 0, 100));
    const rank = score >= 80 ? '大吉' : score >= 60 ? '吉' : score >= 40 ? '中吉' : score >= 25 ? '小吉' : '凶';

    const reasons = [];
    if (m.branchCount === 0) {
      reasons.push('枝が現れませんでした');
    } else {
      if (m.avgTiltDeg >= 15) reasons.push('枝が力強く上を向いています');
      else if (m.avgTiltDeg >= 3) reasons.push('枝は緩やかに上向きです');
      else if (m.avgTiltDeg > -3) reasons.push('枝はほぼ水平です');
      else if (m.avgTiltDeg > -15) reasons.push('枝はやや下を向いています');
      else reasons.push('枝が大きく垂れ下がっています');
      reasons.push('枝は' + m.branchCount + '本、平均' + Math.round(m.avgBranchLen) + 'pxの伸びです');
    }
    if (m.straightness >= 0.95) reasons.push('主筋が真っ直ぐで安定しています');
    else if (m.straightness < 0.8) reasons.push('主筋が揺らいでいます');
    return { rank: rank, score: score, reasons: reasons };
  }

  function classifyPattern(m) {
    if (m.branchCount === 0) {
      return { name: '細流型', description: '枝を持たず細く流れる卜兆。内なる声に耳を澄ませる時。' };
    }
    if (m.straightness >= 0.95 && m.upwardRatio >= 0.6) {
      return { name: '直達型', description: '主筋が真っ直ぐで枝も上向きの、勢いのある卜兆。願いは天に届きやすい。' };
    }
    if (m.upwardRatio >= 0.7) {
      return { name: '昇枝型', description: '枝の多くが上を向く卜兆。物事が上向きに進む兆し。' };
    }
    if (m.upwardRatio <= 0.3) {
      return { name: '垂蔭型', description: '枝が垂れ下がる卜兆。慎重さと休息が求められる。' };
    }
    if (m.branchCount >= 6 && m.sideBalance >= 0.6) {
      return { name: '分岐型', description: '左右にバランスよく枝が分かれる卜兆。選択肢が豊かにある。' };
    }
    return { name: '中庸型', description: '突出した特徴のない、穏やかな卜兆。平穏な運気。' };
  }

  function interpretFortune(m, category) {
    category = category || 'overall';
    if (category === 'overall') {
      const j = judgeFortune(m);
      return { rank: j.rank, score: j.score, reasons: j.reasons, evidenceIndices: [] };
    }

    let score = 20;
    const reasons = [];
    if (category === 'work') {
      score += K.clamp((m.straightness - 0.6) / 0.35, 0, 1) * 40;
      score += K.clamp(m.mainLen / 500, 0, 1) * 25;
      score += K.clamp(m.avgBranchLen * Math.pow(m.branchCount, 0.7) / 300, 0, 1) * 15;
      reasons.push(m.straightness >= 0.9 ? '主筋が安定しており、仕事の基盤は固いでしょう' : '主筋が揺らいでおり、仕事では足元を固める時期です');
    } else if (category === 'love') {
      score += K.clamp(m.avgTiltDeg / 40, -1, 1) * 30 + (m.avgTiltDeg > 0 ? 5 : 0);
      score += K.clamp(m.sideBalance, 0, 1) * 30;
      score += K.clamp(m.upwardRatio, 0, 1) * 20;
      reasons.push(m.sideBalance >= 0.6 ? '左右の枝が調和しており、相手とのバランスが取れています' : '枝の偏りが見られ、関係に一方通行の気配があります');
    } else if (category === 'health') {
      score += K.clamp(m.mainLen / 500, 0, 1) * 45;
      score += K.clamp((m.straightness - 0.6) / 0.35, 0, 1) * 20;
      score += K.clamp(m.avgBranchLen / 100, 0, 1) * 15;
      reasons.push(m.mainLen >= 400 ? '主筋が長く伸びており、気力・体力ともに充実しています' : '主筋が短めで、無理をせず養生するのが吉です');
    }
    score = Math.round(K.clamp(score, 0, 100));
    const rank = score >= 80 ? '大吉' : score >= 60 ? '吉' : score >= 40 ? '中吉' : score >= 25 ? '小吉' : '凶';
    return { rank: rank, score: score, reasons: reasons, evidenceIndices: [] };
  }

  K.judgeFortune = judgeFortune;
  K.classifyPattern = classifyPattern;
  K.interpretFortune = interpretFortune;
})(window.Kiboku);
