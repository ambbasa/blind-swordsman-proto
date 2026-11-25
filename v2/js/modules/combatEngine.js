/* v2/js/modules/combatEngine.js — 심안: 묵검 v1.26 전투 코어(일섬·패링·피해·상태이상·강화적용) */

export function createCombatEngine(rt) {
  const $ = rt.$;
/* v0.31 §3.5: 지금 닿기 직전(W초 안)인 공격을 찾는다 — 돌진·투척 부적·자폭 점화·보스 돌진. */
function incomingParryThreat(maxWin) {
  if (!rt.S || !rt.S.hero) return null;
  const W = maxWin || ((rt.CFG.preciseWin || 0.2) + (rt.relicOn(rt.save, 'sheath') ? 0.12 : 0));
  const hx = rt.S.hero.x, hz = rt.S.hero.z;
  let best = null, bestT = W + 1e-6;
  (rt.S.zombies || []).forEach(function (z) {
    if (!z.alive || z.isBoss) return;
    const kd = rt.CFG.zombieTypes[z.type] || {};
    if ((z.dashPhase || 0) > 0 && kd.dashSpeed) {
      const d = Math.max(0, Math.hypot(hx - z.x, hz - z.z) - (z.r || 0.5) - 0.55);
      const t = d / kd.dashSpeed;
      if (t <= W && t < bestT) { best = { kind: 'charger', z: z, t: t }; bestT = t; }
    }
    if (z.type === 'bomber' && (z.fuse || 0) > 0 && z.fuse <= W) {
      const d = Math.hypot(hx - z.x, hz - z.z);
      if (d <= (kd.blastR || 2.7) + 1.1 && z.fuse < bestT) { best = { kind: 'bomber', z: z, t: z.fuse }; bestT = z.fuse; }
    }
  });
  (rt.S.shots || []).forEach(function (sh) {
    if (sh.reflect) return;
    const sp = Math.hypot(sh.vx || 0, sh.vz || 0) || 1;
    const d = Math.max(0, Math.hypot(hx - sh.x, hz - sh.z) - (rt.CFG.shotR || 0.42) - 0.55);
    const t = d / sp;
    if (t <= W && t < bestT) { best = { kind: 'shot', sh: sh, t: t }; bestT = t; }
  });
  const b = rt.S.boss;
  if (b && b.alive && b.state === 'charge' && !b.hidden) {
    const sp = bossTiming().chargeSp || 20;
    const d = Math.max(0, Math.hypot(hx - b.x, hz - b.z) - (b.r || 1.1) - 0.7);
    const t = d / sp;
    if (t <= W && t < bestT) { best = { kind: 'boss', z: b, t: t }; bestT = t; }
  }
  return best;
}
function preciseTarget() {
  if (!rt.S || !rt.S.hero) return null;
  const W = (rt.CFG.preciseWin || 0.2) + (rt.relicOn(rt.save, 'sheath') ? 0.12 : 0);
  return incomingParryThreat(W);
}
function preciseParry(prec, rec) {
  if (!rt.S || !prec) return rec;
  const awaken = upLv('parry');
  const isJust = (prec.t || 0) <= (rt.CFG.justParryWin || 0.18);
  const mul = (rt.CFG.preciseDmgMul || 2) * (isJust ? 1.35 : 1);
  const dmg = ((rt.CFG.parryDmg || 0.5) + (rt.CFG.parryAwakenDmg || 0.4) * awaken) * mul;
  rt.S.parryCd = rt.CFG.parryCd || 0.45;
  rt.S.iframe = Math.max(rt.S.iframe || 0, isJust ? 0.55 : 0.45);
  rt.S.parryFlash = isJust ? 0.32 : 0.25;
  rt.S.parryHits = [];
  rt.S.parryOkN = (rt.S.parryOkN || 0) + 1;
  if (isJust) rt.S.justParryN = (rt.S.justParryN || 0) + 1;
  rt.S.shake = Math.max(rt.S.shake || 0, isJust ? 0.62 : 0.5);
  rt.S.goldEdge = Math.max(rt.S.goldEdge || 0, isJust ? 0.30 : 0.2);
  addHitstop(isJust ? 0.11 : 0.08);
  rt.addSlow(isJust ? 0.24 : (rt.CFG.preciseSlow || 0.2), isJust ? 0.30 : 0.35);
  addCharge(isJust ? ((rt.CFG.preciseCharge || 10) + 6) : (rt.CFG.preciseCharge || 10));
  rt.haptic(isJust ? [24, 18, 42] : [16, 26, 32]);
  if (rt.art && rt.art.heroBlock && rt.three && rt.three.hero) rt.art.heroBlock(rt.three.hero);
  if (rec) rec.parry = { precise: prec.kind, just: isJust, t: +(prec.t || 0).toFixed(3), dmg: dmg };
  rt.telemetry.event('parry', { target: prec.kind, errMs: Math.round((prec.t || 0) * 1000), result: isJust ? 'just' : 'precise' });
  if (isJust && rt.audio && rt.audio.justParry) rt.audio.justParry();
  else if (rt.audio && rt.audio.parry) rt.audio.parry();
  rt.inkFx.ring(isJust ? 4.4 : 3.4, isJust ? rt.FX_COLORS.jade : rt.FX_COLORS.gold, 0.55);
  if (isJust && (!rt.a11yShake() && !rt.reducedMotion())) {
    rt.S.justParryInvertT = 0.14;
    rt.S.impactFrameT = 0.085;
  }
  if (rt.three && rt.three.vfx3d && rt.S.hero) {
    rt.three.vfx3d.spawnSwirl(rt.S.hero.x, rt.S.hero.z, { r0: 1.3, r1: isJust ? 4.6 : 3.8, accentHex: isJust ? 0x7ef5d4 : 0xf0ca68, dur: 0.42 });
    rt.three.vfx3d.spawnSparks(rt.S.hero.x, rt.S.hero.z, isJust ? 26 : 18, { color: isJust ? 0x98ffe2 : 0xffd26a, speed: isJust ? 8.4 : 7.0 });
    rt.three.vfx3d.triggerImpactFrame({ dur: isJust ? 0.085 : 0.065, safe: rt.a11yShake() });
    if (isJust && rt.three.shaderFx3d) {
      rt.three.shaderFx3d.spawnShockwave(rt.S.hero.x, rt.S.hero.z, { r0: 0.7, r1: 5.2, colorHex: 0x7ef5d4, coreHex: 0xfff8dc, dur: 0.38 });
    }
    if (isJust) triggerGroundCrackHeat(rt.S.hero.x, rt.S.hero.z, 4.4, 0x98ffe2);
  }
  if (prec.kind === 'charger' && prec.z && prec.z.alive) {
    const z = prec.z;
    z.dashPhase = 0; z.windT = 0; z.dashCd = (rt.CFG.zombieTypes.charger || {}).dashCd || 3.4;
    z.stun = Math.max(z.stun || 0, rt.CFG.preciseStun || 0.6);
    const d = rt.dist(z, rt.S.hero) || 1;
    z.x += (z.x - rt.S.hero.x) / d * 1.6; z.z += (z.z - rt.S.hero.z) / d * 1.6;
    if (z.obj) rt.placeGroup(z.obj, z.x, z.z);
    hurtZombie(z, dmg, 'parry', rec);
    if (rec && rec.hits) rec.hits.push({ id: z.id, dmg: dmg, hp: z.hp, why: 'parry' });
  } else if (prec.kind === 'shot' && prec.sh) {
    const sh = prec.sh;
    sh.reflect = true; sh.t = 0;
    if (!sh.gold) {
      const src = rt.nearestTo((rt.S.zombies || []).filter(z => z.alive && z.type === 'thrower'), sh);
      if (src) { sh.backTo = src; sh.vx = 0; sh.vz = 0; } else { sh.reflect = false; sh.t = (sh.life || 4) + 1; if (sh.mesh) { rt.releaseShotMesh(sh.mesh); sh.mesh = null; } }
    }
    if (sh.mesh && sh.gold) sh.mesh.material = rt.goldShotMaterial();
    rt.inkFx.burst(sh.x, sh.z, rt.FX_COLORS.gold, { r1: 30, n: 6, dur: 0.35 });
  } else if (prec.kind === 'bomber' && prec.z && prec.z.alive) {
    const z = prec.z;
    z.fuse = 0;
    z.stun = Math.max(z.stun || 0, rt.CFG.preciseStun || 0.6);
    hurtZombie(z, dmg, 'parry', rec);
  } else if (prec.kind === 'boss' && prec.z && prec.z.alive) {
    const b = prec.z;
    b.openUntil=rt.S.elapsed+1.8+(b.chilled ? .4 : 0); b.chilled=false;
    b.state = 'stun'; b.stateT = 0;
    b.pat = b.pat || null;
    const sheathAdd = rt.relicOn(rt.save, 'sheath') ? 0.8 : 0;
    rt.bossPoise(b, (isJust ? 2 : 1) + sheathAdd);
  }
  /* §5.3 칼집 반격: 정확한 패링 성공 시 가장 가까운 혼령으로 자동 일섬 1회. */
  if (upLv('counter') > 0) sheathCounter();
  /* §5.4 귀검(歸劍): 정확한 패링 시 보스에게 추가 절단 피해 + 강인도 타격 + 금빛 검기 */
  if (rt.S.evo && rt.S.evo.gwigeom && prec.kind === 'boss' && rt.S.boss && rt.S.boss.alive) {
    const gDmg = rt.dashDmg() * 0.85;
    hurtZombie(rt.S.boss, gDmg, 'gwigeom', rec);
    rt.bossPoise(rt.S.boss, 1.0);
    if (rt.three && rt.three.vfx3d) rt.three.vfx3d.spawnSparks(rt.S.boss.x, rt.S.boss.z, 16, { color: 0xffd26a, speed: 7.5 });
    rt.inkFx.burst(rt.S.boss.x, rt.S.boss.z, rt.FX_COLORS.gold, { r1: 38, n: 8, dur: 0.36 });
    rt.showJudge('귀검 — 보스 절단!');
  }
  rt.showJudge(isJust ? '완벽 막기 — 강인도 2배!' : '챙—!');
  rt.triggerSightWave();
  return rec;
}
/* 칼집 반격: 가장 가까운 혼령의 무늬로 그 혼령을 바로 벤다. */
function sheathCounter() {
  if (!rt.S || rt.S.dash || (rt.S.dashQueue && rt.S.dashQueue.length)) return null;
  const ms = rt.livingMarks().filter(function (s) { return s.target && s.target.alive; });
  if (!ms.length) return null;
  ms.sort(function (a, b) { return rt.dist(a.target, rt.S.hero) - rt.dist(b.target, rt.S.hero); });
  const s = ms[0];
  const shape = rt.spiritShape(s);
  if (!shape) return null;
  const cLv = upLv('counter');
  rt.S.comboGrace = Math.max(rt.S.comboGrace || 0, 0.1);
  if (cLv >= 2) addCharge(6);
  rt.stampSkill('counter', rt.S.hero.x, rt.S.hero.z);
  rt.showJudge(cLv >= 2 ? '반격 극!' : '반격!');
  return rt.beginDash(shape, { dir: null, dmgMul: cLv >= 2 ? 1.5 : 1 });
}
function doParry(rec) {
  if (!rt.S || !rt.S.playing || rt.S.paused) return rec || null;
  /* §8.1 튜토리얼 3단계: 제자리 탭을 해 냈다(피해 없이 넉백만). */
  if (rt.S.tutorial && rt.S.tutorial.on && rt.S.tutorial.tapSpawned) rt.S.tutorial.tapDone = true;
  const r = rec || { type: 'tap', targets: [], hits: [] };
  r.type = 'tap';
  r.targets = r.targets || [];
  r.hits = r.hits || [];
  /* v1.02 세키로식 3연속 리듬 패링 탭 판정 (쿨다운 무관 최우선) */
  const rRes = rt.rhythmTap();
  if (rRes) { r.parry = rRes; return r; }
  /* 기모으기 중의 탭은 게이지 판정이 먼저다(쿨다운과 무관). */
  const kt = rt.kiaiTap();
  if (kt) { r.parry = kt; return r; }
  if ((rt.S.parryCd || 0) > 0) {
    if (rt.S.parryCd <= 0.14) rt.S.parryBufT = 0.16;
    r.parry = { hits: 0, cooling: true, buffered: rt.S.parryCd <= 0.14 };
    return r;
  }
  /* v0.31 §3.5 정확한 패링: 적의 공격이 닿기 0.2초 안의 탭 — 피해 2배·참 +10·0.2초 느린 화면. */
  const prec = preciseTarget();
  if (prec) { preciseParry(prec, r); return r; }
  /* v0.23 칼집 각성: 패링이 충격파(반경·피해)와 참 게이지로 자란다. */
  const awaken = upLv('parry');
  const R = (rt.CFG.parryR || 2.4) + (rt.CFG.parryAwakenR || 0.45) * awaken;
  const hits = [];
  const refl = rt.reflectGoldShots(R);
  if (refl) {
    rt.S.goldReflectN = (rt.S.goldReflectN || 0) + refl;
    rt.tcount('goldReflect', refl);
    rt.telemetry.event('reflect', { gold: refl, n: rt.S.goldReflectN });
  }
  rt.S.zombies.forEach(function (z) {
    if (!z.alive || z.isBoss || z.isClone || z.isPillar || z.isTotem) return;
    const d = rt.dist(z, rt.S.hero);
    if (d > R + (z.r || 0.55)) return;
    hits.push(z.id);
    hurtZombie(z, (rt.CFG.parryDmg || 0.5) + (rt.CFG.parryAwakenDmg || 0.4) * awaken, 'parry', r);
    if (z.alive) {
      const ux = d < 1e-3 ? 1 : (z.x - rt.S.hero.x) / d;
      const uz = d < 1e-3 ? 0 : (z.z - rt.S.hero.z) / d;
      const push = rt.CFG.parryPush || 1.6;
      z.x += ux * push; z.z += uz * push;
      z.stun = Math.max(z.stun || 0, (rt.CFG.parryStun || 0.35) + (rt.CFG.parryAwakenStun || 0.12) * awaken);
      if (z.obj) rt.placeGroup(z.obj, z.x, z.z);
    }
  });
  r.parry = { hits: hits.length, reflected: refl };
  rt.telemetry.event('parry', { target: 'parry', hits: hits.length, reflected: refl, result: (hits.length || refl) ? 'hit' : 'miss' });
  if (rt.art && rt.art.heroBlock && rt.three && rt.three.hero) rt.art.heroBlock(rt.three.hero);
  if (hits.length || refl) {
    rt.S.parryCd = rt.CFG.parryCd || 0.45;
    rt.S.iframe = Math.max(rt.S.iframe || 0, rt.CFG.parryIframe || 0.2);
    rt.S.parryFlash = 0.12;
    rt.S.parryHits = hits;
    rt.S.parryOkN = (rt.S.parryOkN || 0) + 1;
    rt.haptic([16, 26, 32]);
    rt.S.shake = Math.max(rt.S.shake || 0, 0.35);
    if (rt.audio) rt.audio.parry();
    addHitstop(rt.CFG.parryHitstop || 0.05);
    if (awaken > 0) {
      addCharge((rt.CFG.parryAwakenCharge || 14) * awaken);
      if (rt.art && rt.art.playFx && rt.three) {
        const fx = rt.art.playFx(rt.three.scene, 'ink-splat', rt.S.hero.x, rt.S.hero.z, 2.4 + awaken * 0.5);
        if (fx) rt.three.fx.push(fx);
      }
      rt.S.shake = Math.max(rt.S.shake || 0, 0.45);
    }
    rt.showJudge(awaken > 0 ? '챙— 각성!' : '챙-');
    rt.triggerSightWave();
  } else {
    rt.S.parryCd = rt.CFG.parryFailCd || 0.2;
    rt.S.parryHits = [];
    if (rt.audio && rt.audio.whiff) rt.audio.whiff();
    rt.showJudge('휙');
  }
  return r;
}

/* O 한 붓 = 참(斬): 게이지 100에서 반경 12m 전멸급 배기. */
function castCleave(rec) {
  if (!rt.S || !rt.S.playing || rt.S.paused) return rec || null;
  const max = rt.CFG.cleaveCharge || 100;
  rec = rec || { type: 'circle', targets: [], hits: [] };
  rec.type = 'circle';
  rec.hits = rec.hits || [];
  rec.targets = rec.targets || [];
  if ((rt.S.charge || 0) < max) {
    rt.toast('참의 기운이 모자랍니다 — ' + Math.floor(rt.S.charge || 0) + '/' + max);
    rt.showJudge('기운 ' + Math.floor(rt.S.charge || 0));
    rec.cleave = false;
    return rec;
  }
  rt.S.charge = 0;
  rt.S.cleaveCount = (rt.S.cleaveCount || 0) + 1;
  rt.S.cleaveFx = 0.6;
  const R = rt.CFG.cleaveR || 12;
  const dmg = rt.dashDmg() * (rt.CFG.cleaveDmgMul || 3);
  const hitIds = [];
  const iceCleave = !!rt.S.evo.iceCleave;
  rt.S.zombies.slice().forEach(function (z) {
    if (!z.alive) return;
    if (rt.dist(z, rt.S.hero) > R + (z.r || 0.5)) return;
    hitIds.push(z.id);
    if (z.isBoss) { hurtZombie(z,dmg,'cleave',rec); return; }
    /* 참 피해는 항상 그대로 들어간다. 상태이상은 그 위에 얹히는 보너스다(예전에는 빙결·독 대상이
       4·3 피해로 '대체'되어 진화를 띄울수록 참이 약해졌다). */
    const wasFrozen = z.frozen > 0;
    const wasPoison = z.poison > 0;
    hurtZombie(z, dmg, 'cleave', rec);
    if (!z.alive) { if (wasPoison) spreadElement(z, 'poison', rec); return; }
    if (wasFrozen) shatterZombie(z, rec);
    else if (wasPoison) explodeZombie(z, rec);
    if (z.alive && iceCleave) { z.frozen = Math.max(z.frozen || 0, rt.CFG.iceDur || 2.5); tintZombie(z); }
  });
  rec.cleaveHits = hitIds;
  rec.targets = hitIds;
  if (rt.three && rt.three.chunks) rt.three.chunks.jarsNear(rt.S.hero.x, rt.S.hero.z, R).forEach(rt.breakJar);
  rt.S.shake = Math.max(rt.S.shake || 0, 0.9);
  rt.S.slowT = Math.max(rt.S.slowT || 0, 0.35);
  addHitstop(0.12);
  if (rt.audio) { rt.audio.explode(); rt.audio.bell(0, 'bolt'); }
  if (rt.three && rt.three.ink) rt.three.ink.hit(rt.S.hero.x + 0.5, rt.S.hero.z, 0, 1);
  rt.inkFx.ring(R, rt.FX_COLORS.jade, 0.7);
  if (rt.three && rt.three.lights && rt.S.hero) rt.three.lights.burst(rt.S.hero.x, 2.2, rt.S.hero.z, { color: 0x62f2c8, intensity: 8.5, duration: 0.42, distance: 20 });
  if (rt.S && (!rt.a11yShake() && !rt.reducedMotion())) rt.S.impactFrameT = 0.085;
  if (rt.three && rt.three.vfx3d && rt.S.hero) {
    triggerGroundCrackHeat(rt.S.hero.x, rt.S.hero.z, 7.2, 0x5cf2c8);
    rt.three.vfx3d.spawnSwirl(rt.S.hero.x, rt.S.hero.z, { r0: 1.8, r1: R * 1.15, accentHex: 0x4be8bc, dur: 0.52 });
    if (rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(rt.S.hero.x, rt.S.hero.z, { r0: 1.2, r1: R * 1.25, colorHex: 0x5cf2c8, coreHex: 0xfffce8, dur: 0.48 });
    rt.three.vfx3d.spawnSparks(rt.S.hero.x, rt.S.hero.z, 32, { color: 0xffc85a, speed: 9.2 });
    for (let li = 0; li < 2; li++) {
      const la = Math.random() * Math.PI * 2;
      rt.three.vfx3d.spawnLightning(
        { x: rt.S.hero.x, y: 1.2, z: rt.S.hero.z },
        { x: rt.S.hero.x + Math.cos(la) * R * 0.9, y: 0.15, z: rt.S.hero.z + Math.sin(la) * R * 0.9 },
        { color: 0x6ef2d0, core: 0xf4fffc, hold: 0.14, fade: 0.20, sparks: 8 }
      );
    }
    rt.three.vfx3d.triggerImpactFrame({ dur: 0.085, safe: rt.a11yShake() });
    triggerGroundCrackHeat(rt.S.hero.x, rt.S.hero.z, R * 1.1, 0x5ef2c8);
  }
  rt.showJudge('참!');
  rt.renderHud();
  return rec;
}

/* 포위 웨이브: 8방향 균등 배치 + 안개 수축 + 북 3연타. */
function fireWave(w) {
  if (!rt.S || !w) return;
  rt.S.waveDone = rt.S.waveDone || {};
  if (rt.S.waveDone[w.t]) return;
  rt.S.waveDone[w.t] = true;
  rt.S.wavesFired = rt.S.wavesFired || [];
  rt.S.wavesFired.push(w.t);
  const R = rt.ringR();
  const total = w.n || 10;
  const rr = w.r || [9, 10];
  const mix = w.mix || { imp: 1 };
  const sum = Object.keys(mix).reduce(function (a, k) { return a + mix[k]; }, 0) || 1;
  /* v0.34 §6.3 포위 웨이브 3종: 원형 · 반원 협공(한쪽이 빔) · 두 줄 행렬(일섬 관통 보상) */
  const FORMS = ['circle', 'pincer', 'rows'];
  const form = w.form || FORMS[((rt.S.stageNo || 1) + (rt.S.wavesFired.length)) % 3];
  rt.S.waveForm = form;
  const a0 = Math.random() * Math.PI * 2;
  function pickType() {
    let roll = Math.random() * sum, type = 'imp';
    for (const k in mix) { roll -= mix[k]; if (roll <= 0) { type = k; break; } }
    return type;
  }
  for (let i = 0; i < total; i++) {
    let px = 0, pz = 0;
    if (form === 'rows') {
      /* 영웅을 향한 두 줄: 줄 간격 3.2m, 줄 안 간격 1.45m */
      const row = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2) - (total / 4 - 0.5);
      const rad = Math.max(rr[0], R * 1.15);
      px = rt.S.hero.x + (Math.cos(a0) * -row * 1.6) + Math.cos(a0 + Math.PI / 2) * k * 1.45 + Math.cos(a0) * rad * 0.55;
      pz = rt.S.hero.z + (Math.sin(a0) * -row * 1.6) + Math.sin(a0 + Math.PI / 2) * k * 1.45 + Math.sin(a0) * rad * 0.55;
    } else if (form === 'pincer') {
      /* 반원 협공: 한쪽 120°가 비어 있어 그쪽으로 빠져나갈 수 있다(보상) */
      const span = Math.PI * 1.35;
      const a = a0 + (i / Math.max(1, total - 1) - 0.5) * span;
      const rad = Math.max(rr[0], R * 1.05) + Math.random() * Math.max(0.5, rr[1] - rr[0]);
      px = rt.S.hero.x + Math.cos(a) * rad; pz = rt.S.hero.z + Math.sin(a) * rad;
    } else {
      const a = (i / total) * Math.PI * 2 + (Math.random() - 0.5) * 0.24;
      const rad = Math.max(rr[0], R * 1.05) + Math.random() * Math.max(0.5, rr[1] - rr[0]);
      px = rt.S.hero.x + Math.cos(a) * rad; pz = rt.S.hero.z + Math.sin(a) * rad;
    }
    const z = rt.spawnZombie({ x: px, z: pz, type: pickType() });
    if (z) rt.S.waveIds.push(z.id);
  }
  rt.telemetry.event('wave', { stage: rt.S.stageNo, form: form, n: total, t: w.t });
  if (w.elite) {
    const ang = Math.random() * Math.PI * 2;
    const z = rt.spawnZombie({ x: rt.S.hero.x + Math.cos(ang) * rr[1], z: rt.S.hero.z + Math.sin(ang) * rr[1], type: 'elite' });
    if (z) { z.elite = true; rt.S.waveIds.push(z.id); }
  }
  rt.S.fogPulse = 1;
  rt.S.shake = Math.max(rt.S.shake || 0, 0.6);
  rt.triggerSightWave();
  if (rt.audio && !rt.qa.noDelay) {
    rt.audio.drum();
    setTimeout(function () { if (rt.audio) rt.audio.drum(); }, 140);
    setTimeout(function () { if (rt.audio) rt.audio.drum(); }, 280);
  }
  rt.S.rushT = 10.0;
  rt.showJudge(form === 'pincer' ? '포위 러시 · 반원 협공!' : form === 'rows' ? '포위 러시 · 두 줄 행렬!' : '포위 러시! 한 줄로 꿰뚫으세요');
}
/* 중간 엘리트: 보스 전에 금테 원귀 한 마리와 그 패거리가 몰려온다. */
function spawnEliteEvent() {
  if (!rt.S) return 0;
  const R = Math.max(8, rt.ringR() * 1.9);
  const ang = Math.random() * Math.PI * 2;
  const e = rt.spawnZombie({ x: rt.S.hero.x + Math.cos(ang) * R, z: rt.S.hero.z + Math.sin(ang) * R, type: 'elite' });
  if (e) { e.elite = true; rt.S.waveIds.push(e.id); }
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = ang + (i - (n - 1) / 2) * 0.3;
    const z = rt.spawnZombie({ x: rt.S.hero.x + Math.cos(a) * R * 1.08, z: rt.S.hero.z + Math.sin(a) * R * 1.08, type: i % 3 === 2 ? 'brute' : 'imp' });
    if (z) rt.S.waveIds.push(z.id);
  }
  rt.S.shake = Math.max(rt.S.shake || 0, 0.5);
  rt.toast('정예 원귀가 부적 상자를 지고 옵니다');
  rt.showJudge('정예 원귀');
  if (rt.audio && !rt.qa.noDelay) rt.audio.drum();
  return 1;
}
/* 착지 자석: 반경 안의 바닥 아이템이 곡선으로 빨려온다. */
function magnetPull(at) {
  if (!rt.S) return 0;
  const R = rt.S.magnetR || rt.CFG.magnetR || 2.2;
  let n = 0;
  rt.S.items.forEach(function (it) {
    if (!it.alive) return;
    if (rt.dist(it, at) > R) return;
    it.home = { from: { x: it.x, z: it.z }, t: 0, dur: rt.CFG.magnetDur || 0.18 };
    n++;
  });
  if (n && rt.audio && rt.audio.pickup) rt.audio.pickup(n);
  return n;
}

