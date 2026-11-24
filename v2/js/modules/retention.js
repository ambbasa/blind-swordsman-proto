/* v2/js/modules/retention.js — 심안: 묵검 v1.21 오늘의 수련 · 7일 출석 · 막별 별 상자 · 도감 마일스톤 */

import {
  DAILY_QUESTS,
  ATTENDANCE_REWARDS,
  STAR_CHESTS,
  CODEX_MILESTONES
} from '../meta.js';
import { ACT_NAMES } from './stages.js';
import { getCosmeticSvg } from './itemArt.js';

export function ensureDailyFresh(save, dateKey) {
  save.daily = save.daily || { date: dateKey, prog: {}, claimed: {} };
  if (!save.daily.prog) save.daily.prog = {};
  if (!save.daily.claimed) save.daily.claimed = {};
  if (save.daily.date !== dateKey) {
    save.daily = { date: dateKey, prog: {}, claimed: {} };
  }
  save.attend = save.attend || { days: 0, lastDate: '' };
  save.starChests = save.starChests || {};
  save.codexClaimed = save.codexClaimed || {};
}

export function bumpDailyProgress(save, dateKey, qid, delta) {
  ensureDailyFresh(save, dateKey);
  save.daily.prog[qid] = (save.daily.prog[qid] || 0) + (delta || 1);
}

export function actStarTotalOf(save, actNo) {
  let sum = 0;
  for (let s = (actNo - 1) * 4 + 1; s <= actNo * 4; s++) {
    sum += (save.stars && save.stars[s]) || 0;
  }
  return sum;
}

export function hasClaimableRetentionOf(save, dateKey) {
  ensureDailyFresh(save, dateKey);
  if ((save.attend.days || 0) < 7 && save.attend.lastDate !== dateKey) return true;
  for (let i = 0; i < DAILY_QUESTS.length; i++) {
    const q = DAILY_QUESTS[i];
    if (!save.daily.claimed[q.id] && (save.daily.prog[q.id] || 0) >= q.goal) return true;
  }
  for (let a = 1; a <= 4; a++) {
    const st = actStarTotalOf(save, a);
    for (let j = 0; j < STAR_CHESTS.length; j++) {
      const k = a + ':' + STAR_CHESTS[j].stars;
      if (!save.starChests[k] && st >= STAR_CHESTS[j].stars) return true;
    }
  }
  return false;
}

export function claimAttendanceReward(save, dateKey) {
  ensureDailyFresh(save, dateKey);
  if (save.attend.lastDate === dateKey || (save.attend.days || 0) >= 7) return null;
  const nextDay = (save.attend.days || 0) + 1;
  const rw = ATTENDANCE_REWARDS[nextDay - 1];
  if (!rw) return null;
  save.attend.days = nextDay;
  save.attend.lastDate = dateKey;
  if (rw.coins) save.coins = (save.coins || 0) + rw.coins;
  if (rw.ink) save.ink = (save.ink || 0) + rw.ink;
  if (rw.trail) {
    if (!save.trails) save.trails = { owned: { ink: 1 }, equipped: 'ink' };
    save.trails.owned[rw.trail] = 1;
    save.trails.equipped = rw.trail;
  }
  return { day: nextDay, reward: rw };
}

export function claimDailyQuestReward(save, dateKey, qid) {
  ensureDailyFresh(save, dateKey);
  const q = DAILY_QUESTS.find((x) => x.id === qid);
  if (!q || save.daily.claimed[qid] || (save.daily.prog[qid] || 0) < q.goal) return null;
  save.daily.claimed[qid] = 1;
  save.coins = (save.coins || 0) + (q.coins || 0);
  save.ink = (save.ink || 0) + (q.ink || 0);
  return q;
}

export function claimStarChestReward(save, dateKey, actNo, reqStars) {
  ensureDailyFresh(save, dateKey);
  const key = actNo + ':' + reqStars;
  const ch = STAR_CHESTS.find((x) => x.stars === reqStars);
  if (!ch || save.starChests[key] || actStarTotalOf(save, actNo) < reqStars) return null;
  save.starChests[key] = 1;
  save.coins = (save.coins || 0) + (ch.coins || 0);
  save.ink = (save.ink || 0) + (ch.ink || 0);
  return ch;
}

export function claimCodexMilestoneReward(save, dateKey, pct, currentPct) {
  ensureDailyFresh(save, dateKey);
  const ms = CODEX_MILESTONES.find((x) => x.pct === pct);
  if (!ms || save.codexClaimed[pct] || currentPct < pct) return null;
  save.codexClaimed[pct] = 1;
  save.coins = (save.coins || 0) + (ms.coins || 0);
  save.ink = (save.ink || 0) + (ms.ink || 0);
  return ms;
}

