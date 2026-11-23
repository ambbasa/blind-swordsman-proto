/* v2/js/lobbyPreview3d.js — v0.85 로비·치장 화면 실시간 3D 주인공 미리보기 (M2M_Idle + 터치 회전 + 도포/검 강화 반영) */
import * as THREE from 'three';
import { preloadHeroGlb, makeHeroGlb, applyHeroGlbCloak } from './glbhero.js?v=v086';

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

export function syncLobby3dStyle(cloakProf, forgeLv) {
  pendingCloak = cloakProf || pendingCloak;
  if (forgeLv != null) pendingForge = forgeLv;
  if (hero && pendingCloak) applyHeroGlbCloak(hero, pendingCloak, pendingForge);
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
    camera.position.set(0, 1.38, 4.35);
    camera.lookAt(0, 1.15, 0);

    const amb = new THREE.AmbientLight(0xfff4e0, 1.1);
    scene.add(amb);
    const key = new THREE.DirectionalLight(0xffe8c2, 1.8);
    key.position.set(2.5, 4.0, 3.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6bdcc0, 1.0);
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