function applyPath(from, to, rec, skip) {
  const shHint = (rec && (rec.shape || rec.type)) || (rt.S && rt.S.lastStroke) || null;
  const stStyle = (rt.SHAPE_STYLE && shHint && rt.SHAPE_STYLE[shHint]) || null;
  const r = rt.pathR() * ((stStyle && stStyle.widthMul) || 1.0);
  /* v0.23 정확한 획: 획의 인식 점수가 기준 이상이면 일섬 피해가 배로 든다. */
  const pLv = upLv('perfect');
  const quality = (rec && rec.quality != null) ? rec.quality : (rt.S.dashQuality || 0);
  const thresh = (rt.CFG.perfectThresh || 0.80) - (rt.CFG.perfectThreshStep || 0.05) * Math.max(0, pLv - 1);
  const perfect = pLv > 0 && quality >= thresh;
  rt.bumpDaily('q_slash', 1);
  const shNow = (rec && (rec.shape || rec.type)) || (rt.S && rt.S.lastStroke) || null;
  if (shNow && rt.S) {
    if (rt.relicOn(rt.save, 'mono_seal')) {
      rt.S.monoSealStacks = (rt.S.prevSealShape === shNow) ? Math.min(3, (rt.S.monoSealStacks || 0) + 1) : 1;
    } else {
      rt.S.monoSealStacks = 0;
    }
    if (rt.relicOn(rt.save, 'multi_seal')) {
      rt.S.multiSealStreak = (rt.S.prevSealShape && rt.S.prevSealShape !== shNow) ? Math.min(3, (rt.S.multiSealStreak || 1) + 1) : 1;
    } else {
      rt.S.multiSealStreak = 0;
    }
    rt.S.prevSealShape = shNow;
  }
  const swordF = rt.swordFx(rt.save);
  const nowEl = (rt.S && rt.S.elapsed) || 0;
  /* v0.98 맹종검(bellDashMul): 방울 0.8초 내 일섬 시 피해 증가 */
  const maengMul = (swordF.bellDashMul && rt.S && rt.S.lastBellT != null && (nowEl - rt.S.lastBellT) <= 0.8) ? (1 + swordF.bellDashMul) : 1;
  /* v0.98 화살검(emberMul): 불씨 유지 후 다음 일섬 피해 증가 */
  const emberMul = (rt.S && rt.S.emberBuffMul > 1) ? (function () { const m = rt.S.emberBuffMul; rt.S.emberBuffMul = 1; return m; })() : 1;
  const mul = (perfect ? ((rt.CFG.perfectDmgMul || 1.5) + (rt.CFG.perfectStep || 0.15) * Math.max(0, pLv - 1)) : 1) * maengMul * emberMul;
  const dmg = rt.dashDmg() * mul * ((rec && rec.dmgMul) || 1);
  if (perfect && rec) { rec.perfect = true; rt.showJudge('정확한 획'); }
  const dx = to.x - from.x, dz = to.z - from.z, L2 = dx * dx + dz * dz || 1;
  const hit = rt.S.zombies.filter(function (z) {
    return z.alive && z !== skip && !z.isClone && rt.segDist(z.x, z.z, from.x, from.z, to.x, to.z) <= r + z.r;
  });
  /* Nearest along the cut takes full damage; each one after it a little less. */
  hit.sort(function (a, b) { return ((a.x - from.x) * dx + (a.z - from.z) * dz) / L2 - ((b.x - from.x) * dx + (b.z - from.z) * dz) / L2; });
  if (rt.S && hit.length > (rt.S.maxMultiHit || 0)) rt.S.maxMultiHit = hit.length;
  if (rec) rec._multiN = hit.length;
  if (swordF.dashInvuln && rt.S) rt.S.iframe = Math.max(rt.S.iframe || 0, swordF.dashInvuln);
  let killN = 0;
  const zPts = [];
  const effFalloff = (stStyle && stStyle.falloff != null) ? stStyle.falloff : (rt.CFG.pierceFalloff || 1);
  hit.forEach(function (z, k) {
    const wasAlive = !!z.alive;
    /* v0.98 안개 바늘: 1타 지연 버그 수정 — 타격 대상별 즉시 원 안 판정(+15%) */
    const inRing = rt.S && rt.S.hero && rt.dist(z, rt.S.hero) <= rt.ringR() * 1.05;
    if (rt.S) rt.S.lastTargetInRing = !!inRing;
    const needleMul = (rt.relicOn(rt.save, 'needle') && inRing) ? 1.15 : 1;
    /* v0.98 묵은 방울: 방울 0.8초 내 일섬 시 피해 +12% */
    const bellBonus = (rt.relicOn(rt.save, 'oldbell') && z.bellMarkedAt != null && (nowEl - z.bellMarkedAt) <= 0.8) ? 1.12 : 1;
    const hitDmg = dmg * needleMul * bellBonus * Math.pow(effFalloff, k);
    hurtZombie(z, hitDmg, 'slash', rec);
    /* v0.98 여음 청: 방울이 울린 혼령을 1초 안에 베면 근처 같은 무늬 적에게 공명 피해 */
    if (rt.relicOn(rt.save, 'echo_bell') && z.bellMarkedAt != null && (nowEl - z.bellMarkedAt) <= 1.0 && z.shape) {
      (rt.S.zombies || []).forEach(function (o) {
        if (!o.alive || o === z || o.isClone || o.shape !== z.shape) return;
        if (rt.dist(o, z) <= 5.5) hurtZombie(o, hitDmg * 0.45, 'reson', rec);
      });
    }
    /* v1.30 뇌전 연쇄(Z) 기본 2체 + 뇌전검 추가 연쇄 */
    const baseChain = (stStyle && stStyle.chainN) || 0;
    const swordChain = (swordF.boltChain && shNow === 'bolt') ? Math.max(1, swordF.boltChain | 0) : 0;
    const chainTotal = Math.min(4, baseChain + swordChain);
    if (k === 0 && chainTotal > 0 && shNow === 'bolt') {
      const chainMax = chainTotal;
      const nears = rt.S.zombies
        .filter(function (o) { return o.alive && o !== z && !o.isClone && rt.dist(o, z) <= 5.0; })
        .sort(function (a, b) { return rt.dist(a, z) - rt.dist(b, z); })
        .slice(0, chainMax);
      nears.forEach(function (near) {
        hurtZombie(near, dmg * 0.55, 'bolt', rec);
        if (rt.three && rt.three.vfx3d) rt.three.vfx3d.spawnLightning({ x: z.x, y: 0.9, z: z.z }, { x: near.x, y: 0.5, z: near.z }, { color: 0x7ab4ff, core: 0xf4f9ff, hold: 0.12, fade: 0.16, sparks: 6 });
      });
    }
    if (wasAlive && !z.alive) killN++;
    zPts.push({ x: z.x, z: z.z, killed: wasAlive && !z.alive });
    if (z.alive) applyElement(z, rt.curElem(), rec);
    else spreadElement(z, rt.curElem(), rec);
  });
  /* v1.30 3단계 강약 티어링 + 잔심 지연 파열 (단타는 쾌속 유지, 다중 관통/몰살에만 강약 대비) */
  if (rt.S && (hit.length >= 2 || killN >= 2 || perfect)) {
    const tier = (hit.length >= 4 || killN >= 4) ? 3 : 2;
    const zCol = (stStyle && stStyle.accentHex) || 0xffd25a;
    if (tier === 3) {
      rt.S.shake = Math.max(rt.S.shake || 0, 0.74);
      if (!rt.a11yShake() && !rt.reducedMotion()) {
        rt.S.camZoomT = Math.max(rt.S.camZoomT || 0, 0.28);
        rt.S.camZoomAmt = Math.max(rt.S.camZoomAmt || 0, 3.8);
        rt.S.impactFrameT = Math.max(rt.S.impactFrameT || 0, 0.065);
      }
      addCharge(12);
      rt.showJudge('일섬다살! ' + hit.length + '연');
    } else {
      rt.S.shake = Math.max(rt.S.shake || 0, 0.42);
      if (hit.length >= 2) {
        addCharge(4 * (hit.length - 1));
        rt.showJudge(hit.length === 2 ? '이연 관통!' : (hit.length + '연 관통!'));
      }
    }
    rt.S.zanshin = rt.S.zanshin || [];
    for (let zi = 0; zi < zPts.length && zi < 6; zi++) {
      rt.S.zanshin.push({ x: zPts[zi].x, z: zPts[zi].z, t: tier === 3 ? 0.075 : 0.065, tier: tier, col: zCol, sfx: zi === 0 });
    }
  }
  rt.S.items.slice().forEach(function (it) {
    if (!it.alive) return;
    if (rt.segDist(it.x, it.z, from.x, from.z, to.x, to.z) <= r + it.r) collectItem(it, rec);
  });
  /* 결을 지나간 자리의 묵항아리는 깨진다. */
  if (rt.three && rt.three.chunks) rt.three.chunks.jarsOnPath(from.x, from.z, to.x, to.z, r).forEach(rt.breakJar);
}
function inkDir(rec, z) {
  const segs = rec && rec.segs;
  const d = segs && segs[segs.length - 1];
  if (d && d.to && d.from) return { x: d.to.x - d.from.x, z: d.to.z - d.from.z };
  if (rt.S && rt.S.hero && z) return { x: z.x - rt.S.hero.x, z: z.z - rt.S.hero.z };
  return { x: 1, z: 0 };
}
/* ---------- v0.31 §3.2 강적 깨는 법 ----------
   체력으로 버티는 대신 '어떻게 베는지'를 묻는다. 바꾸는 무늬는 장의 무늬 풀 안에서 고른다. */
