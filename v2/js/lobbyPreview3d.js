/* v2/js/lobbyPreview3d.js — v0.85 로비·치장 화면 실시간 3D 주인공 미리보기 (M2M_Idle + 터치 회전 + 도포/검 강화 반영) */
import * as THREE from 'three';
import { preloadHeroGlb, makeHeroGlb, applyHeroGlbCloak, applyHeroGlbSwordTrail } from './glbhero.js?v=v145';
import { preloadMonsterGlb, makeBossGlb } from './glbboss.js?v=v145';

let renderer = null;
let scene = null;
let camera = null;
let hero = null;
let rafId = 0;
let active = false;
let yaw = 0.28;
let dragging = false;
let lastX = 0;
let lastT = 0;
let pendingCloak = null;
let pendingForge = 0;

let pendingSwordHex = null;
export function syncLobby3dStyle(cloakProf, forgeLv, swordHex) {
  pendingCloak = cloakProf || pendingCloak;
  if (forgeLv != null) pendingForge = forgeLv;
  if (swordHex !== undefined) pendingSwordHex = swordHex;
  if (hero && pendingCloak) applyHeroGlbCloak(hero, pendingCloak, pendingForge);
  if (hero && pendingSwordHex !== undefined) applyHeroGlbSwordTrail(hero, pendingSwordHex, null, null);
}

export function stopLobby3d() {
  active = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
}

export function startLobby3d(canvas, cloakProf, forgeLv) {
  if (!canvas) return Promise.resolve(false);
  syncLobby3dStyle(cloakProf, forgeLv);
  active = true;

  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
    camera.position.set(0, 1.36, 5.25);
    camera.lookAt(0, 1.16, 0);

    const amb = new THREE.AmbientLight(0xfff4e0, 1.1);
    scene.add(amb);
    const key = new THREE.DirectionalLight(0xffe8c2, 1.8);
    key.position.set(2.5, 4.0, 3.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9cf0ff, 1.65);
    rim.position.set(-2.5, 2.2, -2.5);
    scene.add(rim);

    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.014;
      lastX = e.clientX;
    });
    const endDrag = function () { dragging = false; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(180, Math.round(r.width || 280));
    const h = Math.max(220, Math.round(r.height || 340));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const p = preloadHeroGlb();
  return Promise.resolve(p).then(function () {
    if (!active) return false;
    if (!hero) {
      hero = makeHeroGlb(2.25);
      if (!hero) return false;
      scene.add(hero.fit);
    }
    if (pendingCloak) applyHeroGlbCloak(hero, pendingCloak, pendingForge);
    resize();
    lastT = performance.now();
    if (!rafId) {
      const loop = function (now) {
        if (!active) { rafId = 0; return; }
        const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
        lastT = now;
        if (!dragging) yaw += dt * 0.32;
        if (hero) {
          hero.fit.rotation.y = yaw;
          hero.mixer.update(dt);
        }
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }
    return true;
  }).catch(function () { return false; });
}


/* v1.00 도감 3D 턴테이블 뷰어 (심안 + 적 4종 · 터치 회전 · 모션 재생) */
let cRenderer = null, cScene = null, cCamera = null, cModel = null, cRoot = null;
let cRaf = 0, cActive = false, cYaw = 0.35, cDrag = false, cLastX = 0, cLastT = 0, cAnimIdx = 0;
let cCanvas = null;

export function stopCodex3d() {
  cActive = false;
  if (cRaf) { cancelAnimationFrame(cRaf); cRaf = 0; }
}

export function playCodexAnim3d() {
  if (!cModel || !cModel.actions) return '';
  const keys = Object.keys(cModel.actions).filter(function (k) { return cModel.actions[k] && k !== 'death'; });
  if (!keys.length) return '';
  cAnimIdx = (cAnimIdx + 1) % keys.length;
  const pick = keys[cAnimIdx];
  keys.forEach(function (k) {
    const a = cModel.actions[k];
    if (k === pick) { a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.fadeIn(0.18).play(); }
    else a.fadeOut(0.18);
  });
  return pick;
}

export function startCodex3d(canvas, species) {
  if (!canvas) return Promise.resolve(false);
  const sp = species || 'boss';
  cActive = true;
  if (!cRenderer || cCanvas !== canvas) {
    if (cRenderer) { try { cRenderer.dispose(); } catch (_) {} }
    cCanvas = canvas;
    cRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    cRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    cRenderer.outputColorSpace = THREE.SRGBColorSpace;
    cScene = new THREE.Scene();
    cCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    cCamera.position.set(0, 1.45, 5.4);
    cCamera.lookAt(0, 1.15, 0);
    cScene.add(new THREE.AmbientLight(0xfff4e0, 1.15));
    const ck = new THREE.DirectionalLight(0xffe8c2, 1.85); ck.position.set(2.8, 4.2, 3.4); cScene.add(ck);
    const cr = new THREE.DirectionalLight(0x9cf0ff, 1.6); cr.position.set(-2.6, 2.4, -2.8); cScene.add(cr);
    canvas.addEventListener('pointerdown', function (e) {
      cDrag = true; cLastX = e.clientX;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!cDrag) return;
      cYaw += (e.clientX - cLastX) * 0.015;
      cLastX = e.clientX;
    });
    const endC = function () { cDrag = false; };
    canvas.addEventListener('pointerup', endC);
    canvas.addEventListener('pointercancel', endC);
  }
  const r = canvas.getBoundingClientRect();
  const cw = Math.max(200, Math.round(r.width || 280));
  const ch = Math.max(180, Math.round(r.height || 210));
  cRenderer.setSize(cw, ch, false);
  cCamera.aspect = cw / ch;
  cCamera.updateProjectionMatrix();

  const loader = sp === 'hero' ? preloadHeroGlb() : preloadMonsterGlb(sp);
  return Promise.resolve(loader).then(function () {
    if (!cActive) return false;
    if (cRoot) {
      cScene.remove(cRoot);
      cRoot.traverse(function (o) {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(function (m) { if (m && m.dispose) m.dispose(); });
        }
      });
      cRoot = null; cModel = null;
    }
    cModel = sp === 'hero' ? makeHeroGlb(2.2) : makeBossGlb(/^boss/.test(sp) ? 2.35 : 2.15, sp);
    if (!cModel) return false;
    cRoot = cModel.fit || cModel.root;
    cAnimIdx = 0;
    cYaw = 0.35;
    cScene.add(cRoot);
    cLastT = performance.now();
    if (!cRaf) {
      const loopC = function (now) {
        if (!cActive) { cRaf = 0; return; }
        const dt = Math.min(0.05, Math.max(0.001, (now - cLastT) / 1000));
        cLastT = now;
        if (!cDrag) cYaw += dt * 0.42;
        if (cRoot) cRoot.rotation.y = cYaw;
        if (cModel && cModel.mixer) cModel.mixer.update(dt);
        cRenderer.render(cScene, cCamera);
        cRaf = requestAnimationFrame(loopC);
      };
      cRaf = requestAnimationFrame(loopC);
    }
    return true;
  }).catch(function () { return false; });
}