export function renderDailyView(opts) {
  const { save, dateKey, coinsEl, inkEl, bodyEl, onClaimAttendance, onClaimQuest, onClaimChest } = opts;
  ensureDailyFresh(save, dateKey);
  if (coinsEl) coinsEl.textContent = save.coins || 0;
  if (inkEl) inkEl.textContent = save.ink || 0;
  if (!bodyEl) return;

  const attDays = save.attend.days || 0;
  const canAtt = attDays < 7 && save.attend.lastDate !== dateKey;
  const out = [];

  out.push('<div class="daily-sec"><h3>7일 출석 수련표 (' + attDays + '/7일)</h3><div class="daily-strip">');
  ATTENDANCE_REWARDS.forEach(function (rw) {
    const done = rw.day <= attDays;
    const isNext = canAtt && rw.day === attDays + 1;
    if (rw.day === 7) {
      out.push('<div class="att-day day7' + (done ? ' claimed' : '') + (isNext ? ' today' : '') + '"><div class="att7-thumb">' + getCosmeticSvg('trail', 'gold_leaf') + '</div><div><b>7일차 특별 보상</b><div>' + (done ? '수령 완료' : '전설 검기 「금박 묵선」') + '</div></div></div>');
    } else {
      out.push('<div class="att-day' + (done ? ' claimed' : '') + (isNext ? ' today' : '') + '"><b>' + rw.day + '일</b><span>' + (done ? '완료' : rw.label) + '</span></div>');
    }
  });
  out.push('</div>' + (canAtt ? '<button type="button" class="btn primary att-claim-btn" data-dact="att">오늘 출석 도장 찍기 (' + ATTENDANCE_REWARDS[attDays].label + ')</button>' : '<p class="shop-note" style="margin-top:6px">' + (attDays >= 7 ? '7일 출석 수련을 모두 마쳤습니다.' : '오늘 출석 보상을 받았습니다. 내일 이어서 받으세요.') + '</p>') + '</div>');

  out.push('<div class="daily-sec"><h3>오늘의 수련</h3>');
  DAILY_QUESTS.forEach(function (q) {
    const cur = Math.min(q.goal, save.daily.prog[q.id] || 0);
    const done = !!save.daily.claimed[q.id];
    const ready = !done && cur >= q.goal;
    out.push('<div class="daily-row"><div class="d-meta"><b>' + q.name + '</b> (' + cur + '/' + q.goal + ')<div class="d-sub">보상: ' + q.coins + '엽전 · 먹묵 ' + q.ink + '</div></div>' +
      '<button type="button" class="btn mini' + (ready ? ' primary' : '') + '" data-dact="quest" data-qid="' + q.id + '"' + (ready ? '' : ' disabled') + '>' + (done ? '수령됨' : (ready ? '받기' : '진행 중')) + '</button></div>');
  });
  out.push('</div>');

  out.push('<div class="daily-sec"><h3>막별 별 누적 상자</h3>');
  for (let a = 1; a <= 4; a++) {
    const st = actStarTotalOf(save, a);
    const btns = STAR_CHESTS.map(function (ch) {
      const key = a + ':' + ch.stars;
      const done = !!save.starChests[key];
      const ready = !done && st >= ch.stars;
      return '<button type="button" class="btn mini' + (ready ? ' primary' : '') + '" data-dact="chest" data-actno="' + a + '" data-stars="' + ch.stars + '"' + (ready ? '' : ' disabled') + '>' +
        ch.stars + '★ ' + (done ? '완료' : (ready ? '열기' : (ch.coins + '엽전'))) + '</button>';
    }).join(' ');
    out.push('<div class="daily-row chest-row"><div class="d-meta"><b>제' + a + '막 · ' + (ACT_NAMES[a] || '') + '</b> <span class="d-sub">(누적 별 ' + st + '/12★)</span></div><div class="chest-btns">' + btns + '</div></div>');
  }
  out.push('</div>');

  bodyEl.innerHTML = out.join('');
  Array.prototype.forEach.call(bodyEl.querySelectorAll('button[data-dact]'), function (b) {
    b.addEventListener('click', function () {
      const a = b.getAttribute('data-dact');
      if (a === 'att' && onClaimAttendance) onClaimAttendance();
      else if (a === 'quest' && onClaimQuest) onClaimQuest(b.getAttribute('data-qid'));
      else if (a === 'chest' && onClaimChest) onClaimChest(+b.getAttribute('data-actno'), +b.getAttribute('data-stars'));
    });
  });
}