function otherShape(cur) {
  const src = (rt.S && rt.S.pool && rt.S.pool.length) ? rt.S.pool : rt.SHAPE_UNLOCK;
  const pool = src.filter(function (k) { return k !== cur; });
  if (!pool.length) return cur;
  return pool[Math.floor(Math.random() * pool.length)];
}
function refreshEnemyShape(z) {
  if (!rt.S) return;
  (rt.S.spirits || []).forEach(function (s) {
    if (s.target === z && s.obj && rt.art && rt.art.setSpiritShape) rt.art.setSpiritShape(s.obj, rt.spiritShape(s));
  });
}
/* 다른 무늬로 바뀔 때 0.3초 금빛 테두리 — 바뀌었다는 사실을 놓치지 않게. */
function setEnemyShape(z, shape, label) {
  if (!z || !shape) return;
  z.shapeOv = shape;
  z.rimFlash = rt.CFG.breakRimT || 0.3;
  refreshEnemyShape(z);
  if (label) rt.showJudge(label);
  if (rt.audio && rt.audio.bell) rt.audio.bell(0, shape);
  rt.telemetry.event('break', { kind: z.type, stage: rt.S && rt.S.stageNo, to: shape });
}
/** 그은 획에만 적용되는 파훼 규칙. null이면 평소 피해. */
function breakHit(z, rec, amount) {
  if (!z || z.isBoss || !rt.S) return null;
  const shape = rec && rec.type;
  if (!shape) return null;
  /* 장정: 첫 일섬은 갑옷만 깨고(피해 0.5) 혼령 무늬가 다른 무늬로 바뀐다. 바뀐 무늬로 베면 즉사. */
  if (z.type === 'brute' && z.armored) {
    if ((z.armor || 0) > 0) {
      z.armor = 0;
      setEnemyShape(z, otherShape(shape), '갑옷 파훼!');
      rt.S.shake = Math.max(rt.S.shake || 0, 0.3);
      if (rt.audio) rt.audio.breakCue();
      return { dmg: rt.CFG.armorDmg || 0.5, why: 'break' };
    }
    if (z.shapeOv && shape === z.shapeOv) {
      rt.showJudge('갑옷 틈 — 즉사!');
      rt.S.goldEdge = Math.max(rt.S.goldEdge || 0, 0.2);
      return { dmg: 9999, why: 'break' };
    }
    return null;
  }
  /* 돌덩이: 서로 다른 무늬 2번이면 갈라진다. 같은 무늬를 반복하면 피해 ×0.5. */
  if (z.type === 'stone' && z.hasCracks) {
    if (z.lastShape && shape === z.lastShape) return { dmg: amount * (rt.CFG.crackSameMul || 0.5), why: 'crack-same' };
    z.lastShape = shape;
    z.cracks = (z.cracks || 0) + 1;
    if (z.cracks >= (rt.CFG.crackStages || 2)) {
      rt.showJudge('돌이 갈라졌다!');
      if (rt.audio) rt.audio.breakCue();
      if (rt.art && rt.art.playFx && rt.three) { const fx = rt.art.playFx(rt.three.scene, 'ink-splat', z.x, z.z, 2.4); if (fx) rt.three.fx.push(fx); }
      rt.S.shake = Math.max(rt.S.shake || 0, 0.35);
      rt.telemetry.event('break', { kind: 'stone', stage: rt.S.stageNo, cracks: z.cracks });
      return { dmg: 9999, why: 'crack' };
    }
    setEnemyShape(z, otherShape(shape), '금이 갔다 · ' + (rt.CFG.crackStages || 2) + '단계 중 ' + z.cracks);
    return null;
  }
  /* v0.74 정예: 머리 위 무늬 3개를 순서대로 완성해야 처치(틀린 획은 15% 경감 & HP 1 하한 보호). */
  if (z.eliteSeq && z.seq && z.seq.length && z.seqI < z.seq.length) {
    if (shape !== z.seq[z.seqI]) {
      const needMark = rt.SHAPE_MARK[z.seq[z.seqI]] || z.seq[z.seqI];
      rt.showJudge('봉인 순서: ' + needMark);
      if (rt.audio && rt.audio.whiff) rt.audio.whiff(true);
      if (rt.three && rt.three.shaderFx3d) rt.three.shaderFx3d.spawnBarrierPulse(z.x, z.z, { r0: 0.75, r1: 1.45, colorHex: 0x6288d8, rimHex: 0xd8ecff, dur: 0.32 });
      return { dmg: Math.min(amount * 0.15, Math.max(0, z.hp - 1)), why: 'seal-wrong' };
    }
    z.seqI += 1;
    if (z.seqI >= z.seq.length) {
      rt.showJudge('봉인 순서 완성 — 즉사!');
      addCharge(rt.CFG.eliteSeqCharge || 20);
      rt.S.goldEdge = Math.max(rt.S.goldEdge || 0, 0.24);
      if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'bolt');
      if (rt.three && rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(z.x, z.z, { r0: 0.8, r1: 4.8, colorHex: 0xffd258, coreHex: 0xfffce8, dur: 0.42 });
      rt.telemetry.event('break', { kind: 'elite', stage: rt.S.stageNo, result: 'sealed' });
      return { dmg: 9999, why: 'seal-break' };
    }
    z.rimFlash = rt.CFG.breakRimT || 0.3;
    refreshEnemyShape(z);
    if (rt.audio && rt.audio.bell) rt.audio.bell(0, shape);
    rt.showJudge('봉인 ' + z.seqI + '/' + z.seq.length);
    /* 1·2번째 봉인 단계에서는 HP 1 이상을 유지해 반드시 3번째 봉인까지 이어지게 보장 */
    return { dmg: Math.min(amount * 0.4, Math.max(0, z.hp - 1)), why: 'seal-step' };
  }
  return null;
}
/* v0.31 §5.3: 자동 피해(호신부·벼락부적)는 총 피해의 25%를 넘지 않는다. */
function autoBudget() {
  const cap = rt.CFG.autoCap;
  return Math.max(0,(rt.S.manualDmg || 0)*cap/(1-cap) - (rt.S.autoDmg || 0));
}
function autoShare() {
  const a = (rt.S && rt.S.autoDmg) || 0, m = (rt.S && rt.S.manualDmg) || 0;
  return (a + m) > 0 ? +(a / (a + m)).toFixed(3) : 0;
}
function hurtZombie(z, amount, why, rec) {
  if (!z || !z.alive) return;
  if (z.isBoss) {
    if (!z.hp || z.hidden) return;
    const nowT = rt.S.elapsed || 0;
    if ((z.phaseCutInvulnUntil || 0) > nowT) {
      if (why === 'slash' || why === 'bang') {
        if (rt.audio && rt.audio.whiff) rt.audio.whiff(true);
        rt.showJudge('기합 방어');
        if (rt.three && rt.three.shaderFx3d) rt.three.shaderFx3d.spawnBarrierPulse(z.x, z.z, { r0: 1.35, r1: 2.5, colorHex: 0xd83830, rimHex: 0xffd272, dur: 0.46 });
      }
      return;
    }
    const swordF = rt.swordFx(rt.save);
    const isWeak = (z.openUntil > nowT) || z.state === 'groggy';
    const isAuto = (why === 'bolt' || why === 'ward' || why === 'poison' || why === 'burn' || why === 'cloud' || why === 'ring' || why === 'inkstep');
    const weakBoost = isWeak ? ((1 + rt.gapBonus()) * (1 + (swordF.gapDmgMul || 0))) : 1;
    /* v1.02 밸런스 정상화: 일반 타격 0.35 -> 0.50(스펀지 해소), 그로기/약점 극딜 1.85 -> 2.00 */
    const mult = why === 'bang' ? 1.6 : (isAuto ? (isWeak ? 0.50 : 0.18) : (isWeak ? 2.00 * weakBoost : 0.50));
    let dealt = Math.min(z.hp, amount * mult);
    /* v0.70 귀문검(gapCharge): 보스 빈틈·그로기 타격 시 참 게이지 즉시 충전 */
    if (isWeak && !isAuto && swordF.gapCharge > 0 && rt.S) {
      rt.S.charge = Math.min(rt.CFG.cleaveCharge || 100, (rt.S.charge || 0) + swordF.gapCharge);
    }
    const B0 = rt.bossCfg();
    const hasP3 = !!(B0.phase3 || (rt.S.stageNo || 1) >= 12);
    const p2Cut = z.maxHp * 0.60, p3Cut = z.maxHp * 0.30;
    if ((z.phase || 1) < 2 && z.hp > p2Cut && (z.hp - dealt) <= p2Cut) {
      dealt = Math.max(0.1, z.hp - p2Cut);
    } else if (hasP3 && (z.phase || 1) < 3 && z.hp > p3Cut && (z.hp - dealt) <= p3Cut) {
      dealt = Math.max(0.1, z.hp - p3Cut);
    }
    z.hpTrail = Math.max(z.hpTrail || z.hp, z.hp);
    z.hp -= dealt;
    const isCombo3 = (why === 'slash') && rt.art && rt.art.heroComboStep && rt.three && rt.three.hero && rt.art.heroComboStep(rt.three.hero) === 3;
    if (!isAuto && !isWeak) {
      const sh = rec && (rec.shape || rec.type);
      let pDmg = why === 'bang' ? 3.5 : ((sh && sh !== 'hline' && sh !== 'vline') ? 1.8 : 0.7);
      if (isCombo3) pDmg *= 1.25;
      pDmg *= (1 + rt.poiseBonus());
      if (sh === 'bolt' && swordF.boltPoiseMul) pDmg *= (1 + swordF.boltPoiseMul);
      rt.bossPoise(z, pDmg);
    }
    const meter = why === 'bolt' || why === 'ward' ? 'autoDmg' : 'manualDmg';
    rt.S[meter] = (rt.S[meter] || 0) + dealt;
    if (rec && rec.hits) rec.hits.push({ id: z.id, dmg: dealt, hp: z.hp, why: why });
    /* v0.52: 보스 피격 타격감 전면 복구 — 소리·히트스톱·먹파편·피격 섬광·플로팅 데미지 */
    rt.bossFx.spawnDamageNumber(z.x, z.z, dealt, isWeak);
    if (why === 'slash' || why === 'bang') {
      rt.haptic(isCombo3 || isWeak ? 24 : 12);
      if (rec && !rec.hitstopDone) { rec.hitstopDone = true; addStrokeHitstop(rec, (isWeak ? 0.05 : 0.035) + (isCombo3 ? 0.02 : 0)); }
      if (rt.audio) rt.audio.hit(isWeak || isCombo3 || !!(rec && rec.perfect), rt.S ? (rt.S.combo || 0) : 0);
      rt.S.shake = Math.max(rt.S.shake || 0, (isWeak ? 0.34 : 0.18) + (isCombo3 ? 0.10 : 0));
    }
    const d = inkDir(rec, z);
    if (rt.three && rt.three.ink) { rt.three.ink.hit(z.x, z.z, d.x, d.z); rt.fxinkStat.hits++; }
    if (rt.three && rt.three.paper) rt.three.paper.hit(z.x, 1.5, z.z, { size: isWeak ? 1.7 : 1.25 });
    if (rt.spawnFloater && dealt >= 0.4) rt.spawnFloater(z.x, z.z, (dealt >= 10 ? Math.round(dealt) : dealt.toFixed(1)) + (isWeak ? '!' : ''), isWeak ? 'weak' : (rec && rec.perfect ? 'crit' : 'dmg'));
    z.flinchT = rt.CFG.flinchDur || 0.14;
    if (z.obj && rt.art.kickChar) rt.art.kickChar(z.obj, 1);
    z.seqI = Math.min(z.seq.length - 1, Math.floor((1 - z.hp / z.maxHp) * z.seq.length));
    z.shape = z.seq[z.seqI];
    if (z.hp <= 0.001) { z.hp = 0; rt.startSeal(z); }
    else { rt.bossPhaseCheck(z); rt.refreshBossGlyphs(z); }
    return;
  }
  if (z.isClone) { rt.popClone(z, false); return; }
  /* 방울 정예: 방울이 울린 직후 0.5초는 봉인되어 칼이 미끄러진다. */
  if (z.invuln > 0) { if (!(rt.S.armorJudgeT > 0)) { rt.showJudge('봉인'); rt.S.armorJudgeT = 0.4; } if (rt.audio && rt.audio.whiff) rt.audio.whiff(true); return; }
  if (z.isPillar) { rt.breakPillar(z); return; }
  if (z.isTotem) { rt.breakTotem(z); return; }
  /* §3.2: 그은 획에만 파훼 규칙을 건다(참·콤보 폭발·상태이상은 평소대로). */
  if (why === 'slash' || why === 'echo' || why === 'counter') {
    const rule = breakHit(z, rec, amount);
    if (rule) { amount = rule.dmg; why = rule.why; }
  }
  /* v0.74 정예 봉인 보호: 3봉인 순서가 남아 있으면 자동·광역·오답 피해로 HP 1 아래로 죽지 않는다. */
  if (z.eliteSeq && z.seq && z.seq.length && z.seqI < z.seq.length && why !== 'seal-break') {
    const capDmg = Math.max(0, z.hp - 1);
    amount = Math.min(amount * (why === 'seal-step' || why === 'seal-wrong' ? 1 : 0.2), capDmg);
  }
  const effectiveDamage = Math.min(Math.max(0,z.hp),amount);
  z.hp -= amount;
  if (rt.S) {
    if (why === 'ward' || why === 'bolt') rt.S.autoDmg = (rt.S.autoDmg || 0) + effectiveDamage;
    else rt.S.manualDmg = (rt.S.manualDmg || 0) + effectiveDamage;
  }
  if (rec) rec.hits.push({ id: z.id, dmg: amount, hp: z.hp, why: why });
  tintZombie(z);
  /* §3.1: 일반 명중에도 짧은 히트스톱. 한 획에 여러 마리를 베어도 1번, 0.06초를 넘기지 않는다. */
  if (why === 'slash') {
    if (rec && !rec.hitstopDone) { rec.hitstopDone = true; addStrokeHitstop(rec, rt.CFG.hitstopHit || 0.035); }
    if (rt.audio) rt.audio.hit(!!(rec && rec.perfect), rt.S ? (rt.S.combo || 0) : 0);
  }
  if (z.hp <= 0) killZombie(z, rec);
  else {
    const d = inkDir(rec, z);
    if (rt.three && rt.three.ink) { rt.three.ink.hit(z.x, z.z, d.x, d.z); rt.fxinkStat.hits++; }
    if (rt.three && rt.three.paper) rt.three.paper.hit(z.x, 1.0, z.z, { size: z.type === 'stone' ? 1.6 : 1.1 });
    if (rt.spawnFloater && effectiveDamage >= 0.4) rt.spawnFloater(z.x, z.z, effectiveDamage >= 10 ? String(Math.round(effectiveDamage)) : effectiveDamage.toFixed(1), (rec && rec.perfect) || why === 'shatter' || why === 'explode' ? 'crit' : 'dmg');
    /* Stagger: a white flash and a short shove along the cut; the boss and status ticks do not shove. */
    z.flinchT = rt.CFG.flinchDur || 0.14;
    if (z.obj && rt.art.kickChar) rt.art.kickChar(z.obj, 1);
    if (!z.isBoss && !(z.frozen > 0) && (why === 'slash' || why === 'cleave' || why === 'combo-burst')) {
      const L = Math.hypot(d.x, d.z) || 1, k = (rt.CFG.hitKnockZ || 0.35) * (z.type === 'stone' ? (rt.CFG.stoneKnockMul || 0.35) : 1);
      z.x += d.x / L * k; z.z += d.z / L * k;
    }
  }
}
/* v0.43: 원소별 바닥 흔적 — 화염=그을림, 빙결=얼음 균열, 번개=벼락 자국, 나머지=먹 튐. */
function groundTrace(elem, x, z, r) {
  if (!rt.three || !rt.three.traces) return;
  const kind = elem === 'fire' ? 'scorch' : elem === 'ice' ? 'ice' : (elem === 'lightning' || elem === 'bolt') ? 'bolt' : 'ink';
  const size = (r != null ? r * 2.1 : 2.7) * (0.85 + Math.random() * 0.4);
  rt.three.traces.decal(kind, x, z, { size: size, dur: kind === 'scorch' ? 4.6 : kind === 'ice' ? 5.2 : kind === 'bolt' ? 3.4 : 3.0, alpha: 0.85 });
}
function applyElement(z, elem, rec) {
  if (!z.alive || !elem || (z.isBoss && !z.hp)) return;
  if(z.isBoss && elem==='ice'){ z.chilled=true; hurtZombie(z,rt.frostImpact(rt.elemLv('ice')),'ice-impact',rec); return; }
  /* v0.41: 원소 스킬 시트 — 붙은 자리에서 그 원소가 종이 컷으로 터진다. */
  if (rt.three && rt.three.paper) rt.three.paper.elem(elem, z.x, z.z, { size: 1.6, ringR: 1.8 });
  /* v0.43: 같은 순간 바닥에 흔적이 남는다 — 궤적·터짐·흔적이 한 프레임에 맞물린다. */
  groundTrace(elem, z.x, z.z);
  if (elem === 'fire') {
    if (z.frozen > 0) shatterZombie(z, rec);
    else if (z.poison > 0) explodeZombie(z, rec);
    else {
      // The burning body and rising embers carry the hit without an icon.
      hurtZombie(z, rt.fireImpact(rt.elemLv('fire')), 'fire-impact', rec);
    }
  } else if (elem === 'ice') {
    if (!(z.frozen > 0)) {
      hurtZombie(z,rt.frostImpact(rt.elemLv('ice')),'ice-impact',rec);
      if (!z.alive) return;
    }
    z.frozen = rt.elemIceDur();
    z.burn = 0;
    if (rec) rec.statuses = (rec.statuses || []).concat([{ id: z.id, ice: true }]);
    tintZombie(z);
  } else if (elem === 'poison') {
    z.poison = Math.min(z.isBoss ? 3 : rt.elemPoisonMax(), (z.poison || 0) + 1);
    z.poisonT = rt.CFG.poisonDur;
    if (rec) rec.statuses = (rec.statuses || []).concat([{ id: z.id, poison: z.poison }]);
    tintZombie(z);
  }
}
/* A cut that kills still carries its element: fire spreads, ice slows the crowd, poison leaves a cloud. */
function spreadElement(z, elem, rec) {
  if (!elem || !rt.S) return;
  const R = rt.CFG.spreadR || 1.5;
  if (elem === 'poison') {
    rt.S.clouds = rt.S.clouds || [];
    rt.S.clouds.push({ x: z.x, z: z.z, t: rt.CFG.poisonCloudDur || 3, tick: 0, r: (rt.S.evo && rt.S.evo.poisonSpread) ? Math.max(3.2, rt.elemCloudR()) : rt.elemCloudR() });
    if (rt.art.playFx && rt.three) { const fx = rt.art.playFx(rt.three.scene, 'poison-burst', z.x, z.z, 2.6); if (fx) rt.three.fx.push(fx); }
    return;
  }
  rt.S.zombies.forEach(function (o) {
    if (!o.alive || o === z || o.isBoss || rt.dist(o, z) > R + o.r) return;
    if (elem === 'fire') applyElement(o, 'fire', rec);
    else if (elem === 'ice') { o.frozen = Math.max(o.frozen || 0, rt.elemIceDur()); tintZombie(o); }
  });
  /* 얼음 일섬으로 한 번에 베어 넘긴 적도 '얼어붙은 채 죽은 것'으로 본다 — 사방 한기가 발동한다. */
  if (elem === 'ice') frostNovaAt(z, rec);
}
function shatterZombie(z, rec) {
  z.freezeAt = null;
  z.frozen = 0;
  if (rec) rec.shatter = (rec.shatter || []).concat([z.id]);
  if (rt.art.playFx) {
    const fx = rt.art.playFx(rt.three.scene, 'ice-shatter', z.x, z.z, 2.4);
    if (fx) rt.three.fx.push(fx);
  }
  rt.S.shake = Math.max(rt.S.shake || 0, 0.15);
  hurtZombie(z, rt.elemShatterDmg(), 'shatter', rec);
  /* v0.31 §5.4 증기 폭발: 얼음+화염 두 칸 — 깨짐이 반경 2m로 퍼진다. */
  if (rt.S.evo && rt.S.evo.steam) {
    rt.S.zombies.forEach(function (o) {
      if (o === z || !o.alive || o.isBoss || o.isClone || o.isPillar || o.isTotem) return;
      if (rt.dist(o, z) > 2 + (o.r || 0.5)) return;
      hurtZombie(o, 2, 'steam', rec);
    });
    if (rt.art && rt.art.playFx && rt.three) { const fx = rt.art.playFx(rt.three.scene, 'ink-splat', z.x, z.z, 2.2); if (fx) rt.three.fx.push(fx); }
  }
}
function explodeZombie(z, rec) {
  const stacks = z.poison || 0;
  z.poison = 0; z.poisonT = 0; z.poisonTick = 0;
  if (rec) rec.explode = (rec.explode || []).concat([{ id: z.id, stacks: stacks }]);
  if (rt.art.playFx) {
    const fx = rt.art.playFx(rt.three.scene, 'poison-burst', z.x, z.z, 2.6);
    if (fx) rt.three.fx.push(fx);
  }
  rt.S.shake = Math.max(rt.S.shake || 0, 0.2);
  hurtZombie(z, Math.max(rt.CFG.explodeDmg,rt.fireImpact(rt.elemLv('fire'))) + .5*Math.max(0,stacks-1), 'explode', rec);
  rt.S.zombies.forEach(function (o) {
    if (o === z || !o.alive) return;
    if (rt.dist(o, z) <= rt.CFG.explodeR + o.r) hurtZombie(o, rt.CFG.explodeDmg, 'explode-aoe', rec);
  });
}
function tintZombie(z) {
  if (!z || !z.obj) return;
  const elem = !z.alive ? null : (z.frozen > 0 ? 'ice' : z.burn > 0 ? 'fire' : z.poison > 0 ? 'poison' : z.slowT > 0 ? 'slow' : null);
  if (rt.art.setStatus) rt.art.setStatus(z.obj, elem);
}
function tickStatuses(dt) {
  (rt.S.clouds || []).forEach(function (c) {
    c.t -= dt;
    const period = c.kind === 'fire' ? (rt.CFG.burnPeriod || 0.75) : (rt.CFG.poisonPeriod || 1);
    c.tick += dt;
    if (c.tick < period) return;
    c.tick -= period;
    if (c.kind === 'fire') {
      /* 묵염(墨炎) 장판: 0.75초당 1뎀 */
      rt.S.zombies.forEach(function (z) {
        if (z.alive && rt.dist(z, c) <= (c.r || 1.5) + z.r) hurtZombie(z, rt.CFG.burnDmg || 1, 'burn', rt.S.lastDash);
      });
      return;
    }
    rt.S.zombies.forEach(function (z) {
      if (!z.alive || rt.dist(z,c) > (c.r || rt.CFG.poisonCloudR || 2) + z.r) return;
      // Staying in one cloud refreshes exposure; different clouds can stack.
      c.exposed ??= new Set();
      if (c.exposed.has(z.id) && z.poison > 0) z.poisonT = rt.CFG.poisonDur;
      else { c.exposed.add(z.id); applyElement(z,'poison',null); }
    });
  });
  if (rt.S.clouds && rt.S.clouds.length) {
    let cw = 0;
    for (let ci = 0; ci < rt.S.clouds.length; ci++) { if (rt.S.clouds[ci].t > 0) rt.S.clouds[cw++] = rt.S.clouds[ci]; }
    rt.S.clouds.length = cw;
  }
  /* 둑운(毒雲) 확산: 구름끼리 만나면 병합 */
  if (rt.S.evo && rt.S.evo.poisonSpread && rt.S.clouds && rt.S.clouds.length > 1) {
    for (let i = 0; i < rt.S.clouds.length; i++) {
      for (let j = i + 1; j < rt.S.clouds.length; j++) {
        const a = rt.S.clouds[i], b = rt.S.clouds[j];
        if (!a || !b) continue;
        if (a.kind === 'fire' || b.kind === 'fire') continue;
        if (rt.dist(a, b) > 1.2) continue;
        a.r = Math.max(a.r || 2, b.r || 2) + 0.4;
        a.t = Math.max(a.t, b.t);
        rt.S.clouds.splice(j, 1);
        j--;
      }
    }
  }
  rt.S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (z.slowT > 0) { z.slowT -= dt; if (z.slowT < 0) z.slowT = 0; if (z.slowT <= 0) z.inkSlow = 0; }
    if (z.stun > 0) { z.stun -= dt; if (z.stun < 0) z.stun = 0; }
    if (z.rimFlash > 0) z.rimFlash = Math.max(0, z.rimFlash - dt);
    if (z.frozen > 0) {
      if (z.freezeAt == null) z.freezeAt = rt.S.elapsed;
      z.frozen -= dt;
      if (z.frozen <= 0) {
        z.freezeAt = null;
        z.frozen = 0;
        /* 빙결이 끝나면 잠깐 둔화가 남아 칼을 다시 챙길 시간을 준다. */
        z.slowT = Math.max(z.slowT || 0, 0.9);
      }
    }
    if (z.burn > 0) {
      z.burn -= dt;
      z.burnTick = (z.burnTick || 0) + dt;
      while (z.alive && z.burnTick >= rt.CFG.burnPeriod) {
        z.burnTick -= rt.CFG.burnPeriod;
        hurtZombie(z, rt.elemBurnDmg(), 'burn', rt.S.lastDash);
      }
      if (z.burn <= 0) z.burn = 0;
    }
    if (z.poison > 0) {
      z.poisonTick = (z.poisonTick || 0) + Math.min(dt,z.poisonT);
      z.poisonT -= dt;
        while (z.alive && z.poisonTick + 1e-8 >= rt.CFG.poisonPeriod) {
          z.poisonTick -= rt.CFG.poisonPeriod;
          hurtZombie(z, z.poison * rt.elemPoisonDmg(), 'poison', rt.S.lastDash);
        }
      if (z.poisonT <= 1e-8) { z.poison = 0; z.poisonT = 0; z.poisonTick = 0; }
    }
    tintZombie(z);
  });
}
/* v0.62 lightning-energy-skill-vfx: 스캔 바닥 균열 틈새 발열 글로우 트리거 */
function triggerGroundCrackHeat(x, z, radius, hex) {
  if (!rt.three || !rt.three.inkUniforms || !rt.three.inkUniforms.uCrackHeatAmt) return;
  rt.three.inkUniforms.uCrackHeatPos.value.set(x || 0, 0, z || 0);
  rt.three.inkUniforms.uCrackHeatRadius.value = radius || 3.6;
  rt.three.inkUniforms.uCrackHeatAmt.value = 1.0;
  if (hex != null) rt.three.inkUniforms.uCrackHeatCol.value.setHex(hex);
}
function makeSlash(from, to, shape) {
  const stShape = (rt.SHAPE_STYLE && shape && rt.SHAPE_STYLE[shape]) || null;
  const wMul = (stShape && stShape.widthMul) || 1.0;
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.max(0.2, Math.hypot(dx, dz));
  const yaw = Math.atan2(dx, dz);
  const q = (rt.three && rt.three.bloom && rt.three.bloom.quality) || rt.fxQ;
  /* The cut shows the element it actually applies: a ground charm (12 s) over the engraved one. */
  const elemNow = rt.S ? rt.curElem() : null;
  const tr = rt.trailOf(rt.save);
  const trId = (tr && tr.id) || 'ink';
  const isCustomTrail = trId !== 'ink';
  const flv = rt.swordForgeLv(rt.save);
  /* v0.71: 유료/전설 치장 검기 착용 시 원소 유무와 상관없이 화려한 전용 3D 검기 색조·광도·충격파가 즉시 발현 */
  const trailGainBoost = trId === 'gold_leaf' ? 1.55 : (trId === 'crimson_moon' ? 1.42 : (trId === 'jade_bamboo' ? 1.32 : 1.0));
  const customCore = isCustomTrail ? tr.coreHex : undefined;
  const customHot = isCustomTrail ? tr.hotHex : undefined;
  const slashElem = isCustomTrail ? null : elemNow;
  const s = rt.createInkSlash({
    from: from, to: to,
    width: rt.pathR() * (isCustomTrail ? 2.15 : 1.92) * wMul,
    elem: slashElem,
    color: customCore,
    coreGain: (q === 'off' ? 1.25 : 1.65) * trailGainBoost * (1 + flv * 0.12)
  });
  if (customHot != null && s.material && s.material.uniforms && s.material.uniforms.uHot && s.material.uniforms.uHot.value) {
    s.material.uniforms.uHot.value.set(customHot);
  }
  rt.three.scene.add(s.mesh);
  rt.three.slashes = rt.three.slashes || [];
  rt.three.slashes.push(s);
  /* 3D 검기 아크: 바닥 궤적 위로 솟는 입체 먹 리본 */
  try {
    const arc = rt.createSlashArc({ actNo: rt.actOf((rt.S && rt.S.stageNo) || rt.save.stage || 1),
      from: from, to: to, elem: slashElem,
      trailColor: customCore, trailHot: customHot, forgeLv: flv,
      coreGain: (q === 'off' ? 1.15 : 1.55) * trailGainBoost,
      height: (trId === 'gold_leaf' ? 0.85 : (isCustomTrail ? 0.70 : 0.50)) + rt.pathR() * 0.14,
      width: Math.max(isCustomTrail ? 1.25 : 0.9, rt.pathR() * (isCustomTrail ? 1.18 : 0.95) * wMul)
    });
    rt.three.scene.add(arc.mesh);
    rt.three.slashes.push(arc);
  } catch (e) {}
  if (rt.three.ink) rt.three.ink.slash(from, to);
  /* v0.71: 치장 검기별 전용 3D VFX (비취 풍압·혈월 충격파·금박 묵선 황금 번개) */
  if (rt.three.vfx3d) {
    rt.three.vfx3d.spawnInkTrail(from, to, (isCustomTrail ? 6 : 4) + (flv > 0 ? 1 : 0));
    const sparkCol = isCustomTrail ? tr.coreHex
      : (elemNow === 'ice' ? 0x98ecff : elemNow === 'poison' ? 0xc27aff : elemNow === 'fire' ? 0xff7038 : ((stShape && stShape.accentHex) || 0xffb85c));
    const sparkCnt = trId === 'gold_leaf' ? 22 : (trId === 'crimson_moon' ? 18 : (trId === 'jade_bamboo' ? 15 : 9));
    rt.three.vfx3d.spawnSparks(to.x, to.z, sparkCnt + flv * 2, {
      color: sparkCol,
      speed: isCustomTrail ? 7.6 : 6.2
    });
    if (trId === 'jade_bamboo') {
      rt.three.vfx3d.spawnSwirl(to.x, to.z, { r0: 0.9, r1: 3.4, accentHex: 0x4ef0b6, dur: 0.36 });
      triggerGroundCrackHeat(to.x, to.z, 3.2, 0x42e8a8);
    } else if (trId === 'crimson_moon') {
      rt.three.vfx3d.spawnSwirl(to.x, to.z, { r0: 1.0, r1: 4.0, accentHex: 0xff3b2c, dur: 0.42 });
      triggerGroundCrackHeat(to.x, to.z, 3.9, 0xff3b28);
    } else if (trId === 'gold_leaf') {
      rt.three.vfx3d.spawnLightning(
        { x: from.x, y: 1.15, z: from.z },
        { x: to.x, y: 0.25, z: to.z },
        { color: 0xffca42, core: 0xfffce4, hold: 0.14, fade: 0.22, sparks: 14 }
      );
      rt.three.vfx3d.spawnSwirl(to.x, to.z, { r0: 1.1, r1: 4.4, accentHex: 0xffd24a, dur: 0.46 });
      triggerGroundCrackHeat(to.x, to.z, 4.4, 0xffcc44);
    }
    if (elemNow === 'lightning' || (rt.S && rt.S.lastStroke === 'bolt')) {
      rt.three.vfx3d.spawnLightning(
        { x: from.x, y: 1.05, z: from.z },
        { x: to.x, y: 0.25, z: to.z },
        { color: 0x7ab4ff, core: 0xf4f9ff, hold: 0.13, fade: 0.18, sparks: 10 }
      );
      triggerGroundCrackHeat(to.x, to.z, 3.6, 0x6ea8ff);
    }
  }
  /* v0.41: 검기 시트(초승달 종이 아크) — 원소면 그 원소 시트가 함께 터진다. */
  if (rt.three.paper) rt.three.paper.slash(from, to, elemNow);
  /* v0.41: 베기 자세 프레임 — 주인공 팔·몸통이 베는 그림으로 빠르게 넘어간다 */
  if (rt.three.heroSpr && rt.art.slashChar) rt.art.slashChar(rt.three.heroSpr, 1.0, shape);
  if (rt.three.lights) {
    const burstCol = isCustomTrail ? tr.coreHex : rt.palColor('jade');
    const burstInt = trId === 'gold_leaf' ? 8.5 : (trId === 'crimson_moon' ? 7.2 : (trId === 'jade_bamboo' ? 6.4 : 4.5));
    rt.three.lights.burst((from.x + to.x) * 0.5, 1.35, (from.z + to.z) * 0.5, { color: burstCol, intensity: burstInt, duration: isCustomTrail ? 0.36 : 0.28 });
  }
  rt.fxinkStat.slashes++;
  if (elemNow === 'fire' && rt.art.trailTex) {
    const tgeo = new rt.THREE.PlaneGeometry(rt.pathR() * 2.2, len);
    const trail = new rt.THREE.Mesh(tgeo, rt.trailMaterial());
    trail.rotation.set(-Math.PI / 2, 0, yaw);
    trail.position.set((from.x + to.x) / 2, 0.06, (from.z + to.z) / 2);
    rt.three.scene.add(trail);
    rt.three.fx.push({ mesh: trail, life: 1.2, max: 1.2 });
  }
  return s.mesh;
}
/* v0.50: 보스 전용 3D 수묵·주홍 검기 (주인공 일섬과 동일한 WebGL 3D 리본 + 아크 + 동적 광원) */
function makeBossSlash(from, to, opts) {
  if (!rt.three || !rt.three.scene) return null;
  opts = opts || {};
  const q = (rt.three.bloom && rt.three.bloom.quality) || rt.fxQ;
  const actNo = rt.actOf((rt.S && rt.S.stageNo) || rt.save.stage || 1);
  const ACT_SLASH_PAL = {
    1: { elem: 'fire', accent: 0xe84830, spark: 0xff6e38, crack: 0xff5a30 },
    2: { elem: 'ice',  accent: 0x62d6f5, spark: 0x9cf0ff, crack: 0x5cc8ff },
    3: { elem: 'fire', accent: 0xf24236, spark: 0xff8c42, crack: 0xff4632 },
    4: { elem: 'bolt', accent: 0xb978ff, spark: 0xd9a8ff, crack: 0xa662ff }
  };
  const pal = ACT_SLASH_PAL[actNo] || ACT_SLASH_PAL[1];
  const elem = opts.elem || pal.elem;
  const width = opts.width || 2.8;
  try {
    const s = rt.createInkSlash({
      from: from, to: to, width: width, elem: elem,
      coreGain: q === 'off' ? 1.25 : 1.75
    });
    rt.three.scene.add(s.mesh);
    rt.three.slashes = rt.three.slashes || [];
    rt.three.slashes.push(s);
    const arc = rt.createSlashArc({ actNo: rt.actOf((rt.S && rt.S.stageNo) || rt.save.stage || 1),
      from: from, to: to, elem: elem,
      coreGain: q === 'off' ? 1.15 : 1.65,
      height: opts.height || 0.85,
      width: Math.max(1.2, width * 0.65)
    });
    rt.three.scene.add(arc.mesh);
    rt.three.slashes.push(arc);
    if (rt.three.ink) rt.three.ink.slash(from, to);
    if (rt.three.vfx3d) {
      rt.three.vfx3d.spawnInkTrail(from, to, 5);
      rt.three.vfx3d.spawnSwirl(to.x, to.z, { r0: 1.4, r1: Math.max(3.6, width * 1.45), accentHex: opts.lightColor || pal.accent, dur: 0.44 });
      rt.three.vfx3d.spawnSparks(to.x, to.z, 14, { color: pal.spark, speed: 7.4 });
      triggerGroundCrackHeat(to.x, to.z, Math.max(3.8, width * 1.3), pal.crack);
    }
    if (rt.three.paper) rt.three.paper.slash(from, to, elem);
    if (rt.three.lights) {
      rt.three.lights.burst((from.x + to.x) * 0.5, 1.35, (from.z + to.z) * 0.5, {
        color: opts.lightColor || pal.accent, intensity: 5.5, duration: 0.36
      });
    }
    return s.mesh;
  } catch (e) { return null; }
}
function afterimages(from, to) {
  for (let i = 1; i <= 4; i++) {
    const u = i / 5;
    const g = rt.art.makeChar('afterimage');
    if (g.userData.sprite) {
      const mat = g.userData.sprite.material;
      const op = 0.28 - i * 0.05;
      if (g.userData.rig) rt.art.setCharOpacity(g, op);
      else mat.opacity = op;
      if (mat.blending != null && !g.userData.rig) mat.blending = rt.THREE.NormalBlending;
    }
    g.position.set(from.x + (to.x - from.x) * u, 0, from.z + (to.z - from.z) * u);
    rt.three.scene.add(g);
    rt.three.fx.push({ mesh: g, life: 0.16 + i * 0.03, max: 0.22 });
  }
}
function cutBoss(s) { cutSpirit(s); }
/* §4.2 빈틈 고리: 걷는 보스의 빈틈은 1.6초에 한 번 열린다. 다음 빈틈까지의 진행을 돌려준다. */
function gapInfo(s) {
  const period = rt.CFG.gapPeriod || 1.6;
  const t = (rt.S.elapsed || 0) - ((s && s.walkCutAt != null) ? s.walkCutAt : -9);
  const u = rt.clamp(t / period, 0, 1);
  return { open: u >= 1, progress: u, readyIn: Math.max(0, period - t), period: period };
}
function cutSpirit(s) {
  if (!s || !s.alive) return;
  if (s.kind === 'spirit') return;
  if (s.isBoss && s.state === 'shuffle' && s.shuffle && !s.shuffle.locked && s.shuffle.gold > 0) {
    s.shuffle.locked = true;
    s.shuffle.gold = 0;
    if (rt.S) rt.S.shuffleLock = (rt.S.shuffleLock || 0) + 1;
    rt.notePatSeen('shuffle', 'lock');
    rt.bossPoise(s, 1.5);
    rt.bossFx.triggerSmokeBurst(s.x, s.z, true);
    rt.showJudge('무늬 고정! 강인도 타격!');
    if (rt.audio) rt.audio.breakCue();
    if (s.state === 'shuffle') { s.openUntil = Math.max(s.openUntil || 0, rt.S.elapsed + 1.8); }
    return;
  }
  if (s.isBoss && s.hp && !s.hidden && !(s.openUntil>rt.S.elapsed) &&
      ['telegraph','slamTele','sweepTele','volleyTele','charge','stun','groggy','clones','veil','shuffle'].includes(s.state)) {
    rt.endBossSide(s);
    s.openUntil=rt.S.elapsed+1.8+(s.chilled ? .4 : 0);
    s.chilled=false; s.state='stun'; s.stateT=0; s.leapY=0;
    rt.bossFx.triggerSmokeBurst(s.x, s.z, true);
    rt.showJudge('빈틈! 피해 ×1.3');
    if(rt.audio) rt.audio.breakCue();
  }
}

