/* v2/js/modules/bossOverlay.js — 보스 패턴 2D 캔버스 예고·배너·기물·기세·봉인 오버레이 렌더러 */

export function createBossOverlay(rt, deps) {
  const { bossPat, kiaiWin, bossMinions, reflectReady, bossPatList, bossBannerInfo } = deps;

/* 보스 패턴 그림: 예고 색 고리·문구, 기모으기 게이지, 내려찍기 원, 탄막 부채, 영창 무늬, 은신 방울, 기세, 봉인. */
function drawBossPat(ctx, r, hs) {
  const z = rt.S.boss;
  if (z && z.alive) {
    rt.bossFx.setColorblind(rt.a11yCb());
    const bInfo = bossBannerInfo(z);
    if (bInfo) rt.bossFx.drawSkillBanner(ctx, r, bInfo, rt.S.elapsed || 0);
  }
  if (rt.S.sealFx > 0) {
    const k = rt.clamp(rt.S.sealFx / 0.9, 0, 1);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '400 ' + Math.round(Math.min(r.width, r.height) * 0.32) + 'px "InkBrush", "InkSerif", serif';
    ctx.strokeStyle = 'rgba(0,0,0,' + (0.65 * k).toFixed(3) + ')';
    ctx.lineWidth = 8;
    ctx.strokeText('봉', r.width * 0.5, r.height * 0.42);
    ctx.fillStyle = 'rgba(232,192,74,' + (0.85 * k).toFixed(3) + ')';
    ctx.fillText('봉', r.width * 0.5, r.height * 0.42);
    ctx.restore();
  }
  /* 기물: 발밑 보랏빛 고리. 다음에 쏠 기물은 쏘기 직전 밝게 맥동한다.
     §4.1: 지금 역류할 수 있는 순간(보스 예고 중)이면 고리가 금빛으로 바뀐다 — '받아쳐라'의 색이다. */
  if (z && z.alive) {
    const M = bossPat().summon, tt = rt.S.elapsed || 0, wpc0 = rt.worldPerCss();
    const canReflect = reflectReady();
    ctx.save();
    bossMinions().forEach(function (q) {
    const f = rt.projectXZ(q.x, q.z, 0.05);
    const warn = q === rt.S.totemNext && (rt.S.totemShotT || 0) < M.shotWarn;
    ctx.lineWidth = canReflect ? 4 : (warn ? 4 : 2);
    const col = canReflect
      ? 'rgba(232,192,74,' + (0.65 + 0.35 * Math.sin(tt * 9)).toFixed(3) + ')'
      : (warn ? 'rgba(201,166,255,' + (0.6 + 0.4 * Math.sin(tt * 30)).toFixed(3) + ')' : 'rgba(201,166,255,0.45)');
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, 0.9 * wpc0, 0.5 * wpc0, 0, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();
  }
  if (!z || !z.alive || !bossPatList(z) || rt.dist(z, rt.S.hero) > rt.ringR()) return;
  const P = bossPat(), t = rt.S.elapsed || 0;
  const bp = rt.projectXZ(z.x, z.z, 0.05), wpc = rt.worldPerCss();
  /* 분신 중에는 진짜에게만 붙는 표시(예고 고리·문구·기세)를 숨긴다 — 진짜는 방울로만 가린다. */
  const onScr = !z.hidden && z.state !== 'clones' && bp.x > -40 && bp.y > -40 && bp.x < r.width + 40 && bp.y < r.height + 40;
  ctx.save();
  /* v0.54: 보스 발밑의 구식 2D 붉은/흰/금 타원 테두리 선 제거 — 3D 바닥 진법과 보스 발밑 HP 바·기세로 일원화 */
  if (rt.S.firstPatIcon) {
    rt.S.firstPatIcon.t -= rt.frameDt;
    if (rt.S.firstPatIcon.t <= 0) rt.S.firstPatIcon = null;
  }
  /* 기모으기 게이지: v0.53 주인공 바로 아래 시선 고정대 대형 타이밍 게이지 + 소용돌이 */
  if (z.state === 'kiai' && z.kiai) {
    const K = P.kiai, T = z.kiai.t, f = rt.clamp(z.stateT / T, 0, 1), g0 = (T - kiaiWin(K)) / T;
    const open = z.stateT >= T - kiaiWin(K), lock = z.kiai.lock;
    rt.bossFx.drawKiaiFocalGauge(ctx, r, hs, f, g0, open, lock, t);
    if (onScr) rt.bossFx.drawKiaiVortex(ctx, rt.projectXZ, z.x, z.z, f, open && !lock, t, rt.S.hero);
  }
  /* 내려찍기 예고: v0.52 커스텀 수묵 만다라 + 수렴 백금 타이밍 링 */
  if (z.state === 'slamTele' && z.slam) {
    const f = rt.clamp(z.stateT / z.slam.tele, 0, 1);
    rt.bossFx.drawSlamTele(ctx, rt.projectXZ, z.slam.x, z.slam.z, P.slam.r, f, t);
  }
  /* 언월 횡참 예고: v0.53 3D 바닥 수묵 초승달 붓결 + 수렴 백금 칼날 호선 */
  if (z.state === 'sweepTele' && z.sweep) {
    const f = rt.clamp(z.stateT / Math.max(0.01, z.sweep.tele), 0, 1);
    rt.bossFx.drawSweepTele(ctx, rt.projectXZ, z.x, z.z, z.sweep.aimA, z.sweep.arc, z.sweep.range, f, t);
  }
  /* v1.02 신규 4대 기믹 최상위 시각 계층 렌더링 */
  if (z && z.alive) {
    const tt2 = rt.S.elapsed || 0;
    if (z.state === 'donut' && z.donut) {
      rt.bossFx.drawDonutTele(ctx, rt.projectXZ, z.x, z.z, z.donut.innerR, z.donut.outerR, z.donut.safeInside, z.stateT / Math.max(0.1, z.donut.dur), tt2);
    } else if (z.state === 'soak' && z.soak) {
      rt.bossFx.drawSoakPillars(ctx, rt.projectXZ, z.soak.pillars, tt2);
    } else if (z.state === 'tether' && z.tether && rt.S.hero) {
      rt.bossFx.drawTetherChain(ctx, rt.projectXZ, z.x, z.z, rt.S.hero.x, rt.S.hero.z, rt.dist(z, rt.S.hero), z.tether.breakDist, tt2);
    } else if (z.state === 'rhythm' && z.rhythm && rt.S.hero) {
      const dur = z.rhythm.beats[z.rhythm.idx] || 0.6;
      rt.bossFx.drawRhythmTell(ctx, rt.projectXZ, hs, z.x, z.z, z.rhythm.idx, z.rhythm.beats.length, dur - z.rhythm.t, dur, tt2);
    } else if (z.state === 'gaze' && z.gaze) {
      rt.bossFx.drawGazeTele(ctx, rt.projectXZ, z.x, z.z, z.gaze.aimA, z.stateT / Math.max(0.1, z.gaze.dur), tt2);
    } else if (z.state === 'pizza' && z.pizza) {
      rt.bossFx.drawPizzaTele(ctx, rt.projectXZ, z.x, z.z, z.pizza.baseA, z.pizza.oddDanger, z.stateT / Math.max(0.1, z.pizza.dur), tt2);
    }
    for (let zi = 0; zi < (rt.S.spirits || []).length; zi++) {
      const zsp = rt.S.spirits[zi];
      if (zsp && zsp.alive && zsp.zoneTag) rt.bossFx.drawZoneSpiritGuide(ctx, rt.projectXZ, rt.S.hero, zsp, tt2);
    }
  }
  /* 부적 탄막 예고: v0.53 공중 정렬 살부적 편대 + 갈필 먹연기 궤적 */
  if (z.state === 'volleyTele' && onScr) {
    const Vo = P.volley, f = rt.clamp(z.stateT / (z.volleyTele || Vo.tele), 0, 1);
    rt.bossFx.drawVolleyTele(ctx, rt.projectXZ, z.x, z.z, z.aimA, Vo.n, Vo.spread, f, t, z.volleyGold);
  }
  /* 영창 중 회전 수묵 만다라 진법 */
  if (z.state === 'chant' && z.chant && onScr) {
    const f = rt.clamp(z.stateT / (z.chantT || P.chant.t), 0, 1);
    rt.bossFx.drawChantMandala(ctx, rt.projectXZ, z.x, z.z, f, t);
  }
  /* 은신·분신의 방울: 소리가 나는 쪽 심안 가장자리에 비취 물결 */
  if ((z.state === 'veil' || z.state === 'clones') && z.ping > 0) {
    const p = rt.projectXZ(z.x, z.z, 0.8), a = Math.atan2(p.y - hs.y, p.x - hs.x), k = z.ping / 0.6;
    const rr = (rt.lastMarkMetrics.ring && rt.lastMarkMetrics.ring.px) || 120;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(46,230,166,' + (0.85 * k).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(hs.x, hs.y, rr * (0.92 + 0.12 * (1 - k)), a - 0.3, a + 0.3); ctx.stroke();
  }
  /* v0.53 영창·봉인·합 겨루기: 주인공 바로 아래(엄지 위) 시선 고정대에 큼직하게 표시 */
  const want = z.state === 'chant' && z.chant
    ? { kind: 'chant', seq: z.chant.seq, i: z.chant.i, frac: 1 - rt.clamp(z.stateT / Math.max(0.01, z.chantT || P.chant.t), 0, 1), title: '원혼 영창 — 순서대로 그려 끊어라' }
    : z.state === 'seal'
      ? { kind: 'seal', seq: ['star'], i: 0, frac: 1 - rt.clamp(z.stateT / Math.max(0.01, P.seal.t), 0, 1), title: '귀물 봉인 — 교차별(★)을 그려라!' }
      : z.state === 'clash' && z.clash
        ? { kind: 'clash', seq: [z.clash.shape], i: 0, frac: 1 - rt.clamp(z.clash.t / Math.max(0.01, z.clash.win), 0, 1), title: '합 겨루기 ' + Math.min(z.clash.i + 1, z.clash.need) + '/' + z.clash.need + ' — 즉시 베어라!' }
        : null;
  if (want) rt.bossFx.drawGestureFocalDock(ctx, r, hs, want, t, rt.brushMark);
  /* 결계 수축: 부적 기둥마다 발밑 금빛 고리와 빛기둥 */
  const sk = rt.S.arena && rt.S.arena.shrink;
  if (sk) {
    sk.pillars.forEach(function (p) {
      if (!p.alive) return;
      const f = rt.projectXZ(p.x, p.z, 0.05), top = rt.projectXZ(p.x, p.z, 4.2);
      ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
      ctx.strokeStyle = 'rgba(232,192,74,' + (0.65 + 0.3 * Math.sin(t * 6)).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 1.1 * wpc, 0.6 * wpc, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const g = ctx.createLinearGradient(f.x, f.y, top.x, top.y);
      g.addColorStop(0, 'rgba(255,210,90,0.55)'); g.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    });
  }
  /* 기세 붕괴: 보스 무릎 꿇기 모션 + 발밑 HP 바 금빛 '빈틈 ×1.3'으로 표시 */
  /* §4.4 8장 합 겨루기: v0.53 주인공 아래 시선 고정대(drawGestureFocalDock)로 통합 */
  /* §4.4 8장 흉내: v0.50 수묵·주홍 테이퍼 레인 */
  if ((z.state === 'mimicTele' || z.state === 'mimicCharge') && z.mimic) {
    const m = z.mimic;
    const f = z.state === 'mimicCharge' ? 1 : rt.clamp(m.t / Math.max(0.01, m.tele), 0, 1);
    rt.bossFx.drawChargeTele(ctx, rt.projectXZ, z.x, z.z, z.x + m.dir.x * 11, z.z + m.dir.z * 11, f, t);
  }
  /* §4.4 12장 무늬 뒤석기: 금빛 테두리 0.4초 */
  if (z.state === 'shuffle' && z.shuffle) {
    const s = z.shuffle, gold = s.gold > 0;
    if (gold) {
      ctx.beginPath(); ctx.ellipse(bp.x, bp.y, 1.7 * wpc * 1.1, 1.0 * wpc * 1.1, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(232,192,74,0.95)'; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 13px "InkSerif", serif';
    ctx.fillStyle = gold ? 'rgba(255,236,190,0.98)' : 'rgba(200,190,170,0.6)';
    ctx.fillText((s.locked ? '무늬 고정' : (gold ? '지금 — 무늬 고정' : '무늬가 바뀝니다')) + '  ' + Math.max(0, Math.ceil(s.dur - s.t)) + '초', r.width * 0.5, 118);
  }
  ctx.restore();
}

  return { drawBossPat };
}
