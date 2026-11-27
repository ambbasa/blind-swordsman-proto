/* v2/js/modules/levelUpUi.js — v1.54 엠버 앤 블레이드식 레벨업 메달리온 · 빛기둥 · 전후비교 · 합성 · 보유슬롯 UI 모듈 */
import { RUN_UPGRADES, EVO_RECIPES } from './upgrades.js';
import { animateLevelCards, animateOrbFocus, animateCardPick } from './uiMotion.js?v=v168';

const MEDALLION_MAP = {
  dmg:     { img: 'med_sword',     accent: '#5ce8b8', glow: 'rgba(92,232,184,0.45)',  tag: '검술' },
  width:   { img: 'med_sword',     accent: '#5ce8b8', glow: 'rgba(92,232,184,0.45)',  tag: '검술' },
  dash:    { img: 'med_sword',     accent: '#6ae8d8', glow: 'rgba(106,232,216,0.45)', tag: '연쇄' },
  echo:    { img: 'med_sword',     accent: '#78e0c8', glow: 'rgba(120,224,200,0.45)', tag: '잔영' },
  counter: { img: 'med_sword',     accent: '#82f0c8', glow: 'rgba(130,240,200,0.45)', tag: '반격' },
  fire:    { img: 'med_fire',      accent: '#ff7a38', glow: 'rgba(255,122,56,0.52)',  tag: '화염' },
  ice:     { img: 'med_ice',       accent: '#52dcff', glow: 'rgba(82,220,255,0.50)',  tag: '빙결' },
  poison:  { img: 'med_poison',    accent: '#5ce072', glow: 'rgba(92,224,114,0.48)',  tag: '독무' },
  bolt:    { img: 'med_lightning', accent: '#c46eff', glow: 'rgba(196,110,255,0.52)', tag: '뇌전' },
  charge:  { img: 'med_lightning', accent: '#c46eff', glow: 'rgba(196,110,255,0.48)', tag: '참격' },
  perfect: { img: 'med_bell',      accent: '#ffd25a', glow: 'rgba(255,210,90,0.50)',  tag: '정밀' },
  reson:   { img: 'med_bell',      accent: '#ffd25a', glow: 'rgba(255,210,90,0.50)',  tag: '공명' },
  ring:    { img: 'med_bell',      accent: '#f0c868', glow: 'rgba(240,200,104,0.45)', tag: '심안' },
  parry:   { img: 'med_ward',      accent: '#78b8ff', glow: 'rgba(120,184,255,0.48)', tag: '패링' },
  ward:    { img: 'med_ward',      accent: '#78b8ff', glow: 'rgba(120,184,255,0.48)', tag: '호신' },
  heal:    { img: 'med_fire',      accent: '#ff6e58', glow: 'rgba(255,110,88,0.45)',  tag: '회복' },
  inkstep: { img: 'med_ward',      accent: '#8aa8d8', glow: 'rgba(138,168,216,0.42)', tag: '먹길' }
};

export function medallionMeta(id) {
  return MEDALLION_MAP[id] || MEDALLION_MAP.ring;
}

export function medallionUrl(id) {
  return 'assets/medallions/' + medallionMeta(id).img + '.webp?v=v168';
}

function highlightNumbers(str) {
  return String(str).replace(/([+×]?\d+(?:\.\d+)?(?:%|초|m|회|중첩|개|배|\/\d+)?)/g, '<em class="eb-num">$1</em>');
}

