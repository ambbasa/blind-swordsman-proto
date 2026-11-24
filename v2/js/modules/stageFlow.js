/* v2/js/modules/stageFlow.js — 심안: 묵검 v1.26 스테이지 진입·스폰·결계·예열·타이틀 UI 흐름 */

export function createStageFlow(rt) {
  const $ = rt.$;
function startRun(opts) {
  const _tRun = performance.now();
  opts = opts || {};
  /* QA sandbox도 장을 지정할 수 있다(v0.32 지형·보스 검증). 지정이 없으면 1장. */
  const stageNo = rt.clamp((opts.stage != null ? opts.stage : (opts.sandbox ? 1 : (rt.save.stage || 1))) | 0, 1, rt.STAGES.length);
  const st = rt.stageOf(stageNo);
  rt.hideOvs();
  rt.closeQuickCards();
  clearEntities();
  if (rt.audio && rt.audio.setBossMode) rt.audio.setBossMode(false);
  /* 판 모드는 타이틀에서 고른 save.mode를 따른다(이전 판의 S.mode에 묶이지 않게). */
  const runMode = rt.modeOf(rt.save.mode || 'jeongseok').id;
  /* 소개 카드를 거치지 않고 바로 시작하는 경로(QA·다시 버튼)도 예열은 반드시 거친다.
     다만 QA에서 소프트웨어 GL이라 셰이더 컴파일이 분 단위가 되는 환경이면 qa.skipWarm으로 빠진다. */
  if (!rt.qa.skipWarm && !rt.shadersWarmed()) warmShaders();
  const _curAct = rt.actOf(stageNo);
  rt.hudCtrl.syncActTheme(_curAct);
  rt.preloadMonsterGlb(_curAct >= 2 && _curAct <= 4 ? ('boss_act' + _curAct) : 'boss');
  rt.S = rt.createRunState({
    opts,
    stageNo,
    st,
    runMode,
    mapId: rt.mapIdOf(opts.stage != null ? opts : Object.assign({}, opts, { stage: stageNo })),
    cfg: rt.CFG,
    save: rt.save,
    shapeUnlock: rt.SHAPE_UNLOCK,
    createInputQueue: rt.createInputQueue,
    createDashLatencyTracker: rt.createDashLatencyTracker,
    modeOf: rt.modeOf
  });
  rt.terrainInit();
  rt.S.runNo = opts.sandbox ? rt.SHAPE_UNLOCK.length : stageNo;
  rt.S.pool = opts.sandbox ? rt.SHAPE_UNLOCK.slice() : (st.shapes || rt.SHAPE_UNLOCK.slice()).slice();
  rt.initGoal(st, opts);
  if (opts.challenge) rt.initChallenge(opts.challenge, stageNo);
  /* §7.2·§7.3: 이 판의 예고 배율(모드 × 연패 보정)과 판 시작 도움. */
  rt.S.mode = runMode;
  rt.S.streak = opts.sandbox ? 0 : rt.streakOf(stageNo);
  rt.S.teleMul = rt.modeOf(runMode).tele;
  rt.S.help = [];
  if (!opts.sandbox && rt.S.mode !== 'gosu' && rt.S.streak >= 2) {
    rt.S.charge = Math.min(rt.CFG.cleaveCharge || 100, rt.CFG.help2Charge || 30);
    rt.S.help.push('판 시작 참 +' + Math.round(rt.S.charge));
  }
  if (!opts.sandbox && rt.S.mode !== 'gosu' && rt.S.streak >= 3) {
    rt.S.teleMul *= rt.CFG.help3Tele || 1.1;
    rt.S.help.push('예고 +10%');
  }
  if (!opts.sandbox && rt.S.mode !== 'gosu' && rt.S.streak >= (rt.CFG.helpOfferAt || 4)) rt.S.help.push('수련 모드 권유');
  /* §9.4 연꽃 등: 판 시작 참 +30 */
  /* v0.98: 삭제된 구 유물(lantern) 잔여 분기 정리 */
  if (rt.S.help.length) rt.telemetry.event('stage_help', { stage: stageNo, streak: rt.S.streak, help: rt.S.help.slice() });
  /* §8.2 새 무늬: 이 장에서 처음 보는 무늬라면 첫 혼령에 0.8초 유도 획. */
  if (!opts.sandbox) {
    const ns = rt.S.pool[rt.S.pool.length - 1];
    if (ns && !rt.seen('shape:' + ns)) {
      rt.markSeen('shape:' + ns);
      rt.S.newShape = { shape: ns, guide: 0, need: 1, t0: rt.S.elapsed };
    }
  }
  /* §13 데이터: 판 시작(장·모드·판 번호). 기기 안에만 쌓인다. */
  rt.telemetry.event('stage_start', { stage: opts.sandbox ? 0 : stageNo, mode: rt.S.mode, run: opts.sandbox ? 0 : (rt.save.runs || 0) + 1, sandbox: !!opts.sandbox, streak: rt.S.streak, help: rt.S.help.slice() });
  if (!opts.sandbox) {
    /* 스테이지의 새 획을 먼저 연습할 시간을 준다(첫 10초는 잔몹 상한 2). */
    rt.S.practiceShape = rt.S.pool[rt.S.pool.length - 1];
    rt.S.practiceT = rt.CFG.practiceSec;
    rt.S.practiceSpawns = rt.CFG.practiceSpawns;
    if (!opts.replay) rt.save.runs = (rt.save.runs || 0) + 1;
    rt.persist();
  }
  const appEl = $('app');
  if (appEl) {
    appEl.classList.remove('ink-burst');
    appEl.classList.remove('hurt');
    appEl.style.removeProperty('--hero-x');
    appEl.style.removeProperty('--hero-y');
    rt.clearOnebell(true);
  }
  if (rt.three && rt.three.map && (rt.three.map.id !== rt.S.mapId || rt.three.map.stageId !== rt.S.mapStage)) {
    rt.switchMap(rt.S.mapId, rt.S.mapStage);
    /* v0.64: 새 스테이지의 arena.props 확정 직후 terrain3d를 재빌드해 중복·겹침을 완전 차단 */
    rt.rebuildTerrain3D();
  }
  else rt.applyFxinkAtmo(rt.S.mapId);
  if (rt.three && rt.three.atmo) rt.three.atmo.setCenter(0, 6, 0);
  rt.applyStageAtmo(st);
  if (rt.three && rt.three.scene) {
    if (rt.three.heroSpr) { rt.three.scene.remove(rt.three.heroSpr); }
    rt.three.heroSpr = rt.addEntityVisual('hero');
    rt.placeGroup(rt.three.heroSpr, 0, 0);
    rt.syncHeroCosmetic3D();
    rt.three.camera.position.set(rt.CFG.camOff.x, rt.CFG.camOff.y, rt.CFG.camOff.z);
    rt.three.camera.lookAt(0, rt.CFG.camLookY, 0);
  }
  rt.applyCameraLens();
  applyRingBoost();
  closeArena(true);
  if (rt.three && rt.three.chunks) { const _tc = performance.now(); rt.three.chunks.reset(0, 0); rt.perfMark('chunksReset', performance.now() - _tc, { stage: stageNo }); }
  rt.renderHud();
  rt.lastTs = 0;
  if (rt.audio) { rt.audio.setQuiet(rt.qa.mute, rt.qa.noDelay); rt.audio.startBgm(); }
  if (!opts.sandbox) {
    spawnOpening();
    snapSpiritsToTargets();
  }
  rt.triggerSightWave();
  rt.hideGuide();
  const btnSkip = $('btnSkip');
  if (btnSkip) btnSkip.hidden = true;
  /* §8.1: 1장 첫 진입(또는 타이틀 "수련" 다시 보기)에만 3단 몸통 튜토리얼. */
  const wantTut = !opts.sandbox && (opts.replay || (stageNo === 1 && !rt.save.tutorialDone));
  if (wantTut) rt.startTutorial(!!opts.replay);
  if (rt.three) { rt.three.camera.position.set(rt.CFG.camOff.x, rt.CFG.camOff.y, rt.CFG.camOff.z); }
  if (!opts.sandbox) {
    if (wantTut) {
      /* 튜토리얼은 화면당 6자 이내 문구만 — 설명창 없이 몸으로 익힌다. */
      rt.showGuide('그어 보세요', 6);
    } else {
      /* 첫 진입 안내: 이 판에서 무엇을 그려야 하는지 한 줄. 조작을 막지 않는다. */
      const sh = rt.S.practiceShape || (rt.S.pool && rt.S.pool[0]) || 'hline';
      const hint = rt.SHAPE_HINT[sh] || '혼령의 종 모양을 따라 그어 보세요';
      rt.showGuide('<b>' + (rt.SHAPE_MARK[sh] || '') + '</b> ' + hint + ' — 그으면 일섬', stageNo === 1 ? 7 : 5);
    }
  }
  if (!rt.raf) rt.loop(rt.now());
  rt.syncHeroWeaponCosmetic();
  rt.perfMark('startRun', performance.now() - _tRun, { stage: stageNo });
}

function clearEntities() {
  if (!rt.S || !rt.three) return;
  function rm(list, dispose) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.obj) continue;
      if (dispose && rt.art && rt.art.disposeChar) rt.art.disposeChar(e.obj);
      rt.three.scene.remove(e.obj);
    }
  }
  rm(rt.S.spirits || [], false); rm(rt.S.zombies || [], true); rm(rt.S.items || [], false);
  const dying = rt.three.dying || [];
  for (let i = 0; i < dying.length; i++) {
    const d = dying[i];
    if (d && d.obj) {
      if (rt.art && rt.art.disposeChar) rt.art.disposeChar(d.obj);
      rt.three.scene.remove(d.obj);
    }
  }
  rt.three.dying = [];
  rt.inkFx.clear();
  if (rt.three && rt.three.vfx3d) rt.three.vfx3d.clear();
  rt.bossFx.clear();
  (rt.three.fx || []).forEach(function (f) { rt.three.scene.remove(f.mesh); });
  rt.three.fx = [];
  if (rt.three.ink && rt.three.ink.clear) rt.three.ink.clear();
  if (rt.three.paper && rt.three.paper.clear) rt.three.paper.clear();
  if (rt.three.traces && rt.three.traces.clear) rt.three.traces.clear();
  (rt.three.slashes || []).forEach(function (s) {
    if (s.mesh) rt.three.scene.remove(s.mesh);
    if (s.dispose) s.dispose();
  });
  rt.three.slashes = [];
  (rt.S.shots || []).forEach(function (sh) { if (sh.mesh) rt.three.scene.remove(sh.mesh); });
  (rt.S.hazards || []).forEach(function (h) { if (h.mesh) rt.three.scene.remove(h.mesh); });
  (rt.S.reflects || []).forEach(function (r) { if (r.mesh) rt.three.scene.remove(r.mesh); });
  rt.S.shots = []; rt.S.hazards = []; rt.S.reflects = [];
}

/* v0.43 최적화: 한 프레임에 여러 번 불려도 배열을 한 번만 만든다(프레임 번호로 캐시).
   혼령은 프레임 중에 늘거나 줄지 않으므로 같은 프레임이면 같은 결과다. */
