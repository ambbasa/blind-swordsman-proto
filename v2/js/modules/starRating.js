/* v2/js/modules/starRating.js — 심안: 묵검 v1.24 스테이지 별점·도전 조건 계산 순수 모듈 */

import { evalRunMissions } from './runMissions.js?v=v135';

export function computeStar3Info(st, S, cfg) {
  const s3 = (st && st.star3) || { kind: 'combo' };
  if (s3.kind === 'goal') {
    const g = S && S.goal;
    const done = !!(g && g.ok);
    return {
      kind: 'goal',
      text: s3.text || (g && g.label) || '부목표',
      have: done ? 1 : 0,
      need: 1,
      done: done,
      short: (s3.text || (g && g.label) || '부목표') + (g && g.fail ? ' (실패)' : ' ' + (done ? '1/1' : '0/1'))
    };
  }
  if (s3.kind === 'pattern') {
    const have = s3.counter === 'goldReflect' ? ((S && S.goldReflectN) || 0)
      : s3.counter === 'clashWin' ? ((S && S.clashWin) || 0)
      : ((S && S.shuffleLock) || 0);
    const need = s3.need || 2;
    return {
      kind: 'pattern',
      text: s3.text,
      have: have,
      need: need,
      done: have >= need,
      short: s3.text + ' ' + Math.min(have, need) + '/' + need
    };
  }
  const comboNeed = Math.ceil(((st && st.starCombo) || 10) * ((cfg && cfg.star3ComboMul) || 0.8));
  const byCombo = ((S && S.comboMax) || 0) >= comboNeed;
  let alt = null;
  if (s3.alt) {
    const have = (S && S.terrain && S.terrain.counts && S.terrain.counts[s3.alt.key]) || 0;
    alt = { text: s3.alt.text, have: have, need: s3.alt.need || 1, done: have >= (s3.alt.need || 1) };
  }
  return {
    kind: 'combo',
    comboNeed: comboNeed,
    byCombo: byCombo,
    alt: alt,
    text: '콤보 ' + comboNeed + (alt ? ' 또는 ' + alt.text : ''),
    done: byCombo || !!(alt && alt.done),
    short: '콤보 ' + Math.min((S && S.comboMax) || 0, comboNeed) + '/' + comboNeed +
      (alt ? ' · ' + alt.text + ' ' + Math.min(alt.have, alt.need) + '/' + alt.need : '')
  };
}

export function computeStarsFor(win, S, cfg, maxHpVal, starCapVal) {
  if (!S || !win) return 0;
  if (S.challenge) return 0;
  if (S.missions && S.missions.length === 3) {
    const ev = evalRunMissions(S.missions, S, maxHpVal);
    let mStars = 1;
    if (ev.doneCount >= 2) mStars++;
    if (ev.doneCount >= 3) mStars++;
    return Math.min(starCapVal, mStars);
  }
  const st = S.stage || {};
  let n = 1;
  if (S.hp / Math.max(1, maxHpVal) >= 0.5 || (S.hits || 0) <= ((cfg && cfg.star2Hits) || 3)) n++;
  if (computeStar3Info(st, S, cfg).done) n++;
  return Math.min(starCapVal, n);
}