function destroySpirit(s) {
  if (!s || s.kind !== 'spirit') return;
  s.alive = false;
  if (s.obj && rt.three) rt.three.scene.remove(s.obj);
  if (rt.S && rt.S.spirits) { let w = 0; for (let i = 0; i < rt.S.spirits.length; i++) { if (rt.S.spirits[i] && rt.S.spirits[i].alive) rt.S.spirits[w++] = rt.S.spirits[i]; } rt.S.spirits.length = w; }
}
function addHitstop(sec) {
  if (!rt.S) return;
  const queued = !!(rt.S.inputQueue && rt.S.inputQueue.size() > 0);
  const cap = queued ? 0.045 : (rt.CFG.hitstopKillMax || 0.12);
  const prev = rt.S.hitstop || 0;
  rt.S.hitstop = Math.min(cap, prev + (sec || 0));
  const added = Math.max(0, rt.S.hitstop - prev);
  if (added > 0 && rt.S.lastDash) rt.S.lastDash.hitstopMs = (rt.S.lastDash.hitstopMs || 0) + added * 1000;
  if (added > 0 && rt.pulseImpactChroma) rt.pulseImpactChroma(Math.min(1, 0.36 + added * 8.5));
}
/* §3.1 한 획의 정지 예산: 명중·처치가 몇 번 들어가든 0.06초를 넘기지 않는다. */
function addStrokeHitstop(rec, sec) {
  if (!rec) { addHitstop(sec); return; }
  const cap = rt.CFG.hitstopHitCap || 0.06;
  const used = rec.hsUsed || 0;
  const add = Math.min(sec || 0, Math.max(0, cap - used));
  if (add <= 0) return;
  rec.hsUsed = used + add;
  addHitstop(add);
}
/* A slain body sinks and fades over dieDur instead of vanishing on the spot. */
function startDying(obj) {
  rt.three.dying = rt.three.dying || [];
  const mats = [];
  obj.traverse(function (o) { if (o.material && o.material.opacity != null && o.visible) mats.push([o.material, o.material.opacity]); });
  if (obj.userData && obj.userData.tele) obj.userData.tele.visible = false;
  const hasAnim = !!(rt.art && rt.art.startMonsterDeath && rt.art.startMonsterDeath(obj));
  rt.three.dying.push({ obj: obj, t: 0, dur: hasAnim ? 0.90 : (rt.CFG.dieDur || 0.5), mats: mats, y0: obj.position.y, hasAnim: hasAnim });
}
function stepDying(dt) {
  if (!rt.three || !rt.three.dying || !rt.three.dying.length) return;
  const list = rt.three.dying;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    d.t += dt;
    const k = Math.min(1, d.t / d.dur);
    if (d.hasAnim) {
      if (rt.art && rt.art.tickMonsterDeath) rt.art.tickMonsterDeath(d.obj, dt);
      const fadeK = k > 0.62 ? (k - 0.62) / 0.38 : 0;
      if (fadeK > 0) {
        for (let j = 0; j < d.mats.length; j++) {
          d.mats[j][0].opacity = d.mats[j][1] * (1 - fadeK);
          d.mats[j][0].transparent = true;
        }
      }
    } else {
      for (let j = 0; j < d.mats.length; j++) {
        d.mats[j][0].opacity = d.mats[j][1] * (1 - k);
        d.mats[j][0].transparent = true;
      }
      d.obj.scale.set(1 + 0.25 * k, 1 - 0.55 * k, 1);
      d.obj.position.y = d.y0 - 0.3 * k;
    }
    if (k >= 1) {
      if (rt.art && rt.art.disposeChar) rt.art.disposeChar(d.obj);
      rt.three.scene.remove(d.obj);
    } else {
      list[w++] = d;
    }
  }
  list.length = w;
}
function killZombie(z, rec) {
  if (!z || !z.alive) return;
  z.alive = false;
  if (z.isBoss && rt.S) {
    rt.endBossSide(z);
    rt.endShrink(false);
    rt.clearOrbitSpirits();
    rt.S.vulnStacks = 0; rt.S.vulnT = 0; rt.renderVulnBadge();
    rt.codexBoss(rt.S.stage);
    if (rt.audio && rt.audio.setBossMode) rt.audio.setBossMode(false);
    rt.bossFx.triggerGroggyBreak(z.x, z.z);
    rt.haptic([30, 40, 65]);
    if (!rt.reducedMotion()) {
      rt.S.slowMul = rt.a11yShake() ? 0.62 : 0.28;
      rt.S.slowMulT = 0.45;
      if (!rt.a11yShake()) { rt.S.camZoomT = 0.90; rt.S.camZoomAmt = 5.5; }
    }
  if (rt.three && rt.three.vfx3d) {
    rt.three.vfx3d.spawnLightning({ x: z.x, y: 8.5, z: z.z }, { x: z.x, y: 0.2, z: z.z }, { color: 0xffd26a, core: 0xfffdf2, hold: 0.18, fade: 0.24, sparks: 22 });
    rt.three.vfx3d.spawnSwirl(z.x, z.z, { r0: 1.6, r1: 5.4, accentHex: 0xf0c258, dur: 0.52 });
    rt.three.vfx3d.triggerImpactFrame({ dur: 0.08, safe: rt.a11yShake() });
    triggerGroundCrackHeat(z.x, z.z, 5.5, 0xffd26a);
  }
  } else rt.codexMon(z.type);
  /* 분열 정예: 죽으면 둘로 갈라진다. */
  if (rt.S && z.eliteAttr === 'split' && !z.splitDone) {
    z.splitDone = true;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      rt.spawnZombie({ x: z.x + Math.cos(a) * 1.1, z: z.z + Math.sin(a) * 1.1, type: 'imp' });
    }
    rt.showJudge('분열!');
    rt.telemetry.event('elite_attr', { attr: 'split', stage: rt.S.stageNo });
  }
  if (rt.S && !z.isBoss) rt.goalOnKill(z);
  if (rt.three && rt.three.shaderFx3d) {
    const tr = rt.trailOf(rt.save);
    const edgeHex = z.isBoss ? 0xffd65a : (tr && tr.id !== 'ink' ? tr.coreHex : (z.burning ? 0xff6e38 : (z.frozen ? 0x86ecff : (z.poison ? 0xc27aff : 0xff9a44))));
    rt.three.shaderFx3d.spawnDissolve(z.x, z.z, { scale: z.isBoss ? 2.1 : 1.05, edgeHex: edgeHex, dur: z.isBoss ? 0.85 : 0.50 });
  }
  if (rt.S) {
    rt.S.kills = (rt.S.kills || 0) + 1;
    const kShape = (rec && (rec.type || rec.shape)) || (rt.S.lastDash && rt.S.lastDash.type) || null;
    if (kShape) { rt.S.shapeKills = rt.S.shapeKills || {}; rt.S.shapeKills[kShape] = (rt.S.shapeKills[kShape] || 0) + 1; }
    if (rec && rec.type === 'circle') rt.S.cleaveKills = (rt.S.cleaveKills || 0) + 1;
    if (rt.computeStyleKillPoints) {
      const kPts = rt.computeStyleKillPoints({
        multiN: (rec && rec._multiN) || 1,
        why: (rec && rec.type === 'circle') ? 'cleave' : ((rec && rec.why) || 'slash'),
        perfect: !!(rec && rec.perfect),
        groggy: !!(z.isBoss && z.state === 'groggy'),
        boss: !!z.isBoss
      });
      rt.S.styleScore = (rt.S.styleScore || 0) + kPts;
      if (rt.spawnFloater && kPts >= 180) rt.spawnFloater(z.x, z.z + 0.35, '+' + kPts, 'score');
    }
  }
  if (rt.S && rt.S.spirits) rt.S.spirits.forEach(function (s) { if (s.target === z) s.target = null; });
  rt.assignSpiritTargets();
  z.marked = false;
  if (z.obj) startDying(z.obj);
  /* v0.41: 처치 — 혼령 자리에서 종이 부스러기로 흩어진다. */
  if (rt.three && rt.three.paper) rt.three.paper.dissolve(z.x, (z.isBoss ? 3.2 : 1.3), z.z, { size: z.isBoss ? 4.2 : 1.5 });
  if (rt.three && rt.three.ink) {
    const d = inkDir(rec || (rt.S && rt.S.lastDash), z);
    /* §3.1: 처치의 먹 번짐은 반경 ×1.4 — 한 획에 여러 마리가 사라져도 '벌었다'가 보이게. */
    rt.three.ink.kill(z.x, z.z, d.x, d.z, { scale: rt.CFG.killSplatScale || 1.4 });
    rt.fxinkStat.kills++;
  }
  if (rt.audio && rec && !z.isBoss) rt.audio.drum();
  if (rec && rec.hits && rec.hits.some(function (h) { return h.id === z.id && h.why === 'slash'; })) addStrokeHitstop(rec, rt.CFG.hitstopKill || 0.06);
  const kd = rt.CFG.zombieTypes[z.type] || rt.CFG.zombieTypes.imp;
  /* §6.1 5장 안개 띠: 원이 가장 넓은 순간(안개가 옅음)의 처치를 별 3 대안석으로 센다. */
  if (!z.isBoss && rt.S && rt.S.terrain && rt.S.terrain.kind === 'fog' && (rt.S.terrain.ringMul || 1) > 1.06) rt.tcount('fogWide');
  /* The boss pays its own coin value; its xp does not matter, the run ends on its death. */
  grantKill(z.isBoss ? (rt.CFG.bossCoin || 20) : kd.coin);
  gainXp(rt.CFG.xpPerKill * kd.xp * (rt.CFG.xpScale || 1));
  /* 혼백구 100% + 20% 추가 드롭, 정예는 부적 상자 */
  rt.spawnItem({ type: 'xp', x: z.x, z: z.z });
  if (Math.random() < 0.2) rt.spawnItem({ type: dropType(), x: z.x + (Math.random() - 0.5) * 0.7, z: z.z + (Math.random() - 0.5) * 0.7 });
  if (z.elite) rt.spawnItem({ type: 'charm', x: z.x, z: z.z });
  /* 참 게이지 */
  if (!z.isBoss) addCharge(rt.CFG.cleaveGainKill || 7);
  /* 사방 한기(寒氣): 얼어붙은 적이 죽으면 사방으로 얼음 검기 */
  if (rt.S.evo && rt.S.evo.frostNova && (z.frozen > 0 || z.slowT > 0) && !z.novaDone) {
    frostNovaAt(z, rec);
  }
  /* 만독 쇄도: 독이 오른 적의 죽음이 독폭발과 참 게이지로 이어진다. */
  if (rt.S.evo && rt.S.evo.poisonSpread && (z.poison || 0) > 0 && !z.manpoDone) {
    z.manpoDone = true;
    manpoBurst(z, rec);
  }
  /* 포위 웨이브 정리 보상 */
  if (rt.S) {
    const ix = (rt.S.waveIds || []).indexOf(z.id);
    if (ix >= 0) {
      rt.S.waveIds.splice(ix, 1);
      if (!rt.S.waveIds.length) { addCharge(rt.CFG.cleaveGainWave || 15); rt.showJudge('포위 격파!'); }
    }
  }
  rt.refreshSpirits();
}
function dropType() {
  const r = Math.random();
  if (r < 0.24) return 'xp';
  if (r < 0.42) return 'coin';
  if (r < 0.58) return 'heal';
  if (r < 0.72) return 'dashplus';
  if (r < 0.80) return 'ice';
  if (r < 0.88) return 'fire';
  if (r < 0.94) return 'poison';
  return 'bell';
}
function grantKill(mul) {
  /* v0.30 §7.2: 엽전에도 모드 배율(수련 ×0.7 · 고수 ×1.4). v0.32 §6.1: 4장 붉은 달빛에는 두 배. */
  const c = Math.round(rt.CFG.coinPerKill * (mul || 1) * rt.coinMult() * rt.modeCoin() * rt.terrainCoinMul());
  rt.save.coins += c; rt.persist();
}
/* Screen point (inside #app) of a HUD element, for pickups flying to it. */
function hudPoint(id) {
  const el = $(id), app = $('app');
  if (!el || !app) return { x: 30, y: 30 };
  const a = app.getBoundingClientRect(), b = el.getBoundingClientRect();
  return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 };
}
const ITEM_FX = {
  coin: 'gold', xp: 'jade', heal: 'vermilion', herb: 'vermilion', dashplus: 'jade', ice: 'ice', fire: 'fire', poison: 'poison',
  bell: 'gold', charm: 'gold', magnet: 'gold', bang: 'fire'
};
/* Every pickup bursts in its colour; currency and spirit orbs fly to their HUD counter. */
function pickupFx(it) {
  const c = rt.FX_COLORS[ITEM_FX[it.kind] || 'paper'];
  if (it.kind === 'xp') { rt.inkFx.burst(it.x, it.z, c, { r1: 18, n: 0, dur: 0.3 }); rt.inkFx.fly(it.x, it.z, hudPoint('xpWrap'), c, 1); return; }
  if (it.kind === 'coin') { rt.inkFx.burst(it.x, it.z, c, { r1: 26, n: 6 }); rt.inkFx.fly(it.x, it.z, hudPoint('coinLabel'), c, 4); return; }
  const big = it.kind === 'charm' || it.kind === 'bang' || it.kind === 'magnet' || it.kind === 'bell';
  rt.inkFx.burst(it.x, it.z, c, { r1: big ? 70 : 44, n: big ? 12 : 8, big: big, dur: big ? 0.7 : 0.5 });
  if (it.kind === 'heal' || it.kind === 'herb') rt.inkFx.fly(it.x, it.z, hudPoint('hpWrap'), c, 3);
  if (it.kind === 'ice' || it.kind === 'fire' || it.kind === 'poison') rt.inkFx.ring(1.6, c, 0.6);

}
function collectItem(it, rec) {
  pickupFx(it);
  it.alive = false;
  if (it.obj) rt.three.scene.remove(it.obj);
  { let iw = 0; for (let ii = 0; ii < rt.S.items.length; ii++) { if (rt.S.items[ii] && rt.S.items[ii].alive) rt.S.items[iw++] = rt.S.items[ii]; } rt.S.items.length = iw; }
  if (rec) rec.items.push({ id: it.id, type: it.kind });
  if (it.kind === 'dashplus') {
    /* §5.1 바닥 일섬 +1은 한 판 3번까지, 그 뒤에는 엽전 +10으로 바뀐다. */
    if ((rt.S.floorDash || 0) >= 3) {
      rt.save.coins += 10; rt.persist();
      rt.showJudge('일섬 상한 · 엽전 +10');
    } else {
      rt.S.floorDash = (rt.S.floorDash || 0) + 1;
      rt.S.dashCount++;
      rt.inkFx.seal('일섬 ' + rt.S.dashCount, rt.FX_COLORS[ITEM_FX.dashplus || 'paper']);
      if (rt.S.dash && rec && rec.type) {
        const skip = (rt.S.dashQueue || []).concat(rt.S.dash.target ? [rt.S.dash.target] : []);
        const more = rt.pickSpirits(rec.type, 1, { x: rt.S.dash.to.x, z: rt.S.dash.to.z }, rt.S.lastStrokeDir, skip);
        if (more[0]) {
          rt.S.dashQueue.push(more[0]);
          if (rec.targets.indexOf(more[0].id) < 0) rec.targets.push(more[0].id);
        }
      }
    }
  } else if (it.kind === 'charm') {
    /* 부적 상자(잭팟): 강화 3연속 — §5.2 부적 상자는 지금처럼 멈추는 창을 쓴다. */
    rt.S.forcePauseLv = true;
    rt.S._pendingLv = (rt.S._pendingLv || 0) + 2;
    rt.S.slowT = Math.max(rt.S.slowT || 0, 0.35);
    if (rt.audio) {
      rt.audio.bell(0, 'bolt');
      setTimeout(function () { if (rt.audio) rt.audio.bell(0.4, 'vee'); }, 120);
      setTimeout(function () { if (rt.audio) rt.audio.bell(-0.4, 'hline'); }, 240);
    }
    rt.showJudge('부적 상자!');
    openLevelUp();
  } else if (it.kind === 'heal') {
    rt.S.hp = Math.min(rt.maxHp(), rt.S.hp + 3);
  } else if (it.kind === 'herb') {
    /* 회복 약초·주먹밥: 체력 +2 */
    const restored = Math.min(rt.maxHp() - rt.S.hp, rt.CFG.herbHeal || 2);
    rt.S.hp += restored;
    rt.showJudge(restored ? '체력 +' + restored : '체력 가득');
    if (rt.audio && rt.audio.pickup) rt.audio.pickup(1);
  } else if (it.kind === 'magnet') {
    /* 자석 부적: 바닥 아이템 전부를 한 번에 */
    rt.showJudge('자석 부적!');
    rt.absorbAllItems(it);
  } else if (it.kind === 'bang') {
    /* 화약 부적: 화면 안 광역 폭발 */
    rt.firecrackerBurst();
  } else if (it.kind === 'coin') {
    rt.save.coins += Math.round(5 * rt.coinMult()); rt.persist();
  } else if (it.kind === 'xp') gainXp((rt.CFG.xpPerKill || 1) * (rt.CFG.xpScale || 1));
  else if (it.kind === 'ice' || it.kind === 'fire' || it.kind === 'poison') {
    /* v0.23: 바닥 원소 부적은 12초 임시 부여 — 레벨업으로 키운 원소 각인을 덮어쓰지 않는다. */
    rt.S.tempElem = { el: it.kind, t: rt.CFG.tempElemDur || 12 };
    rt.showJudge(rt.elemNameOf(it.kind) + ' 부적 ' + Math.round(rt.CFG.tempElemDur || 12) + '초');
    if (rt.audio && rt.audio.pickup) rt.audio.pickup(1);
  }
  else if (it.kind === 'bell') rt.startBell(it.shape, it.dur);
  rt.renderHud();
}
function addCharge(n) {
  if (!rt.S) return;
  const max = rt.CFG.cleaveCharge || 100;
  const before = rt.S.charge || 0;
  const mul = 1 + 0.25 * (rt.S.chargeLv || 0);
  rt.S.charge = Math.min(max, before + n * mul);
  if (before < max && rt.S.charge >= max) { rt.showJudge('참 준비'); if (rt.audio) rt.audio.bell(0, 'bolt'); }
}
/* 스킬 진화: 조합이 갖춰지면 화면과 손에서 바로 티나는 효과가 켜진다.
   v0.22: 강화 레벨(upLv)까지 조건에 넣어 '한 번 집은 것'이 아니라 '키운 것'으로 진화한다. */