let _lmList = [];
function livingMarks() {
  /* v0.43: 매번 새 배열을 만들지 않고 하나를 재사용한다(읽기 전용으로만 쓴다). */
  if (!rt.S) return _lmList;
  const sp = rt.S.spirits || [];
  let n = 0;
  for (let i = 0; i < sp.length; i++) if (sp[i] && sp[i].alive) _lmList[n++] = sp[i];
  _lmList.length = n;
  return _lmList;
}
function refreshSpirits() {
  return livingMarks();
}
function worldPerCss() {
  if (!rt.S || !rt.S.hero || !rt.three || !rt.three.camera) return 50;
  const a = projectXZ(rt.S.hero.x, rt.S.hero.z, 0.2);
  const bx = projectXZ(rt.S.hero.x + 1, rt.S.hero.z, 0.2);
  const bz = projectXZ(rt.S.hero.x, rt.S.hero.z + 1, 0.2);
  const sx = Math.hypot(bx.x - a.x, bx.y - a.y);
  const sz = Math.hypot(bz.x - a.x, bz.y - a.y);
  return Math.max(8, (sx + sz) * 0.5);
}
function groundCirclePts(R, y0) {
  const pts = [];
  if (!rt.S || !rt.S.hero) return pts;
  const n = 64;
  y0 = y0 == null ? 0 : y0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(projectXZ(rt.S.hero.x + Math.cos(a) * R, rt.S.hero.z + Math.sin(a) * R, y0));
  }
  return pts;
}
function groundCircleWidth(R, y0) {
  const pts = groundCirclePts(R, y0);
  let minX = 1e9, maxX = -1e9;
  pts.forEach(function (p) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; });
  return Math.max(0, maxX - minX);
}
function fitGroundRingR() {
  if (!rt.S || !rt.S.hero || !rt.three || !rt.three.camera) return 3.2;
  /* project() reads matrixWorldInverse, which is stale until the next render after the camera moves. */
  rt.three.camera.updateMatrixWorld();
  const target = screenRingPx() * 2;
  let lo = 1.2, hi = 12;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (groundCircleWidth(mid, 0) < target) lo = mid; else hi = mid;
  }
  return Math.max(1.4, hi);
}
function baseRingR() { return fitGroundRingR(); }
function ringR() {
  const base = (rt.S && rt.S.ringR > 0) ? rt.S.ringR : baseRingR();
  /* §6.1 5장 짙은 안개 띠: 원 반경이 10초 주기로 ±8% 숨쉰다. §9.4 안개 바늘: −10% */
  const k = (rt.S && rt.S.terrain && rt.S.terrain.ringMul) || 1;
  const gk = (rt.S && rt.S.goal && rt.S.goal.ringMul) || 1;
  return base * k * gk * (rt.relicOn(rt.save, 'needle') ? 0.9 : 1);
}
function applyRingBoost() {
  if (!rt.S) return ringR();
  rt.S.ringPx = screenRingPx();
  rt.S.ringR = fitGroundRingR();
  refreshRingPoly();
  return rt.S.ringR;
}
function refreshRingPoly(force) {
  if (!rt.S) return [];
  const h = rt.S.hero || { x: 0, z: 0 };
  const R = ringR();
  const cam = rt.three && rt.three.camera;
  const key = (h.x || 0).toFixed(3) + ',' + (h.z || 0).toFixed(3) + ',' + (R || 0).toFixed(3)
    + ',' + (cam ? cam.fov : 0) + ',' + (typeof innerWidth === 'number' ? innerWidth : 0)
    + ',' + (cam ? cam.position.x.toFixed(2) + ',' + cam.position.z.toFixed(2) : '');
  if (!force && rt.S.ringPoly && rt.S.ringPoly.length && rt.S._ringKey === key) return rt.S.ringPoly;
  rt.S._ringKey = key;
  rt.S.ringPoly = groundCirclePts(R, 0);
  return rt.S.ringPoly;
}
function ringScreenPts() {
  if (rt.S && rt.S.ringPoly && rt.S.ringPoly.length) return rt.S.ringPoly;
  return refreshRingPoly();
}
function distToSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const t = rt.clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1), 0, 1);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
function rimErrorPx(sx, sy) {
  const pts = ringScreenPts();
  if (!pts || pts.length < 2) return 999;
  let best = 1e9;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const d = distToSeg(sx, sy, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
}
function ellipseScreenAt(theta, from) {
  from = from || heroScreen();
  if (!rt.S || !rt.S.hero) return { x: from.x, y: from.y, t: 0 };
  const R = ringR();
  const ux = Math.cos(theta || 0), uy = Math.sin(theta || 0);
  function worldD(t) {
    const p = unprojectToY(from.x + ux * t, from.y + uy * t, 0);
    return rt.dist(p, rt.S.hero);
  }
  let lo = 0, hi = Math.max(48, (rt.S.ringPx || 80));
  while (worldD(hi) < R && hi < 900) hi *= 1.5;
  if (worldD(hi) < R) {
    /* Fallback: nearest screen-angle point on the projected ground circle. */
    const pts = ringScreenPts();
    let best = pts[0] || from, bestD = 1e9;
    pts.forEach(function (p) {
      const d = Math.abs(angDiff(theta, screenAngleTo(p.x, p.y, from)));
      if (d < bestD) { bestD = d; best = p; }
    });
    return { x: best.x, y: best.y, t: Math.hypot(best.x - from.x, best.y - from.y) };
  }
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (worldD(mid) < R) lo = mid; else hi = mid;
  }
  return { x: from.x + ux * hi, y: from.y + uy * hi, t: hi };
}
function bellFootY(s) {
  const ud = s && s.obj && s.obj.userData;
  if (ud && ud.bellFootY != null) return ud.bellFootY;
  const bh = (ud && ud.bellH) != null ? ud.bellH : 0.4;
  if (ud && ud.bellAttachY != null) return ud.bellAttachY - bh;
  const off = (ud && ud.bellLocal) || { y: 1 };
  return Math.max(0.02, (off.y || 1) - bh * 0.15);
}
function bellFootScreen(s) {
  const y = bellFootY(s);
  const offx = (s && s.obj && s.obj.userData && s.obj.userData.bellLocal && s.obj.userData.bellLocal.x) || 0;
  return projectXZ((s && s.x || 0) + offx, s && s.z || 0, y);
}
function angNorm(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function angDiff(a, b) { return angNorm(b - a); }
function angStep(a, b, maxStep) {
  const d = angDiff(a, b);
  if (Math.abs(d) <= maxStep) return angNorm(a + d);
  return angNorm(a + (d < 0 ? -1 : 1) * maxStep);
}
function angleOf(x, z, from) {
  from = from || (rt.S && rt.S.hero) || { x: 0, z: 0 };
  return Math.atan2((x - from.x), (z - from.z));
}
function placeSpiritOnRing(s) {
  if (!rt.S || !s) return;
  if (!(rt.S.ringR > 0)) applyRingBoost();
  else refreshRingPoly();
  const h = heroScreen();
  const ang = (s.angle || 0) + (s.avoid || 0);
  const sp = ellipseScreenAt(ang, h);
  const offx = (s.obj && s.obj.userData && s.obj.userData.bellLocal && s.obj.userData.bellLocal.x) || 0;
  const p = unprojectToY(sp.x, sp.y, bellFootY(s));
  s.x = p.x - offx;
  s.z = p.z;
  if (s.obj) rt.placeGroup(s.obj, s.x, s.z, 0);
}
function screenOf(ent) {
  const y = (ent.obj && ent.obj.position && ent.obj.position.y) || 0.8;
  const off = (ent.obj && ent.obj.userData && ent.obj.userData.bellLocal) || { x: 0, y: 1.2 };
  return projectXZ(ent.x + (off.x || 0), ent.z, y + (off.y || 0));
}
function isOnScreen(ent, margin) {
  const r = hostRect();
  const p = screenOf(ent);
  const m = margin == null ? 20 : margin;
  return !(p.x < -m || p.y < -m || p.x > r.width + m || p.y > r.height + m);
}
/* 프레임당 한 번만 레이아웃을 읽는다 — 이제 viewBox 캐시를 그대로 쓴다(창 크기가 바뀔 때만 잰다). */
let _rectCache = { id: -1, r: null };
function hostRect() { return viewBox(); }
const _ltList = [], _stList = [];
function livingThreats() {
  if (!rt.S) { _ltList.length = 0; return _ltList; }
  const zs = rt.S.zombies || [];
  let n = 0;
  for (let i = 0; i < zs.length; i++) { const z = zs[i]; if (z && z.alive && !z.hidden) _ltList[n++] = z; }
  _ltList.length = n;
  return _ltList;
}
/* 화면 안 + 반경 2R 이내의 살아 있는 귀물 — 화면 밖 혼령을 놓을 대상을 고를 때 쓴다. */
function screenThreats() {
  if (!rt.S) { _stList.length = 0; return _stList; }
  const lt = livingThreats(), maxD = ringR() * 2;
  let n = 0;
  for (let i = 0; i < lt.length; i++) { const z = lt[i]; if (isOnScreen(z, 40) && rt.dist(z, rt.S.hero) <= maxD) _stList[n++] = z; }
  _stList.length = n;
  return _stList;
}
/* 0초 오프닝: 심안 원 안쪽에 귀물을 각도 분산 배치해 첫 획부터 방향 선택이 성립한다. */
function spawnOpening() {
  if (!rt.S) return;
  const R = ringR();
  const op = (rt.S.stage && rt.S.stage.opening) || {};
  const n = op.n != null ? op.n : (rt.CFG.openingZombies || 0);
  const ring = op.ring || rt.CFG.openingRing || [0.5, 0.8];
  const brutes = op.brute != null ? op.brute : 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
    const rr = R * (ring[0] + Math.random() * (ring[1] - ring[0]));
    const isBrute = i >= n - brutes;
    spawnZombie({
      x: rt.S.hero.x + Math.cos(a) * rr,
      z: rt.S.hero.z + Math.sin(a) * rr,
      type: isBrute ? 'brute' : 'imp'
    });
  }
  seedOpeningSpirits();
}
/** 시작 혼령을 각도가 고른 방향에 미리 묶어 둔다 — 1개면 최근접, 3개 이상이면 등간격. */
function seedOpeningSpirits() {
  if (!rt.S) return;
  const cap = Math.min(rt.CFG.spiritMax || 5, rt.S.spiritCap || rt.CFG.spiritCapStart || 1);
  const zs = rt.S.zombies.filter(function (z) { return z.alive; });
  if (!zs.length || cap <= 0) return;
  /* 오프닝 스폰이 이미 최근접 위주로 묶어 둔 혼령은 풀고, 고른 방향으로 다시 묶는다. */
  livingMarks().forEach(function (s) { rt.destroySpirit(s); });
  if (cap === 1) {
    const near = rt.nearestTo(zs, rt.S.hero);
    if (near) {
      const sp = spawnSpirit({ x: near.x, z: near.z, target: near });
      if (sp) { sp.age = rt.CFG.spiritFadeIn || 0.4; setSpiritAlpha(sp); }
    }
    return;
  }
  const sorted = zs.map(function (z) { return { z: z, a: angNorm(angleOf(z.x, z.z, rt.S.hero)) }; });
  sorted.sort(function (p, q) { return p.a - q.a; });
  const step = sorted.length / cap;
  for (let i = 0; i < cap; i++) {
    const pick = sorted[Math.floor(i * step) % sorted.length];
    const sp = spawnSpirit({ x: pick.z.x, z: pick.z.z, target: pick.z });
    if (sp) { sp.age = rt.CFG.spiritFadeIn || 0.4; setSpiritAlpha(sp); }
  }
}
/* 혼령을 놓아준다: 대상 사망이 아니라 거리·화면 조건으로 회수될 때. 요령 소리가 짧게 끊긴다. */
function releaseSpirit(s) {
  if (!s || s.kind !== 'spirit' || !s.alive) return;
  if (rt.audio && !rt.qa.mute) {
    const w = viewBox().width;
    const scr = screenOf(s);
    const pan = rt.clamp((scr.x / Math.max(1, w)) * 2 - 1, -1, 1);
    if (rt.audio.bellCut) rt.audio.bellCut(pan, spiritShape(s));
    else rt.audio.bell(pan, spiritShape(s));
  }
  if (rt.art && rt.art.playFx && rt.three) {
    const fx = rt.art.playFx(rt.three.scene, 'ink-splat', s.x, s.z, 0.9);
    if (fx) rt.three.fx.push(fx);
  }
  rt.destroySpirit(s);
}
/* A spirit stays on its zombie until that zombie dies. A free slot (under the cap) goes to the
   nearest zombie inside the mind's-eye ring that has no spirit yet, the boss first. */
