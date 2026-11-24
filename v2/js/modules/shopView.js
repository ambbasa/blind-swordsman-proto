/* v2/js/modules/shopView.js — 심안: 묵검 v1.23 상점·무구·유물·치장 UI 렌더러 모듈 */

import {
  STAT_DEFS,
  SWORDS,
  RELICS,
  COSMETIC_CLOAKS,
  COSMETIC_TRAILS,
  relicSlots,
  swordForgeLv,
  cloakOf,
  trailOf
} from '../meta.js';
import {
  getShopTabNote,
  statUpgradeCost,
  statTotalSpent,
  computeCombatPower,
  stageRecommendedPower,
  forgeCostOf
} from './economy.js';
import { getSwordSvg, getRelicSvg, getCosmeticSvg } from './itemArt.js';

export const STAT_ICONS = Object.freeze({
  atk: '<svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true"><path d="M21 5L7 19M17 5H21V9M6 16L12 22M5 23L8.5 19.5" fill="none" stroke="#ffd882" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hp: '<svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true"><path d="M14 23C14 23 5 17.2 5 10.6C5 7.4 7.5 5 10.4 5C12.2 5 13.4 5.9 14 7.1C14.6 5.9 15.8 5 17.6 5C20.5 5 23 7.4 23 10.6C23 17.2 14 23 14 23Z" fill="none" stroke="#ff7a6b" stroke-width="2" stroke-linejoin="round"/></svg>',
  gap: '<svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true"><path d="M4 14C6.8 9.2 10.2 7 14 7C17.8 7 21.2 9.2 24 14C21.2 18.8 17.8 21 14 21C10.2 21 6.8 18.8 4 14Z" fill="none" stroke="#f6cf74" stroke-width="2"/><circle cx="14" cy="14" r="3" fill="#f6cf74"/></svg>',
  poise: '<svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true"><path d="M14 4L22 7.5V14.5C22 19 18.5 22.4 14 24C9.5 22.4 6 19 6 14.5V7.5L14 4ZM12 9L15.5 13.5L12.5 16L16 20" fill="none" stroke="#8ef0d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  coin: '<svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true"><circle cx="14" cy="14" r="9.5" fill="none" stroke="#ffd874" stroke-width="2"/><rect x="10.5" y="10.5" width="7" height="7" fill="none" stroke="#ffd874" stroke-width="1.8"/></svg>'
});

export function renderShopOverview(opts) {
  const {
    save,
    cfg,
    curStage,
    statUnlocked,
    atkBonus,
    gapBonus,
    poiseBonus,
    elById,
    renderTab
  } = opts;

  const coinsEl = elById('shopCoins');
  if (coinsEl) coinsEl.textContent = save.coins || 0;
  const inkEl = elById('shopInk');
  if (inkEl) inkEl.textContent = save.ink || 0;

  const pwEl = elById('shopPower');
  if (pwEl) {
    const myPw = computeCombatPower(save);
    const recPw = stageRecommendedPower(curStage);
    const ratio = myPw / Math.max(1, recPw);
    const cls = ratio >= 1.05 ? 'ok' : (ratio >= 0.85 ? 'warn' : 'hard');
    const tag = ratio >= 1.05 ? '여유' : (ratio >= 0.85 ? '적정' : '도전');
    pwEl.innerHTML = '<span>현재 전투력 <b>' + myPw + '</b> · ' + curStage + '장 권장 <b>' + recPw + '</b></span><span class="pw-badge ' + cls + '">' + tag + '</span>';
  }

  if (renderTab) {
    try { renderTab(); } catch (_) {}
  }

  function label(btn, def, desc) {
    if (!btn || !def) return;
    const lv = save[def.key] || 0;
    const open = statUnlocked(def);
    const c = statUpgradeCost(lv, cfg);
    const max = lv >= def.maxLv;
    const pct = Math.min(100, Math.round((lv / Math.max(1, def.maxLv)) * 100));
    const can = open && !max && (save.coins || 0) >= c;
    btn.disabled = !can;
    btn.classList.toggle('locked', !open);
    btn.classList.toggle('maxed', max);
    btn.classList.add('stat-card-v76');
    const pill = max ? '<span class="stat-pill maxed">최대</span>'
      : (!open ? '<span class="stat-pill lock">' + def.unlockStage + '장 해금</span>'
        : '<span class="stat-pill' + (can ? ' can' : '') + '">' + c.toLocaleString() + '엽전</span>');
    btn.innerHTML =
      '<div class="stat-ico">' + (STAT_ICONS[def.id] || '') + '</div>' +
      '<div class="stat-main">' +
        '<div class="stat-head"><b>' + def.name + '</b><span class="stat-lv">Lv ' + lv + '/' + def.maxLv + '</span></div>' +
        '<div class="stat-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="stat-desc">' + desc + '</div>' +
      '</div>' +
      pill;
  }

  const byId = (id) => STAT_DEFS.find((d) => d.id === id);
  label(elById('buyAtk'), byId('atk'), '일섬 기본 피해 +' + Math.round(atkBonus() * 100) + '%');
  label(elById('buyHp'), byId('hp'), '최대 체력 ' + (cfg.hpBase + (save.hpLv || 0) * cfg.hpStep));
  label(elById('buyGap'), byId('gap'), '보스 빈틈·그로기 피해 +' + Math.round(gapBonus() * 100) + '%');
  label(elById('buyPoise'), byId('poise'), '보스 자세 깎기 효율 +' + Math.round(poiseBonus() * 100) + '%');
  label(elById('buyCoin'), byId('coin'), '전투 엽전 획득 ×' + (1 + (save.coinLv || 0) * cfg.coinStep).toFixed(2));

  const rBtn = elById('btnStatReset');
  if (rBtn) {
    const spent = statTotalSpent(save, cfg);
    rBtn.disabled = spent <= 0;
    rBtn.textContent = spent > 0 ? ('기량 초기화 (엽전 +' + spent + ' 전액 환불)') : '기량 초기화 (투자된 엽전 없음)';
  }
}