export function createLevelUpUi(deps) {
  const { $, rt, upLv, evoParts, evoMatInfo, cardNameOf, rollPicks, renderEvoHint, pickUpgrade, elemScale, fmt1 } = deps;

  function upDescAt(u, lv) {
    if (lv <= 0) return u.desc;
    if (u.id === 'ring') return '심안(먹안개) 반경이 Lv' + Math.min(rt.CFG.ringLvMax || 3, lv) + ' 단계로 넓어집니다.';
    if (u.id === 'ice') return '적 이동·공격을 ' + fmt1(elemScale(rt.CFG.iceDur || 2.5, rt.CFG.iceDurStep || 0.5, lv)) + '초 빙결하고 파열 시 +' + fmt1(elemScale(rt.CFG.shatterDmg || 4, rt.CFG.shatterStep || 1, lv)) + ' 피해를 입힙니다.';
    if (u.id === 'fire') return '일섬 명중 즉시 화염 폭발로 +' + rt.fireImpact(lv) + ' 추가 피해를 입힙니다.';
    if (u.id === 'poison') return '독 최대 ' + Math.round(elemScale(rt.CFG.poisonMax || 5, rt.CFG.poisonMaxStep || 1, lv)) + '중첩 · 사망 시 반경 ' + fmt1(elemScale(rt.CFG.poisonCloudR || 2, rt.CFG.cloudRStep || 0.6, lv)) + 'm 독구름을 퍼뜨립니다.';
    if (u.id === 'perfect') return '획 정확도 ' + Math.round(((rt.CFG.perfectThresh || 0.8) - (rt.CFG.perfectThreshStep || 0.05) * (lv - 1)) * 100) + '% 이상이면 피해 ×' + fmt1((rt.CFG.perfectDmgMul || 1.5) + (rt.CFG.perfectStep || 0.15) * (lv - 1)) + ' 배.';
    if (u.id === 'parry') return '패링 반경 ' + fmt1((rt.CFG.parryR || 2.4) + (rt.CFG.parryAwakenR || 0.45) * lv) + 'm · 충격파 +' + fmt1((rt.CFG.parryDmg || 0.5) + (rt.CFG.parryAwakenDmg || 0.4) * lv) + ' · 참 +' + Math.round((rt.CFG.parryAwakenCharge || 14) * lv) + '.';
    if (u.id === 'dmg') {
      const baseD = rt.S.dashDmg;
      const st = (u.steps || [1])[Math.min((u.steps || [1]).length - 1, upLv('dmg'))];
      const val = lv > upLv('dmg') ? baseD + st : baseD;
      return '일섬 기본 피해량 ' + fmt1(val) + ' 로 적을 벱니다.';
    }
    if (u.id === 'width') {
      const val = lv > upLv('width') ? rt.S.pathR + 0.55 : rt.S.pathR;
      return '일섬 베기 폭이 ' + fmt1(val) + 'm 로 넓어져 다수를 스칩니다.';
    }
    if (u.id === 'dash') {
      const val = lv > upLv('dash') ? rt.S.dashCount + 1 : rt.S.dashCount;
      return '같은 무늬 혼령으로 최대 ' + val + '회 연속 돌진합니다.';
    }
    if (u.id === 'charge') return '참 필살기 게이지 획득량이 +' + Math.round(25 * lv) + '% 증가합니다.';
    if (u.id === 'heal') return '체력 +5 회복 · 최대 체력 +2 증가 (' + Math.min(3, (rt.S.healMaxN || 0) + (lv > upLv('heal') ? 1 : 0)) + '/3).';
    if (u.id === 'ward') return '호신부 ' + (lv >= 3 ? (rt.CFG.ward.n3 || 4) : (rt.CFG.ward.n || 2)) + '개가 반경 ' + fmt1(lv >= 2 ? (rt.CFG.ward.r2 || 2.6) : (rt.CFG.ward.r || 2.2)) + 'm를 돌며 접촉 ' + fmt1(rt.CFG.ward.dmg || 0.8) + ' 피해.';
    if (u.id === 'bolt') return fmt1(Math.max(2.5, (rt.CFG.boltCard.every || 4.5) - (rt.CFG.boltCard.lvStep || 0.4) * (lv - 1))) + '초마다 무리 한가운데 벼락을 내려 +' + fmt1(rt.CFG.boltCard.dmg || 2.2) + ' 피해.';
    if (u.id === 'echo') {
      const m = (rt.CFG.echoCard.mul || [0.4, 0.55, 0.7])[Math.min(2, Math.max(0, lv - 1))];
      return '일섬 ' + rt.CFG.echoCard.delay + '초 뒤 같은 경로에 ' + Math.round(m * 100) + '% 잔영 피해.';
    }
    if (u.id === 'reson') {
      const d = (rt.CFG.resonCard.dmg || [0.5, 0.8, 1.1])[Math.min(2, Math.max(0, lv - 1))];
      return '혼령이 붙는 순간 공명 파동으로 +' + fmt1(d) + ' 피해.';
    }
    if (u.id === 'counter') return lv >= 2 ? '완벽 패링 시 자동 일섬 피해 ×1.5 · 참 +6.' : '완벽 패링 성공 시 가까운 혼령으로 자동 일섬 1회.';
    if (u.id === 'inkstep') {
      const sl = (rt.CFG.inkStep.slow || [0.3, 0.4, 0.5])[Math.min(2, Math.max(0, lv - 1))];
      return '착지 지점에 2초 먹 웅덩이를 남겨 적을 ' + Math.round(sl * 100) + '% 감속.';
    }
    return u.desc;
  }

  function recipesForUpgrade(id) {
    const out = [];
    for (let i = 0; i < EVO_RECIPES.length; i++) {
      const r = EVO_RECIPES[i];
      if (rt.S && rt.S.evo && rt.S.evo[r.key]) continue;
      const parts = evoParts(r);
      let hasMe = false;
      for (let j = 0; j < parts.length; j++) if (parts[j].k === id) hasMe = true;
      if (!hasMe) continue;
      const desc = parts.map(function (p) {
        const ok = p.have >= p.need;
        return '<span class="eb-part' + (ok ? ' ok' : '') + '">' + cardNameOf(p.k) + ' Lv' + p.need + (ok ? ' ✓' : '') + '</span>';
      }).join(' <span class="eb-plus">+</span> ');
      out.push('<div class="eb-evo-item"><span class="eb-evo-badge">합성 진화</span> ' + desc + ' <span class="eb-plus">→</span> <strong class="eb-evo-name">' + r.name + '</strong></div>');
    }
    return out;
  }

  function renderOwnedBar() {
    const bar = $('levelOwned');
    if (!bar || !rt.S) return;
    const owned = [];
    for (let i = 0; i < RUN_UPGRADES.length; i++) {
      const u = RUN_UPGRADES[i];
      const lv = upLv(u.id);
      if (lv > 0) owned.push({ u: u, lv: lv });
    }
    let html = '<div class="eb-owned-orbs">';
    const showSlots = Math.max(6, owned.length);
    for (let i = 0; i < showSlots; i++) {
      if (i < owned.length) {
        const it = owned[i];
        const meta = medallionMeta(it.u.id);
        html += '<div class="eb-mini-orb" style="--orb-accent:' + meta.accent + '" title="' + it.u.name + ' Lv' + it.lv + '">'
          + '<img src="' + medallionUrl(it.u.id) + '" alt="' + it.u.name + '" width="30" height="30">'
          + '<span>' + it.lv + '</span></div>';
      } else {
        html += '<div class="eb-mini-orb empty"></div>';
      }
    }
    html += '</div><div class="eb-owned-evos">';
    const evos = Object.keys((rt.S && rt.S.evo) || {}).filter(function (k) { return rt.S.evo[k]; });
    for (let i = 0; i < 3; i++) {
      if (i < evos.length) {
        const rec = EVO_RECIPES.filter(function (r) { return r.key === evos[i]; })[0];
        html += '<div class="eb-evo-slot on" title="' + ((rec && rec.name) || evos[i]) + '">✦</div>';
      } else {
        html += '<div class="eb-evo-slot"></div>';
      }
    }
    html += '</div>';
    bar.innerHTML = html;
  }

  function openLevelUp() {
    if (rt.S && rt.S.cleaveFx > 0.05) { rt.S._cleaveLv = (rt.S._cleaveLv || 0) + 1; return; }
    if (!rt.S) return;
    rt.S.upLv = rt.S.upLv || {};
    rt.S.levelUps = (rt.S.levelUps || 0) + 1;
    if (rt.S.paused === 'levelup') { rt.S._pendingLv = (rt.S._pendingLv || 0) + 1; return; }
    rt.S.paused = 'levelup';
    rt.S.levelPicks = rollPicks(3);

    const rem = (rt.S._pendingLv || 0) + 1;
    const isCharm = (rt.S._charmLv || 0) > 0;
    const kEl = $('levelKicker');
    if (kEl) {
      if (isCharm) kEl.textContent = '부적 상자 보너스 · 남은 선택 ' + rem + '회';
      else if (rem > 1) kEl.textContent = '심안 각성 · Lv ' + rt.S.level + ' · 남은 선택 ' + rem + '회';
      else kEl.textContent = '심안 각성 · Lv ' + rt.S.level;
    }

    const boxEl = $('levelChoices');
    const detailEl = $('levelDetail');
    const confirmBtn = $('btnLevelConfirm');
    boxEl.innerHTML = '';
    const orbBtns = [];
    let selectedIdx = 0;
    let pickedLock = false;

    for (let i = 0; i < rt.S.levelPicks.length; i++) {
      if (evoMatInfo(rt.S.levelPicks[i].id).length) { selectedIdx = i; break; }
    }

    function renderDetail(idx, animateSwitch) {
      selectedIdx = idx;
      const u = rt.S.levelPicks[idx];
      if (!u) return;
      const meta = medallionMeta(u.id);
      const lv = upLv(u.id);
      const nextLv = Math.min(u.maxLv || 99, lv + 1);
      for (let i = 0; i < orbBtns.length; i++) {
        orbBtns[i].classList.toggle('active', i === idx);
      }
      if (detailEl) detailEl.style.setProperty('--orb-accent', meta.accent);
      const tEl = $('levelTitle');
      const lvEl = $('levelLvPill');
      const curL = $('ebCurLabel');
      const curD = $('ebCurDesc');
      const nxtL = $('ebNextLabel');
      const nxtD = $('ebNextDesc');
      const evoRow = $('levelEvoRow');
      if (tEl) tEl.textContent = u.name;
      if (lvEl) {
        lvEl.textContent = lv ? ('Lv ' + lv + ' → Lv ' + nextLv) : '신규 각인';
        lvEl.className = 'eb-lv-pill' + (lv ? '' : ' new');
      }
      if (curL) curL.textContent = lv ? ('현재 Lv ' + lv) : '미보유 · 기본 효과';
      if (curD) curD.innerHTML = highlightNumbers(upDescAt(u, lv));
      if (nxtL) nxtL.textContent = '강화 Lv ' + nextLv;
      if (nxtD) nxtD.innerHTML = highlightNumbers(upDescAt(u, nextLv));
      if (evoRow) {
        const recs = recipesForUpgrade(u.id);
        if (recs.length) {
          evoRow.hidden = false;
          evoRow.innerHTML = recs.slice(0, 2).join('');
        } else {
          evoRow.hidden = true;
          evoRow.innerHTML = '';
        }
      }
      if (confirmBtn) {
        confirmBtn.dataset.up = u.id;
        confirmBtn.textContent = u.name + ' 각인 확정';
      }
      if (animateSwitch) animateOrbFocus(orbBtns[idx], detailEl);
    }

    function confirmSelection() {
      if (pickedLock) return;
      const u = rt.S.levelPicks[selectedIdx];
      if (!u) return;
      pickedLock = true;
      const skip = !!(rt.qa && (rt.qa.noDelay || rt.qa.autoStroke));
      animateCardPick(orbBtns[selectedIdx], orbBtns, function () { pickUpgrade(u.id); }, skip);
    }

    rt.S.levelPicks.forEach(function (u, idx) {
      const meta = medallionMeta(u.id);
      const lv = upLv(u.id);
      const isEvo = evoMatInfo(u.id).length > 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'eb-orb' + (isEvo ? ' is-evo' : '') + (idx === selectedIdx ? ' active' : '');
      b.dataset.up = u.id;
      b.style.setProperty('--orb-accent', meta.accent);
      b.style.setProperty('--orb-glow', meta.glow);
      b.innerHTML = '<span class="eb-pillar" aria-hidden="true"></span>'
        + '<span class="eb-crest">'
        + '<img class="eb-med-img" src="' + medallionUrl(u.id) + '" alt="' + u.name + '" width="72" height="72">'
        + (isEvo ? '<span class="eb-evo-dot" title="합성 진화 재료">✦</span>' : '')
        + '</span>'
        + '<span class="eb-orb-badge">' + (lv ? ('Lv ' + lv) : 'NEW') + '</span>';
      b.addEventListener('click', function () {
        if (pickedLock) return;
        if (selectedIdx === idx) confirmSelection();
        else renderDetail(idx, true);
      });
      boxEl.appendChild(b);
      orbBtns.push(b);
    });

    if (confirmBtn) confirmBtn.onclick = confirmSelection;
    renderDetail(selectedIdx, false);
    renderOwnedBar();
    renderEvoHint();
    rt.showOv('ov-level');
    if (!(rt.qa && rt.qa.noDelay)) animateLevelCards($('ov-level'), orbBtns);
    rt.telemetry.event('levelup_pause', { level: rt.S.level, picks: rt.S.levelPicks.map(function (u) { return u.id; }) });
  }

  return { openLevelUp, renderOwnedBar };
}
