import { createBossGimmickStep } from './bossGimmickStep.js?v=v180';
import { createBossOverlay } from './bossOverlay.js?v=v180';
import { createBossProjectiles } from './bossProjectiles.js?v=v180';
/* v2/js/modules/bossEngine.js — 심안: 묵검 v1.26 보스 AI · 19종 패턴/기믹 엔진 */

export function createBossEngine(rt) {
  const $ = rt.$;
function stepBoss(z, dt) {
  if (!z || !z.alive || !rt.S) return false;
  const B = (rt.S.stage && rt.S.stage.boss) || {};
  const bt = rt.bossTiming();
  const walkT = bt.walkT, teleT = bt.teleT, chargeSp = bt.chargeSp, chargeT = bt.chargeT, stunT = bt.stunT;
  z.state = z.state || 'walk';
  z.stateT = (z.stateT || 0) + dt;
  // The run clock pauses during the seal; its timeout must use the boss clock.
  if (z.state === 'seal' || z.state === 'sealing') return stepBossPat(z, dt);
  if (!z.hp || z.openUntil > rt.S.elapsed) return true;
  const pats = bossPatList(z);
  if (pats) {
    if (z.cue) z.cue.t += dt;
    const h = stepBossPat(z, dt);
    if (h !== null) return h;
  }
  if (z.state === 'walk') {
    /* A parry or landing stun holds the boss in place and pauses its walk clock; telegraph and charge are not interrupted. */
    if ((z.stun || 0) > 0) z.stateT -= dt;
    /* §4.2 빈틈 고리: 다 차면 하얗게 빛나며 짧은 방울 소리가 난다 — '지금이다'를 소리와 빛으로 같이 알린다. */
    if (z.gapFlashT > 0) z.gapFlashT = Math.max(0, z.gapFlashT - dt);
    if (!z.firstWalk) {
      const g = rt.gapInfo(z);
      if (g.open && (z.gapRangAt == null || (rt.S.elapsed - z.gapRangAt) >= (rt.CFG.gapPeriod || 1.6) - 0.02)) {
        z.gapRangAt = rt.S.elapsed; z.gapFlashT = rt.CFG.gapFlash || 0.5;
        if (rt.audio && !z.stun) rt.audio.bell(0, 'hline');
      }
    } else z.gapRangAt = null;
    if (pats) {
      if (z.stateT > (bossPat().walk || walkT)) nextBossPattern(z);
      return false;
    }
    if (z.stateT > walkT) {
      z.state = 'telegraph'; z.stateT = 0;
      z.aim = { x: rt.S.hero.x, z: rt.S.hero.z };
      /* 장판은 예고와 함께 깔려, 경직(반격 구간)이 오기 전에 모두 터진다. */
      bossHazards(z);
      if (rt.audio) rt.audio.drum();
    }
    return false;
  }
  if (z.state === 'telegraph') {
    const durT = teleT * (z.teleMul || 1);
    if (!z._warnTicked && z.stateT >= durT * 0.78) {
      z._warnTicked = true;
      if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'vline');
    }
    if (z.stateT > durT) {
      z.state = 'charge'; z.stateT = 0; z._trailT = 0; z._warnTicked = false;
      const dx = (z.aim ? z.aim.x : rt.S.hero.x) - z.x, dz = (z.aim ? z.aim.z : rt.S.hero.z) - z.z;
      const L = Math.hypot(dx, dz) || 1;
      z.chargeDir = { x: dx / L, z: dz / L };
      if (rt.audio) { if (rt.audio.bossCharge) rt.audio.bossCharge(); else rt.audio.slash(); }
      const reach = Math.min(8.5, chargeSp * chargeT);
      rt.makeBossSlash({ x: z.x, z: z.z }, { x: z.x + z.chargeDir.x * reach, z: z.z + z.chargeDir.z * reach }, { width: 3.1, height: 0.95 });
      rt.bossFx.pushChargePoint(z.x, z.z);
    }
    return true;
  }
  if (z.state === 'charge') {
    const sp = chargeSp;
    z.x += (z.chargeDir ? z.chargeDir.x : 0) * sp * dt;
    z.z += (z.chargeDir ? z.chargeDir.z : 0) * sp * dt;
    /* 결계 벽에 막히는 돌진 — 밖으로 빠져나가 영웅을 놓치는 일이 없다. */
    const ca = rt.clampPointToArena(z.x, z.z, 1.3);
    z.x = ca.x; z.z = ca.z;
    z._trailT = (z._trailT || 0) + dt;
    if (z._trailT >= 0.028) {
      z._trailT = 0;
      rt.bossFx.pushChargePoint(z.x, z.z);
      if (rt.three && rt.three.ink && rt.three.ink.hit && z.chargeDir) rt.three.ink.hit(z.x, z.z, z.chargeDir.x, z.chargeDir.z);
    }
    /* 패턴 보스: 돌진을 일섬으로 스치듯 피하면 간발 — 기세가 꺾인다. */
    if (pats && rt.S.dash && !z.dodged && rt.dist(z, rt.S.hero) < z.r + (bossPat().dodgeR || 1.4)) { z.dodged = true; bossJustDodge(z); }
    if ((rt.S.iframe || 0) <= 0 && !rt.S.dash && rt.dist(z, rt.S.hero) < z.r + 0.7) {
      if (mirrorSave('boss-charge')) return true;
      noteHit();
      rt.S.hp -= rt.modeDmg(rt.CFG.bossDmg || 2) + relicDmgAdd();
      rt.S.iframe = rt.CFG.iframeMs / 1000;
      rt.S.hurtFlash = rt.CFG.hurtVignette || 0.3;
      const d = rt.dist(z, rt.S.hero) || 1;
      rt.S.hero.x += (rt.S.hero.x - z.x) / d * 2.2;
      rt.S.hero.z += (rt.S.hero.z - z.z) / d * 2.2;
      if (rt.three && rt.three.heroSpr) rt.placeGroup(rt.three.heroSpr, rt.S.hero.x, rt.S.hero.z);
      if (rt.audio) rt.audio.drum();
      rt.renderHud();
      if (rt.S.hp <= 0) rt.endRun(false, '귀물의 돌진에 닿았습니다.');
    }
    if (z.stateT > chargeT) {
      /* v0.52 다단 패턴: 2페이즈 또는 4장 이상에서는 돌진 끝자락에 언월 검기 파동을 한 번 더 날린다 */
      if ((z.phase2 || (rt.S.stageNo || 1) >= 4) && z.chargeDir) {
        const ang = Math.atan2(z.chargeDir.z, z.chargeDir.x);
        rt.bossFx.triggerSweepBurst(z.x, z.z, ang, 5.2);
        spawnBossWave(z, ang);
      }
      z.state = 'stun'; z.stateT = 0;
    }
    return true;
  }
  if (z.state === 'stun') {
    if (z.stateT > (z.stunT || stunT)) {
      z.state = 'walk'; z.stateT = 0; z.stunT = 0;
      /* 스테이지 3 이후: 경직이 끝나면 잔몹을 부른다. */
      const adds = B.adds || 0;
      if (adds > 0 && !z.summoned) {
        z.summoned = true;
        for (let i = 0; i < adds; i++) {
          const a = (i / adds) * Math.PI * 2 + Math.random() * 0.4;
          rt.spawnZombie({ x: z.x + Math.cos(a) * 2.2, z: z.z + Math.sin(a) * 2.2, type: 'imp' });
        }
        rt.toast('원혼이 부른 귀물');
        if (rt.audio) rt.audio.drum();
      }
    }
    return true;
  }
  return false;
}
/* ---------- v0.23 후반 장 변주 적 ----------
   charger: 몸을 낮추고 곧장 달려든다. thrower: 거리를 두고 부적을 던진다.
   bomber: 붙으면 부풀어 터진다. 셋 다 몸빛(테두리)으로 미리 구분된다. */
function stepEnemySpecial(z, dt, d, frozen, zsp) {
  if (!rt.S || z.isBoss || frozen) return false;
  const kd = rt.CFG.zombieTypes[z.type];
  if (!kd) return false;
  /* Same walking rule as the basic kinds: tempo, early slow-down, ice slow, and a stop while flinching. */
  const sp = z.flinchT > 0 ? 0 : zsp * kd.speed * rt.slowMulOf(z) * rt.terrainSlowMul(z);
  const ux = (rt.S.hero.x - z.x) / (d || 1), uz = (rt.S.hero.z - z.z) / (d || 1);
  if (kd.dashSpeed) {
    z.dashCd = (z.dashCd || 0) - dt;
    if ((z.dashPhase || 0) > 0) {
      z.dashPhase -= dt;
      z.x += ux * kd.dashSpeed * dt;
      z.z += uz * kd.dashSpeed * dt;
      return true;
    }
    /* Crouch first: it stands still with a red rim, then runs. */
    if ((z.windT || 0) > 0) {
      z.windT -= dt;
      if (z.windT <= 0) z.dashPhase = kd.dashT || 0.3;
      return true;
    }
    if (z.dashCd <= 0 && d < (kd.dashRange || 7.5) && d > 1.1) {
      z.dashCd = kd.dashCd || 3.4;
      z.windT = kd.windT || 0.35;
      if (rt.audio && !rt.qa.noDelay && rt.audio.drum) rt.audio.drum();
      return true;
    }
    z.x += ux * sp * dt; z.z += uz * sp * dt;
    return true;
  }
  if (kd.throwRange) {
    z.throwCd = (z.throwCd || 0) - dt;
    if (z.throwCd <= 0 && d < kd.throwRange && d > 2.0) {
      z.throwCd = kd.throwCd || 2.9;
      spawnShot(z);
      return true;
    }
    if (d > (kd.hold || 4.6)) { z.x += ux * sp * dt; z.z += uz * sp * dt; }
    else if (d < (kd.hold || 4.6) * 0.72) { z.x -= ux * sp * 0.8 * dt; z.z -= uz * sp * 0.8 * dt; }
    return true;
  }
  if (kd.blastR) {
    if ((z.fuse || 0) > 0) {
      z.fuse -= dt;
      if (z.fuse <= 0) { bomberBlast(z); return true; }
      return true;
    }
    if (d < (kd.fuseR || 2.0)) { z.fuse = kd.fuse || 0.85; rt.showJudge('자폭!'); return true; }
    z.x += ux * sp * dt; z.z += uz * sp * dt;
    return true;
  }
  return false;
}
/* §7.4 별 2: 피해 횟수 — 맞은 횟수를 센다(피격 3회 이하면 별 2). */
function noteHit() { if (rt.S) rt.S.hits = (rt.S.hits || 0) + 1; }
/* §9.4 청동 거울: 판당 첫 피격 1회 무효. */
function mirrorSave(why) {
  if (!rt.relicOn(rt.save, 'mirror') || !rt.S || rt.S.mirrorUsed) return false;
  rt.S.mirrorUsed = true;
  rt.S.iframe = Math.max(rt.S.iframe || 0, rt.CFG.iframeMs / 1000);
  rt.S.goldEdge = Math.max(rt.S.goldEdge || 0, 0.2);
  rt.showJudge('거울이 막았다');
  if (rt.three && rt.three.shaderFx3d && rt.S && rt.S.hero) {
    rt.three.shaderFx3d.syncHeroShield(rt.S.hero.x, rt.S.hero.z, false, true);
    rt.three.shaderFx3d.spawnShockwave(rt.S.hero.x, rt.S.hero.z, { r0: 0.8, r1: 4.4, colorHex: 0x62e8c8, coreHex: 0xfff8dc, dur: 0.40 });
  }
  if (rt.audio && rt.audio.parry) rt.audio.parry();
  rt.telemetry.event('relic', { id: 'mirror', stage: rt.S.stageNo, why: why || null });
  return true;
}
/* §9.4 거꾸로 된 탑: 받는 피해 +1 */
function relicDmgAdd() { return rt.relicOn(rt.save, 'tower') ? 1 : 0; }
function heroHurt(n, why) {
  if (!rt.S || !rt.S.playing) return;
  if ((rt.S.iframe || 0) > 0 || rt.S.dash) return;
  if (mirrorSave(why)) return;
  noteHit();
  /* v0.30 §7.2: 모드별 받는 피해(수련 ×0.5 최소 1 · 고수 ×1.5). */
  const vulnAdd = (rt.S && (rt.S.vulnStacks || 0) > 0 && (rt.S.vulnT || 0) > 0) ? rt.S.vulnStacks : 0;
  rt.S.hp -= rt.modeDmg(n) + relicDmgAdd() + vulnAdd;
  if (rt.S.hp <= 0) rt.S.deathWhy = why || '귀물에게 닿았습니다.';
  rt.S.iframe = rt.CFG.iframeMs / 1000;
  rt.S.hurtFlash = rt.CFG.hurtVignette || 0.3;
  rt.S.hitstop = Math.max(rt.S.hitstop || 0, rt.CFG.hitHitstop || 0.08);
  if (rt.three && rt.three.heroSpr && rt.art.kickChar) rt.art.kickChar(rt.three.heroSpr, 1);
  const app = $('app');
  if (app) app.classList.add('hurt');
  if (rt.audio && rt.audio.drum) rt.audio.drum();
  rt.renderHud();
  if (rt.S.hp <= 0) rt.endRun(false, why || '귀물에게 닿았습니다.');
}
function bomberBlast(z) {
  const kd = rt.CFG.zombieTypes.bomber || {};
  const R = kd.blastR || 2.7;
  if (rt.art && rt.art.playFx && rt.three) {
    const fx = rt.art.playFx(rt.three.scene, 'ink-splat', z.x, z.z, R);
    if (fx) rt.three.fx.push(fx);
  }
  rt.S.shake = Math.max(rt.S.shake || 0, 0.5);
  if (rt.S.hero && Math.hypot(rt.S.hero.x - z.x, rt.S.hero.z - z.z) <= R + 0.5) heroHurt(kd.blastDmg || 2, '자폭하는 귀물에 닿았습니다.');
  rt.S.zombies.forEach(function (o) {
    if (o === z || !o.alive || o.isBoss) return;
    if (rt.dist(o, z) <= R + o.r) rt.hurtZombie(o, 2, 'bomb', rt.S.lastDash);
  });
  rt.hurtZombie(z, 999, 'bomb', rt.S.lastDash);
}
/* v1.55: 투사체·장판 오브젝트 풀은 bossProjectiles.js로 분리 */
const {
  shotGeo, shotMaterial, goldShotMaterial, hazardGeo, trailMaterial,
  takeShotMesh, releaseShotMesh, spawnShot, stepShots,
  takeHazardMesh, releaseHazardMesh, spawnHazard, stepHazards, bossHazards,
  shotPool, hazardPool
} = createBossProjectiles({ rt, heroHurt, stepReflectedShot: function (sh, dt) { return stepReflectedShot(sh, dt); } });
/* ---------- v0.26 보스 패턴 ----------
   장마다 STAGES[n].boss.patterns 목록을 차례로 돈다(배워서 읽을 수 있게 고정 순서).
   예고 색이 대응을 알린다: 붉은 = 일섬 회피, 금 = 탭 패링, 비취 = 무늬 그리기. 수치는 CFG.bossPat. */