export function renderShopTabView(opts) {
  const {
    save,
    shopTab,
    tabsEl,
    statListEl,
    bodyEl,
    noteEl,
    swordBlueprint,
    relicOn,
    onBuySword,
    onEquipSword,
    onForgeSword,
    onBuyRelic,
    onToggleRelic
  } = opts;

  const activeTab = shopTab === 'skin' ? 'stat' : shopTab;
  if (tabsEl) {
    Array.prototype.forEach.call(tabsEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === activeTab);
    });
  }
  if (noteEl) noteEl.textContent = getShopTabNote(activeTab);
  if (statListEl) statListEl.hidden = activeTab !== 'stat';
  if (!bodyEl) return;
  bodyEl.hidden = activeTab === 'stat';
  if (activeTab === 'stat') { bodyEl.innerHTML = ''; return; }

  const rows = [];
  const coins = save.coins || 0;
  const ink = save.ink || 0;

  if (activeTab === 'sword') {
    SWORDS.forEach(function (s) {
      const owned = !!save.swords.owned[s.id];
      const eq = save.swords.equipped === s.id;
      const open = swordBlueprint(s.unlock);
      const flv = swordForgeLv(save, s.id);
      const fc = owned ? forgeCostOf(flv) : null;
      const canBuy = !owned && open && coins >= s.price;
      const canForge = !!(owned && fc && coins >= fc.coins && ink >= fc.ink);
      const pips = owned ? '<span class="forge-pips">' + [1, 2, 3].map(function (n) { return '<i class="' + (flv >= n ? 'on' : '') + '"></i>'; }).join('') + '</span>' : '';
      let actions = '';
      if (!owned) {
        actions = '<button type="button" class="btn mini" data-act="buy-sword" data-id="' + s.id + '"' + (canBuy ? '' : ' disabled') + '>' +
          (open ? (s.price + '엽전 제작') : (s.unlock + '장 클리어 도면')) + '</button>';
      } else {
        actions = '<button type="button" class="btn mini' + (eq ? ' primary' : '') + '" data-act="equip-sword" data-id="' + s.id + '">' + (eq ? '장착 중' : '장착') + '</button>';
        if (fc) {
          actions += '<button type="button" class="btn mini" data-act="forge-sword" data-id="' + s.id + '"' + (canForge ? '' : ' disabled') + '>벼림 +' + (flv + 1) + ' (' + fc.coins + '엽전·먹묵' + fc.ink + ')</button>';
        } else {
          actions += '<span class="meta-price">벼림 완료</span>';
        }
      }
      rows.push('<div class="meta-card' + (owned ? ' owned' : '') + (eq ? ' equipped' : '') + (open ? '' : ' locked') + '">' +
        '<div class="meta-art">' + getSwordSvg(s.id) + '</div>' +
        '<div class="meta-info"><div class="meta-top"><b>' + s.name + pips + '</b><span class="meta-price">' + (owned ? (flv > 0 ? '+' + flv + '강' : '보유') : (open ? s.price + '엽전' : '잠김')) + '</span></div>' +
        '<div class="meta-desc">' + s.desc + '</div><div class="meta-actions">' + actions + '</div></div></div>');
    });
  } else if (activeTab === 'relic') {
    const slots = relicSlots(save);
    const eqN = (save.relics.equipped || []).length;
    rows.push('<div class="slot-banner">장착 칸: <b>' + eqN + '/' + slots + '</b>' + (slots < 2 ? ' · 8장 클리어 시 2칸 해금' : ' · 최대 2칸 해금 완료') + '</div>');
    RELICS.forEach(function (r) {
      const owned = !!save.relics.owned[r.id];
      const eq = relicOn(save, r.id);
      const open = !r.unlock || swordBlueprint(r.unlock);
      const can = !owned && open && coins >= r.price;
      const mx = r.mutex ? '<span class="mutex-tag">상호배타</span>' : '';
      const actBtn = owned
        ? '<button type="button" class="btn mini' + (eq ? ' primary' : '') + '" data-act="equip-relic" data-id="' + r.id + '">' + (eq ? '장착 해제' : '장착') + '</button>'
        : '<button type="button" class="btn mini" data-act="buy-relic" data-id="' + r.id + '"' + (can ? '' : ' disabled') + '>' + (open ? (r.price + '엽전 구매') : (r.unlock + '장 클리어 해금')) + '</button>';
      rows.push('<div class="meta-card' + (owned ? ' owned' : '') + (eq ? ' equipped' : '') + (open ? '' : ' locked') + '">' +
        '<div class="meta-art">' + getRelicSvg(r.id) + '</div>' +
        '<div class="meta-info"><div class="meta-top"><b>' + r.name + mx + '</b><span class="meta-price">' + (owned ? (eq ? '장착됨' : '보유') : (open ? r.price + '엽전' : '잠김')) + '</span></div>' +
        '<div class="meta-desc">' + r.desc + '</div><div class="meta-actions">' + actBtn + '</div></div></div>');
    });
  }

  bodyEl.innerHTML = rows.join('');
  Array.prototype.forEach.call(bodyEl.querySelectorAll('button[data-act]'), function (b) {
    b.addEventListener('click', function () {
      const act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
      if (act === 'buy-sword' && onBuySword) onBuySword(id);
      else if (act === 'equip-sword' && onEquipSword) onEquipSword(id);
      else if (act === 'forge-sword' && onForgeSword) onForgeSword(id);
      else if (act === 'buy-relic' && onBuyRelic) onBuyRelic(id);
      else if (act === 'equip-relic' && onToggleRelic) onToggleRelic(id);
    });
  });
}