const _astHeld = new Set(), _astPool = [], _astOnPool = [];
function assignSpiritTargets() {
  if (!rt.S) return;
  const R = rt.arenaActive() ? rt.arenaR()+rt.dist(rt.S.hero,rt.S.arena)+1 : ringR();
  const capBase = Math.min(rt.CFG.spiritMax || 5, rt.S.spiritCap || rt.CFG.spiritCapStart || 3);
  let extraCap = 0;
  const zsAll = rt.S.zombies || [];
  for (let i = 0; i < zsAll.length; i++) { const z = zsAll[i]; if (z && z.alive && (z.isClone || z.isPillar)) extraCap++; }
  /* 보스전에는 보스와 소환 잡귀 모두에 혼령이 붙어야 피할 곳이 생긴다. */
  const cap = ((rt.S.boss && rt.S.boss.alive) ? Math.max(capBase, 1 + ((rt.CFG.bossPat || {}).summon || {}).keep || 0) : capBase) + extraCap;
  const outR = R * (rt.CFG.spiritReleaseMul || 1.15);
  const inR = R * (rt.CFG.spiritAcquireMul || 1.02);
  /* 1) 대상이 죽었거나 안개 밖(1.15R)으로 벗어난 혼령은 즉시 회수한다. */
  const lm1 = livingMarks();
  for (let i = lm1.length - 1; i >= 0; i--) {
    const s = lm1[i];
    if (s.free) continue;
    if (!s.target || !s.target.alive) { rt.destroySpirit(s); continue; }
    if (rt.cloneHeld(s)) continue;
    if (rt.dist(s.target, rt.S.hero) > outR * (s.far ? 1.9 : 1)) releaseSpirit(s);
  }
  /* 2) 화면 밖으로 나간 대상은 '화면 안 대체 대상'이 있을 때만 회수한다(획득-회수 진동 방지). */
  _astHeld.clear();
  const lm2 = livingMarks();
  for (let i = 0; i < lm2.length; i++) { const s = lm2[i]; if (!s.free && s.target && s.target.alive) _astHeld.add(s.target); }
  let hasOnFree = false;
  const stList = screenThreats();
  for (let i = 0; i < stList.length; i++) { if (stList[i].alive && !_astHeld.has(stList[i])) { hasOnFree = true; break; } }
  if (hasOnFree) {
    for (let i = lm2.length - 1; i >= 0; i--) {
      const s = lm2[i];
      if (s.free || !s.target || !s.target.alive || rt.cloneHeld(s)) continue;
      if (!isOnScreen(s.target, 40)) releaseSpirit(s);
    }
  }
  _astHeld.clear();
  let boundCount = 0;
  const lm3 = livingMarks();
  for (let i = 0; i < lm3.length; i++) {
    const s = lm3[i];
    if (!s.free) { boundCount++; if (s.target) _astHeld.add(s.target); }
  }
  let room = cap - boundCount;
  if (room <= 0) { bossClaimsSpirit(); return; }
  _astPool.length = 0; _astOnPool.length = 0;
  const lt = livingThreats();
  for (let i = 0; i < lt.length; i++) {
    const z = lt[i];
    if (_astHeld.has(z) || rt.dist(z, rt.S.hero) >= inR) continue;
    _astPool.push(z);
    if (isOnScreen(z, 40)) _astOnPool.push(z);
  }
  const use = _astOnPool.length ? _astOnPool : _astPool;
  use.sort(function (a, b) {
    if (a.isBoss && !b.isBoss) return -1;
    if (b.isBoss && !a.isBoss) return 1;
    return rt.dist(a, rt.S.hero) - rt.dist(b, rt.S.hero);
  });
  for (let i = 0; i < use.length && room > 0; i++, room--) spawnSpirit({ x: use[i].x, z: use[i].z, target: use[i] });
  bossClaimsSpirit();
  ensureMarks();
}
/* 심안 안에 그을 혼령이 하나도 없으면(떼를 다 벨고 다음 무리가 아직 먼 순간) 가장 가까운 귀물을 붙잡아 준다.
   '그을 게 없는' 빈 화면이 길게 이어지는 것을 막는다. */
function ensureMarks() {
  if (!rt.S || rt.S.sandbox || !rt.S.playing) return;
  if (livingMarks().length) return;
  if ((rt.S.noMarkT || 0) < 0.6) return;
  const zs = livingThreats().filter(function (z) { return z.alive && rt.dist(z, rt.S.hero) < ringR() * 2.6; });
  if (!zs.length) return;
  zs.sort(function (a, b) { return rt.dist(a, rt.S.hero) - rt.dist(b, rt.S.hero); });
  const s = spawnSpirit({ x: zs[0].x, z: zs[0].z, target: zs[0] });
  if (s) s.far = true;
}
/* 보스는 혼령 한을 반드시 차지한다 — 잔몹이 슬롯을 다 먹어도 순서를 읽을 수 있게. */
function bossClaimsSpirit() {
  const boss = rt.S && rt.S.boss;
  if (!boss || !boss.alive || boss.hidden) return;
  /* 심안 밖의 보스에게 혼령을 붙이면 매 프레임 회수-재할당이 반복된다. */
  if (rt.dist(boss, rt.S.hero) > ringR() * (rt.CFG.spiritAcquireMul || 1.02)) return;
  const ms = livingMarks();
  if (ms.some(function (s) { return s.target === boss; })) return;
  const cand = ms.filter(function (s) { return !s.free && s.target && s.target.alive && !s.target.isBoss; });
  if (cand.length) {
    /* 영웅에서 가장 먼 잔몹의 혼령을 보스에게 옮긴다. */
    cand.sort(function (a, b) { return rt.dist(b.target, rt.S.hero) - rt.dist(a.target, rt.S.hero); });
    const s = cand[0];
    s.target = boss;
    s.x = boss.x; s.z = boss.z;
    if (rt.art && rt.art.setSpiritShape) rt.art.setSpiritShape(s.obj, spiritShape(s));
    rt.ringSpiritBell(s);
    return;
  }
  if (ms.length < (rt.CFG.spiritMax || 5)) spawnSpirit({ x: boss.x, z: boss.z, target: boss });
}
function zombieScreenBody(z) {
  const top = projectXZ(z.x, z.z, 1.45);
  const bot = projectXZ(z.x, z.z, 0);
  return {
    x: (top.x + bot.x) * 0.5,
    y: (top.y + bot.y) * 0.5,
    r: Math.max(16, Math.hypot(top.x - bot.x, top.y - bot.y) * 0.42)
  };
}
function spiritAvoidWant(s) {
  if (!rt.S || !s) return 0;
  const hs = heroScreen();
  const R = ringR();
  const px = (rt.S.ringPx > 0) ? rt.S.ringPx : screenRingPx();
  if (!(R > 0.5) || !(px > 8)) return 0;
  const base = s.angle || 0;
  const on = ellipseScreenAt(base, hs);
  const sx = on.x, sy = on.y;
  const sprR = 18;
  const cap = rt.CFG.spiritAvoidMax || 0.30;
  let push = 0;
  livingThreats().forEach(function (z) {
    /* Inside the ground-circle orbit, not merely standing just outside the rim. */
    if (rt.dist(z, rt.S.hero) >= R - 0.12) return;
    const zb = zombieScreenBody(z);
    const d = Math.hypot(zb.x - sx, zb.y - sy);
    const need = sprR + zb.r + 6;
    if (d >= need) return;
    const zAng = screenAngleTo(zb.x, zb.y, hs);
    let side = -Math.sign(angDiff(base, zAng));
    if (!side) side = (s.id % 2) ? 1 : -1;
    const ang = rt.clamp((need - d) / Math.max(24, px), 0, cap);
    const signed = side * ang;
    if (Math.abs(signed) > Math.abs(push)) push = signed;
  });
  return rt.clamp(push, -cap, cap);
}
function stepSpiritAvoid(s, dt, snap) {
  const want = spiritAvoidWant(s);
  if (snap || rt.qa.noDelay) {
    s.avoid = want;
    return;
  }
  const cur = s.avoid || 0;
  const step = (rt.CFG.spiritAvoidOmega || 8) * (dt || 0);
  const d = want - cur;
  s.avoid = (Math.abs(d) <= step) ? want : cur + Math.sign(d) * step;
}
function snapSpiritsToTargets() {
  if (!rt.S) return;
  assignSpiritTargets();
  if (!(rt.S.ringPx > 0) || !(rt.S.ringR > 0)) applyRingBoost();
  const hs = heroScreen();
  livingMarks().forEach(function (s) {
    if (s.target && s.target.alive) {
      const tp = projectXZ(s.target.x, s.target.z, 0.8);
      s.angle = screenAngleTo(tp.x, tp.y, hs);
    }
    stepSpiritAvoid(s, 0, true);
    placeSpiritOnRing(s);
  });
}
function stepSpirits(dt) {
  if (!rt.S) return;
  if (!(rt.S.ringPx > 0) || !(rt.S.ringR > 0)) applyRingBoost();
  rt.S.noMarkT = livingMarks().length ? 0 : (rt.S.noMarkT || 0) + (dt || 0);
  assignSpiritTargets();
  const maxW = (rt.qa.noDelay ? 20 : 1) * (rt.CFG.spiritOmega || 2.8);
  const hs = heroScreen();
  livingMarks().forEach(function (s) {
    let want = s.angle;
    if (s.target && s.target.alive) {
      const tp = projectXZ(s.target.x, s.target.z, 0.8);
      want = screenAngleTo(tp.x, tp.y, hs);
    }
    if (rt.qa.noDelay) s.angle = angNorm(want);
    else s.angle = angStep(s.angle || 0, want, maxW * dt);
    stepSpiritAvoid(s, dt, false);
  });
  livingMarks().forEach(function (s) {
    s.age = (s.age || 0) + dt;
    placeSpirit(s);
    setSpiritAlpha(s);
    if (rt.art.tickChar) rt.art.tickChar(s.obj, 'spirit', 'idle', Math.min(0.05, dt), 0, 0);
  });
}
function setSpiritAlpha(s) {
  const ud = s && s.obj && s.obj.userData;
  if (!ud) return;
  /* Fades in when the zombie enters the ring, then stays. */
  const a = (rt.CFG.spiritAlpha || 1) * rt.clamp((s.age || 0) / (rt.CFG.spiritFadeIn || 0.4), 0, 1);
  if (ud.sprite && ud.sprite.material) { ud.sprite.material.transparent = true; ud.sprite.material.opacity = a; }
  if (ud.glow && ud.glow.material) ud.glow.material.opacity = rt.CFG.spiritGlowAlpha * a;
  if (ud.outline && ud.outline.material) ud.outline.material.opacity = 0.7 * a;
}
/* A spirit bound to a zombie hovers over its head and follows it; free (test) spirits stay on the ring. */
function placeSpirit(s) {
  /* v1.03 보스 중심 회전 혼령 및 기믹 안전지대 전용 혼령은 지정 월드 좌표에 정확히 배치 */
  if (s.worldAnchor && s.wx != null && s.wz != null) {
    s.x = s.wx; s.z = s.wz;
    if (s.obj) rt.placeGroup(s.obj, s.x, s.z, 1.32);
    return;
  }
  const z = s.target;
  if (!z || !z.alive || s.free) { placeSpiritOnRing(s); return; }
  const ud = (z.obj && z.obj.userData) || {};
  const zh = ud.worldH || 2.4;
  let bob = zh * (rt.CFG.spiritHover || 1.26);
  /* 보스는 덩치가 커서(월드 높이 × 배율) 머리 높이를 눈 위치로 삼아 그 바로 위에 띄운다. */
  if (z.isBoss) {
    const eye = (ud.bellLocal && ud.bellLocal.y) || zh * 0.55;
    bob = eye + Math.max(0.75, Math.min(1.5, zh * 0.16));
  }
  s.x = z.x; s.z = z.z;
  if (s.obj) rt.placeGroup(s.obj, s.x, s.z, bob);
}
function addSpirit(opts) {
  opts = opts || {};
  if (!rt.S) return null;
  if (!opts.force && livingMarks().length >= (rt.CFG.spiritMax || 5)) return null;
  return spawnSpirit(opts);
}
function setSpiritCount(n) {
  if (!rt.S) return [];
  n = rt.clamp(n | 0, 0, rt.CFG.spiritMax || 5);
  while (livingMarks().length > n) {
    const s = rt.S.spirits[rt.S.spirits.length - 1];
    s.alive = false;
    if (s.obj && rt.three) rt.three.scene.remove(s.obj);
    rt.S.spirits.pop();
  }
  while (livingMarks().length < n) spawnSpirit({ force: true });
  if (rt.qa.noDelay) snapSpiritsToTargets();
  else assignSpiritTargets();
  return livingMarks();
}
function spawnSpirit(opts) {
  opts = opts || {};
  if (opts.boss) return spawnBoss(opts);
  if (!rt.S) return null;
  const shape = opts.shape || leastUsedShape();
  let angle;
  if (opts.angle != null) angle = opts.angle;
  else if (opts.x != null && opts.z != null) {
    const hs = heroScreen();
    const tp = projectXZ(opts.x, opts.z, 0.8);
    angle = screenAngleTo(tp.x, tp.y, hs);
  } else {
    const n = livingMarks().length;
    angle = (n * 1.134) + Math.random() * 0.4;
  }
  const e = {
    id: ++rt.S._id, kind: 'spirit', shape: shape, angle: angNorm(angle),
    x: 0, z: 0, r: 0.7, alive: true, hp: 1, isBoss: false, target: opts.target || null, avoid: 0,
    free: !opts.target,
    worldAnchor: !!opts.worldAnchor, wx: opts.wx != null ? opts.wx : null, wz: opts.wz != null ? opts.wz : null,
    orbitSlot: opts.orbitSlot != null ? opts.orbitSlot : null,
    zoneTag: opts.zoneTag || null, zoneTtl: opts.zoneTtl || 0
  };
  /* Show the shape the spirit answers to: the one-bell shape, or the boss's current shape. */
  e.obj = rt.addEntityVisual('spirit', spiritShape(e));
  if (rt.S.bellT > 0 && rt.art.setAura) rt.art.setAura(e.obj, true);
  placeSpirit(e);
  rt.S.spirits.push(e);
  if (rt.S.practiceSpawns > 0 && rt.S.practiceShape && e.shape === rt.S.practiceShape) rt.S.practiceSpawns--;
  /* §8.2 새 무늬를 처음 보는 장: 그 무늬 첫 혼령 위에 0.8초 유도 획. */
  if (rt.S.newShape && rt.S.newShape.need > 0 && e.shape === rt.S.newShape.shape) {
    rt.S.newShape.need--;
    rt.S.newShape.guide = rt.CFG.firstShapeGuide || 0.8;
    rt.telemetry.event('first_moment', { kind: 'shape', shape: e.shape, stage: rt.S.stageNo });
  }
  setSpiritAlpha(e);
  if (e.target) rt.ringSpiritBell(e);
  return e;
}
function spawnBoss(opts) {
  opts = opts || {};
  /* §5.2 보스전은 멈추는 창을 쓴다 — 열려 있던 빠른 카드는 추천으로 닫는다. */
  if (rt.S && rt.S.quick) { const q = rt.recommendedPick(); if (q) rt.pickQuick(q, true); else rt.closeQuickCards(); }
  const ring = rt.CFG.zombieRing || [10, 14];
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(opts.r || 16);
  const seq = opts.seq || pickSeq(opts.nShapes || rt.CFG.bossShapes);
  const e = {
    id: ++rt.S._id, kind: 'zombie', shape: seq[0], x: p.x, z: p.z, r: 1.1,
    alive: true, hp: opts.hp != null ? opts.hp : 99,
    frozen: 0, burn: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0, stun: 0,
    marked: false, isBoss: true, seq: seq, seqI: 0, firstWalk: true,
    phase: 1, phase2: false, phase3: false,
    poiseMax: Math.max(3.5, ([6, 8, 10, 12][Math.min(3, Math.floor((((rt.S && rt.S.stage && rt.S.stage.id) || 1) - 1) / 4))] || 6)),
    poise: 6, poiseLastHit: 0, poiseBreakSeq: 0, phaseCutInvulnUntil: 0
  };
  e.poise = e.poiseMax;
  e.maxHp=opts.hp ?? [28,34,42,50,56,64,72,82,92,102,114,128,140,155,172,195][rt.S.stage.id-1] ?? 28;
  e.hp=e.maxHp; rt.S.autoDmg=0; rt.S.manualDmg=0;
  const vis = e.shape;
  /* §4.5 보스 개성: 장마다 외형 변주(머리 장신구·장기 4종, 무기 3종, 크기 0.9~1.15배) */
  const BV = rt.bossVisualOf(rt.S.stage);
  const bossAct = rt.S && rt.S.stage ? rt.actOf(rt.S.stage.id) : 1;
  rt.S.bossVar = BV.var;
  rt.S.bossAct = bossAct;
  e.obj = rt.addEntityVisual('boss', vis, { bossVar: BV.var, bossScale: BV.scale, bossAct: bossAct });
  rt.applySkin(e.obj);
  if (rt.art && rt.art.applyMonsterAct && rt.S && rt.S.stage) rt.art.applyMonsterAct(e.obj, rt.actOf(rt.S.stage.id));
  rt.placeGroup(e.obj, e.x, e.z);
  rt.S.zombies.push(e);
  rt.art.tickChar(e.obj,'boss','boss:idle',1/60,rt.S.hero.x-e.x,rt.S.hero.z-e.z);
  if (rt.art.applyMonsterAct) rt.art.applyMonsterAct(e.obj, rt.actOf(rt.S.stage.id));
  if (rt.art.bossIntroRoar) rt.art.bossIntroRoar(e.obj);
  if (!rt.a11yShake() && !rt.reducedMotion()) { rt.S.camZoomT = 0.95; rt.S.camZoomAmt = 3.2; }
  rt.haptic([24, 32, 44]);
  rt.S.boss = e; rt.S.bossSpawned = true;
  if ($('app')) $('app').classList.add('boss-active');
  /* v0.50: 보스 등장 장단 전환 + 웅장한 등장이펙트·사운드 */
  if (rt.audio) {
    if (rt.audio.setBossMode) rt.audio.setBossMode(true);
    if (rt.audio.bossSpawn) rt.audio.bossSpawn();
  }
  rt.bossFx.triggerSmokeBurst(e.x, e.z, false);
  if (rt.three && rt.three.lights) rt.three.lights.burst(e.x, 1.8, e.z, { color: 0xe64532, intensity: 6.0, duration: 0.65 });
  /* §4.5 보스 등장 순간 1.2초 이름 카드 */
  rt.showBossCard(rt.S.stage);
  /* v0.22 보스 결계: 잡몹을 걷어내고, 영웅을 중심으로 원형 아레나를 세운다. */
  clearFieldForBoss();
  openArena(rt.S.hero.x, rt.S.hero.z);
  rt.S.summonT = 0;
  const hasNewGimmick = rt.bossHasNewGimmick();
  const keepN = hasNewGimmick ? 1 : (((rt.CFG.bossPat || {}).summon || {}).keep || 3);
  for (let i = 0; i < keepN + (rt.relicOn(rt.save, 'totem') ? 1 : 0); i++) rt.summonDodgeTarget(e);
  if (!rt.S.totemSeen && !rt.save.totemTip) {
    rt.S.totemSeen = true;
    rt.save.totemTip = true; rt.persist();
    rt.showGuide('보스가 공격을 예고하면 <b>기물 무늬</b>를 그려 역공하세요', 6.5);
  }
  /* §8.2 기물 무늬(△ ◡ @)를 처음 보는 순간: 보스 등장 직후 3초 기물 연습(0.4배) + 가장 가까운 기물 유도 획. */
  if (!opts.sandbox && rt.markSeen('totem')) {
    rt.S.totemGuide = rt.CFG.totemPractice || 3;
    rt.addSlow(0.4, rt.CFG.totemPractice || 3);
    rt.telemetry.event('first_moment', { kind: 'totem', stage: rt.S.stageNo });
  }
  assignSpiritTargets();
  return e;
}
/* 보스전 집중: 필드의 잔몹은 보상 없이 연기처럼 사라진다. */
function clearFieldForBoss() {
  if (!rt.S) return 0;
  let n = 0;
  (rt.S.zombies || []).forEach(function (z) {
    if (!z.alive || z.isBoss) return;
    z.alive = false;
    if (z.obj && rt.three) rt.three.scene.remove(z.obj);
    if (rt.three && rt.three.ink && n < 14) rt.three.ink.kill(z.x, z.z, 0, 1);
    n++;
  });
  rt.S.waveIds = [];
  rt.S.spirits = (rt.S.spirits || []).filter(function (s) {
    if (s.target && !s.target.alive) { if (s.obj && rt.three) rt.three.scene.remove(s.obj); return false; }
    return true;
  });
  return n;
}

