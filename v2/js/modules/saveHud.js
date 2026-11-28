/* v2/js/modules/saveHud.js — 심안: 묵검 v1.26 세이브·마이그레이션·HUD·오버레이·일시정지 */

export function createSaveHud(rt) {
  const $ = rt.$;
function atkBonus() { return rt.computeAtkBonus(rt.save.atkLv, rt.CFG); }
function gapBonus() { return rt.computeGapBonus(rt.save.gapLv); }
function poiseBonus() { return rt.computePoiseBonus(rt.save.poiseLv); }
function maxHp() {
  return rt.computeMaxHp({ hpLv: rt.save.hpLv, runHp: (rt.S && rt.S.runHp) || 0, beadsRelicOn: false, cfg: rt.CFG });
}
/* v0.70 엽전 배율 = 상점(심안) × 런 강화 × 도감 보너스 (안개 바늘은 링 안 피해 +15%로 이관) */
function coinMult() {
  /* v0.98: 상점 재물운(+8%/레벨, 전투 상한 x2.5)과 실제 배율 일치 */
  const baseMult = Math.min(2.5, 1 + (rt.save.coinLv || 0) * 0.08 + (rt.S && rt.S.runCoin || 0));
  return baseMult * (1 + rt.codexBonus(rt.save));
}
/* Dash damage = (base + upgrades) x combo x meta attack x 혈월 부적 x 획고 인장 (안개 바늘은 적별 즉석 판정). */
function dashDmg() {
  return rt.computeDashDmg({
    baseDashDmg: (rt.S && rt.S.dashDmg) || rt.CFG.dashDmg,
    combo: (rt.S && rt.S.combo) || 0,
    atkLv: rt.save.atkLv,
    bloodRelicActive: !!(rt.relicOn(rt.save, 'blood') && rt.S && rt.S.hp < maxHp() * 0.5),
    needleRelicActive: false,
    monoSealStacks: (rt.S && rt.S.monoSealStacks) || 0,
    cfg: rt.CFG
  });
}
/* §3.3: 1 + 0.04c, 15에서 상한 ×1.5. */
function comboMul() {
  return rt.computeComboMul((rt.S && rt.S.combo) || 0, rt.CFG);
}
function pathR() {
  let r = (rt.S && rt.S.pathR) || rt.CFG.pathRadius;
  /* §3.3 15콤보 보상: 다음 일섬 한 번만 경로 폭 +50%. */
  if (rt.S && rt.S.pathWideN > 0) r *= (rt.CFG.comboTiers[15] || {}).wide || 1.5;
  /* v0.98 만획 인장: 서로 다른 획 3연속 성공 시 일섬 폭 +15% */
  if (rt.S && rt.relicOn(rt.save, 'multi_seal') && (rt.S.multiSealStreak || 0) >= 3) r *= 1.15;
  return r;
}

function loadSave() {
  const BAK = rt.SAVE_KEY + '.bak';
  let raw = null, broken = false;
  try { raw = localStorage.getItem(rt.SAVE_KEY); } catch (e) { return; }
  if (raw) {
    let o = null, restored = false;
    try { o = JSON.parse(raw); } catch (e) { broken = true; }
    if (!o || typeof o !== 'object') broken = true;
    if (broken) {
      /* §14 저장: 손상된 세이브는 백업에서 되살린다(백업은 지우지 않는다). */
      try {
        const bak = localStorage.getItem(BAK);
        if (bak) { o = JSON.parse(bak); restored = !!(o && typeof o === 'object'); }
      } catch (e) { o = null; }
    }
    if (o && typeof o === 'object') {
      migrateSave(o);
      if (restored) {
        rt.telemetry.event('save_restore', { from: 'backup' });
        /* 되살린 세이브를 정본으로 되돌려 둔다. */
        try { localStorage.setItem(rt.SAVE_KEY, JSON.stringify(rt.save)); } catch (e) {}
      } else {
        /* 정상 세이브는 바로 백업본으로 돌려 둔다(다음 손상 때 복구). */
        try { localStorage.setItem(BAK, raw); } catch (e) {}
      }
    } else {
      rt.telemetry.event('save_reset', { reason: 'corrupt-no-backup' });
      return;
    }
  }
  if (!rt.save.stars || typeof rt.save.stars !== 'object') rt.save.stars = {};
  if (!rt.save.moments || typeof rt.save.moments !== 'object') rt.save.moments = {};
  if (!rt.save.a11y || typeof rt.save.a11y !== 'object') rt.save.a11y = { colorblind: 0, shake: 0 };
  rt.save.a11y.colorblind = rt.save.a11y.colorblind ? 1 : 0;
  rt.save.a11y.shake = rt.save.a11y.shake ? 1 : 0;
  if (!rt.MODES[rt.save.mode]) rt.save.mode = 'jeongseok';
  rt.save.levelMode = 'pause';
  if (rt.save.mode === 'gosu' && !rt.gosuUnlocked()) rt.save.mode = 'jeongseok';
  rt.save.tutorialDone = rt.save.tutorialDone ? 1 : 0;
  rt.save.stage = rt.clamp(rt.save.stage | 0 || 1, 1, rt.STAGES.length);
  rt.save.version = rt.SAVE_VERSION;
}
/* v2 → v3 이전: 예전 세이브에 메타 칸이 없으면 기본값으로 메우고, 도감 구조도 맞춘다. */
function migrateSave(o) {
  const META_KEYS = ['coins', 'ink', 'atkLv', 'hpLv', 'gapLv', 'poiseLv', 'coinLv', 'lastSeen', 'runs', 'stage', 'stars', 'bestScore', 'totemTip', 'muted',
    'mode', 'tutorialDone', 'moments', 'a11y', 'streak', 'trainOffered', 'levelMode', 'codex',
    'version', 'swords', 'relics', 'cloaks', 'trails', 'starChests', 'codexClaimed', 'daily', 'attend', 'train', 'records', 'challenge'];
  const from = o.version | 0;
  Object.keys(o).forEach(function (k) { if (o[k] != null) rt.save[k] = o[k]; });
  if (from < rt.SAVE_VERSION) {
    const base = rt.newSaveMeta();
    /* v0.70: 무구·유물·도포·검기는 보유분만 보존하며 보충 (구 skins/brush는 migrateMetaV4에서 환불 후 정리) */
    ['swords', 'relics', 'cloaks', 'trails'].forEach(function (k) {
      if (!base[k]) return;
      if (!rt.save[k] || typeof rt.save[k] !== 'object') rt.save[k] = base[k];
      rt.save[k].owned = Object.assign({}, base[k].owned, rt.save[k].owned || {});
      if (typeof rt.save[k].equipped !== 'object' && rt.save[k].equipped == null) rt.save[k].equipped = base[k].equipped;
      if (Array.isArray(base[k].equipped) && !Array.isArray(rt.save[k].equipped)) rt.save[k].equipped = base[k].equipped;
    });
    if (!rt.save.codex || typeof rt.save.codex !== 'object') rt.save.codex = base.codex;
    ['mon', 'boss', 'evo', 'pat'].forEach(function (k) { if (!rt.save.codex[k] || typeof rt.save.codex[k] !== 'object') rt.save.codex[k] = {}; });
    rt.save.train = Object.assign({ stats: {}, seen: 0 }, rt.save.train || {});
    if (!rt.save.train.stats) rt.save.train.stats = {};
    rt.save.records = Object.assign({ endless: 0, bossrush: 0, trials: 0 }, rt.save.records || {});
    rt.save.challenge = Object.assign({ endless: 0, bossrush: 0, trial: 0 }, rt.save.challenge || {});
    rt.telemetry.event('save_migrate', { from: from, to: rt.SAVE_VERSION, coins: rt.save.coins | 0, stage: rt.save.stage | 0 });
  }
  META_KEYS.forEach(function (k) { if (rt.save[k] == null && o[k] != null) rt.save[k] = o[k]; });
  if (!rt.save.codex.boss) rt.save.codex.boss = {};
  if (!rt.save.codex.pat) rt.save.codex.pat = {};
  const v4Refund = rt.migrateMetaV4(rt.save);
  if (v4Refund > 0) {
    rt.save._pendingRefundToast = v4Refund;
    rt.telemetry.event('save_v4_refund', { refund: v4Refund });
  }
}
function persist(touch) {
  if (touch !== false) rt.save.lastSeen = Date.now();
  try { localStorage.setItem(rt.SAVE_KEY, JSON.stringify(rt.save)); } catch (e) {}
}

function showOv(id) {
  if ($('titleA11y')) $('titleA11y').hidden = true;
  ['ov-title', 'ov-stages', 'ov-shop', 'ov-cosmetic', 'ov-daily', 'ov-result', 'ov-idle', 'ov-level', 'ov-stage', 'ov-pause', 'ov-codex', 'ov-train'].forEach(function (k) {
    const el = $(k); if (el) el.classList.toggle('show', k === id);
  });
  if (id === 'ov-title') {
    rt.hudCtrl.clearOnTitleReturn();
    rt.hudCtrl.syncActTheme(rt.actOf(rt.save.stage || 1));
    rt.refreshTitleHelp();
    rt.ensureLobbyHero3D();
    rt.updateRetentionBadge();
    rt.syncLobbyStatus();
    if (rt.save._pendingRefundToast > 0) {
      const rf = rt.save._pendingRefundToast;
      rt.save._pendingRefundToast = 0;
      toast('성장 개편: 기존 외형·유물 ' + rf + '엽전 전액 환불!');
    }
  } else {
    rt.hudCtrl.syncOverlayVisibility(!!id);
  }
}
function hideOvs() {
  if ($('titleA11y')) $('titleA11y').hidden = true;
  try { rt.stopCodex3d(); } catch (_) {}
  ['ov-title', 'ov-stages', 'ov-shop', 'ov-cosmetic', 'ov-daily', 'ov-result', 'ov-idle', 'ov-level', 'ov-stage', 'ov-pause', 'ov-codex', 'ov-train'].forEach(function (k) { if ($(k)) $(k).classList.remove('show'); });
  rt.hudCtrl.syncOverlayVisibility(false);
}
function toast(msg) {
  const el = $('toast');
  el.hidden = false; el.textContent = msg;
  rt.toastT = rt.now() + 1600;
}
/* 판 안내 문구(첫 진입·참 준비·기물 학습). 조작을 막지 않는 한 줄 칩. */
function showGuide(html, sec) {
  const el = $('guide');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = false;
  el.classList.add('show');
  /* 만료는 게임 시간 기준 — 느린 기기·로딩 중에 안내가 먼저 사라지지 않는다. */
  rt.guideUntil = (rt.S ? (rt.S.elapsed || 0) + (sec || 4.5) : 0);
}
function hideGuide() {
  const el = $('guide');
  if (!el) return;
  el.classList.remove('show');
  rt.guideUntil = 0;
  el.hidden = true;
}
let shownMaxHp, shownHp;
let shownVulnText = '';
function renderVulnBadge() {
  const vb = $('vulnBadge');
  if (!vb) return;
  const st = (rt.S && rt.S.playing && (rt.S.vulnStacks || 0) > 0 && (rt.S.vulnT || 0) > 0) ? ('취약 ×' + rt.S.vulnStacks + ' · ' + Math.ceil(rt.S.vulnT) + 's') : '';
  if (st === shownVulnText) return;
  shownVulnText = st;
  if (st) { vb.hidden = false; vb.textContent = st; }
  else { vb.hidden = true; vb.textContent = ''; }
}
function fillHp() {
  renderVulnBadge();
  const n = maxHp(), cur = rt.S ? rt.S.hp : n;
  if (n === shownMaxHp && cur === shownHp) return;
  shownMaxHp = n; shownHp = cur;
  /* v1.32 상단 HUD 다이어트: 최대 체력 10 초과 시 컴팩트 HP 바 + 숫자로 시야 확보 */
  const more = $('hpMore');
  if (n > 10) {
    const pct = Math.max(0, Math.min(100, (cur / Math.max(1, n)) * 100)).toFixed(1);
    $('hpPips').innerHTML = '<span class="hp-bar-wrap"><i class="hp-bar-fill" style="width:' + pct + '%"></i></span>';
    if (more) more.textContent = Math.max(0, Math.ceil(cur)) + '/' + n;
  } else {
    let h = '', i;
    for (i = 0; i < n; i++) h += '<i' + (i < cur ? '' : ' class="off"') + '></i>';
    $('hpPips').innerHTML = h;
    if (more) more.textContent = '';
  }
}
/* v0.31 §5.5 판 안 경험치 곡선: 7 + 4(lv-1) + 0.6(lv-1)^2 — 첫 3레벨은 빠르고 8레벨 이후는 느리다. */
function xpNeed(lv) {
  const n = Math.max(1, lv | 0) - 1;
  return Math.round(4 + 4 * n + 0.6 * n * n);
}
function setHudText(el, value) {
  const text = String(value);
  if (el.textContent !== text) el.textContent = text;
}
function renderHud() {
  const appEl = $('app');
  if (appEl) {
    appEl.classList.toggle('boss-active', !!(rt.S && rt.S.playing && rt.S.boss && rt.S.boss.alive));
    appEl.classList.toggle('rush-active', !!(rt.S && rt.S.playing && (rt.S.rushT || 0) > 0));
  }
  if (!rt.S) {
    setHudText($('stageLabel'), '심안');
    $('judgeFlash').hidden = true;
    $('goalLabel').hidden = true;
    if ($('missionHud')) $('missionHud').hidden = true;
    if ($('styleHud')) $('styleHud').hidden = true;
    setHudText($('timer'), '—');
    setHudText($('dashLabel'), '일섬 1');
    setHudText($('coinLabel'), '엽전 ' + rt.save.coins);
    setHudText($('lvlLabel'), 'Lv —');
    if ($('comboLabel')) { setHudText($('comboLabel'), '콤보 0'); $('comboLabel').classList.remove('hot'); }
    $('xpFill').style.width = '0%';
    renderCharge();
    fillHp();
    return;
  }
  setHudText($('timer'), Math.max(0, Math.ceil(rt.S.timeLeft)));
  const permElem = rt.S.dashElem;
  const temp = (rt.S.tempElem && rt.S.tempElem.t > 0) ? rt.S.tempElem : null;
  const elemLvBit = (permElem && rt.elemLv(permElem) > 1) ? ('Lv' + rt.elemLv(permElem)) : '';
  const permBit = permElem ? ('·' + rt.elemNameOf(permElem) + elemLvBit) : '';
  const tempBit = temp ? ((permElem ? ' +' : '·') + rt.elemNameOf(temp.el) + Math.ceil(temp.t) + 's') : '';
  const bellBit = rt.S.bellT > 0 ? (' 종' + (rt.SHAPE_MARK[rt.S.bellShape] || '') + Math.ceil(rt.S.bellT) + 's') : '';
  setHudText($('dashLabel'), '일섬 ' + rt.S.dashCount + permBit + tempBit + bellBit);
  setHudText($('coinLabel'), '엽전 ' + rt.save.coins);
  setHudText($('lvlLabel'), 'Lv ' + rt.S.level);
  if ($('comboLabel')) {
    setHudText($('comboLabel'), '콤보 ' + (rt.S.combo || 0));
    $('comboLabel').classList.toggle('hot', (rt.S.combo || 0) >= 4);
  }
  let stageText = rt.S.sandbox ? '연습' : (rt.S.stage ? (rt.S.stageNo + '장 ' + rt.S.stage.name) : '심안');
  if (rt.S.challenge) {
    const c = rt.challengeOf(rt.S.challenge);
    stageText = c ? c.name : '도전';
    if (rt.S.challenge === 'bossrush') stageText = '보스 러시 ' + (rt.S.bossIdx || 0) + '/' + rt.STAGES.length;
    else if (rt.S.challenge === 'endless') stageText = '무한 심연 ' + (rt.S.endlessBossN || 0) + '귀물';
  }
  if (rt.S.boss && rt.S.boss.alive) stageText = (rt.S.stage && rt.S.stage.bossName) || '결전';
  setHudText($('stageLabel'), stageText);
  const xpW = Math.min(100, (rt.S.xp / xpNeed(rt.S.level)) * 100).toFixed(1) + '%';
  const xpEl = $('xpFill');
  if (xpEl && xpEl._w !== xpW) { xpEl._w = xpW; xpEl.style.width = xpW; }
  /* v1.32 판별 3종 임무 진행도 & 실시간 기예 등급 HUD */
  const mh = $('missionHud');
  if (mh) {
    if (!rt.S.tutorial?.on && rt.S.missions && rt.S.missions.length === 3 && rt.evalRunMissions) {
      const mev = rt.evalRunMissions(rt.S.missions, rt.S, maxHp());
      const isMaintain = function (x) { return x && (x.id === 'maxHits' || x.id === 'minHpPct'); };
      const nextTodo = mev.items.find(function (x) { return !x.done && !isMaintain(x); }) || mev.items.find(function (x) { return !x.done; });
      const todoTag = nextTodo ? (nextTodo.label + (isMaintain(nextTodo) ? ' (유지 실패)' : (' ' + nextTodo.prog))) : '';
      const mTxt = mev.doneCount >= 3 ? '임무 3/3 완료' : ('임무 ' + mev.doneCount + '/3 · ' + todoTag);
      mh.hidden = false;
      mh.classList.toggle('done', mev.doneCount >= 3);
      setHudText(mh, mTxt);
    } else {
      mh.hidden = true;
    }
  }
  const sh = $('styleHud');
  if (sh) {
    const sc = rt.S.styleScore || 0;
    if (sc > 0 && rt.styleGradeOf) {
      const sg = rt.styleGradeOf(sc);
      sh.hidden = false;
      setHudText(sh, sg.label + ' · ' + sc.toLocaleString());
    } else {
      sh.hidden = true;
    }
  }
  renderCharge();
  fillHp();
}
/* v0.27: 판 중 소리 토글·일시정지·나가기 */
function setMuted(m) {
  rt.save.muted = !!m;
  rt.qa.mute = !!m;
  persist();
  if (rt.audio) rt.audio.setQuiet(!!m, rt.qa.noDelay);
  const b = $('btnMute'), b2 = $('btnMute2');
  if (b) {
    if (!b.querySelector('svg')) b.textContent = m ? '무음' : '소리';
    b.classList.toggle('off', !!m);
    b.setAttribute('aria-label', m ? '소리 켜기' : '소리 끄기');
  }
  if (b2) b2.textContent = m ? '소리 켜기' : '소리 끄기';
  rt.hudCtrl.syncMuteUi(!!m);
  return rt.save.muted;
}
function pauseRun() {
  if (!rt.S || !rt.S.playing || rt.S.paused) return false;
  rt.S.paused = 'manual';
  rt.setDrawingActive(false);
  if (rt.S.quick) { const q = rt.recommendedPick(); if (q) rt.pickQuick(q, true); else rt.closeQuickCards(); }
  hideGuide();
  showOv('ov-pause');
  if (rt.audio) rt.audio.stopBgm();
  return true;
}
function resumeRun() {
  if (!rt.S || rt.S.paused !== 'manual') return false;
  rt.S.paused = null;
  hideOvs();
  if (rt.audio) { rt.audio.setQuiet(!!rt.save.muted, rt.qa.noDelay); rt.audio.startBgm(); }
  return true;
}
/* 판을 접고 타이틀로 — 결과 카드를 띄우지 않는다. */
function quitRun() {
  const had = !!rt.S;
  $('toast').hidden = true;
  rt.toastT = 0;
  if (rt.S) rt.resetRunStateOnQuit(rt.S);
  rt.hudCtrl.clearOnTitleReturn();
  rt.closeQuickCards();
  const sk = $('btnSkip');
  if (sk) sk.hidden = true;
  hideGuide();
  hideOvs();
  if (rt.three && rt.three.river) { try { rt.three.river.dispose(); } catch (e) {} rt.three.river = null; }
  if (rt.three && rt.three.terrain3d) { try { rt.three.terrain3d.dispose(); } catch (e) {} rt.three.terrain3d = null; }
   rt.clearEntities();
  rt.closeArena(true);
  rt.S = null;
  if (rt.audio) { if (rt.audio.setBossMode) rt.audio.setBossMode(false); rt.audio.stopBgm(); }
  if (rt.three) {
    rt.three.camera.position.set(rt.CFG.camOff.x, rt.CFG.camOff.y, rt.CFG.camOff.z);
    rt.three.camera.lookAt(0, rt.CFG.camLookY, 0);
  }
  rt.applyCameraLens();
  renderHud();
  showOv('ov-title');
  return had;
}
function renderCharge() {
  const w = $('chargeWrap'), t = $('chargeText');
  if (!w) return;
  const max = rt.CFG.cleaveCharge || 100;
  const c = (rt.S && rt.S.charge) || 0;
  const full = c >= max;
  w.classList.toggle('full', full);
  $('chargeFill').style.width = Math.min(100, (c / max) * 100) + '%';
  if (t) setHudText(t, full ? '참 준비 (O)' : '참 ' + Math.floor(c));
  /* 게이지가 꽉 찬 순간, 매 판 최소 1회 O 유령 획과 안내를 함께 띄운다. */
  if (full && rt.S && rt.S.playing && !rt.S.chargeReadyHint) {
    rt.S.chargeReadyHint = true;
    rt.S.chargeGuide = Math.max(rt.S.chargeGuide || 0, 2.2);
    showGuide('참 준비 — <b>O</b>를 그려 참을 터뜨리세요', 3.6);
    if (rt.audio && rt.audio.gong) rt.audio.gong();
    if (rt.markSeen('charge')) rt.telemetry.event('first_moment', { kind: 'charge', stage: rt.S.stageNo });
  }
}

/* ---------- three.js world ---------- */
function nightColor() {
  return (rt.art && rt.art.night) || 0x1e1c1a;
}
function mapIdOf(opts) {
  opts = opts || {};
  if (opts.map) {
    const m = String(opts.map);
    return (m.indexOf('map') === 0) ? m : ('map' + m);
  }
  if (opts.sandbox) return 'map1';
  return rt.stageOf(opts.stage != null ? opts.stage : (rt.save.stage || 1)).map;
}
  return { atkBonus, coinMult, comboMul, dashDmg, gapBonus, hideGuide, hideOvs, loadSave, mapIdOf, maxHp, nightColor, pathR, pauseRun, persist, poiseBonus, quitRun, renderHud, renderVulnBadge, resumeRun, setMuted, showGuide, showOv, toast, xpNeed };
}
