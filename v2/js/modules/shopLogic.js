/* v2/js/modules/shopLogic.js — 심안: 묵검 v1.26 무구·유물·치장 구매/장착/벼림 로직 */

export function createShopLogic(rt) {
  const $ = rt.$;
function swordBlueprint(stageNo) { return !stageNo || ((rt.save.stars || {})[stageNo] || 0) > 0; }
function buySword(id) {
  const sw = rt.SWORDS.filter(function (s) { return s.id === id; })[0];
  if (!sw || rt.save.swords.owned[id] || !swordBlueprint(sw.unlock) || (rt.save.coins || 0) < sw.price) return false;
  rt.save.coins -= sw.price; rt.save.swords.owned[id] = 1;
  rt.save.swords.forge = rt.save.swords.forge || {};
  rt.save.swords.equipped = id;
  rt.persist(); rt.refreshShop(); rt.renderHud(); rt.syncHeroCosmetic3D();
  rt.toast('무구 · ' + sw.name + ' 제작 및 장착 완료');
  rt.telemetry.event('meta_buy', { kind: 'sword', id: id, price: sw.price });
  return true;
}
function equipSword(id) {
  if (!rt.save.swords.owned[id]) return false;
  rt.save.swords.equipped = id; rt.persist(); rt.refreshShop(); rt.syncHeroCosmetic3D();
  rt.toast('무구 · ' + rt.swordOf(rt.save).name + ' 장착');
  return true;
}
function forgeSword(id) {
  if (!rt.save.swords.owned[id]) return false;
  const lv = rt.swordForgeLv(rt.save, id);
  const fc = rt.forgeCostOf(lv);
  if (!fc) { rt.toast('이미 최고 벼림(3단)입니다'); return false; }
  if ((rt.save.coins || 0) < fc.coins || (rt.save.ink || 0) < fc.ink) {
    rt.toast('재화가 부족합니다 (엽전 ' + fc.coins + ' · 먹묵 ' + fc.ink + ')');
    return false;
  }
  rt.save.coins -= fc.coins;
  rt.save.ink -= fc.ink;
  rt.save.swords.forge = rt.save.swords.forge || {};
  rt.save.swords.forge[id] = lv + 1;
  rt.persist(); rt.refreshShop(); rt.renderHud(); rt.syncHeroCosmetic3D();
  const sw = rt.SWORDS.filter(function (s) { return s.id === id; })[0];
  rt.toast((sw ? sw.name : '무구') + ' 벼림 +' + (lv + 1) + ' 성공!');
  rt.telemetry.event('sword_forge', { id: id, lv: lv + 1, coins: fc.coins, ink: fc.ink });
  return true;
}
function buyRelic(id) {
  const r = rt.RELICS.filter(function (x) { return x.id === id; })[0];
  if (!r || rt.save.relics.owned[id]) return false;
  if (r.unlock && !swordBlueprint(r.unlock)) { rt.toast(r.unlock + '장 첫 클리어로 해금됩니다'); return false; }
  if ((rt.save.coins || 0) < r.price) return false;
  rt.save.coins -= r.price; rt.save.relics.owned[id] = 1; rt.persist(); rt.refreshShop(); rt.renderHud();
  rt.toast('유물 · ' + r.name + '을 얻었습니다');
  rt.telemetry.event('meta_buy', { kind: 'relic', id: id, price: r.price });
  return true;
}
function toggleRelic(id) {
  if (!rt.save.relics.owned[id]) return false;
  const r = rt.RELICS.filter(function (x) { return x.id === id; })[0];
  let eq = (rt.save.relics.equipped || []).slice();
  const i = eq.indexOf(id);
  if (i >= 0) {
    eq.splice(i, 1);
  } else {
    if (r && r.mutex) {
      eq = eq.filter(function (x) { return x !== r.mutex; });
    }
    eq.push(id);
    const slots = rt.relicSlots(rt.save);
    while (eq.length > slots) eq.shift();
  }
  rt.save.relics.equipped = eq; rt.persist(); rt.refreshShop(); rt.renderHud();
  return true;
}
function buyCosmetic(kind, id) {
  const list = kind === 'trail' ? rt.COSMETIC_TRAILS : rt.COSMETIC_CLOAKS;
  const it = list.filter(function (x) { return x.id === id; })[0];
  if (!it) return false;
  if (!rt.save.cloaks) rt.save.cloaks = { owned: { ink: 1 }, equipped: 'ink' };
  if (!rt.save.trails) rt.save.trails = { owned: { ink: 1 }, equipped: 'ink' };
  const box = kind === 'trail' ? rt.save.trails : rt.save.cloaks;
  if (box.owned[id]) return equipCosmetic(kind, id);
  if ((rt.save.coins || 0) < it.price) { rt.toast('엽전이 부족합니다'); return false; }
  rt.save.coins -= it.price;
  box.owned[id] = 1;
  box.equipped = id;
  rt.persist(); renderCosmeticOverlay(); rt.renderHud(); rt.syncHeroCosmetic3D();
  rt.toast('치장 · ' + it.name + ' 획득 및 착용!');
  rt.telemetry.event('cosmetic_buy', { kind: kind, id: id, price: it.price });
  return true;
}
function equipCosmetic(kind, id) {
  if (!rt.save.cloaks) rt.save.cloaks = { owned: { ink: 1 }, equipped: 'ink' };
  if (!rt.save.trails) rt.save.trails = { owned: { ink: 1 }, equipped: 'ink' };
  const box = kind === 'trail' ? rt.save.trails : rt.save.cloaks;
  if (!box.owned[id]) return false;
  box.equipped = id;
  rt.persist(); renderCosmeticOverlay(); rt.syncHeroCosmetic3D();
  const it = kind === 'trail' ? rt.trailOf(rt.save) : rt.cloakOf(rt.save);
  rt.toast((kind === 'trail' ? '검기 · ' : '도포 · ') + it.name + ' 착용');
  return true;
}
function renderShopTab() {
  rt.renderShopTabView({
    save: rt.save,
    shopTab: rt.shopTab,
    tabsEl: $('shopTabs'),
    statListEl: $('shopStatList'),
    bodyEl: $('shopBody'),
    noteEl: $('shopNote') || document.querySelector('#ov-shop .shop-note'),
    swordBlueprint: swordBlueprint,
    relicOn: rt.relicOn,
    onBuySword: buySword,
    onEquipSword: equipSword,
    onForgeSword: forgeSword,
    onBuyRelic: buyRelic,
    onToggleRelic: toggleRelic
  });
}
function renderCosmeticOverlay() {
  rt.renderCosmeticView({
    save: rt.save,
    cosTab: rt.cosTab,
    coinsEl: $('cosCoins'),
    eqEl: $('cosEquippedSummary'),
    tabsEl: $('cosTabs'),
    gridEl: $('cosmeticGrid'),
    onBuyCosmetic: buyCosmetic
  });
}

/* ---------- v0.70 리텐션: 오늘의 수련 · 7일 출석 · 막별 별 상자 · 도감 마일스톤 ---------- */
/* 리텐션 핵심 로직(출석·일일수련·막별 별상자·도감 마일스톤)은 modules/retention.js로 분리 */
  return { buyCosmetic, buyRelic, buySword, equipCosmetic, equipSword, renderCosmeticOverlay, renderShopTab, toggleRelic };
}
