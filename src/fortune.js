'use strict';
/* ===== 吉凶判定・兆の型判定・カテゴリ別解釈（純粋ロジック） =====
   - 兆の分類は『書経（尚書）』洪範 七稽疑に挙げられた五兆（雨・霽・蒙・驛・克）に準拠する。
   - 吉凶の主判定は、兆幹と兆枝の夾角（70〜120°が吉兆とされた確率が高い）と
     兆幹の直進性・兆枝の伸びに基づく。
   - 判定語は殷墟卜辞（大吉・吉・不吉）と対馬亀卜神事（安・並）に実際見える語を用いる。
   詳細な出典は docs/research/2026-09-22-kiboku-literature.md を参照。 */
(function (K) {
  const CL = K.classics || {};
  function num(v, def) { return (typeof v === 'number' && isFinite(v)) ? v : def; }
  function rankOf(score) {
    if (CL.rankOf) return CL.rankOf(score);
    return score >= 80 ? '大吉' : score >= 60 ? '吉' : score >= 40 ? '安'
      : score >= 25 ? '並' : '不吉';
  }
  function omen(key) {
    if (CL.FIVE_OMENS && CL.FIVE_OMENS[key]) return CL.FIVE_OMENS[key];
    return { key: key, name: key, reading: '', gloss: '' };
  }

  function judgeFortune(m) {
    const straightness = num(m.straightness, 0);
    const branchCount = num(m.branchCount, 0);
    const avgBranchLen = num(m.avgBranchLen, 0);
    const avgTiltDeg = num(m.avgTiltDeg, 0);
    const crossings = num(m.crossings, 0);
    let aScore = num(m.angleScore, NaN);
    if (!isFinite(aScore)) {
      const a = num(m.avgBranchAngleDeg, NaN);
      aScore = isFinite(a) && K.angleScoreOf ? K.angleScoreOf(a) : 0;
    }

    let score = 10;
    score += aScore * 40;
    score += K.clamp((straightness - 0.70) / 0.28, 0, 1) * 20;
    score += K.clamp(branchCount / 7, 0, 1) * 12;
    score += K.clamp((avgBranchLen - 20) / 60, 0, 1) * 8;
    if (avgTiltDeg > 0) score += 8;
    if (crossings > 0) score -= 8;

    // 洪範の五兆そのものを吉凶に反映する（霽＝明快は吉、蒙・克・驛は減点）
    const pat = classifyPattern(m);
    if (pat.key === 'ji') score += 8;
    else if (pat.key === 'mo') score -= 14;
    else if (pat.key === 'koku') score -= 8;
    else if (pat.key === 'eki') score -= 7;

    score = Math.round(K.clamp(score, 0, 100));

    const rank = rankOf(score);

    const reasons = [];
    const angle = num(m.avgBranchAngleDeg, NaN);
    if (isFinite(angle)) {
      if (angle >= 70 && angle <= 120) {
        reasons.push('兆幹と兆枝の夾角は平均' + Math.round(angle) + '°。ほぼ直角に開き、吉兆に多い形です');
      } else if (angle < 70) {
        reasons.push('兆幹と兆枝の夾角は平均' + Math.round(angle) + '°。枝が鋭くのび、勢いは強いが落ち着きに欠けます');
      } else {
        reasons.push('兆幹と兆枝の夾角は平均' + Math.round(angle) + '°。枝が鈍角に折れ、伸びが滞る形です');
      }
    }
    if (branchCount === 0) {
      reasons.push('兆枝が現れませんでした（驛兆：絶え絶えの兆）');
    } else {
      reasons.push('兆枝は' + branchCount + '本、平均' + Math.round(avgBranchLen) + 'pxの伸び');
    }
    if (crossings > 0) reasons.push('枝どうしが' + crossings + 'か所で交錯しています（克：相剋）');
    if (straightness >= 0.95) reasons.push('兆幹が真っ直ぐで、判読しやすい明快な兆です');
    else if (straightness < 0.78) reasons.push('兆幹が揺らいでおり、輪郭が曖昧な兆です');
    return { rank: rank, score: score, reasons: reasons };
  }

  /* 洪範の五兆への分類 */
  function classifyPattern(m) {
    const straightness = num(m.straightness, 1);
    const branchCount = num(m.branchCount, 0);
    const avgBranchLen = num(m.avgBranchLen, 0);
    const mainLen = num(m.mainLen, 0);
    const sideBalance = num(m.sideBalance, 1);
    const crossings = num(m.crossings, 0);

    if (straightness < 0.78) return omen('mo');                    // 蒙：晦れる
    if (branchCount >= 7) return omen('u');                        // 雨：枝が降る如く
    if (crossings > 0 || (branchCount >= 4 && sideBalance <= 0.34)) return omen('koku'); // 克：相剋・交錯
    if (branchCount === 0 || avgBranchLen < 26 || mainLen < 220) return omen('eki');    // 驛：絶え絶え
    return omen('ji');                                             // 霽：開いて明快
  }

  function interpretFortune(m, category) {
    category = category || 'overall';
    if (category === 'overall') {
      const j = judgeFortune(m);
      return { rank: j.rank, score: j.score, reasons: j.reasons, evidenceIndices: [] };
    }

    const straightness = num(m.straightness, 0);
    const branchCount = num(m.branchCount, 0);
    const avgBranchLen = num(m.avgBranchLen, 0);
    const avgTiltDeg = num(m.avgTiltDeg, 0);
    const sideBalance = num(m.sideBalance, 0);
    const mainLen = num(m.mainLen, 0);
    const angle = num(m.avgBranchAngleDeg, NaN);

    let score = 20;
    const reasons = [];
    if (category === 'work') {
      score += K.clamp((straightness - 0.6) / 0.35, 0, 1) * 34;
      score += K.clamp(mainLen / 500, 0, 1) * 22;
      score += K.clamp(avgBranchLen * Math.pow(branchCount, 0.7) / 300, 0, 1) * 14;
      if (isFinite(angle)) score += K.angleScoreOf(angle) * 14;
      reasons.push(straightness >= 0.9 ? '兆幹が安定しており、事業の基盤は固いでしょう'
        : '兆幹が揺らいでおり、仕事では足元を固める時期です');
    } else if (category === 'love') {
      score += K.clamp(avgTiltDeg / 50, -1, 1) * 26 + (avgTiltDeg > 0 ? 5 : 0);
      score += K.clamp(sideBalance, 0, 1) * 30;
      score += K.clamp((num(m.upwardRatio, 0)), 0, 1) * 20;
      reasons.push(sideBalance >= 0.5 ? '左右の兆枝が調和しており、相手とのバランスが取れています'
        : '兆枝の偏りが見られ、関係に一方通行の気配があります');
    } else if (category === 'health') {
      score += K.clamp(mainLen / 500, 0, 1) * 42;
      score += K.clamp((straightness - 0.6) / 0.35, 0, 1) * 20;
      score += K.clamp(avgBranchLen / 100, 0, 1) * 16;
      if (isFinite(angle)) score += K.angleScoreOf(angle) * 12;
      reasons.push(mainLen >= 400 ? '兆幹が長く伸びており、気力・体力ともに充実しています'
        : '兆幹が短めで、無理をせず養生するのが吉です');
    }
    score = Math.round(K.clamp(score, 0, 100));
    return { rank: rankOf(score), score: score, reasons: reasons, evidenceIndices: [] };
  }

  K.judgeFortune = judgeFortune;
  K.classifyPattern = classifyPattern;
  K.interpretFortune = interpretFortune;
})(window.Kiboku);
