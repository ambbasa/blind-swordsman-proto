import { animateResultOverlay } from './uiMotion.js?v=v151';
/* v2/js/modules/runLoop.js — 심안: 묵검 v1.26 전투 스텝·군중 분리·카메라·런 종료 엔진 */

export function createRunLoop(rt) {
  const $ = rt.$;
function endRun(win, msg) {
  if (!rt.S || rt.S.won || rt.S.lost) return;
  if (rt.audio && rt.audio.setBossMode) rt.audio.setBossMode(false);
  rt.S.won = win; rt.S.lost = !win; rt.S.playing = false; rt.S.paused = 'result'; rt.S.dash = null;
  rt.setDrawingActive(false);
  rt.closeQuickCards();
  rt.hideGuide();
  const sk = $('btnSkip');
  if (sk) sk.hidden = true;
  rt.S.tutorial = null; rt.S.tutSlow = 1;
  rt.closeArena();
  const st = rt.S.stage || rt.stageOf(1);
  /* §6.2 11장 시간 공격: 목표는 '줄어든 시간에 클리어' — 이기면 달성이다. */
  if (win && rt.S.goal && rt.S.goal.id === 'timed' && !rt.S.goal.fail) rt.goalPass('줄어든 시간에 베었습니다');
  const stars = rt.starsFor(win);
  const coinsGain = Math.max(0, rt.save.coins - (rt.S.coin0 || 0));
  const score = (rt.S.styleScore || 0) + (rt.S.kills || 0) * 10 + (rt.S.comboMax || 0) * 5 + stars * 300 + (win ? 500 : 0);
  rt.S.stars = stars; rt.S.coinGain = coinsGain; rt.S.score = score;
  if (!rt.S.noScore) rt.telemetry.event('income', { source: 'run', stage: st.id, seconds: Math.round(rt.S.elapsed), coins: coinsGain });
  /* 타이틀 "수련" 다시 보기는 점수·별에 반영하지 않는다. */
  if (win && !rt.S.noScore && !rt.S.challenge) {
    rt.save.stars = rt.save.stars || {};
    rt.save.stars[st.id] = Math.max(rt.save.stars[st.id] || 0, stars);
    /* v0.70 먹묵(벼림 재료) 지급 + 일일 수련 클리어 카운트 */
    const inkGain = 1 + rt.actOf(st.id) + (stars >= 3 ? 1 : 0);
    rt.save.ink = (rt.save.ink || 0) + inkGain;
    rt.S.inkGain = inkGain;
    rt.bumpDaily('q_clear', 1);
    const next = Math.min(rt.STAGES.length, (rt.S.stageNo || st.id) + 1);
    rt.save.stage = Math.max(rt.save.stage || 1, rt.S.stageNo >= rt.STAGES.length ? rt.STAGES.length : next);
    /* v0.23: 막의 마지막 장을 깨면 다음 막이 열린다. 마지막 장이면 올 클리어. */
    if ((st.id % 4) === 0) {
      if (st.id < rt.STAGES.length) rt.toast('제' + (rt.actOf(st.id) + 1) + '막 「' + rt.ACT_NAMES[rt.actOf(st.id) + 1] + '」 열림');
      else rt.toast('올 클리어 — 나락의 끝을 베었습니다');
    }
    rt.renderStageSelect(st.id);
  }
  if (!rt.S.noScore) rt.save.bestScore = Math.max(rt.save.bestScore || 0, score);
  /* v0.30 §7.3: 같은 장 연승/연패. 이기면 0으로 돌아간다. */
  const streakBefore = rt.S.streak || 0;
  rt.S.streakAfter = rt.S.noScore ? streakBefore : rt.bumpStreak(st.id, !!win);
  rt.persist();
  /* §13 데이터: 판 결과·사망 원인·fps. 상용 튜닝(클리어율·시간 예산·공정성)의 바탕이다. */
  const fprep = rt.fpsReport();
  const timeUp = !win && (rt.S.timeLeft || 0) <= 0;
  rt.telemetry.event('stage_end', {
    stage: rt.S.stageNo || st.id, win: !!win, time: +(rt.S.elapsed || 0).toFixed(1),
    hp: Math.max(0, rt.S.hp), hpMax: rt.maxHp(), stars: stars, kills: rt.S.kills || 0,
    comboMax: rt.S.comboMax || 0, level: rt.S.level || 1, bossState: rt.S.boss ? rt.S.boss.state : null,
    mode: rt.S.mode || rt.save.mode, timeUp: timeUp,
    bossFight: (rt.S.bossSeenAt && rt.S.boss) ? +((rt.S.elapsed || 0) - rt.S.bossSeenAt).toFixed(1) : 0,
    timeLeft: +(rt.S.timeLeft || 0).toFixed(1), streak: streakBefore, help: (rt.S.help || []).slice(),
    hits: rt.S.hits || 0, terrain: rt.S.terrain ? { rule: rt.S.terrain.kind, counts: Object.assign({}, rt.S.terrain.counts) } : null,
    star3: rt.star3Info(rt.S.stage).done, goldReflect: rt.S.goldReflectN || 0, clashWin: rt.S.clashWin || 0, shuffleLock: rt.S.shuffleLock || 0,
    goal: rt.S.goal ? { id: rt.S.goal.id, ok: !!rt.S.goal.ok, fail: !!rt.S.goal.fail, t: +(rt.S.goal.t || 0).toFixed(1) } : null
  });
  if (!win) rt.telemetry.event('death', { cause: rt.S.deathWhy || msg, hp: Math.max(0, rt.S.hp), bossState: rt.S.boss ? rt.S.boss.state : null, t: +(rt.S.elapsed || 0).toFixed(1) });
  rt.telemetry.event('fps', { stage: rt.S.stageNo || st.id, avg: +fprep.avg.toFixed(1), low: +fprep.min.toFixed(1), q: (rt.three && rt.three.bloom) ? rt.three.bloom.quality : null });
  rt.telemetry.save();
  if (rt.audio) rt.audio.stopBgm();
  const nextSt = rt.STAGES[(rt.S.stageNo || st.id)];
  $('resultKicker').textContent = rt.S.stageNo ? (rt.S.stageNo + '장 · ' + st.name + ' · ' + rt.curMode().name) : '연습';
  $('resultTitle').textContent = win ? '베었다' : '쓰러졌다';
  try {
    const rtEl = $('resultTitle');
    if (rtEl && rtEl.parentNode) {
      let card = document.getElementById('resultMastery');
      if (!card) {
        card = document.createElement('div');
        card.id = 'resultMastery';
        card.className = 'result-mastery-bar';
        rtEl.insertAdjacentElement('afterend', card);
      }
      const sec = Math.max(0, Math.round(rt.S.elapsed || 0));
      const mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
      const hpRatio = Math.max(0, (rt.S.hp || 0) / Math.max(1, rt.maxHp()));
      const gradePts = (win ? 40 : 0) + Math.round(hpRatio * 30) + Math.min(20, (rt.S.justParryN || 0) * 8 + (rt.S.parryOkN || 0) * 3) + Math.min(15, (rt.S.poiseBreaksN || 0) * 5) + Math.min(15, Math.floor((rt.S.comboMax || 0) / 2));
      const grade = !win ? 'C' : (gradePts >= 82 ? 'S' : (gradePts >= 62 ? 'A' : 'B'));
      const gradeCls = grade === 'S' ? 'g-s' : (grade === 'A' ? 'g-a' : (grade === 'B' ? 'g-b' : 'g-c'));
      const jpN = rt.S.justParryN || 0;
      card.innerHTML =
        '<div class="rm-cell"><span class="rm-lbl">등급</span><strong class="rm-grade ' + gradeCls + '">' + grade + '</strong></div>' +
        '<div class="rm-cell"><span class="rm-lbl">막기</span><strong>' + (rt.S.parryOkN || 0) + '회</strong>' + (jpN > 0 ? '<em class="rm-sub">완벽 ' + jpN + '</em>' : '') + '</div>' +
        '<div class="rm-cell"><span class="rm-lbl">자세격파</span><strong>' + (rt.S.poiseBreaksN || 0) + '회</strong></div>' +
        '<div class="rm-cell"><span class="rm-lbl">소요 시간</span><strong>' + mm + ':' + ss + '</strong></div>';
    }
  } catch (_) {}
  rt.S.goldStar = !!(win && rt.curMode().gold);
  const starsEl = $('resultStars');
  if (win) {
    starsEl.classList.remove('defeat-seal');
    starsEl.setAttribute('aria-label', '획득 별 ' + stars + '/3' + (rt.S.goldStar ? ' · 금별' : ''));
    starsEl.innerHTML = [0, 1, 2].map(function (i) {
      return '<i aria-hidden="true" class="' + (i < stars ? 'on' : '') + (i < stars && rt.S.goldStar ? ' gold' : '') + '">★</i>';
    }).join('') + (rt.S.goldStar ? '<em class="gold-star">금별</em>' : '');
  } else {
    starsEl.classList.add('defeat-seal');
    starsEl.setAttribute('aria-label', '전투 패배 · 획득 별 0/3');
    starsEl.textContent = '패배 · 다시 일어서라';
  }
  $('resultBody').textContent = win ? (msg || '') : (msg || '') + ' 다시 한 번.';
  const hpPct = Math.round((rt.S.hp / Math.max(1, rt.maxHp())) * 100);
  $('resultStats').innerHTML = [
    ['기예 점수', (rt.S.styleScore || 0).toLocaleString() + ' (' + (rt.styleGradeOf ? rt.styleGradeOf(rt.S.styleScore || 0).label : '병') + ')'],
    ['처치', (rt.S.kills || 0) + '기'],
    ['최대 콤보', (rt.S.comboMax || 0)],
    ['획득 엽전', '+' + coinsGain],
    ['획득 먹묵', '+' + (rt.S.inkGain || 0)],
    ['부순 항아리', (rt.S.jarsBroken || 0) + '개'],
    ['남은 체력', Math.max(0, hpPct) + '%']
  ].map(function (r) {
    return '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>';
  }).join('');
  let note = '';
  if (rt.S.challenge) {
    const c = rt.challengeOf(rt.S.challenge);
    if (c && rt.S.challenge === 'bossrush') note = '보스 러시 ' + (rt.S.bossIdx || 0) + '/' + rt.STAGES.length + ' · 최고 기록 ' + (rt.save.records.bossrush || 0);
    else if (c && rt.S.challenge === 'endless') note = '무한 심연 — 귀물 ' + (rt.S.endlessBossN || 0) + ' · 최고 기록 ' + (rt.save.records.endless || 0);
    else if (c) note = c.name + ' — 무늬 ' + (rt.S.trialPool || []).map(function (k) { return rt.SHAPE_MARK[k] || k; }).join(' ');
  } else if (rt.S.missions && rt.S.missions.length === 3 && rt.evalRunMissions) {
    const mev = rt.evalRunMissions(rt.S.missions, rt.S, rt.maxHp());
    note = '판별 임무 (' + mev.doneCount + '/3): ' + mev.items.map(function (it) { return (it.done ? '[완료] ' : '[미달] ') + it.label + ' (' + it.prog + ')'; }).join(' · ');
  } else if (win && stars < 3 && stars < rt.starCap()) {
    const lack = [];
    if (rt.S.hp / Math.max(1, rt.maxHp()) < 0.5 && (rt.S.hits || 0) > (rt.CFG.star2Hits || 3)) lack.push('체력 50% 이상 또는 피격 3회 이하(지금 ' + (rt.S.hits || 0) + '회)');
    const s3i = rt.star3Info(st);
    if (!s3i.done) lack.push(s3i.short);
    note = '★ 더 받으려면: ' + lack.join(' · ');
  } else if (win && rt.starCap() < 3) {
    note = '수련 모드는 별 2개까지입니다 — 정석에서 세 번째 별을 노리세요.';
  } else if (!win && timeUp) {
    note = '시간이 모자랐습니다 — 보스의 빈틈에 집중하거나 모드를 바꿔 보세요.';
  } else if (!win) {
    note = '보스의 체력을 깎아 쓰러뜨린 뒤 한붓별(★)로 봉인하면 클리어입니다.';
  }
  $('resultNext').textContent = note;
  /* §7.3 투명성: 이번 판에 어떤 도움이 들어갔는지 결과 화면에 작게 남긴다. */
  const helpEl = $('resultHelp');
  if (helpEl) {
    const hs = (rt.S.help && rt.S.help.length) ? rt.S.help.slice() : [];
    helpEl.textContent = hs.length ? ('도움이 적용됐다 — ' + hs.join(' · ')) : '';
    helpEl.hidden = !hs.length;
  }
  /* §7.2 수련 권유(3연패 이상, 정석 모드): 강요하지 않고 한 번만 권한다. */
  const offerKey = st.id + ':' + (rt.S.streakAfter || 0);
  const offerBox = $('btnTrainOffer');
  if (offerBox) {
    const offer = !win && (rt.S.streakAfter || 0) >= 3 && rt.curMode().id === 'jeongseok' && rt.save.trainOffered !== offerKey;
    offerBox.hidden = !offer;
    if (offer) offerBox.textContent = '수련 모드로 한 판';
  }
  /* v0.70 패배 화면 1탭 강화 추천 */
  const qBtn = $('btnResultUpgrade');
  if (qBtn) {
    if (!win) {
      const cand = rt.pickAffordableStatUpgrade();
      if (cand) {
        qBtn.hidden = false;
        qBtn.dataset.stat = cand.id;
        qBtn.textContent = cand.name + ' Lv ' + (cand.lv + 1) + ' 바로 단련 (' + cand.cost + '엽전)';
      } else {
        qBtn.hidden = true;
      }
    } else {
      qBtn.hidden = true;
    }
  }
  const drillSub = $('btnResultDrill');
  if (drillSub) drillSub.hidden = !(!win && rt.S.boss);
  const retrySub = $('btnResultRetry');
  if (win && nextSt) {
    $('btnResultGo').textContent = '다음 장 — ' + nextSt.name;
    rt.S.nextStage = nextSt.id;
    if (retrySub) retrySub.hidden = false;
  } else {
    $('btnResultGo').textContent = '다시하기';
    rt.S.nextStage = null;
    if (retrySub) retrySub.hidden = true;
  }
  $('btnResultGo').classList.toggle('long', $('btnResultGo').textContent.length > 8);
  rt.showOv('ov-result');
  if (!(rt.qa && rt.qa.noDelay)) animateResultOverlay($('ov-result'), $('resultStars'), $('resultStats'));
  rt.renderHud();
}

/* v0.43: 무리 간 간격 유지(separation). 좁은 무리에서 서로 밀어내 한 덩어리로 겹치지 않게 한다.
   비용: 살아 있는 잔몹 n 에 대해 n(n-1)/2 거리 비교(상한 45마리 → 1천 회 내외). */
function separateCrowd(dt) {
  if (!rt.S || !rt.S.zombies || rt.S.zombies.length < 2) return;
  const list = [];
  for (let i = 0; i < rt.S.zombies.length; i++) {
    const z = rt.S.zombies[i];
    if (z && z.alive && !z.isBoss && !z.isClone && !z.isPillar && !z.isTotem) list.push(z);
  }
  const n = list.length;
  if (n < 2) return;
  const k = Math.min(1, dt * 14) * 0.5;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      const dx = a.x - b.x, dz = a.z - b.z;
      const min = (a.r + b.r) * 0.92;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.001;
      const push = (min - d) * k;
      const ux = dx / d, uz = dz / d;
      if (!(a.frozen > 0)) { a.x += ux * push; a.z += uz * push; }
      if (!(b.frozen > 0)) { b.x -= ux * push; b.z -= uz * push; }
    }
  }
}
function step(dt) {
  if (!rt.S || !rt.S.playing || rt.S.paused) return;
  if (rt.S.boss?.alive && !rt.S.boss.hp) {
    rt.stepBoss(rt.S.boss,dt);
    if (rt.S.boss?.alive && rt.art.tickChar) rt.art.tickChar(rt.S.boss.obj,'boss','boss:'+rt.S.boss.state,dt,0,0);
    return;
  }
  rt.S.elapsed += dt; rt.S.timeLeft -= dt;
  if (rt.S.iframe > 0) rt.S.iframe -= dt;
  if (rt.S.rushT > 0) rt.S.rushT = Math.max(0, rt.S.rushT - dt);
  if (rt.S.parryCd > 0) rt.S.parryCd = Math.max(0, rt.S.parryCd - dt);
  if (rt.S.vulnT > 0) { rt.S.vulnT = Math.max(0, rt.S.vulnT - dt); if (rt.S.vulnT <= 0) rt.S.vulnStacks = 0; rt.renderVulnBadge(); }
  rt.syncBossOrbitSpirits(dt);
  if (rt.S.parryBufT > 0) {
    rt.S.parryBufT = Math.max(0, rt.S.parryBufT - dt);
    if (rt.S.parryCd <= 0 && rt.S.playing && !rt.S.paused) { rt.S.parryBufT = 0; rt.doParry(); }
  }
  if (rt.S.armorJudgeT > 0) rt.S.armorJudgeT = Math.max(0, rt.S.armorJudgeT - dt);
  if (rt.S.parryFlash > 0) rt.S.parryFlash = Math.max(0, rt.S.parryFlash - dt);
  if (rt.S.cleaveFx > 0) rt.S.cleaveFx = Math.max(0, rt.S.cleaveFx - dt);
  if (rt.S.cleaveFx <= 0 && rt.S._cleaveLv > 0 && !rt.S.paused && rt.S.playing) {
    const n = rt.S._cleaveLv;
    rt.S._cleaveLv = 0;
    if (n > 1) rt.S._pendingLv = (rt.S._pendingLv || 0) + (n - 1);
    rt.openLevelUp();
  }
  if (rt.S.fogPulse > 0) rt.S.fogPulse = Math.max(0, rt.S.fogPulse - dt / 0.6);
  if (rt.S.comboGrace > 0) rt.S.comboGrace = Math.max(0, rt.S.comboGrace - dt);
  if (rt.S.inputQueue) {
    const busy = !!rt.S.dash || (rt.S.dashQueue && rt.S.dashQueue.length) || !!(rt.S.terrain && rt.S.terrain.stumbleT > 0);
    rt.S.inputQueue.prune(rt.now(), busy);
    rt.S.inputBuf = rt.S.inputQueue.peek();
  } else if (rt.S.inputBuf) {
    const busy = !!rt.S.dash || (rt.S.dashQueue && rt.S.dashQueue.length);
    const age = rt.now() - rt.S.inputBuf.t0;
    if ((!busy && age > (rt.S.inputBuf.ttl || 450) + 350) || age > 1400) rt.S.inputBuf = null;
  }
  if (rt.S.landRipple && rt.S.landRipple.t > 0) {
    rt.S.landRipple.t -= dt / (rt.S.landRipple.dur || 0.45);
    if (rt.S.landRipple.t <= 0) rt.S.landRipple = null;
  }
  if (rt.S.bounce && !rt.S.dash) {
    rt.S.bounce.t += dt;
    const u = rt.clamp(rt.S.bounce.t / (rt.S.bounce.dur || 0.16), 0, 1);
    const k = 1 - (1 - u) * (1 - u);
    rt.S.hero.x = rt.S.bounce.from.x + (rt.S.bounce.to.x - rt.S.bounce.from.x) * k;
    rt.S.hero.z = rt.S.bounce.from.z + (rt.S.bounce.to.z - rt.S.bounce.from.z) * k;
    if (rt.three && rt.three.heroSpr) rt.placeGroup(rt.three.heroSpr, rt.S.hero.x, rt.S.hero.z, 0);
    if (u >= 1) rt.S.bounce = null;
  }
  if (rt.S.hurtFlash > 0) {
    rt.S.hurtFlash -= dt;
    if (rt.S.hurtFlash <= 0) {
      rt.S.hurtFlash = 0;
      const app = $('app');
      if (app) app.classList.remove('hurt');
    }
  }
  if (rt.S.practiceT > 0) rt.S.practiceT -= dt;
  if (rt.S.sightWave > 0 && !rt.qa.freezeWave) rt.S.sightWave = Math.max(0, rt.S.sightWave - dt / (rt.CFG.sightWaveDur || 0.45));
  if (rt.S.combo > 0) {
    /* 선입력으로 이어진 연쇄는 판정을 조금 더 봐준다. */
    if (!(rt.S.comboGrace > 0)) {
      rt.S.comboIdle = (rt.S.comboIdle || 0) + dt;
      const cTimeout = (rt.CFG.comboTimeout || 2.8) + ((rt.relicOn(rt.save, 'multi_seal') && (rt.S.multiSealStreak || 0) >= 3) ? 0.4 : 0);
      if (rt.S.comboIdle > cTimeout) { rt.comboBreak(); rt.S.comboIdle = 0; }
    }
  }
  if (rt.S.comboFlash > 0) {
    rt.S.comboFlash = Math.max(0, rt.S.comboFlash - dt);
    if (rt.S.comboFlash <= 0 && $('comboLabel')) $('comboLabel').classList.remove('tier');
  }
  if (rt.S.tempElem && rt.S.tempElem.t > 0) {
    rt.S.tempElem.t -= dt;
    if (rt.S.tempElem.t <= 0) { rt.S.tempElem = null; rt.renderHud(); }
  }
  if (rt.S.bellT > 0) {
    rt.S.bellT -= dt;
    if (rt.S.bellT <= 0) rt.endBell();
  }
  const bossTriggerAt = rt.devBossNow ? 1.2 : ((rt.S.stage && rt.S.stage.bossAt) || rt.CFG.bossAt);
  if (!rt.S.sandbox && !rt.S.challenge && !rt.S.bossSpawned && rt.S.elapsed >= bossTriggerAt) {
    /* §7.2: 보스 무늬 수에 모드 보정(수련 −2 · 고수 +2). 최소 2개. */
    const nShapes = Math.max(2, (((rt.S.stage && rt.S.stage.bossShapes) || rt.CFG.bossShapes) + (rt.S.bossShapeAdj || 0) - (rt.relicOn(rt.save, 'tower') ? 1 : 0)));
    rt.S.bossSeenAt = rt.S.elapsed;
    rt.telemetry.event('boss_seen', { stage: rt.S.stageNo, mode: rt.S.mode, at: +(rt.S.elapsed || 0).toFixed(1), left: +(rt.S.timeLeft || 0).toFixed(1), shapes: nShapes });
    rt.spawnBoss({ r: rt.CFG.bossSpawnR, nShapes: nShapes });
    rt.toast('부적을 단 귀물이 다가옵니다 — 결계가 내려앉습니다');
  }
  const bossAlive = !!(rt.S.boss && rt.S.boss.alive);
  if (bossAlive && !rt.S.sandbox) rt.stepBossSummons(dt);
  /* 중간 정예(보스 전 엘리트) — 스테이지별 1회 */
  if (!rt.S.sandbox && !bossAlive && rt.S.eliteAt > 0 && !rt.S.eliteDone && rt.S.elapsed >= rt.S.eliteAt) {
    rt.S.eliteDone = true;
    rt.spawnEliteEvent();
  }
  /* 포위 웨이브 (스테이지별 스케줄). 보스 결계 안에서는 잔몹을 부르지 않는다. */
  if (!rt.S.sandbox && !bossAlive && rt.S.challenge !== 'bossrush') {
    rt.stageWaves().forEach(function (w) {
      if (!rt.S.waveDone[w.t] && rt.S.elapsed >= w.t) rt.fireWave(w);
    });
  }
  const wave = 1 + 0.7 * rt.clamp(rt.S.elapsed / rt.runLimit(), 0, 1);
  if (!rt.S.sandbox && !bossAlive) {
    rt.S.zAcc += dt * 1000;
    rt.S.sAcc += dt * 1000;
    const SP = (rt.S.stage && rt.S.stage.spawn) || {};
    const practicing = (rt.S.practiceT > 0) && (rt.S.practiceSpawns > 0);
    const delayed = rt.S.elapsed < (rt.CFG.spawnZombieDelay || 12);
    const early = rt.S.elapsed < (rt.CFG.earlyZombieUntil || 25);
    let zMax = SP.max || rt.CFG.spawnZombieMax || 20;
    let zBase = SP.ms || rt.CFG.spawnZombieMs;
    if (practicing) { zMax = rt.CFG.practiceZombieMax || 2; zBase = rt.CFG.practiceZombieMs || 3200; }
    else if (delayed) { rt.S.zAcc = 0; zMax = 0; }
    else if (early) { zMax = SP.earlyMax || rt.CFG.earlyZombieMax || 4; zBase = Math.max(zBase, SP.earlyMinMs || rt.CFG.earlyZombieMinMs || 2000); }
    const zms = Math.max(rt.CFG.spawnZombieMinMs || 450, zBase / (practicing || delayed ? 1 : wave));
    /* v0.43 최적화: 잔몹 수를 한 번만 세고(예전엔 매 프레임 some+filter 로 배열 2개를 새로 만들었다)
       스폰할 때마다 +1 한다. 스폰 루프 안에서 다시 filter 하지 않는다. */
    let aliveNormal = 0;
    for (let i = 0; i < rt.S.zombies.length; i++) {
      const z = rt.S.zombies[i];
      if (z && z.alive && !z.isBoss) aliveNormal++;
    }
    /* 귀물이 하나도 남지 않았으면 다음 스폰을 기다리지 않고 바로 한 마리 내보낸다(비는 시간 0). */
    if (zMax > 0 && aliveNormal === 0) rt.S.zAcc = Math.max(rt.S.zAcc, zms);
    let guardSpawn = 0;
    while (zMax > 0 && rt.S.zAcc >= zms && aliveNormal < zMax && guardSpawn++ < 8) {
      rt.S.zAcc -= zms; rt.spawnZombie(); aliveNormal++;
    }
    rt.stepSpirits(dt);
  } else {
    rt.stepSpirits(dt);
  }
  /* v0.31 QA: autoEvery(초)를 주면 자동 플레이가 그 간격으로만 획을 낸다 — 사람의 손 속도 대역. */
  const autoGo = rt.qa.autoStroke && (!rt.qa.autoEvery || rt.S.elapsed >= (rt.S._autoNext || 0));
  if (autoGo) {
    let guard = 0;
    const burst = (rt.qa.timeScale && rt.qa.timeScale > 4) ? 32 : 1;
    while (guard < burst && rt.S.playing && !rt.S.paused) {
      guard++;
      if (rt.S.dash) {
        finishCurrentDash();
        if (!rt.S.playing || rt.S.paused) break;
        continue;
      }
      if (rt.S.dashQueue && rt.S.dashQueue.length) { rt.startSeg(); continue; }
      let sh = null;
      /* v0.26 QA 자동 대응: 봉인·기모으기·영창·은신·분신은 정답 입력을 대신 넣는다. */
      const qb = rt.S.boss;
      if (qb && qb.alive && rt.qa.autoBoss !== false && rt.bossPatList(qb)) {
        if (qb.state === 'seal') { rt.sealStroke(); break; }
        if (qb.state === 'sealing' || qb.state === 'slamTele') break;
        if (qb.state === 'kiai') { if (qb.kiai && qb.stateT >= qb.kiai.t - rt.kiaiWin(rt.bossPat().kiai) * 0.5) rt.kiaiTap(); break; }
        if (qb.state === 'chant' && qb.chant) { rt.chantStroke(qb.chant.seq[qb.chant.i]); break; }
        if (qb.state === 'veil' || qb.state === 'clones') { rt.revealBoss(qb); rt.dashAtBoss(qb, 'hline'); continue; }
      }
      if (rt.S.boss && rt.S.boss.alive) {
        const lock = rt.livingMarks().filter(function (s) { return s.target && s.target.isBoss; })[0];
        sh = lock ? rt.spiritShape(lock) : (rt.S.boss.seq && rt.S.boss.seq[rt.S.boss.seqI]);
      } else {
        const counts = {};
        rt.livingMarks().forEach(function (s) {
          const k = rt.spiritShape(s);
          counts[k] = (counts[k] || 0) + 1;
        });
        let n = 0;
        Object.keys(counts).forEach(function (k) { if (counts[k] > n) { n = counts[k]; sh = k; } });
      }
      if (!sh) break;
      rt.beginDash(sh);
      if (rt.qa.autoEvery) rt.S._autoNext = rt.S.elapsed + rt.qa.autoEvery;
      if (!rt.S.dash && !(rt.S.dashQueue && rt.S.dashQueue.length)) break;
    }
  }
  rt.tickStatuses(dt);
  const rushMul = (rt.S.rushT > 0) ? 1.24 : 1.0;
  const zsp = rt.CFG.zombieSpeed * wave * rushMul * (rt.S.elapsed < 20 ? 0.65 : 1) * rt.modeSpd() * rt.terrainSpeedMul();
  /* §6.1 지형 주기 효과(4장 달빛·5장 안개·9장 재생·11장 포대·12장 끌림) */
  rt.onTick(dt);
  /* §6.2 장별 부목표 */
  rt.tickGoal(dt);
  const goalPos = (rt.S.goal && rt.S.goal.id === 'guard' && rt.S.goal.pos) ? rt.S.goal.pos : null;
  rt.S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (z.isClone || z.isPillar || z.isTotem) {
      if (rt.S.arena && z.edgeAngle!=null) {const r=rt.arenaR()-.35;z.x=rt.S.arena.x+r*Math.cos(z.edgeAngle);z.z=rt.S.arena.z+r*Math.sin(z.edgeAngle);}
      rt.placeGroup(z.obj, z.x, z.z);
      if (z.isClone && rt.art.tickChar) rt.art.tickChar(z.obj, 'boss', 'idle', Math.min(0.05, dt), rt.S.hero.x - z.x, rt.S.hero.z - z.z);
      return;
    }
    const d = rt.dist(z, rt.S.hero) || 0.001;
    const frozen = z.frozen > 0 || (z.stun || 0) > 0;
    if (z.flinchT > 0) z.flinchT = Math.max(0, z.flinchT - dt);
    /* v0.43 적 AI: 접촉 피해 몹도 '치기 전 동작'을 한다.
       사거리에 들어오면 0.34초 몸을 웅크려(공격 포즈) 거의 멈추고, 그 뒤에야 닿는다.
       → 때리는 순간이 눈에 보이고, 플레이어가 비켜설 틈이 생긴다. */
    const clubAttack = !z.isBoss && z.type === 'brute';
    let clubImpact = false;
    if (clubAttack && (frozen || z.flinchT > 0)) z.atkTele = 0;
    if (!z.isBoss && !frozen) {
      z.atkCd = Math.max(0, (z.atkCd || 0) - dt);
      if (z.atkTele > 0) {
        z.atkTele -= dt;
        if (z.atkTele <= 0) {
          z.atkTele = 0;
          clubImpact = clubAttack && !(z.flinchT > 0);
        }
      } else if (z.atkCd <= 0 && d < z.r + 1.55 && !rt.S.dash && !(clubAttack && z.flinchT > 0)) {
        const windup = clubAttack ? rt.CLUB_IMPACT_TIME : (rt.CFG.atkTele || 0.34);
        z.atkTele = windup;
        z.atkCd = windup + (rt.CFG.atkCool || 0.95);
        if (clubAttack) z.clubAim = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x);
      }
    }
    const bossHandled = z.isBoss ? (frozen || rt.stepBoss(z, dt)) : (rt.qa.noMove ? false : rt.stepEnemySpecial(z, dt, d, frozen, zsp));
    if (!rt.qa.noMove && !frozen && !bossHandled && !(z.flinchT > 0 && !z.isBoss)) {
      const kd = rt.CFG.zombieTypes[z.type] || rt.CFG.zombieTypes.imp;
      /* The boss speeds up the farther it is outside the ring, so a dashing hero cannot outrun it. */
      let sp = z.isBoss ? (rt.CFG.bossSpeed || 1) * (1 + (rt.CFG.bossCatchUp || 0) * Math.max(0, d - rt.ringR())) : zsp * kd.speed * rt.slowMulOf(z) * rt.terrainSlowMul(z);
      /* 공격 예비 동작 동안은 발이 묶인다(웅크린 채로 밀고 들어오지 않는다). */
      if (!z.isBoss && z.atkTele > 0) sp *= rt.CFG.atkTeleSp || 0.22;
      /* §6.2 수호: 석등을 노리는 무리는 주인공이 아니라 석등으로 간다. */
      const tgt = (z.goalTarget && goalPos) ? goalPos : rt.S.hero;
      const md = Math.hypot(tgt.x - z.x, tgt.z - z.z) || 0.001;
      const ux = (tgt.x - z.x) / md, uz = (tgt.z - z.z) / md;
      /* v0.43: 살짝 측면으로 우회 기동 — 한 줄로 곧장 몰려오지 않는다. */
      if (!z.isBoss) {
        if (!z.sw) z.sw = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7);
        const lat = Math.sin((rt.S.elapsed || 0) * 1.15 + (z.id || 0) * 1.7) * (rt.CFG.mobWeave || 0.26) * z.sw;
        z.x += (ux - uz * lat) * sp * dt;
        z.z += (uz + ux * lat) * sp * dt;
      } else {
        z.x += ux * sp * dt;
        z.z += uz * sp * dt;
      }
    }
    if (z.isBoss && z.state !== 'slamTele') z.leapY = 0;
    /* v0.64: 모든 귀물·보스가 지형지물을 뚫고 지나가지 않도록 부드럽게 우회 충돌 해소 */
    if (!z.isClone && !z.isPillar && !z.isTotem) {
      const col = rt.resolvePropCollision(z.x, z.z, z.r || (z.isBoss ? 1.05 : 0.55));
      z.x = col.x; z.z = col.z;
    }
    rt.placeGroup(z.obj, z.x, z.z, z.isBoss ? (z.leapY || 0) : 0);
    if (rt.art.tickChar) {
      const kind = z.isBoss ? 'boss' : 'zombie';
      /* v0.42 + v0.50: 보스는 도약 하강 중 slam(내려찍기) 자세로 전환, 돌진/예고 시 목표 방향 고정 */
      if (z._strikeFxT > 0) z._strikeFxT = Math.max(0, z._strikeFxT - dt);
      const bossSt = (z._strikeFxT > 0) ? (z._strikeAnim || 'strike') : ((z.state === 'slamTele' && (z.leapY || 0) > 0.1) ? 'slam' : (z.state || 'idle'));
      const st = z.isBoss ? ('boss:' + bossSt)
        : (frozen ? 'frozen'
          : (z.flinchT > 0 ? 'hit'
            : ((z.windT || 0) > 0 || (z.dashPhase || 0) > 0 || (z.atkTele || 0) > 0 ? 'attack'
              : (z.burn > 0 ? 'burning' : (z.poison > 0 ? 'poisoned' : 'walk')))));
      const locked = clubAttack && (clubImpact || z.atkTele > 0);
      let vx = locked ? Math.cos(z.clubAim) : rt.S.hero.x - z.x;
      let vz = locked ? Math.sin(z.clubAim) : rt.S.hero.z - z.z;
      if (z.isBoss) {
        if (z.state === 'charge' && z.chargeDir) { vx = z.chargeDir.x; vz = z.chargeDir.z; }
        else if (z.state === 'mimicCharge' && z.mimic && z.mimic.dir) { vx = z.mimic.dir.x; vz = z.mimic.dir.z; }
        else if (z.state === 'telegraph' && z.aim) { vx = z.aim.x - z.x; vz = z.aim.z - z.z; }
        else if (z.state === 'slamTele' && z.slam) { vx = z.slam.x - z.x; vz = z.slam.z - z.z; }
        else if (z.state === 'sweepTele' && z.sweep) { vx = Math.cos(z.sweep.aimA); vz = Math.sin(z.sweep.aimA); }
      }
      rt.art.tickChar(z.obj, kind, st, Math.min(0.05, dt), vx, vz);
    }
    /* Hit flash over the status tint (tintZombie resets the colour next frame). */
    if (z.flinchT > 0 && z.obj && z.obj.userData && z.obj.userData.sprite) {
      const fk = 1 + 1.6 * (z.flinchT / (rt.CFG.flinchDur || 0.14));
      if (z.obj.userData.rig || z.obj.userData.m3d) rt.art.tintChar(z.obj, fk, fk, fk * 0.95);
      else z.obj.userData.sprite.material.color.setRGB(fk, fk, fk * 0.95);
    }
    if (rt.art.setTelegraph && !z.isBoss) rt.art.setTelegraph(z.obj, !frozen && (clubAttack ? z.atkTele > 0 : d < (rt.CFG.telegraphRange || 3.2) || z.windT > 0 || z.dashPhase > 0));
    const inContact = d < z.r + 0.55;
    const clubConnects = clubImpact && d < z.r + 1.55 &&
      (d <= 0.01 || Math.cos(z.clubAim) * (rt.S.hero.x - z.x) + Math.sin(z.clubAim) * (rt.S.hero.z - z.z) >= d * 0.5);
    if ((inContact || clubConnects) && !(z.isBoss && (z.hidden || z.state === 'seal' || z.state === 'sealing' || z.state === 'groggy'))) {
      /* 빙결·경직된 귀물은 몸이 굳은 사이 닿아도 해치지 못한다(얼음·충격이 실제로 방어가 된다). */
      if ((rt.S.iframe || 0) <= 0 && !rt.S.dash && !frozen && (!clubAttack || clubConnects)) {
        if (z.eliteAttr === 'ice') { rt.addSlow(0.6, 1.2); rt.showJudge('얼음 — 느려진다'); }
        if (rt.mirrorSave('contact')) return;
        rt.noteHit();
        rt.S.hp -= rt.modeDmg(z.isBoss ? (rt.CFG.bossDmg || 2) : ((rt.CFG.zombieTypes[z.type] || {}).dmg || rt.CFG.dmg)) + rt.relicDmgAdd();
        if (rt.S.hp <= 0) rt.S.deathWhy = z.isBoss ? 'boss-contact' : ('zombie:' + z.type);
        rt.S.iframe = rt.CFG.iframeMs / 1000;
        rt.S.hitstop = Math.max(rt.S.hitstop || 0, rt.CFG.hitHitstop || 0.08);
        rt.S.hurtFlash = rt.CFG.hurtVignette || 0.3;
        const app = $('app');
        if (app) app.classList.add('hurt');
        const kn = rt.CFG.hitKnock || 0.6;
        rt.S.hero.x += (rt.S.hero.x - z.x) / d * kn;
        rt.S.hero.z += (rt.S.hero.z - z.z) / d * kn;
        if (rt.three && rt.three.heroSpr) rt.placeGroup(rt.three.heroSpr, rt.S.hero.x, rt.S.hero.z);
        if (rt.audio && rt.audio.drum) rt.audio.drum();
        rt.renderHud();
        if (rt.S.hp <= 0) { endRun(false, clubAttack ? '장정의 몽둥이에 맞았습니다. 예고가 끝나기 전에 일섬으로 벗어나세요.' : '귀물에게 닿았습니다.'); return; }
      }
      /* 일섬은 몸을 뚫고 지나간다 — 돌진 중에는 밀어내지 않는다(안 그러면 적을 앞으로 밀고 간다). */
      if (inContact && !rt.S.dash) {
        const push = Math.max(1.2, z.r + 0.65);
        z.x = rt.S.hero.x - (rt.S.hero.x - z.x) / d * push;
        z.z = rt.S.hero.z - (rt.S.hero.z - z.z) / d * push;
      }
    }
  });
  /* v0.34 §6.3 정예 속성: 방울 정예는 주기적으로 몸을 봉인한다 */
  (rt.S.zombies || []).forEach(function (z) {
    if (!z.alive || !z.eliteAttr) return;
    if (z.invuln > 0) z.invuln = Math.max(0, z.invuln - dt);
    if (z.eliteAttr === 'bell') {
      z.bellCd = (z.bellCd || 2.4) - dt;
      if (z.bellCd <= 0) {
        z.bellCd = 2.4; z.invuln = 0.5;
        if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'hline');
        rt.inkFx.ring(2.0, rt.FX_COLORS.gold, 0.4);
      }
    }
  });
  /* v0.43: 무리 간 간격 유지 — 한 점에 겹쳐 뭉치지 않게 서로를 살짝 민다. */
  if (!rt.qa.noMove) separateCrowd(dt);
  /* v0.48: 무리도 고정 아레나 밖으로 나가지 않는다(절벽·난간 앞에서 멈춘다). */
  if (rt.S.zombies.length) {
    const wb = rt.worldBounds();
    if (wb) {
      const lim = wb.r + 0.35;
      for (let i = 0; i < rt.S.zombies.length; i++) {
        const z = rt.S.zombies[i];
        if (!z.alive || z.isClone || z.isPillar || z.isTotem) continue;
        const dx = z.x - wb.x, dz = z.z - wb.z, ro = Math.hypot(dx, dz);
        if (ro > lim) { const k = lim / ro; z.x = wb.x + dx * k; z.z = wb.z + dz * k; }
      }
    }
  }
  rt.stepShots(dt);
  rt.stepHazards(dt);
  rt.stepShrink(dt);
  rt.stepReflects(dt);
  rt.stepGapBuffer();
  /* v0.31 §5.3 새 카드: 자동 스킬·메아리·먹 발자국 */
  rt.stepWard(dt);
  rt.stepBolt(dt);
  rt.stepBolts(dt);
  rt.stepEchoes(dt);
  rt.stepInkSteps(dt);
  /* v1.30 잔심(지연 파열) 인플레이스 갱신 — 주인공 흐름을 끊지 않고 0.07초 뒤 먹물 폭발 */
  if (rt.S.zanshin && rt.S.zanshin.length) {
    let zw = 0;
    for (let zi = 0; zi < rt.S.zanshin.length; zi++) {
      const zf = rt.S.zanshin[zi];
      zf.t -= dt;
      if (zf.t > 0) { rt.S.zanshin[zw++] = zf; continue; }
      const big = zf.tier >= 3;
      rt.inkFx.burst(zf.x, zf.z, big ? rt.FX_COLORS.gold : rt.FX_COLORS.jade, { r1: big ? 48 : 34, n: big ? 10 : 6, dur: big ? 0.38 : 0.28, big: big });
      if (rt.three && rt.three.vfx3d) rt.three.vfx3d.spawnSparks(zf.x, zf.z, big ? 16 : 8, { color: zf.col || 0xffd25a, speed: big ? 7.6 : 5.6 });
      if (big && rt.three && rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(zf.x, zf.z, { r0: 0.4, r1: 3.4, colorHex: zf.col || 0xffd25a, coreHex: 0xfffce8, dur: 0.30 });
      if (zf.sfx && rt.audio && rt.audio.hit) rt.audio.hit(true, (rt.S.combo || 0) + (big ? 4 : 1));
    }
    rt.S.zanshin.length = zw;
  }
  if (rt.S.quick) rt.tickQuick();
  if (rt.S.goldEdge > 0) rt.S.goldEdge = Math.max(0, rt.S.goldEdge - dt);
  if (rt.S.sealFx > 0) rt.S.sealFx = Math.max(0, rt.S.sealFx - dt);
  rt.clampHeroToArena();
  rt.refreshSpirits();
  for (let ii = 0; ii < rt.S.items.length; ii++) {
    const it = rt.S.items[ii];
    if (!it || !it.alive) continue;
    /* 자석으로 날아오는 중 */
    if (it.home) {
      it.home.t += dt;
      const u = rt.clamp(it.home.t / (it.home.dur || 0.18), 0, 1);
      const k = u * u;
      it.x = it.home.from.x + (rt.S.hero.x - it.home.from.x) * k;
      it.z = it.home.from.z + (rt.S.hero.z - it.home.from.z) * k;
      if (u >= 1) { rt.collectItem(it, null); continue; }
    } else {
      /* v0.23: 밟으면 줍는다(1.25m), 오래된 픽업은 안개 속으로 사라진다(24초). */
      const age = (rt.S.elapsed || 0) - (it.born || 0);
      if (age > (rt.CFG.itemLife || 24)) {
        it.alive = false;
        if (it.obj && rt.three) rt.three.scene.remove(it.obj);
        continue;
      }
      if (Math.hypot(it.x - rt.S.hero.x, it.z - rt.S.hero.z) <= (rt.CFG.autoPickR || 1.25)) { rt.collectItem(it, null); continue; }
    }
    rt.placeGroup(it.obj, it.x, it.z, 0.2 + Math.sin(rt.S.elapsed * 3 + it.id) * 0.08);
  }
  if (rt.S.items.length > 48) {
    let iw = 0;
    for (let ii = 0; ii < rt.S.items.length; ii++) { if (rt.S.items[ii] && rt.S.items[ii].alive) rt.S.items[iw++] = rt.S.items[ii]; }
    rt.S.items.length = iw;
  }
  /* 시체 누적 정리(무한맵에서 장시간 플레이해도 배열이 자라지 않게) */
  if (rt.S.zombies.length > 120) {
    let zw = 0;
    for (let zi = 0; zi < rt.S.zombies.length; zi++) { if (rt.S.zombies[zi] && rt.S.zombies[zi].alive) rt.S.zombies[zw++] = rt.S.zombies[zi]; }
    rt.S.zombies.length = zw;
  }
  rt.renderHud();
  /* Check time after autoStroke/combat so a large timeScale dt cannot skip the last boss hit. */
  if (rt.S.playing && rt.S.timeLeft <= 0) {
    if (rt.S.boss && !rt.S.boss.alive) endRun(true, '시간을 버텼습니다.');
    else endRun(false, '시간이 끝났습니다.');
  }
  rt.maybeEnd();
}