const CUE_RGB = { red: '200,40,30', gold: '232,192,74', jade: '46,230,166' };
/* v0.30 §11 색약 팔레트: 붉은→주황, 비취→청록. 모양 아이콘과 함께 쓴다. */
const CUE_RGB_CB = { red: '255,140,50', gold: '242,206,96', jade: '70,214,236' };
const CUE_LABEL = { red: '피하라', gold: '받아쳐라', jade: '그려라' };
/* PAT_CUE는 modules/bossPatterns.js에서 임포트 */
/** §11 대응 아이콘: 피하라 = 바깥 화살표, 받아쳐라 = 칼집, 그려라 = 붓. 색만으로 구분하지 않게. */
/* ---------- v0.32 §4.5 보스 개성 · §9.3 도감 대비 ----------
   장마다 머리 장신구・무기・크기가 다르고(3막 색조는 재질 틴트), 이름 카드는 1.2초. */
/* §9.2 외형: 보스·기물의 윤곽광과 발광 색만 바꾼다(능력 없음). */
function applySkin(obj) {
  if (!obj || !obj.userData) return;
  const sk = rt.skinOf(rt.save);
  const rim = obj.userData.rim;
  if (rim && rim.material && rim.material.color) { rim.material.color.setHex(sk.rim); obj.userData.rimHex = sk.rim; }
  const glow = obj.userData.glow;
  if (glow && glow.material && glow.material.color) glow.material.color.setRGB(sk.glow[0], sk.glow[1], sk.glow[2]);
}
function bossVisualOf(st) {
  const v = (st && st.bossVisual) || {};
  return { var: rt.clamp(v.var != null ? v.var : 3, 0, 3), scale: rt.clamp(v.scale != null ? v.scale : 1, 0.9, 1.15) };
}
let bossCardT = null;
function showBossCard(st, customLine) {
  const el = $('bossCard');
  if (!el || !st) return;
  const nm = $('bossCardName'), ln = $('bossCardLine');
  const act = rt.actOf(st.id || 1);
  const bq = rt.BOSS_QUOTES && rt.BOSS_QUOTES[act];
  const isActFinale = (st.id % 4) === 0;
  if (nm) nm.textContent = (isActFinale && bq && bq.title) ? bq.title : (st.bossName || '귀물');
  if (ln) ln.textContent = customLine || ((isActFinale && bq && bq.enter) ? bq.enter : (st.bossLine || ''));
  el.hidden = false; el.classList.add('show');
  if (bossCardT) clearTimeout(bossCardT);
  const ms = rt.qa.noDelay ? 200 : ((isActFinale || customLine) ? 1850 : 1200);
  bossCardT = setTimeout(function () { el.classList.remove('show'); el.hidden = true; bossCardT = null; }, ms);
  rt.telemetry.event('boss_card', { stage: rt.S && rt.S.stageNo, name: (nm && nm.textContent) || '' });
}
/* §9.3 도감 9칸(패턴) + 막 전용 3칸 — v0.49: v2/js/modules/bossCatalog.js 로 분리(오탈자 교정 포함). */
/* 도감 기록: 보스 처치(상·하 공략 포함)와 패턴 받아치기 */
/* §9.3 도감: 귀물 8칸 — 종류별로 처음 하나를 베면 도감에 오른다. */
function codexMon(type) {
  if (!type) return;
  const slot = rt.MON_CODE.filter(function (m) { return m.id === type; })[0];
  if (!slot) return;
  rt.save.codex = rt.save.codex || {};
  rt.save.codex.mon = rt.save.codex.mon || {};
  if (rt.save.codex.mon[type]) return;
  rt.save.codex.mon[type] = 1;
  rt.persist();
  rt.telemetry.event('codex', { kind: 'mon', id: type });
  const n = rt.codexCounts(rt.save);
  if (n.mon >= 8) rt.toast('도감 · 귀물 8칸을 채웠습니다 — 엽전 +5%');
}
function codexEvo(key) {
  if (!key) return;
  rt.save.codex = rt.save.codex || {};
  rt.save.codex.evo = rt.save.codex.evo || {};
  if (rt.save.codex.evo[key]) return;
  rt.save.codex.evo[key] = 1;
  rt.persist();
  rt.telemetry.event('codex', { kind: 'evo', id: key });
  const n = rt.codexCounts(rt.save);
  if (n.evo >= rt.EVO_SLOTS) rt.toast('도감 · 진화 10칸을 채웠습니다 — 엽전 +5%');
}
function codexBoss(st) {
  if (!st) return;
  rt.save.codex = rt.save.codex || { boss: {}, pat: {} };
  rt.save.codex.boss = rt.save.codex.boss || {};
  const first = !rt.save.codex.boss[st.id];
  rt.save.codex.boss[st.id] = {
    name: st.bossName || '', line: st.bossLine || '',
    guides: [(st.terrain && st.terrain.line) || '보스의 무늬를 차례로 베세요.', '빈틈 고리가 다 차는 순간이 절단 찬스입니다.'],
    n: ((rt.save.codex.boss[st.id] && rt.save.codex.boss[st.id].n) || 0) + 1
  };
  rt.persist();
  if (first) rt.telemetry.event('codex', { kind: 'boss', stage: st.id, name: st.bossName || '' });
}
function notePatSeen(id, how) {
  if (!id) return;
  rt.save.codex = rt.save.codex || { boss: {}, pat: {} };
  rt.save.codex.pat = rt.save.codex.pat || {};
  rt.save.codex.pat[id] = (rt.save.codex.pat[id] || 0) + 1;
  rt.telemetry.event('pat_codex', { id: id, how: how || null, n: rt.save.codex.pat[id] });
}
function bossPat() { return rt.CFG.bossPat || {}; }
/* §9.4 금실 칼집: 기모으기 금빛 칸 +0.1초 */
function kiaiWin(K) { return (K && K.win || 0) + (rt.relicOn(rt.save, 'sheath') ? 0.12 : 0); }
/** Spirits on the clones and on the boss among them stay bound for the whole pattern, wherever the hero dashes. */
function cloneHeld(s) { const t = s && s.target; return !!(t && (t.isClone || t.isTotem || t.isPillar || (t.isBoss && t.state === 'clones'))); }
function ensureCloneSpirits(z) {
  const held = rt.livingMarks().map(function (m) { return m.target; });
  [z].concat(z.clones || []).forEach(function (c) { if (c.alive && held.indexOf(c) < 0) rt.spawnSpirit({ x: c.x, z: c.z, target: c }); });
}
function bossCfg() { return (rt.S && rt.S.stage && rt.S.stage.boss) || {}; }
function bossHasNewGimmick() {
  const B = bossCfg();
  const all = (B.patterns || []).concat(B.phase2 || [], B.phase3 || []);
  return all.some(function (id) { return id === 'donut' || id === 'soak' || id === 'rhythm' || id === 'tether' || id === 'gaze' || id === 'pizza'; });
}
/** The boss's standing totems (기물): fixed dash targets that take turns throwing a slow charm. */
const _bmList = [];
function bossMinions() {
  const zs = (rt.S && rt.S.zombies) || [];
  let n = 0;
  for (let i = 0; i < zs.length; i++) { const q = zs[i]; if (q && q.alive && q.isTotem) _bmList[n++] = q; }
  _bmList.length = n;
  return _bmList;
}
/** Raises one totem in the widest empty direction around the hero, inside the sight ring, so there is always somewhere to dash. */
function summonDodgeTarget(boss) {
  const M = bossPat().summon;
  const center=rt.S.arena || rt.S.hero;
  const taken=bossMinions().map(q=>Math.atan2(q.z-center.z,q.x-center.x));
  let best = Math.random() * Math.PI * 2, bestGap = -1;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 + Math.random() * 0.2;
    const gap = taken.reduce(function (m, t) { return Math.min(m, Math.abs(rt.angDiff(a, t))); }, Math.PI);
    if (gap > bestGap) { bestGap = gap; best = a; }
  }
  const d=rt.arenaR()-.35;
  const p={x:center.x+Math.cos(best)*d,z:center.z+Math.sin(best)*d};
  rt.inkFx.burst(p.x, p.z, rt.FX_COLORS.poison, { r1: 30, n: 6, dur: 0.4 });
  const used = bossMinions().map(function (q) { return q.shape; });
  const shape = rt.TOTEM_SHAPES.filter(function (k) { return used.indexOf(k) < 0; })[0];
  if (!shape) return null;
  const t = { id: ++rt.S._id, kind: 'zombie', type: 'totem', shape: shape, x: p.x, z: p.z, r: 0.6, alive: true, hp: 1, isTotem: true, frozen: 0, burn: 0, poison: 0, stun: 0, marked: false };
  t.edgeAngle=best;
  t.obj = makeTotemObj(shape);
  if (rt.three) rt.three.scene.add(t.obj);
  rt.placeGroup(t.obj, t.x, t.z);
  rt.S.zombies.push(t);
  rt.assignSpiritTargets();
  return t;
}
function stepBossSummons(dt) {
  const M = bossPat().summon;
  const b = rt.S && rt.S.boss;
  const inGimmick = !!(b && b.alive && (b.state === 'donut' || b.state === 'soak' || b.state === 'rhythm' || b.state === 'tether' || b.state === 'gaze' || b.state === 'pizza'));
  const keepLimit = bossHasNewGimmick() ? 1 : M.keep;
  rt.S.summonT = (rt.S.summonT || 0) - dt;
  if (!inGimmick && rt.S.summonT <= 0 && bossMinions().length < keepLimit) { rt.S.summonT = M.every; summonDodgeTarget(rt.S.boss); }
  /* 기물 혼령은 주인공이 어디로 일섬해 가든 붙어 있다 — 피할 곳이 사라지지 않게. */
  const held = rt.livingMarks().map(function (m) { return m.target; });
  bossMinions().forEach(function (q) { if (held.indexOf(q) < 0) rt.spawnSpirit({ x: q.x, z: q.z, target: q }); });
  /* 기물은 한 번에 하나씩 번갈아 쏜다: 예고(보랏빛 고리) 뒤 느린 부적 한 장. */
  const list = bossMinions();
  if (!list.length) return;
  rt.S.totemShotT = (rt.S.totemShotT == null ? M.shotEvery : rt.S.totemShotT) - dt;
  if (!rt.S.totemNext || !rt.S.totemNext.alive) { rt.S.totemI = ((rt.S.totemI || 0) + 1) % list.length; rt.S.totemNext = list[rt.S.totemI]; }
  if (rt.S.totemShotT > 0) return;
  rt.S.totemShotT = M.shotEvery;
  const t = rt.S.totemNext;
  const sh = spawnShot({ x: t.x, z: t.z });
  if (sh) {
    const d = Math.hypot(rt.S.hero.x - t.x, rt.S.hero.z - t.z) || 1;
    sh.vx = (rt.S.hero.x - t.x) / d * M.shotSpeed; sh.vz = (rt.S.hero.z - t.z) / d * M.shotSpeed;
    sh.life = Math.max(sh.life, d / M.shotSpeed + 1);
  }
  rt.inkFx.burst(t.x, t.z, rt.FX_COLORS.poison, { r1: 24, n: 5, dur: 0.3 });
  rt.S.totemNext = null;
}
/* v0.29 §4.1 기물 역공: 보스가 예고 중일 때(telegraph·slamTele·volleyTele·kiai) 기물로 일섬하면
   기물이 먹 궤적이 되어 보스에게 날아간다 → 경직 1.0초 + 참 +12 + 기세 1칸.
   예고가 아닐 때 부수면 예전처럼 참 +3. 한 번의 예고에 역류는 1번만. */