function upLv(id) { return (rt.S && rt.S.upLv && rt.S.upLv[id]) || 0; }
function checkEvolutions(ctx) {
  if (!rt.S) return;
  ctx = ctx || {};
  const has = rt.S.evo || (rt.S.evo = {});
  rt.S.evolved = rt.S.evolved || [];
  const el = rt.S.dashElem;
  function born(key, name) {
    if (has[key]) return;
    has[key] = true;
    rt.S.evolved.push(name);
    rt.codexEvo(key);
    rt.toast('✦ 진화: ' + name);
    rt.inkFx.evo(name, rt.FX_COLORS[rt.S.dashElem || 'gold'] || rt.FX_COLORS.gold);
    rt.S.slowT = Math.max(rt.S.slowT || 0, 0.5);
    if (rt.audio) rt.audio.bell(0, 'bolt');
  }
  /* 1) 빙결 참격(절대영도): 일섬·얼음 + 경로 폭 Lv2↑ → 착지점 광역 동결·분쇄 */
  const hasIce = el === 'ice' || rt.elemLv('ice') > 0;
  const hasFire = el === 'fire' || rt.elemLv('fire') > 0;
  const hasPoison = el === 'poison' || rt.elemLv('poison') > 0;
  if (hasIce && upLv('width') >= 2) born('frostNova', '빙결 참격(절대영도)');
  /* 2) 업화 연쇄: 일섬·화염 + 일섬 횟수 Lv2↑ → 돌진마다 화염 폭발 장판 */
  if (hasFire && upLv('dash') >= 2) born('fireTrail', '업화 연쇄');
  /* 3) 만독 쇄도: 일섬·독 + 참(斬) 게이지 Lv2↑ → 독폭발 연쇄 + 참 게이지 충전 */
  if (hasPoison && upLv('charge') >= 2) born('poisonSpread', '만독 쇄도');
  /* 4) 빙참: 일섬·얼음 + 참 게이지 Lv2↑ */
  if (hasIce && upLv('charge') >= 2) born('iceCleave', '빙참');
  /* 5) 만종: 방울 공명 Lv1↑(또는 방울 지속 중) + 일섬 횟수 Lv2↑ */
  if ((rt.S.bellT > 0 || ctx.bell || upLv('reson') >= 1) && upLv('dash') >= 2) born('myriadBell', '만종');
  /* v0.31 §5.4 새 진화 5종 */
  if (upLv('ward') >= 3 && (rt.S.ringLv || 0) >= 3) born('manryun', '만륜');
  if (upLv('bolt') >= 3 && hasIce) born('noebing', '뇌빙');
  if (upLv('reson') >= 3 && upLv('dash') >= 2) born('cheonjong', '천종');
  if (upLv('counter') >= 2 && upLv('parry') >= 2) born('gwigeom', '귀검');
  if (rt.elemLv('ice') >= 1 && rt.elemLv('fire') >= 1) born('steam', '증기 폭발');
}
/* 빙결 참격: 착지점이 얼어붙고 부서지는 얼음 파편이 퍼진다. */
function frostLanding(at) {
  if (!rt.S || !at) return;
  const R = 4.2;
  if (rt.art && rt.art.playFx && rt.three) {
    const fx = rt.art.playFx(rt.three.scene, 'ink-splat', at.x, at.z, 3.4);
    if (fx) rt.three.fx.push(fx);
  }
  rt.inkFx.ring(R, rt.FX_COLORS.ice, 0.55);
  rt.inkFx.burst(at.x, at.z, rt.FX_COLORS.ice, { r1: 56, n: 12, dur: 0.45, big: true });
  if (rt.three) {
    if (rt.three.lights) rt.three.lights.burst(at.x, 1.4, at.z, { color: 0x8ce8ff, intensity: 6.2, duration: 0.34, distance: 15 });
    if (rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(at.x, at.z, { r0: 0.8, r1: R * 1.05, colorHex: 0x8ce8ff, coreHex: 0xeefbff, dur: 0.42 });
    if (rt.three.vfx3d) {
      rt.three.vfx3d.spawnSwirl(at.x, at.z, { r0: 0.9, r1: R, accentHex: 0x96e4ff, dur: 0.44 });
      rt.three.vfx3d.spawnSparks(at.x, at.z, 20, { color: 0xb8f0ff, speed: 7.4 });
    }
    triggerGroundCrackHeat(at.x, at.z, R, 0x8ce8ff);
  }
  rt.S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (rt.dist(z, at) > R + z.r) return;
    if(z.isBoss) z.chilled=true; else z.frozen = Math.max(z.frozen || 0, rt.elemIceDur());
    z.burn = 0;
    tintZombie(z);
    hurtZombie(z, 3, 'frost', rt.S.lastDash);
  });
  rt.S.shake = Math.max(rt.S.shake || 0, 0.35);
}
/* 업화 연쇄: 착지할 때마다 불꽃이 터지고 지나온 자리에 장판이 남는다. */
function fireLanding(at) {
  if (!rt.S || !at) return;
  const R = 2.7;
  if (rt.art && rt.art.playFx && rt.three) {
    const fx = rt.art.playFx(rt.three.scene, 'ink-splat', at.x, at.z, 2.4);
    if (fx) rt.three.fx.push(fx);
  }
  rt.inkFx.burst(at.x, at.z, rt.FX_COLORS.fire, { r1: 48, n: 12, dur: 0.42, big: true });
  if (rt.three) {
    if (rt.three.lights) rt.three.lights.burst(at.x, 1.3, at.z, { color: 0xff6a28, intensity: 6.5, duration: 0.32, distance: 14 });
    if (rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(at.x, at.z, { r0: 0.6, r1: R * 1.15, colorHex: 0xff6a28, coreHex: 0xfff0b8, dur: 0.36 });
    if (rt.three.vfx3d) {
      rt.three.vfx3d.spawnSwirl(at.x, at.z, { r0: 0.7, r1: R * 1.1, accentHex: 0xff7038, dur: 0.38 });
      rt.three.vfx3d.spawnSparks(at.x, at.z, 22, { color: 0xff9842, speed: 7.8 });
    }
    triggerGroundCrackHeat(at.x, at.z, R * 1.25, 0xff6a28);
  }
  rt.S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (rt.dist(z, at) > R + z.r) return;
    hurtZombie(z, rt.CFG.explodeDmg || 3, 'fire-burst', rt.S.lastDash);
    if (z.alive) { z.burn = rt.CFG.burnDur || 3; tintZombie(z); }
  });
  rt.S.shake = Math.max(rt.S.shake || 0, 0.3);
}
/* 만독 쇄도: 독이 오른 적이 쓰러지면 독이 터져 옆으로 옮고 참 게이지가 더 찬다. */
function manpoBurst(z, rec) {
  if (!rt.S || !z) return;
  const stacks = Math.max(1, Math.min(rt.elemPoisonMax(), z.poison || 1));
  const R = 2.8 + stacks * 0.3;
  if (rt.art && rt.art.playFx && rt.three) {
    const fx = rt.art.playFx(rt.three.scene, 'ink-splat', z.x, z.z, 2.8);
    if (fx) rt.three.fx.push(fx);
  }
  rt.inkFx.burst(z.x, z.z, rt.FX_COLORS.poison, { r1: 48, n: 10, dur: 0.42, big: true });
  if (rt.three) {
    if (rt.three.lights) rt.three.lights.burst(z.x, 1.2, z.z, { color: 0xb862ff, intensity: 5.5, duration: 0.30, distance: 13 });
    if (rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(z.x, z.z, { r0: 0.6, r1: R * 1.1, colorHex: 0xb862ff, coreHex: 0xf4dcff, dur: 0.38 });
    if (rt.three.vfx3d) rt.three.vfx3d.spawnSparks(z.x, z.z, 18, { color: 0xc87eff, speed: 6.8 });
    triggerGroundCrackHeat(z.x, z.z, R, 0xb862ff);
  }
  rt.S.zombies.forEach(function (o) {
    if (o === z || !o.alive) return;
    if (rt.dist(o, z) > R + o.r) return;
    hurtZombie(o, 2 + stacks, 'poison-burst', rec);
    if (o.alive) {
      o.poison = Math.min(rt.elemPoisonMax(), (o.poison || 0) + 1);
      o.poisonT = rt.CFG.poisonDur || 4;
      tintZombie(o);
    }
  });
  addCharge(6 + stacks * 2);
  rt.S.shake = Math.max(rt.S.shake || 0, 0.22);
}
/* 사방 한기(寒氣): 얼어붙은 적(혹은 얼음 일섬으로 베어 넘긴 적)이 터지며 사방을 얼린다. */
function frostNovaAt(z, rec) {
  if (!rt.S || !z || !rt.S.evo || !rt.S.evo.frostNova || z.novaDone) return;
  z.novaDone = true;
  if (rt.art.playFx && rt.three) {
    const fx = rt.art.playFx(rt.three.scene, 'ice-shatter', z.x, z.z, 3.2);
    if (fx) rt.three.fx.push(fx);
  }
  rt.S.zombies.forEach(function (o) {
    if (!o.alive || o === z) return;
    if (rt.dist(o, z) <= 3) {
      hurtZombie(o, 4, 'frost', rec);
      if (o.alive) { o.slowT = Math.max(o.slowT || 0, rt.CFG.iceSlowDur || 2); tintZombie(o); }
    }
  });
}
/* ---------- v0.31 §5.3 새 카드 ----------
   회전 호신부·진노의 벼락부적은 자동 피해 — 총 피해의 25%(autoCap)를 넘으면 대미지를 받지 않는다.
   메아리 칼·방울 공명·칼집 반격·먹 발자국은 획과 판단에 딸린 효과라 수동 피해로 센다. */
function wardInfo() {
  const lv = upLv('ward');
  if (!lv) return null;
  const W = rt.CFG.ward || {};
  return {
    lv: lv,
    n: lv >= 3 ? (W.n3 || 4) : (W.n || 2),
    r: (lv >= 2 ? (W.r2 || 2.6) : (W.r || 2.2)) + ((rt.S.evo && rt.S.evo.manryun) ? (W.manryunR || 1.2) : 0),
    dmg: W.dmg || 0.8, period: W.period || 0.35
  };
}
function stepWard(dt) {
  const w = wardInfo();
  if (!w) return;
  rt.S.wardSpin = (rt.S.wardSpin || 0) + dt * (rt.CFG.ward.spin || 2.1);
  rt.S.wardTick = (rt.S.wardTick || 0) + dt;
  if (rt.S.wardTick < w.period) return;
  rt.S.wardTick -= w.period;
  for (let i = 0; i < w.n; i++) {
    const a = rt.S.wardSpin + i * Math.PI * 2 / w.n;
    const p = { x: rt.S.hero.x + Math.cos(a) * w.r, z: rt.S.hero.z + Math.sin(a) * w.r };
    rt.S.zombies.forEach(function (z) {
      if (!z.alive || z.isClone || z.isPillar || z.isTotem) return;
      if (rt.dist(z, p) > 0.62 + (z.r || 0.5)) return;
      const damage = Math.min(w.dmg,autoBudget());
      if (damage < .001) return;
      hurtZombie(z, damage, 'ward', rt.S.lastDash);
      rt.inkFx.burst(p.x, p.z, (rt.S.evo && rt.S.evo.manryun) ? rt.FX_COLORS.jade : rt.FX_COLORS.gold, { r1: 24, n: 6, dur: 0.24 });
      if (rt.three && rt.three.vfx3d) rt.three.vfx3d.spawnSparks(p.x, p.z, 6, { color: (rt.S.evo && rt.S.evo.manryun) ? 0x8ef5d4 : 0xffd26a, speed: 5.4 });
      if (z.alive && rt.S.evo && rt.S.evo.manryun) { z.slowT = Math.max(z.slowT || 0, rt.CFG.ward.manryunSlow || 0.3); tintZombie(z); }
    });
  }
}
function boltPeriod() {
  const B = rt.CFG.boltCard || {};
  return Math.max(2.5, (B.every || 4.5) - (B.lvStep || 0.4) * Math.max(0, upLv('bolt') - 1));
}
/* 가장 밀집한 지점: 6m 안 원귀 중 2.4m 안에 가장 많이 모인 자리. */
function densestPoint(range) {
  let best = null, bestN = -1;
  (rt.S.zombies || []).forEach(function (z) {
    if (!z.alive || z.hidden || z.isClone || z.isPillar || z.isTotem) return;
    if (rt.dist(z, rt.S.hero) > range && !(z.isBoss && rt.arenaActive())) return;
    let n = 0;
    rt.S.zombies.forEach(function (o) { if (o.alive && !o.isBoss && !o.isClone && !o.isPillar && !o.isTotem && rt.dist(o, z) <= rt.CFG.boltCard.r + o.r) n++; });
    if (n > bestN) { bestN = n; best = { x: z.x, z: z.z }; }
  });
  return best;
}
function stepBolt(dt) {
  const lv = upLv('bolt');
  if (!lv) return;
  rt.S.boltT = (rt.S.boltT || 0) + dt;
  if (rt.S.boltT < boltPeriod()) return;
  const at = densestPoint(Math.min(rt.ringR(),rt.CFG.boltCard.range || 6));
  if (!at) return;
  rt.S.boltT = 0;
  rt.S.bolts = rt.S.bolts || [];
  rt.S.bolts.push({ x: at.x, z: at.z, t: 0, delay: rt.CFG.boltCard.tele || 0.6, r: rt.CFG.boltCard.r || 2.2, done: false });
  if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'bolt');
  rt.telemetry.event('auto_skill', { kind: 'bolt', lv: lv, stage: rt.S.stageNo });
}
function stepBolts(dt) {
  if (!rt.S.bolts || !rt.S.bolts.length) return;
  rt.S.bolts.forEach(function (b) {
    b.t += dt;
    if (b.done || b.t < b.delay) return;
    b.done = true;
    rt.S.shake = Math.max(rt.S.shake || 0, 0.34);
    /* v1.00 벼락부적 3D 낙뢰 + 충격파 + 점광원 + 지면 균열 발열 */
    const isNoebing = !!(rt.S.evo && rt.S.evo.noebing);
    rt.inkFx.burst(b.x, b.z, isNoebing ? rt.FX_COLORS.ice : rt.FX_COLORS.gold, { r1: 52, n: 12, dur: 0.42, big: true });
    if (rt.three) {
      if (rt.three.lights) rt.three.lights.burst(b.x, 1.8, b.z, { color: isNoebing ? 0x8ce8ff : 0xffe48c, intensity: 7.2, duration: 0.32, distance: 16 });
      if (rt.three.vfx3d) {
        rt.three.vfx3d.spawnLightning({ x: b.x + (Math.random() - 0.5) * 1.2, y: 11.5, z: b.z + (Math.random() - 0.5) * 1.2 }, { x: b.x, y: 0.15, z: b.z }, { color: isNoebing ? 0x7ce4ff : 0x9ec4ff, core: 0xfffce8, hold: 0.14, fade: 0.20, sparks: 14 });
        rt.three.vfx3d.spawnSparks(b.x, b.z, 18, { color: isNoebing ? 0xa8f0ff : 0xffdc78, speed: 7.6 });
      }
      if (rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(b.x, b.z, { r0: 0.5, r1: b.r * 1.25, colorHex: isNoebing ? 0x8ce8ff : 0xffd26a, coreHex: 0xfffce8, dur: 0.36 });
      triggerGroundCrackHeat(b.x, b.z, b.r * 1.4, isNoebing ? 0x8ce8ff : 0xffd26a);
    }
    const dmg = rt.CFG.boltCard.dmg || 2.2;
    const targets = rt.S.zombies.filter(z => z.alive && !z.isClone && !z.isPillar && !z.isTotem && rt.dist(z,b) <= b.r + z.r);
    const perTarget = Math.min(dmg,autoBudget()/Math.max(1,targets.length));
    if (perTarget < .001) return;
    targets.forEach(function (z) {
      if (!z.alive) return;
      hurtZombie(z, perTarget, 'bolt', rt.S.lastDash);
      rt.S.boltHits = (rt.S.boltHits || 0) + 1;
      if (z.alive && rt.S.evo && rt.S.evo.noebing) { if(z.isBoss) z.chilled=true; else z.frozen = Math.max(z.frozen || 0, rt.CFG.boltCard.freeze || 1.5); tintZombie(z); }
    });
  });
  let bw = 0;
  for (let bi = 0; bi < rt.S.bolts.length; bi++) {
    const b = rt.S.bolts[bi];
    if (!(b.done && b.t > b.delay + 0.58)) rt.S.bolts[bw++] = b;
  }
  rt.S.bolts.length = bw;
}
/* 메아리 칼: 일섬 0.5초 뒤 같은 경로에 잔영이 지나간다(피해 40/55/70%). */
function queueEcho(rec) {
  const lv = upLv('echo');
  if (!lv || !rec || !rec.segs || !rec.segs.length) return null;
  const seg = rec.segs[rec.segs.length - 1];
  if (!seg || !seg.from || !seg.to) return null;
  rt.S.echoes = rt.S.echoes || [];
  const e = { from: { x: seg.from.x, z: seg.from.z }, to: { x: seg.to.x, z: seg.to.z }, t: rt.CFG.echoCard.delay || 0.5, mul: (rt.CFG.echoCard.mul || [0.4, 0.55, 0.7])[Math.min(2, lv - 1)] };
  rt.S.echoes.push(e);
  return e;
}
function stepEchoes(dt) {
  if (!rt.S.echoes || !rt.S.echoes.length) return;
  const list = rt.S.echoes;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    e.t -= dt;
    if (e.t > 0) { list[w++] = e; continue; }
    if (Math.hypot(e.to.x - rt.S.hero.x, e.to.z - rt.S.hero.z) > rt.ringR() * 2.4) continue;
    rt.stampSkill('echo', e.to.x, e.to.z);
    const r = rt.pathR(), dmg = rt.dashDmg() * e.mul;
    rt.S.zombies.slice().forEach(function (z) {
      if (!z.alive || z.isClone || z.isPillar || z.isTotem) return;
      if (rt.segDist(z.x, z.z, e.from.x, e.from.z, e.to.x, e.to.z) > r + z.r) return;
      hurtZombie(z, dmg, 'echo', rt.S.lastDash);
    });
    if (rt.three && rt.three.vfx3d) rt.three.vfx3d.spawnInkTrail(e.from, e.to, 3);
    rt.inkFx.burst(e.to.x, e.to.z, rt.FX_COLORS.jade, { r1: 26, n: 4, dur: 0.3 });
    if (rt.S.lastDash && rt.S.lastDash.segs) rt.S.lastDash.echo = e.mul;
  }
  list.length = w;
}
/* 먹 발자국: 착지 자리에 2초 웅덩이 — 지나는 적이 느려진다. */
function dropInkStep(at) {
  const lv = upLv('inkstep');
  if (!lv || !at || !rt.S) return null;
  rt.S.inkSteps = rt.S.inkSteps || [];
  rt.S.inkSteps.push({ x: at.x, z: at.z, t: rt.CFG.inkStep.dur || 2, r: rt.CFG.inkStep.r || 1.7, slow: (rt.CFG.inkStep.slow || [0.3, 0.4, 0.5])[Math.min(2, lv - 1)] });
  if (rt.S.inkSteps.length > 14) rt.S.inkSteps.shift();
  return rt.S.inkSteps[rt.S.inkSteps.length - 1];
}
function stepInkSteps(dt) {
  if (!rt.S.inkSteps || !rt.S.inkSteps.length) return;
  rt.S.inkSteps.forEach(function (p) {
    p.t -= dt;
    if (p.t <= 0) return;
    rt.S.zombies.forEach(function (z) {
      if (!z.alive || z.isBoss || z.isClone || z.isPillar || z.isTotem) return;
      if (rt.dist(z, p) > p.r + z.r) return;
      z.slowT = Math.max(z.slowT || 0, 0.22);
      z.inkSlow = p.slow;
    });
  });
  let iw = 0;
  for (let ii = 0; ii < rt.S.inkSteps.length; ii++) {
    if (rt.S.inkSteps[ii].t > 0) rt.S.inkSteps[iw++] = rt.S.inkSteps[ii];
  }
  rt.S.inkSteps.length = iw;
}
/** 원귀가 사라지거나 상태가 끝나면 먹 발자국 감속도 함께 끝난다. */
function slowMulOf(z) {
  if (!z || !(z.slowT > 0)) return 1;
  if (z.inkSlow) return 1 - z.inkSlow;
  return rt.CFG.iceSlowMul || 0.5;
}
function gainXp(n) {
  rt.S.xp += n;
  while (rt.S.xp >= rt.xpNeed(rt.S.level)) {
    rt.S.xp -= rt.xpNeed(rt.S.level);
    rt.S.level++;
    /* §5.1 혼령 상한은 2레벨마다 +1 — 장마다 시작값 차이를 오래 남긴다. */
    if (rt.S.level % 2 === 0) rt.S.spiritCap = Math.min(rt.CFG.spiritMax || 5, (rt.S.spiritCap || rt.CFG.spiritCapStart || 3) + 1);
    openLevelUp();
  }
}
/* v0.23 카드 UI: 지금 레벨과 다음 레벨의 실제 수치를 카드에 적는다. */
function elemScale(base, step, lv) { return base + step * Math.max(0, (lv || 0) - 1); }
function fmt1(v) { return (Math.round(v * 10) / 10).toString(); }
function upDesc(u) {
  const next = upLv(u.id) + 1;
  if (u.id === 'ring') {
    const nextLv = Math.min(rt.CFG.ringLvMax || 3, upLv('ring') + 1);
    return '심안 반경 Lv' + (rt.S.ringLv || 0) + ' → Lv' + nextLv + (nextLv >= (rt.CFG.ringLvMax || 3) ? ' (최대)' : '');
  }
  if (u.id === 'ice') return '빙결 ' + fmt1(elemScale(rt.CFG.iceDur || 2.5, rt.CFG.iceDurStep || 0.5, next)) + '초 · 파열 '
    + fmt1(elemScale(rt.CFG.shatterDmg || 4, rt.CFG.shatterStep || 1, next)) + ' 피해';
  if (u.id === 'fire') return '명중 즉시 +' + rt.fireImpact(next) + ' 피해';
  if (u.id === 'poison') return '중첩 ' + Math.round(elemScale(rt.CFG.poisonMax || 5, rt.CFG.poisonMaxStep || 1, next)) + ' · 독구름 '
    + fmt1(elemScale(rt.CFG.poisonCloudR || 2, rt.CFG.cloudRStep || 0.6, next)) + 'm';
  if (u.id === 'perfect') return '정확도 ' + Math.round(((rt.CFG.perfectThresh || 0.8) - (rt.CFG.perfectThreshStep || 0.05) * (next - 1)) * 100)
    + '% 이상이면 ×' + fmt1((rt.CFG.perfectDmgMul || 1.5) + (rt.CFG.perfectStep || 0.15) * (next - 1));
  if (u.id === 'parry') return '패링 반경 ' + fmt1((rt.CFG.parryR || 2.4) + (rt.CFG.parryAwakenR || 0.45) * next) + 'm · 충격파 '
    + fmt1((rt.CFG.parryDmg || 0.5) + (rt.CFG.parryAwakenDmg || 0.4) * next) + ' · 참 +' + Math.round((rt.CFG.parryAwakenCharge || 14) * next);
  if (u.id === 'dmg') { const st = (u.steps || [1])[Math.min((u.steps || [1]).length - 1, upLv('dmg'))]; return '일섬 피해 ' + fmt1(rt.S.dashDmg) + ' → ' + fmt1(rt.S.dashDmg + st); }
  if (u.id === 'width') return '경로 폭 ' + fmt1(rt.S.pathR) + ' → ' + fmt1(rt.S.pathR + 0.55) + 'm';
  if (u.id === 'dash') return '연쇄 ' + rt.S.dashCount + ' → ' + (rt.S.dashCount + 1) + '회';
  if (u.id === 'charge') return '게이지 획득 +' + Math.round(25 * next) + '%';
  if (u.id === 'heal') return (rt.S.healMaxN || 0) < 3 ? '체력 +5 · 최대 체력 +2 (' + (rt.S.healMaxN || 0) + '/3)' : '체력 +5 (최대 체력은 3번까지)';
  if (u.id === 'ward') {
    const lv = Math.min(3, upLv('ward') + 1);
    return '부적 ' + (lv >= 3 ? (rt.CFG.ward.n3 || 4) : (rt.CFG.ward.n || 2)) + '개 · 반경 ' + fmt1(lv >= 2 ? (rt.CFG.ward.r2 || 2.6) : (rt.CFG.ward.r || 2.2)) + 'm · 접촉 ' + fmt1(rt.CFG.ward.dmg || 0.8);
  }
  if (u.id === 'bolt') {
    const lv = Math.min(rt.CFG.boltCard.lvMax || 5, upLv('bolt') + 1);
    return '주기 ' + fmt1(Math.max(2.5, (rt.CFG.boltCard.every || 4.5) - (rt.CFG.boltCard.lvStep || 0.4) * (lv - 1))) + '초 · 피해 ' + fmt1(rt.CFG.boltCard.dmg || 2.2);
  }
  if (u.id === 'echo') { const m = (rt.CFG.echoCard.mul || [0.4, 0.55, 0.7])[Math.min(2, upLv('echo'))]; return '일섬 ' + rt.CFG.echoCard.delay + '초 뒤 같은 길에 ' + Math.round(m * 100) + '% 피해'; }
  if (u.id === 'reson') { const d = (rt.CFG.resonCard.dmg || [0.5, 0.8, 1.1])[Math.min(2, upLv('reson'))]; return '방울 피해 ' + fmt1(d); }
  if (u.id === 'counter') return next >= 2 ? '정확한 패링 → 자동 일섬 피해 ×1.5 · 참 +6' : '정확한 패링 → 자동 일섬 1회';
  if (u.id === 'inkstep') { const sl = (rt.CFG.inkStep.slow || [0.3, 0.4, 0.5])[Math.min(2, upLv('inkstep'))]; return '먹 웅덩이 · 감속 ' + Math.round(sl * 100) + '% · 2초'; }
  return u.desc;
}
function upCardLevelText(u) {
  const lv = upLv(u.id);
  if (!lv) return '신규';
  return 'Lv' + lv + ' → Lv' + Math.min(u.maxLv || 99, lv + 1);
}
/* ---------- v0.31 §5.2 멈추지 않는 선택 ----------
   레벨업이 판을 멈추지 않는다. 0.3배 1.5초 + 화면 아래 카드 3장, 4초 안에 탭하면 고르고 아니면 추천이 자동 선택된다.
   보스전과 부적 상자(3연속)는 지금처럼 멈추는 창을 쓴다. 설정에서 '멈추고 고르기'로 되돌릴 수 있다. */