export function renderCosmeticView(opts) {
  const { save, cosTab, coinsEl, eqEl, tabsEl, gridEl, onBuyCosmetic } = opts;
  if (coinsEl) coinsEl.textContent = save.coins || 0;
  if (eqEl) eqEl.textContent = cloakOf(save).name + ' · ' + trailOf(save).name;
  if (tabsEl) {
    Array.prototype.forEach.call(tabsEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-ctab') === cosTab);
    });
  }
  if (!gridEl) return;
  const list = cosTab === 'trail' ? COSMETIC_TRAILS : COSMETIC_CLOAKS;
  const box = cosTab === 'trail' ? (save.trails || { owned: { ink: 1 }, equipped: 'ink' })
    : (save.cloaks || { owned: { ink: 1 }, equipped: 'ink' });
  const rarCls = { '기본': 'common', '희귀': 'rare', '영웅': 'epic', '전설': 'legend' };
  const coins = save.coins || 0;

  gridEl.innerHTML = list.map(function (it) {
    const owned = !!(box.owned && box.owned[it.id]);
    const eq = box.equipped === it.id;
    const rc = rarCls[it.rarity] || 'common';
    let foot = '';
    if (eq) foot = '<span class="state-eq">착용 중</span><span>3D 반영</span>';
    else if (owned) foot = '<span class="state-own">보유 중</span><span>터치해 착용</span>';
    else if (it.eventOnly) foot = '<span class="state-lock">7일 출석 무료</span><span>수련표</span>';
    else foot = '<span class="' + (coins >= it.price ? 'state-buy' : 'state-lock') + '">' + it.price + '엽전</span><span>' + (coins >= it.price ? '즉시 구매' : '엽전 부족') + '</span>';
    return '<button type="button" class="cos-tile rar-' + rc + (eq ? ' equipped' : '') + '" data-ckind="' + cosTab + '" data-cid="' + it.id + '">' +
      '<div class="cos-art">' + getCosmeticSvg(cosTab, it.id) + '</div>' +
      '<span class="cos-rar ' + rc + '">' + it.rarity + '</span>' +
      '<div class="cos-name">' + it.name + '</div>' +
      '<div class="cos-desc">' + it.desc + '</div>' +
      '<div class="cos-foot">' + foot + '</div></button>';
  }).join('');

  Array.prototype.forEach.call(gridEl.querySelectorAll('button[data-cid]'), function (b) {
    b.addEventListener('click', function () {
      if (onBuyCosmetic) onBuyCosmetic(b.getAttribute('data-ckind'), b.getAttribute('data-cid'));
    });
  });
}