function bossReflectWindow(z) {
  return !!z && z.alive && (z.state === 'telegraph' || z.state === 'slamTele' || z.state === 'volleyTele' || z.state === 'kiai');
}
function reflectReady() {
  const z = rt.S && rt.S.boss;
  return !!(z && bossReflectWindow(z) && !z.reflectUsed);
}
let _reflectGeo = null, _reflectMat = null;
function makeReflectMesh() {
  if (!_reflectGeo) _reflectGeo = new rt.THREE.PlaneGeometry(1.3, 0.7);
  if (!_reflectMat) _reflectMat = new rt.THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, blending: rt.THREE.AdditiveBlending, depthWrite: false, side: rt.THREE.DoubleSide });
  const m = new rt.THREE.Mesh(_reflectGeo, _reflectMat);
  m.position.y = 1.1;
  return m;
}
function reflectTotem(t, b) {
  if (!t || !t.alive) return;
  t.alive = false;
  if (t.obj && rt.three) releaseTotemObj(t.obj);
  b.reflectUsed = true;
  rt.S.reflects = rt.S.reflects || [];
  const mesh = makeReflectMesh();
  mesh.position.set(t.x, 1.1, t.z);
  if (rt.three) rt.three.scene.add(mesh);
  rt.S.reflects.push({ x: t.x, z: t.z, t: 0, mesh: mesh });
  rt.S.shake = Math.max(rt.S.shake || 0, 0.3);
  rt.inkFx.burst(t.x, t.z, rt.FX_COLORS.gold, { r1: 40, n: 8, dur: 0.4 });
  rt.inkFx.ring(1.8, rt.FX_COLORS.gold, 0.4);
  rt.showJudge('역류!');
  if (rt.audio) rt.audio.gong();
  rt.assignSpiritTargets();
}
function reflectHit(b) {
  if (!b || !b.alive) return;
  endBossSide(b);
  b.state = 'stun'; b.stateT = 0; b.stunT = rt.CFG.reflectStun || 1.0;
  rt.addCharge(rt.CFG.reflectCharge || 12);
  rt.addHitstop(rt.CFG.hitstopBreak || 0.10);
  rt.S.goldEdge = Math.max(rt.S.goldEdge || 0, 0.18);
  rt.S.shake = Math.max(rt.S.shake || 0, 0.75);
  rt.inkFx.ring(2.6, rt.FX_COLORS.gold, 0.5);
  rt.inkFx.burst(b.x, b.z, rt.FX_COLORS.gold, { r1: 54, n: 12, dur: 0.5 });
  rt.showJudge('역류 명중!');
  rt.toast('기물이 되돌아가 귀물이 휘청입니다 — 지금 베세요');
  if (rt.audio) { rt.audio.drum(); rt.audio.hit(false); }
  bossPoise(b, rt.CFG.reflectPoise || 1);
}
function stepReflects(dt) {
  if (!rt.S || !rt.S.reflects || !rt.S.reflects.length) return;
  rt.S.reflects = rt.S.reflects.filter(function (r) {
    r.t += dt;
    const b = rt.S.boss;
    if (!b || !b.alive) { if (r.mesh && rt.three) rt.three.scene.remove(r.mesh); return false; }
    const dx = b.x - r.x, dz = b.z - r.z, L = Math.hypot(dx, dz) || 1;
    const sp = 15;
    r.x += dx / L * sp * dt; r.z += dz / L * sp * dt;
    if (r.mesh) { r.mesh.position.set(r.x, 1.1, r.z); r.mesh.rotation.y += dt * 12; }
    if (L < (b.r || 1) + 0.6 || r.t > 3) {
      if (L < (b.r || 1) + 0.6) reflectHit(b);
      if (r.mesh && rt.three) rt.three.scene.remove(r.mesh);
      return false;
    }
    return true;
  });
}
const TOTEM_POOL_MAX = 6;
const totemPool = [];
function makeTotemObj(shape='tri') {
  const group=totemPool.pop() || rt.buildSealStake();
  group.userData.paper.material=rt.sealPaper(shape);
  return group;
}
/* 기물이 부서지면 장면에서 빼고 풀로 돌려 둔다(최대 6개). */
function releaseTotemObj(g) {
  if (!g) return;
  if (g.parent) g.parent.remove(g);
  if (totemPool.length < TOTEM_POOL_MAX) totemPool.push(g);
}
function breakTotem(t) {
  if (!t.alive) return;
  /* §4.1: 보스가 예고 중이면 부수는 대신 되돌려 보낸다. */
  const b = rt.S && rt.S.boss;
  if (b && bossReflectWindow(b) && !b.reflectUsed) { reflectTotem(t, b); return; }
  t.alive = false;
  if (t.obj && rt.three) releaseTotemObj(t.obj);
  if (rt.art && rt.art.playFx && rt.three) { const fx = rt.art.playFx(rt.three.scene, 'ink-splat', t.x, t.z, 1.4); if (fx) rt.three.fx.push(fx); }
  if (rt.audio) rt.audio.hit();
  rt.addCharge(3);
  rt.assignSpiritTargets();
}
/** The boss's pattern list for its current phase, or null for the old charge-only loop.
    v0.32 §4.4: 12장은 무늬 1/3마다 페이즈가 열려 3페이즈까지 쌓인다. */
