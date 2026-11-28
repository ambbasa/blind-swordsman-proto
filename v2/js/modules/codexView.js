/* v2/js/modules/codexView.js — 심안: 묵검 v1.21 3탭 도감 & 3D 도감 뷰어 컨트롤러 */

import { CODEX_MILESTONES } from '../meta.js';
import { STAGES } from './stages.js';
import { EVO_RECIPES } from './upgrades.js';
import { PAT_CODE } from './bossCatalog.js';

export const CODEX_SPECIES = [
  ['hero', '심안'],
  ['baekgol_skeleton', '백골 무사'],
  ['jangseung_stone', '장승 석인'],
  ['gwibul_bomber', '귀불'],
  ['bulgasari_charger', '불가사리'],
  ['changgui_zombie', '창귀'],
  ['cheonyeo_ghost', '처녀귀신'],
  ['samjoko', '삼족오'],
  ['dalgyalgwishin', '달걀귀신'],
  ['mudang_wraith', '무당 원혼'],
  ['susal_ghost', '수살귀'],
  ['jangsanbeom', '장산범'],
  ['dokkaebi_boss', '1막 도깨비'],
  ['gumiho_boss', '2막 구미호'],
  ['jeoseung_boss', '3막 저승사자'],
  ['imugi_king_boss', '4막 이무기']
];

export const CODEX_ANIM_KO = {
  idle: '기본 자세',
  walk: '걸음',
  attack: '공격',
  slam: '내려찍기',
  cast: '기공 시전',
  hit: '피격',
  stagger: '자세 붕괴',
  slash: '일섬',
  death: '사망'
};