function finishCurrentDash() {
  if (!rt.S || !rt.S.dash) return;
  const d = rt.S.dash;
  rt.S.hero.x = d.to.x; rt.S.hero.z = d.to.z;
  if (rt.three && rt.three.heroSpr) rt.placeGroup(rt.three.heroSpr, rt.S.hero.x, rt.S.hero.z);
  rt.resolveDash(d);
  rt.landDash(d);
  rt.S.dash = null;
  rt.startSeg();
}
function stepDash(dt) {
  if (!rt.S || !rt.S.dash) return;
  if (rt.S.paused) return;
  const d = rt.S.dash;
  d.t += dt;
  const u = rt.clamp(d.t / d.dur, 0, 1);
  const sh = d.shape || (rt.S.lastDash && rt.S.lastDash.type) || null;
  /* v1.38 무늬별 이동 궤적 분화: ㅣ(쾌속 직선 돌진) · —(횡참 곡선) · V(도약 포물선 점프) · Z(번개 3꺾임 지그재그) */
  const k = sh === 'vline' ? (1 - Math.pow(1 - u, 3)) : (u * u * (3 - 2 * u));
  const dx = d.to.x - d.from.x, dz = d.to.z - d.from.z;
  const distL = Math.hypot(dx, dz) || 1;
  const px = -dz / distL, pz = dx / distL;
  let lat = 0, liftY = 0;
  if (sh === 'vee') {
    liftY = Math.sin(u * Math.PI) * 1.65;
  } else if (sh === 'bolt') {
    lat = Math.sin(u * Math.PI * 3) * Math.sin(u * Math.PI) * 1.05;
  } else if (sh === 'hline') {
    lat = Math.sin(u * Math.PI) * 0.55;
  }
  rt.S.hero.x = d.from.x + dx * k + px * lat;
  rt.S.hero.z = d.from.z + dz * k + pz * lat;
  if (rt.three && rt.three.heroSpr) rt.placeGroup(rt.three.heroSpr, rt.S.hero.x, rt.S.hero.z, liftY);
  if (u >= 0.85) rt.resolveDash(d);
  /* v0.49.2 테일 캔슬: 판정이 끝난 뒤(u>=0.88) 예약된 후속 획이 대기 중이면 잔여 프레임을 생략하고 즉시 다음 일섬으로 연결 */
  const tailCancel = u >= 0.88 && d.judged && !(rt.S.dashQueue && rt.S.dashQueue.length) && rt.S.inputQueue && rt.S.inputQueue.size() > 0;
  if (u >= 1 || tailCancel) {
    if (tailCancel) {
      d.tailCanceled = true;
      rt.S.hero.x = d.to.x; rt.S.hero.z = d.to.z;
      if (rt.three && rt.three.heroSpr) rt.placeGroup(rt.three.heroSpr, rt.S.hero.x, rt.S.hero.z);
    }
    rt.landDash(d); rt.S.dash = null; rt.startSeg();
  }
}