function bossPatList(z) {
  const B = bossCfg();
  if (!B.patterns) return null;
  const ph = (z && z.phase) || 1;
  if (ph >= 3 && B.phase3) return B.patterns.concat(B.phase2 || [], B.phase3);
  if (ph >= 2 && B.phase2) return B.patterns.concat(B.phase2);
  return B.patterns;
}
function refreshBossGlyphs(z) {
  rt.livingMarks().forEach(function (m) {
    if ((m.target === z || (m.target && m.target.isClone)) && rt.art.setSpiritShape) rt.art.setSpiritShape(m.obj, rt.spiritShape(m));
  });
  if (rt.S && rt.S.boss === z && z && z.alive) syncBossOrbitSpirits(0);
}
/** Shows the colour cue over the boss, plays its sound, and teaches the pattern once per run. */
function bossCue(z, color, id) {
  z.cue = { c: color, t: 0 };
  if (rt.audio) {
    if (color === 'red') rt.audio.drum();
    else if (color === 'gold' && rt.audio.gong) rt.audio.gong();
    else if (color === 'jade') rt.audio.bell(0, z.shape);
  }
  rt.S.bossTips = rt.S.bossTips || {};
  const tip = (bossPat().tips || {})[id];
  if (tip && !rt.S.bossTips[id]) { rt.S.bossTips[id] = true; rt.hideGuide(); rt.toast(tip); }
}
function nextBossPattern(z) {
  const list = bossPatList(z);
  const id = list[(z.patI || 0) % list.length];
  z.patI = (z.patI || 0) + 1;
  startBossPattern(z, id);
}
function startBossPattern(z, id) {
  z.pat = id; z.stateT = 0;
  z.firstWalk = false;
  z.reflectUsed = false;
  /* v0.30 §8.2: 이 패턴을 처음 보는 순간이면 예고 ×1.6 + 0.5배 느린 화면 0.6초 + 대응 아이콘. */
  const first = rt.markSeen('pat:' + id);
  z.teleBoost = first ? (rt.CFG.firstPatTele || 1.6) : 1;
  z.teleMul = rt.teleMul() * z.teleBoost;
  if (first && rt.S) {
    rt.addSlow(rt.CFG.firstPatSlow || 0.5, rt.CFG.firstPatSlowDur || 0.6);
    rt.S.firstPatIcon = { id: id, c: rt.PAT_CUE[id] || 'red', t: 1.6 };
    const hint = rt.getPatternHint ? rt.getPatternHint(id) : '';
    if (hint) {
      rt.showGuide('<b>' + hint + '</b>', 2.2);
      const shortAct = hint.indexOf('—') >= 0 ? hint.split('—')[1].trim() : hint;
      if (rt.showJudge) rt.showJudge(shortAct);
    }
    rt.telemetry.event('first_moment', { kind: 'pattern', id: id, stage: rt.S.stageNo });
  }
  rt.telemetry.event('boss_pattern', { p: id, stage: rt.S && rt.S.stageNo, start: true, first: first });
  const P = bossPat();
  if (id === 'kiai') {
    z.state = 'kiai'; z.kiai = { lock: false, open: false, t: P.kiai.t * (z.teleMul || 1) };
    bossCue(z, 'gold', id);
    if (rt.audio && rt.audio.charge) rt.audio.charge(z.kiai.t);
  } else if (id === 'slam') startSlam(z, P.slam.tele * (z.teleMul || 1));
  else if (id === 'sweep') startSweep(z);
  else if (id === 'clones') startClones(z);
  else if (id === 'veil') startVeil(z);
  else if (id === 'volley') {
    z.state = 'volleyTele'; z._warnTicked = false;
    z.aimA = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x);
    z.volleyTele = P.volley.tele * (z.teleMul || 1);
    /* v0.53: 발사 전에 금빛 패링 부적 위치를 미리 결정해 예고 편대에 금빛으로 표시한다 */
    const Vo = P.volley, gMap = {};
    while (Object.keys(gMap).length < Math.min(Vo.gold, Vo.n)) gMap[Math.floor(Math.random() * Vo.n)] = true;
    z.volleyGold = gMap;
    bossCue(z, 'red', id);
  } else if (id === 'chant') {
    z.state = 'chant'; z.chant = { seq: rt.pickSeq(P.chant.n), i: 0 };
    z.chantT = P.chant.t * (z.teleMul || 1);
    bossCue(z, 'jade', id);
  } else if (id === 'shrink') {
    startShrink(z);
    z.state = 'walk';
  } else if (id === 'clash') startClash(z);
  else if (id === 'mimic') startMimic(z);
  else if (id === 'shuffle') startShuffle(z);
  else if (id === 'donut') startDonut(z);
  else if (id === 'soak') startSoak(z);
  else if (id === 'rhythm') startRhythm(z);
  else if (id === 'tether') startTether(z);
  else if (id === 'gaze') startGaze(z);
  else if (id === 'pizza') startPizza(z);
  else startCharge(z);
}
/* v1.02 신규 레이드·액션 기믹 4종 (donut · soak · rhythm · tether) + 취약 중첩 */
function applyVulnStack(why) {
  if (!rt.S) return;
  if (rt.S.boss && rt.S.boss.pat) rt.S.lastBossGimmick = rt.S.boss.pat;
  rt.S.vulnStacks = Math.min(2, (rt.S.vulnStacks || 0) + 1);
  rt.S.vulnT = 8.0;
  heroHurt(1, why || '기믹에 피격되었습니다.');
  rt.showJudge('취약 중첩 ' + rt.S.vulnStacks + ' (8초)');
}
/* v1.03 기믹 특정 구역 전용 혼령 생성 및 정리 (자유 이동이 없는 게임에서 이동 수단 100% 보장) */
function clearZoneSpirits(tag) {
  if (!rt.S || !rt.S.spirits) return;
  for (let i = 0; i < rt.S.spirits.length; i++) {
    const sp = rt.S.spirits[i];
    if (sp && sp.alive && sp.zoneTag && (!tag || sp.zoneTag === tag)) {
      sp.alive = false;
      if (sp.obj && rt.three && rt.three.scene) { rt.three.scene.remove(sp.obj); sp.obj = null; }
    }
  }
}
function clearOrbitSpirits() {
  if (!rt.S || !rt.S.spirits) return;
  for (let i = 0; i < rt.S.spirits.length; i++) {
    const sp = rt.S.spirits[i];
    if (sp && sp.alive && sp.orbitSlot != null) {
      sp.alive = false;
      if (sp.obj && rt.three && rt.three.scene) { rt.three.scene.remove(sp.obj); sp.obj = null; }
    }
  }
}
function bossActiveShape(z) {
  if (!z) return '';
  if (z.state === 'seal' || z.state === 'sealing') return 'star';
  return z.shape || (z.seq && z.seq[z.seqI]) || 'hline';
}
function spawnZoneSpirit(x, z, tag, ttl, preferredShape) {
  if (!rt.S) return null;
  const used = [];
  if (rt.S.boss && rt.S.boss.alive) used.push(bossActiveShape(rt.S.boss));
  (rt.S.spirits || []).forEach(function (sp) {
    if (sp && sp.alive && (sp.orbitSlot != null || sp.zoneTag)) {
      used.push(sp.shape || rt.spiritShape(sp));
    }
  });
  const sh = rt.pickZoneSpiritShape(preferredShape, used, rt.S.pool, rt.SHAPE_UNLOCK, rt.TOTEM_SHAPES);
  const c = rt.clampPointToArena(x, z, 1.2);
  return rt.spawnSpirit({ worldAnchor: true, wx: c.x, wz: c.z, shape: sh, zoneTag: tag, zoneTtl: ttl || 3.5 });
}
/* v1.03 / v1.22 보스 중심 삼각형 대형 시계방향 회전 혼령 3개 — 보스 무늬 및 3개 상호 중복 완전 차단 */
function syncBossOrbitSpirits(dt) {
  if (!rt.S || !rt.S.boss || !rt.S.boss.alive) return;
  const z = rt.S.boss;
  const orbitR = 5.8; /* 보스 내려찍기(3.4m)·도넛 내부(3.3m)보다 넉넉히 큰 안전 탈출 반경 */
  if (dt) rt.S.bossOrbitAng = (rt.S.bossOrbitAng || 0) + 0.34 * dt; /* 시계방향 천천히 회전 */
  const bossSh = bossActiveShape(z);
  const baseShapes = rt.pickBossOrbitShapes(bossSh, rt.S.pool, rt.SHAPE_UNLOCK, rt.TOTEM_SHAPES);
  const existing = [null, null, null];
  for (let i = 0; i < (rt.S.spirits || []).length; i++) {
    const sp = rt.S.spirits[i];
    if (sp && sp.alive && sp.orbitSlot != null && sp.orbitSlot >= 0 && sp.orbitSlot < 3) {
      existing[sp.orbitSlot] = sp;
    }
    if (dt && sp && sp.alive && sp.zoneTag && sp.zoneTtl > 0) {
      sp.zoneTtl -= dt;
      if (sp.zoneTtl <= 0) {
        sp.alive = false;
        if (sp.obj && rt.three && rt.three.scene) { rt.three.scene.remove(sp.obj); sp.obj = null; }
      }
    }
  }
  for (let slot = 0; slot < 3; slot++) {
    const a = (rt.S.bossOrbitAng || 0) + slot * ((Math.PI * 2) / 3);
    const pt = rt.clampPointToArena(z.x + Math.cos(a) * orbitR, z.z + Math.sin(a) * orbitR, 1.2);
    const desired = baseShapes[slot];
    let sp = existing[slot];
    if (!sp) {
      sp = rt.spawnSpirit({ worldAnchor: true, wx: pt.x, wz: pt.z, shape: desired, orbitSlot: slot });
    } else {
      if (sp.shape !== desired) {
        sp.shape = desired;
        if (sp.obj && rt.art && rt.art.setSpiritShape) rt.art.setSpiritShape(sp.obj, desired);
      }
      sp.wx = pt.x; sp.wz = pt.z;
      rt.placeSpirit(sp);
    }
  }
}
function spawnDonutZoneSpirit(z, dn) {
  clearZoneSpirits('donut');
  const a = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x) + 0.45;
  if (dn.safeInside) {
    spawnZoneSpirit(z.x + Math.cos(a) * 2.0, z.z + Math.sin(a) * 2.0, 'donut', dn.dur + 0.4, 'hline');
  } else {
    spawnZoneSpirit(z.x + Math.cos(a) * 5.6, z.z + Math.sin(a) * 5.6, 'donut', dn.dur + 0.4, 'vline');
  }
}
function startDonut(z) {
  z.state = 'donut'; z.stateT = 0; z.pat = 'donut';
  const firstSafeIn = Math.random() < 0.5;
  z.donut = { step: 0, safeInside: firstSafeIn, innerR: 3.3, outerR: 9.2, dur: 1.65 * (z.teleMul || 1) };
  spawnDonutZoneSpirit(z, z.donut);
  bossCue(z, 'jade', 'donut');
  rt.showJudge(firstSafeIn ? '도넛 결계 — 안쪽 혼령으로 일섬!' : '도넛 결계 — 바깥 혼령으로 이탈!');
  if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'circle');
}
function startSoak(z) {
  z.state = 'soak'; z.stateT = 0; z.pat = 'soak';
  clearZoneSpirits('soak');
  const cnt = (z.phase || 1) >= 2 ? 2 : 1;
  const pillars = [];
  for (let i = 0; i < cnt; i++) {
    const a = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x) + (i === 0 ? 0.85 : -0.95);
    const p = rt.clampPointToArena(z.x + Math.cos(a) * 5.2, z.z + Math.sin(a) * 5.2, 2.0);
    const dur = 3.3 * (z.teleMul || 1);
    pillars.push({ x: p.x, z: p.z, r: 2.3, t: 0, dur: dur, done: false });
    /* v1.03 호박빛 결계 기둥 정중앙에 전용 혼령 배치 */
    spawnZoneSpirit(p.x, p.z, 'soak', dur + 0.3, i === 0 ? 'hline' : 'vline');
  }
  z.soak = { pillars: pillars };
  bossCue(z, 'gold', 'soak');
  rt.showJudge('호박빛 결계 기둥 — 기둥 혼령으로 일섬!');
  if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'bolt');
}
/* v1.03 신규 기믹 5: 시선 회피 (Gaze) — 보스 등 뒤에 전용 혼령 자동 생성 */
function startGaze(z) {
  z.state = 'gaze'; z.stateT = 0; z.pat = 'gaze';
  clearZoneSpirits('gaze');
  const aimA = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x);
  const dur = 1.50 * (z.teleMul || 1);
  z.gaze = { aimA: aimA, dur: dur };
  /* 보스 정반대 등 뒤 3.2m 지점에 배후 안전 혼령 배치 */
  const backA = aimA + Math.PI;
  spawnZoneSpirit(z.x + Math.cos(backA) * 3.2, z.z + Math.sin(backA) * 3.2, 'gaze', dur + 0.4, 'hline');
  bossCue(z, 'red', 'gaze');
  rt.showJudge('붉은 시선 — 보스 등 뒤 혼령으로 일섬!');
  if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'vline');
}
/* v1.03 신규 기믹 6: 6조각 부채꼴 순차 절단 (Pizza) — 매 안전 칸에 전용 혼령 배치 */
function spawnPizzaSafeSpirit(z, pz) {
  clearZoneSpirits('pizza');
  const heroA = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x);
  let bestA = pz.baseA + Math.PI / 6, bestDiff = 99;
  for (let s = 0; s < 6; s++) {
    const danger = (s % 2 === 1) === !!pz.oddDanger;
    if (danger) continue;
    const midA = pz.baseA + s * (Math.PI / 3) + Math.PI / 6;
    const diff = Math.abs(Math.atan2(Math.sin(midA - heroA), Math.cos(midA - heroA)));
    if (diff < bestDiff) { bestDiff = diff; bestA = midA; }
  }
  spawnZoneSpirit(z.x + Math.cos(bestA) * 4.8, z.z + Math.sin(bestA) * 4.8, 'pizza', pz.dur + 0.4, pz.step === 0 ? 'hline' : 'vline');
}
function startPizza(z) {
  z.state = 'pizza'; z.stateT = 0; z.pat = 'pizza';
  const baseA = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x) - Math.PI / 6;
  z.pizza = { step: 0, baseA: baseA, oddDanger: false, dur: 1.45 * (z.teleMul || 1) };
  spawnPizzaSafeSpirit(z, z.pizza);
  bossCue(z, 'jade', 'pizza');
  rt.showJudge('부채꼴 절단 — 청록 안전 칸 혼령으로 일섬!');
  if (rt.audio && rt.audio.drum) rt.audio.drum();
}
function startRhythm(z) {
  z.state = 'rhythm'; z.stateT = 0; z.pat = 'rhythm';
  const ph = z.phase || 1;
  const base = ph >= 3 ? [0.50, 0.40, 0.62] : (ph >= 2 ? [0.56, 0.44, 0.68] : [0.62, 0.52, 0.72]);
  const tm = rt.clamp(z.teleMul || 1, 0.85, 1.35);
  z.rhythm = { idx: 0, beats: [+(base[0] * tm).toFixed(2), +(base[1] * tm).toFixed(2), +(base[2] * tm).toFixed(2)], t: 0, ok: 0, handled: false };
  bossCue(z, 'jade', 'rhythm');
  rt.showJudge('삼연격 — 박자에 맞춰 탭 3회!');
  if (rt.audio && rt.audio.drum) rt.audio.drum();
}
function rhythmTap() {
  const z = rt.S && rt.S.boss;
  if (!z || !z.alive || z.state !== 'rhythm' || !z.rhythm) return null;
  const rh = z.rhythm;
  const dur = rh.beats[rh.idx] || 0.6;
  const rem = dur - rh.t;
  if (rh.handled) return null;
  if (rem <= 0.24 && rem >= -0.06) {
    rh.handled = true;
    rh.ok++;
    if (rt.art && rt.art.heroBlock && rt.three && rt.three.hero) rt.art.heroBlock(rt.three.hero);
    if (rt.audio && rt.audio.justParry) rt.audio.justParry();
    rt.haptic([20, 14, 34]);
    rt.addHitstop(0.065);
    rt.addCharge(8);
    rt.S.parryOkN = (rt.S.parryOkN || 0) + 1;
    rt.S.justParryN = (rt.S.justParryN || 0) + 1;
    rt.inkFx.ring(3.6, rt.FX_COLORS.jade, 0.42);
    if (rt.three && rt.three.vfx3d && rt.S.hero) rt.three.vfx3d.spawnSparks(rt.S.hero.x, rt.S.hero.z, 16, { color: 0x85f5d4, speed: 7.5 });
    z._strikeFxT = 0.24;
    bossPoise(z, 1.35);
    rt.showJudge('막아냈다! ' + rh.ok + '/3');
    return { rhythm: true, ok: rh.ok };
  }
  return null;
}
function startTether(z) {
  z.state = 'tether'; z.stateT = 0; z.pat = 'tether';
  clearZoneSpirits('tether');
  const dur = 3.2 * (z.teleMul || 1);
  z.tether = { dur: dur, breakDist: 7.5 };
  /* v1.03 혈사슬 절단용 외곽 탈출 혼령(보스로부터 8.4m) 자동 배치 */
  const escA = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x);
  spawnZoneSpirit(z.x + Math.cos(escA) * 8.4, z.z + Math.sin(escA) * 8.4, 'tether', dur + 0.4, 'hline');
  bossCue(z, 'red', 'tether');
  rt.showJudge('혈사슬 결속 — 외곽 혼령으로 일섬해 절단!');
  if (rt.audio && rt.audio.charge) rt.audio.charge(1.5);
}
function startCharge(z) {
  z.state = 'telegraph'; z.stateT = 0; z.pat = 'charge'; z._warnTicked = false;
  z.reflectUsed = false;
  z.teleMul = rt.teleMul() * (z.teleBoost || 1);
  z.aim = { x: rt.S.hero.x, z: rt.S.hero.z };
  z.dodged = false;
  bossHazards(z);
  bossCue(z, 'red', 'charge');
}
function startSlam(z, tele) {
  z.state = 'slamTele'; z.stateT = 0; z.leapY = 0; z._warnTicked = false;
  z.reflectUsed = false;
  z.slam = { fromX: z.x, fromZ: z.z, x: rt.S.hero.x, z: rt.S.hero.z, tele: tele };
  bossCue(z, 'red', 'slam');
}
/* v0.52 신규 스킬 — 언월 횡참(sweep): 120도 광역 부채꼴 베기 + 전진 검기 파동 (+ 2페이즈 양옆 부적 2발) */
function startSweep(z) {
  const SW = (bossPat().sweep) || { tele: 0.92, range: 6.0, arc: 2.1, dmg: 2, stun: 0.85 };
  z.state = 'sweepTele'; z.stateT = 0; z.pat = 'sweep'; z._warnTicked = false;
  z.reflectUsed = false;
  z.sweep = {
    aimA: Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x),
    tele: SW.tele * (z.teleMul || 1),
    range: SW.range || 6.0,
    arc: SW.arc || 2.1,
    dmg: SW.dmg || 2,
    stun: SW.stun || 0.85
  };
  bossCue(z, 'red', 'sweep');
  if (rt.audio && rt.audio.drum) rt.audio.drum();
}
/* ---------- v0.32 §4.4 막 보스 전용 패턴 ----------
   8장 무명 검귀 — 합 겨루기(1.2초)와 흉내(방금 그은 궤적 추적)
   12장 나락의 주인 — 무늬 뒤석기(2초마다 변경, 금빛 0.4초에 고정) */