export function renderCodexView(opts) {
  const {
    save,
    bodyEl,
    bonusEl,
    milestonesEl,
    tab,
    onTabChange,
    counts,
    bonusPct,
    totalPct,
    evoSlots,
    patSlots,
    monCode,
    patCue,
    isBasePat,
    cardNameOf,
    onClaimMilestone,
    startCodex3d,
    playCodexAnim3d,
    stopCodex3d
  } = opts;
  if (!bodyEl) return;

  if (bonusEl) {
    bonusEl.innerHTML =
      '달성도 ' + totalPct + '% · 귀물 ' + counts.mon + '/8 · 보스 ' + counts.boss + '/' + STAGES.length +
      ' · 진화 ' + counts.evo + '/' + evoSlots + ' · 패턴 ' + counts.pat + '/' + patSlots +
      '<br>묶음 보너스: 엽전 +' + bonusPct + '%';
  }

  if (milestonesEl) {
    milestonesEl.innerHTML = CODEX_MILESTONES.map(function (ms) {
      const done = !!(save.codexClaimed && save.codexClaimed[ms.pct]);
      const ready = !done && totalPct >= ms.pct;
      return '<button type="button" class="codex-ms-btn' + (done ? ' done' : (ready ? ' ready' : '')) +
        '" data-cmspct="' + ms.pct + '"' + (ready ? '' : ' disabled') + '>' +
        '<b>' + ms.pct + '%</b><span>' + (done ? '수령됨' : (ready ? '받기' : (ms.coins + '엽전'))) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(milestonesEl.querySelectorAll('button[data-cmspct]'), function (btn) {
      btn.addEventListener('click', function () {
        if (onClaimMilestone) onClaimMilestone(+btn.getAttribute('data-cmspct'));
      });
    });
  }

  const defaultTab = opts.allowModelPreview ? '3d' : 'mon';
  const ctab = tab === 'mon' || tab === 'pat' ? tab : defaultTab;
  const out = [];
  out.push(
    '<div class="codex-tabs" role="tablist" aria-label="도감 분류">' +
    (opts.allowModelPreview ? '<button type="button" data-codextab="3d" class="' + (ctab === '3d' ? 'on' : '') + '">3D 뷰어</button>' : '') +
    '<button type="button" data-codextab="mon" class="' + (ctab === 'mon' ? 'on' : '') + '">귀물·보스</button>' +
    '<button type="button" data-codextab="pat" class="' + (ctab === 'pat' ? 'on' : '') + '">진화·기믹</button>' +
    '</div>'
  );

  if (ctab === '3d') {
    out.push(
      '<div class="codex-group codex-3d-wrap">' +
      '<div class="codex-3d-head">' +
      '<h3>3D 도감 뷰어</h3>' +
      '<button type="button" id="codexAnimBtn" class="codex-3d-anim-btn">모션 재생</button>' +
      '</div>' +
      '<div class="codex-3d-grid">' +
      CODEX_SPECIES.map(function (it, idx) {
        return '<button type="button" class="codex-sp-btn' + (idx === 0 ? ' on' : '') + '" data-sp="' + it[0] + '">' + it[1] + '</button>';
      }).join('') +
      '</div>' +
      '<div class="codex-3d-stage">' +
      '<canvas id="codex3dCanvas"></canvas>' +
      '<div class="codex-3d-hint">좌우 드래그로 360도 회전</div>' +
      '</div></div>'
    );
  } else if (ctab === 'mon') {
    out.push('<div class="codex-group"><h3>귀물 ' + counts.mon + '/8</h3><div class="codex-grid">');
    monCode.forEach(function (m) {
      const on = !!(save.codex.mon && save.codex.mon[m.id]);
      out.push('<div class="codex-cell' + (on ? ' on' : ' unknown') + '"><b>' + (on ? m.name : '???') + '</b><span>' + (on ? m.desc : '') + '</span></div>');
    });
    out.push('</div></div>');
    out.push('<div class="codex-group"><h3>보스 ' + counts.boss + '/' + STAGES.length + '</h3><div class="codex-grid">');
    STAGES.forEach(function (st) {
      const rec = save.codex.boss && save.codex.boss[st.id];
      out.push('<div class="codex-cell' + (rec ? ' on' : ' unknown') + '"><b>' + (rec ? st.bossName : '???') + '</b><span>' + (rec ? st.name : '') + '</span></div>');
    });
    out.push('</div></div>');
  } else {
    out.push('<div class="codex-group"><h3>보스 6대 핵심 기믹 (4색 예고 공략)</h3><div class="codex-gimmick-list">');
    PAT_CODE.filter(function (p) { return p.slot >= 13 && p.slot <= 18; }).forEach(function (p) {
      const cue = (patCue && patCue[p.id]) || 'jade';
      out.push('<div class="codex-gimmick-cell cue-' + cue + '"><b>' + p.name + '</b><span>' + p.guides.join(' ') + '</span></div>');
    });
    out.push('</div></div>');
    out.push('<div class="codex-group"><h3>진화 ' + counts.evo + '/' + evoSlots + '</h3><div class="codex-grid">');
    EVO_RECIPES.forEach(function (r) {
      const on = !!(save.codex.evo && save.codex.evo[r.key]);
      out.push('<div class="codex-cell' + (on ? ' on' : ' unknown') + '"><b>' + (on ? r.name : '???') + '</b><span>' + (on ? '재료 ' + (r.a.length ? cardNameOf(r.a[0]) : '종') + ' + ' + cardNameOf(r.b) : '') + '</span></div>');
    });
    out.push('</div></div>');
    out.push('<div class="codex-group"><h3>기본 패턴 ' + counts.pat + '/' + patSlots + '</h3><div class="codex-grid">');
    PAT_CODE.filter(function (p) { return isBasePat(p.id); }).forEach(function (p) {
      const on = !!(save.codex.pat && save.codex.pat[p.id]);
      out.push('<div class="codex-cell' + (on ? ' on' : ' unknown') + '"><b>' + (on ? p.name : '???') + '</b><span>' + (on ? p.guides[0] : '') + '</span></div>');
    });
    out.push('</div></div>');
  }

  bodyEl.innerHTML = out.join('');
  Array.prototype.forEach.call(bodyEl.querySelectorAll('button[data-codextab]'), function (tb) {
    tb.addEventListener('click', function () {
      const next = tb.getAttribute('data-codextab') || defaultTab;
      if (next === ctab) return;
      if (ctab === '3d' && stopCodex3d) { try { stopCodex3d(); } catch (_) {} }
      if (onTabChange) onTabChange(next);
    });
  });

  try {
    const cv = ctab === '3d' ? bodyEl.querySelector('#codex3dCanvas') : null;
    if (cv && startCodex3d) {
      startCodex3d(cv, 'hero');
      const spBtns = bodyEl.querySelectorAll('button.codex-sp-btn');
      Array.prototype.forEach.call(spBtns, function (btn) {
        btn.addEventListener('click', function () {
          const sp = btn.getAttribute('data-sp') || 'hero';
          Array.prototype.forEach.call(spBtns, function (b2) {
            b2.classList.toggle('on', b2 === btn);
          });
          startCodex3d(cv, sp);
          const ab = bodyEl.querySelector('#codexAnimBtn');
          if (ab) ab.textContent = '모션 재생';
        });
      });
      const aBtn = bodyEl.querySelector('#codexAnimBtn');
      if (aBtn && playCodexAnim3d) {
        aBtn.addEventListener('click', function () {
          const k = playCodexAnim3d();
          aBtn.textContent = k ? ('모션: ' + (CODEX_ANIM_KO[k] || k)) : '모션 재생';
        });
      }
    }
  } catch (_) {}
}
