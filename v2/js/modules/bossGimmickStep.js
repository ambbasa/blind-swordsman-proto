/* v2/js/modules/bossGimmickStep.js — 보스 6대 기믹(도넛·소크·리듬·혈사슬·시선·피자) 및 횡참 스텝 핸들러 */

export function createBossGimmickStep(rt, deps) {
  const {
    heroHurt, notePatSeen, applyVulnStack, clearZoneSpirits,
    spawnDonutZoneSpirit, spawnPizzaSafeSpirit, bossJustDodge,
    bossPoise, spawnBossShot, spawnBossWave
  } = deps;

  /* v1.02 신규 기믹 1: 청록 도넛 안전지대 댄스 (2연속 In/Out) */
  function stepDonut(z, dt, P) {
    if (!z.donut) return null;
    const dn = z.donut;
    if (z.stateT >= dn.dur) {
      const d = rt.dist(z, rt.S.hero);
      const hit = dn.safeInside ? (d > dn.innerR && d <= dn.outerR) : (d <= dn.innerR);
      if (rt.three) {
        if (rt.three.lights) rt.three.lights.burst(z.x, 1.6, z.z, { color: 0x4dd4ff, intensity: 6.5, duration: 0.34, distance: 16 });
        if (rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(z.x, z.z, { r0: dn.safeInside ? dn.innerR : 0.6, r1: dn.safeInside ? dn.outerR : dn.innerR, colorHex: 0xff4d3d, coreHex: 0x85f5d4, dur: 0.40 });
      }
      if (rt.audio && rt.audio.bossSlam) rt.audio.bossSlam();
      z._strikeFxT = 0.28; z._strikeAnim = 'slam';
      if (hit && !rt.S.dash) applyVulnStack('도넛 결계 폭발에 맞았습니다.');
      else {
        notePatSeen('donut', 'dodge');
        bossPoise(z, 1.2);
        rt.addCharge(10);
        z.openUntil = Math.max(z.openUntil || 0, (rt.S.elapsed || 0) + 1.4);
        rt.addHitstop(0.04);
        rt.inkFx.ring(3.6, rt.FX_COLORS.gold, 0.45);
        if (rt.audio && rt.audio.justParry) rt.audio.justParry();
        rt.showJudge('도넛 파훼! 빈틈 노출!');
      }
      if (z.state !== 'donut') { clearZoneSpirits('donut'); z.donut = null; return true; }
      if (dn.step === 0) {
        dn.step = 1; dn.safeInside = !dn.safeInside; z.stateT = 0;
        spawnDonutZoneSpirit(z, dn);
        rt.showJudge(dn.safeInside ? '연속 결계 — 안쪽 혼령으로!' : '연속 결계 — 바깥 혼령으로!');
        if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'circle');
      } else {
        clearZoneSpirits('donut');
        z.donut = null; z.openUntil = Math.max(z.openUntil || 0, rt.S.elapsed + 1.4);
        z.state = 'walk'; z.stateT = 0;
      }
    }
    return true;
  }

  /* v1.02 신규 기믹 2: 호박빛 소크 결계 기둥 */
  function stepSoak(z, dt, P) {
    if (!z.soak) return null;
    const ps = z.soak.pillars;
    let remain = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.done) continue;
      p.t += dt;
      if (rt.dist(rt.S.hero, p) <= p.r + 0.5) {
        p.done = true;
        rt.addCharge(25);
        bossPoise(z, 2.0);
        if (rt.audio && rt.audio.justParry) rt.audio.justParry();
        rt.inkFx.ring(3.2, rt.FX_COLORS.gold, 0.48);
        if (rt.three && rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(p.x, p.z, { r0: 0.5, r1: 4.0, colorHex: 0xf2b84b, coreHex: 0xfff8dc, dur: 0.36 });
        notePatSeen('soak', 'clear');
        rt.showJudge('결계 흡수! 참 +25 · 강인도 -2');
      } else if (p.t >= p.dur) {
        p.done = true;
        if (rt.audio && rt.audio.explode) rt.audio.explode();
        applyVulnStack('결계 기둥이 폭주했습니다.');
      } else {
        remain++;
      }
    }
    if (remain === 0) { clearZoneSpirits('soak'); z.soak = null; if (z.state === 'soak') { z.state = 'walk'; z.stateT = 0; } }
    return true;
  }

  /* v1.02 신규 기믹 3: 세키로식 3연속 리듬 패링 */
  function stepRhythm(z, dt, P) {
    if (!z.rhythm) return null;
    const rh = z.rhythm;
    rh.t += dt;
    const dur = rh.beats[rh.idx] || 0.6;
    if (rh.t >= dur + 0.06) {
      if (!rh.handled) {
        z._strikeFxT = 0.24; z._strikeAnim = 'strike';
        applyVulnStack('삼연격 박자를 놓쳤습니다.');
      }
      rh.idx++; rh.t = 0; rh.handled = false;
      if (rh.idx >= rh.beats.length) {
        if (rh.ok >= 3) {
          notePatSeen('rhythm', 'parry');
          bossPoise(z, 3.0);
          if (rt.S && (!rt.a11yShake() && !rt.reducedMotion())) rt.S.justParryInvertT = 0.14;
          rt.showJudge('삼연파훼 — 대경직!');
        }
        z.rhythm = null; if (z.state === 'rhythm') { z.state = 'walk'; z.stateT = 0; }
      } else {
        if (rt.audio && rt.audio.drum) rt.audio.drum();
      }
    }
    return true;
  }

  /* v1.02 신규 기믹 4: 혈사슬 결속 (7.5m 이탈 절단) */
  function stepTether(z, dt, P) {
    if (!z.tether) return null;
    const d = rt.dist(z, rt.S.hero);
    if (d >= z.tether.breakDist) {
      clearZoneSpirits('tether');
      z.tether = null;
      z.openUntil = Math.max(z.openUntil || 0, rt.S.elapsed + 1.8);
      bossPoise(z, 1.5);
      if (rt.audio && rt.audio.justParry) rt.audio.justParry();
      if (rt.three && rt.three.vfx3d) rt.three.vfx3d.spawnSparks(rt.S.hero.x, rt.S.hero.z, 20, { color: 0x85f5d4, speed: 7.5 });
      notePatSeen('tether', 'break');
      rt.showJudge('사슬 절단 — 빈틈 노출!');
      if (z.state === 'tether') { z.state = 'stun'; z.stateT = 0; z.stunT = 1.6; }
      return true;
    }
    if (!rt.S.dash && d > 1.8) {
      const pull = 1.65 * dt;
      rt.S.hero.x += ((z.x - rt.S.hero.x) / d) * pull;
      rt.S.hero.z += ((z.z - rt.S.hero.z) / d) * pull;
    }
    if (z.stateT >= z.tether.dur) {
      clearZoneSpirits('tether');
      z.tether = null;
      applyVulnStack('혈사슬을 끊지 못했습니다.');
      z.state = 'walk'; z.stateT = 0;
    }
    return true;
  }

  /* v1.03 신규 기믹 5: 시선 회피 (Gaze) 틱 */
  function stepGaze(z, dt, P) {
    if (!z.gaze) return null;
    if (z.stateT >= z.gaze.dur) {
      const ha = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x);
      const diff = Math.abs(Math.atan2(Math.sin(ha - z.gaze.aimA), Math.cos(ha - z.gaze.aimA)));
      clearZoneSpirits('gaze');
      z._strikeFxT = 0.28; z._strikeAnim = 'strike';
      if (diff <= 1.05 && rt.dist(z, rt.S.hero) <= 8.8 && !rt.S.dash) {
        applyVulnStack('보스의 붉은 시선에 걸렸습니다.');
      } else {
        notePatSeen('gaze', 'dodge');
        bossPoise(z, 1.5);
        rt.addCharge(12);
        z.openUntil = Math.max(z.openUntil || 0, rt.S.elapsed + 1.6);
        if (rt.audio && rt.audio.justParry) rt.audio.justParry();
        rt.showJudge('배후 회피 성공 — 빈틈 노출!');
      }
      z.gaze = null; if (z.state === 'gaze') { z.state = 'walk'; z.stateT = 0; }
    }
    return true;
  }

  /* v1.03 신규 기믹 6: 6조각 부채꼴 순차 절단 (Pizza) 틱 */
  function stepPizza(z, dt, P) {
    if (!z.pizza) return null;
    const pz = z.pizza;
    if (z.stateT >= pz.dur) {
      const ha = Math.atan2(rt.S.hero.z - z.z, rt.S.hero.x - z.x);
      const rel = (((ha - pz.baseA) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const sliceIdx = Math.floor(rel / (Math.PI / 3)) % 6;
      const inDanger = ((sliceIdx % 2 === 1) === !!pz.oddDanger) && rt.dist(z, rt.S.hero) <= 9.5;
      if (rt.audio && rt.audio.bossSlam) rt.audio.bossSlam();
      if (rt.three && rt.three.lights) rt.three.lights.burst(z.x, 1.6, z.z, { color: 0xff4d3d, intensity: 6.5, duration: 0.3, distance: 16 });
      z._strikeFxT = 0.28; z._strikeAnim = 'strike';
      if (inDanger && !rt.S.dash) applyVulnStack('부채꼴 절단에 피격되었습니다.');
      else {
        notePatSeen('pizza', 'dodge');
        bossPoise(z, 1.2);
        rt.addCharge(10);
        z.openUntil = Math.max(z.openUntil || 0, (rt.S.elapsed || 0) + 1.4);
        rt.addHitstop(0.04);
        rt.inkFx.ring(3.6, rt.FX_COLORS.gold, 0.45);
        if (rt.audio && rt.audio.justParry) rt.audio.justParry();
        rt.showJudge('안전 칸 파훼! 빈틈 노출!');
      }
      if (z.state !== 'pizza') { clearZoneSpirits('pizza'); z.pizza = null; return true; }
      if (pz.step === 0) {
        pz.step = 1; pz.oddDanger = !pz.oddDanger; z.stateT = 0;
        spawnPizzaSafeSpirit(z, pz);
        rt.showJudge('교차 절단 — 다음 안전 칸으로!');
        if (rt.audio && rt.audio.drum) rt.audio.drum();
      } else {
        clearZoneSpirits('pizza');
        z.pizza = null; z.openUntil = Math.max(z.openUntil || 0, rt.S.elapsed + 1.4);
        z.state = 'walk'; z.stateT = 0;
      }
    }
    return true;
  }

  /* v0.52 신규 스킬 — 언월 횡참(sweepTele): 광역 부채꼴 베기 + 전진 초승달 검기 파동 */
  function stepSweepTele(z, dt, P) {
    if (!z.sweep) return null;
    const sw = z.sweep;
    if (!z._warnTicked && z.stateT >= sw.tele * 0.78) {
      z._warnTicked = true;
      if (rt.audio && rt.audio.bell) rt.audio.bell(0, 'vline');
    }
    if (z.stateT >= sw.tele) {
      z._warnTicked = false;
      const a = sw.aimA, half = sw.arc * 0.5, R = sw.range;
      rt.bossFx.triggerSweepBurst(z.x, z.z, a, R);
      if (rt.three) {
        const sx = z.x + Math.cos(a) * 1.6, sz = z.z + Math.sin(a) * 1.6;
        if (rt.three.lights) rt.three.lights.burst(sx, 1.4, sz, { color: 0xff5a3c, intensity: 6.4, duration: 0.28, distance: 15 });
        if (rt.three.vfx3d) {
          rt.three.vfx3d.spawnSwirl(sx, sz, { r0: 1.0, r1: (R || 5.5) * 0.85, accentHex: 0xf04832, dur: 0.34 });
          rt.three.vfx3d.spawnSparks(sx, sz, 18, { color: 0xff9842, speed: 8.2 });
        }
      }
      rt.makeBossSlash(
        { x: z.x + Math.cos(a - half * 0.85) * 2.8, z: z.z + Math.sin(a - half * 0.85) * 2.8 },
        { x: z.x + Math.cos(a + half * 0.85) * 3.8, z: z.z + Math.sin(a + half * 0.85) * 3.8 },
        { width: 3.4, height: 1.0 }
      );
      if (rt.audio) { if (rt.audio.bossCharge) rt.audio.bossCharge(); else rt.audio.slash(); }
      rt.S.shake = Math.max(rt.S.shake || 0, 0.52);
      /* 전진 초승달 검기 파동 발사 (+ 2페이즈/4장 이상에서는 양옆 살부적 2발, 그중 1발은 패링 가능 금빛) */
      spawnBossWave(z, a);
      if (z.phase2 || (rt.S.stageNo || 1) >= 4) {
        spawnBossShot(z, a - 0.42, true);
        spawnBossShot(z, a + 0.42, false);
      }
      /* 근거리 부채꼴 타격 판정 */
      const dx = rt.S.hero.x - z.x, dz = rt.S.hero.z - z.z, d = Math.hypot(dx, dz);
      if (d <= R + 0.35) {
        let da = Math.atan2(dz, dx) - a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) <= half) {
          if (rt.S.dash) bossJustDodge(z);
          else {
            heroHurt(sw.dmg, rt.getActSkillNames((rt.S && rt.S.stage) ? rt.actOf(rt.S.stage.id) : 1).sweepHit);
            const k = d > 0.01 ? d : 1;
            const kb = rt.clipBound({ x: rt.S.hero.x + dx / k * 1.8, z: rt.S.hero.z + dz / k * 1.8 }); rt.S.hero.x = kb.x; rt.S.hero.z = kb.z; if (rt.three && rt.three.hero) rt.placeGroup(rt.three.hero, rt.S.hero.x, rt.S.hero.z);
          }
        }
      }
      if (z.state === 'sweepTele') { z.state = 'stun'; z.stateT = 0; z.stunT = sw.stun || 0.85; z.sweep = null; }
    }
    return true;
  }

  const HANDLERS = {
    donut: stepDonut,
    soak: stepSoak,
    rhythm: stepRhythm,
    tether: stepTether,
    gaze: stepGaze,
    pizza: stepPizza,
    sweepTele: stepSweepTele
  };

  function stepBossGimmick(z, dt, P) {
    const fn = HANDLERS[z.state];
    return fn ? fn(z, dt, P) : null;
  }

  return { stepBossGimmick };
}
