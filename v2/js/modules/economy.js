/**
 * v2/js/modules/economy.js
 * 심안(SIMAN) v0.49 — 상점 탭 문구, 스탯 업그레이드 비용, 방치 보상 순수 계산 모듈.
 *
 * 실제 game.js 세이브 스키마(save.coins, save.atkLv, save.hpLv, save.coinLv, save.lastSeen)와
 * 100% 호환되도록 설계되었습니다.
 */

export const SHOP_TAB_NOTES = Object.freeze({
  stat: '전투로 모은 엽전으로 기본 기량(공격력·체력·엽전 획득)을 단련합니다. 현금으로 능력치를 팔지 않습니다.',
  sword: '각 장을 처음 돌파해 도면을 열고, 고유한 일섬·콤보 효과를 지닌 무구를 제작·장착합니다.',
  relic: '전투 규칙과 심안 감각을 바꾸는 유물입니다. 조합에 따라 공략 흐름이 달라집니다.',
  skin: '외형·붓 자국은 능력치 변화 없는 순수 꾸미기·편의 항목입니다.'
});

export function getShopTabNote(tabKey) {
  return SHOP_TAB_NOTES[tabKey] || SHOP_TAB_NOTES.stat;
}

/**
 * 스탯 업그레이드 비용 계산 (기존 costOf와 호환).
 */
export function statUpgradeCost(lv, cfg = {}) {
  const base = Number(cfg.upgradeBase ?? 20);
  const safeLv = Math.max(0, Math.floor(Number(lv || 0)));
  return base * (safeLv + 1);
}

/**
 * 경과 시간(ms) 기반 방치 보상 계산.
 * 기존 save.coinLv 배율을 반영하되, 방치 역전을 막기 위해 idleCoinMultCap(기본 2.0)으로 상한을 둡니다.
 */
export function computeIdleCoins(elapsedMs, saveObj = {}, cfg = {}) {
  const maxHours = Number(cfg.idleMaxHours ?? 6);
  const perMin = Number(cfg.idlePerMin ?? 1);
  const coinStep = Number(cfg.coinStep ?? 0.18);
  const multCap = Number(cfg.idleCoinMultCap ?? 2.0);
  const capMs = maxHours * 3600 * 1000;
  const clampedMs = Math.min(Math.max(0, Number(elapsedMs || 0)), capMs);
  const coinLv = Math.max(0, Number(saveObj?.coinLv || 0));
  const mult = Math.min(multCap, 1 + coinLv * coinStep);
  return Math.floor((clampedMs / 60000) * perMin * mult);
}

/**
 * 스탯 업그레이드 구매(실제 save.atkLv / save.hpLv / save.coinLv 스키마 갱신).
 */
export function purchaseStatUpgrade(saveObj, stat, cfg = {}) {
  const key = stat === 'atk' ? 'atkLv' : stat === 'hp' ? 'hpLv' : stat === 'coin' ? 'coinLv' : null;
  if (!key || !saveObj) return { ok: false, reason: 'invalid_stat' };
  const maxLv = Number(cfg.maxLv ?? 10);
  const lv = Math.max(0, Number(saveObj[key] || 0));
  if (lv >= maxLv) return { ok: false, reason: 'max_level', lv };
  const cost = statUpgradeCost(lv, cfg);
  const coins = Number(saveObj.coins || 0);
  if (coins < cost) return { ok: false, reason: 'insufficient_coins', cost, coins };
  saveObj.coins = coins - cost;
  saveObj[key] = lv + 1;
  return { ok: true, key, lv: saveObj[key], cost, coins: saveObj.coins };
}

/**
 * 방치 보상 안내 문구(미구현 광고 플레이스홀더 대체).
 */
export function getIdleNotice(cfg = {}) {
  const maxHours = Number(cfg.idleMaxHours ?? 6);
  return '자리를 비운 동안 최대 ' + maxHours + '시간까지 엽전이 쌓입니다.';
}