/* ---------- 보스 결계(아레나) 연출 ---------- */
function openArena(cx, cz) {
  closeArena(true);
  if (!rt.S) return null;
  const r = rt.CFG.arenaR || 12;
  rt.S.arena = { x: cx || 0, z: cz || 0, r: r, t: 0 };
  if (!rt.three) return rt.S.arena;
  const a = makeArenaGroup(r);
  a.group.scale.set(1, 1, 1);
  a.t = 0;
  a.group.position.set(rt.S.arena.x, 0, rt.S.arena.z);
  /* v1.03 / v1.22 보스전 외곽 테두리 결계 시각 링 완전 숨김 (열린 전장 시야 확보) */
  a.group.visible = false;
  /* 예열 때 만든 결계를 그대로 장면에 둔다(보스 순간에 처음 붙이지 않는다). */
  if (a.group.parent !== rt.three.scene) rt.three.scene.add(a.group);
  rt.three.arena = a;
  rt.applyCameraLens();
  return rt.S.arena;
}
/* 결계는 판마다 같은 모양이라 한 번만 만들어 재사용한다.
   매번 새로 만들면 재질이 새로 생기고(→ 프로그램 재링크) 지오메트리도 다시 올라간다. */
let _arenaCache = null;
/** The barrier's ring, inner ring and wall, as one group (also used to pre-compile its shaders). */
function makeArenaGroup(r) {
  if (_arenaCache && _arenaCache.r === r) return _arenaCache.a;
  if (_arenaCache) { _arenaCache.a.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
  const group = new rt.THREE.Group();
  group.name = 'boss-arena';
  /* v0.54.1: 보스 결계(붉은 장막 벽 wall + 바닥 홍기 띠 ring)는 그대로 살리고,
     거슬리던 안쪽 흰색 얇은 테두리 선(inner)만 제거한다. */
  const ringGeo = new rt.THREE.RingGeometry(r - 0.55, r, 128, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new rt.THREE.MeshBasicMaterial({
    color: 0xe0522c, transparent: true, opacity: 0.42, blending: rt.THREE.AdditiveBlending,
    depthWrite: false, side: rt.THREE.DoubleSide, fog: false
  });
  const ring = new rt.THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.06;
  ring.renderOrder = 4;
  group.add(ring);
  const innerGeo = new rt.THREE.RingGeometry(r * 0.94, r * 0.955, 64, 1);
  innerGeo.rotateX(-Math.PI / 2);
  const innerMat = new rt.THREE.MeshBasicMaterial({
    color: 0xffd7a0, transparent: true, opacity: 0,
    depthWrite: false, side: rt.THREE.DoubleSide, fog: false
  });
  const inner = new rt.THREE.Mesh(innerGeo, innerMat);
  inner.position.y = 0.07;
  inner.visible = false;
  group.add(inner);
  /* 결계 벽: 바닥에서 솟아오르는 반투명 붉은 결계 장막 */
  const wallGeo = new rt.THREE.CylinderGeometry(r, r, 2.8, 96, 1, true);
  const wallMat = new rt.THREE.MeshBasicMaterial({
    color: 0xe85a34, transparent: true, opacity: 0.22, blending: rt.THREE.AdditiveBlending,
    depthWrite: false, side: rt.THREE.DoubleSide, fog: false
  });
  const wall = new rt.THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 1.4;
  wall.renderOrder = 4;
  group.add(wall);
  const out = { group: group, ring: ring, inner: inner, wall: wall, ringMat: ringMat, innerMat: innerMat, wallMat: wallMat, t: 0, r: r };
  _arenaCache = { r: r, a: out };
  return out;
}
/* ---------- 판 시작 전 예열(pre-warm) ----------
   "가끔 갑자기 멈춤"은 게임 로직이 아니라 **처음 쓰는 재질의 셰이더 링크**와 **캔버스 텍스처의 첫 업로드**
   때문이다(v0.29 실측: 보스 소환 프레임 309.7ms에 프로그램 32→46). 그래서 소개 카드가 떠 있는 동안
   이 판에 등장할 수 있는 모든 재질 변형을 한 번 실제로 컴파일하고, 그 재질을 붙들고 있어서
   three가 프로그램을 해제하지 못하게 한다 → 런 중 renderer.info.programs 가 늘지 않는다. */
function prewarmRecipes() {
  const R = [];
  const add = function (label, make) { R.push({ label: label, make: make }); };
  /* 영웅·잔상·원귀 종류별 그림 + 상태이상 시트(얼음/불/독) */
  add('hero', function () { return rt.art.makeChar('hero'); });
  add('afterimage', function () { return rt.art.makeChar('afterimage'); });
  Object.keys(rt.CFG.zombieTypes || {}).forEach(function (t) {
    add('zombie:' + t, function () { return rt.art.makeChar('zombie', t); });
  });
  add('zombie:status', function () {
    const g = rt.art.makeChar('zombie', 'imp');
    ['frozen', 'burning', 'poisoned'].forEach(function (st) { rt.art.tickChar(g, 'zombie', st, 0.016, 0, 1); });
    return g;
  });
  /* 혼령: 기호 8종의 먹획을 시트에 굽는 비용이 크다 → 여기서 전부 굽고 올린다.
     qa.warmCore 는 계측용으로 한 종만 굽는다(굽기 비용 제외, 재질은 동일). */
  const warmShapes = rt.qa.warmCore ? ['hline'] : Object.keys(rt.SHAPE_MARK);
  warmShapes.forEach(function (sh) {
    add('spirit:' + sh, function () {
      const g = rt.art.makeChar('spirit', sh);      // 기호를 시트에 굽는다(비싼 캔버스 작업)
      const spr = g && g.userData && g.userData.sprite;
      /* 굽기 결과는 캐시에 남고, 큰 텍스처(512×5120)는 GPU에 올리지 않는다 — 기호 8종을 모두 올리면
         80MB가 넘는다. 실제 혼령이 처음 나올 때 한 번만 올라간다(10ms 안팎). */
      if (spr && spr.material && rt.art.glowTex) { spr.material.map = rt.art.glowTex; spr.material.needsUpdate = true; }
      return g;
    });
  });
  /* §4.5 보스 외형 변주 4벌 — 이 장이 쓸 벌과 나머지를 모두 미리 구워 둔다. */
  for (let bv = 0; bv < 4; bv++) {
    (function (k) { add('boss:' + k, function () { return rt.art.makeChar('boss', 'hline', { bossVar: k }); }); })(bv);
  }
  add('boss:glb', function () { const G = rt.makeBossGlb(6.2); return G && G.root; });
  /* 아이템 12종 */
  ['xp', 'heal', 'coin', 'elem-ice', 'elem-fire', 'elem-poison', 'one-bell', 'dash-plus', 'herb', 'magnet', 'bang', 'charm']
    .forEach(function (k) { add('item:' + k, function () { return rt.art.makeChar(k); }); });
  /* 3D 이펙트 시트(터짐·얼음 파편·독 폭발) */
  ['ink-splat', 'ice-shatter', 'poison-burst', 'fire-trail'].forEach(function (name) {
    add('fx:' + name, function () {
      const f = rt.art.playFx(rt.three.scene, name, 0, 0, 1.7);
      if (!f) return null;
      rt.three.scene.remove(f.mesh);
      return f.mesh;
    });
  });
  /* 보스전: 결계(실제로 쓰는 그 그룹) · 부적 기둥 · 기물 · 탄막 · 되받기 · 장판 */
  add('arena', function () { return makeArenaGroup(rt.CFG.arenaR || 12).group; });
  add('pillar', function () { return rt.makePillarObj(); });
  add('totem', function () { return rt.makeTotemObj(); });
  add('shot', function () { return new rt.THREE.Mesh(rt.shotGeo(), rt.shotMaterial()); });
  add('shot:gold', function () { return new rt.THREE.Mesh(rt.shotGeo(), rt.goldShotMaterial()); });
  add('reflect', function () { return rt.makeReflectMesh(); });
  add('hazard', function () {
    const m = new rt.THREE.Mesh(rt.hazardGeo(), new rt.THREE.MeshBasicMaterial({
      color: 0xff5a3c, transparent: true, opacity: 0.34, depthWrite: false, blending: rt.THREE.AdditiveBlending
    }));
    m.rotation.x = -Math.PI / 2;
    return m;
  });
  /* 일섬 검기: 바닥 먹 궤적 · 솟는 리본 아크 · 화염 잔불 */
  ['jade', 'fire', 'ice', 'poison', 'lightning'].forEach(function (el) {
    add('slash:' + el, function () {
      const s = rt.createInkSlash({ from: { x: 0, z: 0 }, to: { x: 0, z: 1 }, elem: el });
      return s.mesh;
    });
  });
  add('slash-arc', function () {
    const s = rt.createSlashArc({ from: { x: 0, z: 0 }, to: { x: 0, z: 1 }, elem: 'fire' });
    return s.mesh;
  });
  add('trail', function () { return new rt.THREE.Mesh(new rt.THREE.PlaneGeometry(1, 1), rt.trailMaterial()); });
  /* 기본 재질 변형(fog·투명·면·맵·alphaTest) 총망라 — 생성부를 못 따라간 변형까지 덮는다. */
  rt.materialVariants(rt.THREE, rt.art.glowTex || rt.art.trailTex || null).forEach(function (r) { R.push(r); });
  return R;
}
let _warmP = null;
/* budget: 프레임당 예열 예산(ms). 타이틀 유휴 예열은 8~12ms로 작게 잡아 화면이 끊기지 않게 한다. */
function warmShaders(budget) {
  if (!rt.three || !rt.three.renderer) return Promise.resolve();
  if (_warmP) return _warmP;
  const _tw = performance.now();
  _warmP = rt.warmScene({
    THREE: rt.THREE, renderer: rt.three.renderer, scene: rt.three.scene, camera: rt.three.camera,
    recipes: prewarmRecipes(),
    budgetMs: budget || 24, texPerFrame: 3,
    textures: [rt.art.trailTex, rt.art.torchGlow, rt.art.glowTex, rt.art.shadowTex,
      rt.art.images && rt.art.images.inkStroke, rt.art.images && rt.art.images.inkLit, rt.art.images && rt.art.images.inkDab]
  }).then(function (r) {
    rt.three.warm = r;
    /* 결계는 판이 시작될 때부터 장면에 두고 숨겨 둔다(보스 순간에 처음 세우지 않게). */
    try {
      const a = makeArenaGroup(rt.CFG.arenaR || 12);
      a.group.visible = false;
      if (a.group.parent !== rt.three.scene) rt.three.scene.add(a.group);
    } catch (e) {}
    if (window.console && console.info) console.info('[심안] 셰이더 예열 ' + r.ms + 'ms · 레시피 ' + r.recipes + ' · 텍스처 ' + r.textures + ' · 프로그램 ' + r.programs);
    rt.perfMark('warm', performance.now() - _tw, { budget: budget || 24, recipes: r.recipes, textures: r.textures, programs: r.programs });
    return r;
  }, function () { return null; });
  return _warmP;
}
/* ---------- v0.35 타이틀 유휴 예열 ----------
   증상: 타이틀에서 '출전'을 누르면 게임이 시작되기까지 길게 멈춘다.
   원인: 셰이더·텍스처 예열(warmShaders)과 바닥 판석 베이킹·청크 월드 구축이
         모두 그 순간에 몰렸기 때문이다. 소개 카드가 떠 있는 2.6초 동안 하려던 일을
         타이틀이 떠 있는 여유 프레임으로 앞당긴다(프레임당 예산 10ms).
     1) warmShaders: 셰이더 링크·텍스처 업로드를 작은 예산으로 분산
     2) 바닥 판석: 선택한 막의 4장을 한 프레임에 하나씩 미리 굽는다
     3) 선택한 장의 무대·청크 월드는 previewStageWorld/switchMap이 이미 맡는다 */
let _titleWarm = false;
function titlePrewarm() {
  if (_titleWarm || rt.qa.skipWarm) return _titleWarm;
  _titleWarm = true;
  const nextFrame = function (fn) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { fn(); });
    else setTimeout(fn, 16);
  };
  const startWarm = function () {
    if (!rt.three || !rt.three.renderer || !rt.art) return;
    try { warmShaders(10); } catch (e) {}
  };
  const startGround = function () {
    if (!rt.three || rt.S) return;
    const sel = rt.clamp(rt.titleSel || rt.save.stage || 1, 1, rt.STAGES.length);
    const act = rt.actOf(sel);
    const ids = rt.STAGES.filter(function (s) { return rt.actOf(s.id) === act; }).map(function (s) { return s.id; });
    ids.sort(function (a, b) { return (a === sel ? -1 : 0) - (b === sel ? -1 : 0); });
    const queue = ids.slice();
    const step = function () {
      if (!queue.length || rt.S) return;         /* 판이 시작되면 손을 뗀다 */
      try { rt.prebakeGroundStage(queue.shift()); } catch (e) {}
      nextFrame(step);
    };
    nextFrame(step);
  };
  /* 첫 화면(타이틀)이 한 번 그려진 뒤에 시작한다. */
  nextFrame(function () { nextFrame(function () { startWarm(); startGround(); }); });
  return _titleWarm;
}
function closeArena(instant) {
  if (rt.three && rt.three.arena) {
    const a = rt.three.arena;
    /* 결계는 장면에 둔 채로 숨기기만 한다 — 지웠다 다시 만들면 재질·프로그램이 다시 올라간다. */
    a.group.visible = false;
    a.group.scale.set(1, 1, 1);
    a.t = 0;
    a.ring.scale.set(1, 1, 1);
    a.inner.scale.set(1, 1, 1);
    rt.three.arena = null;
  }
  if (rt.S) rt.S.arena = null;
  rt.applyCameraLens();
}
function stepArena(dt) {
  const a = rt.three && rt.three.arena;
  if (!a) return;
  a.t += dt || 0;
  const p = 0.55 + 0.45 * Math.sin(a.t * 2.6);
  a.ringMat.opacity = 0.30 + 0.16 * p;
  a.innerMat.opacity = 0;
  a.wallMat.opacity = 0.14 + 0.09 * p;
  const s = 1 + 0.005 * Math.sin(a.t * 3.1);
  a.ring.scale.set(s, 1, s);
}
function spawnZombie(opts) {
  opts = opts || {};
  const zr = rt.CFG.zombieRing || [10, 14];
  const p = opts.x != null ? { x: opts.x, z: opts.z } : ringPos(opts.r != null ? opts.r : (zr[0] + Math.random() * (zr[1] - zr[0])));
  /* v0.48: 고정 아레나 밖(절벽 너머)에서 태어나지 않게 경계 안으로 당긴다. */
  { const cp = rt.clipWorld(p, 1.0); p.x = cp.x; p.z = cp.z; }
  const type = opts.type || pickZombieType();
  const def = rt.CFG.zombieTypes[type] || rt.CFG.zombieTypes.imp;
  const grow = 1 + (rt.CFG.hpGrowth || 0) * rt.clamp(rt.S.elapsed / rt.runLimit(), 0, 1);
  const e = {
    id: ++rt.S._id, kind: 'zombie', type: type, x: p.x, z: p.z, r: def.r, alive: true,
    hp: opts.hp != null ? opts.hp : def.hp * grow, maxHp: opts.hp != null ? opts.hp : def.hp * grow,
    frozen: 0, burn: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0, stun: 0,
    marked: false, shape: null, isBoss: false, elite: type === 'elite'
  };
  e.obj = rt.addEntityVisual('zombie', type);
  rt.placeGroup(e.obj, e.x, e.z);
  /* v0.31 §3.2 강적 깨는 법: 장정=갑옷 1겹 · 돌덩이=금 2단계 · 정예=봉인 순서 3개. */
  if (type === 'brute') { e.armor = rt.CFG.bruteArmor || 1; e.armored = true; e.shapeOv = null; }
  else if (type === 'stone') { e.cracks = 0; e.hasCracks = true; e.lastShape = null; }
  else if (type === 'elite') {
    e.eliteSeq = true; e.seq = pickSeq(rt.CFG.eliteSeqLen || 3); e.seqI = 0;
    /* v0.34 §6.3 정예 속성: 얼음(닿으면 느려짐) · 분열(죽으면 둘로) · 방울(주기적으로 봉인) */
    const ATTRS = ['ice', 'split', 'bell'];
    e.eliteAttr = ATTRS[((rt.S.stageNo || 1) + (rt.S._id % 3)) % 3];
    const tintAttr = { ice: 0x7fd8ff, split: 0xc08aff, bell: 0xE8C04A }[e.eliteAttr];
    if (e.obj && e.obj.userData && e.obj.userData.rim && e.obj.userData.rim.material) {
      e.obj.userData.rim.material.color.setHex(tintAttr); e.obj.userData.rim.material.opacity = 0.62;
      e.obj.userData.rimHex = tintAttr; e.obj.userData.rimOp = 0.62;
    }
    e.bellCd = 2.4; e.invuln = 0;
  }
  /* v0.23 변주 원귀: 테두리 빛으로 종류를 구분한다(돌진=청, 투척=보라, 자폭=주황). */
  if (def.tint && e.obj && e.obj.userData && e.obj.userData.rim && e.obj.userData.rim.material && e.obj.userData.rim.material.color) {
    e.obj.userData.rim.material.color.setHex(def.tint);
    e.obj.userData.rim.material.opacity = 0.6;
    e.obj.userData.rimHex = def.tint; e.obj.userData.rimOp = 0.6;
  }
  rt.S.zombies.push(e);
  if (rt.qa.noDelay) snapSpiritsToTargets();
  else assignSpiritTargets();
  return e;
}
function spawnItem(opts) {
  opts = opts || {};
  const type = opts.type || 'xp';
  const p = opts.x != null ? { x: opts.x, z: opts.z } : { x: rt.S.hero.x, z: rt.S.hero.z };
  const e = { id: ++rt.S._id, kind: type, x: p.x, z: p.z, r: 0.45, alive: true, shape: opts.shape, dur: opts.dur, born: rt.S.elapsed || 0 };
  e.obj = rt.addEntityVisual(type);
  rt.placeGroup(e.obj, e.x, e.z, 0.2);
  /* v0.40 5단계: 떨어진 부적/혼백이 종이처럼 탁 펴지며 등장한다(과회전 후 정착). */
  try {
    if (e.obj && e.obj.scale) rt.foldPop(e.obj, { from: 0.06, stiff: 210, damp: 14, tilt: 0.16 });
    if (rt.audio && !rt.qa.mute && rt.audio.paperFold) rt.audio.paperFold(0.45);
    /* v0.41: 부적이 종이로 펄럭이며 떨어진다. */
    if (rt.three && rt.three.paper) rt.three.paper.talisman(e.x, 0.9, e.z, { size: 0.9 });
  } catch (err) {}
  rt.S.items.push(e);
  return e;
}