function rollPicks(n) { return rt.rollUpgradePicks(n, upLv, rt.elemLv, !!(rt.S && (rt.S.elemSlotN || 1) >= 2)); }
function evoParts(r) { return rt.evoPartsOf(r, upLv, rt.elemLv); }
function partLv(k) { return rt.isElemKey(k) ? rt.elemLv(k) : upLv(k); }
function cardNameOf(k) { return rt.cardNameOfKey(k); }
function evoBorn(r) { return !!(rt.S && rt.S.evo && rt.S.evo[r.key]); }
function evoMatInfo(id) { return rt.evoMatInfoFor(id, rt.S, upLv, rt.elemLv); }
function evoHints() { return rt.evoHintsFor(rt.S, upLv, rt.elemLv); }
function renderEvoHint() {
  const el = $('evoHint');
  if (!el) return;
  const hs = evoHints();
  if (!hs.length) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = '진화까지 — ' + hs.slice(0, 2).join(' · ');
}
function recommendedPick() { return rt.pickRecommendedId(rt.S && rt.S.levelPicks, rt.S, upLv, rt.elemLv); }
function closeQuickCards() {
  const wrap = $('quickCards');
  if (wrap) wrap.hidden = true;
  if (rt.S) rt.S.quick = null;
}
function tickQuick() {
  if (!rt.S || !rt.S.quick) return;
  if (rt.now() - rt.S.quick.t0 < rt.S.quick.dur) return;
  const id = recommendedPick();
  if (id) pickQuick(id, true);
  else closeQuickCards();
}
function pickQuick(id, auto) {
  if (!rt.S || !rt.S.quick) return false;
  closeQuickCards();
  applyUpgrade(id, !!auto);
  if (rt.S && rt.S._pendingLv > 0) { rt.S._pendingLv--; openLevelUp(); }
  return true;
}
function openLevelUp() {
  /* 참(斬) 연출 중에는 카드를 잠시 미룬다 — 필살의 손맛을 가리지 않도록. */
  if (rt.S && rt.S.cleaveFx > 0.05) { rt.S._cleaveLv = (rt.S._cleaveLv || 0) + 1; return; }
  if (!rt.S) return;
  rt.S.upLv = rt.S.upLv || {};
  rt.S.levelUps = (rt.S.levelUps || 0) + 1;
  if (rt.S.paused === 'levelup') { rt.S._pendingLv = (rt.S._pendingLv || 0) + 1; return; }
  rt.S.paused = 'levelup';
  rt.S.levelPicks = rollPicks(3);
  const boxEl = $('levelChoices'); boxEl.innerHTML = '';
  rt.S.levelPicks.forEach(function (u) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn up-card' + (evoMatInfo(u.id).length ? ' evo-mat' : '');
    b.dataset.up = u.id;
    const icon = (rt.art && rt.art.upIconUrl) ? rt.art.upIconUrl(u.id) : '';
    const mat = evoMatInfo(u.id);
    b.innerHTML = '<img class="up-icon" src="' + icon + '" alt="" width="34" height="34">'
      + '<span class="up-text"><strong>' + u.name + '</strong>'
      + '<span class="up-lv' + (upLv(u.id) ? '' : ' new') + '">' + upCardLevelText(u) + '</span>'
      + '<span class="up-desc">' + upDesc(u) + '</span>'
      + (mat.length ? '<span class="up-evo">진화 재료 — ' + mat.join(' · ') + '</span>' : '') + '</span>';
    b.addEventListener('click', function () { pickUpgrade(u.id); });
    boxEl.appendChild(b);
  });
  renderEvoHint();
  rt.showOv('ov-level');
  rt.telemetry.event('levelup_pause', { level: rt.S.level, picks: rt.S.levelPicks.map(function (u) { return u.id; }) });
}
const UPGRADE_FX = { dmg: 'vermilion', width: 'jade', dash: 'jade', ring: 'paper', charge: 'gold', heal: 'vermilion', perfect: 'gold', parry: 'paper', ice: 'ice', fire: 'fire', poison: 'poison', bell: 'gold', ward: 'gold', bolt: 'gold', echo: 'jade', reson: 'paper', counter: 'gold', inkstep: 'paper' };
/* The chosen upgrade stamps over the hero, and the ones that change space show the change. */
function upgradeFx(id) {
  const def = rt.RUN_UPGRADES.filter(function (u) { return u.id === id; })[0];
  const c = rt.FX_COLORS[UPGRADE_FX[id] || 'paper'];
  rt.inkFx.seal(((def && def.name) || id) + ' Lv' + ((rt.S.upLv && rt.S.upLv[id]) || 1), c);
  if (id === 'width') {
    const d = rt.S.lastDash && rt.S.lastDash.segs && rt.S.lastDash.segs.length ? rt.S.lastDash.segs[rt.S.lastDash.segs.length - 1] : null;
    let dx = 1, dz = -1;
    if (d && d.to && d.from) { dx = d.to.x - d.from.x; dz = d.to.z - d.from.z; }
    const L = Math.hypot(dx, dz) || 1;
    rt.inkFx.band({ x: dx / L, z: dz / L }, rt.pathR(), rt.ringR() * 1.3, c);
  } else if (id === 'ring') rt.inkFx.ring(rt.ringR(), c, 1.0);
  else if (id === 'dash' || id === 'ice' || id === 'fire' || id === 'poison') rt.inkFx.ring(2.2, c, 0.7);
}
function pickUpgrade(id) {
  if (!rt.S || rt.S.paused !== 'levelup') return false;
  rt.hideOvs(); rt.S.paused = null;
  applyUpgrade(id, false);
  if (rt.S._pendingLv) { rt.S._pendingLv--; openLevelUp(); }
  else rt.S.forcePauseLv = false;
  return true;
}
/* 카드 하나를 실제로 적용한다 — 멈추는 창과 멈추지 않는 선택이 같은 길을 쓴다. */
function applyUpgrade(id, auto) {
  if (!rt.S) return false;
  rt.S.upLv = rt.S.upLv || {};
  const def = rt.RUN_UPGRADES.filter(function (u) { return u.id === id; })[0];
  if (!def || (rt.S.upLv[id] || 0) >= (def.maxLv || 99)) return false;
  rt.S.upLv[id] = (rt.S.upLv[id] || 0) + 1;
  /* §13 데이터: 제시 3장·고른 카드·레벨 — 카드 선택률(밸런스)을 나중에 잴 수 있게. */
  rt.telemetry.event('card_pick', {
    offered: (rt.S.levelPicks || []).map(function (u) { return u.id; }), picked: id, lv: rt.S.upLv[id], auto: !!auto
  });
  if (id === 'dmg') {
    /* §5.1 체감식: +1, +0.8, +0.6, +0.5, 이후 +0.4 */
    const steps = def.steps || [1];
    rt.S.dashDmg = Math.round((rt.S.dashDmg + steps[Math.min(steps.length - 1, rt.S.upLv[id] - 1)]) * 100) / 100;
  }
  else if (id === 'width') rt.S.pathR += 0.55;
  else if (id === 'dash') rt.S.dashCount += 1;
  else if (id === 'ring') { rt.S.ringLv = Math.min(rt.CFG.ringLvMax || 3, (rt.S.ringLv || 0) + 1); rt.applyRingBoost(); }
  else if (id === 'heal') {
    /* §5.1 최대 체력 +2는 3번까지, 그 뒤는 회복만 */
    if ((rt.S.healMaxN || 0) < 3) { rt.S.runHp += 2; rt.S.healMaxN = (rt.S.healMaxN || 0) + 1; }
    rt.S.hp = Math.min(rt.maxHp(), rt.S.hp + 5);
  }
  else if (id === 'ice' || id === 'fire' || id === 'poison') {
    /* v0.23 원소 각인: 처음 고르면 원소 장착, 다시 고르면 Lv2·Lv3으로 수치가 실제로 오른다. */
    rt.S.elemLv = rt.S.elemLv || {};
    rt.S.elemLv[id] = Math.min(rt.CFG.elemLvMax || 3, (rt.S.elemLv[id] || 0) + 1);
    rt.setDashElem(id);
    /* §5.4 두 번째 원소 칸: 한 각인이 Lv2가 되면 열리고, 일섬마다 두 원소가 번갈아 실린다. */
    rt.refreshElemSlots();
    rt.toast(rt.elemNameOf(id) + ' 각인 Lv' + rt.S.elemLv[id] + ((rt.S.elemSlots || []).length >= 2 ? ' — 두 원소 교대' : ''));
  }
  else if (id === 'perfect') { rt.toast('정확한 획 Lv' + rt.S.upLv.perfect); }
  else if (id === 'parry') { rt.toast('칼집 각성 Lv' + rt.S.upLv.parry); }
  /* v0.98: 삭제된 구 카드(bell, magnet) 분기 정리 */
  else if (id === 'charge') rt.S.chargeLv = (rt.S.chargeLv || 0) + 1;
  else if (id === 'ward') { rt.S.wardSpin = rt.S.wardSpin || 0; rt.showJudge('회전 호신부 Lv' + rt.S.upLv.ward); }
  else if (id === 'bolt') { rt.S.boltT = boltPeriod(); rt.showJudge('벼락부적 Lv' + rt.S.upLv.bolt); }
  else if (id === 'echo') { rt.toast('메아리 칼 Lv' + rt.S.upLv.echo); }
  else if (id === 'reson') { rt.toast('방울 공명 Lv' + rt.S.upLv.reson); }
  else if (id === 'counter') { rt.toast('칼집 반격 Lv' + rt.S.upLv.counter); }
  else if (id === 'inkstep') { rt.toast('먹 발자국 Lv' + rt.S.upLv.inkstep); }
  upgradeFx(id);
  rt.renderHud();
  checkEvolutions();
  return true;
}

