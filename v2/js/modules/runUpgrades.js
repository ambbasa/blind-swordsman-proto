/* v2/js/modules/runUpgrades.js — 심안: 묵검 v1.25 판 안 강화 카드 추첨·진화 레시피 판정 순수 모듈 */

import { RUN_UPGRADES, EVO_RECIPES } from './upgrades.js';

export function isElemKey(k) {
  return k === 'ice' || k === 'fire' || k === 'poison';
}

export function cardNameOfKey(k) {
  const u = RUN_UPGRADES.find((x) => x.id === k);
  return (u && u.name) || k;
}

export function rollUpgradePicks(n, upLvFn, elemLvFn, hasSecondSlot) {
  const pool = RUN_UPGRADES.filter((u) => upLvFn(u.id) < (u.maxLv || 99));
  const picks = [];
  const canElem = (u) => {
    if (!isElemKey(u.id)) return true;
    const cur = ['ice', 'fire', 'poison'].filter((k) => elemLvFn(k) > 0);
    if (cur.indexOf(u.id) >= 0) return true;
    return cur.length < (hasSecondSlot ? 2 : 1);
  };
  const valid = pool.filter(canElem);
  const src = valid.length >= n ? valid : pool;
  while (picks.length < n && src.length) {
    picks.push(src.splice(Math.floor(Math.random() * src.length), 1)[0]);
  }
  return picks;
}

export function evoPartsOf(r, upLvFn, elemLvFn) {
  const partLv = (k) => (isElemKey(k) ? elemLvFn(k) : upLvFn(k));
  const list = [];
  if (r.a && r.a.length) {
    const aLv = r.aLv || 1;
    list.push({ k: r.a[0], lv: partLv(r.a[0]), need: aLv, ok: r.a.some((k) => partLv(k) >= aLv) });
  }
  if (r.b) {
    list.push({ k: r.b, lv: partLv(r.b), need: r.bLv || 1, ok: partLv(r.b) >= (r.bLv || 1) });
  }
  return list;
}

export function evoMatInfoFor(id, S, upLvFn, elemLvFn) {
  return EVO_RECIPES.filter((r) => {
    if (S && S.evo && S.evo[r.key]) return false;
    const parts = evoPartsOf(r, upLvFn, elemLvFn);
    const mine = parts.find((p) => p.k === id);
    if (!mine) return false;
    return parts.every((p) => p === mine || p.ok);
  }).map((r) => r.name);
}

export function evoHintsFor(S, upLvFn, elemLvFn) {
  return EVO_RECIPES.filter((r) => {
    if (S && S.evo && S.evo[r.key]) return false;
    const parts = evoPartsOf(r, upLvFn, elemLvFn);
    const have = parts.filter((p) => p.ok).length;
    return have > 0 && have < parts.length;
  }).map((r) => {
    const parts = evoPartsOf(r, upLvFn, elemLvFn);
    const miss = parts.filter((p) => !p.ok).map((p) => cardNameOfKey(p.k) + (p.need > 1 ? ' Lv' + p.need : '')).join(' + ');
    return r.name + ': ' + miss + (r.bell ? ' + 종' : '');
  });
}

export function pickRecommendedId(picks, S, upLvFn, elemLvFn) {
  if (!picks || !picks.length) return null;
  const mat = picks.filter((u) => evoMatInfoFor(u.id, S, upLvFn, elemLvFn).length);
  if (mat.length) return mat[0].id;
  const fresh = picks.filter((u) => !upLvFn(u.id));
  if (fresh.length) return fresh[0].id;
  return picks[Math.floor(Math.random() * picks.length)].id;
}