/* ---------- 묵항아리: 부수면 세 가지 픽업 중 하나 ---------- */
function pickJarDrop() {
  const w = rt.CFG.jarDropWeights || { herb: 0.4, magnet: 0.3, bang: 0.3 };
  const keys = Object.keys(w);
  const sum = keys.reduce(function (a, k) { return a + w[k]; }, 0) || 1;
  let roll = Math.random() * sum;
  for (let i = 0; i < keys.length; i++) { roll -= w[keys[i]]; if (roll <= 0) return keys[i]; }
  return keys[0];
}
function breakJar(j) {
  if (!j || !j.alive) return false;
  if (rt.three && rt.three.chunks) rt.three.chunks.breakJar(j);
  j.alive = false;
  if (!rt.S) return true;
  rt.S.jarsBroken = (rt.S.jarsBroken || 0) + 1;
  if (rt.art && rt.art.playFx && rt.three) {
    const fx = rt.art.playFx(rt.three.scene, 'ink-splat', j.x, j.z, 1.7);
    if (fx) rt.three.fx.push(fx);
  }
  if (rt.three && rt.three.ink) rt.three.ink.hit(j.x, j.z, 0.7, 0.7);
  if (rt.audio && !rt.qa.mute) { rt.audio.hit(); if (rt.audio.paperCrush) rt.audio.paperCrush(0.9); if (rt.audio.paperTear) rt.audio.paperTear(0.55); }
  rt.S.shake = Math.max(rt.S.shake || 0, 0.18);
  const kind = pickJarDrop();
  spawnItem({ type: kind, x: j.x, z: j.z });
  /* §9.4 빈 항아리: 드롭이 두 배 */
  /* v0.98: 삭제된 구 유물(jar) 잔여 분기 정리 */
  rt.addCharge(3);
  rt.showJudge('항아리 파괴');
  return true;
}
/* 자석 부적: 필드의 모든 바닥 아이템(엽전·혼백·회복·부적·종 등)을 즉시 빨아들인다. */
function absorbAllItems(except) {
  if (!rt.S) return 0;
  const list = (rt.S.items || []).filter(function (x) { return x.alive && x !== except; });
  let n = 0;
  const hp = heroScreen();
  list.forEach(function (x) { if (x.alive) { rt.inkFx.fly(x.x, x.z, hp, rt.FX_COLORS.gold, 1); rt.collectItem(x, null); n++; } });
  if (n && rt.audio && rt.audio.pickup) rt.audio.pickup(n);
  return n;
}
/* 화약 부적: 화면 안의 일반 적을 쓸어버리고 보스를 절단한다. */
function firecrackerBurst() {
  if (!rt.S) return 0;
  const R = Math.max(rt.CFG.bangR || 15, ringR() * 2.2);
  let killed = 0;
  rt.S.zombies.slice().forEach(function (z) {
    if (!z.alive) return;
    if (!isOnScreen(z, 120) && rt.dist(z, rt.S.hero) > R) return;
    if (z.isBoss) {
      rt.hurtZombie(z,z.maxHp*.05,'bang',null);
      z.stun = Math.max(z.stun || 0, 0.8);
      rt.showJudge('화약 폭발!');
      return;
    }
    if (rt.dist(z, rt.S.hero) > R + (z.r || 0.5)) return;
    rt.hurtZombie(z, 999, 'bang', rt.S.lastDash);
    if (!z.alive) killed++;
  });
  rt.S.shake = Math.max(rt.S.shake || 0, 1.0);
  rt.addHitstop(0.1);
  rt.inkFx.ring(R, rt.FX_COLORS.fire, 0.8);
  rt.inkFx.ring(R * 0.6, rt.FX_COLORS.gold, 0.6);
  if (rt.audio && !rt.qa.mute) rt.audio.explode();
  rt.showJudge('화약 부적!');
  rt.triggerSightWave();
  return killed;
}
function pickZombieType() {
  const st = rt.curStage();
  const mix = (st && st.mix) || rt.CFG.zombieMix || [[0, { imp: 1 }]];
  let w = mix[0][1];
  mix.forEach(function (m) { if (rt.S.elapsed >= m[0]) w = m[1]; });
  let roll = Math.random() * Object.keys(w).reduce(function (a, k) { return a + w[k]; }, 0);
  for (const k in w) { roll -= w[k]; if (roll <= 0) return k; }
  return 'imp';
}
function ringPos(r) {
  const a = Math.random() * Math.PI * 2;
  return { x: rt.S.hero.x + Math.cos(a) * r, z: rt.S.hero.z + Math.sin(a) * r };
}
function unlockedShapes(runNo) {
  const n = rt.clamp(runNo != null ? runNo : 1, 1, rt.SHAPE_UNLOCK.length);
  return rt.SHAPE_UNLOCK.slice(0, n);
}
function upcomingRun() {
  return rt.clamp(rt.titleSel != null ? rt.titleSel : (rt.save.stage || 1), 1, rt.STAGES.length);
}
function titleChip(shape) {
  const alt = rt.SHAPE_MARK[shape] || shape;
  const src = rt.art && rt.art.sealUrl ? rt.art.sealUrl(shape) : '';
  return '<span class="hanji-chip" data-shape="' + shape + '" title="' + alt + '"><img src="' + src + '" alt="' + alt + '" width="40" height="40"></span>';
}
/* v0.23 해금: 앞 장을 깨면 다음 장이 열리고, 한 막에 들어서 첫 장을 깼다면
   그 막의 네 장은 순서와 상관없이 도전할 수 있다(막 단위 도전 해금). */