/* 보스 돌진 예고(walk → telegraph → charge → stun) 상태기계. 이동을 직접 처리했으면 true.
   스테이지가 오르면 예고가 짧아지고 돌진이 빨라지며, 뒤로 갈수록 경직 뒤에 잔몹을 부른다. */
/** The stage's boss timings (seconds) and charge speed (m/s), with the shared defaults. */
function bossTiming() {
  const B = (rt.S && rt.S.stage && rt.S.stage.boss) || {};
  return {
    walkT: B.walk != null ? B.walk : 4.5,
    teleT: B.telegraph != null ? B.telegraph : 1.1,
    chargeSp: B.charge != null ? B.charge : 20,
    chargeT: B.chargeDur != null ? B.chargeDur : 0.45,
    stunT: B.stun != null ? B.stun : 1.2
  };
}
  return { addCharge, addHitstop, afterimages, applyElement, applyPath, applyUpgrade, autoShare, boltPeriod, bossTiming, cardNameOf, castCleave, checkEvolutions, closeQuickCards, collectItem, cutBoss, destroySpirit, doParry, dropInkStep, evoHints, evoMatInfo, fireLanding, fireWave, frostLanding, gainXp, gapInfo, hurtZombie, incomingParryThreat, killZombie, magnetPull, makeBossSlash, makeSlash, openLevelUp, otherShape, pickQuick, pickUpgrade, preciseTarget, queueEcho, recommendedPick, slowMulOf, spawnEliteEvent, stepBolt, stepBolts, stepDying, stepEchoes, stepInkSteps, stepWard, tickQuick, tickStatuses, tintZombie, triggerGroundCrackHeat, upCardLevelText, upDesc, upLv, wardInfo };
}