function startClash(z) {
  z.state = 'clash'; z.stateT = 0;
  z.clash = { i: 0, need: rt.CFG.clashRounds || 3, win: rt.CFG.clashWin || 1.2, t: 0, shape: rt.pickSeq(1)[0] };
  z.pat = 'clash';
  bossCue(z, 'jade', 'clash');
  rt.S.shake = Math.max(rt.S.shake || 0, 0.35);
  rt.inkFx.burst(z.x, z.z, rt.FX_COLORS.gold, { r1: 44, n: 8, dur: 0.4 });
  rt.showJudge('합!');
  if (rt.audio && rt.audio.gong) rt.audio.gong();
}
function clashStroke(type) {
  const z = rt.S && rt.S.boss;
  if (!z || !z.alive || z.state !== 'clash' || !z.clash) return false;
  const c = z.clash;
  if (!type || type === 'tap' || type === 'circle') return false;
  if (type !== c.shape) {
    rt.showJudge('틀린 합');
    if (rt.audio && rt.audio.whiff) rt.audio.whiff();
    clashRoundFail(z, true);
    return true;
  }
  c.i++;
  rt.S.clashWin = (rt.S.clashWin || 0) + 1;
  rt.tcount('clash');
  rt.telemetry.event('boss_pattern', { p: 'clash', result: 'win', n: rt.S.clashWin });
  /* 보스가 0.6m 밀리고 기세 1칸 */
  const d = rt.dist(z, rt.S.hero) || 1;
  z.x += (z.x - rt.S.hero.x) / d * 0.6;
  z.z += (z.z - rt.S.hero.z) / d * 0.6;
  const ca = rt.clampPointToArena(z.x, z.z, 1.2);
  z.x = ca.x; z.z = ca.z;
  if (z.obj) rt.placeGroup(z.obj, z.x, z.z);
  rt.S.goldEdge = Math.max(rt.S.goldEdge || 0, 0.2);
  rt.addHitstop(0.1);
  rt.addCharge(8);
  if (rt.audio) rt.audio.parry();
  rt.showJudge('한 합 받아냄 ' + c.i + '/' + c.need);
  notePatSeen('clash', 'win');
  bossPoise(z, 1);
  if (c.i >= c.need) { z.clash = null; z.state = 'walk'; z.stateT = 0; }
  else { c.shape = rt.pickSeq(1)[0]; c.t = 0; }
  return true;
}
function clashRoundFail(z, wrong) {
  const c = z && z.clash;
  if (!c) return;
  c.i++;
  rt.telemetry.event('boss_pattern', { p: 'clash', result: wrong ? 'wrong' : 'late', round: c.i });
  heroHurtForce(1, '합에 밀렸습니다.');
  const d = rt.dist(z, rt.S.hero) || 1;
  rt.S.hero.x += (rt.S.hero.x - z.x) / d * 1.0;
  rt.S.hero.z += (rt.S.hero.z - z.z) / d * 1.0;
  if (rt.three && rt.three.heroSpr) rt.placeGroup(rt.three.heroSpr, rt.S.hero.x, rt.S.hero.z);
  rt.showJudge('밀렸다');
  if (c.i >= c.need) { z.clash = null; z.state = 'walk'; z.stateT = 0; }
  else { c.shape = rt.pickSeq(1)[0]; c.t = 0; }
}
function startMimic(z) {
  const seg = rt.S.lastDash && rt.S.lastDash.segs && rt.S.lastDash.segs[rt.S.lastDash.segs.length - 1];
  let dir = { x: 1, z: 0 };
  if (seg) {
    const dx = seg.to.x - seg.from.x, dz = seg.to.z - seg.from.z, L = Math.hypot(dx, dz) || 1;
    dir = { x: dx / L, z: dz / L };
  }
  z.state = 'mimicTele'; z.stateT = 0;
  z.mimic = { dir: dir, tele: rt.CFG.mimicTele || 0.8, t: 0, dur: rt.CFG.mimicDur || 0.45, started: false };
  z.pat = 'mimic';
  bossCue(z, 'red', 'mimic');
  rt.showJudge('흉내');
  rt.toast('귀물이 방금 그은 궤적을 따라옵니다 — 그 선과 직각으로 비켜서세요');
}
function startShuffle(z) {
  z.state = 'shuffle'; z.stateT = 0;
  z.shuffle = { t: 0, every: rt.CFG.shuffleEvery || 2, win: rt.CFG.shuffleWin || 0.4, dur: rt.CFG.shuffleDur || 8, gold: 0, locked: false };
  z.pat = 'shuffle';
  changeBossShape(z, true);
  bossCue(z, 'jade', 'shuffle');
}
function changeBossShape(z, gold) {
  if (!z) return;
  z.shape = rt.otherShape(z.shape);
  z.shuffle = z.shuffle || {};
  if (gold) {
    z.shuffle.gold = z.shuffle.win || 0.4;
    z.rimFlash = z.shuffle.gold;
    if (rt.audio && rt.audio.bell) rt.audio.bell(0, z.shape);
  }
  refreshBossGlyphs(z);
}
/** Pattern states; returns true/false like stepBoss, or null when the state is not a pattern state. */
function stepBossPat(z, dt) {
  const P = bossPat();
  const st = z.state;
  if (st === 'groggy') {
    if (z.stateT > (z.groggyDur || P.groggyT || 3.4)) { z.state = 'walk'; z.stateT = 0; z.groggyDur = 0; z.poise = z.poiseMax || P.poise || 6; }
    return true;
  }
  /* §4.4 합 겨루기: 3합. 1.2초 안에 뜬 무늬를 그으면 한 합, 늦으면 주인공이 밀리고 피해 1. */
  if (st === 'clash') {
    const c = z.clash;
    if (!c) { z.state = 'walk'; z.stateT = 0; return true; }
    c.t += dt;
    if (c.t >= c.win) clashRoundFail(z, false);
    return true;
  }
  /* §4.4 흉내: 0.8초 뒤, 주인공이 방금 그은 궤적을 그대로 따라 돌진한다. */
  if (st === 'mimicTele') {
    z.mimic.t += dt;
    if (z.mimic.t >= z.mimic.tele) {
      z.state = 'mimicCharge'; z.stateT = 0; z.mimic.t = 0; z._trailT = 0;
      if (rt.audio) { if (rt.audio.bossCharge) rt.audio.bossCharge(); else rt.audio.slash(); }
      const m = z.mimic;
      rt.makeBossSlash({ x: z.x, z: z.z }, { x: z.x + m.dir.x * 7.5, z: z.z + m.dir.z * 7.5 }, { width: 2.9, height: 0.9 });
      rt.bossFx.pushChargePoint(z.x, z.z);
    }
    return true;
  }
  if (st === 'mimicCharge') {
    const m = z.mimic;
    m.t += dt;
    const sp = rt.CFG.mimicSpeed || 16;
    const nx = z.x + m.dir.x * sp * dt, nz = z.z + m.dir.z * sp * dt;
    const ca = rt.clampPointToArena(nx, nz, 1.2);
    z.x = ca.x; z.z = ca.z;
    z._trailT = (z._trailT || 0) + dt;
    if (z._trailT >= 0.028) { z._trailT = 0; rt.bossFx.pushChargePoint(z.x, z.z); }
    if (rt.S.iframe <= 0 && !rt.S.dash && rt.dist(z, rt.S.hero) < z.r + 0.8) heroHurt(1, '흉내에 베였습니다.');
    if (m.t >= m.dur) { z.state = 'walk'; z.stateT = 0; z.mimic = null; }
    return true;
  }
  /* §4.4 무늬 뒤석기: 2초마다 무늬가 바뀐다. 금빛 0.4초에 그으면 고정된다(고정은 cutSpirit에서). */
  if (st === 'shuffle') {
    const s = z.shuffle;
    if (!s) { z.state = 'walk'; z.stateT = 0; return true; }
    s.t += dt;
    if (s.gold > 0) s.gold = Math.max(0, s.gold - dt);
    if (z.rimFlash > 0) z.rimFlash = Math.max(0, z.rimFlash - dt);
    if (!s.locked && s.t >= s.every) { s.t = 0; changeBossShape(z, true); }
    if (z.stateT >= s.dur) { z.state = 'walk'; z.stateT = 0; z.shuffle = null; }
    return true;
  }
  if (st === 'kiai') {
    const K = P.kiai, T = z.kiai.t;
    if (!z.kiai.open && z.stateT >= T - kiaiWin(K)) {
      z.kiai.open = true;
      if (!z.kiai.lock && rt.audio && rt.audio.gong) rt.audio.gong();
    }
    if (z.stateT >= T + K.grace) {
      rt.inkFx.ring(rt.arenaR(), rt.FX_COLORS.gold, 0.6);
      rt.bossFx.triggerKiaiBurst(z.x, z.z, false);
      if (rt.three) {
        if (rt.three.lights) rt.three.lights.burst(z.x, 1.8, z.z, { color: 0xff4234, intensity: 7.5, duration: 0.36, distance: 18 });
        if (rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(z.x, z.z, { r0: 1.0, r1: 7.8, colorHex: 0xff4234, coreHex: 0xffe4b8, dur: 0.44 });
        if (rt.three.vfx3d) {
          rt.three.vfx3d.spawnSwirl(z.x, z.z, { r0: 1.2, r1: 6.4, accentHex: 0xe83a2e, dur: 0.44 });
          rt.three.vfx3d.spawnSparks(z.x, z.z, 22, { color: 0xff7838, speed: 8.6 });
        }
        rt.triggerGroundCrackHeat(z.x, z.z, 5.4, 0xff4234);
      }
      if (rt.audio && rt.audio.bossSlam) rt.audio.bossSlam();
      rt.S.fogPulse = Math.max(rt.S.fogPulse || 0, 0.55);
      /* §3.4 대응 2개: 기물 뒤에 숨었으면(기물·보스 선분 0.8m 안) 피해 1로 경감. */
      const cover = totemCover(z);
      if (cover) rt.showJudge('기물 뒤로!');
      heroHurtForce(cover ? 1 : K.dmg, '귀물의 기합에 휩쓸렸습니다.', { note: cover });
      z.state = 'walk'; z.stateT = 0; z.kiai = null;
    }
    return true;
  }
  if (st === 'slamTele') {
    if (!z._warnTicked && z.stateT >= z.slam.tele * 0.78) {
      z._warnTicked = true;
      if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'vline');
    }
    /* v0.50: 순간이동 대신 마지막 0.38초 동안 포물선 도약 후 내려찍기 */
    const leapDur = Math.min(0.38, z.slam.tele * 0.42);
    const leapStart = Math.max(0, z.slam.tele - leapDur);
    if (z.stateT >= leapStart && z.stateT <= z.slam.tele) {
      const lu = rt.clamp((z.stateT - leapStart) / Math.max(0.01, leapDur), 0, 1);
      const sx = z.slam.fromX != null ? z.slam.fromX : z.x;
      const sz = z.slam.fromZ != null ? z.slam.fromZ : z.z;
      const ca = rt.clampPointToArena(sx + (z.slam.x - sx) * lu, sz + (z.slam.z - sz) * lu, 1.2);
      z.x = ca.x; z.z = ca.z;
      z.leapY = Math.sin(lu * Math.PI) * 3.8;
    } else {
      z.leapY = 0;
    }
    if (z.stateT > z.slam.tele) {
      const L = P.slam;
      z.x = z.slam.x; z.z = z.slam.z; z.leapY = 0; z._warnTicked = false;
      if (z.hidden) revealBoss(z);
      rt.bossFx.triggerSlamImpact(z.x, z.z, L.r);
      if (rt.three) {
        const sr = L.r || 3.4;
        if (rt.three.lights) rt.three.lights.burst(z.x, 1.6, z.z, { color: 0xff6230, intensity: 7.8, duration: 0.38, distance: 18 });
        if (rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(z.x, z.z, { r0: 0.8, r1: sr * 1.25, colorHex: 0xff542e, coreHex: 0xfff0c4, dur: 0.42 });
        if (rt.three.vfx3d) {
          rt.three.vfx3d.spawnSwirl(z.x, z.z, { r0: 0.9, r1: sr * 1.15, accentHex: 0xff5a32, dur: 0.42 });
          rt.three.vfx3d.spawnSparks(z.x, z.z, 24, { color: 0xff923e, speed: 8.8 });
        }
        rt.triggerGroundCrackHeat(z.x, z.z, sr * 1.35, 0xff6230);
      }
      /* 주인공 일섬 동급의 3D 교차 수묵 검기 + 먹파편 + 붉은 광원 폭발 */
      rt.makeBossSlash({ x: z.x - L.r * 0.85, z: z.z - L.r * 0.45 }, { x: z.x + L.r * 0.85, z: z.z + L.r * 0.45 }, { width: 2.6, height: 1.05 });
      rt.makeBossSlash({ x: z.x - L.r * 0.45, z: z.z + L.r * 0.85 }, { x: z.x + L.r * 0.45, z: z.z - L.r * 0.85 }, { width: 2.4, height: 0.9 });
      if (rt.three && rt.three.ink) rt.three.ink.kill(z.x, z.z, 0, 1, { scale: 1.85 });
      if (rt.three && rt.three.lights) rt.three.lights.burst(z.x, 1.25, z.z, { color: 0xf25236, intensity: 7.0, duration: 0.48 });
      if (rt.art && rt.art.playFx && rt.three) { const fx = rt.art.playFx(rt.three.scene, 'ink-splat', z.x, z.z, L.r); if (fx) rt.three.fx.push(fx); }
      rt.S.shake = Math.max(rt.S.shake || 0, 0.72);
      if (rt.audio) { if (rt.audio.bossSlam) rt.audio.bossSlam(); else rt.audio.explode(); }
      /* v0.52 다단 패턴: 2페이즈 또는 4장 이상에서는 착지 지점 양옆에 여진 장판 2개 추가 */
      if (z.phase2 || (rt.S.stageNo || 1) >= 4) {
        const baseA = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x);
        [-0.75, 0.75].forEach(function (off) {
          const ha = baseA + off;
          const hp = rt.clampPointToArena(z.x + Math.cos(ha) * (L.r + 1.4), z.z + Math.sin(ha) * (L.r + 1.4), 1.5);
          spawnHazard(hp.x, hp.z, 2.1, 0.82);
        });
      }
      const d = rt.dist(z, rt.S.hero);
      if (d <= L.r) {
        if (rt.S.dash) bossJustDodge(z);
        else {
          heroHurt(L.dmg, '내려찍기에 맞았습니다.');
          const k = d > 0.01 ? d : 1;
          const kb = rt.clipBound({ x: rt.S.hero.x + (rt.S.hero.x - z.x) / k * 2.0, z: rt.S.hero.z + (rt.S.hero.z - z.z) / k * 2.0 }); rt.S.hero.x = kb.x; rt.S.hero.z = kb.z; if (rt.three && rt.three.hero) rt.placeGroup(rt.three.hero, rt.S.hero.x, rt.S.hero.z);
        }
      }
      if (z.state === 'slamTele') { z.state = 'stun'; z.stateT = 0; z.stunT = L.stun; }
    }
    return true;
  }
  const _gimmickRes = stepBossGimmick(z, dt, P);
  if (_gimmickRes !== null) return _gimmickRes;
  if (st === 'clones') {
    const C = P.clones;
    ensureCloneSpirits(z);
    z.bellT = (z.bellT || 0) - dt;
    if (z.bellT <= 0) {
      z.bellT = C.bell;
      const sp = rt.livingMarks().filter(function (m) { return m.target === z; })[0];
      if (sp) rt.ringSpiritBell(sp);
      z.ping = 0.6;
    }
    if (z.ping > 0) z.ping -= dt;
    if (z.stateT > C.t) { endClones(z); startCharge(z); }
    return true;
  }
  if (st === 'veil') {
    const V = P.veil;
    rt.S.fogPulse = Math.max(rt.S.fogPulse || 0, 0.7);
    z.bellT = (z.bellT || 0) - dt;
    if (z.bellT <= 0) {
      z.bellT = V.bell * (rt.relicOn(rt.save, 'eye') ? 0.8 : 1);
      const w = rt.viewBox().width;
      const p = rt.projectXZ(z.x, z.z, 1.5);
      if (rt.audio) rt.audio.bell(rt.clamp((p.x / Math.max(1, w)) * 2 - 1, -1, 1), z.shape);
      z.ping = 0.6;
    }
    if (z.ping > 0) z.ping -= dt;
    if (z.stateT > V.t) bossAmbush(z);
    return true;
  }
  if (st === 'volleyTele') {
    const vDur = z.volleyTele || P.volley.tele;
    if (!z._warnTicked && z.stateT >= vDur * 0.78) {
      z._warnTicked = true;
      if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'vline');
    }
    if (z.stateT > vDur) {
      z._warnTicked = false;
      const Vo = P.volley, gold = z.volleyGold || {};
      if (!Object.keys(gold).length) {
        while (Object.keys(gold).length < Math.min(Vo.gold, Vo.n)) gold[Math.floor(Math.random() * Vo.n)] = true;
      }
      for (let i = 0; i < Vo.n; i++) {
        const a = z.aimA + (Vo.n > 1 ? (i / (Vo.n - 1) - 0.5) : 0) * Vo.spread * 2;
        spawnBossShot(z, a, !!gold[i]);
      }
      z.volleyGold = null;
      rt.bossFx.triggerSmokeBurst(z.x, z.z, false);
      if (rt.three && rt.three.lights) rt.three.lights.burst(z.x, 1.4, z.z, { color: 0xe64532, intensity: 4.0, duration: 0.3 });
      if (rt.audio) { if (rt.audio.bossVolley) rt.audio.bossVolley(); else rt.audio.slash(); }
      z.state = 'walk'; z.stateT = 0;
    }
    return true;
  }
  if (st === 'chant') {
    if (z.stateT > (z.chantT || P.chant.t)) {
      rt.inkFx.ring(rt.arenaR(), rt.FX_COLORS.jade, 0.7);
      /* §3.4 대응 2개: 무늬 3개 중 2개 이상을 끊었으면 피해 1. */
      const broken = z.chant ? z.chant.i : 0;
      if (broken >= 2) rt.showJudge('거의 끊었다');
      heroHurtForce(broken >= 2 ? 1 : P.chant.dmg, '영창이 터졌습니다.', { note: broken >= 2 });
      z.state = 'walk'; z.stateT = 0; z.chant = null;
    }
    return true;
  }
  if (st === 'sealing') {
    /* 封 글자가 다 번질 때까지 기다렸다가 쓰러진다. */
    if (z.stateT > 0.8) rt.killZombie(z, rt.S.lastDash);
    return true;
  }
  if (st === 'seal') {
    if (z.stateT > P.seal.t) {
      /* v0.52 버그 수정: 봉인 실패 시 HP=0에 고착되지 않도록 최대 HP의 22%를 회복하고 전투 복귀 */
      const recover = Math.max(4, Math.ceil((z.maxHp || 18) * 0.22));
      z.hp = recover;
      z.hpTrail = recover;
      z.state = 'walk'; z.stateT = 0;
      z.shape = z.seq[z.seqI] || z.seq[0];
      refreshBossGlyphs(z);
      rt.bossFx.triggerSmokeBurst(z.x, z.z, false);
      rt.showJudge('봉인 실패');
      rt.toast('귀물이 기력을 되찾았습니다 (+' + recover + ' 체력)');
    }
    return true;
  }
  return null;
}
/** Damage that the dash does not dodge (the kiai blast, a broken chant, a fake's counter, the closing barrier).
    v0.29 §3.4 공정성: 피격 무적 중에는 연쇄로 발동하지 않고, 판에서 처음 맞는 큰 피해는 1로 깎는다. */