function unlockedMax() {
  if (rt.developerMode) return rt.STAGES.length;
  const seq = rt.clamp(rt.save.stage || 1, 1, rt.STAGES.length);
  const actStart = Math.floor((seq - 1) / 4) * 4 + 1;
  const actEnd = Math.min(rt.STAGES.length, actStart + 3);
  const stars = rt.save.stars || {};
  if (seq > actStart && (stars[actStart] || 0) > 0) return actEnd;
  return seq;
}
function selActOf(n) { return Math.max(1, Math.min(4, Math.floor(((n | 0) - 1) / 4) + 1)); }
let titleAct = null;
function previewStageWorld(n) {
  if (!rt.three || (rt.S && rt.S.playing)) return;
  const st = rt.stageOf(n || 1);
  rt.applyStageAtmo(st);
  if (!rt.three.map || rt.three.map.stageId !== st.id || rt.three.map.id !== st.map) rt.switchMap(st.map, st.id);
}
function refreshTitleHelp() {
  try { rt.renderChallenges(); } catch (e) {}
  /* 마지막에 깨운 스테이지가 이미 깨졌으면 새로 열린 장을 기본 선택으로 보여 준다. */
  if (rt.titleSel == null) rt.titleSel = rt.clamp(rt.save.stage || 1, 1, rt.STAGES.length);
  else rt.titleSel = rt.clamp(1, unlockedMax());
  const el = $('titleShapes') || document.querySelector('.shapes-help');
  const sel = rt.clamp((rt.titleSel != null ? rt.titleSel : (rt.save.stage || 1)) | 0, 1, rt.STAGES.length);
  const st = rt.stageOf(sel);
  setChapterArt(st);
  const pool = (st.shapes || ['hline']).slice();
  if (el) el.innerHTML = pool.map(titleChip).join('');
  const sub = $('titleSub');
  if (sub) sub.textContent = st.sub + ' — 먹안개 안쪽 혼령의 종 모양을 그려, 그 혼령 방향으로 일섬 돌진하세요';
  const btn = $('btnStart');
  if (btn) btn.textContent = sel + '장 출전';
  const chTitle = $('lobbyChapterTitle');
  const chSub = $('lobbyChapterSub');
  const chMode = $('lobbyModeTag');
  if (chTitle) chTitle.textContent = '제 ' + st.id + ' 장 · ' + st.name;
  if (chMode) chMode.textContent = rt.curMode().name;
  if (chSub) {
    const stars = (rt.save.stars || {})[st.id] || 0;
    const recPw = rt.stageRecommendedPower(st.id);
    chSub.textContent = '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars)) + ' · 제' + rt.actOf(st.id) + '막 · 권장 전투력 ' + recPw + ' · 변경 ▾';
  }
  const maxU = unlockedMax();
  if ($('btnStagePrev')) $('btnStagePrev').disabled = sel <= 1;
  if ($('btnStageNext')) $('btnStageNext').disabled = sel >= maxU;
  const note = $('titleStageNote');
  if (note) {
    const stars = (rt.save.stars || {})[st.id] || 0;
    note.innerHTML = '제' + rt.actOf(st.id) + '막 ' + rt.ACT_NAMES[rt.actOf(st.id)] + ' · ' + st.tag + ' · 목표 ' + st.time + '초 · 별 '
      + '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars))
      + (rt.save.bestScore ? ' · 최고 ' + rt.save.bestScore : '')
      + ' · ' + rt.curMode().name;
  }
  rt.renderModes();
  renderStageSelect(sel);
  return { run: sel, stage: st, pool: pool, html: el ? el.innerHTML : '' };
}
/* 타이틀의 스테이지 선택 — 막 탭 + 4장 격자. 해금된 장만 누를 수 있다. */
function renderStageSelect(sel) {
  const box = $('titleStages');
  if (!box) return;
  const unlocked = unlockedMax();
  const cur = rt.clamp(sel || rt.titleSel || rt.save.stage || 1, 1, rt.STAGES.length);
  if (titleAct == null || titleAct !== selActOf(cur)) titleAct = selActOf(cur);
  const tabs = $('actTabs');
  if (tabs) {
    tabs.innerHTML = [1, 2, 3, 4].map(function (a) {
      const first = (a - 1) * 4 + 1;
      const openA = unlocked >= first;
      let stars = 0;
      for (let i = 0; i < 4; i++) stars += ((rt.save.stars || {})[first + i] || 0);
      const on = a === titleAct;
      return '<button type="button" class="act-tab' + (on ? ' on' : '') + (openA ? '' : ' lock') + '" data-act="' + a + '" role="tab" aria-selected="' + (on ? 'true' : 'false') + '">'
        + '<b>제' + a + '막</b><span>' + rt.ACT_NAMES[a] + '</span><i>' + (openA ? ('★ ' + stars + '/12') : '잠김') + '</i></button>';
    }).join('');
    tabs.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        const a = +b.getAttribute('data-act');
        if (unlocked < (a - 1) * 4 + 1) return;
        titleAct = a;
        if (selActOf(rt.titleSel || 1) !== a) rt.titleSel = (a - 1) * 4 + 1;
        if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'hline');
        refreshTitleHelp();
        previewStageWorld(rt.titleSel);
      });
    });
  }
  const list = rt.STAGES.filter(function (s2) { return selActOf(s2.id) === titleAct; });
  box.innerHTML = list.map(function (s2) {
    const lock = s2.id > unlocked;
    const stars = (rt.save.stars || {})[s2.id] || 0;
    const st = lock ? '' : ('<span class="st">' + '★'.repeat(stars) + '<i>' + '☆'.repeat(Math.max(0, 3 - stars)) + '</i></span>');
    return '<button type="button" class="stage-chip' + (s2.id === cur ? ' on' : '') + (lock ? ' lock' : '') + '" data-stage="' + s2.id + '"' + (lock ? ' disabled' : '') + '>'
      + '<b>' + (lock ? '·' : (s2.id + '장')) + '</b>' + (lock ? '잠김<br>' + s2.name : s2.name) + st + '<span class="tm">' + s2.time + '초</span></button>';
  }).join('');
  box.querySelectorAll('[data-stage]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.disabled) return;
      rt.titleSel = +b.getAttribute('data-stage');
      if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'hline');
      refreshTitleHelp();
      previewStageWorld(rt.titleSel);
    });
  });
}
/* 스테이지 인트로 카드 → 잠시 뒤 자동 출전(버튼·화면 탭으로 바로 시작) */
function setChapterArt(st) {
  const app = $('app');
  const artId = st.id > 12 ? (st.id - 4) : st.id;
  app.style.setProperty('--chapter-art', 'url("' + new URL('../assets/ink-edition/stage-' + artId + '.webp', import.meta.url).href + '")');
  app.dataset.act = st.act;
}
function subgoalExplain(sg) {
  if (!sg || !sg.id) return '';
  if (sg.id === 'dark') return '특수 기믹 · 어둠 ' + (sg.t || 60) + '초 — 초반 동안 외곽 시야가 좁아지고 혼령 방울 소리가 2배 커집니다.';
  if (sg.id === 'guard') return '특수 기믹 · 석등 지키기 — 전장의 석등이 부서지지 않게 주변 원귀를 먼저 베어내세요.';
  if (sg.id === 'hunt') return '특수 기믹 · 정예 사냥 — 제한 시간 안에 정예 원귀를 모두 찾아 처치하세요.';
  if (sg.id === 'shapeLock') return '특수 기믹 · 한 무늬 구간 — 지정된 시간 동안 한 가지 획만 유효합니다.';
  if (sg.id === 'timed') return '특수 기믹 · 시간 사냥 — 기본 시간이 짧고, 원귀를 벨 때마다 남은 시간이 늘어납니다.';
  return sg.label ? ('특수 기믹 · ' + sg.label) : '';
}
function fillStageIntro(st) {
  setChapterArt(st);
  $('stageKicker').textContent = '제 ' + st.id + ' 장 · ' + rt.curMode().name;
  $('stageName').textContent = st.name;
  $('stageSub').textContent = st.sub;
  $('stageGoal').textContent = st.goal;
  const T = st.terrain;
  const hasT = !!(T && T.kind !== 'none');
  const sgTxt = subgoalExplain(st.subgoal);
  const gBox = $('stageGimmickBox');
  const te = $('stageTerrain');
  const se = $('stageSubgoal');
  if (te) {
    te.textContent = hasT ? ('지형 기믹 · ' + T.name + ' — ' + T.line) : '';
    te.hidden = !hasT;
  }
  if (se) {
    se.textContent = sgTxt;
    se.hidden = !sgTxt;
  }
  if (gBox) gBox.hidden = !(hasT || sgTxt);
  $('stageChips').innerHTML = (st.shapes || []).map(function (sh) {
    return titleChip(sh);
  }).join('');
  $('stageTip').textContent = st.tip || '';
  const b = $('btnStageGo');
  if (b) b.textContent = '일섬 (시작)';
}
function beginStage(n) {
  const _t0 = performance.now();
  const st = rt.stageOf(n);
  rt.titleSel = st.id;
  fillStageIntro(st);
  rt.showOv('ov-stage');
  const hasGim = !!((st.terrain && st.terrain.kind !== 'none') || (st.subgoal && st.subgoal.id));
  const ps = rt.pendingStage = { no: st.id, until: rt.now() + (rt.qa.noDelay ? 0 : (hasGim ? 3800 : 2600)), at: rt.now(), ready: false };
  // Give the intro card a paint before opening the audio device. Only start
  // the beat clock in startRun, even when the player skips the card early.
  const audioReady = new Promise(resolve => {
    if (!rt.audio || rt.qa.mute || rt.qa.noDelay) { resolve(); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        if (rt.pendingStage === ps && !rt.qa.mute && !rt.qa.noDelay) rt.audio.resume();
      } catch (error) {
        console.warn('Audio preparation failed:', error);
      } finally {
        resolve();
      }
    }));
  });
  /* 소개 카드가 떠 있는 동안 무대를 짓고 셰이더를 데운다 — 카드가 걷힌 뒤 멈추지 않게. */
  if (rt.three && (!rt.three.map || rt.three.map.stageId !== st.id || rt.three.map.id !== st.map)) { rt.applyStageAtmo(st); rt.switchMap(st.map, st.id); }
  const stageReady = Promise.race([
    Promise.resolve(rt.three && rt.three._mapP).then(() => rt.qa.skipWarm ? null : warmShaders()).catch(() => null),
    new Promise(resolve => setTimeout(resolve, 2200))
  ]);
  const audioCap = Promise.race([audioReady, new Promise(resolve => setTimeout(resolve, 600))]);
  Promise.allSettled([stageReady, audioCap]).then(() => {
    ps.ready = true;
    if (rt.pendingStage === ps && rt.now() >= ps.until) goStageNow(true);
  });
  rt.perfMark('beginStage', performance.now() - _t0, { stage: st.id });
  return st.id;
}
function goStageNow(force) {
  if (!rt.pendingStage) return null;
  /* 카드를 눌러 넘겨도 무대가 다 지어질 때까지는 기다렸다가 바로 시작한다. */
  if (!rt.pendingStage.ready && force !== true) {
    rt.pendingStage.until = Math.min(rt.pendingStage.until, rt.now());
    $('btnStageGo').textContent = '무대 준비 중…';
    return null;
  }
  const n = rt.pendingStage.no;
  rt.pendingStage = null;
  try { startRun({ stage: n }); } catch (e) { console.error('[심안] startRun 오류:', e); rt.toast('출전 오류: ' + (e && e.message || e)); rt.showOv('ov-title'); }
  return n;
}
function spawnPool() {
  if (!rt.S) return unlockedShapes(1);
  if (rt.S.sandbox) return rt.SHAPE_UNLOCK.slice();
  if (rt.S.practiceT > 0 && rt.S.practiceSpawns > 0 && rt.S.practiceShape) return [rt.S.practiceShape];
  return (rt.S.pool && rt.S.pool.length) ? rt.S.pool.slice() : unlockedShapes(rt.S.runNo || 1);
}
function leastUsedShape() {
  const pool = spawnPool();
  const counts = {};
  pool.forEach(function (sh) { counts[sh] = 0; });
  livingMarks().forEach(function (s) {
    if (s.isBoss) return;
    const sh = spiritShape(s);
    if (counts[sh] != null) counts[sh]++;
  });
  let min = 99, best = pool.slice();
  pool.forEach(function (sh) {
    const n = counts[sh] || 0;
    if (n < min) { min = n; best = [sh]; }
    else if (n === min) best.push(sh);
  });
  return best[Math.floor(Math.random() * best.length)];
}
function pickSeq(n) {
  /* 보스의 도형 순서는 판 전체 기호를 고르게 섞어 쓴다(같은 모양 연속 금지). */
  const src = (rt.S && rt.S.pool && rt.S.pool.length) ? rt.S.pool : spawnPool();
  const pool = src.slice();
  if (!pool.length) return ['hline'];
  const a = [];
  let bag = [];
  while (a.length < n) {
    if (!bag.length) {
      bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
      if (a.length && bag.length > 1 && bag[0] === a[a.length - 1]) { const t = bag[0]; bag[0] = bag[1]; bag[1] = t; }
    }
    a.push(bag.shift());
  }
  return a;
}

