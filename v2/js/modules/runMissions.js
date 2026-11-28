/* v2/js/modules/runMissions.js — 심안: 묵검 v1.32 판별 3종 임무 & 기예 점수 순수 모듈 */

export const STYLE_GRADES = Object.freeze([
  { min: 10000, label: '극', cls: 'g-s' },
  { min: 6000,  label: '수', cls: 'g-s' },
  { min: 3000,  label: '갑', cls: 'g-a' },
  { min: 1200,  label: '을', cls: 'g-b' },
  { min: 0,     label: '병', cls: 'g-c' }
]);

export function styleGradeOf(score) {
  const s = Math.max(0, Number(score) || 0);
  for (let i = 0; i < STYLE_GRADES.length; i++) {
    if (s >= STYLE_GRADES[i].min) return STYLE_GRADES[i];
  }
  return STYLE_GRADES[STYLE_GRADES.length - 1];
}

export function computeStyleKillPoints(info) {
  const o = info || {};
  const m = Math.max(1, (o.multiN | 0) || 1);
  const base = m >= 4 ? 1000 : (m === 3 ? 550 : (m === 2 ? 280 : 100));
  const why = String(o.why || '');
  let mul = 1.0;
  if (o.boss) mul = 3.0;
  else if (why === 'cleave') mul = 2.0;
  else if (why === 'parry' || why === 'counter-kill' || o.groggy) mul = 1.8;
  else if (why === 'shatter' || why === 'explode' || why === 'explode-aoe' || why === 'steam' || why === 'poison' || why === 'burn') mul = 1.5;
  else if (o.perfect) mul = 1.4;
  else if (why === 'slam-land' || why === 'bolt' || why === 'reson') mul = 1.25;
  return Math.round(base * mul);
}

export function rollRunMissions(stage, seed) {
  const st = stage || {};
  const id = Math.max(1, (st.id | 0) || 1);
  const shapes = Array.isArray(st.shapes) && st.shapes.length ? st.shapes : ['hline'];
  const r = (seed != null ? Math.abs(seed | 0) : Math.floor(Math.random() * 997));

  /* 1) 생존 임무 */
  const slot1Pool = [
    { id: 'maxHits', label: '피격 3회 이하', target: 3 },
    { id: 'minHpPct', label: '체력 50% 이상 유지', target: 50 }
  ];
  const m1 = slot1Pool[r % slot1Pool.length];

  /* 2) 일섬·연쇄 기예 임무 */
  const pierceNeed = id <= 2 ? 2 : 3;
  const comboNeed = Math.min(24, Math.max(6, Math.round(((st.starCombo || 14) * 0.45))));
  const slot2Pool = [
    { id: 'multiHit', label: '일섬 ' + pierceNeed + '기 동시 관통', target: pierceNeed },
    { id: 'combo', label: '최대 ' + comboNeed + '콤보 달성', target: comboNeed }
  ];
  const m2 = slot2Pool[Math.floor(r / 3) % slot2Pool.length];

  /* 3) 스테이지 풀 맞춤형 전술/무늬 임무 */
  const slot3Pool = [];
  if (shapes.indexOf('vee') >= 0) slot3Pool.push({ id: 'shapeKill_vee', shape: 'vee', label: 'V 도약 찍기 3기 처치', target: 3 });
  if (shapes.indexOf('bolt') >= 0) slot3Pool.push({ id: 'shapeKill_bolt', shape: 'bolt', label: 'Z 뇌전 연쇄 3기 처치', target: 3 });
  if (shapes.indexOf('vline') >= 0) slot3Pool.push({ id: 'shapeKill_vline', shape: 'vline', label: 'ㅣ 직선 관통 3기 처치', target: 3 });
  if (id >= 2) {
    slot3Pool.push({ id: 'parry', label: '칼집 패링 2회 성공', target: 2 });
    slot3Pool.push({ id: 'cleaveKill', label: '참(O)으로 3기 이상 처치', target: 3 });
  } else {
    slot3Pool.push({ id: 'kills', label: '귀물 15기 처치', target: 15 });
    slot3Pool.push({ id: 'parry', label: '칼집 패링 1회 성공', target: 1 });
  }
  const m3 = slot3Pool[Math.floor(r / 7) % slot3Pool.length];

  return [
    Object.assign({}, m1),
    Object.assign({}, m2),
    Object.assign({}, m3)
  ];
}

export function evalRunMissions(missions, S, maxHpVal) {
  const list = Array.isArray(missions) ? missions : [];
  if (!list.length || !S) return { items: [], doneCount: 0, total: 0 };
  let doneCount = 0;
  const items = list.map(function (m) {
    let cur = 0;
    let done = false;
    if (m.id === 'maxHits') {
      cur = S.hits || 0;
      done = cur <= m.target;
    } else if (m.id === 'minHpPct') {
      cur = Math.round(((S.hp || 0) / Math.max(1, maxHpVal || 1)) * 100);
      done = cur >= m.target;
    } else if (m.id === 'multiHit') {
      cur = S.maxMultiHit || 0;
      done = cur >= m.target;
    } else if (m.id === 'combo') {
      cur = S.comboMax || 0;
      done = cur >= m.target;
    } else if (m.id === 'parry') {
      cur = S.parryOkN || 0;
      done = cur >= m.target;
    } else if (m.id === 'cleaveKill') {
      cur = S.cleaveKills || 0;
      done = cur >= m.target;
    } else if (m.id === 'kills') {
      cur = S.kills || 0;
      done = cur >= m.target;
    } else if (m.shape) {
      cur = (S.shapeKills && S.shapeKills[m.shape]) || 0;
      done = cur >= m.target;
    }
    if (done) doneCount++;
    const prog = m.id === 'maxHits'
      ? (cur + '/' + m.target + '회')
      : (m.id === 'minHpPct' ? (Math.max(0, cur) + '%') : (Math.min(cur, m.target) + '/' + m.target));
    return { id: m.id, label: m.label, cur: cur, target: m.target, done: done, prog: prog };
  });
  return { items: items, doneCount: doneCount, total: items.length };
}
