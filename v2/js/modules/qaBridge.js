/* v2/js/modules/qaBridge.js — 심안: 묵검 v1.26 QA/디버그 프로브 브리지 */

export function createQaBridge(ctx) {
  return {
  CFG: ctx.CFG, SHAPE_MARK: ctx.SHAPE_MARK,
  get save() { return ctx.save; },
  get state() { return ctx.S; },
  get three() { return ctx.three; },
  get ready() { return !!this._ready; },
  set ready(v) { this._ready = v; },
  resetSave: function () {
    ctx.save.coins = 0; ctx.save.atkLv = 0; ctx.save.hpLv = 0; ctx.save.coinLv = 0;
    ctx.save.lastSeen = Date.now(); ctx.save.runs = 0;
    ctx.save.stage = 1; ctx.save.stars = {}; ctx.save.bestScore = 0;
    /* v0.30: 난이도·첫 경험 기록·연패도 초기화(새 세이브 검증용). */
    ctx.save.mode = 'jeongseok'; ctx.save.tutorialDone = 0; ctx.save.moments = {};
    ctx.save.streak = null; ctx.save.trainOffered = null;
    try { localStorage.removeItem(ctx.SAVE_KEY); } catch (e) {}
    ctx.persist(); ctx.renderHud(); ctx.refreshTitleHelp(); ctx.syncA11yUi();
  },
  setQa: function (o) { Object.keys(o || {}).forEach(function (k) { ctx.qa[k] = o[k]; }); if (ctx.audio) ctx.audio.setQuiet(ctx.qa.mute, ctx.qa.noDelay); },
  /* QA 훅: 시작 경로 계측(타이틀 예열·소개 카드 준비·판 시작·청크 재구축에 걸린 ms) */
  warmNow: function () { return ctx.warmShaders(); },
  perfLog: function () { return ctx.PERF_LOG.slice(); },
  perfClear: function () { ctx.PERF_LOG.length = 0; return true; },
  dashLatencyReport: function () {
    return {
      latency: ctx.S && ctx.S.dashLatency ? ctx.S.dashLatency.summary() : null,
      queue: ctx.S && ctx.S.inputQueue ? ctx.S.inputQueue.stats() : null,
      fps: ctx.fpsReport()
    };
  },
  warmInfo: function () { return ctx.warmInfo(); },
  /* QA: 지금까지 먹획을 구운 혼령 기호 */
  bakedShapes: function () { return ctx.art.spiritInkShapes ? ctx.art.spiritInkShapes() : null; },
  /* QA: 예열 후에도 '새 프로그램'을 만드는 레시피를 찾는다(각 레시피를 실제 렌더 경로에 넣고 컴파일). */
  warmCensus: function () {
    const out = [];
    const R = ctx.three.renderer, SC = ctx.three.scene, CAM = ctx.three.camera;
    ctx.prewarmRecipes().forEach(function (r) {
      const p0 = R.info.programs.length;
      let obj = null;
      try { obj = r.make(); } catch (e) { out.push({ label: r.label, err: String(e).slice(0, 40) }); return; }
      if (!obj) return;
      SC.add(obj);
      try { R.compile(SC, CAM); } catch (e) {}
      const dp = R.info.programs.length - p0;
      SC.remove(obj);
      if (dp !== 0) out.push({ label: r.label, dp: dp });
    });
    return out;
  },
  /* QA: 레시피별 제작 비용을 한 번에 하나씩 재며 window.__WR 에 쌓는다(페이지가 멈춰도 진행을 볼 수 있게). */
  warmProfile: function (only) {
    if (window.__WR) return window.__WR.length;
    window.__WR = [];
    const list = ctx.prewarmRecipes().filter(function (r) { return !only || String(r.label).indexOf(only) === 0; });
    let i = 0;
    const _runStep = function () {
      if (i >= list.length) { window.__WR.push({ done: true }); return; }
      const r = list[i++];
      const t0 = performance.now();
      let ok = true;
      try { r.make(); } catch (e) { ok = String(e).slice(0, 60); }
      window.__WR.push({ label: r.label, ms: Math.round(performance.now() - t0), ok: ok });
      setTimeout(_runStep, 0);
    };
    setTimeout(_runStep, 0);
    return 0;
  },
  startRun: ctx.startRun,
  spawnSpirit: function (o) { return ctx.spawnSpirit(o); },
  spawnBoss: function (o) { return ctx.spawnBoss(o); },
  spawnZombie: function (o) { return ctx.spawnZombie(o); },
  addSpirit: function (o) { return ctx.addSpirit(o || { force: true }); },
  setSpiritCount: function (n) { return ctx.setSpiritCount(n); },
  /* v0.27 QA 훅: 화면 통일·HUD·안내 문구 */
  lensInfo: function () {
    const w = ctx.three && ctx.three.view ? ctx.three.view.clientWidth : 0;
    const h = ctx.three && ctx.three.view ? Math.max(1, ctx.three.view.clientHeight) : 1;
    return {
      w: w, h: h, short: Math.min(w, h), fov: (ctx.three && ctx.three.camera && ctx.three.camera.fov) || 0,
      span: ctx.viewSpanFor(Math.min(w, h)), camDist: ctx.camDist(), arena: ctx.arenaActive(),
      ringPx: (ctx.lastMarkMetrics && ctx.lastMarkMetrics.ring && ctx.lastMarkMetrics.ring.px) || (ctx.S && ctx.S.ringPx) || 0,
      ringR: ctx.S ? ctx.ringR() : 0, focus: ctx.S && ctx.S.focus ? { x: ctx.S.focus.x, z: ctx.S.focus.z } : null,
      hero: ctx.S ? { x: ctx.S.hero.x, z: ctx.S.hero.z } : null
    };
  },
  hudInfo: function () {
    const rect = function (id) { const e = $(id); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: e.textContent }; };
    const hud = $('hud'), row = document.querySelector('#hud .row-top'), pips = $('hpPips');
    const doc = document.documentElement;
    return {
      hudH: hud ? Math.round(hud.getBoundingClientRect().height) : 0,
      overflowX: doc.scrollWidth - doc.clientWidth,
      rowOverflow: row ? row.scrollWidth - row.clientWidth : 0,
      hudOverflow: hud ? hud.scrollWidth - hud.clientWidth : 0,
      stage: rect('stageLabel'), timer: rect('timer'), coin: rect('coinLabel'), combo: rect('comboLabel'),
      chargeText: rect('chargeText'), dashLabel: rect('dashLabel'), lvl: rect('lvlLabel'),
      pips: pips ? { n: pips.querySelectorAll('i').length, h: Math.round(pips.getBoundingClientRect().height), w: Math.round(pips.getBoundingClientRect().width) } : null,
      hpMore: rect('hpMore'),
      vw: window.innerWidth, vh: window.innerHeight
    };
  },
  guideText: function () { const g = $('guide'); return g && g.classList.contains('show') ? g.textContent : ''; },
  /* 렌더 프레임 없이 카메라를 수렴시켜 투영만 잰다 — 헤드리스 소프트웨어 렌더 대책. */
  /* 보스 그림·윤곽광만 따로 세워 본다(결계 없이) — 헤드리스 결계 렌더가 느리기 때문. */
  bossVisualProbe: function (shape, varN, scale) {
    if (!ctx.three) return null;
    if (this._bv && this._bv.parent) ctx.three.scene.remove(this._bv);
    const obj = ctx.addEntityVisual('boss', shape || 'hline', { bossVar: varN, bossScale: scale == null ? 1 : scale });
    obj.position.set(0, 0, 0);
    ctx.three.scene.add(obj);
    if (ctx.art.tickChar) ctx.art.tickChar(obj, 'boss', 'idle', 0.016, 0, 1);
    this._bv = obj;
    const ud = obj.userData || {};
    return { hasRim: !!ud.rim, rimOp: ud.rim && ud.rim.material ? ud.rim.material.opacity : null, rimHex: ud.rimHex, worldH: ud.worldH, bell: ud.bellLocal, bossVar: varN == null ? 3 : varN, scale: scale == null ? 1 : scale };
  },
  /* 스테이지 분위기만 적용해 수치를 읽는다(맵 재구성 없이) — 12장 대비 검증용. */
  atmoProbe: function (n) {
    const st = ctx.stageOf(n || 1);
    ctx.applyStageAtmo(st);
    const T = ctx.three;
    return {
      stage: st.id, fog: T.scene.fog ? +T.scene.fog.density.toFixed(4) : null,
      moon: T.moon && T.moon.intensity, amb: T.amb && T.amb.intensity, hemi: T.hemi && T.hemi.intensity,
      fill: T.fill && T.fill.intensity, fogCol: st.atmo.fogCol, tint: st.atmo.tint,
      clear: T.scene.background && T.scene.background.getHexString ? '#' + T.scene.background.getHexString() : null
    };
  },
  camSettle: function (n) {
    if (!ctx.S || !ctx.three) return null;
    for (let i = 0; i < (n || 14); i++) { ctx.S.cam.x = ctx.S.hero.x; ctx.S.cam.z = ctx.S.hero.z; ctx.updateCam(0.2); }
    ctx.three.camera.updateMatrixWorld(true);
    return { focus: { x: +ctx.S.focus.x.toFixed(2), z: +ctx.S.focus.z.toFixed(2) }, pos: ctx.three.camera.position.toArray().map(function (v) { return +v.toFixed(2); }), fov: ctx.three.camera.fov };
  },
  overlayShown: function () { return ['ov-title', 'ov-shop', 'ov-result', 'ov-idle', 'ov-level', 'ov-stage', 'ov-pause', 'ov-codex', 'ov-train'].filter(function (k) { return $(k) && $(k).classList.contains('show'); }); },
  setMuted: ctx.setMuted,
  pauseRun: ctx.pauseRun,
  resumeRun: ctx.resumeRun,
  quitRun: ctx.quitRun,
  ringInfo: function () { ctx.updateMarks(); const rg = ctx.lastMarkMetrics && ctx.lastMarkMetrics.ring; return { r: ctx.ringR(), px: (rg && rg.px) || (ctx.S && ctx.S.ringPx), rx: rg && rg.rx, ry: rg && rg.ry, cx: rg && rg.cx, cy: rg && rg.cy, lv: ctx.S && (ctx.S.ringLv || 0), frac: rg && rg.frac, fov: (ctx.three && ctx.three.camera && ctx.three.camera.fov) || (ctx.CFG.fov), max: ctx.CFG.spiritMax, cssPx: ctx.lastMarkMetrics && ctx.lastMarkMetrics.cssPx, bellPx: ctx.lastMarkMetrics && ctx.lastMarkMetrics.bellPx, bodyPx: ctx.lastMarkMetrics && ctx.lastMarkMetrics.bodyPx, kind: rg && rg.kind, pts: rg && rg.pts, markStyle: ctx.lastMarkMetrics && ctx.lastMarkMetrics.markStyle }; },
  heroScreen: function () { return ctx.S && ctx.S.hero ? ctx.heroScreen() : { x: 0, y: 0 }; },
  unproject: function (sx, sy, y0) { return ctx.unprojectToY(sx, sy, y0 == null ? 0.2 : y0); },
  ellipseAt: function (theta) { if (!(ctx.S && ctx.S.ringR > 0)) ctx.applyRingBoost(); return ctx.ellipseScreenAt(theta, ctx.heroScreen()); },
  rimErrorPx: function (sx, sy) { if (!(ctx.S && ctx.S.ringR > 0)) ctx.applyRingBoost(); return ctx.rimErrorPx(sx, sy); },
  despawnZombie: function (id) {
    if (!ctx.S) return false;
    const z = (ctx.S.zombies || []).filter(function (q) { return q.id === id; })[0];
    if (!z) return false;
    z.alive = false;
    if (z.obj && ctx.three) ctx.three.scene.remove(z.obj);
    if (ctx.qa.noDelay) ctx.snapSpiritsToTargets();
    else ctx.assignSpiritTargets();
    return true;
  },


  markedList: ctx.livingMarks,
  assign: function () { ctx.assignSpiritTargets(); return ctx.livingMarks().length; },
  bellPans: function () { return (ctx.S && ctx.S.bellPans) || (ctx.audio && ctx.audio.lastPans && ctx.audio.lastPans()) || []; },
  readMessage: function (rec) { return (ctx.G.readMessage && ctx.G.readMessage(rec)) || ''; },
  spawnItem: function (o) { return ctx.spawnItem(o); },
  setHero: function (x, z) { if (!ctx.S) return; ctx.S.hero.x = x; ctx.S.hero.z = z; ctx.S.cam.x = x; ctx.S.cam.z = z; if (ctx.three.heroSpr) ctx.placeGroup(ctx.three.heroSpr, x, z); },
  setDashCount: function (n) { if (ctx.S) ctx.S.dashCount = n; ctx.renderHud(); },
  setElement: function (el) { ctx.setDashElem(el); ctx.checkEvolutions(); return ctx.S && ctx.S.dashElem; },
  startBell: function (shape, dur) { ctx.startBell(shape, dur); },
  setMap: function (id) { return ctx.switchMap(id); },
  getMap: function () { return ctx.three && ctx.three.map && { id: ctx.three.map.id, name: ctx.three.map.name, key: ctx.three.map.key }; },
  anim: ctx.Anim,
  strokeType: ctx.strokeType,
  shapePool: function () { return ctx.S ? (ctx.S.pool || []).slice() : []; },
  spawnPool: ctx.spawnPool,
  strokePath: ctx.finishStroke,
  /* v0.15~v0.17 QA 훅 */
  parry: function () { return ctx.doParry(null); },
  tap: function () { return ctx.doParry(null); },
  cleave: function (rec) { return ctx.castCleave(rec || null); },
  setCharge: function (n) { if (ctx.S) { ctx.S.charge = ctx.clamp(n | 0, 0, ctx.CFG.cleaveCharge || 100); ctx.renderHud(); } return ctx.S && ctx.S.charge; },
  addCharge: function (n) { ctx.addCharge(n); return ctx.S && ctx.S.charge; },
  fireWave: function (t) {
    const list = ctx.stageWaves();
    const w = list.filter(function (x) { return t == null || x.t === t; })[0];
    if (!w) return null;
    ctx.fireWave(w);
    return { t: w.t, spawned: (ctx.S && ctx.S.waveIds || []).length };
  },
  waves: function () { return ctx.stageWaves().map(function (w) { return { t: w.t, n: w.n, fired: !!(ctx.S && ctx.S.waveDone && ctx.S.waveDone[w.t]) }; }); },
  magnet: function (x, z) { return ctx.magnetPull({ x: x == null ? (ctx.S && ctx.S.hero.x) : x, z: z == null ? (ctx.S && ctx.S.hero.z) : z }); },
  evolve: function () { ctx.checkEvolutions(); return ctx.S && Object.keys(ctx.S.evo || {}); },
  setSpiritCap: function (n) { if (ctx.S) ctx.S.spiritCap = ctx.clamp(n | 0, 0, ctx.CFG.spiritMax || 5); return ctx.S && ctx.S.spiritCap; },
  preview: function () { return (ctx.S && ctx.S.preview) || null; },
  resolveTieAxis: function (dir) { return ctx.resolveTieAxis(dir); },
  inputBuf: function () { return (ctx.S && ctx.S.inputBuf) || null; },
  openLevelUp: function () { if (ctx.S) ctx.openLevelUp(); },
  spawnElite: function (o) {
    o = o || {};
    const z = ctx.spawnZombie({ type: 'elite', x: o.x, z: o.z, hp: o.hp });
    if (z) z.elite = true;
    return z;
  },
  bossInfo: function () {
    const b = ctx.S && ctx.S.boss;
    return b ? { state: b.state || 'walk', t: b.stateT || 0, seqI: b.seqI, seqN: b.seq.length, alive: b.alive, aim: b.aim || null, pat: b.pat || null, poise: b.poise, phase2: !!b.phase2, hidden: !!b.hidden, x: b.x, z: b.z,
      clones: (b.clones || []).filter(function (c) { return c.alive; }).map(function (c) { return { id: c.id, x: c.x, z: c.z }; }),
      chant: b.chant ? { seq: b.chant.seq.slice(), i: b.chant.i } : null, kiai: b.kiai ? { t: b.kiai.t, lock: b.kiai.lock } : null,
      shrink: ctx.S.arena && ctx.S.arena.shrink ? { r: ctx.S.arena.r, left: ctx.S.arena.shrink.pillars.filter(function (p) { return p.alive; }).length } : null,
      shots: (ctx.S.shots || []).length, gold: (ctx.S.shots || []).filter(function (q) { return q.gold; }).length } : null;
  },
  bossPattern: function (id) { const b = ctx.S && ctx.S.boss; if (!b || !b.alive) return null; ctx.startBossPattern(b, id); return b.state; },
  /* v0.27 QA: 걷기 무적 규칙을 프레임 없이 직접 확인한다(일섬→절단 경로와 같은 함수). */
  cutProbe: function (state) {
    const b = ctx.S && ctx.S.boss;
    if (!b || !b.alive) return null;
    if (state) { b.state = state; b.stateT = 0; }
    const before = b.seqI;
    ctx.cutBoss(b);
    return { state: b.state, before: before, after: b.seqI, alive: b.alive, judged: (document.getElementById('judgeFlash') || {}).textContent };
  },
  /* 장면(결계) 없이 상태별 절단 규칙만 추린다 — 헤드리스에서 결계 렌더가 느리기 때문. */
  bossArmorProbe: function () {
    if (!ctx.S) return null;
    const prev = ctx.S.boss;
    const out = {};
    const mk = function (state, extra) {
      const o = { id: -1, isBoss: true, alive: true, state: state, stateT: 0, seq: ['hline', 'hline', 'hline', 'hline', 'hline', 'hline'], seqI: 0, r: 1.1, poise: 3, x: 3, z: 0, obj: null, marked: false, hp: 99, clones: [] };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      return o;
    };
    ['walk', 'telegraph', 'kiai', 'slamTele', 'volleyTele', 'stun', 'groggy', 'charge', 'seal'].forEach(function (st) {
      const fake = mk(st, { firstWalk: false });
      ctx.S.boss = fake;
      ctx.cutBoss(fake);
      out[st] = { seqI: fake.seqI, state: fake.state, alive: fake.alive };
      ctx.S.boss = prev;
    });
    /* 첫 걷기(등장 직후)는 완전 무적 */
    let f = mk('walk', { firstWalk: true });
    ctx.S.boss = f; ctx.cutBoss(f); out['walk(first)'] = { seqI: f.seqI };
    /* 그 뒤 걷기: 한 번은 빈틈, 곸바로 다음은 튕김 */
    f = mk('walk', { firstWalk: false, walkCutAt: null });
    ctx.S.boss = f; ctx.cutBoss(f); const a1 = f.seqI; ctx.cutBoss(f); out['walk(빈틈)'] = { first: a1, second: f.seqI };
    ctx.S.boss = prev;
    return out;
  },
  bossTap: function () { return ctx.kiaiTap(); },
  bossStroke: function (type) { if (type === 'star') return ctx.sealStroke(); return ctx.chantStroke(type); },
  veilStroke: function (pts) { return ctx.veilStroke(pts); },
  dashAtBoss: function () { const b = ctx.S && ctx.S.boss; return b ? ctx.dashAtBoss(b, 'hline') : null; },
  dashAt: function (id) { const m = ctx.livingMarks().filter(function (q) { return q.target && q.target.id === id; })[0]; return m ? ctx.dashAtBoss(m, 'hline') : null; },
  screenOf: function (x, z, y) { return ctx.projectXZ(x, z, y || 0); },
  setBossState: function (st) {
    const b = ctx.S && ctx.S.boss;
    if (!b) return null;
    b.state = st; b.stateT = 0;
    if (st === 'telegraph') b.aim = { x: ctx.S.hero.x, z: ctx.S.hero.z };
    return b.state;
  },
  recognize: function (pts, opt) { return ctx.G.recognize(pts, opt); },
  /* v0.29 QA 훅: 빈틈 고리·기물 역류·타격감·공정성·기록 */
  gapInfo: function () { const b = ctx.S && ctx.S.boss; return b && b.alive ? ctx.gapInfo(b) : null; },
  gapBuf: function () { return ctx.S && ctx.S.gapBuf ? { type: ctx.S.gapBuf.type, age: Math.round(ctx.now() - ctx.S.gapBuf.t0) } : null; },
  reflectState: function () {
    const b = ctx.S && ctx.S.boss;
    return { ready: ctx.reflectReady(), used: !!(b && b.reflectUsed), flying: ((ctx.S && ctx.S.reflects) || []).length, totems: ctx.bossMinions().length, bossState: b ? b.state : null };
  },
  hitstop: function () { return ctx.S ? +(ctx.S.hitstop || 0).toFixed(3) : 0; },
  goldEdge: function () { return ctx.S ? +(ctx.S.goldEdge || 0).toFixed(3) : 0; },
  fairness: function () { return ctx.S ? { firstForcedHit: !!ctx.S.firstForcedHit, iframe: +(ctx.S.iframe || 0).toFixed(2), hp: ctx.S.hp, deathWhy: ctx.S.deathWhy || null } : null; },
  hurtForce: function (n, why, opts) { return ctx.heroHurtForce(n, why, opts); },
  /* §3.4 검증용: 보스와 주인공 사이에 임시 기물을 세운다(그림 없이 판정만). */
  fakeTotem: function (x, z) {
    if (!ctx.S) return null;
    const t = { id: ++ctx.S._id, kind: 'zombie', type: 'totem', shape: 'tri', x: x, z: z, r: 0.6, alive: true, hp: 1, isTotem: true, frozen: 0, burn: 0, poison: 0, stun: 0, marked: false, obj: null };
    ctx.S.zombies.push(t);
    return { id: t.id, x: t.x, z: t.z };
  },
  /* 결정론적 진행: rAF 없이 게임 로직만 n스텝 돌린다(헤드리스 3fps 환경의 시간 시험용). */
  stepN: function (n, dt) {
    if (!ctx.S) return null;
    n = n || 1; dt = dt || 1 / 60;
    for (var i = 0; i < n; i++) {
      ctx.S.hitstop = 0;
      if (ctx.S.tutorial) ctx.tickTutorial();
      if (ctx.S.playing && !ctx.S.paused) ctx.step(dt);
      ctx.stepDash(dt);
    }
    ctx.updateMarks();
    return { elapsed: +(ctx.S.elapsed || 0).toFixed(2), state: ctx.S.boss ? ctx.S.boss.state : null, hp: ctx.S.hp };
  },
  telemetryStats: function () { return ctx.telemetry.stats(); },
  telemetryEvents: function (name) { const all = ctx.telemetry.all(); return name ? all.filter(function (e) { return e.n === name; }) : all; },
  exportTelemetry: function () { ctx.telemetry.save(); return ctx.telemetry.exportJSON(); },
  clearTelemetry: function () { ctx.telemetry.clear(); return ctx.telemetry.stats(); },
  /* 보스전 시간 예산(§4.3)은 v0.30이지만, 지금 실측할 수 있게 재료를 내준다. */
  bossClock: function () {
    const b = ctx.S && ctx.S.boss, st = ctx.S && ctx.S.stage;
    return b && st ? { state: b.state, t: +(b.stateT || 0).toFixed(2), elapsed: +(ctx.S.elapsed || 0).toFixed(1), left: +(ctx.S.timeLeft || 0).toFixed(1),
      seqI: b.seqI, seqN: b.seq.length, poise: b.poise, phase2: !!b.phase2 } : null;
  },
  failHint: ctx.failHint,
  titleHelp: ctx.refreshTitleHelp,
  upcomingRun: ctx.upcomingRun,
  unlockedShapes: ctx.unlockedShapes,
  /* 스테이지 */
  STAGES: ctx.STAGES,
  stageOf: ctx.stageOf,
  stageInfo: function () {
    const st = ctx.curStage();
    return {
      id: st.id, name: st.name, sub: st.sub, map: st.map, time: st.time, bossAt: st.bossAt, eliteAt: st.eliteAt || 0,
      bossShapes: st.bossShapes, shapes: (st.shapes || []).slice(), spiritCap: st.spiritCap,
      spawn: st.spawn ? Object.assign({}, st.spawn) : null,
      waves: ctx.stageWaves().map(function (w) { return { t: w.t, n: w.n, elite: !!w.elite }; }),
      /* v0.32: 지형 규칙·별 3 과제·보스 개성 */
      terrain: st.terrain ? Object.assign({}, st.terrain) : null,
      terrainLine: st.terrain ? st.terrain.line : null,
      star3: st.star3 || null, bossName: st.bossName || '', bossVisual: ctx.bossVisualOf(st),
      bossPatterns: st.boss ? { p1: (st.boss.patterns || []).slice(), p2: (st.boss.phase2 || []).slice(), p3: (st.boss.phase3 || []).slice(), telegraph: st.boss.telegraph } : null,
      saveStage: ctx.save.stage, stars: Object.assign({}, ctx.save.stars), bestScore: ctx.save.bestScore
    };
  },
  /* v0.32 QA: 지형 엔진 — 규칙·발동 횟수·그 자리 판정 */
  terrainInfo: function () {
    if (!ctx.S) return null;
    const T = ctx.S.terrain || {};
    return {
      rule: T.kind, name: T.name, counts: Object.assign({}, T.counts || {}), ringMul: +(T.ringMul || 1).toFixed(4),
      moon: !!T.moon, moonT: +(T.moonT || 0).toFixed(1), revealT: +(T.revealT || 0).toFixed(2),
      stumbleT: +(T.stumbleT || 0).toFixed(2), rootT: +(T.rootT || 0).toFixed(2), wallT: +(T.wallT || 0).toFixed(1),
      lines: ctx.S.stage && ctx.S.stage.terrain ? ctx.S.stage.terrain.line : null
    };
  },
  zoneAt: function (x, z, stageNo) { return ctx.zoneAt(x, z, stageNo != null ? ctx.stageOf(stageNo) : null); },
  /* 소개 카드를 실제로 채워 그 한 줄을 읽는다(판은 건드리지 않는다) */
  stageIntroText: function (n) {
    const st = ctx.stageOf(n || (ctx.S && ctx.S.stage && ctx.S.stage.id) || 1);
    ctx.fillStageIntro(st);
    const el = $('stageTerrain');
    return { stage: st.id, terrain: el ? el.textContent : null, goal: $('stageGoal') ? $('stageGoal').textContent : null, tip: $('stageTip') ? $('stageTip').textContent : null };
  },
  terrainProbe: function (x, z, stageNo) {
    const st = stageNo != null ? ctx.stageOf(stageNo) : (ctx.S && ctx.S.stage) || ctx.stageOf(1);
    const out = [];
    const kinds = ['rubble', 'bamboo', 'bell', 'blood'];
    const cell = { rubble: [5.0, 11, 0.42, 0.9, 1.9], bamboo: [6.5, 37, 0.55, 2.0, 3.4], bell: [10.0, 83, 0.4, 0.5, 0.5], blood: [8.0, 97, 0.55, 2.4, 3.2] };
    ctx.tPatchesNear(x, z, 12, 7.0, 71, 1, 0, 0);
    kinds.forEach(function (k) {
      const c = cell[k];
      ctx.tPatchesNear(x, z, 12, c[0], c[1], c[2], c[3], c[4]).slice(0, 4).forEach(function (p) { out.push({ kind: k, x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: +p.r.toFixed(2), key: p.key }); });
    });
    if (ctx.tWaterAt(x, z)) out.push({ kind: 'water', x: x, z: +ctx.tWaterCenter(x).toFixed(2), r: 2.1 });
    if (ctx.tRootAt(x, z)) out.push({ kind: 'root' });
    return { stage: st.id, rule: st.terrain ? st.terrain.kind : null, at: ctx.zoneAt(x, z, st), zones: out };
  },
  /* 한 장의 지형 조각을 영웅 앞에 강제로 세워 두는 QA 도구(그 장판 위로 일섬·착지 시험) */
  warpHeroToZone: function (kind) {
    if (!ctx.S) return null;
    const want = kind || (ctx.S.terrain && ctx.S.terrain.kind);
    for (let r = 0.5; r <= 40; r += 0.35) {
      for (let i = 0; i < 48; i++) {
        const a = i / 24 * Math.PI * 2;
        const x = ctx.S.hero.x + Math.cos(a) * r, z = ctx.S.hero.z + Math.sin(a) * r;
        const zz = ctx.zoneAt(x, z);
        const hit = zz && (zz.kind === want);
        if (hit) {
          ctx.S.hero.x = x; ctx.S.hero.z = z; ctx.S.cam.x = x; ctx.S.cam.z = z;
          if (ctx.three && ctx.three.heroSpr) ctx.placeGroup(ctx.three.heroSpr, x, z);
          return { x: +x.toFixed(2), z: +z.toFixed(2), zone: zz };
        }
      }
    }
    return null;
  },
  /* v0.32 QA: 별 3 판정(현재 상태)과 7.1 난이도 지수 */
  starProbe: function (stageNo) {
    const st = stageNo != null ? ctx.stageOf(stageNo) : (ctx.S && ctx.S.stage) || ctx.stageOf(1);
    const info = ctx.star3Info(st);
    return {
      stage: st.id, hits: ctx.S ? (ctx.S.hits || 0) : 0, hpPct: ctx.S ? +(ctx.S.hp / Math.max(1, ctx.maxHp())).toFixed(3) : null,
      comboMax: ctx.S ? (ctx.S.comboMax || 0) : 0, star2: ctx.S ? (ctx.S.hp / Math.max(1, ctx.maxHp()) >= 0.5 || (ctx.S.hits || 0) <= (ctx.CFG.star2Hits || 3)) : null,
      star3: info, stars: ctx.S ? ctx.starsFor(!!ctx.S.won) : null, cap: ctx.starCap()
    };
  },
  difficultyCurve: function () {
    return ctx.STAGES.map(function (st) {
      const B = st.boss || {};
      const mix = (st.mix && st.mix.length) ? st.mix[st.mix.length - 1][1] : {};
      const keys = Object.keys(mix).filter(function (k) { return k !== 'imp' && k !== 'brute'; });
      const variant = keys.reduce(function (a, k) { return a + (mix[k] || 0); }, 0);
      const tele = B.telegraph || 1.1, shapes = st.bossShapes || 3, ms = (st.spawn && st.spawn.ms) || 900;
      const D = 0.35 * (1.35 / tele) + 0.25 * (shapes / 6) + 0.25 * (900 / ms) + 0.15 * (variant / 0.5);
      return { stage: st.id, tele: tele, shapes: shapes, ms: ms, variant: +variant.toFixed(2), D: +D.toFixed(3) };
    });
  },
  bossInfoPlus: function () {
    const b = ctx.S && ctx.S.boss;
    if (!b) return null;
    return {
      stage: ctx.S.stageNo, name: ctx.S.stage && ctx.S.stage.bossName, var: ctx.S.bossVar,
      state: b.state, phase: b.phase || 1, phase2: !!b.phase2, phase3: !!b.phase3, patI: b.patI || 0,
      clash: b.clash ? { i: b.clash.i, shape: b.clash.shape, t: +b.clash.t.toFixed(2), need: b.clash.need } : null,
      mimic: b.mimic ? { dir: b.mimic.dir, t: +b.mimic.t.toFixed(2) } : null,
      shuffle: b.shuffle ? { t: +b.shuffle.t.toFixed(2), gold: +b.shuffle.gold.toFixed(2), locked: !!b.shuffle.locked } : null,
      shape: b.shape, arena: ctx.S.arena ? +ctx.S.arena.r.toFixed(2) : null, phaseTele: ctx.S.phaseTele,
      clashWin: ctx.S.clashWin || 0, shuffleLock: ctx.S.shuffleLock || 0, goldReflect: ctx.S.goldReflectN || 0,
      card: $('bossCard') ? { hidden: $('bossCard').hidden, show: $('bossCard').classList.contains('show'), name: $('bossCardName') ? $('bossCardName').textContent : null } : null
    };
  },
  codexInfo: function () { return JSON.parse(JSON.stringify(ctx.save.codex || { mon: {}, boss: {}, evo: {}, pat: {} })); },
  /* v0.33 메타 훅 */
  metaInfo: function () {
    return {
      version: ctx.save.version, coins: ctx.save.coins,
      sword: { equipped: ctx.save.swords.equipped, owned: Object.keys(ctx.save.swords.owned || {}), fx: ctx.swordFx(ctx.save), name: ctx.swordOf(ctx.save).name },
      relics: { equipped: ctx.equippedRelics(ctx.save).slice(), owned: Object.keys(ctx.save.relics.owned || {}), slots: ctx.relicSlots(ctx.save) },
      cloaks: { equipped: (ctx.save.cloaks && ctx.save.cloaks.equipped) || 'ink', owned: Object.keys((ctx.save.cloaks && ctx.save.cloaks.owned) || {}) },
      trails: { equipped: (ctx.save.trails && ctx.save.trails.equipped) || 'ink', owned: Object.keys((ctx.save.trails && ctx.save.trails.owned) || {}) },
      skins: { equipped: (ctx.save.skins && ctx.save.skins.equipped) || 'none', owned: Object.keys((ctx.save.skins && ctx.save.skins.owned) || {}) },
      brush: { equipped: (ctx.save.brush && ctx.save.brush.equipped) || 'none', owned: Object.keys((ctx.save.brush && ctx.save.brush.owned) || {}) },
      codex: ctx.codexCounts(ctx.save), codexBonus: ctx.codexBonus(ctx.save),
      train: { seen: (ctx.save.train && ctx.save.train.seen) || 0, stats: JSON.parse(JSON.stringify((ctx.save.train && ctx.save.train.stats) || {})) },
      relicFlags: { mirror: ctx.relicOn(ctx.save, 'mirror'), blood: ctx.relicOn(ctx.save, 'blood'), tower: ctx.relicOn(ctx.save, 'tower'), eye: ctx.relicOn(ctx.save, 'eye'), oldbell: ctx.relicOn(ctx.save, 'oldbell'), needle: ctx.relicOn(ctx.save, 'needle'), sheath: ctx.relicOn(ctx.save, 'sheath'), echo_bell: ctx.relicOn(ctx.save, 'echo_bell'), mono_seal: ctx.relicOn(ctx.save, 'mono_seal'), multi_seal: ctx.relicOn(ctx.save, 'multi_seal') },
      maxHp: ctx.S ? ctx.maxHp() : null, coinMult: ctx.coinMult(), dashDmg: ctx.S ? +ctx.dashDmg().toFixed(3) : null, ringR: ctx.S ? +ctx.ringR().toFixed(3) : null
    };
  },
  giveCoins: function (n) { ctx.save.coins += n | 0; ctx.persist(); ctx.renderHud(); return ctx.save.coins; },
  buySword: function (id) { return ctx.buySword(id); },
  equipSword: function (id) { return ctx.equipSword(id); },
  buyRelic: function (id) { return ctx.buyRelic(id); },
  equipRelic: function (id) { return ctx.toggleRelic(id); },
  buySkin: function (kind, id) { return ctx.buyCosmetic(kind === 'brush' ? 'trail' : 'cloak', id); },
  equipSkin: function (kind, id) { return ctx.equipCosmetic(kind === 'brush' ? 'trail' : 'cloak', id); },
  buyCosmetic: function (kind, id) { return ctx.buyCosmetic(kind, id); },
  equipCosmetic: function (kind, id) { return ctx.equipCosmetic(kind, id); },
  unlockBlueprint: function (stageNo) { ctx.save.stars = ctx.save.stars || {}; ctx.save.stars[stageNo] = Math.max(ctx.save.stars[stageNo] || 0, 1); ctx.persist(); return ctx.save.stars; },
  codexRecord: function (kind, id) {
    if (kind === 'mon') ctx.codexMon(id);
    else if (kind === 'evo') ctx.codexEvo(id);
    else if (kind === 'boss') ctx.codexBoss(ctx.stageOf(id | 0));
    else if (kind === 'pat') ctx.notePatSeen(id, 'qa');
    return this.codexInfo();
  },
  trainInfo: function (shape) {
    if (!shape) return { shape: ctx.train.shape, stats: (ctx.save.train && ctx.save.train.stats) || {}, seen: (ctx.save.train && ctx.save.train.seen) || 0, need: ctx.train.need, result: ctx.train.result, overlay: $('ov-train') ? $('ov-train').classList.contains('show') : null };
    return ctx.trainStatsOf(shape);
  },
  trainStroke: function (pts, shape) {
    if (shape) ctx.train.shape = shape;
    ctx.train.pts = (pts || []).slice();
    trainFinish();
    return { result: ctx.train.result, stats: ctx.trainStatsOf(ctx.train.shape) };
  },
  shopInfo: function () { return { tab: ctx.shopTab, body: $('shopBody') ? $('shopBody').innerHTML.length : 0, statHidden: $('shopStatList') ? !!$('shopStatList').hidden : null }; },
  /* v0.34 QA 훅: 부목표 · 웨이브 · 정예 속성 · 도전 모드 · 풀/성능 */
  goalInfo: function () {
    const g = ctx.S && ctx.S.goal;
    if (!g) return null;
    return { id: g.id, label: g.label, t: +g.t.toFixed(2), ok: !!g.ok, fail: !!g.fail, hp: g.hp, hpMax: g.hpMax, n: g.n, need: g.need, win: g.win, at: g.at, shape: g.shape, ringMul: g.ringMul, pos: g.pos, ids: (g.ids || []).slice(), hud: $('goalLabel') ? $('goalLabel').textContent : '' };
  },
  goalSet: function (o) { if (ctx.S && ctx.S.goal) { Object.assign(ctx.S.goal, o); _goalHudCache = ''; ctx.renderGoalHud(); } return this.goalInfo(); },
  waveInfo: function () { return { form: ctx.S && ctx.S.waveForm, fired: ctx.S ? (ctx.S.wavesFired || []).slice() : [], ids: ctx.S ? (ctx.S.waveIds || []).length : 0, forms: ['circle', 'pincer', 'rows'] }; },
  eliteInfo: function () {
    return (ctx.S ? ctx.S.zombies.filter(function (z) { return z.alive && (z.elite || z.goalTarget); }) : []).map(function (z) {
      return { id: z.id, type: z.type, attr: z.eliteAttr || null, hp: +(+z.hp).toFixed(1), seqI: z.seqI, invuln: +(z.invuln || 0).toFixed(2), goal: !!z.goalTarget };
    });
  },
  challengeInfo: function () {
    const c = ctx.S && ctx.S.challenge;
    return {
      active: c || null, name: c ? (ctx.challengeOf(c) || {}).name : null,
      unlocks: ctx.CHALLENGES.map(function (x) { return { id: x.id, unlock: x.unlock, open: ctx.challengeUnlocked(x.id), record: ctx.challengeRecord(x.id) }; }),
      bossIdx: ctx.S ? (ctx.S.bossIdx || 0) : 0, endlessBossN: ctx.S ? (ctx.S.endlessBossN || 0) : 0, endlessKills: ctx.S ? (ctx.S.endlessKills || 0) : 0,
      pool: ctx.S ? (ctx.S.pool || []).slice() : [], timeLeft: ctx.S ? +(ctx.S.timeLeft || 0).toFixed(1) : null, records: Object.assign({}, ctx.save.records || {})
    };
  },
  startChallenge: function (id) { return ctx.startChallenge(id); },
  setStars: function (stageNo, n) { ctx.save.stars = ctx.save.stars || {}; ctx.save.stars[stageNo] = n | 0; ctx.persist(); return ctx.save.stars; },
  poolInfo: function () {
    const c = ctx.three && ctx.three.chunks;
    return { shots: (ctx.S && ctx.S.shots || []).length, shotPool: ctx.shotPool.length, hazards: (ctx.S && ctx.S.hazards || []).length, hazardPool: ctx.hazardPool.length, pillars: (ctx.S && ctx.S.zombies || []).filter(function (z) { return z.isPillar; }).length, totemPool: ctx.totemPool.length, drawCalls: ctx.three && ctx.three.renderer && ctx.three.renderer.info ? ctx.three.renderer.info.render.calls : null, chunks: c ? Object.assign({}, c.stats) : null };
  },
  trainOpen: function () { ctx.openTrain(); return this.trainInfo(); },
  trainClose: function () { ctx.closeTrain(); return true; },
  codexOpen: function () { ctx.renderCodex(); ctx.showOv('ov-codex'); ctx.refreshTitleHelp(); return this.codexInfo(); },
  shopTab: function (t) { ctx.shopTab = t || 'stat'; ctx.refreshShop(); ctx.showOv('ov-shop'); return this.shopInfo(); },
  /* v0.33 상세 프로브 */
  saveInfo: function () {
    let raw = null, bak = null;
    try { raw = localStorage.getItem(ctx.SAVE_KEY); bak = localStorage.getItem(ctx.SAVE_KEY + '.bak'); } catch (e) {}
    return { version: ctx.save.version, rawLen: raw ? raw.length : 0, bakLen: bak ? bak.length : 0, keys: Object.keys(ctx.save).sort() };
  },
  setSaveRaw: function (raw) { try { localStorage.setItem(ctx.SAVE_KEY, raw); } catch (e) {} return true; },
  reloadSave: function () { ctx.loadSave(); return this.saveInfo(); },
  relicProbe: function () {
    return { kiaiWin: ctx.bossPat().kiai ? +ctx.kiaiWin(ctx.bossPat().kiai).toFixed(2) : null, summonKeep: (((ctx.CFG.bossPat || {}).summon || {}).keep || 3) + (ctx.relicOn(ctx.save, 'totem') ? 1 : 0),
      bellVol: ctx.relicOn(ctx.save, 'oldbell') ? 1.5 : 1, perfectThresh: (ctx.CFG.perfectThresh || 0.8) - (ctx.relicOn(ctx.save, 'brush') ? 0.05 : 0),
      jarDouble: ctx.relicOn(ctx.save, 'jar'), eyeBell: ctx.relicOn(ctx.save, 'eye') ? 0.7 : 1, mirrorUsed: !!(ctx.S && ctx.S.mirrorUsed), beadsSlots: ctx.relicSlots(ctx.save) };
  },
  hurtProbe: function (n) { const h0 = ctx.S ? ctx.S.hp : 0; ctx.heroHurt(n || 1, 'QA'); return { hp0: h0, hp1: ctx.S ? ctx.S.hp : 0, lost: +(h0 - (ctx.S ? ctx.S.hp : 0)).toFixed(2), hits: ctx.S ? ctx.S.hits : 0 }; },
  breakJarProbe: function () { if (!ctx.three || !ctx.three.chunks) return null; const j = ctx.three.chunks.jars.filter(function (x) { return x.alive; })[0]; if (!j) return null; const n0 = (ctx.S.items || []).length; ctx.breakJar(j); return { items: (ctx.S.items || []).length - n0 }; },
  trainReset: function () { ctx.save.train = { stats: {}, seen: 0 }; ctx.persist(); return this.trainInfo(); },
  /* v0.32 QA: 지정한 지점으로 실제 일섬을 한 번 낸다(지형 훅·착지 훅을 게임과 같은 순서로 부른다). */
  qaDashTo: function (x, z) {
    if (!ctx.S || !ctx.S.playing) return null;
    const from = { x: ctx.S.hero.x, z: ctx.S.hero.z };
    ctx.S.lastDash = { type: 'hline', targets: [], hits: [], items: [], t0: ctx.now(), segs: [], elem: ctx.curElem(), cinematic: false, quality: 0 };
    const adj = ctx.onDashPath(from, { x: x, z: z });
    const rl = Math.hypot(x - from.x, z - from.z) || 1;
    const tl = Math.hypot(adj.to.x - from.x, adj.to.z - from.z);
    const u = ctx.clamp(tl / rl, 0, 1);
    const raw = { x: from.x + (x - from.x) * u, z: from.z + (z - from.z) * u };
    ctx.S.lastDash.segs.push({ from: from, to: raw, r: ctx.pathR() });
    ctx.S.lastDash.dmgMul = adj.dmgMul || 1;
    const d = { from: from, to: { x: raw.x, z: raw.z }, raw: raw, t: 0, dur: (ctx.CFG.dashDur || 0.16) + (adj.dur || 0), target: null, slash: null, judged: false, dmgMul: adj.dmgMul || 1 };
    ctx.S.hero.x = raw.x; ctx.S.hero.z = raw.z;
    if (ctx.three && ctx.three.heroSpr) ctx.placeGroup(ctx.three.heroSpr, raw.x, raw.z);
    ctx.resolveDash(d);
    ctx.landDash(d);
    ctx.S.dash = null;
    return { dur: d.dur, dmgMul: d.dmgMul, req: { x: x, z: z }, to: { x: +raw.x.toFixed(3), z: +raw.z.toFixed(3) }, len: +Math.hypot(raw.x - from.x, raw.z - from.z).toFixed(3), adj: { lenMul: adj.lenMul || 1, water: !!adj.water }, terrain: this.terrainInfo(), bounce: ctx.S.bounce ? { to: { x: +ctx.S.bounce.to.x.toFixed(3), z: +ctx.S.bounce.to.z.toFixed(3) }, dur: ctx.S.bounce.dur } : null };
  },
  /* 뿌리 묶임처럼 일섬 자체가 막히는지 확인용 */
  tryBeginDash: function (shape) {
    if (!ctx.S) return null;
    const r = ctx.beginDash(shape || 'hline', {});
    return { began: !!(r && r.targets && r.targets.length), bound: !!(r && r.bound), inputBuf: ctx.S.inputBuf ? ctx.S.inputBuf.type : null, rootT: +((ctx.S.terrain && ctx.S.terrain.rootT) || 0).toFixed(2) };
  },
  clashStroke: function (type) { return ctx.clashStroke(type); },
  killBoss: function () { if (ctx.S && ctx.S.boss && ctx.S.boss.alive) ctx.killZombie(ctx.S.boss, ctx.S.lastDash); return this.codexInfo(); },
  killById: function (id) { const z = (ctx.S.zombies || []).filter(function (q) { return q.id === (id | 0) && q.alive; })[0]; if (z) ctx.killZombie(z, ctx.S.lastDash); return !!z; },
  bossPhase: function (seqI) {
    const b = ctx.S && ctx.S.boss;
    if (!b) return null;
    b.seqI = seqI | 0;
    ctx.bossPhaseCheck(b);
    return this.bossInfoPlus();
  },
  terrainMuls: function () { return { speed: ctx.terrainSpeedMul(), coin: ctx.terrainCoinMul(), slowAt: ctx.S ? ctx.terrainSlowMul(ctx.S.hero) : 1, blocked: ctx.terrainDashingBlocked(), ringMul: ctx.S && ctx.S.terrain ? +(ctx.S.terrain.ringMul || 1).toFixed(4) : 1, ring: ctx.S ? +ctx.ringR().toFixed(3) : null }; },
  setCounter: function (k, n) {
    if (!ctx.S) return null;
    if (k === 'hits') ctx.S.hits = n | 0;
    else if (k === 'goldReflect') ctx.S.goldReflectN = n | 0;
    else if (k === 'clashWin') ctx.S.clashWin = n | 0;
    else if (k === 'shuffleLock') ctx.S.shuffleLock = n | 0;
    else if (ctx.S.terrain) { ctx.S.terrain.counts = ctx.S.terrain.counts || {}; ctx.S.terrain.counts[k] = n | 0; }
    return this.starProbe();
  },
  patCode: function () { return ctx.PAT_CODE.map(function (p) { return Object.assign({}, p); }); },
  /* v0.48 고정 아레나 검수: 무대 정보·영웅 위치·카메라·기물 통계 */
  arenaWorldInfo: function () {
    const c = ctx.three && ctx.three.chunks;
    if (!c) return null;
    const a = c.arena;
    return {
      fixed: !!c.stats.fixed, stageId: c.stageId,
      bounds: c.bounds ? { x: c.bounds.x, z: c.bounds.z, r: c.bounds.r } : null,
      stats: Object.assign({}, c.stats),
      props: a ? a.stats : null,
      spots: a ? a.spots.slice(0, 40) : [],
      screen: c.screenInfo ? c.screenInfo() : null,
      jars: c.jars.filter(function (j) { return j.alive; }).length,
      drawCalls: ctx.three.renderer && ctx.three.renderer.info ? ctx.three.renderer.info.render.calls : null,
      tris: ctx.three.renderer && ctx.three.renderer.info ? ctx.three.renderer.info.render.triangles : null
    };
  },
  qaCam: function (o) {
    if (!ctx.three) return null;
    ctx.QA_CAM = o ? { x: +(o.x || 0), y: +(o.y == null ? 8 : o.y), z: +(o.z || 0), tx: +(o.tx || 0), ty: +(o.ty == null ? 1 : o.ty), tz: +(o.tz || 0) } : null;
    return ctx.QA_CAM;
  },
  arenaDebug: function () {
    const c = ctx.three && ctx.three.chunks;
    if (!c || !c.arena || !c.arena.body) return null;
    const m = c.arena.body.material;
    const geo = c.arena.body.geometry;
    const col = geo.getAttribute('color');
    const z = geo.getAttribute('zone');
    const u = m.uniforms || {};
    return {
      hasColor: !!col, hasZone: !!z, verts: geo.getAttribute('position').count,
      col0: col ? [col.getX(0), col.getY(0), col.getZ(0)] : null,
      col100: col ? [col.getX(100), col.getY(100), col.getZ(100)] : null,
      zone100: z ? z.getX(100) : null,
      uAmb: u.uAmbCol ? u.uAmbCol.value.toArray() : null,
      uKey: u.uKeyCol ? u.uKeyCol.value.toArray() : null,
      uTexAmt: u.uTexAmt ? u.uTexAmt.value : null,
      uRamp: !!u.uRamp,
      prog: m.program ? 1 : 0
    };
  },
  heroArenaInfo: function () {
    if (!ctx.S || !ctx.S.hero) return null;
    const c = ctx.three && ctx.three.chunks;
    const b = c && c.bounds;
    return {
      hero: { x: +ctx.S.hero.x.toFixed(2), z: +ctx.S.hero.z.toFixed(2) },
      r: b ? +Math.hypot(ctx.S.hero.x - b.x, ctx.S.hero.z - b.z).toFixed(2) : null,
      bound: b ? b.r : null,
      cam: ctx.three && ctx.three.camera ? [+ctx.three.camera.position.x.toFixed(2), +ctx.three.camera.position.y.toFixed(2), +ctx.three.camera.position.z.toFixed(2)] : null,
      focus: ctx.S.focus ? { x: +ctx.S.focus.x.toFixed(2), z: +ctx.S.focus.z.toFixed(2) } : null,
      zombies: ctx.S.zombies ? ctx.S.zombies.filter(function (z) { return z.alive; }).map(function (z) { return +Math.hypot(z.x - (b ? b.x : 0), z.z - (b ? b.z : 0)).toFixed(1); }).sort(function (p, q) { return q - p; }).slice(0, 3) : null
    };
  },
  cameraPos: function () {
    const c = ctx.three && ctx.three.camera;
    return c ? { x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2), fov: c.fov } : null;
  },
  /* v0.22 QA 훅: 청크·항아리·결계·진화 */
  chunkInfo: function () {
    const c = ctx.three && ctx.three.chunks;
    if (!c) return null;
    return {
      stageId: c.stageId, center: { cx: c.center.cx, cz: c.center.cz }, stats: Object.assign({}, c.stats),
      jars: c.jars.map(function (j) { return { id: j.id, x: j.x, z: j.z, alive: j.alive, cx: j.cx, cz: j.cz }; }),
      heroChunk: ctx.S ? { cx: ctx.chunkOf(ctx.S.hero.x), cz: ctx.chunkOf(ctx.S.hero.z) } : null
    };
  },
  /* 시드 고정 확인: 같은 좌표를 다시 지으면 같은 소품 수·같은 항아리 자리가 나와야 한다. */
  chunkSeedInfo: function (cx, cz, stageId) {
    const d = ctx.buildChunkData(cx | 0, cz | 0, stageId || (ctx.three && ctx.three.chunks && ctx.three.chunks.stageId) || 1);
    let n = 0;
    Object.keys(d.buckets).forEach(function (k) { n += d.buckets[k].length; });
    return { seed: d.seed, props: n, jars: d.jars.map(function (j) { return [Math.round(j.x * 100) / 100, Math.round(j.z * 100) / 100]; }) };
  },
  jarInfo: function () {
    const c = ctx.three && ctx.three.chunks;
    if (!c) return null;
    return c.jars.map(function (j) { return { id: j.id, x: j.x, z: j.z, alive: j.alive }; });
  },
  breakJarAt: function (x, z, r) {
    const c = ctx.three && ctx.three.chunks;
    if (!c) return 0;
    const list = c.jarsNear(x, z, r == null ? 2.5 : r);
    list.forEach(ctx.breakJar);
    return list.length;
  },
  spawnJarDrop: function (kind) {
    if (!ctx.S) return null;
    return ctx.spawnItem({ type: kind || 'herb', x: ctx.S.hero.x + 1.2, z: ctx.S.hero.z });
  },
  arenaInfo: function () {
    const a = ctx.S && ctx.S.arena;
    return {
      active: !!a, x: a ? a.x : null, z: a ? a.z : null, r: a ? a.r : 0,
      heroDist: a && ctx.S ? Math.hypot(ctx.S.hero.x - a.x, ctx.S.hero.z - a.z) : null,
      hasMesh: !!(ctx.three && ctx.three.arena), bossAlive: !!(ctx.S && ctx.S.boss && ctx.S.boss.alive)
    };
  },
  firecracker: function () { return ctx.firecrackerBurst(); },
  absorbAll: function () { return ctx.absorbAllItems(null); },
  eliteEvent: function () { return ctx.spawnEliteEvent(); },
  /* 진화 효과 확인용: 착지 충격을 그 자리에서 일으킨다(실제 landingShock 경로). */
  landingProbe: function (x, z) {
    if (!ctx.S) return null;
    const at = { x: x == null ? ctx.S.hero.x : x, z: z == null ? ctx.S.hero.z : z };
    ctx.landingShock(at);
    return ctx.S.zombies.filter(function (zz) { return zz.alive; }).map(function (zz) {
      return { id: zz.id, hp: zz.hp, frozen: zz.frozen > 0, burn: zz.burn > 0, poison: zz.poison || 0 };
    });
  },
  /* 만독 쇄도 확인용: 독이 오른 적을 쓰러뜨린다. */
  poisonKillProbe: function (x, z) {
    if (!ctx.S) return null;
    const p = { x: x == null ? ctx.S.hero.x + 3 : x, z: z == null ? ctx.S.hero.z : z };
    const z1 = ctx.spawnZombie({ x: p.x, z: p.z, hp: 4 });
    z1.poison = 3; z1.poisonT = 4;
    const before = ctx.S.charge || 0;
    ctx.hurtZombie(z1, 99, 'probe', ctx.S.lastDash);
    return { chargeBefore: before, chargeAfter: ctx.S.charge || 0, alive: z1.alive, evo: Object.keys(ctx.S.evo || {}) };
  },
  upInfo: function () {
    return ctx.S ? {
      upLv: Object.assign({}, ctx.S.upLv || {}), evo: Object.keys(ctx.S.evo || {}), evolved: (ctx.S.evolved || []).slice(),
      dashElem: ctx.S.dashElem, elemLv: Object.assign({}, ctx.S.elemLv || {}), tempElem: ctx.S.tempElem ? { el: ctx.S.tempElem.el, t: ctx.S.tempElem.t } : null,
      dashCount: ctx.S.dashCount, pathR: ctx.S.pathR, chargeLv: ctx.S.chargeLv || 0, spiritCap: ctx.S.spiritCap, ringLv: ctx.S.ringLv || 0,
      perfectMul: (ctx.CFG.perfectDmgMul || 1.5) + (ctx.CFG.perfectStep || 0.15) * Math.max(0, ctx.upLv('perfect') - 1),
      perfectOn: ctx.upLv('perfect') > 0
    } : null;
  },
  setQuality: function (q) { if (ctx.S) ctx.S.dashQuality = q; return ctx.S && ctx.S.dashQuality; },
  itemIconUrl: function (kind) {
    const keyMap = { bell: 'one-bell', charm: 'charm', ice: 'elem-ice', fire: 'elem-fire', poison: 'elem-poison', xp: 'xp-orb', dashplus: 'dash-plus' };
    return (ctx.art && ctx.art.itemIconUrl) ? ctx.art.itemIconUrl(keyMap[kind] || kind) : null;
  },
  elemProbe: function (el, lv) {
    const saved = Object.assign({}, ctx.S && ctx.S.elemLv || {});
    if (ctx.S) { ctx.S.elemLv = saved; if (lv != null) ctx.S.elemLv[el] = lv; else delete ctx.S.elemLv[el]; }
    const out = { el: el, lv: ctx.S && ctx.S.elemLv ? (ctx.S.elemLv[el] || 0) : 0, iceDur: ctx.elemIceDur(), shatter: ctx.elemShatterDmg(), burnDur: ctx.elemBurnDur(), burnDmg: ctx.elemBurnDmg(), poisonMax: ctx.elemPoisonMax(), poisonDmg: ctx.elemPoisonDmg(), cloudR: ctx.elemCloudR() };
    if (ctx.S) ctx.S.elemLv = saved;
    return out;
  },
  applyElemProbe: function (el) {
    if (!ctx.S) return null;
    const z = ctx.spawnZombie({ x: ctx.S.hero.x + 2.4, z: ctx.S.hero.z, hp: 999 });
    ctx.applyElement(z, el, null);
    const out = { id: z.id, frozen: +(z.frozen || 0).toFixed(2), burn: +(z.burn || 0).toFixed(2), poison: z.poison || 0 };
    z.alive = false;
    if (z.obj && ctx.three) ctx.three.scene.remove(z.obj);
    return out;
  },
  enemyTypes: function () { return Object.keys(ctx.CFG.zombieTypes); },
  spawnSpecial: function (type, x, z, hp) { return ctx.spawnZombie({ type: type, x: x, z: z, hp: hp }); },
  shotsInfo: function () { return (ctx.S && ctx.S.shots || []).map(function (sh) { return { x: sh.x, z: sh.z, t: sh.t }; }); },
  hazardInfo: function () { return (ctx.S && ctx.S.hazards || []).map(function (h) { return { x: h.x, z: h.z, r: h.r, t: h.t, done: !!h.done }; }); },
  spawnHazard: function (x, z, r, delay) { return ctx.spawnHazard(x, z, r, delay); },
  stages: function () { return ctx.STAGES.map(function (st) { return { id: st.id, act: st.act, name: st.name, map: st.map, time: st.time, bossShapes: st.bossShapes, shapes: (st.shapes || []).slice(), spiritCap: st.spiritCap, hazard: (st.boss && st.boss.hazard) || 0 }; }); },
  beginStage: ctx.beginStage,
  goStageNow: ctx.goStageNow,
  /* v0.30 QA 훅: 난이도·동적 보정·첫 경험·접근성·보스 시간 예산 */
  modeInfo: function () {
    return {
      saveMode: ctx.save.mode, runMode: ctx.S ? ctx.S.mode : null, gosu: ctx.gosuUnlocked(), note: ctx.MODE_NOTE[ctx.save.mode],
      modes: ctx.MODE_ORDER.map(function (id) { return { id: id, name: ctx.MODES[id].name, tele: ctx.MODES[id].tele, dmg: ctx.MODES[id].dmg, spd: ctx.MODES[id].spd, bossShapes: ctx.MODES[id].bossShapes, starCap: ctx.MODES[id].starCap, coin: ctx.MODES[id].coin, locked: id === 'gosu' && !ctx.gosuUnlocked() }; }),
      html: $('titleModes') ? $('titleModes').innerHTML : '',
      noteShown: $('titleModeNote') ? $('titleModeNote').textContent : ''
    };
  },
  setMode: function (id) { return ctx.setMode(id); },
  a11yInfo: function () { return { colorblind: ctx.a11yCb(), shake: ctx.a11yShake(), save: Object.assign({}, ctx.save.a11y), cbLabel: $('btnCb') ? $('btnCb').textContent : null, shakeLabel: $('btnShake') ? $('btnShake').textContent : null }; },
  setA11y: function (k, v) { return ctx.setA11y(k, v); },
  tutorialInfo: function () {
    const T = ctx.S && ctx.S.tutorial;
    return {
      on: !!(T && T.on), t: T ? +T.t.toFixed(2) : 0, first: !!(T && T.first), tapSpawned: !!(T && T.tapSpawned), tapDone: !!(T && T.tapDone),
      slow: ctx.S ? +(ctx.S.tutSlow || 1).toFixed(2) : 1, done: !!ctx.save.tutorialDone,
      skipHidden: $('btnSkip') ? !!$('btnSkip').hidden : null, guide: ($('guide') && $('guide').classList.contains('show')) ? $('guide').textContent : ''
    };
  },
  skipTutorial: function () { return ctx.endTutorial('skip'); },
  advanceTutorial: function (sec) {
    if (ctx.S && ctx.S.tutorial) { ctx.S.tutorial.t += sec; ctx.tickTutorial(); }
    return ctx.S && ctx.S.tutorial ? +ctx.S.tutorial.t.toFixed(2) : null;
  },
  endRunProbe: function (win, msg) { if (!ctx.S) return null; ctx.endRun(!!win, msg || (win ? '귀물을 베었습니다.' : '귀물에게 닿았습니다.')); return this.resultUi(); },
  moments: function () { return Object.assign({}, ctx.save.moments || {}); },
  resetMoments: function () { ctx.save.moments = {}; ctx.save.tutorialDone = 0; ctx.persist(); return ctx.save.moments; },
  momentState: function () {
    return {
      newShape: ctx.S && ctx.S.newShape ? { shape: ctx.S.newShape.shape, guide: +(ctx.S.newShape.guide || 0).toFixed(2), need: ctx.S.newShape.need } : null,
      chargeGuide: ctx.S ? +(ctx.S.chargeGuide || 0).toFixed(2) : 0, totemGuide: ctx.S ? +(ctx.S.totemGuide || 0).toFixed(2) : 0,
      bounceArrow: ctx.S ? +(ctx.S.bounceArrow || 0).toFixed(2) : 0, slowMul: ctx.S ? +(ctx.S.slowMul || 1).toFixed(2) : 1, slowMulT: ctx.S ? +(ctx.S.slowMulT || 0).toFixed(2) : 0,
      firstPatIcon: (ctx.S && ctx.S.firstPatIcon) ? ctx.S.firstPatIcon.id : null, bossTeleMul: (ctx.S && ctx.S.boss) ? +(ctx.S.boss.teleMul || 1).toFixed(2) : null
    };
  },
  streak: function () { return { save: ctx.save.streak ? Object.assign({}, ctx.save.streak) : null, run: ctx.S ? ctx.S.streak : 0, help: ctx.S ? (ctx.S.help || []).slice() : [], after: ctx.S ? ctx.S.streakAfter : null }; },
  setStreak: function (stageNo, n) { ctx.save.streak = n ? { stage: stageNo | 0, n: n | 0 } : null; ctx.persist(); return ctx.save.streak; },
  teleInfo: function () { return { run: ctx.S ? +((ctx.S.teleMul || 1)).toFixed(2) : 1, mode: ctx.curMode().tele, boss: (ctx.S && ctx.S.boss) ? +(ctx.S.boss.teleMul || 1).toFixed(2) : null }; },
  economy: function () {
    return { mode: ctx.curMode().id, coinMul: ctx.modeCoin(), coinMult: ctx.coinMult(), kill: Math.round(ctx.CFG.coinPerKill * ctx.modeCoin() * ctx.coinMult()),
      spd: ctx.modeSpd(), spdApplied: ctx.CFG.zombieSpeed * ctx.modeSpd(), dmgMul: ctx.curMode().dmg, dmg2: ctx.modeDmg(2), starCap: ctx.starCap(), bossShapes: ctx.curMode().bossShapes };
  },
  budget: function (n, mode) { return ctx.bossBudget(n, mode); },
  budgetTable: function () { return ctx.budgetTable(); },
  bossAt: function () { return { bossAt: (ctx.S && ctx.S.stage) ? ctx.S.stage.bossAt : null, seenAt: ctx.S ? +(ctx.S.bossSeenAt || 0).toFixed(1) : null, elapsed: ctx.S ? +(ctx.S.elapsed || 0).toFixed(1) : null, left: ctx.S ? +(ctx.S.timeLeft || 0).toFixed(1) : null }; },
  /* 실측: 걷기·경직·패턴별 지속 시간을 실제 상태기계로(렌더 없이) 잰다. */
  cycleProbe: function (dt) {
    if (!ctx.S || !ctx.S.boss || !ctx.S.boss.alive) return null;
    const b = ctx.S.boss, d = dt || (1 / 30);
    const keep = { hp: ctx.S.hp, noMove: ctx.qa.noMove, nf: ctx.qa.noFirstMoments, tm: b.teleMul, tb: b.teleBoost };
    ctx.S.hp = 9999; ctx.qa.noMove = true; ctx.qa.noFirstMoments = true;
    const tick = function (n) { let i = 0; while (i++ < n) { ctx.S.hitstop = 0; ctx.S.iframe = 9; if (!ctx.S.playing) break; if (!ctx.S.paused) ctx.step(d); } };
    const out = { walk: 0, stun: 0, patterns: {}, seqN: (b.seq || []).length };
    b.state = 'walk'; b.stateT = 0; b.firstWalk = false; b.stun = 0;
    let g = 0, wt = ctx.S.elapsed;
    while (g++ < 400 && b.state === 'walk' && ctx.S.playing) tick(1);
    out.walk = +(ctx.S.elapsed - wt).toFixed(2);
    b.state = 'stun'; b.stateT = 0; b.stunT = 0;
    g = 0;
    const stT = ctx.S.elapsed;
    while (g++ < 200 && b.state === 'stun' && ctx.S.playing) tick(1);
    out.stun = +(ctx.S.elapsed - stT).toFixed(2);
    const list = ctx.bossPatList(b) || [];
    list.forEach(function (id) {
      if (!ctx.S.playing || !b.alive) { out.patterns[id] = null; return; }
      b.state = 'walk'; b.stateT = 999; b.stun = 0; b.teleBoost = 1; b.teleMul = ctx.teleMul();
      ctx.startBossPattern(b, id);
      const st0 = b.state, t0 = ctx.S.elapsed;
      let k = 0;
      while (k++ < 900 && b.state === st0 && ctx.S.playing) tick(1);
      out.patterns[id] = (b.state === st0) ? -1 : +(ctx.S.elapsed - t0).toFixed(2);
    });
    ctx.S.hp = keep.hp; ctx.qa.noMove = keep.noMove; ctx.qa.noFirstMoments = keep.nf;
    b.teleMul = keep.tm; b.teleBoost = keep.tb;
    return out;
  },
  resultUi: function () {
    const g = $('resultHelp'), o = $('btnTrainOffer'), s = $('resultStars'), k = $('resultKicker'), n = $('resultNext');
    return { kicker: k ? k.textContent : '', help: g ? g.textContent : '', helpHidden: g ? !!g.hidden : null,
      offerHidden: o ? !!o.hidden : null, offerText: o ? o.textContent : '', stars: s ? s.innerHTML : '', note: n ? n.textContent : '', gold: !!(ctx.S && ctx.S.goldStar) };
  },
  startReplay: function () { ctx.startRun({ stage: 1, replay: true }); return true; },
  skipBtnVisible: function () { const b = $('btnSkip'); return b ? !b.hidden : null; },
  selectStage: function (n) { ctx.titleSel = ctx.clamp(n | 0, 1, ctx.STAGES.length); ctx.refreshTitleHelp(); ctx.previewStageWorld(ctx.titleSel); return ctx.titleSel; },
  stageSelectHtml: function () { return $('titleStages') ? $('titleStages').innerHTML : ''; },
  resultInfo: function () {
    return ctx.S ? { won: !!ctx.S.won, lost: !!ctx.S.lost, stars: ctx.S.stars || 0, kills: ctx.S.kills || 0, comboMax: ctx.S.comboMax || 0, coinGain: ctx.S.coinGain || 0, score: ctx.S.score || 0, nextStage: ctx.S.nextStage || null, stageNo: ctx.S.stageNo || 0 } : null;
  },
  pickSpirits: function (shape, n, from, dir) { return ctx.pickSpirits(shape, n, from, dir); },
  /* v0.40 QA: 파츠 리그 상태 덤프(부위별 위치·회전·스케일) — 이음매 진단용. */
  rigDump: function (i) {
    if (!ctx.three || !ctx.S || !ctx.S.zombies) return null;
    const z = ctx.S.zombies[i || 0];
    if (!z || !z.obj) return null;
    const rig = z.obj.userData.rig;
    if (!rig) return { name: z.shape || z.type, rig: false };
    const out = { fig: rig.name, speed: +rig.speed.toFixed(2), phase: +rig.phase.toFixed(2), parts: {} };
    Object.keys(rig.parts).forEach(function (k) {
      const m = rig.parts[k];
      if (!m) return;
      out.parts[k] = { p: [+m.position.x.toFixed(2), +m.position.y.toFixed(2)], rz: +m.rotation.z.toFixed(3), s: [+m.scale.x.toFixed(2), +m.scale.y.toFixed(2)], piv: m.userData.pivot };
    });
    out.anim = { hero: ctx.three.heroSpr && ctx.three.heroSpr.userData.rig ? { fig: ctx.three.heroSpr.userData.rig.name } : null };
    return out;
  },
  audioInfo: function () { return ctx.audio ? ctx.audio.info() : null; },
  /* v0.40 QA: 종이 소리 3종을 직접 때려 버스 보이스가 잡히는지 확인한다. */
  paperProbe: function () {
    if (!ctx.audio) return null;
    const r = {};
    if (ctx.audio.paperFold) { ctx.audio.paperFold(0.8); r.fold = true; }
    if (ctx.audio.paperTear) { ctx.audio.paperTear(0.9); r.tear = true; }
    if (ctx.audio.paperCrush) { ctx.audio.paperCrush(1.0); r.crush = true; }
    r.bus = ctx.audio.info().bus;
    return r;
  },
  /* v0.39 QA: 같은 순간에 소리 N개를 몰아쳐 보이스 상한·레이트리밋·덕킹을 확인한다. */
  audioHammer: function (n) {
    if (!ctx.audio) return null;
    const k = Math.max(1, Math.min(200, n || 40));
    for (let i = 0; i < k; i++) { ctx.audio.slash(0.5); ctx.audio.hit(i % 3 === 0); }
    return ctx.audio.info().bus;
  },
  paperPreview: function (k) { try { return ctx.paperPropCanvas(k, 31).toDataURL('image/png'); } catch (e) { return null; } },
  diorama: function () {
    const info = ctx.dioramaInfo();
    const w = ctx.three && ctx.three.chunks;
    info.screen = !!(w && w.stats && w.screenInfo ? w.screenInfo() : null);
    return info;
  },
  triggerSightWave: ctx.triggerSightWave,
  /* v0.39 QA: 장면 경계·카메라·영웅 좌표(보스 결계처럼 무대가 바뀌는 순간의 진단). */
  sceneInfo: function () {
    if (!ctx.three || !ctx.three.scene) return null;
    const b = new ctx.THREE.Box3().setFromObject(ctx.three.scene);
    return {
      min: [b.min.x, b.min.y, b.min.z].map(function (v) { return +v.toFixed(2); }),
      max: [b.max.x, b.max.y, b.max.z].map(function (v) { return +v.toFixed(2); }),
      cam: ctx.three.camera.position.toArray().map(function (v) { return +v.toFixed(2); }),
      fov: ctx.three.camera.fov,
      hero: ctx.S && ctx.S.hero ? [+ctx.S.hero.x.toFixed(2), +ctx.S.hero.z.toFixed(2)] : null,
      heroObj: ctx.three.heroSpr ? ctx.three.heroSpr.position.toArray().map(function (v) { return +v.toFixed(2); }) : null,
      groupPos: ctx.three.chunks && ctx.three.chunks.group ? ctx.three.chunks.group.position.toArray().map(function (v) { return +v.toFixed(2); }) : null,
      boss: (function () {
        const b = ctx.S && ctx.S.boss && ctx.S.boss.obj;
        if (!b) return null;
        const v = new ctx.THREE.Vector3();
        b.getWorldPosition(v);
        return { local: b.position.toArray().map(function (q) { return +q.toFixed(2); }), world: v.toArray().map(function (q) { return +q.toFixed(2); }) };
      })(),
      fade: { hero: ctx.WF.uWfHero.value.toArray(), range: ctx.WF.uWfRange.value.toArray() }
    };
  },
  /* v0.39 QA: 장면 안에서 아직 카드스탁 패치를 안 받은 재질을 찾는다(안개 구멍·톤 이질감 진단). */
  cardAudit: function () {
    const out = { total: 0, patched: 0, skip: {}, list: [] };
    if (!ctx.three || !ctx.three.scene) return out;
    ctx.three.scene.traverse(function (o) {
      const m = o.material;
      if (!m) return;
      const arr = Array.isArray(m) ? m : [m];
      arr.forEach(function (mat) {
        if (!mat) return;
        out.total++;
        if (mat.userData && mat.userData.cardKind) { out.patched++; return; }
        const k = (mat.type || '?') + (mat.isShaderMaterial ? ':shader' : '');
        out.skip[k] = (out.skip[k] || 0) + 1;
        if (out.list.length < 24) out.list.push({ type: mat.type, col: mat.color ? '#' + mat.color.getHexString() : '', map: !!mat.map, inst: !!o.isInstancedMesh, visible: o.visible });
      });
    });
    return out;
  },
  /* v0.39 QA: 층별 안개 끄기(0=끔, 1=켬). 반환값은 현재 안개 상태와 카드스탁 통계. */
  fadeDebug: function (o) {
    if (o) {
      if (o.mat != null) ctx.qaFadeMat = o.mat ? 1 : 0;
      if (o.post != null) ctx.qaFadePostK = o.post;
      if (o.amt != null) ctx.WF.uWfAmt.value.x = o.amt;
      if (o.far != null) ctx.WF.uWfAmt.value.y = o.far;
      if (o.green != null) ctx.qaFadeColor = !!o.green;
      if (o.dbg != null) ctx.WF.uWfDbg.value = o.dbg ? 1 : 0;
    }
    return {
      mat: ctx.qaFadeMat, post: ctx.qaFadePostK, postAmt: ctx.WF_POST.post,
      range: ctx.WF.uWfRange.value.toArray(), amt: ctx.WF.uWfAmt.value.toArray(),
      color: [ctx.WF.uWfColor.value.r, ctx.WF.uWfColor.value.g, ctx.WF.uWfColor.value.b],
      cards: ctx.cardStats(), postPass: !!(ctx.three && ctx.three.bloom && ctx.three.bloom.post && ctx.three.bloom.post[0] && ctx.three.bloom.post[0].setFadeSource),
      postU: (function () {
        const p = ctx.three && ctx.three.bloom && ctx.three.bloom.post && ctx.three.bloom.post[0];
        if (!p || !p.uniforms) return null;
        const u = p.uniforms;
        return { uWfPost: u.uWfPost && u.uWfPost.value, hasDepth: u.uHasDepth && u.uHasDepth.value, heroScreen: u.uHeroScreen && u.uHeroScreen.value.toArray(), amt: u.uWfAmt && u.uWfAmt.value.toArray(), range: u.uWfRange && u.uWfRange.value.toArray() };
      })()
    };
  },
  drawSightFog: ctx.drawSightFog,

  fxInfo: function () {
    const idle = ctx.art && ctx.art.atlas && ctx.art.atlas.heroAnim && ctx.art.atlas.heroAnim.actions && ctx.art.atlas.heroAnim.actions.idle;
    const zWalk = ctx.art && ctx.art.atlas && ctx.art.atlas.zombieAnim && ctx.art.atlas.zombieAnim.actions && ctx.art.atlas.zombieAnim.actions.walk;
    const atmo = $('fxinkAtmo');
    const slash = ctx.three && ctx.three.slashes && ctx.three.slashes[0];
    const marks = $('marks');
    return {
      /* v0.39: 2D 안개 캔버스는 없다. 대신 월드 안개 uniform 을 그대로 내보낸다. */
      fog: { canvas: false, range: ctx.WF.uWfRange.value.toArray(), amt: ctx.WF.uWfAmt.value.toArray(), hero: ctx.WF.uWfHero.value.toArray(), cards: ctx.cardStats() },
      bloom: ctx.three && ctx.three.bloom && ctx.three.bloom.quality,
      hasBloom: !!(ctx.three && ctx.three.bloom),
      hasInk: !!(ctx.three && ctx.three.ink),
      slashes: ctx.three && ctx.three.slashes ? ctx.three.slashes.length : 0,
      slashShader: !!(slash && slash.material && slash.material.uniforms && slash.material.uniforms.uProgress),
      slashRotZ: slash && slash.mesh ? slash.mesh.rotation.z : null,
      stat: { slashes: ctx.fxinkStat.slashes, hits: ctx.fxinkStat.hits, kills: ctx.fxinkStat.kills },
      atmo: !!(atmo && atmo.children && atmo.children.length),
      atmoMap: atmo && atmo.dataset && atmo.dataset.map,
      atmoZ: atmo ? +getComputedStyle(atmo).zIndex : 0,
      marksZ: marks ? +getComputedStyle(marks).zIndex : 0,
      rimHero: idle && (idle.file1x || idle.file),
      rimZombie: zWalk && (zWalk.file1x || zWalk.file),
      torch: ctx.art && ctx.art.torchGlowUrl && ctx.art.torchGlowUrl(),
      aq: ctx.three && ctx.three.ql && ctx.three.ql.level,
      forced: !!(ctx.three && ctx.three.fxForced)
    };
  },
  setFxQuality: function (q) {
    if (!ctx.three || !ctx.three.bloom) return null;
    if (q !== 'high' && q !== 'low' && q !== 'off') return ctx.three.bloom.quality;
    ctx.three.fxForced = true;
    ctx.fxQ = q;
    ctx.three.bloom.setQuality(q);
    if (ctx.three.ink) ctx.three.ink.setQuality(q === 'high' ? 'high' : 'low');
    ctx.wireFadeSource();
    ctx.applyFxinkAtmo(ctx.S && ctx.S.mapId);
    return ctx.three.bloom.quality;
  },
  testAutoQuality: function () {
    const log = [];
    const aq = new ctx.AutoQuality({
      start: 'high', lowFps: 40, low1: 20, holdSec: 0.2, windowSec: 0.3,
      onChange: function (q) { log.push(q); }
    });
    for (let i = 0; i < 6; i++) aq.tick(0.05);
    const mid = aq.q;
    for (let i = 0; i < 12; i++) aq.tick(1 / 15);
    return { mid: mid, end: aq.q, log: log };
  },
  sonarGeom: function (wave) {
    const host = $('app') || $('sightFog');
    const r = host ? host.getBoundingClientRect() : { width: 375, height: 667 };
    const w = r.width, h = r.height;
    const hs = (ctx.S && ctx.S.hero) ? ctx.heroScreen() : { x: w * 0.5, y: h * 0.5 };
    return { cx: hs.x, cy: hs.y, r: Math.min(w, h) * (0.18 + 0.7 * (1 - (wave == null ? ((ctx.S && ctx.S.sightWave) || 0) : wave))), w: w, h: h, wave: wave == null ? ((ctx.S && ctx.S.sightWave) || 0) : wave };
  },
  heroVisible: function () {    const g = ctx.three && ctx.three.heroSpr;
    const spr = g && g.userData && g.userData.sprite;
    return {
      group: !!(g && g.visible !== false),
      visible: !!(spr && spr.visible !== false && g && g.visible !== false),
      opacity: spr && spr.material ? spr.material.opacity : 0,
      action: g && g.userData && g.userData.action,
      hasMap: !!(spr && spr.material && spr.material.map)
    };
  },
  /* v0.38 QA: 캐릭터 파츠 리그 상태 — 파츠 수·포즈·좌우 반전·빌보드 여부 */
  /* QA: 리그가 매 프레임(dt)로 얼마나 촘촘히 움직이는지 — 60스텝을 강제로 돌려 각도를 돌려준다. */
  rigTrace: function (n, dt, state) {
    const g = ctx.three && ctx.three.heroSpr;
    const r = g && g.userData && g.userData.rig;
    if (!r) return null;
    const out = [];
    const px = g.position.x;
    const N = n || 60, D = dt || (1 / 60), st = state || 'idle';
    for (let i = 0; i < N; i++) {
      g.position.x = px + i * 0.02;           /* 1.2 m/s 로 걷는 것과 같은 이동 */
      ctx.art.tickChar(g, 'hero', st, D, 1, 0);
      out.push({ a: +(r.dbg ? r.dbg.ang : 0).toFixed(4), y: +(r.dbg ? r.dbg.bob : 0).toFixed(4),
        ph: +r.phase.toFixed(3), sp: +r.speed.toFixed(2), face: r.face,
        arm: +r.arm.toFixed(3), armVis: !!(r.armMesh && r.armMesh.visible),
        sash: +r.sashA.toFixed(3),
        head: +(r.parts.head ? (r.dbg && r.dbg.headAng != null ? r.dbg.headAng : 0) : 0).toFixed(4) });
    }
    g.position.x = px;
    ctx.art.tickChar(g, 'hero', 'idle', 1 / 60, 1, 0);
    return out;
  },
  /* QA: 원혼 45마리 분량 tickChar 비용(ms) — 리그 자체의 CPU 비용 측정 */
  rigBench: function (n) {
    const t0 = performance.now();
    const list = (ctx.S && ctx.S.zombies ? ctx.S.zombies : []).filter(function (z) { return z.obj && z.obj.userData && z.obj.userData.rig; });
    if (!list.length) return null;
    const N = n || 30;
    for (let k = 0; k < N; k++) {
      for (let i = 0; i < list.length; i++) ctx.art.tickChar(list[i].obj, 'zombie', 'walk', 1 / 60, 1, 0);
    }
    const ms = performance.now() - t0;
    return { chars: list.length, ticks: N, ms: +ms.toFixed(2), perCharFrame: +(ms / N / list.length).toFixed(4),
      sceneSprites: (function () { let a = 0, b = 0; ctx.three.scene.traverse(function (o) { if (o.isSprite) a++; else if (o.isMesh) b++; }); return { sprites: a, meshes: b }; })() };
  },
  /* v0.42 QA: 포즈를 한 장에 고정한다 — i=-1 주인공, 0+ 원귀/보스. action=null 이면 해제. */
  posePin: function (i, action, frame) {
    const g = (i < 0) ? (ctx.three && ctx.three.heroSpr) : (ctx.S && ctx.S.zombies && ctx.S.zombies[i] && ctx.S.zombies[i].obj);
    if (!g || !ctx.art.debugPose) return null;
    ctx.art.debugPose(g, action, frame == null ? 0 : frame);
    return { ok: true, act: action, frame: frame };
  },
  /* v0.43.2 QA: 포즈 판(mesh) 네 모서리의 화면 좌표 — 빌보드가 카메라 평면에 바로 서 있는지 검사.
     좌·우 변의 x 차이(px)가 곧 기울기다(0 이면 정립, 크면 2시 방향으로 누운 것). */
  poseQuad: function (i) {
    const g = (i < 0) ? (ctx.three && ctx.three.heroSpr) : (ctx.S && ctx.S.zombies && ctx.S.zombies[i] && ctx.S.zombies[i].obj);
    const r = g && g.userData && g.userData.rig;
    const L = r && r.layers && r.layers[0];
    if (!L || !L.mesh || !ctx.three || !ctx.three.camera) return null;
    const m = L.mesh, geo = m.geometry;
    const px = geo.parameters ? geo.parameters.width / 2 : 0.5;
    const h = geo.parameters ? geo.parameters.height : 1;
    const v = new ctx.THREE.Vector3();
    const corners = [[-px, 0], [px, 0], [-px, h], [px, h]].map(function (c) {
      v.set(c[0], c[1], 0).applyMatrix4(m.matrixWorld).project(ctx.three.camera);
      return { x: +((v.x * 0.5 + 0.5) * 1000).toFixed(2), y: +((-v.y * 0.5 + 0.5) * 1000).toFixed(2) };
    });
    const leftSlant = corners[2].x - corners[0].x;
    const rightSlant = corners[3].x - corners[1].x;
    const topW = corners[3].x - corners[2].x, botW = corners[1].x - corners[0].x;
    return { face: r.face, groupScaleX: g.scale.x, meshScaleX: m.scale.x, corners: corners,
      leftSlant: +leftSlant.toFixed(2), rightSlant: +rightSlant.toFixed(2),
      topW: +topW.toFixed(2), botW: +botW.toFixed(2), uFx: m.material && m.material.userData.frameU ? m.material.userData.frameU.uFx.value : null };
  },
  poseActs: function (name) { return ctx.art.actsOf ? ctx.art.actsOf(name) : null; },
  /* v0.45 QA: 장면 객체 수·잔상(고스트) 수·GPU 자원 수 — 누수·정리 확인 */
  sceneStats: function () {
    if (!ctx.three || !ctx.three.scene) return null;
    let meshes = 0, ghosts = 0, hulls = 0;
    ctx.three.scene.traverse(function (o) {
      if (!o.isMesh) return;
      meshes++;
      if (o.userData && o.userData.rig && o.userData.rig.kind === 'ghost') ghosts++;
      if (o.userData && o.userData.hero3dHull) hulls++;
    });
    const inf = ctx.three.renderer.info;
    return { meshes: meshes, ghosts: ghosts, hulls: hulls, geometries: inf.memory.geometries, textures: inf.memory.textures, programs: inf.programs ? inf.programs.length : null, fx: (ctx.three.fx || []).length };
  },
  /* v0.45 QA: 장면 한 번 그리기의 드로우콜·삼각형(후처리 제외) — 주인공 기여분 차분용 */
  sceneCost: function () {
    if (!ctx.three || !ctx.three.renderer) return null;
    const r = ctx.three.renderer;
    const prevAuto = r.info.autoReset;
    r.info.autoReset = false;
    r.info.reset();
    try { r.render(ctx.three.scene, ctx.three.camera); } catch (e) {}
    const out = { calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs ? r.info.programs.length : null };
    r.info.autoReset = prevAuto;
    r.info.reset();
    return out;
  },
  /* v0.45 QA: 프레임 비용 계측 — 드로우콜·삼각형·프로그램, 주인공 보이기/숨기기 차분용 */
  renderInfo: function (heroOn) {
    if (!ctx.three || !ctx.three.renderer) return null;
    if (heroOn != null && ctx.three.heroSpr) ctx.three.heroSpr.visible = !!heroOn;
    const inf = ctx.three.renderer.info;
    return {
      calls: inf.render.calls, triangles: inf.render.triangles, programs: inf.programs ? inf.programs.length : null,
      textures: inf.memory.textures, geometries: inf.memory.geometries, heroOn: ctx.three.heroSpr ? ctx.three.heroSpr.visible : null,
      fps: ctx.fps.last ? +(1 / ctx.fps.last).toFixed(1) : null
    };
  },
  /* v0.45 QA: 주인공 3D 뼈대 — 상태·클립 가중치·방향 */
  hero3dInfo: function () {
    const g = ctx.three && ctx.three.heroSpr;
    if (!g || !ctx.art.hero3d) return null;
    const o = ctx.art.hero3d.info(g) || null;
    if (o) o.bounds = ctx.art.hero3d.bounds(g);
    return o;
  },
  /* v0.45 QA: 셰이더 uniform·정점색·렌더타깃 색공간 덤프(먹의 자리 진단) */
  hero3dDump: function () {
    const g = ctx.three && ctx.three.heroSpr;
    const H = g && g.userData && g.userData.hero3d;
    if (!H) return null;
    const u = H.uniforms[0];
    const mesh = H.meshes[0];
    const col = mesh && mesh.geometry.getAttribute('color');
    const uni = {};
    Object.keys(u).forEach(function (k) {
      const v = u[k].value;
      uni[k] = (v && v.toArray) ? v.toArray().map(function (n) { return typeof n === 'number' ? +n.toFixed(4) : n; }) : (v && v.isTexture ? 'tex' : v);
    });
    const rt = ctx.three && ctx.three.bloom && ctx.three.bloom.composer && ctx.three.bloom.composer.renderTarget1;
    return {
      uniforms: uni,
      color0: col ? [+col.getX(0).toFixed(4), +col.getY(0).toFixed(4), +col.getZ(0).toFixed(4)] : null,
      colorCount: col ? col.count : 0,
      rtColorSpace: rt ? rt.texture.colorSpace : 'none',
      outputColorSpace: ctx.three.renderer.outputColorSpace,
      toneMapping: ctx.three.renderer.toneMapping,
      lights: H.lights ? { amb: !!H.lights.amb, hemi: !!H.lights.hemi, dirs: H.lights.dirs.length } : null,
      moon: ctx.three.moon ? { i: +ctx.three.moon.intensity.toFixed(3), c: ctx.three.moon.color.toArray().map(function (n) { return +n.toFixed(3); }) } : null,
      amb: ctx.three.amb ? { i: +ctx.three.amb.intensity.toFixed(3), c: ctx.three.amb.color.toArray().map(function (n) { return +n.toFixed(3); }) } : null
    };
  },
  /* v0.45 QA: 클립을 특정 시각에 고정(스크린샷용). o={clip,t,yaw,freeze} */
  hero3dPin: function (o) {
    const g = ctx.three && ctx.three.heroSpr;
    if (!g || !ctx.art.hero3d) return null;
    return ctx.art.hero3d.pin(g, o || {});
  },
  /* v0.45 QA: n스텝 × dt 강제 진행(헤드리스 rAF 우회) — 궤적 기록 */
  hero3dStep: function (o) {
    const g = ctx.three && ctx.three.heroSpr;
    if (!g || !ctx.art.hero3d) return null;
    return ctx.art.hero3d.step(g, o || {});
  },
  /* v0.45 QA: 일섬·피격 동작을 직접 건다. */
  hero3dAct: function (name, k) {
    const g = ctx.three && ctx.three.heroSpr;
    if (!g || !ctx.art.hero3d) return null;
    if (name === 'slash') ctx.art.slashChar(g, k == null ? 1 : k);
    else if (name === 'hit') ctx.art.kickChar(g, k == null ? 1 : k);
    return ctx.art.hero3d.info(g);
  },
  /* v0.44 QA: 포즈 리그를 dt 간격으로 n스텝 강제 진행하며 동작·프레임 궤적을 기록한다.
     (헤드리스는 rAF 가 1fps 라 실시간 관측이 불가능하다 — 로직을 직접 돌려 12칸이 실제로 도는지 본다.) */
  poseTrace: function (o) {
    o = o || {};
    const i = o.i == null ? -1 : o.i;
    const g = (i < 0) ? (ctx.three && ctx.three.heroSpr) : (ctx.S && ctx.S.zombies && ctx.S.zombies[i] && ctx.S.zombies[i].obj);
    const r = g && g.userData && g.userData.rig;
    if (!r) return null;
    const kind = r.name === 'hero' ? 'hero' : (r.name === 'boss' ? 'boss' : 'zombie');
    const n = o.n || 60, dt = o.dt || (1 / 60), st = o.state || 'idle';
    const vx = o.vx == null ? 1 : o.vx, vz = o.vz == null ? 0 : o.vz;
    const walk = o.walk == null ? 0 : o.walk;   /* 스텝당 전진(m) — 걷기 위상 구동 */
    const px0 = g.position.x, pz0 = g.position.z;
    const out = [];
    for (let k = 0; k < n; k++) {
      if (walk) { g.position.x = px0 + walk * (k + 1); }
      ctx.art.tickChar(g, kind, st, dt, vx, vz);
      const L = r.layers && r.layers[0];
      out.push({ t: +((k + 1) * dt).toFixed(3), act: r.cur, f: r.frameOf[r.cur],
        uFx: L && L.mesh && L.mesh.material && L.mesh.material.userData.frameU ? L.mesh.material.userData.frameU.uFx.value : null,
        sq: +r.sq.toFixed(3), sh: +r.sh.toFixed(3), faceS: +r.faceS.toFixed(2) });
    }
    g.position.x = px0; g.position.z = pz0;
    return out;
  },
  /* v0.43.2 QA: 좌우 반전을 강제한다(빌보드 축 검사 — 양방향 모두 12시 정방향이어야 한다). */
  poseFace: function (i, f) {
    const g = (i < 0) ? (ctx.three && ctx.three.heroSpr) : (ctx.S && ctx.S.zombies && ctx.S.zombies[i] && ctx.S.zombies[i].obj);
    const r = g && g.userData && g.userData.rig;
    if (!r) return null;
    r.face = f < 0 ? -1 : 1;
    if (r.layers) r.layers.forEach(function (L) { if (L.mesh) L.mesh.scale.x = r.face; if (L.aura) L.aura.scale.x = r.face; });
    return { face: r.face, groupScaleX: g.scale.x, meshScaleX: r.layers && r.layers[0] ? r.layers[0].mesh.scale.x : null };
  },
  /* v0.42 QA: 검수용 무대 — 배경을 평평한 한지색으로 두고 그 캐릭터만 남긴다. */
  /* v0.42 QA: 한 캐릭터만 보이기/숨기기 — 두 장을 찍어 차분하면 그 캐릭터의 정확한 화면 영역이 나온다. */
  poseVis: function (i, on) {
    const g = (i < 0) ? (ctx.three && ctx.three.heroSpr) : (ctx.S && ctx.S.zombies && ctx.S.zombies[i] && ctx.S.zombies[i].obj);
    if (!g) return 0;
    const r = g.userData && g.userData.rig;
    if (r && r.kind === 'pose') {
      /* 그림 판만 끈다(아우라·그림자는 남겨 두어 차분이 '인물'만 잡게). */
      r.layers.forEach(function (L) {
        L.mesh.visible = !!on;
        L.aura.visible = !!on && !!L.aura.material.map && L.mesh.material.opacity > 0.01;
      });
      g.userData.heroHidden = !on;
      return 1;
    }
    g.visible = !!on;
    g.scale.y = on ? 1 : 0.0001;
    return 1;
  },
  poseStage: function (mode) {
    if (!ctx.three || !ctx.three.scene) return null;
    const sc = ctx.three.scene;
    if (!window.__psSaved || mode === 'reset') {
      window.__psSaved = sc.children.map(function (o) { return o.visible; });
      window.__psBg = sc.background && sc.background.isColor ? sc.background.getHex() : null;
      window.__psFog = sc.fog ? sc.fog.color.getHex() : null;
    }
    if (!mode || mode === 'reset') {
      sc.children.forEach(function (o, i) { o.visible = window.__psSaved[i] !== false; });
      if (window.__psBg != null) { if (!sc.background || !sc.background.isColor) sc.background = new ctx.THREE.Color(window.__psBg); else sc.background.setHex(window.__psBg); }
      if (window.__psFog != null && sc.fog) sc.fog.color.setHex(window.__psFog);
      return 1;
    }
    const only = (mode === 'hero') ? ctx.three.heroSpr : ((ctx.S.boss && ctx.S.boss.obj) || (ctx.S.zombies[0] && ctx.S.zombies[0].obj));
    if (!only) return 0;
    sc.children.forEach(function (o) { if (!(o === only || o === only.parent)) o.visible = false; });
    only.visible = true;
    if (!sc.background || !sc.background.isColor) sc.background = new ctx.THREE.Color(0x15130f); else sc.background.setHex(0x15130f);
    if (sc.fog) sc.fog.color.setHex(0x15130f);
    return 1;
  },
  poseTransforms: function (i) {
    const g = (i < 0) ? (ctx.three && ctx.three.heroSpr) : (ctx.S && ctx.S.zombies && ctx.S.zombies[i] && ctx.S.zombies[i].obj);
    if (!g) return null;
    function t(o) { return { p: o.position.toArray().map(function (v) { return +v.toFixed(3); }),
      q: o.quaternion.toArray().map(function (v) { return +v.toFixed(3); }),
      s: o.scale.toArray().map(function (v) { return +v.toFixed(3); }), vis: o.visible,
      geo: o.geometry && o.geometry.parameters ? o.geometry.parameters : null }; }
    const out = { group: t(g), kids: [] };
    g.children.forEach(function (c) { if (c.children) c.children.forEach(function (m) { out.kids.push(t(m)); }); else out.kids.push(t(c)); });
    return out;
  },
  /* v0.42 QA: 캐릭터가 화면 어디에 서 있는지(발·머리 픽셀) — 리뷰 시트 크롭용 */
  poseScreen: function (i) {
    const g = (i < 0) ? (ctx.three && ctx.three.heroSpr) : (ctx.S && ctx.S.zombies && ctx.S.zombies[i] && ctx.S.zombies[i].obj);
    if (!g || !ctx.three || !ctx.three.camera) return null;
    const v = new ctx.THREE.Vector3();
    g.getWorldPosition(v);
    const foot = v.clone().project(ctx.three.camera);
    const top = v.clone(); top.y += (g.userData.worldH || 2.4);
    top.project(ctx.three.camera);
    const W = ctx.three.renderer.domElement.width, H = ctx.three.renderer.domElement.height;
    return { x: (foot.x * 0.5 + 0.5) * W, y: (-foot.y * 0.5 + 0.5) * H,
      top: (-top.y * 0.5 + 0.5) * H, h: (top.y - foot.y) * 0.5 * H, w: W, hh: H };
  },
  /* v0.42 QA: 동작별 포즈 카드 상태(현재 동작·프레임·레이어 겹침). */
  poseInfo: function () {
    const out = ctx.figurePoseInfo();
    function brief(g) {
      const r = g && g.userData && g.userData.rig;
      if (!r || r.kind !== 'pose') return null;
      return { name: r.name, act: r.cur, frame: r.frameOf[r.cur], burst: r.burst,
        face: r.face, speed: +r.speed.toFixed(2), lean: +r.lean.toFixed(3),
        layers: r.layers.map(function (l) { return { act: l.act, f: l.frame, op: +l.mesh.material.opacity.toFixed(2) }; }) };
    }
    out.hero = brief(ctx.three && ctx.three.heroSpr);
    out.enemies = [];
    if (ctx.S && ctx.S.zombies) {
      ctx.S.zombies.forEach(function (z) { const b = brief(z.obj); if (b) out.enemies.push(b); });
    }
    return out;
  },
  rigInfo: function () {
    const out = { ready: !!(ctx.art && ctx.art.rigInfo && ctx.art.rigInfo().ready), hero: null, enemies: 0, rigEnemies: 0, parts: 0, sample: null, mon3d: 0, mon3dSample: null };
    function brief(g) {
      if (!g || !g.userData || !g.userData.rig) return null;
      const r = g.userData.rig;
      /* v0.42: 포즈 카드 리그(kind='pose')도 같은 함수로 본다 — 없는 값은 null. */
      const nParts = r.parts ? (Array.isArray(r.parts) ? r.parts.length : Object.keys(r.parts).length) : 0;
      return { name: r.name, kind: r.kind || 'rig', parts: nParts, face: r.face,
        lean: r.lean != null ? +r.lean.toFixed(3) : null,
        bob: +(g.children[0].position.y || 0).toFixed(3), speed: +(r.speed || 0).toFixed(2),
        arm: r.arm != null ? +r.arm.toFixed(2) : null,
        act: r.cur || null,
        scaleX: +g.scale.x.toFixed(2), visible: g.visible };
    }
    out.hero = brief(ctx.three && ctx.three.heroSpr);
    if (ctx.S && ctx.S.zombies) {
      ctx.S.zombies.forEach(function (z) {
        if (!z.obj || !z.obj.userData) return;
        out.enemies++;
        if (z.obj.userData.rig) { out.rigEnemies++; const rp = z.obj.userData.rig.parts; out.parts += rp ? (Array.isArray(rp) ? rp.length : Object.keys(rp).length) : 0; if (!out.sample) out.sample = brief(z.obj); }
        if (z.obj.userData.m3d && ctx.art.mon3d) { out.mon3d++; if (!out.mon3dSample) out.mon3dSample = ctx.art.mon3d.info(z.obj); }
      });
    }
    if (ctx.S && ctx.S.boss && ctx.S.boss.obj) out.boss = brief(ctx.S.boss.obj);
    return out;
  },
  inkBlank: function () {
    const c = $('ink');
    if (!c) return true;
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    if (!w || !h) return true;
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 8) return false;
    return true;
  },
  beginDash: ctx.beginDash,
  buy: ctx.buy, pickUpgrade: ctx.pickUpgrade,
  grantIdle: function (ms) { ctx.save.lastSeen = Date.now() - ms; ctx.persist(false); return ctx.checkIdle(); },
  collectIdle: ctx.collectIdle,
  idleCoins: ctx.idleCoins,
  forceLevelUp: function () { if (!ctx.S) return false; ctx.openLevelUp(); return true; },
  giveXp: function (n) { if (ctx.S) ctx.gainXp(n); },
  waitDash: function () {
    return new Promise(function (res) {
      const t0 = ctx.now();
      const id = setInterval(function () {
        if (!ctx.S || !ctx.S.dash && !(ctx.S.dashQueue && ctx.S.dashQueue.length) || ctx.now() - t0 > 8000) { clearInterval(id); res(ctx.S && ctx.S.lastDash); }
      }, 16);
    });
  },
  visualTune: function (o) {
    if (o && ctx.three) {
      if (o.amb != null && ctx.three.amb) ctx.three.amb.intensity = o.amb;
      if (o.hemi != null && ctx.three.hemi) ctx.three.hemi.intensity = o.hemi;
      if (o.moon != null && ctx.three.moon) ctx.three.moon.intensity = o.moon;
      if (o.fog != null && ctx.three.scene && ctx.three.scene.fog) ctx.three.scene.fog.density = o.fog;
      if (ctx.three.bloom && ctx.three.bloom.post) {
        ctx.three.bloom.post.forEach(function (p) {
          const u = p.uniforms;
          if (!u) return;
          if (u.uStrength && o.inkStrength != null) u.uStrength.value = o.inkStrength;
          if (u.uExposure && o.exposure != null) u.uExposure.value = o.exposure;
          if (u.uVignette && o.vignette != null) u.uVignette.value = o.vignette;
          if (u.uGrain && o.grain != null) u.uGrain.value = o.grain;
        });
      }
    }
    const ps = (ctx.three && ctx.three.bloom && ctx.three.bloom.post) || [];
    return {
      amb: ctx.three && ctx.three.amb ? ctx.three.amb.intensity : 0,
      hemi: ctx.three && ctx.three.hemi ? ctx.three.hemi.intensity : 0,
      moon: ctx.three && ctx.three.moon ? ctx.three.moon.intensity : 0,
      inkStrength: ps[0] && ps[0].uniforms && ps[0].uniforms.uStrength ? ps[0].uniforms.uStrength.value : null,
      exposure: ps[1] && ps[1].uniforms && ps[1].uniforms.uExposure ? ps[1].uniforms.uExposure.value : null,
      vignette: ps[1] && ps[1].uniforms && ps[1].uniforms.uVignette ? ps[1].uniforms.uVignette.value : null
    };
  },
  /* v0.40 QA: 틸트시프트 심도 세기 조절(0=off) — 전후 스크린샷 비교용 */
  dofSet: function (v) {
    try { const d = ctx.dofPassOf(); if (d && d.setAmount) { d.setAmount(v); return d.debugInfo ? d.debugInfo() : true; } } catch (e) { return String(e); }
    return false;
  },
  floorInfo: function () { try { return ctx.floorStatus(); } catch (e) { return String(e); } },
  fxInfo: function () { try { const a = ctx.fxSheetInfo(); const b = ctx.three && ctx.three.paper ? ctx.three.paper.info() : null; return { sheets: a, live: b }; } catch (e) { return String(e); } },
  /* v0.41 QA: 실제 일섬 경로를 그대로 만들어 검기 이펙트를 확인한다. */
  dashQa: function (shape) {
    try { const t = (ctx.S.zombies || []).filter(function (z) { return z.alive; })[0] || null; return ctx.beginDash(shape || 'vline', { target: t, rec: null }); } catch (e) { return String(e); }
  },
  fxEmit: function (kind, x, y, z, size) { try { return !!(ctx.three && ctx.three.paper && ctx.three.paper.emit(kind, { x: x, y: y, z: z, size: size || 2 })); } catch (e) { return String(e); } },
  visualInfo: function () {
    const r = ctx.three && ctx.three.renderer;
    return {
      dpr: r ? r.getPixelRatio() : 0,
      dprCap: ctx.three ? ctx.three.dprCap : 0,
      shadows: !!(r && r.shadowMap && r.shadowMap.enabled),
      shadowMap: ctx.three && ctx.three.moon ? ctx.three.moon.shadow.mapSize.x : 0,
      stageId: ctx.three && ctx.three.map ? ctx.three.map.stageId : null,
      mapId: ctx.three && ctx.three.map ? ctx.three.map.id : null,
      props: ctx.three && ctx.three.chunks ? ctx.three.chunks.stats.batches : (ctx.three && ctx.three.map && ctx.three.map.w3 ? ctx.three.map.w3.batches : 0),
      chunkProps: ctx.three && ctx.three.chunks ? ctx.three.chunks.stats.props : 0,
      chunkJars: ctx.three && ctx.three.chunks ? ctx.three.chunks.jars.filter(function (j) { return j.alive; }).length : 0,
      chunkRebuilds: ctx.three && ctx.three.chunks ? ctx.three.chunks.stats.rebuilds : 0,
      triangles: ctx.three && ctx.three.map && ctx.three.map.w3 ? ctx.three.map.w3.triangles : 0,
      lights: ctx.three && ctx.three.map ? (ctx.three.map.lights || []).length : 0,
      atmoFields: ctx.three && ctx.three.atmo ? ctx.three.atmo.fields.length : 0,
      post: ctx.three && ctx.three.bloom && ctx.three.bloom.composer ? ctx.three.bloom.composer.passes.map(function (p) { return p.constructor && p.constructor.name; }) : [],
      dof: (function () { try { const d = ctx.dofPassOf(); return d && d.debugInfo ? d.debugInfo() : null; } catch (e) { return null; } })(),
      calls: r ? r.info.render.calls : 0,
      tris: r ? r.info.render.triangles : 0,
      programs: r ? r.info.programs.length : 0,
      geometryCalls: r ? r.info.memory.geometries : 0
    };
  },
  fps: ctx.fpsReport,
  clearFps: function () { ctx.fps.samples = []; },
  showTitle: function () { if (ctx.audio) ctx.audio.stopBgm(); ctx.showOv('ov-title'); },
  openShop: function () { ctx.refreshShop(); ctx.showOv('ov-shop'); },
  markMetrics: function () { ctx.updateMarks(); return ctx.lastMarkMetrics; },
  /* v0.31 QA 훅: 강적 파훼·콤보·정확한 패링·카드·경험치·자동 피해 비중 */
  v31: function () {
    return ctx.S ? {
      combo: ctx.S.combo || 0, comboMul: +ctx.comboMul().toFixed(3), comboMax: ctx.S.comboMax || 0,
      comboBreakN: ctx.S.comboBreakN || 0, pathWideN: ctx.S.pathWideN || 0, comboTierN: ctx.S.comboTierN || 0, comboFlash: +(ctx.S.comboFlash || 0).toFixed(2),
      level: ctx.S.level, xp: ctx.S.xp, xpNeed: ctx.xpNeed(ctx.S.level), spiritCap: ctx.S.spiritCap, levelUps: ctx.S.levelUps || 0,
      stopT: +(ctx.S.stopT || 0).toFixed(2), levelMode: ctx.save.levelMode, quickZone: ctx.CFG.quick.zone,
      quick: ctx.S.quick ? { age: Math.round(ctx.now() - ctx.S.quick.t0), dur: ctx.S.quick.dur, picks: (ctx.S.levelPicks || []).map(function (u) { return u.id; }) } : null,
      autoDmg: +(ctx.S.autoDmg || 0).toFixed(2), manualDmg: +(ctx.S.manualDmg || 0).toFixed(2), autoShare: ctx.autoShare(), autoCap: ctx.CFG.autoCap,
      ward: ctx.wardInfo(), boltT: +(ctx.S.boltT || 0).toFixed(2), boltPeriod: ctx.upLv('bolt') ? +ctx.boltPeriod().toFixed(2) : null,
      bolts: (ctx.S.bolts || []).length, boltHits: (ctx.S.boltHits || 0), echoes: (ctx.S.echoes || []).length,
      echoMul: ctx.upLv('echo') ? (ctx.CFG.echoCard.mul || [])[Math.min(2, ctx.upLv('echo') - 1)] : null,
      inkSteps: (ctx.S.inkSteps || []).length, reson: ctx.upLv('reson'), counter: ctx.upLv('counter'),
      elemSlots: (ctx.S.elemSlots || []).slice(), elemSlotN: ctx.S.elemSlotN || 1, curElem: ctx.curElem(), elemLv: Object.assign({}, ctx.S.elemLv || {}),
      evoHints: ctx.evoHints(), levelCards: (ctx.S.levelPicks || []).map(function (u) { return { id: u.id, mat: ctx.evoMatInfo(u.id) }; }),
      dmg: +ctx.dashDmg().toFixed(3), dmgBase: ctx.S.dashDmg, healMaxN: ctx.S.healMaxN || 0, runHp: ctx.S.runHp || 0, floorDash: ctx.S.floorDash || 0
    } : null;
  },
  breaks: function () {
    return (ctx.S ? ctx.S.zombies : []).filter(function (z) { return z.alive; }).map(function (z) {
      return { id: z.id, type: z.type, hp: +z.hp.toFixed(2), armor: z.armor || 0, shapeOv: z.shapeOv || null,
        cracks: z.cracks || 0, lastShape: z.lastShape || null, seq: z.seq || null,
        seqI: (z.seqI == null ? null : z.seqI), elite: !!z.elite };
    });
  },
  setCombo: function (n) { if (ctx.S) { ctx.S.combo = n | 0; ctx.S.comboIdle = 0; ctx.S.comboBreakN = 0; ctx.renderHud(); } return ctx.S && ctx.S.combo; },
  comboTierProbe: function (n) { return ctx.comboReward(n | 0); },
  comboBreakProbe: function () { ctx.comboBreak(); return ctx.S ? { combo: ctx.S.combo || 0, n: ctx.S.comboBreakN || 0 } : null; },
  tapProbe: function () { const p = ctx.preciseTarget(); return p ? { kind: p.kind, t: +(p.t || 0).toFixed(3), id: p.z ? p.z.id : null } : null; },
  parryNow: function () { return ctx.doParry({ type: 'tap', targets: [], hits: [] }); },
  quickPick: function (id) { return id ? ctx.pickQuick(id, false) : ctx.pickQuick(ctx.recommendedPick(), true); },
  quickRecommended: function () { const id = ctx.recommendedPick(); return { id: id, ok: id ? ctx.pickQuick(id, true) : false }; },
  quickDom: function () { const w = $('quickCards'); return { hidden: w ? !!w.hidden : null, html: $('quickList') ? $('quickList').innerHTML : '', note: $('quickNote') ? $('quickNote').textContent : '' }; },
  levelUpInfo: function () {
    const e = $('evoHint');
    return { paused: ctx.S ? ctx.S.paused : null, evo: e && !e.hidden ? e.textContent : '',
      cards: ((ctx.S && ctx.S.levelPicks) || []).map(function (u) { return { id: u.id, name: u.name, level: ctx.upCardLevelText(u), desc: ctx.upDesc(u), mat: ctx.evoMatInfo(u.id) }; }) };
  },
  setLevelMode: ctx.setLevelMode,
  xpTable: function (n) { const out = []; for (let i = 1; i <= (n || 12); i++) out.push({ lv: i, need: ctx.xpNeed(i) }); return out; },
  gainLevel: function (n) { for (let i = 0; i < (n || 1); i++) ctx.gainXp(ctx.xpNeed(ctx.S.level) - ctx.S.xp); return ctx.S && ctx.S.level; },
  spawnBreak: function (type, x, z, hp) { return ctx.spawnZombie({ type: type, x: x == null ? ctx.S.hero.x + 3 : x, z: z == null ? ctx.S.hero.z : z, hp: hp }); },
  /* 그은 획 하나를 직접 적용한다 — 파훼 규칙을 결정적으로 잴 때 쓴다(입력 경로는 같다). */
  zInfo: function (id) {
    const z = (ctx.S.zombies || []).filter(function (o) { return o.id === id; })[0];
    if (!z) return null;
    return { id: z.id, type: z.type, hp: +z.hp.toFixed(2), alive: !!z.alive, armor: z.armor || 0, shapeOv: z.shapeOv || null,
      cracks: z.cracks || 0, lastShape: z.lastShape || null, seq: z.seq || null, seqI: (z.seqI == null ? null : z.seqI), elite: !!z.elite };
  },
  cutRaw: function (id, shape, dmg) {
    if (!ctx.S) return null;
    const z = ctx.S.zombies.filter(function (o) { return o.alive && o.id === id; })[0];
    if (!z) return null;
    const before = this.zInfo(id);
    ctx.hurtZombie(z, dmg == null ? 2.5 : dmg, 'slash', { type: shape, targets: [id], hits: [], segs: [] });
    const after = this.zInfo(id);
    return { before: before, after: after, alive: z.alive, hp: +z.hp.toFixed(2) };
  },
  cut: function (id, shape, dmg) {
    if (!ctx.S) return null;
    const z = ctx.S.zombies.filter(function (o) { return o.alive && o.id === id; })[0];
    if (!z) return null;
    const rec = { type: shape, targets: [id], hits: [], segs: [] };
    ctx.hurtZombie(z, dmg == null ? ctx.dashDmg() : dmg, 'slash', rec);
    ctx.scoreDash(rec);
    return { hp: +z.hp.toFixed(2), alive: z.alive, hits: rec.hits, z: this.zInfo(id) };
  },
  clearLevels: function () {
    ctx.closeQuickCards(); ctx.hideOvs();
    if (ctx.S) { if (ctx.S.paused === 'levelup') ctx.S.paused = null; ctx.S._pendingLv = 0; ctx.S._cleaveLv = 0; ctx.S.forcePauseLv = false; }
    return true;
  },
  setDashDmg: function (v) { if (ctx.S) ctx.S.dashDmg = +v; return ctx.S && ctx.S.dashDmg; },
  resetDmgMeter: function () { if (ctx.S) { ctx.S.autoDmg = 0; ctx.S.manualDmg = 0; } return true; },
  applyMany: function (list) { (list || []).forEach(function (id) { ctx.applyUpgrade(id, true); }); return this.v31(); },
  spawnItemKind: function (kind, x, z) { return ctx.spawnItem({ type: kind, x: x == null ? ctx.S.hero.x : x, z: z == null ? ctx.S.hero.z : z }); },
  collectKind: function (kind) {
    if (!ctx.S) return null;
    const it = ctx.spawnItem({ type: kind, x: ctx.S.hero.x, z: ctx.S.hero.z });
    ctx.collectItem(it, { type: 'hline', targets: [], hits: [], items: [] });
    return { dashCount: ctx.S.dashCount, floorDash: ctx.S.floorDash || 0, coins: ctx.save.coins };
  },
  wardKillProbe: function (n, r, hp) {
    const out = [];
    const R = r == null ? 2.2 : r;
    for (let i = 0; i < (n || 4); i++) {
      const a = i / (n || 4) * Math.PI * 2;
      out.push(ctx.spawnZombie({ type: 'imp', x: ctx.S.hero.x + Math.cos(a) * R, z: ctx.S.hero.z + Math.sin(a) * R, hp: hp || 30 }).id);
    }
    return out;
  },
  spiritShapes: function () { return ctx.livingMarks().map(function (s) { return { id: s.id, shape: ctx.spiritShape(s), target: s.target ? s.target.id : null }; }); },
  clearZombies: function () {
    (ctx.S.zombies || []).forEach(function (z) { z.alive = false; if (z.obj && ctx.three) ctx.three.scene.remove(z.obj); });
    ctx.S.zombies = []; ctx.S.bolts = []; ctx.S.shots.forEach(function (sh) { if (sh.mesh) ctx.three.scene.remove(sh.mesh); }); ctx.S.shots = [];
    ctx.assignSpiritTargets();
    return this.breaks();
  },
  mark: function () { ctx.assignSpiritTargets(); return this.spiritShapes(); },
  setSpiritCap: function (n) { if (ctx.S) ctx.S.spiritCap = n | 0; ctx.assignSpiritTargets(); return ctx.S ? ctx.S.spiritCap : 0; },
  spawnShotAt: function (x, z) {
    const sh = ctx.spawnShot({ x: x == null ? ctx.S.hero.x + 4 : x, z: z == null ? ctx.S.hero.z : z });
    return sh ? { x: sh.x, z: sh.z } : null;
  },
  bossNow: function (nShapes) { if (!ctx.S) return null; const b = ctx.spawnBoss({ nShapes: nShapes || 3 }); return b ? b.id : null; },
  levelProbe: function (xp) { ctx.gainXp(xp); return this.v31(); },
  /* 렌더 없이 시뮬레이션만 돌려 판 전체의 성장을 잰다(소프트웨어 GL에서 12장 프레임이 너무 느릴 때). */
  simRun: function (sec, dt, auto) {
    if (!ctx.S) return null;
    const d = dt || (1 / 30);
    const n = Math.round((sec || 60) / d);
    const e0 = ctx.S.elapsed, k0 = ctx.S.kills || 0, l0 = ctx.S.level;
    const prevAuto = ctx.qa.autoStroke;
    if (auto !== false) ctx.qa.autoStroke = true;
    for (let i = 0; i < n && ctx.S && ctx.S.playing; i++) {
      if (ctx.S.paused && ctx.S.paused !== 'manual') { if (ctx.S.paused === 'levelup') { const b = (ctx.S.levelPicks || [])[0]; if (b) ctx.pickUpgrade(b.id); } }
      ctx.step(d);
      if (ctx.S && ctx.S.quick) { const id = ctx.recommendedPick(); if (id) ctx.pickQuick(id, true); }
      if (!ctx.S || !ctx.S.playing) break;
    }
    ctx.qa.autoStroke = prevAuto;
    return { elapsed: +(ctx.S.elapsed - e0).toFixed(1), level: ctx.S.level, levelFrom: l0, kills: (ctx.S.kills || 0) - k0, xpNeed: ctx.xpNeed(ctx.S.level), won: !!ctx.S.won, lost: !!ctx.S.lost };
  },
  snapshot: function () {
    return {
      hero: ctx.S && { x: ctx.S.hero.x, z: ctx.S.hero.z },
      spirits: ctx.S ? ctx.livingMarks().map(function (s) {
        const fs = ctx.bellFootScreen(s);
        const hs = ctx.heroScreen();
        let tscr = null;
        if (s.target && s.target.alive) tscr = ctx.projectXZ(s.target.x, s.target.z, 0.8);
        return {
          id: s.id, shape: ctx.spiritShape(s), x: s.x, z: s.z, angle: s.angle, avoid: s.avoid || 0,
          sx: fs.x, sy: fs.y, screenAngle: ctx.screenAngleTo(fs.x, fs.y, hs),
          rimErr: ctx.rimErrorPx(fs.x, fs.y),
          targetId: s.target && s.target.alive ? s.target.id : null,
          targetSx: tscr && tscr.x, targetSy: tscr && tscr.y,
          targetScreenAngle: tscr ? ctx.screenAngleTo(tscr.x, tscr.y, hs) : null,
          boss: false
        };
      }) : [],
      marked: ctx.S ? ctx.livingMarks().map(function (s) { return { id: s.id, shape: ctx.spiritShape(s), x: s.x, z: s.z, angle: s.angle, targetId: s.target && s.target.alive ? s.target.id : null }; }) : [],
      ring: ctx.S ? { r: ctx.ringR(), px: (ctx.lastMarkMetrics && ctx.lastMarkMetrics.ring && ctx.lastMarkMetrics.ring.px) || ctx.S.ringPx || 0, rx: ctx.lastMarkMetrics && ctx.lastMarkMetrics.ring && ctx.lastMarkMetrics.ring.rx, ry: ctx.lastMarkMetrics && ctx.lastMarkMetrics.ring && ctx.lastMarkMetrics.ring.ry, cx: ctx.lastMarkMetrics && ctx.lastMarkMetrics.ring && ctx.lastMarkMetrics.ring.cx, cy: ctx.lastMarkMetrics && ctx.lastMarkMetrics.ring && ctx.lastMarkMetrics.ring.cy, lv: ctx.S.ringLv || 0, frac: (ctx.lastMarkMetrics && ctx.lastMarkMetrics.ring && ctx.lastMarkMetrics.ring.frac) || 0, kind: ctx.lastMarkMetrics && ctx.lastMarkMetrics.ring && ctx.lastMarkMetrics.ring.kind, fov: (ctx.three && ctx.three.camera && ctx.three.camera.fov) || ctx.CFG.fov, bounce: !!(ctx.S.bounce), ripple: !!(ctx.S.landRipple && ctx.S.landRipple.t > 0) } : null,
      zombies: ctx.S ? ctx.S.zombies.filter(function (z) { return z.alive; }).map(function (z) { return { id: z.id, x: z.x, z: z.z, hp: z.hp, frozen: z.frozen > 0, freezeLeft: z.frozen || 0, burn: z.burn > 0, burnLeft: z.burn || 0, poison: z.poison || 0, stun: z.stun || 0, marked: !!z.marked, shape: z.marked || z.isBoss ? ctx.spiritShape(z) : null, isBoss: !!z.isBoss, seqI: z.isBoss ? z.seqI : 0, hasRim: !!(z.obj && z.obj.userData && (z.obj.userData.rim || z.obj.userData.bakedRim)), tele: !!(z.obj && z.obj.userData && z.obj.userData.teleOn) }; }) : [],
      items: ctx.S ? ctx.S.items.filter(function (i) { return i.alive; }).map(function (i) { return { id: i.id, type: i.kind, x: i.x, z: i.z }; }) : [],
      lastDash: ctx.S && ctx.S.lastDash,
      charge: ctx.S && ctx.S.charge, cleaveCount: ctx.S && ctx.S.cleaveCount, cleaveFx: ctx.S && ctx.S.cleaveFx,
      parry: ctx.S && { cd: ctx.S.parryCd || 0, hits: (ctx.S.parryHits || []).slice(), flash: ctx.S.parryFlash || 0 },
      inputBuf: (ctx.S && ctx.S.inputBuf) ? { type: ctx.S.inputBuf.type, age: ctx.now() - ctx.S.inputBuf.t0 } : null,
      wave: ctx.S && { fired: (ctx.S.wavesFired || []).slice(), pending: (ctx.S.waveIds || []).length },
      evo: ctx.S && Object.keys(ctx.S.evo || {}), evolved: ctx.S && (ctx.S.evolved || []).slice(),
      magnetR: ctx.S && ctx.S.magnetR,
      marks: (ctx.lastMarkMetrics && ctx.lastMarkMetrics.marks) || [],
      glyphs: (ctx.lastMarkMetrics && ctx.lastMarkMetrics.marks) || [],
      dashSeq: ctx.S && (ctx.S.dashSeq || 0),
      markStyle: ctx.lastMarkMetrics && ctx.lastMarkMetrics.markStyle,
      markCssPx: ctx.lastMarkMetrics && ctx.lastMarkMetrics.cssPx,
      bossState: ctx.S && ctx.S.boss ? (ctx.S.boss.state || 'walk') : null,
      elites: ctx.S ? ctx.S.zombies.filter(function (z) { return z.alive && z.elite; }).map(function (z) { return { id: z.id, hp: +(+z.hp).toFixed(1), attr: z.eliteAttr || null, invuln: z.invuln || 0 }; }) : [],
      combo: ctx.S && ctx.S.combo, comboMax: ctx.S && ctx.S.comboMax,
      stageNo: ctx.S && ctx.S.stageNo, stageName: ctx.S && ctx.S.stage && ctx.S.stage.name, stageMap: ctx.S && ctx.S.stage && ctx.S.stage.map,
      kills: ctx.S && (ctx.S.kills || 0), stars: ctx.S && (ctx.S.stars || 0),
      bursts: ctx.S && (ctx.S.bursts || []).slice(),
      runNo: ctx.S && ctx.S.runNo, pool: ctx.S && (ctx.S.pool || []).slice(),
      practice: ctx.S && { t: ctx.S.practiceT, shape: ctx.S.practiceShape, left: ctx.S.practiceSpawns },
      sightWave: ctx.S && ctx.S.sightWave,
      iframe: ctx.S && ctx.S.iframe, hitstop: ctx.S && ctx.S.hitstop, hurtFlash: ctx.S && ctx.S.hurtFlash,
      bellPans: ctx.S && (ctx.S.bellPans || []).slice(),
      lastRec: ctx.S && ctx.S.lastRec && { type: ctx.S.lastRec.type, best: ctx.S.lastRec.best, readMessage: ctx.S.lastRec.readMessage, reason: ctx.S.lastRec.reason },
      telegraphs: ctx.S ? ctx.S.zombies.filter(function (z) { return z.alive && z.obj && z.obj.userData && z.obj.userData.teleOn; }).map(function (z) { return z.id; }) : [],

      dashCount: ctx.S && ctx.S.dashCount,
      dashElem: ctx.S && ctx.S.dashElem,
      bell: ctx.S && { t: ctx.S.bellT, shape: ctx.S.bellShape, cinematic: !!(ctx.S.lastDash && ctx.S.lastDash.cinematic) },
      map: ctx.three && ctx.three.map && { id: ctx.three.map.id, name: ctx.three.map.name, key: ctx.three.map.key },
      chunks: ctx.three && ctx.three.chunks ? Object.assign({ center: { cx: ctx.three.chunks.center.cx, cz: ctx.three.chunks.center.cz }, jarsAlive: ctx.three.chunks.jars.filter(function (j) { return j.alive; }).length }, ctx.three.chunks.stats) : null,
      arena: ctx.S && ctx.S.arena ? { x: ctx.S.arena.x, z: ctx.S.arena.z, r: ctx.S.arena.r, bossAlive: !!(ctx.S.boss && ctx.S.boss.alive) } : null,
      hp: ctx.S && ctx.S.hp, coins: ctx.save.coins, playing: !!(ctx.S && ctx.S.playing), paused: ctx.S && ctx.S.paused,
      timeLeft: ctx.S && ctx.S.timeLeft, boss: !!(ctx.S && ctx.S.boss), bossAlive: !!(ctx.S && ctx.S.boss && ctx.S.boss.alive), bossSeqI: ctx.S && ctx.S.boss && ctx.S.boss.alive ? ctx.S.boss.seqI : null,
      fps: ctx.fpsReport(),
      touchAction: getComputedStyle(document.body).touchAction,
      overscroll: getComputedStyle(document.body).overscrollBehavior,
      toast: $('toast').hidden ? '' : $('toast').textContent,
      titleShown: $('ov-title').classList.contains('show')
    };
  }
};
}
