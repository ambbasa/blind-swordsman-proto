/* v2/js/modules/dashController.js — 일섬 돌진·아레나 경계·기물 충돌·콤보/선입력 컨트롤러 */

export function createDashController(rt, deps) {
  const $ = rt.$;
  const showJudge = deps.showJudge;
  const stampSkill = deps.stampSkill;

function ringSpiritBell(sp) {
  if (!sp) return;
  /* v0.31 §5.3 방울 공명: 혼령이 붙는 순간 그 원귀에게 피해(보스제외). */
  const rs = rt.upLv('reson');
  if (rs && sp.target && sp.target.alive && !sp.target.isTotem && !sp.target.isClone && !sp.target.isPillar) {
    const d = (rt.CFG.resonCard.dmg || [0.5, 0.8, 1.1])[Math.min(2, rs - 1)];
    stampSkill('reson', sp.target.x, sp.target.z);
    rt.hurtZombie(sp.target, d, 'reson', rt.S && rt.S.lastDash);
    /* v0.98 천종 진화: 방울 공명이 주변 3.8m 적에게 1.35배 광역 공명 피해 + 옥빛 파동 */
    if (rt.S && rt.S.evo && rt.S.evo.cheonjong) {
      const aoeDmg = d * 1.35;
      (rt.S.zombies || []).forEach(function (o) {
        if (!o.alive || o === sp.target || o.isClone || o.isTotem || o.isPillar) return;
        if (rt.dist(o, sp.target) <= 3.8 + (o.r || 0.5)) rt.hurtZombie(o, aoeDmg, 'reson', rt.S && rt.S.lastDash);
      });
      rt.inkFx.ring(3.6, rt.FX_COLORS.jade, 0.45);
      if (rt.three && rt.three.vfx3d) rt.three.vfx3d.spawnSwirl(sp.target.x, sp.target.z, { r0: 0.9, r1: 3.6, accentHex: 0x7ef5d4, dur: 0.34 });
    }
  }
  if (!rt.audio) return;
  rt.audio.setQuiet(rt.qa.mute, rt.qa.noDelay);
  const w = rt.viewBox().width;
  const scr = rt.screenOf(sp);
  const pan = Math.max(-1, Math.min(1, (scr.x / Math.max(1, w)) * 2 - 1));
  const darkBell = !!(rt.S && rt.S.goal && rt.S.goal.id === 'dark' && rt.goalWindowOn());
  rt.audio.bell(pan, rt.spiritShape(sp), (rt.relicOn(rt.save, 'oldbell') ? 1.5 : 1) * (darkBell ? 2 : 1));
  if (sp && sp.target && sp.target.alive) {
    sp.target.bellMarked = true;
    sp.target.bellMarkedAt = (rt.S && rt.S.elapsed) || 0;
  }
  if (rt.S) {
    rt.S.lastBellT = rt.S.elapsed || 0;
    const bc = rt.swordFx(rt.save).bellCharge || 0;
    if (bc > 0) rt.S.charge = Math.min(rt.CFG.cleaveCharge || 100, (rt.S.charge || 0) + bc);
  }
  rt.S.bellPans = [{ id: sp.id, pan: pan, x: sp.x, z: sp.z, shape: rt.spiritShape(sp) }];
  if (rt.audio.setLastPans) rt.audio.setLastPans(rt.S.bellPans);
}
function triggerComboBurst(n) {
  if (!rt.S) return;
  rt.S.lastBurst = n;
  rt.S.bursts.push(n);
  rt.S.shake = 0.5;
  const idx = Math.max(0, (rt.CFG.comboBurstAt || [4, 8, 12]).indexOf(n));
  const R = (rt.CFG.comboBurstR || [3.2, 4.2, 5.2])[idx] || 3.5;
  const mul = (rt.CFG.comboBurstDmg || [1, 1.5, 2])[idx] || 1;
  const dmg = ((rt.S.dashDmg || rt.CFG.dashDmg) * mul);
  rt.S.zombies.forEach(function (z) {
    if (!z.alive) return;
    if (rt.dist(z, rt.S.hero) <= R + z.r) rt.hurtZombie(z, dmg, 'combo-burst', rt.S.lastDash);
  });
  const app = $('app');
  if (app) {
    app.classList.add('combo-burst');
    const hold = rt.qa.noDelay ? 0 : (rt.CFG.comboBurstMs || 220);
    rt.S.comboBurstT = hold / 1000;
    setTimeout(function () {
      rt.S.comboBurstT = 0;
      app.classList.remove('combo-burst');
    }, hold);
  }
  showJudge(n + '콤보!');
  if (rt.audio) rt.audio.explode();
  if (rt.three && rt.three.bloom && rt.three.bloom.setStrength && rt.fxQ !== 'off') {
    /* 콤보 버스트 순간에는 프리셋보다 조금 더 밝게 번쩍였다가 돌아온다(임계값 1.15 는 그대로). */
    const prev = 0.16;
    rt.three.bloom.setStrength(0.36);
    setTimeout(function () { if (rt.three.bloom) rt.three.bloom.setStrength(prev); }, rt.qa.noDelay ? 0 : 300);
  }
  if (rt.art && rt.art.playFx && rt.three) {
    const fx = rt.art.playFx(rt.three.scene, 'ink-splat', rt.S.hero.x, rt.S.hero.z, 1.6);
    if (fx) {
      fx.life = Math.min(fx.life || 0.3, 0.28);
      fx.max = Math.min(fx.max || 0.3, 0.28);
      rt.three.fx.push(fx);
    }
  }
}
/* Combo: a dash that cuts something within comboTimeout of the last one adds 1.
   v0.31 §3.3: 빗나간 일섬은 콤보를 0이 아니라 절반으로 내린다(연속 두 번 빗나가면 0).
   단계 보상: 10 참+10 · 15 다음 일섬 폭 ×1.5 · 20 혼백+3·엽전+5 · 30부터 10마다 참+10. */
const COMBO_CUT_WHY = { slash: 1, break: 1, crack: 1, 'crack-same': 1, 'seal-break': 1, echo: 1, counter: 1, reson: 1 };
function cutRec(rec) {
  if (!rec) return false;
  if (rec.bossCut) return true;
  return (rec.hits || []).some(function (h) { return COMBO_CUT_WHY[h.why]; });
}
function dropCombo(n) {
  if (!rt.S) return;
  rt.S.comboDrop = n || 'half';
  rt.S.comboFlash = 0.5;
  if ($('comboLabel')) $('comboLabel').classList.remove('tier');
}
function comboBreak() {
  if (!rt.S) return;
  const c = rt.S.combo || 0;
  if (!c) return;
  /* v0.98 화살검(emberSave/emberMul): 콤보가 끊길 때 불씨 유지 + 다음 일섬 피해 증가 */
  const swFx = rt.swordFx(rt.save);
  if (swFx.emberSave && (rt.S._emberSaveUsed || 0) < swFx.emberSave) {
    rt.S._emberSaveUsed = (rt.S._emberSaveUsed || 0) + 1;
    rt.S.comboIdle = 0;
    rt.S.emberBuffMul = 1 + (swFx.emberMul || 0.30);
    rt.inkFx.ring(2.8, rt.FX_COLORS.fire || rt.FX_COLORS.red, 0.45);
    showJudge('화살검 불씨 유지 · 다음 일섬 +' + Math.round((swFx.emberMul || 0.30) * 100) + '%');
    rt.telemetry.event('sword', { id: 'hwa', combo: c, saveN: rt.S._emberSaveUsed });
    return;
  }
  rt.S._emberSaveUsed = 0;
  rt.S.comboBreakN = (rt.S.comboBreakN || 0) + 1;
  rt.S.combo = rt.S.comboBreakN >= 2 ? 0 : Math.floor(c / 2);
  rt.S.comboIdle = 0;
  dropCombo(rt.S.comboBreakN >= 2 ? 'zero' : 'half');
  if (rt.S.comboBreakN >= 2) rt.S.comboBreakN = 0;
}
function comboReward(n) {
  if (!rt.S) return null;
  const T = rt.CFG.comboTiers || {};
  const tier = T[n] || (n > 30 && (n - 30) % 10 === 0 ? T[30] : null);
  if (!tier) return null;
  const bits = [];
  if (tier.charge) { rt.addCharge(tier.charge); bits.push('참 +' + tier.charge); }
  if (tier.wide) { rt.S.pathWideN = 1; bits.push('다음 일섬 폭 ×' + tier.wide); }
  if (tier.xp) { rt.gainXp(tier.xp); bits.push('혼백 +' + tier.xp); }
  if (tier.coin) { rt.save.coins += tier.coin; rt.persist(); bits.push('엽전 +' + tier.coin); }
  rt.S.comboTierN = (rt.S.comboTierN || 0) + 1;
  if ($('comboLabel')) $('comboLabel').classList.add('tier');
  rt.S.comboFlash = 0.6;
  rt.S.goldEdge = Math.max(rt.S.goldEdge || 0, 0.2);
  if (rt.audio) { if (rt.audio.bell) rt.audio.bell(0, 'bolt'); if (rt.audio.parry) rt.audio.parry(); }
  rt.inkFx.ring(3.2, rt.FX_COLORS.gold, 0.5);
  showJudge(n + '콤보 · ' + bits.join(' · '));
  rt.telemetry.event('combo_tier', { n: n, stage: rt.S.stageNo, reward: bits.slice() });
  return bits;
}
function scoreDash(rec) {
  if (!rt.S || !rec || rec.scored) return;
  rec.scored = true;
  if (!rec.targets || !rec.targets.length) return;
  /* A boss cut counts too, or the combo would sit at 0 for the whole boss fight. */
  const cut = cutRec(rec);
  if (!cut) { comboBreak(); return; }
  rt.S.combo = (rt.S.combo || 0) + 1;
  rt.S.comboIdle = 0;
  rt.S.comboBreakN = 0;
  if (rt.S.combo > (rt.S.comboMax || 0)) rt.S.comboMax = rt.S.combo;
  if ((rt.CFG.comboBurstAt || [4, 8, 12]).indexOf(rt.S.combo) >= 0) triggerComboBurst(rt.S.combo);
  comboReward(rt.S.combo);
  /* v0.98: 구 comboFire 키 제거 (화살검은 comboBreak의 emberSave/emberMul로 통합) */
}

function triggerSightWave() {
  if (!rt.S) return;
  rt.S.sightWave = 1;
  const app = $('app');
  if (app) {
    app.classList.remove('sight-wave');
    void app.offsetWidth;
    app.classList.add('sight-wave');
    setTimeout(function () { app.classList.remove('sight-wave'); }, rt.qa.noDelay ? 0 : 700);
  }
}
function dashDirOf(tgt, from) {
  from = from || (rt.S && rt.S.hero) || { x: 0, z: 0 };
  if (!tgt) return { x: 0, z: 1 };
  if (tgt.kind === 'spirit' || (tgt.angle != null && tgt.kind !== 'zombie')) {
    if (tgt.target && tgt.target.alive) {
      const dx = tgt.target.x - from.x, dz = tgt.target.z - from.z, L = Math.hypot(dx, dz) || 1;
      return { x: dx / L, z: dz / L };
    }
    const dx = (tgt.x != null ? tgt.x : from.x) - from.x;
    const dz = (tgt.z != null ? tgt.z : from.z) - from.z;
    const L = Math.hypot(dx, dz);
    if (L > 0.05) return { x: dx / L, z: dz / L };
    return { x: 0, z: 1 };
  }
  const dx = tgt.x - from.x, dz = tgt.z - from.z, L = Math.hypot(dx, dz) || 1;
  return { x: dx / L, z: dz / L };
}
function safeLand(from, to) {
  let x = to.x, z = to.z;
  const clipped = clipBound({ x: x, z: z });
  x = clipped.x; z = clipped.z;
  const dx = x - from.x, dz = z - from.z, L = Math.hypot(dx, dz) || 1;
  function blocked(px, pz) {
    const c = clipBound({ x: px, z: pz });
    if (Math.hypot(c.x - px, c.z - pz) > 0.01) return true;
    let hit = false;
    (rt.S.zombies || []).forEach(function (q) {
      if (!q.alive) return;
      if (Math.hypot(px - q.x, pz - q.z) < (q.r || 0.55) + 0.5) hit = true;
    });
    return hit;
  }
  if (!blocked(x, z)) return { x: x, z: z };
  const minU = 0.45;
  for (let u = 0.92; u >= minU; u -= 0.04) {
    const px = from.x + dx * u, pz = from.z + dz * u;
    if (!blocked(px, pz)) return { x: px, z: pz };
  }
  return { x: from.x + dx / L * Math.max(1, L * minU), z: from.z + dz / L * Math.max(1, L * minU) };
}
/* v0.22: 맵은 끝없이 이어진다. 보스 결계가 서 있을 때만 아레나 원 안으로 묶는다. */
function clampPointToArena(x, z, pad) {
  if (!rt.arenaActive()) return { x: x, z: z };
  const A = rt.S.arena, R = Math.max(2, rt.arenaR() - (pad || 0));
  const dx = x - A.x, dz = z - A.z, ro = Math.hypot(dx, dz);
  if (ro <= R) return { x: x, z: z };
  return { x: A.x + dx * R / ro, z: A.z + dz * R / ro };
}
/* v0.48 고정 아레나: 무대 자체의 플레이 반경(three.chunks.bounds) — 영웅과 귀물이 이 밖으로 나가지 않는다.
   보스 결계(arenaActive)는 그 안에서 한 번 더 좁힌다. */
function worldBounds() {
  const b = rt.three && rt.three.chunks && rt.three.chunks.bounds;
  return (b && b.r > 0) ? b : null;
}
/* v0.64: 지형지물(arena.props + terrain3d.colliders) 충돌 해소 — 주인공·몬스터가 기물을 뚫고 지나가지 않도록 부드럽게 밀어냄 */
function resolvePropCollision(x, z, entityR) {
  const er = entityR == null ? 0.55 : entityR;
  let px = x, pz = z;
  const arenaProps = (rt.three && rt.three.chunks && rt.three.chunks.arena && rt.three.chunks.arena.props) || null;
  const tCols = (rt.three && rt.three.terrain3d && rt.three.terrain3d.colliders) || null;
  if (!arenaProps && !tCols) return { x: px, z: pz };
  for (let pass = 0; pass < 2; pass++) {
    if (arenaProps) {
      for (let i = 0; i < arenaProps.length; i++) {
        const p = arenaProps[i];
        if (!p) continue;
        const pr = p.cr != null ? p.cr : Math.min(2.0, Math.max(0.7, (p.r || 1.5) * 0.55));
        const minD = pr + er;
        const dx = px - p.x, dz = pz - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD) {
          const d = Math.sqrt(d2);
          if (d > 1e-4) {
            px = p.x + (dx / d) * minD;
            pz = p.z + (dz / d) * minD;
          } else {
            const ang = Math.atan2(-p.z, -p.x);
            px = p.x + Math.cos(ang) * minD;
            pz = p.z + Math.sin(ang) * minD;
          }
        }
      }
    }
    if (tCols) {
      for (let i = 0; i < tCols.length; i++) {
        const p = tCols[i];
        if (!p) continue;
        const minD = (p.r || 0.7) + er;
        const dx = px - p.x, dz = pz - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD) {
          const d = Math.sqrt(d2);
          if (d > 1e-4) {
            px = p.x + (dx / d) * minD;
            pz = p.z + (dz / d) * minD;
          } else {
            const ang = Math.atan2(-p.z, -p.x);
            px = p.x + Math.cos(ang) * minD;
            pz = p.z + Math.sin(ang) * minD;
          }
        }
      }
    }
  }
  return { x: px, z: pz };
}
function clipWorld(p, pad) {
  const b = worldBounds();
  let x = p.x, z = p.z;
  const er = pad == null ? 0.55 : pad;
  const res = resolvePropCollision(x, z, er);
  x = res.x; z = res.z;
  if (!b) return { x: x, z: z };
  const R = Math.max(2, b.r - er);
  const dx = x - b.x, dz = z - b.z, ro = Math.hypot(dx, dz);
  if (ro <= R) return { x: x, z: z };
  return { x: b.x + dx * R / ro, z: b.z + dz * R / ro };
}
function clipBound(p) {
  const w = clipWorld(p);
  if (!rt.arenaActive()) return w;
  const A = rt.S.arena, R = rt.arenaR() - (rt.CFG.arenaEdge || 0.6);
  const dx = w.x - A.x, dz = w.z - A.z;
  const ro = Math.hypot(dx, dz);
  if (ro <= R) return w;
  return { x: A.x + dx * R / ro, z: A.z + dz * R / ro };
}
/* 넉백·반동으로도 결계 밖으로 밀리지 않게 영웅을 다시 안으로 넣는다. */
function clampHeroToArena() {
  if (!rt.S || !rt.S.hero) return false;
  /* 돌진 중에는 from→to 보간을 건드리지 않는다(목표점은 시작할 때 이미 경계 안으로 잘렸다). */
  if (rt.S.dash) return false;
  const c = clipBound(rt.S.hero);
  if (Math.abs(c.x - rt.S.hero.x) < 1e-6 && Math.abs(c.z - rt.S.hero.z) < 1e-6) return false;
  rt.S.hero.x = c.x; rt.S.hero.z = c.z;
  if (rt.three && rt.three.heroSpr) rt.placeGroup(rt.three.heroSpr, rt.S.hero.x, rt.S.hero.z);
  return true;
}
function dashEndPoint(from, tgt, shape) {
  /* v1.06 기믹·회전 전용 혼령(worldAnchor)은 관통 오버슈트 없이 지정 안전 좌표에 정확히 착지 */
  if (tgt && tgt.worldAnchor && tgt.wx != null && tgt.wz != null) {
    const raw = clipBound({ x: tgt.wx, z: tgt.wz });
    const land = safeLand(from, raw);
    return { x: land.x, z: land.z, raw: raw };
  }
  const st = (rt.SHAPE_STYLE && shape && rt.SHAPE_STYLE[shape]) || null;
  const reachMul = (st && st.reachMul) || 1.0;
  const dir = dashDirOf(tgt, from);
  const R = rt.ringR();
  let len = R * (rt.CFG.dashThroughMul || 1.5) * reachMul;
  const lock = tgt && (tgt.target && tgt.target.alive ? tgt.target : (tgt.kind === 'zombie' ? tgt : null));
  /* Land clear of the target: bigger bodies need a longer run-out. */
  if (lock) {
    const past = ((rt.CFG.dashPastTarget || 0.8) + (lock.r || 0) * (rt.CFG.dashPastBodyMul || 1.5)) * reachMul;
    len = Math.max(len, rt.dist(from, lock) + past);
    /* 상대를 베고 너무 멀리 달려나가지 않는다 — 다음 혼령이 사거리 안에 남도록. */
    len = Math.min(len, rt.dist(from, lock) + past + (rt.CFG.dashPastExtra || 2.0) * reachMul);
  }
  const raw = clipBound({ x: from.x + dir.x * len, z: from.z + dir.z * len });
  const land = safeLand(from, raw);
  return { x: land.x, z: land.z, raw: raw };
}
/* v0.49.2 2칸 FIFO 선입력 버퍼: 연타 시 앞선 예약을 덮어쓰지 않고 순서대로 이어 붙인다. */
function enqueueInputBuf(entry) {
  if (!rt.S) return { queued: false, size: 0, overwritten: false };
  if (!rt.S.inputQueue) rt.S.inputQueue = rt.createInputQueue({ maxSize: 3, dedupMs: 36, graceMs: 420 });
  const tNow = (entry && entry.t0 != null) ? entry.t0 : rt.now();
  const res = rt.S.inputQueue.push(entry, tNow);
  rt.S.inputBuf = rt.S.inputQueue.peek();
  /* 후속 획이 대기 중이면 남은 히트스톱을 45ms로 정리해 연속 일섬 반응성을 끌어올린다. */
  if (res.queued && rt.S.hitstop > 0.045) rt.S.hitstop = 0.045;
  return res;
}
/* 선입력 버퍼 소비: 착지 0프레임에 예약된 획을 이어 붙인다. */
function consumeInputBuf() {
  if (!rt.S) return false;
  let b = null;
  if (rt.S.inputQueue) {
    b = rt.S.inputQueue.shiftValid(rt.now());
    rt.S.inputBuf = rt.S.inputQueue.peek();
  } else if (rt.S.inputBuf) {
    b = rt.S.inputBuf;
    rt.S.inputBuf = null;
    if (rt.now() - b.t0 > (b.ttl || 450) + 350) b = null;
  }
  if (!b) return false;
  if (!rt.S.playing || rt.S.paused) return false;
  if (b.type === 'circle') return false;
  rt.S.comboGrace = Math.max(rt.S.comboGrace || 0, 0.12);
  beginDash(b.type, { dir: b.dir, quality: b.quality, tInput: b.t0, chained: true });
  return true;
}
function beginDash(shape, opts) {
  opts = opts || {};
  if (!rt.S || !rt.S.playing || rt.S.paused || rt.S.dash) return null;
  /* §6.1 뿌리: 착지 직후 0.4초는 몸이 묶인다 — 획은 예약으로 남는다. */
  if (rt.terrainDashingBlocked()) {
    showJudge('뿌리에 묶였다');
    enqueueInputBuf({ type: shape, dir: (('dir' in opts) ? opts.dir : (rt.S.lastStrokeDir || null)), t0: opts.tInput || rt.now(), ttl: 550, quality: opts.quality });
    return { type: shape, targets: [], hits: [], items: [], bound: true };
  }
  const n = rt.S.dashCount;
  const dir = ('dir' in opts) ? opts.dir : (rt.S.lastStrokeDir || null);
  const targets = rt.pickSpirits(shape, n, rt.S.hero, dir, null);
  if (!targets.length) {
    const marks = rt.livingMarks();
    let nearby = null, bestD = 1e9;
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (!rt.isOnScreen(m, 20)) continue;
      const d = rt.dist(m, rt.S.hero);
      if (d < bestD) { bestD = d; nearby = m; }
    }
    const hint = nearby && rt.SHAPE_MARK[rt.spiritShape(nearby)];
    if (rt.audio && rt.audio.whiff) rt.audio.whiff();
    showJudge(hint ? ('대상 없음 · ' + hint + ' 그리기') : '대상 없음');
    rt.toast(hint ? ('가까운 혼령을 향해 ' + hint) : '혼령이 보이면 종의 무늬를 그리세요');
    return { type: shape, targets: [], hits: [], items: [] };
  }
  rt.S.dashQuality = (opts.quality != null) ? opts.quality : 0;
  /* §5.4 두 원소 교대: 일섬마다 실리는 원소를 바꾼다. */
  if ((rt.S.elemSlots || []).length >= 2) rt.S.elemIdx = ((rt.S.elemIdx || 0) + 1) % 2;
  const tStart = rt.now();
  const rec = {
    type: shape, targets: targets.map(function (t) { return t.id; }), hits: [], items: [],
    t0: tStart, tInput: opts.tInput || tStart, chained: !!opts.chained, hitstopMs: 0,
    segs: [], elem: rt.curElem(), cinematic: false, quality: rt.S.dashQuality
  };
  rt.S.dashSeq = (rt.S.dashSeq || 0) + 1;
  rt.S.lastDash = rec;
  rt.S.dashQueue = targets.slice();
  /* Only the first cut of a one-bell spell is the slow cinematic; later cuts run at full speed. */
  if (rt.S.bellT > 0 && rt.S.bellShape === shape && targets.length && !rt.S.bellCine) { rt.S.bellCine = true; rt.triggerCinematic(); }
  startSeg();
  return rec;
}
// The first cut teaches the shape; the next asks which side to land on.
function openMarketFork() {
  if (rt.S.stageNo !== 1 || rt.S.sandbox || rt.S.marketForkSeen || rt.S.boss || !rt.S.lastDash?.hits.length) return;
  rt.S.marketForkSeen = true;
  const origin = rt.S.hero;
  const reach = rt.ringR() * 0.68 * Math.SQRT1_2;
  const point = k => clampPointToArena(origin.x + k * reach, origin.z - k * reach, 1.2);
  const foe = (k, type) => rt.spawnZombie({ ...point(k), type });
  foe(0.48, 'imp');
  const guard = foe(1, 'brute');
  const escape = foe(-1, 'imp');
  rt.livingMarks().forEach(rt.destroySpirit);
  /* v0.64: 튜토리얼 첫 일섬 직후 예약 버퍼를 비워 새 혼령이 보이기 전에 자동 연속 발동되는 현상 방지 */
  if (rt.S.inputQueue && rt.S.inputQueue.clear) rt.S.inputQueue.clear();
  rt.S.inputBuf = null;
  rt.S.spiritCap = Math.max(2, rt.S.spiritCap);
  for (const target of [guard, escape]) {
    if (target) rt.spawnSpirit({ x: target.x, z: target.z, target });
  }
  rt.showGuide('← 포위 탈출 · 장정에게 진입 →', 4);
}
function startSeg() {
  if (!rt.S.dashQueue.length) {
    rt.S.dash = null; scoreDash(rt.S.lastDash);
    openMarketFork();
    consumeInputBuf();
    rt.maybeEnd(); return;
  }
  const tgt = rt.S.dashQueue.shift();
  if (!tgt.alive) { startSeg(); return; }
  const from = { x: rt.S.hero.x, z: rt.S.hero.z };
  const shapeNow = (rt.S.lastDash && rt.S.lastDash.type) || null;
  const end = dashEndPoint(from, tgt, shapeNow);
  const to0 = { x: end.x, z: end.z };
  let raw = end.raw ? { x: end.raw.x, z: end.raw.z } : to0;
  /* §6.1 지형: 대숲(느려짐·피해) · 물길(길이 −30%) · 종 · 혈석 */
  const tadj = rt.onDashPath(from, raw);
  let to = { x: to0.x, z: to0.z };
  const rl = Math.hypot(raw.x - from.x, raw.z - from.z) || 1;
  const tl = Math.hypot(tadj.to.x - from.x, tadj.to.z - from.z);
  if (tl < rl - 1e-4) {
    /* 물길: 경로와 착지점을 같은 비율로 줄인다. */
    const u = rt.clamp(tl / rl, 0, 1);
    raw = { x: from.x + (raw.x - from.x) * u, z: from.z + (raw.z - from.z) * u };
    to = { x: from.x + (to0.x - from.x) * u, z: from.z + (to0.z - from.z) * u };
  }
  const stStyle = (rt.SHAPE_STYLE && shapeNow && rt.SHAPE_STYLE[shapeNow]) || null;
  const slash = rt.makeSlash(from, raw, shapeNow);
  /* v1.30 발도술 가속 & 무늬별 리듬: 단타 0.12~0.16초, 연타 0.09~0.12초로 쾌속 절단 */
  const chained = !!(rt.S.lastDash && rt.S.lastDash.chained);
  const baseDashDur = chained ? ((stStyle && stStyle.chainDur) || 0.11) : ((stStyle && stStyle.dur) || 0.15);
  rt.S.dash = { from: from, to: to, raw: raw, t: 0, dur: baseDashDur + (tadj.dur || 0), target: tgt, slash: slash, judged: false, dmgMul: tadj.dmgMul || 1, shape: shapeNow };
  rt.S.iframe = Math.max(rt.S.iframe || 0, baseDashDur + 0.12);
  rt.S.shake = Math.max(rt.S.shake || 0, 0.16);
  rt.S.lastDash.segs.push({ from: from, to: raw, r: rt.pathR() });
  rt.S.lastDash.dmgMul = tadj.dmgMul || 1;
  rt.S.lastDash.vfxAt = rt.S.lastDash.vfxAt || rt.now();
  rt.afterimages(from, to);
  /* §3.1 + v0.50: 칼날 소리는 획 길이와 콤보 단계에 따라 날카롭고 풍성하게 오른다. */
  if (rt.audio) rt.audio.slash(rt.S.strokeLenRatio == null ? 0.55 : rt.S.strokeLenRatio, rt.S.combo || 0);
  triggerSightWave();
}
function resolveDash(d) {
  if (!d || d.judged) return;
  d.judged = true;
  const hitTo = d.raw || d.to;
  rt.applyPath(d.from, hitTo, rt.S.lastDash, null);
  /* §5.3 메아리 칼: 이 일섬의 경로를 0.5초 뒤 한 번 더 지나간다. */
  rt.queueEcho(rt.S.lastDash);
  /* §3.3 15콤보 폭 보상은 한 번만 — 이 일섬이 그 혜택을 썼다. */
  if (rt.S.pathWideN > 0) rt.S.pathWideN = Math.max(0, rt.S.pathWideN - 1);
  const boss = rt.S && rt.S.boss;
  /* Only a dash aimed at the boss (its spirit, so its current shape) advances the order; grazing it on the way to another spirit does not. */
  const aimed = d.target && (d.target === boss || d.target.target === boss);
  const fake = d.target && d.target.target;
  if (fake && fake.isClone && fake.alive) rt.popClone(fake, true);
  if (boss && boss.alive && aimed && rt.segDist(boss.x, boss.z, d.from.x, d.from.z, hitTo.x, hitTo.z) <= rt.pathR() + boss.r) {
    rt.cutBoss(boss);
    if (rt.S.lastDash) rt.S.lastDash.bossCut = true;
  }
}
function landDash(d) {
  rt.S.iframe = Math.max(rt.S.iframe || 0, rt.CFG.landIframe || 0.25);
  landingShock(d.to);
  const dx = d.to.x - d.from.x, dz = d.to.z - d.from.z, L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;
  rt.S.recoil = { x: ux, z: uz, t: rt.CFG.recoilT || 0.12, dur: rt.CFG.recoilT || 0.12, amp: rt.CFG.recoilU || 0.12 };
  rt.S.shake = Math.max(rt.S.shake || 0, 0.22);
  const back = rt.CFG.landBounce || 0.28;
  rt.S.bounce = {
    from: { x: d.to.x, z: d.to.z },
    to: { x: d.to.x - ux * back, z: d.to.z - uz * back },
    t: 0, dur: rt.CFG.landBounceT || 0.16
  };
  rt.S.landRipple = { x: d.to.x, z: d.to.z, t: 1, dur: rt.CFG.landRippleDur || 0.45 };
  rt.S.sightWave = 1;
  triggerSightWave();
  /* §5.3 먹 발자국: 착지 자리에 먹 웅덩이 */
  rt.dropInkStep(d.to);
  if (rt.three && rt.three.ink && rt.three.ink.hit) {
    rt.three.ink.hit(d.to.x, d.to.z, ux, uz);
    rt.fxinkStat.hits++;
  }
  /* §6.1 착지 지형: 잔해(비틀) · 눈밭(미끄러짐) · 뿌리(묶임 + 충격 2배) */
  rt.onLand(d.to, d);
  /* v0.49.2 P0 계측: 단타·연타·다수 처치별 입력→돌진→착지 지연 기록 */
  if (rt.S && rt.S.dashLatency && rt.S.lastDash && !(rt.S.dashQueue && rt.S.dashQueue.length)) {
    const rec = rt.S.lastDash;
    const entry = rt.S.dashLatency.record({
      shape: rec.type,
      chained: !!rec.chained,
      hits: (rec.hits && rec.hits.length) || 0,
      tInput: rec.tInput || rec.t0,
      tStart: rec.t0,
      tLand: rt.now(),
      hitstopMs: rec.hitstopMs || 0,
      frameDtMs: rt.frameDt * 1000,
      tailCanceled: !!d.tailCanceled
    });
    rt.telemetry.event('dash_latency', { ...entry, tInput: rec.tInput, targetIds: rec.targets.slice(), hitIds: rec.hits.map(hit => hit.id) });
  }
}
function landingShock(at) {
  if (!rt.S) return;
  const sh = (rt.S.lastDash && rt.S.lastDash.type) || null;
  const st = (rt.SHAPE_STYLE && sh && rt.SHAPE_STYLE[sh]) || null;
  const R = (rt.CFG.landShockR || 1.6) * ((st && st.landR) || 1.0);
  const push = (rt.CFG.landPush || 1.2) * (sh === 'hline' ? 1.2 : (sh === 'vee' ? 1.35 : 1.0));
  const stun = Math.max(rt.CFG.landStun || 0.3, (st && st.landStun) || 0);
  const landDmg = (st && st.landDmgMul > 0) ? (rt.dashDmg() * st.landDmgMul) : 0;
  if (landDmg > 0 && at) {
    rt.inkFx.ring(R, rt.FX_COLORS.violet || 0xc07eff, 0.42);
    if (rt.three && rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(at.x, at.z, { r0: 0.45, r1: R * 1.18, colorHex: 0xc07eff, coreHex: 0xfff0ff, dur: 0.34 });
    if (rt.three && rt.three.vfx3d) rt.three.vfx3d.spawnSparks(at.x, at.z, 14, { color: 0xd09aff, speed: 6.4 });
  }
  rt.magnetPull(at);
  if (rt.three && rt.three.chunks) rt.three.chunks.jarsNear(at.x, at.z, R + 0.7).forEach(rt.breakJar);
  if (rt.S.evo && rt.S.evo.frostNova) rt.frostLanding(at);
  /* v0.98 서릿검(frostField): 착지 반경 1.8m에 서리권 전개(보스 포함 감속 -40%) */
  const seoriDur = rt.swordFx(rt.save).frostField || 0;
  if (seoriDur > 0 && at) {
    const fR = 1.8;
    rt.inkFx.ring(fR, rt.FX_COLORS.ice || 0x8ad8ff, Math.min(0.8, seoriDur));
    (rt.S.zombies || []).forEach(function (z) {
      if (!z.alive || z.isClone) return;
      if (rt.dist(z, at) > fR + (z.r || 0.5)) return;
      z.slowT = Math.max(z.slowT || 0, seoriDur);
      z.inkSlow = Math.max(z.inkSlow || 0, 0.40);
      if (z.isBoss) z.chillT = Math.max(z.chillT || 0, seoriDur);
      rt.tintZombie(z);
    });
  }
  if (rt.S.evo && rt.S.evo.fireTrail) rt.fireLanding(at);
  if (rt.S.evo && rt.S.evo.fireTrail) {
    /* 묵염(墨炎) 장판: 착지점 한 곳이 아니라 베고 지나온 자리에 불길이 남는다. */
    rt.S.clouds = rt.S.clouds || [];
    const seg = (rt.S.lastDash && rt.S.lastDash.segs && rt.S.lastDash.segs[rt.S.lastDash.segs.length - 1]) || null;
    const pts = seg ? [0.45, 0.8, 1.0].map(function (u) {
      return { x: seg.from.x + (seg.to.x - seg.from.x) * u, z: seg.from.z + (seg.to.z - seg.from.z) * u };
    }) : [{ x: at.x, z: at.z }];
    pts.forEach(function (p) {
      const fires = rt.S.clouds.filter(function (c) { return c.kind === 'fire' && c.t > 0; });
      if (fires.length >= 12) return;
      if (fires.some(function (c) { return rt.dist(c, p) < 0.9; })) return;
      rt.S.clouds.push({ kind: 'fire', x: p.x, z: p.z, t: 4, tick: 0.55, r: 1.6 });
    });
  }
  rt.S.zombies.forEach(function (z) {
    /* 보스는 착지 충격에 밀리지도 굳지도 않는다(몸이 커서 매번 걸리고, 경직이 걷기 시간을 멈춘다). */
    if (!z.alive || z.isBoss) return;
    const d = rt.dist(z, at);
    if (d > R + (z.r || 0)) return;
    const k = d < 1e-3 ? 1 : 1;
    const ux = d < 1e-3 ? 1 : (z.x - at.x) / d;
    const uz = d < 1e-3 ? 0 : (z.z - at.z) / d;
    const pushed = resolvePropCollision(z.x + ux * push, z.z + uz * push, z.r || 0.55);
    z.x = pushed.x;
    z.z = pushed.z;
    z.stun = Math.max(z.stun || 0, stun);
    if (landDmg > 0 && !z.isClone) rt.hurtZombie(z, landDmg, 'slam-land', rt.S.lastDash);
    if (z.obj) rt.placeGroup(z.obj, z.x, z.z);
  });
  if (rt.S.lastDash) rt.S.lastDash.shock = { x: at.x, z: at.z, r: R, push: push };
}

  return { ringSpiritBell, triggerComboBurst, comboBreak, comboReward, scoreDash, triggerSightWave, clampPointToArena, worldBounds, resolvePropCollision, clipWorld, clipBound, clampHeroToArena, dashEndPoint, enqueueInputBuf, consumeInputBuf, beginDash, startSeg, resolveDash, landDash, landingShock };
}