function heroHurtForce(n, why, opts) {
  if (!rt.S || !rt.S.playing) return false;
  opts = opts || {};
  /* §3.4 연쇄 금지: 방금다 맞은 뒤 무적(0.8초) 중에는 다음 공격이 예고만 하고 발동하지 않는다. */
  if ((rt.S.iframe || 0) > 0.05) { if (opts.note) rt.showJudge('막아냈다'); return false; }
  if (mirrorSave(why)) return false;
  let dmg = n;
  /* §3.4 첫 실패 완화: 이 판에서 처음 맞는 '피할 수 없는' 공격은 피해 1. */
  if (dmg >= 2 && !rt.S.firstForcedHit) {
    rt.S.firstForcedHit = true;
    dmg = rt.CFG.firstForcedDmg || 1;
    rt.showJudge('처음은 가볍게');
  }
  /* v0.30 §7.2 모드 배율. */
  dmg = rt.modeDmg(dmg) + relicDmgAdd();
  noteHit();
  rt.S.hp -= dmg;
  if (rt.S.hp <= 0) rt.S.deathWhy = why;
  rt.S.iframe = rt.CFG.iframeMs / 1000;
  rt.S.hurtFlash = rt.CFG.hurtVignette || 0.3;
  rt.S.shake = Math.max(rt.S.shake || 0, 0.8);
  if (rt.three && rt.three.heroSpr && rt.art.kickChar) rt.art.kickChar(rt.three.heroSpr, 1);
  const app = $('app');
  if (app) app.classList.add('hurt');
  if (rt.audio) rt.audio.explode();
  rt.renderHud();
  if (rt.S.hp <= 0) rt.endRun(false, why);
  return true;
}
/* §3.4 대응 2개(기모으기): 보스와 주인공 사이 선분 0.8m 안에 기물이 있으면 몸을 숨긴 것 — 피해 1. */
function totemCover(boss) {
  if (!boss || !rt.S || !rt.S.hero) return false;
  const ax = rt.S.hero.x, az = rt.S.hero.z, bx = boss.x, bz = boss.z;
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  return bossMinions().some(function (t) {
    const u = ((t.x - ax) * dx + (t.z - az) * dz) / L2;
    if (u <= 0.05 || u >= 0.95) return false;
    const px = ax + dx * u, pz = az + dz * u;
    return Math.hypot(t.x - px, t.z - pz) <= 0.8;
  });
}
function bossJustDodge(z) {
  rt.S.slowT = Math.max(rt.S.slowT || 0, bossPat().dodgeSlow || 0.5);
  rt.showJudge('간발 회피 — 자세 타격!');
  if (z.pat) notePatSeen(z.pat, 'dodge');
  rt.telemetry.event('boss_pattern', { p: z.pat || null, result: 'dodge', t: +(z.stateT || 0).toFixed(2) });
  if (rt.three && rt.three.shaderFx3d && rt.S && rt.S.hero) rt.three.shaderFx3d.spawnShockwave(rt.S.hero.x, rt.S.hero.z, { r0: 0.7, r1: 4.6, colorHex: 0x7ef2d0, coreHex: 0xf4fffc, dur: 0.36 });
  bossPoise(z, (2.2 + (rt.swordFx(rt.save).parryPoiseAdd || 0) + (rt.relicOn(rt.save, 'sheath') ? 0.8 : 0)) * (1 + rt.poiseBonus()));
}
/** Deterministic poise pool decrement with idempotent single-event stagger transition. */
function bossPoise(z, n) {
  if (!z || !z.alive || z.state === 'groggy' || z.state === 'seal' || z.state === 'sealing') return;
  const pMax = z.poiseMax || (bossPat() && bossPat().poise) || 6;
  const before = z.poise == null ? pMax : z.poise;
  z.poise = Math.max(0, before - Math.max(0, Number(n || 0)));
  z.poiseLastHit = rt.S.elapsed || 0;
  if (before > 0 && z.poise <= 0) {
    z.poiseBreakSeq = (z.poiseBreakSeq || 0) + 1;
    bossGroggy(z);
  }
}
function bossGroggy(z) {
  endBossSide(z);
  rt.bumpDaily('q_poise', 1);
  if (rt.S) rt.S.poiseBreaksN = (rt.S.poiseBreaksN || 0) + 1;
  rt.haptic([28, 36, 52]);
  const gt = ((bossPat() && bossPat().groggyT) || 3.4) + (rt.swordFx(rt.save).groggyAdd || 0) + (rt.relicOn(rt.save, 'eye') ? 0.25 : 0);
  z.state = 'groggy'; z.stateT = 0; z.groggyDur = gt; z.leapY = 0; z.poise = 0;
  if (rt.S && !rt.a11yShake() && !rt.reducedMotion()) { rt.S.camZoomT = 2.2; rt.S.camZoomAmt = 4.2; }
  z.openUntil = Math.max(z.openUntil || 0, (rt.S.elapsed || 0) + gt);
  rt.S.shake = Math.max(rt.S.shake || 0, 0.72);
  rt.S.hitstop = Math.max(rt.S.hitstop || 0, 0.085);
  rt.bossFx.triggerGroggyBreak(z.x, z.z);
  if (rt.three && rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(z.x, z.z, { r0: 1.2, r1: 7.4, colorHex: 0xffd258, coreHex: 0xfffdf0, dur: 0.56 });
  if (rt.three && rt.three.vfx3d) {
    rt.three.vfx3d.spawnLightning({ x: z.x, y: 8.5, z: z.z }, { x: z.x, y: 0.2, z: z.z }, { color: 0xffd26a, core: 0xfffdf2, hold: 0.18, fade: 0.24, sparks: 22 });
    rt.three.vfx3d.spawnSwirl(z.x, z.z, { r0: 1.6, r1: 5.4, accentHex: 0xf0c258, dur: 0.52 });
    rt.three.vfx3d.triggerImpactFrame({ dur: 0.08, safe: rt.a11yShake() });
    rt.triggerGroundCrackHeat(z.x, z.z, 5.5, 0xffd26a);
  }
  if (rt.audio && rt.audio.bossBreak) rt.audio.bossBreak();
  if (rt.S && (!rt.a11yShake() && !rt.reducedMotion())) rt.S.impactFrameT = 0.085;
  rt.showJudge('자세 붕괴 — 일섬!');
  rt.toast('귀물의 자세가 무너졌습니다 — 지금 일섬 피해 2.00배');
  rt.telemetry.event('boss_poise_break', { stage: rt.S.stageNo, seq: z.poiseBreakSeq || 1, phase: z.phase || 1 });
}
/** Ends whatever side pieces a pattern left out: clones, the fog veil, a chant, a kiai. */
function endBossSide(z) {
  endClones(z);
  if (z.hidden) revealBoss(z);
  z.chant = null; z.kiai = null;
  z.donut = null; z.soak = null; z.rhythm = null; z.tether = null; z.gaze = null; z.pizza = null;
  clearZoneSpirits();
}
/* 기모으기: 금빛 칸(마지막 win초)에서 탭하면 받아치고 기세가 단번에 무너진다. 이르게 누르면 그 기합은 막을 수 없다. */
function kiaiTap() {
  const z = rt.S && rt.S.boss;
  if (!z || !z.alive || z.state !== 'kiai' || !z.kiai) return null;
  const K = bossPat().kiai;
  if (z.kiai.lock) { rt.showJudge('흐트러졌다'); return { kiai: 'locked' }; }
  if (z.stateT < z.kiai.t - kiaiWin(K)) {
    /* §3.4 재시도: 이른 탭은 판당 한 번 봐준다 — 두 번째 이른 탭부터 실패. */
    z.kiai.early = (z.kiai.early || 0) + 1;
    rt.telemetry.event('parry', { target: 'kiai', errMs: Math.round((z.stateT - (z.kiai.t - kiaiWin(K))) * 1000), result: 'early' });
    if (z.kiai.early <= 1) {
      rt.showJudge('아직 — 조금만 더');
      if (rt.audio && rt.audio.whiff) rt.audio.whiff();
      return { kiai: 'earlyGrace' };
    }
    z.kiai.lock = true;
    rt.showJudge('이르다!');
    if (rt.audio && rt.audio.whiff) rt.audio.whiff(true);
    return { kiai: 'early' };
  }
  rt.telemetry.event('parry', { target: 'kiai', errMs: Math.round((z.stateT - (z.kiai.t - kiaiWin(K))) * 1000), result: 'parry' });
  rt.S.parryFlash = 0.25;
  rt.S.iframe = Math.max(rt.S.iframe || 0, 0.5);
  if (rt.three && rt.three.shaderFx3d && rt.S && rt.S.hero) rt.three.shaderFx3d.spawnShockwave(rt.S.hero.x, rt.S.hero.z, { r0: 0.9, r1: 5.5, colorHex: 0xffe07a, coreHex: 0xffffff, dur: 0.42 });
  rt.addHitstop(0.15);
  /* §3.1: 받아치기에는 화면 가장자리 금빛 번쩍임 0.2초. */
  rt.S.goldEdge = Math.max(rt.S.goldEdge || 0, 0.2);
  rt.addCharge(K.charge || 20);
  if (rt.audio) rt.audio.parry();
  rt.inkFx.ring(4, rt.FX_COLORS.gold, 0.5);
  rt.bossFx.triggerKiaiBurst(z.x, z.z, true);
  rt.showJudge('받아치기!');
  notePatSeen('kiai', 'parry');
  bossGroggy(z);
  return { kiai: 'parry' };
}
/* 분신: 진짜만 방울이 운다. 진짜를 겨눠 베면 경직, 가짜를 겨누면 반격. */
function startClones(z) {
  const C = bossPat().clones, n = C.n + 1;
  const R = rt.ringR() * C.r, a0 = Math.random() * Math.PI * 2, realI = Math.floor(Math.random() * n);
  z.clones = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + i * Math.PI * 2 / n;
    const p = rt.clampPointToArena(rt.S.hero.x + Math.cos(a) * R, rt.S.hero.z + Math.sin(a) * R, 1.5);
    rt.inkFx.burst(p.x, p.z, rt.FX_COLORS.jade, { r1: 40, n: 8, dur: 0.5 });
    if (i === realI) { z.x = p.x; z.z = p.z; continue; }
    const c = { id: ++rt.S._id, kind: 'zombie', type: 'clone', x: p.x, z: p.z, r: z.r, alive: true, hp: 1, isClone: true, frozen: 0, burn: 0, poison: 0, stun: 0, marked: false };
    c.obj = rt.addEntityVisual('boss', z.shape, { bossVar: rt.S.bossVar, bossAct: rt.S.bossAct || 1 });
    rt.placeGroup(c.obj, c.x, c.z);
    rt.S.zombies.push(c);
    z.clones.push(c);
  }
  rt.placeGroup(z.obj, z.x, z.z);
  z.state = 'clones'; z.stateT = 0; z.bellT = 0.5;
  ensureCloneSpirits(z);
  bossCue(z, 'jade', 'clones');
}
function popClone(c, counter) {
  if (!c || !c.alive) return;
  c.alive = false;
  if (c.obj && rt.three) rt.three.scene.remove(c.obj);
  rt.inkFx.burst(c.x, c.z, rt.FX_COLORS.poison, { r1: 40, n: 8, dur: 0.45 });
  if (counter) { rt.showJudge('가짜!'); heroHurtForce(bossPat().clones.dmg, '분신에게 반격당했습니다.'); }
  rt.assignSpiritTargets();
}
function endClones(z) {
  if (!z.clones || !z.clones.length) return;
  z.clones.forEach(function (c) { popClone(c, false); });
  z.clones = [];
}
/* 은신: 혼령이 꺼지고 방울만 운다. 소리 쪽으로 그은 획이 맞으면 돌진해 벤다. */
function startVeil(z) {
  const V = bossPat().veil;
  const a = Math.random() * Math.PI * 2, d = V.dist[0] + Math.random() * (V.dist[1] - V.dist[0]);
  const p = rt.clampPointToArena(rt.S.hero.x + Math.cos(a) * d, rt.S.hero.z + Math.sin(a) * d, 1.5);
  rt.inkFx.burst(z.x, z.z, rt.FX_COLORS.jade, { r1: 50, n: 10, dur: 0.6 });
  rt.bossFx.triggerSmokeBurst(z.x, z.z, true);
  z.x = p.x; z.z = p.z;
  z.hidden = true;
  if (z.obj) z.obj.visible = false;
  rt.livingMarks().filter(function (m) { return m.target === z; }).forEach(rt.destroySpirit);
  z.state = 'veil'; z.stateT = 0; z.bellT = 0.4;
  bossCue(z, 'jade', 'veil');
}
function revealBoss(z) {
  z.hidden = false;
  rt.bossFx.triggerSmokeBurst(z.x, z.z, true);
  if (z.obj) { z.obj.visible = true; rt.placeGroup(z.obj, z.x, z.z); }
  rt.assignSpiritTargets();
}
function bossAmbush(z) {
  revealBoss(z);
  rt.showJudge('기습!');
  startSlam(z, bossPat().veil.ambushTele);
}
/** A stroke while the boss hides: true if it was used (a dash at the boss or a miss that wakes it). */
function veilStroke(pts) {
  const z = rt.S && rt.S.boss;
  if (!z || !z.alive || z.state !== 'veil' || rt.S.dash) return false;
  const dir = rt.strokeScreenDir(pts);
  if (!dir) return false;
  const hs = rt.heroScreen(), bp = rt.projectXZ(z.x, z.z, 0.8);
  const L = Math.hypot(bp.x - hs.x, bp.y - hs.y) || 1;
  const cos = ((bp.x - hs.x) / L) * dir.x + ((bp.y - hs.y) / L) * dir.y;
  if (cos < bossPat().veil.cone) { rt.showJudge('빗나감'); bossAmbush(z); return true; }
  revealBoss(z);
  dashAtBoss(z, 'hline');
  return true;
}
function dashAtBoss(z, type) {
  const rec = { type: type, targets: [z.id], hits: [], items: [], t0: rt.now(), segs: [], elem: rt.curElem(), cinematic: false, quality: 0 };
  rt.S.dashSeq = (rt.S.dashSeq || 0) + 1;
  rt.S.lastDash = rec;
  rt.S.dashQueue = [z];
  rt.startSeg();
  return rec;
}
/* 부적 탄막: 부채꼴. 금빛 부적은 탭으로 되받아 보스를 벤다. */
function spawnBossShot(z, a, gold) {
  const sh = spawnShot({ x: z.x, z: z.z });
  if (!sh) return null;
  const sp = bossPat().volley.speed;
  sh.vx = Math.cos(a) * sp; sh.vz = Math.sin(a) * sp;
  /* v0.52: 커스텀 살부적 2D 에셋(boss-talisman.webp)이 선명히 보이도록 구형 3D 기본 메쉬를 축소/숨김 */
  if (sh.mesh) sh.mesh.visible = false;
  if (gold) sh.gold = true;
  return sh;
}
/* v0.52: 언월도 초승달 검기 파동 투사체 (boss-wave.webp) */
function spawnBossWave(z, a) {
  const sh = spawnShot({ x: z.x + Math.cos(a) * 1.1, z: z.z + Math.sin(a) * 1.1 });
  if (!sh) return null;
  const sp = ((bossPat().sweep && bossPat().sweep.waveSpeed) || 10.5);
  sh.vx = Math.cos(a) * sp; sh.vz = Math.sin(a) * sp;
  sh.isWave = true;
  sh.r = 0.85;
  sh.dmg = 2;
  sh.life = 2.1;
  if (sh.mesh) sh.mesh.visible = false;
  return sh;
}
function reflectGoldShots(R) {
  let n = 0;
  (rt.S.shots || []).forEach(function (sh) {
    if (!sh.gold || sh.reflect) return;
    if (Math.hypot(sh.x - rt.S.hero.x, sh.z - rt.S.hero.z) > R + 0.6) return;
    sh.reflect = true; sh.t = 0; n++;
    rt.inkFx.burst(sh.x, sh.z, rt.FX_COLORS.gold, { r1: 30, n: 6, dur: 0.35 });
  });
  return n;
}
/** Moves a reflected gold charm home to the boss; true while it flies. */
function stepReflectedShot(sh, dt) {
  /* v0.31 §3.5: 일반 투척 부적을 되받으면 던진 원귀에게 돌아가 꿰뚫는다. */
  const bt = sh.backTo;
  if (bt) {
    if (!bt.alive) return false;
    const dx = bt.x - sh.x, dz = bt.z - sh.z, L = Math.hypot(dx, dz) || 1;
    const sp = (rt.CFG.shotSpeed || 7.2) * 2.0;
    sh.x += dx / L * sp * dt; sh.z += dz / L * sp * dt;
    if (sh.mesh) sh.mesh.position.set(sh.x, 0.75, sh.z);
    if (L < (bt.r || 0.55) + 0.45) {
      rt.showJudge('되받아침!');
      rt.addCharge(rt.CFG.preciseCharge || 10);
      rt.hurtZombie(bt, 9999, 'counter-kill', rt.S.lastDash);
      return false;
    }
    return sh.t < 3;
  }
  const b = rt.S.boss;
  if (!b || !b.alive) return false;
  const dx = b.x - sh.x, dz = b.z - sh.z, L = Math.hypot(dx, dz) || 1;
  const sp = bossPat().volley.speed * 1.8;
  sh.x += dx / L * sp * dt; sh.z += dz / L * sp * dt;
  if (sh.mesh) sh.mesh.position.set(sh.x, 0.75, sh.z);
  if (L < b.r + 0.5) {
    rt.showJudge('되받아침! 빈틈');
    if (b.state !== 'seal') {
      rt.cutBoss(b);
      rt.hurtZombie(b, 3.2, 'bang', rt.S.lastDash);
    }
    return false;
  }
  return sh.t < 3;
}
/* 결계 수축: 결계가 조이는 동안 부적 기둥을 모두 베면 풀린다. 다 조이면 짓눌린다. */
function startShrink(z) {
  if (!rt.S.arena || rt.S.arena.shrink) return;
  const K = bossPat().shrink;
  rt.S.arena.r0 = rt.S.arena.r0 || rt.S.arena.r;
  rt.S.arena.shrink = { from: rt.S.arena.r, to: K.to, t: 0, dur: K.t, pillars: [] };
  for (let i = 0; i < K.n; i++) {
    const a = Math.random() * 0.6 + i * Math.PI * 2 / K.n, rr = rt.arenaR()-.35;
    const p = { id: ++rt.S._id, kind: 'zombie', type: 'pillar', x: rt.S.arena.x + Math.cos(a) * rr, z: rt.S.arena.z + Math.sin(a) * rr, r: 0.6, alive: true, hp: 1, isPillar: true, frozen: 0, burn: 0, poison: 0, stun: 0, marked: false };
    p.edgeAngle=a;
    p.obj = makePillarObj();
    if (rt.three) rt.three.scene.add(p.obj);
    rt.placeGroup(p.obj, p.x, p.z);
    rt.S.zombies.push(p);
    rt.S.arena.shrink.pillars.push(p);
  }
  bossCue(z, 'jade', 'shrink');
  rt.assignSpiritTargets();
}
/* v0.34 §14 보스전 풀: 기둥·기물은 한 번 만들어 돌려 쓴다(최대 개수 고정). */
const PILLAR_POOL_MAX = 6;
const pillarPool = [];
function makePillarObj() {
  const g = new rt.THREE.Group();
  if (!rt.three) return g;
  if (!geosPillar.body) {
    geosPillar.body = new rt.THREE.CylinderGeometry(0.32, 0.42, 2.6, 10);
    geosPillar.band = new rt.THREE.BoxGeometry(0.5, 1.4, 0.06);
    geosPillar.bodyMat = new rt.THREE.MeshBasicMaterial({ color: 0x6a2a20 });
    geosPillar.bandMat = new rt.THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.9, blending: rt.THREE.AdditiveBlending, depthWrite: false });
  }
  const body = new rt.THREE.Mesh(geosPillar.body, geosPillar.bodyMat);
  body.position.y = 1.3;
  g.add(body);
  const band = new rt.THREE.Mesh(geosPillar.band, geosPillar.bandMat);
  band.position.set(0, 1.5, 0.4);
  g.add(band);
  g.userData.pillar = true;
  return g;
}
const geosPillar = {};
function breakPillar(p) {
  if (!p.alive) return;
  p.alive = false;
  if (p.obj && rt.three) rt.three.scene.remove(p.obj);
  if (rt.art && rt.art.playFx && rt.three) { const fx = rt.art.playFx(rt.three.scene, 'ink-splat', p.x, p.z, 1.6); if (fx) rt.three.fx.push(fx); }
  if (rt.audio) rt.audio.hit();
  const sk = rt.S.arena && rt.S.arena.shrink;
  const left = sk ? sk.pillars.filter(function (q) { return q.alive; }).length : 0;
  rt.showJudge('기둥 ' + (sk ? sk.pillars.length - left : 0) + '/' + (sk ? sk.pillars.length : 0));
  rt.assignSpiritTargets();
  if (sk && !left) {
    endShrink(false);
    rt.showJudge('결계 해제');
    if (rt.S.boss && rt.S.boss.alive) bossPoise(rt.S.boss, 1);
  }
}
function endShrink(crush) {
  const sk = rt.S.arena && rt.S.arena.shrink;
  if (!sk) return;
  /* §3.4 대응 2개: 기둥을 2개 이상 부쉈으면 짓눌림이 가볍다(피해 1). */
  const broken = sk.pillars.filter(function (p) { return !p.alive; }).length;
  sk.pillars.forEach(function (p) { if (p.alive) { p.alive = false; if (p.obj && rt.three) rt.three.scene.remove(p.obj); } });
  rt.S.arena.shrink = null;
  rt.S.arena.r = rt.S.arena.r0 || rt.CFG.arenaR || 12;
  if (rt.three && rt.three.arena) rt.three.arena.group.scale.set(1, 1, 1);
  if (crush) heroHurtForce(broken >= 2 ? 1 : bossPat().shrink.dmg, '좁아진 결계에 짓눌렸습니다.', { note: broken >= 2 });
  rt.assignSpiritTargets();
}
function stepShrink(dt) {
  const sk = rt.S && rt.S.arena && rt.S.arena.shrink;
  if (!sk) return;
  sk.t += dt;
  rt.S.arena.r = sk.from + (sk.to - sk.from) * rt.clamp(sk.t / sk.dur, 0, 1);
  const k = rt.S.arena.r / (rt.S.arena.r0 || sk.from);
  if (rt.three && rt.three.arena) rt.three.arena.group.scale.set(k, 1, k);
  if (sk.t >= sk.dur + 0.5) endShrink(true);
}
/* 봉인 마무리: 순서를 다 베면 무릎 꿇는다. 획이 교차하는 한붓별(⛤)을 그려야 끝난다. */
function startSeal(z) {
  endBossSide(z);
  z.state = 'seal'; z.stateT = 0;
  refreshBossGlyphs(z);
  rt.showJudge('봉인하라');
  bossCue(z, 'jade', 'seal');
}
function sealStroke() {
  const z = rt.S && rt.S.boss;
  if (!z || !z.alive || z.state !== 'seal') return false;
  z.sealed = true;
  z.state = 'sealing'; z.stateT = 0;
  rt.S.sealFx = 0.9;
  rt.S.slowT = Math.max(rt.S.slowT || 0, 0.5);
  rt.addHitstop(0.2);
  if (rt.audio) { rt.audio.explode(); rt.audio.bell(0, 'bolt'); }
  rt.inkFx.ring(6, rt.FX_COLORS.gold, 0.8);
  rt.showJudge('봉인!');
  if (rt.S && rt.S.stage && rt.BOSS_QUOTES) {
    const bq = rt.BOSS_QUOTES[rt.actOf(rt.S.stage.id || 1)];
    if (bq && bq.seal) showBossCard(rt.S.stage, bq.seal);
  }
  return true;
}
/** A stroke while the boss chants: right shape advances, wrong shape is spent. */
function chantStroke(type) {
  const z = rt.S && rt.S.boss;
  if (!z || !z.alive || z.state !== 'chant' || !z.chant) return false;
  const c = z.chant;
  if (type !== c.seq[c.i]) { rt.showJudge('틀린 획'); if (rt.audio && rt.audio.whiff) rt.audio.whiff(); return true; }
  c.i++;
  if (rt.audio && rt.audio.bellCut) rt.audio.bellCut(0, type);
  if (c.i < c.seq.length) { rt.showJudge('끊음 ' + c.i + '/' + c.seq.length); return true; }
  z.chant = null;
  z.state = 'stun'; z.stateT = 0; z.stunT = bossPat().chant.stun;
  rt.showJudge('영창 파훼!');
  if (rt.audio) rt.audio.breakCue();
  notePatSeen('chant', 'break');
  rt.telemetry.event('boss_pattern', { p: 'chant', result: 'break', t: 0 });
  bossPoise(z, 1);
  return true;
}
function triggerPhaseCut(z, nextPhase, invulnDur, title, msg) {
  const nowT = rt.S.elapsed || 0;
  const act = rt.actOf(rt.S.stageNo || 1);
  const pfx = rt.getActPhaseFx(act, nextPhase);
  const cutTitle = title || pfx.title;
  const cutMsg = msg || pfx.msg;
  z.phase = nextPhase;
  if (nextPhase === 2) z.phase2 = true;
  if (nextPhase === 3) z.phase3 = true;
  if (z.obj && rt.art && rt.art.setBossPhase) rt.art.setBossPhase(z.obj, nextPhase, pfx.auraHex);
  if (rt.audio && rt.audio.setBossPhase) rt.audio.setBossPhase(nextPhase);
  z.phaseCutInvulnUntil = nowT + invulnDur;
  const pMax = z.poiseMax || 6;
  z.poise = Math.min(pMax, (z.poise || 0) + pMax * (nextPhase === 3 ? 0.45 : 0.40));
  if (rt.S && rt.S.hero) {
    const dx = rt.S.hero.x - z.x, dz = rt.S.hero.z - z.z, d = Math.hypot(dx, dz) || 0.01;
    if (d < 5.2) {
      const push = 5.2 - d;
      const pushed = rt.clipBound({ x: rt.S.hero.x + (dx / d) * push, z: rt.S.hero.z + (dz / d) * push });
      rt.S.hero.x = pushed.x;
      rt.S.hero.z = pushed.z;
      if (rt.three && rt.three.hero) rt.placeGroup(rt.three.hero, rt.S.hero.x, rt.S.hero.z);
    }
  }
  if (rt.S && !rt.a11yShake() && !rt.reducedMotion()) {
    rt.S.camZoomT = Math.max(rt.S.camZoomT || 0, 1.35);
    rt.S.camZoomAmt = Math.max(rt.S.camZoomAmt || 0, nextPhase === 3 ? 4.8 : 3.6);
  }
  if (rt.three && rt.three.shaderFx3d) {
    rt.three.shaderFx3d.spawnShockwave(z.x, z.z, { r0: 1.4, r1: Math.max(5.8, pfx.swirlR * 1.25), colorHex: pfx.hex, coreHex: pfx.core || 0xfff8ee, dur: 0.56 });
  }
  rt.S.shake = Math.max(rt.S.shake || 0, nextPhase === 3 ? 0.85 : 0.72);
  rt.S.hitstop = Math.max(rt.S.hitstop || 0, 0.07);
  rt.inkFx.ring(nextPhase === 3 ? rt.arenaR() : pfx.swirlR, pfx.ringCss || (nextPhase === 3 ? rt.FX_COLORS.gold : rt.FX_COLORS.vermilion), 0.78);
  if (rt.three && rt.three.vfx3d) {
    const pCol = pfx.hex;
    const pCore = pfx.core || 0xfff8ee;
    const bolts = pfx.bolts || 1;
    for (let bi = 0; bi < bolts; bi++) {
      const ang = (bi / bolts) * Math.PI * 2;
      const rad = bi === 0 ? 0 : 2.6;
      const bx = z.x + Math.cos(ang) * rad;
      const bz = z.z + Math.sin(ang) * rad;
      rt.three.vfx3d.spawnLightning({ x: bx, y: 9.2, z: bz }, { x: bx, y: 0.2, z: bz }, { color: pCol, core: pCore, hold: 0.18, fade: 0.28, sparks: bi === 0 ? 24 : 12 });
    }
    rt.three.vfx3d.spawnSwirl(z.x, z.z, { r0: 1.8, r1: pfx.swirlR, accentHex: pCol, dur: 0.62 });
    rt.three.vfx3d.triggerImpactFrame({ dur: 0.085, safe: rt.a11yShake() });
    rt.triggerGroundCrackHeat(z.x, z.z, pfx.swirlR, pCol);
  }
  if (rt.audio && rt.audio.gong) rt.audio.gong();
  if (rt.S && (!rt.a11yShake() && !rt.reducedMotion())) rt.S.impactFrameT = 0.075;
  rt.showJudge(cutTitle);
  rt.toast(cutMsg);
  rt.telemetry.event('boss_phase', { stage: rt.S.stageNo, act: act, phase: nextPhase, seqI: z.seqI, hpRatio: +(z.hp / Math.max(1, z.maxHp)).toFixed(2) });
}
function bossPhaseCheck(z) {
  const B = bossCfg();
  const ratio = z.hp / Math.max(1, z.maxHp);
  const hasP3 = !!(B.phase3 || (rt.S.stageNo || 1) >= 12);
  if (!z.phase2 && ratio <= 0.605) {
    triggerPhaseCut(z, 2, 1.15);
  }
  if (hasP3 && !z.phase3 && ratio <= 0.305) {
    rt.S.phaseTele = rt.CFG.phase3Tele || 0.9;
    if (rt.S.arena && B.phase3) {
      rt.S.arena.r0 = rt.S.arena.r0 || rt.S.arena.r;
      rt.S.arena.r = Math.min(rt.S.arena.r, rt.CFG.phase3R || 9);
      rt.S.arena.fixedR = rt.S.arena.r;
      if (rt.three && rt.three.arena) {
        const k = rt.S.arena.r / (rt.S.arena.r0 || rt.CFG.arenaR || 12);
        rt.three.arena.group.scale.set(k, 1, k);
      }
    }
    triggerPhaseCut(z, 3, 1.25);
  }
}
/* v0.52 / v1.08: 보스 스킬명 + 대응 행동 + 정밀 타이밍 배너 데이터 (modules/bossPatterns.js 위임) */
function bossBannerInfo(z) {
  const act = (rt.S && rt.S.stage) ? rt.actOf(rt.S.stage.id) : 1;
  return rt.buildBossBannerInfo(z, bossPat(), rt.bossTiming(), act);
}
const { stepBossGimmick } = createBossGimmickStep(rt, {
  heroHurt, notePatSeen, applyVulnStack, clearZoneSpirits,
  spawnDonutZoneSpirit, spawnPizzaSafeSpirit, bossJustDodge,
  bossPoise, spawnBossShot, spawnBossWave
});
const { drawBossPat } = createBossOverlay(rt, {
  bossPat, kiaiWin, bossMinions, reflectReady, bossPatList, bossBannerInfo
});
function maybeEnd() {
  if (!rt.S || rt.S.won || rt.S.lost || !rt.S.playing) return;
  if (rt.S.hp <= 0) { rt.endRun(false, rt.challengeOf(rt.S.challenge) ? rt.challengeOf(rt.S.challenge).name + '에서 쓰러졌습니다.' : '좀비에게 닿았습니다.'); return; }
  if (rt.S.challenge) { rt.challengeProgress(); return; }
  if (rt.S.boss && !rt.S.boss.alive) rt.endRun(true, '귀물을 베었습니다.');
}
  return { applySkin, bossCfg, bossHasNewGimmick, bossMinions, bossPat, bossPatList, bossPhaseCheck, bossPoise, bossVisualOf, breakPillar, breakTotem, chantStroke, clashStroke, clearOrbitSpirits, cloneHeld, codexBoss, codexEvo, codexMon, dashAtBoss, drawBossPat, endBossSide, endShrink, goldShotMaterial, hazardGeo, hazardPool, heroHurt, heroHurtForce, kiaiTap, kiaiWin, makePillarObj, makeReflectMesh, makeTotemObj, maybeEnd, mirrorSave, noteHit, notePatSeen, popClone, reflectGoldShots, reflectReady, refreshBossGlyphs, releaseShotMesh, relicDmgAdd, revealBoss, rhythmTap, sealStroke, shotGeo, shotMaterial, shotPool, showBossCard, spawnHazard, spawnShot, startBossPattern, startSeal, stepBoss, stepBossSummons, stepEnemySpecial, stepHazards, stepReflects, stepShots, stepShrink, summonDodgeTarget, syncBossOrbitSpirits, totemPool, trailMaterial, veilStroke };
}
