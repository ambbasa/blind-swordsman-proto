/* v2/js/modules/bossProjectiles.js — v1.55 보스·원거리 몬스터 투사체(부적 탄) 및 다중 장판 오브젝트 풀 모듈 */

const SHOT_POOL_MAX = 24;
const HAZARD_POOL_MAX = 12;

export function createBossProjectiles(deps) {
  const { rt, heroHurt, stepReflectedShot } = deps;

  let _shotMat = null, _shotGeo = null, _shotGoldMat = null, _hazGeo = null, _trailMat = null;
  const shotPool = [];
  const hazardPool = [];

  function shotGeo() {
    if (!_shotGeo) _shotGeo = new rt.THREE.SphereGeometry(0.22, 8, 6);
    return _shotGeo;
  }
  function shotMaterial() {
    if (!_shotMat) _shotMat = new rt.THREE.MeshBasicMaterial({ color: 0xc9a6ff, transparent: true, opacity: 0.95, blending: rt.THREE.AdditiveBlending, depthWrite: false });
    return _shotMat;
  }
  function goldShotMaterial() {
    if (!_shotGoldMat) _shotGoldMat = new rt.THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 1, blending: rt.THREE.AdditiveBlending, depthWrite: false });
    return _shotGoldMat;
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

  function takeShotMesh() {
    let m = shotPool.pop();
    if (!m) {
      m = new rt.THREE.Mesh(shotGeo(), shotMaterial());
      m.userData.pooled = true;
    }
    m.visible = true;
    m.material = shotMaterial();
    if (m.parent !== rt.three.scene) rt.three.scene.add(m);
    return m;
  }
  function releaseShotMesh(m) {
    if (!m) return;
    m.visible = false;
    if (shotPool.length < SHOT_POOL_MAX) shotPool.push(m);
    else if (m.parent) m.parent.remove(m);
  }
  function spawnShot(from) {
    if (!rt.S || !rt.three) return null;
    while (rt.S.shots.length >= SHOT_POOL_MAX) {
      const old = rt.S.shots.shift();
      if (old && old.mesh) releaseShotMesh(old.mesh);
    }
    const kd = rt.CFG.zombieTypes.thrower || {};
    const mesh = takeShotMesh();
    mesh.position.set(from.x, 0.75, from.z);
    const d = Math.hypot(rt.S.hero.x - from.x, rt.S.hero.z - from.z) || 1;
    const shot = {
      x: from.x, z: from.z,
      vx: (rt.S.hero.x - from.x) / d * (kd.shotSpeed || rt.CFG.shotSpeed || 7.2),
      vz: (rt.S.hero.z - from.z) / d * (kd.shotSpeed || rt.CFG.shotSpeed || 7.2),
      t: 0, life: rt.CFG.shotLife || 3.2, mesh: mesh
    };
    rt.S.shots.push(shot);
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
      if (sh.mesh) { sh.mesh.position.set(sh.x, 0.75, sh.z); sh.mesh.rotation.y += dt * 6; }
      const reached = Math.hypot(rt.S.hero.x - sh.x, rt.S.hero.z - sh.z) <= (sh.r || rt.CFG.shotR || 0.42) + 0.55;
      if (reached) {
        if (rt.S.dash) rt.inkFx.burst(sh.x, sh.z, rt.FX_COLORS.poison, { r1: 30, n: 6, dur: 0.35 });
        else if ((rt.S.iframe || 0) <= 0) heroHurt(sh.dmg || rt.CFG.shotDmg || 1, sh.isWave ? rt.getActSkillNames((rt.S && rt.S.stage) ? rt.actOf(rt.S.stage.id) : 1).waveHit : '부적에 맞았습니다.');
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