function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const apx = px - ax, apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  let t = ab2 < 1e-6 ? 0 : (apx * abx + apz * abz) / ab2;
  t = rt.clamp(t, 0, 1);
  const qx = ax + abx * t, qz = az + abz * t;
  return Math.hypot(px - qx, pz - qz);
}

function projectXZ(x, z, y) {
  if (!rt.three || !rt.three.camera) return { x: 0, y: 0 };
  const box = viewBox();
  if (!rt._proj.v) rt._proj.v = new rt.THREE.Vector3();
  rt._proj.v.set(x, y == null ? 0.4 : y, z).project(rt.three.camera);
  return { x: (rt._proj.v.x * 0.5 + 0.5) * box.width, y: (-rt._proj.v.y * 0.5 + 0.5) * box.height };
}
/* 화면 상자(#app)는 뷰포트를 꽉 채우므로, 창 크기가 그대로면 다시 재지 않는다.
   예전에는 projectXZ 가 호출될 때마다 getBoundingClientRect 를 불러 한 프레임에 150~250번
   레이아웃을 강제했다(모바일에서 프레임 비용의 큰 몫). */
const _vb = { width: 375, height: 667, left: 0, top: 0 };
let _vbKey = '';
function viewBox() {
  const key = (window.innerWidth || 0) + 'x' + (window.innerHeight || 0) + 'x' + (window.devicePixelRatio || 1);
  if (key !== _vbKey) {
    const host = $('app') || $('ink');
    if (!host) return _vb;
    const r = host.getBoundingClientRect();
    _vb.width = r.width; _vb.height = r.height; _vb.left = r.left; _vb.top = r.top;
    _vbKey = key;
  }
  return _vb;
}
function invalidateViewBox() { _vbKey = ''; }
function heroScreen() {
  const y = (rt.three && rt.three.heroSpr && rt.three.heroSpr.userData && rt.three.heroSpr.userData.worldH)
    ? rt.three.heroSpr.userData.worldH * 0.45 : 0.85;
  return projectXZ(rt.S.hero.x, rt.S.hero.z, y);
}
function screenRingPx() {
  const box = viewBox();
  const lv = (rt.S && rt.S.ringLv) || 0;
  /* 짧은 축 기준 — 세로·가로 어느 쪽에서도 시야 원이 화면의 같은 비율을 차지한다. */
  let frac = (rt.CFG.ringScreenFrac || 0.70) * (1 + (rt.CFG.ringBoost || 0.14) * lv);
  const capFrac = rt.CFG.ringMaxFrac || 0.90;
  const short = Math.min(box.width, box.height);
  const diam = Math.min(short * frac, short * capFrac);
  return Math.max(40, diam / 2);
}
function unprojectToY(sx, sy, y0) {
  if (!rt.three || !rt.three.camera) return { x: rt.S && rt.S.hero ? rt.S.hero.x : 0, z: rt.S && rt.S.hero ? rt.S.hero.z : 0 };
  const box = viewBox();
  if (!rt._proj.a) { rt._proj.a = new rt.THREE.Vector3(); rt._proj.b = new rt.THREE.Vector3(); }
  const ndcX = (sx / Math.max(1, box.width)) * 2 - 1;
  const ndcY = -(sy / Math.max(1, box.height)) * 2 + 1;
  rt._proj.a.set(ndcX, ndcY, 0).unproject(rt.three.camera);
  rt._proj.b.set(ndcX, ndcY, 1).unproject(rt.three.camera);
  const dx = rt._proj.b.x - rt._proj.a.x, dy = rt._proj.b.y - rt._proj.a.y, dz = rt._proj.b.z - rt._proj.a.z;
  if (Math.abs(dy) < 1e-6) return { x: rt.S.hero.x, z: rt.S.hero.z };
  const k = (y0 - rt._proj.a.y) / dy;
  return { x: rt._proj.a.x + dx * k, z: rt._proj.a.z + dz * k };
}
/* 혼령의 기호가 놓인 월드 좌표(구슬 중심). 혼령 그룹은 좀비 머리 위로 떠 있으므로 그 높이를 더한다. */
function bellWorld(s) {
  const off = (s && s.obj && s.obj.userData && s.obj.userData.bellLocal) || { x: 0, y: 1 };
  const g = (s && s.obj && s.obj.position) || { x: (s && s.x) || 0, y: 0, z: (s && s.z) || 0 };
  return { x: g.x, y: g.y + (off.y || 1), z: g.z };
}
function bellScreen(s) {
  const b = bellWorld(s);
  return projectXZ(b.x, b.z, b.y);
}
function screenAngleTo(sx, sy, from) {
  return Math.atan2(sy - from.y, sx - from.x);
}
function strokeScreenDir(pts) {
  if (!pts || pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 8) return null;
  return { x: dx / L, y: dy / L };
}
function strokeAimDir(pts, type) {
  if (!pts || pts.length < 2) return null;
  if (type === 'vee') {
    const ap = rt.G.veeApex(pts);
    if (!ap.dir || ap.depth < 8) return strokeScreenDir(pts);
    return ap.dir;
  }
  return strokeScreenDir(pts);
}
/* 자동 추격기(V·⚡)의 대상 선택: 위협도 우선 — 예고 중 > 보스 > 가까운 것 > 마무리 가능. */
function threatScore(s, from) {
  if (!s) return 0;
  let k = 0;
  if (s.isBoss && s.state !== 'clones') k += 30; /* 분신 중에는 V·⚡ 자동 조준이 진짜를 알려 주지 않는다 */
  if (s.obj && s.obj.userData && s.obj.userData.teleOn) k += 20;
  k += 40 / (1 + rt.dist(s, from));
  if (s.hp != null && s.hp <= (rt.S ? rt.dashDmg() : 2.5)) k += 8;
  return k;
}
/* v0.64: 화면에 제스처 표시(혼령)가 실제로 나타난 대상만 일섬으로 잡는다.
   방금 스폰돼 투명도 0이거나(age < 0.14) 화면 밖/심안 암흑 너머에 숨은 대상에 연속 일섬이 발동하는 버그 차단 */
