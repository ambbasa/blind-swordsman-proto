/* v2/js/modules/bossProjectiles.js — v1.55 보스·원거리 몬스터 투사체(부적 탄) 및 다중 장판 오브젝트 풀 모듈 */

const SHOT_POOL_MAX = 28;
const HAZARD_POOL_MAX = 12;

/* Species-specific elemental projectile palettes (strictly zero CJK hanja) */
const SHOT_STYLES = {
  fire:       { core: 0xfff2c2, outer: 0xff6a24, ring: 0xff9e44, spark: 0xff8234, scale: 1.05, msg: '귀불의 도깨비불에 맞았습니다.' },
  soul:       { core: 0xeaffff, outer: 0x56d8ff, ring: 0x9cf0ff, spark: 0x76e4ff, scale: 1.00, msg: '처녀귀신의 원혼탄에 맞았습니다.' },
  talisman:   { core: 0xffe0f0, outer: 0xd94878, ring: 0xc278ff, spark: 0xe86ca4, scale: 1.02, msg: '무당령의 주술 부적에 맞았습니다.' },
  sunfeather: { core: 0xfff8d4, outer: 0xffa824, ring: 0xff5a2c, spark: 0xffc848, scale: 1.12, msg: '삼족오의 태양 깃털에 맞았습니다.' },
  foxorb:     { core: 0xe8fff8, outer: 0xa46eff, ring: 0x68f0d0, spark: 0xb88cff, scale: 1.10, msg: '구미호의 여우구슬에 맞았습니다.' },
  jadebreath: { core: 0xe0fff4, outer: 0x2ce0a0, ring: 0x70ffd4, spark: 0x4ef5bc, scale: 1.18, msg: '이무기의 독룡탄에 맞았습니다.' },
  gold:       { core: 0xfffbe0, outer: 0xffd25a, ring: 0xffe88c, spark: 0xffda68, scale: 1.14, msg: '금빛 부적에 맞았습니다.' }
};