/* v0.48 부드러운 카메라 — 프레임 독립 지수 감속(exp)으로 두 단계(따라가기·시선)를 나눠 굴린다.
   v0.47까지는 `cam += (hero - cam) * dt * 6` 이라 저프레임에서 뚝뚝 끊기고(곱셈 계수가 dt 에 비례),
   돌진 시작·착지에서 화면이 튀었다. 이제 ① dt 와 무관한 계수 ② 돌진 방향으로 살짝 앞을 보는 시선
   ③ 무대 밖 허공을 비추지 않는 경계 패딩(초점 클램프)을 함께 쓴다. */
function camLerpK(tau, dt) { return 1 - Math.exp(-Math.max(0, dt) / Math.max(0.0001, tau)); }
function updateCam(dt) {
  if (!rt.three) return;
  if (rt.QA_CAM) {
    rt.three.camera.position.set(rt.QA_CAM.x, rt.QA_CAM.y, rt.QA_CAM.z);
    rt.three.camera.lookAt(rt.QA_CAM.tx, rt.QA_CAM.ty, rt.QA_CAM.tz);
    return;
  }
  const targetX = rt.S ? rt.S.hero.x : 0, targetZ = rt.S ? rt.S.hero.z : 0;
  const titleCam = !rt.S || (!rt.S.playing && $('ov-title') && $('ov-title').classList.contains('show'));
  if (titleCam) {
    /* v0.77 로비 배경 카메라: 중앙 2D 수묵 영웅 쇼케이스 뒤로 현재 장의 3D 전장이 은은하게 회전한다. */
    const t = rt.now() * 0.001;
    const a = Math.PI * 0.5 + Math.sin(t * 0.14) * 0.42;
    const rad = 18.8;
    const gy = rt.groundYAt(0, 0);
    if (rt.three.heroSpr) rt.three.heroSpr.visible = false;
    rt.three.camera.position.set(Math.cos(a) * rad, gy + rt.CFG.camOff.y * 0.90, Math.sin(a) * rad);
    rt.three.camera.lookAt(0, gy + 1.1, 0);
    return;
  }
  /* 1단계 — 따라갈 목표: 영웅 + 돌진 방향 1.1m 앞 + 보스 쪽 2.6m */
  let tx = targetX, tz = targetZ;
  if (rt.S.dash) {
    const dx = rt.S.dash.to.x - rt.S.dash.from.x, dz = rt.S.dash.to.z - rt.S.dash.from.z;
    const L = Math.hypot(dx, dz);
    if (L > 1e-4) { tx += dx / L * 1.1; tz += dz / L * 1.1; }
  }
  const b = rt.S.boss;
  if (b && b.alive && !b.hidden && rt.arenaActive()) {
    const bx = b.x - targetX, bz = b.z - targetZ, bd = Math.hypot(bx, bz) || 1;
    const k = Math.min(2.6, bd * 0.3);
    tx += bx / bd * k; tz += bz / bd * k;
  }
  /* 2단계 — 경계 패딩: 초점이 무대 가장자리를 넘어 허공을 비추지 않게 클램프한다.
     영웅이 울타리에 닿으면 화면 안에서 영웅이 가장자리로 걸어가고, 배경(절벽·병풍)은 그대로 남는다. */
  const wb = rt.worldBounds();
  if (wb) {
    const R = Math.max(4, wb.r - 5.6);
    const dx = tx - wb.x, dz = tz - wb.z, ro = Math.hypot(dx, dz);
    if (ro > R) { tx = wb.x + dx * R / ro; tz = wb.z + dz * R / ro; }
  }
  /* 3단계 — 부드러운 추적(지수 감속). 따라가기 0.10s · 시선 0.17s 순차 이중 감쇠 = 관성 있는 무빙. */
  rt.S.cam.x += (tx - rt.S.cam.x) * camLerpK(0.10, dt);
  rt.S.cam.z += (tz - rt.S.cam.z) * camLerpK(0.10, dt);
  if (!rt.S.focus) rt.S.focus = { x: rt.S.cam.x, z: rt.S.cam.z };
  rt.S.focus.x += (rt.S.cam.x - rt.S.focus.x) * camLerpK(0.17, dt);
  rt.S.focus.z += (rt.S.cam.z - rt.S.focus.z) * camLerpK(0.17, dt);
  let sx = 0, sy = 0, sz = 0;
  if (rt.S.recoil && rt.S.recoil.t > 0) {
    rt.S.recoil.t -= dt;
    const u = Math.max(0, rt.S.recoil.t / (rt.S.recoil.dur || 0.12));
    const a = (rt.S.recoil.amp || 0.12) * u;
    sx += (rt.S.recoil.x || 0) * a;
    sz += (rt.S.recoil.z || 0) * a;
    if (rt.S.recoil.t <= 0) rt.S.recoil = null;
  }
  if (rt.S.shake > 0) {
    /* v0.60 game-feel: 트라우마 제곱 + 비배수 사인 합으로 매끄러운 시네마틱 흔들림(랜덤 노이즈 진동 제거) */
    rt.S.shake = Math.max(0, rt.S.shake - dt * 1.45);
    rt.S._shakePhase = (rt.S._shakePhase || 0) + dt * 32.0;
    const trauma = Math.min(1.0, rt.S.shake);
    const a = trauma * trauma * 1.15 * (rt.a11yShake() ? 0.25 : 1);
    const ph = rt.S._shakePhase;
    sx += Math.sin(ph * 1.7) * a;
    sy = Math.sin(ph * 2.3 + 0.8) * a * 0.65;
    sz += Math.sin(ph * 1.1 + 1.9) * a;
  }
  rt.three.camera.position.set(rt.S.focus.x + rt.CFG.camOff.x + sx, rt.CFG.camOff.y + sy, rt.S.focus.z + rt.CFG.camOff.z + sz);
  rt.three.camera.lookAt(rt.S.focus.x, rt.CFG.camLookY, rt.S.focus.z);
}

  return { endRun, step, stepDash, updateCam };
}