function isSpiritVisibleForDash(s) {
  if (!s || !s.alive) return false;
  if (rt.qa.noDelay) return true;
  if (s.obj && s.obj.visible === false) return false;
  const isBossOrTotem = !!(s.isBoss || s.worldAnchor || (s.target && (s.target.isBoss || s.target.isTotem)));
  if (isBossOrTotem) return true;
  if (!isOnScreen(s, 14)) return false;
  if ((s.age || 0) < 0.14) return false;
  if (rt.S && rt.S.hero && !rt.arenaActive()) {
    const tgt = (s.target && s.target.alive) ? s.target : s;
    if (rt.dist(tgt, rt.S.hero) > ringR() * 1.18) return false;
  }
  return true;
}
function pickSpirits(shape, n, from, dir, exclude) {
  from = from || (rt.S && rt.S.hero);
  const skip = exclude || [];
  const marks = livingMarks();
  const zone = [], boss = [], on = [], off = [];
  for (let i = 0; i < marks.length; i++) {
    const s = marks[i];
    if (spiritShape(s) !== shape || skip.indexOf(s) >= 0 || !isSpiritVisibleForDash(s)) continue;
    if (s.zoneTag) zone.push(s);
    else if (s.isBoss) boss.push(s);
    else if (isOnScreen(s, 20)) on.push(s);
    else off.push(s);
  }
  let rest = on.length ? on : off;
  const heroScr = projectXZ(from.x, from.z);
  function sortRest(arr) {
    if (arr.length <= 1) return arr;
    if (dir && (dir.x || dir.y)) {
      let dMax = 1;
      for (let i = 0; i < arr.length; i++) {
        const d = rt.dist(arr[i], from);
        if (d > dMax) dMax = d;
      }
      const cone = rt.CFG.aimConeCos || 0.5;
      const wN = rt.CFG.aimNearW == null ? 0.35 : rt.CFG.aimNearW;
      const pick = [];
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        const va = projectXZ(s.x, s.z);
        const da = Math.hypot(va.x - heroScr.x, va.y - heroScr.y) || 1;
        const cos = ((va.x - heroScr.x) / da) * dir.x + ((va.y - heroScr.y) / da) * dir.y;
        if (cos >= cone) pick.push({ s: s, score: cos - wN * (rt.dist(s, from) / dMax) });
      }
      if (!pick.length) {
        arr.sort(function (a, b) { return rt.dist(a, from) - rt.dist(b, from); });
        return arr;
      }
      pick.sort(function (a, b) { return b.score - a.score; });
      const out = new Array(pick.length);
      for (let i = 0; i < pick.length; i++) out[i] = pick[i].s;
      return out;
    }
    /* 방향이 없는 모양(V·Z)은 위협도 순위로 고른다. */
    arr.sort(function (a, b) { return threatScore(b.target, from) - threatScore(a.target, from); });
    return arr;
  }
  rest = sortRest(rest);
  if (rt.qa.noDelay && rest.length < n && on.length && off.length) rest = rest.concat(sortRest(off));
  return zone.concat(boss, rest).slice(0, Math.max(0, n));
}
function spiritShape(s) {
  if (!s) return null;
  /* 기물은 제 무늬를 지킨다(한 가지 종도 덮지 않는다). */
  if (s.kind === 'spirit' && s.target && s.target.isTotem) return s.target.shape;
  if (rt.S && rt.S.bellT > 0 && rt.S.bellShape) return rt.S.bellShape;
  if (s.kind === 'spirit' && s.target && s.target.isClone && rt.S && rt.S.boss && rt.S.boss.alive) return rt.S.boss.seq[rt.S.boss.seqI] || s.shape;
  /* v0.31 §3.2 강적 깨는 법: 갑이 깨지거나 돌에 금이 가면 혼령 무늬가 판 중에 바뀐다. */
  if (s.kind === 'spirit' && s.target && s.target.alive && s.target.shapeOv) return s.target.shapeOv;
  if (s.kind === 'spirit' && s.target && s.target.isBoss && s.target.alive && s.target.state === 'seal') return 'star';
  if (s.kind === 'spirit' && s.target && s.target.isBoss && s.target.alive && s.target.seq) {
    return s.target.seq[s.target.seqI] || s.shape;
  }
  /* 정예 봉인 순서: 지금 차례의 무늬만 혼령에 뜬다. */
  if (s.kind === 'spirit' && s.target && s.target.alive && s.target.seq && s.target.seqI != null) {
    return s.target.seq[s.target.seqI] || s.shape;
  }
  return s.isBoss ? s.seq[s.seqI] : s.shape;
}
function startBell(shape, dur) {
  if (!rt.S) return;
  rt.S.bellShape = shape || spawnPool()[Math.floor(Math.random() * spawnPool().length)];
  /* v0.23: 바닥에서 주운 종도 만종(萬鐘) 진화를 먼저 판정한다 — 진화가 지속시간을 늘린다. */
  rt.checkEvolutions({ bell: true });
  const base = dur != null ? dur : rt.CFG.bellDur;
  rt.S.bellT = (rt.S.evo && rt.S.evo.myriadBell) ? Math.max(base, rt.CFG.bellMyriadDur || 12) : base;
  rt.S.bellCine = false;
  livingMarks().forEach(function (s) {
    if (s.obj) {
      if (rt.art.setSpiritShape) rt.art.setSpiritShape(s.obj, rt.S.bellShape);
      if (rt.art.setAura) rt.art.setAura(s.obj, true);
    }
  });
  rt.beginOnebell();
  rt.toast('모든 종이 ' + (rt.SHAPE_MARK[rt.S.bellShape] || '') + ' 모양이 됐습니다');
  rt.renderHud();
}
function endBell() {
  if (!rt.S) return;
  rt.S.bellT = 0; rt.S.bellShape = null;
  livingMarks().forEach(function (s) {
    if (s.obj) {
      if (rt.art.setSpiritShape) rt.art.setSpiritShape(s.obj, spiritShape(s));
      if (rt.art.setAura) rt.art.setAura(s.obj, false);
    }
  });
  rt.endOnebell();
  rt.renderHud();
}
function setDashElem(el) {
  if (!rt.S) return;
  rt.S.dashElem = el || null;
  rt.renderHud();
}
/* ---------- v0.23 원소 각인 · 임시 부적 ----------
   레벨업 카드 = 원소 각인 Lv1~3(영구), 바닥 부적 = 12초 임시 부여.
   둘을 분리해 바닥 부적이 키운 빌드를 덮어쓰지 않는다. */
function elemLv(el) { return (rt.S && rt.S.elemLv && rt.S.elemLv[el]) || 0; }
function elemNameOf(el) { return el === 'ice' ? '얼음' : el === 'fire' ? '화염' : el === 'poison' ? '독' : ''; }
function curElem() {
  if (!rt.S) return null;
  if (rt.S.tempElem && rt.S.tempElem.t > 0) return rt.S.tempElem.el;
  /* §5.4 두 번째 원소 칸: 일섬마다 두 원소가 번갈아 실린다. */
  const sl = rt.S.elemSlots || [];
  if (sl.length >= 2) return sl[(rt.S.elemIdx || 0) % 2];
  return rt.S.dashElem;
}
/** §5.4 원소 칸: 각인 하나가 Lv2가 되면 두 번째 칸이 열린다. */
function refreshElemSlots() {
  if (!rt.S) return [];
  rt.S.elemOrder = rt.S.elemOrder || [];
  ['ice', 'fire', 'poison'].forEach(function (el) {
    if (elemLv(el) > 0 && rt.S.elemOrder.indexOf(el) < 0) rt.S.elemOrder.push(el);
  });
  const maxLv = Math.max(elemLv('ice'), elemLv('fire'), elemLv('poison'));
  rt.S.elemSlotN = maxLv >= 2 ? 2 : 1;
  rt.S.elemSlots = rt.S.elemOrder.slice(0, rt.S.elemSlotN);
  if (rt.S.elemSlots.length) rt.S.dashElem = rt.S.elemSlots[0];
  return rt.S.elemSlots;
}
function elemIceDur() { return (rt.CFG.iceDur || 2.5) + (rt.CFG.iceDurStep || 0.5) * Math.max(0, elemLv('ice') - 1); }
function elemShatterDmg() { return (rt.CFG.shatterDmg || 4) + (rt.CFG.shatterStep || 1) * Math.max(0, elemLv('ice') - 1); }
function frostImpact(lv) { return 1 + .5 * Math.max(0,lv-1); }
function fireImpact(lv) { return 2 + Math.max(0, lv - 1); }
function elemBurnDur() { return (rt.CFG.burnDur || 3) + (rt.CFG.burnDurStep || 0.5) * Math.max(0, elemLv('fire') - 1); }
function elemBurnDmg() { return (rt.CFG.burnDmg || 1) + (rt.CFG.burnDmgStep || 0.3) * Math.max(0, elemLv('fire') - 1); }
function elemPoisonMax() { return Math.round((rt.CFG.poisonMax || 5) + (rt.CFG.poisonMaxStep || 1) * Math.max(0, elemLv('poison') - 1)); }
function elemPoisonDmg() { return (rt.CFG.poisonDmgPer || 1) + (rt.CFG.poisonDmgStep || 0.2) * Math.max(0, elemLv('poison') - 1); }
function elemCloudR() { return (rt.CFG.poisonCloudR || 2) + (rt.CFG.cloudRStep || 0.6) * Math.max(0, elemLv('poison') - 1); }
function triggerCinematic() {
  rt.S.slowT = rt.CFG.slowDur;
  if (rt.S.lastDash) rt.S.lastDash.cinematic = true;
  if (rt.S) rt.S.goldEdge = Math.max(rt.S.goldEdge || 0, 0.25);
  if (rt.three && rt.three.shaderFx3d && rt.S && rt.S.hero) {
    rt.three.shaderFx3d.spawnShockwave(rt.S.hero.x, rt.S.hero.z, { r0: 0.9, r1: 5.2, colorHex: 0xffd66e, coreHex: 0xfffce8, dur: 0.42 });
  }
  rt.onebellSlash();
}

const onebell = { phase: 'off', ink: 0, t: 0 };
  return { absorbAllItems, addSpirit, angDiff, applyRingBoost, assignSpiritTargets, beginStage, bellFootScreen, bellScreen, bellWorld, breakJar, clearEntities, closeArena, curElem, elemBurnDmg, elemBurnDur, elemCloudR, elemIceDur, elemLv, elemNameOf, elemPoisonDmg, elemPoisonMax, elemShatterDmg, ellipseScreenAt, endBell, fillStageIntro, fireImpact, firecrackerBurst, frostImpact, goStageNow, heroScreen, invalidateViewBox, isOnScreen, livingMarks, onebell, pickSeq, pickSpirits, placeSpirit, previewStageWorld, prewarmRecipes, projectXZ, refreshElemSlots, refreshRingPoly, refreshSpirits, refreshTitleHelp, renderStageSelect, rimErrorPx, ringR, ringScreenPts, screenAngleTo, screenOf, screenRingPx, segDist, setChapterArt, setDashElem, setSpiritCount, snapSpiritsToTargets, spawnBoss, spawnItem, spawnPool, spawnSpirit, spawnZombie, spiritShape, startBell, startRun, stepArena, stepSpirits, strokeAimDir, strokeScreenDir, titleChip, titlePrewarm, triggerCinematic, unlockedMax, unlockedShapes, unprojectToY, upcomingRun, viewBox, warmShaders, worldPerCss };
}