export function createBossProjectiles(deps) {
  const { rt, heroHurt, stepReflectedShot } = deps;

  let _coreGeo = null, _outerGeo = null, _ringGeo = null, _hazGeo = null, _trailMat = null;
  const _styleMats = {};
  const shotPool = [];
  const hazardPool = [];

  function ensureShotGeos() {
    if (!_coreGeo) _coreGeo = new rt.THREE.SphereGeometry(0.14, 8, 6);
    if (!_outerGeo) _outerGeo = new rt.THREE.OctahedronGeometry(0.28, 1);
    if (!_ringGeo) _ringGeo = new rt.THREE.TorusGeometry(0.32, 0.045, 6, 16);
  }
  function shotGeo() { ensureShotGeos(); return _outerGeo; }
  function shotMaterial() { return getStyleMats('talisman').outer; }
  function goldShotMaterial() { return getStyleMats('gold').outer; }
  function getStyleMats(styleKey) {
    const k = SHOT_STYLES[styleKey] ? styleKey : 'talisman';
    if (!_styleMats[k]) {
      const cfg = SHOT_STYLES[k];
      _styleMats[k] = {
        core: new rt.THREE.MeshBasicMaterial({ color: cfg.core, transparent: true, opacity: 1.0, blending: rt.THREE.AdditiveBlending, depthWrite: false }),
        outer: new rt.THREE.MeshBasicMaterial({ color: cfg.outer, transparent: true, opacity: 0.72, blending: rt.THREE.AdditiveBlending, depthWrite: false }),
        ring: new rt.THREE.MeshBasicMaterial({ color: cfg.ring, transparent: true, opacity: 0.85, blending: rt.THREE.AdditiveBlending, depthWrite: false })
      };
    }
    return _styleMats[k];
  }
  function hazardGeo() {
    if (!_hazGeo) _hazGeo = new rt.THREE.CircleGeometry(1, 28);
    return _hazGeo;
  }
  function trailMaterial() {
    if (!_trailMat) _trailMat = new rt.THREE.MeshBasicMaterial({
      map: rt.art && rt.art.trailTex, transparent: true, opacity: 0.85, side: rt.THREE.DoubleSide,
      depthWrite: false, blending: rt.THREE.AdditiveBlending
    });
    return _trailMat;
  }

  function applyShotStyle(grp, styleKey) {
    const k = SHOT_STYLES[styleKey] ? styleKey : 'talisman';
    const cfg = SHOT_STYLES[k];
    const mats = getStyleMats(k);
    grp.userData.core.material = mats.core;
    grp.userData.outer.material = mats.outer;
    grp.userData.ring.material = mats.ring;
    /* Elongate solar feather into a sharp dart; keep orbs crystalline & luminous */
    if (k === 'sunfeather') grp.userData.outer.scale.set(0.65, 0.55, 1.95);
    else if (k === 'talisman') grp.userData.outer.scale.set(0.95, 1.35, 0.45);
    else grp.userData.outer.scale.set(1.0, 1.0, 1.0);
    grp.scale.setScalar(cfg.scale);
  }

  function takeShotMesh(styleKey) {
    ensureShotGeos();
    let grp = shotPool.pop();
    if (!grp) {
      grp = new rt.THREE.Group();
      const mats = getStyleMats('talisman');
      const core = new rt.THREE.Mesh(_coreGeo, mats.core);
      const outer = new rt.THREE.Mesh(_outerGeo, mats.outer);
      const ring = new rt.THREE.Mesh(_ringGeo, mats.ring);
      ring.rotation.x = Math.PI * 0.5;
      grp.add(core, outer, ring);
      grp.userData = { pooled: true, core: core, outer: outer, ring: ring };
    }
    applyShotStyle(grp, styleKey);
    grp.visible = true;
    if (grp.parent !== rt.three.scene) rt.three.scene.add(grp);
    return grp;
  }
  function releaseShotMesh(m) {
    if (!m) return;
    m.visible = false;
    if (shotPool.length < SHOT_POOL_MAX) shotPool.push(m);
    else if (m.parent) m.parent.remove(m);
  }
  function spawnShot(from, opts) {
    if (!rt.S || !rt.three) return null;
    while (rt.S.shots.length >= SHOT_POOL_MAX) {
      const old = rt.S.shots.shift();
      if (old && old.mesh) releaseShotMesh(old.mesh);
    }
    const o = opts || {};
    const styleKey = o.gold ? 'gold' : (o.style || 'talisman');
    const styleCfg = SHOT_STYLES[styleKey] || SHOT_STYLES.talisman;
    const kd = rt.CFG.zombieTypes.thrower || {};
    const spd = o.speed || kd.shotSpeed || rt.CFG.shotSpeed || 7.2;
    const y0 = o.y != null ? o.y : 0.92;
    const mesh = takeShotMesh(styleKey);
    mesh.position.set(from.x, y0, from.z);
    const d = Math.hypot(rt.S.hero.x - from.x, rt.S.hero.z - from.z) || 1;
    const vx = o.vx != null ? o.vx : (rt.S.hero.x - from.x) / d * spd;
    const vz = o.vz != null ? o.vz : (rt.S.hero.z - from.z) / d * spd;
    mesh.rotation.y = Math.atan2(vx, vz);
    const shot = {
      x: from.x, z: from.z, y: y0,
      vx: vx, vz: vz,
      t: 0, sparkT: 0,
      life: o.life || rt.CFG.shotLife || 3.2,
      r: o.r || rt.CFG.shotR || 0.42,
      dmg: o.dmg || rt.CFG.shotDmg || 1,
      style: styleKey,
      sparkHex: styleCfg.spark,
      hitMsg: o.hitMsg || styleCfg.msg,
      mesh: mesh
    };
    rt.S.shots.push(shot);
    /* Crisp muzzle flash & launch sparks so the ranged attack is immediately readable */
    if (rt.three.lights) rt.three.lights.burst(from.x, y0, from.z, { color: styleCfg.outer, intensity: 3.4, duration: 0.16, distance: 7 });
    if (rt.three.vfx3d) rt.three.vfx3d.spawnSparks(from.x, from.z, 5, { color: styleCfg.spark, speed: 3.8 });
    return shot;
  }
  function stepShots(dt) {
    if (!rt.S || !rt.S.shots || !rt.S.shots.length) return;
    const list = rt.S.shots;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const sh = list[i];
      sh.t += dt;
      if (sh.reflect) {
        const fly = stepReflectedShot(sh, dt);
        if (!fly && sh.mesh) { releaseShotMesh(sh.mesh); sh.mesh = null; }
        if (fly) list[w++] = sh;
        continue;
      }
      sh.x += sh.vx * dt;
      sh.z += sh.vz * dt;
      const py = (sh.y != null ? sh.y : 0.92) + Math.sin(sh.t * 11) * 0.08;
      if (sh.mesh) {
        sh.mesh.position.set(sh.x, py, sh.z);
        sh.mesh.rotation.y = Math.atan2(sh.vx, sh.vz);
        if (sh.mesh.userData && sh.mesh.userData.ring) {
          sh.mesh.userData.ring.rotation.z += dt * 9.5;
          sh.mesh.userData.outer.rotation.x += dt * 5.2;
          const pulse = 1.0 + Math.sin(sh.t * 18) * 0.12;
          sh.mesh.userData.core.scale.setScalar(pulse);
        }
      }
      /* Lightweight elemental flight trail sparks */
      sh.sparkT = (sh.sparkT || 0) + dt;
      if (sh.sparkT >= 0.08 && sh.mesh && sh.mesh.visible && rt.three && rt.three.vfx3d) {
        sh.sparkT = 0;
        rt.three.vfx3d.spawnSparks(sh.x, sh.z, 2, { color: sh.sparkHex || 0xc9a6ff, speed: 1.8 });
      }
      const reached = Math.hypot(rt.S.hero.x - sh.x, rt.S.hero.z - sh.z) <= (sh.r || rt.CFG.shotR || 0.42) + 0.55;
      if (reached) {
        if (rt.S.dash) {
          rt.inkFx.burst(sh.x, sh.z, rt.FX_COLORS.poison, { r1: 30, n: 6, dur: 0.35 });
          if (rt.three && rt.three.vfx3d) rt.three.vfx3d.spawnSparks(sh.x, sh.z, 8, { color: sh.sparkHex || 0x8ef5d4, speed: 5.5 });
        } else if ((rt.S.iframe || 0) <= 0) {
          heroHurt(sh.dmg || rt.CFG.shotDmg || 1, sh.isWave ? rt.getActSkillNames((rt.S && rt.S.stage) ? rt.actOf(rt.S.stage.id) : 1).waveHit : (sh.hitMsg || '원거리 공격에 맞았습니다.'));
        }
      }
      const dead = sh.t >= sh.life || reached;
      if (dead && sh.mesh) { releaseShotMesh(sh.mesh); sh.mesh = null; }
      if (!dead) list[w++] = sh;
    }
    list.length = w;
  }

  function takeHazardMesh() {
    let h = hazardPool.pop();
    if (!h) {
      const mat = new rt.THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.34, depthWrite: false, blending: rt.THREE.AdditiveBlending });
      const mesh = new rt.THREE.Mesh(hazardGeo(), mat);
      mesh.rotation.x = -Math.PI / 2;
      h = { mesh: mesh, mat: mat };
    }
    h.mat.opacity = 0.34;
    h.mesh.visible = true;
    if (h.mesh.parent !== rt.three.scene) rt.three.scene.add(h.mesh);
    return h;
  }
  function releaseHazardMesh(mesh, mat) {
    if (mesh) {
      mesh.visible = false;
      if (hazardPool.length < HAZARD_POOL_MAX) hazardPool.push({ mesh: mesh, mat: mat });
      else if (mesh.parent) mesh.parent.remove(mesh);
    }
  }
  function spawnHazard(x, z, r, delay) {
    if (!rt.S || !rt.three) return null;
    while (rt.S.hazards.length >= HAZARD_POOL_MAX) {
      const old = rt.S.hazards.shift();
      if (old && old.mesh) releaseHazardMesh(old.mesh, old.mat);
    }
    const R = r || rt.CFG.hazardR || 2.5;
    const taken = takeHazardMesh();
    const mat = taken.mat, mesh = taken.mesh;
    mesh.position.set(x, 0.06, z);
    mesh.scale.set(R, R, 1);
    const h = { x: x, z: z, r: R, t: 0, delay: delay != null ? delay : (rt.CFG.hazardDelay || 1.05), done: false, mesh: mesh, mat: mat, life: rt.CFG.hazardLife || 2.6 };
    rt.S.hazards.push(h);
    return h;
  }
  function stepHazards(dt) {
    if (!rt.S || !rt.S.hazards || !rt.S.hazards.length) return;
    const hList = rt.S.hazards;
    for (let hi = 0; hi < hList.length; hi++) {
      const h = hList[hi];
      h.t += dt;
      const u = Math.min(1, h.t / Math.max(0.01, h.delay));
      if (h.mesh) {
        h.mat.opacity = 0.18 + 0.34 * u;
        const s = h.r * (0.72 + 0.28 * u);
        h.mesh.scale.set(s, s, 1);
      }
      if (!h.done && h.t >= h.delay) {
        h.done = true;
        h.t = 0;
        rt.bossFx.triggerHazardBlast(h.x, h.z, h.r);
        if (rt.three) {
          if (rt.three.lights) rt.three.lights.burst(h.x, 1.4, h.z, { color: 0xff5a36, intensity: 6.0, duration: 0.30, distance: 14 });
          if (rt.three.shaderFx3d) rt.three.shaderFx3d.spawnShockwave(h.x, h.z, { r0: 0.5, r1: (h.r || 2.5) * 1.15, colorHex: 0xff5a36, coreHex: 0xffe8b0, dur: 0.36 });
          if (rt.three.vfx3d) rt.three.vfx3d.spawnSparks(h.x, h.z, 16, { color: 0xff8a3c, speed: 7.2 });
          rt.triggerGroundCrackHeat(h.x, h.z, (h.r || 2.5) * 1.2, 0xff5a36);
        }
        if (rt.audio) rt.audio.explode();
        if (rt.three && rt.three.lights) rt.three.lights.burst(h.x, 1.0, h.z, { color: 0xe64532, intensity: 4.5, duration: 0.35 });
        if (rt.art && rt.art.playFx) {
          const fx = rt.art.playFx(rt.three.scene, 'ink-splat', h.x, h.z, h.r);
          if (fx) rt.three.fx.push(fx);
        }
        rt.S.shake = Math.max(rt.S.shake || 0, 0.4);
        if (rt.S.hero && Math.hypot(rt.S.hero.x - h.x, rt.S.hero.z - h.z) <= h.r + 0.4) heroHurt(rt.CFG.hazardDmg || 1, '혈월의 장판에 닿았습니다.');
      }
      if (h.done && h.t >= h.life) {
        if (h.mesh) { releaseHazardMesh(h.mesh, h.mat); h.mesh = null; }
        h.dead = true;
      }
    }
    let hw = 0;
    for (let hi = 0; hi < hList.length; hi++) { if (!hList[hi].dead) hList[hw++] = hList[hi]; }
    hList.length = hw;
  }
  function bossHazards(z) {
    const B = (rt.S.stage && rt.S.stage.boss) || {};
    const n = B.hazard || 0;
    if (!n || !rt.S) return;
    const bt = rt.bossTiming(), d0 = rt.CFG.hazardDelay || 1.05;
    const step = n > 1 ? Math.min(0.18, Math.max(0, bt.teleT + bt.chargeT - d0) / (n - 1)) : 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const rad = i === 0 ? 0 : 2.6 + Math.random() * 2.2;
      spawnHazard(rt.S.hero.x + Math.cos(a) * rad, rt.S.hero.z + Math.sin(a) * rad, (rt.CFG.hazardR || 2.5) * (0.8 + Math.random() * 0.3), d0 + i * step);
    }
  }

  return {
    shotGeo, shotMaterial, goldShotMaterial, hazardGeo, trailMaterial,
    takeShotMesh, releaseShotMesh, spawnShot, stepShots,
    takeHazardMesh, releaseHazardMesh, spawnHazard, stepHazards, bossHazards,
    shotPool, hazardPool
  };
}
