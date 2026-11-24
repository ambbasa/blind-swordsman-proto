/* v2/js/modules/mainLoop.js — 심안: 묵검 v1.26 카메라 렌즈·안개·메인 프레임 루프 */

export function createMainLoop(rt) {
  const $ = rt.$;
function activeFov() {
  if (!rt.three || !rt.three.view) return rt.CFG.fov || 62;
  return viewFov(rt.three.view.clientWidth || 390, Math.max(1, rt.three.view.clientHeight || 844));
}
/* v0.27 화면 통일: 화면의 짧은 축이 언제나 같은 세계 폭(≈16.6m)을 담게 한다.
   360·390·430·가로·데스크톱에서 캐릭터·시야 원의 픽셀 크기가 같아지고, 넓은 축만 더 많이 보인다.
   (예전에는 세로 FOV가 고정이라 가로 화면에서 세상이 2배쯤 작게 보였다.) */
const VIEW_REF = { shortPx: 390, span: 16.6, growMax: 1.6 };
function viewSpanFor(shortPx) {
  const k = Math.sqrt(Math.max(120, shortPx) / VIEW_REF.shortPx);
  return VIEW_REF.span * rt.clamp(k, 0.7, VIEW_REF.growMax);
}
function camDist() { return Math.hypot(rt.CFG.camOff.x, rt.CFG.camOff.y, rt.CFG.camOff.z) || 30; }
function viewFov(w, h) {
  const short = Math.min(w, h), span = viewSpanFor(short);
  const aspect = w / Math.max(1, h);
  const tanV = (aspect >= 1) ? (span / (2 * camDist())) : (span / (2 * camDist() * aspect));
  const fov = 2 * Math.atan(tanV) * 180 / Math.PI;
  /* 보스 결계에서는 조금 물러나 보스의 예고 동작까지 화면에 담는다. */
  const arena = rt.arenaActive() ? 1.10 : 1;
  return rt.clamp(fov * arena, 24, 78);
}
function applyCameraLens() {
  if (!rt.three) return;
  const w = rt.three.view.clientWidth, h = Math.max(1, rt.three.view.clientHeight);
  rt.three.camera.aspect = w / h;
  rt.three.camera.fov = activeFov();
  rt.three.camera.updateProjectionMatrix();
  if (rt.S) rt.S._lensKey = (w | 0) + 'x' + (h | 0) + ':' + rt.three.camera.fov.toFixed(2);
}
function onResize() {
  if (!rt.three) return;
  rt.invalidateViewBox();
  applyCameraLens();
  const w = rt.three.view.clientWidth, h = Math.max(1, rt.three.view.clientHeight);
  rt.three.renderer.setSize(w, h);
  if (rt.three.bloom && rt.three.bloom.setSize) rt.three.bloom.setSize(w, h);
  rt.resizeInk();
  if (rt.S && rt.S.playing) rt.applyRingBoost();
}

function fadeFx(obj, a) {
  if (!obj) return;
  if (obj.material && obj.material.opacity != null) obj.material.opacity = a;
  if (obj.children) obj.children.forEach(function (c) { fadeFx(c, a); });
}


/* 스테이지 분위기: 밤 색·안개 농도·달빛·색조를 스테이지마다 바꾼다. */
/* v0.43 QA 노브: 바탕이 한지로 밝아진 만큼 빛의 세기를 화면에서 바로 맞춘다(?atmoK=0.5). */
const ATMO_K = (function () {
  try {
    const v = parseFloat(new URLSearchParams(location.search).get('atmoK'));
    return isFinite(v) && v > 0 ? v : 0.32;   /* v0.43 기본값: 한지 바탕에 맞춘 조도 */
  } catch (e) { return 1; }
})();
function applyStageAtmo(st) {
  st = st || (rt.S && rt.S.stage) || rt.stageOf(rt.save.stage || 1);
  rt.setChapterArt(st);
  const a = (st && st.atmo) || {};
  if (rt.three) {
    const clear = (a.clear != null) ? a.clear : (rt.three.baseClear != null ? rt.three.baseClear : rt.nightColor());
    if (rt.three.scene) {
      rt.three.scene.background = new rt.THREE.Color(clear);
      if (rt.three.scene.fog) { rt.three.scene.fog.color.set(clear); rt.three.scene.fog.density = a.fog != null ? a.fog : 0.007; }
    }
    if (rt.three.sky && rt.three.sky.material && rt.three.sky.material.color) rt.three.sky.material.color.set(clear);
    if (rt.three.moon) {
      rt.three.moon.intensity = (a.moon != null ? a.moon : 1.45) * ATMO_K;
      if (a.moonCol != null && rt.three.moon.color) rt.three.moon.color.setHex(a.moonCol);
    }
    if (rt.three.amb) rt.three.amb.intensity = (a.amb != null ? a.amb : 1.0) * ATMO_K;
    if (rt.three.fill) rt.three.fill.intensity = (a.fill != null ? a.fill : 0.85) * ATMO_K;
    if (rt.three.rim) rt.three.rim.intensity = 1.15 * ATMO_K;
    if (rt.three.inkUniforms && rt.three.inkUniforms.uGroundSheenAmt) rt.three.inkUniforms.uGroundSheenAmt.value = 0.22;
    if (rt.three.hemi && a.hemiI != null) rt.three.hemi.intensity = a.hemiI * ATMO_K;
    if (rt.three.hemi && a.hemi != null) rt.three.hemi.color.setHex(a.hemi);
    if (rt.three.hemi && a.ground != null) rt.three.hemi.groundColor.setHex(a.ground);
    if (rt.three.renderer) rt.three.renderer.setClearColor(clear, 1);
  }
  const tint = $('stageTint');
  if (tint) tint.style.background = a.tint || 'transparent';
  const app = $('app');
  if (app) app.dataset.stage = String((st && st.id) || 1);
  const actNo = rt.actOf((st && st.id) || 1);
  if (rt.audio && rt.audio.setAct) rt.audio.setAct(actNo);
  rt.hudCtrl.syncActTheme(actNo);
  rt.syncSceneActTheme3D({
    actNo,
    scene: rt.three && rt.three.scene,
    lights: rt.three,
    arena: rt.three && rt.three.chunks && rt.three.chunks.arena,
    paperFx: rt.three && rt.three.paper,
    heroGroup: rt.three && rt.three.heroSpr
  });
}

function applyFxinkAtmo(mapId) {
  const root = $('fxinkAtmo');
  if (!root) return;
  const id = mapId || (rt.S && rt.S.mapId) || (rt.three && rt.three.map && rt.three.map.id) || 'map1';
  const q = (rt.three && rt.three.bloom && rt.three.bloom.quality) || rt.fxQ;
  const B = rt.FXINK_BASE;
  const rays = q === 'high';
  const fogLayers = (q === 'low' || q === 'off') ? 1 : 2;
  const fs = (window.innerWidth < 600) ? '512px 256px' : '1024px 512px';
  root.innerHTML = (rays ? '<div class="rays" style="background-image:url(' + B + 'atmo/moonrays-' + id + '.png)"></div>' : '') +
    '<div class="lay edge a" style="background-image:url(' + B + 'atmo/fog-ink-' + id + '.png);background-size:' + fs + '"></div>' +
    (fogLayers > 1 ? '<div class="lay edge b" style="background-image:url(' + B + 'atmo/fog-mist-' + id + '.png);background-size:' + fs + '"></div>' : '');
  root.dataset.map = id;
  root.dataset.q = q;
}

function punchAtmoRing(cx, cy, ringR, wave) {
  const root = $('fxinkAtmo');
  if (!root) return;
  if (!(wave > 0.02) || !(ringR > 0)) {
    if (rt._atmoMask !== '') { root.style.webkitMaskImage = ''; root.style.maskImage = ''; rt._atmoMask = ''; }
    return;
  }
  const inner = Math.max(0, ringR - 22);
  const outer = ringR + 22;
  const img = 'radial-gradient(circle at ' + cx + 'px ' + cy + 'px,#fff 0,#fff ' + inner + 'px,transparent ' + inner + 'px,transparent ' + outer + 'px,#fff ' + outer + 'px)';
  if (img === rt._atmoMask) return;
  rt._atmoMask = img;
  root.style.webkitMaskImage = img;
  root.style.maskImage = img;
}
/* Mind's-eye fog: everything inside the ring is clear; outside lies dark fog. The edge is soft and
   broken by drifting mist so it reads as fog, not a line. */
function fogRgb() {
  const a = (rt.S && rt.S.stage && rt.S.stage.atmo) || {};
  return a.fogCol || rt.CFG.fogColor || [7, 6, 8];
}
/* ---- v0.39 2단계: 2D #sightFog 캔버스 은퇴 ----
   안개는 이제 재질(cardstock.js)과 후처리(inkwash.js)의 월드 거리 fade-to-dark 가 맡는다.
   이 함수는 2D 캔버스가 하던 나머지 세 가지 일만 남긴다:
     (a) CSS 레이어(#mindWave 등)가 읽는 영웅 화면 좌표 --hero-x/--hero-y
     (b) 심안 파동 순간 대기 레이어에 뚫리는 구멍(punchAtmoRing)
     (c) 착지 소나의 3D 지면 uniform (예전 그대로)
   혼령 창(punchSpiritLights)은 필요 없어졌다 — 혼령은 안개 면제 프로필이라 어둠에 잠기지 않는다. */
function syncHeroCss(hs) {
  const host = $('app');
  if (!host || !hs) return;
  const hxs = hs.x.toFixed(1) + 'px', hys = hs.y.toFixed(1) + 'px';
  if (hxs !== rt._heroCssX) { host.style.setProperty('--hero-x', hxs); rt._heroCssX = hxs; }
  if (hys !== _heroCssY) { host.style.setProperty('--hero-y', hys); _heroCssY = hys; }
}
/* 매 프레임: 영웅·심안 링 반경·파동·스테이지 안개색 → 공유 안개 uniform 과 후처리용 화면 좌표. */
function syncWorldFade() {
  const hero = rt.S && rt.S.hero;
  if (!hero) return;
  const R = rt.ringR();
  /* 카메라가 바라보는 바닥 방향(화면 위 = 멀어지는 방향)을 안개 타원의 축으로 넘긴다. */
  let fx = 0, fz = -1;
  const cam = rt.three && rt.three.camera;
  if (cam) {
    const e = cam.matrixWorld.elements;
    fx = -e[8]; fz = -e[10];
    if (Math.hypot(fx, fz) < 1e-4) { fx = 0; fz = -1; }
  }
  rt.updateWorldFade(rt.arenaActive()?rt.S.arena:hero, rt.arenaActive()?rt.arenaR()*1.65:R, (rt.S && rt.S.fogPulse) || 0, 12.5, qaFadeColor ? '#00ff00' : fogRgb(), rt.qaFadeMat > 0, fx, fz);
  rt.WF_POST.post = rt.arenaActive() ? 0 : 0.50 * qaFadePostK;
  const hs = rt.heroScreen();
  rt.WF_POST.heroScreen.set(hs.x, hs.y);
  return hs;
}
function drawSightFog() {
  const hs = (rt.S && rt.S.hero) ? syncWorldFade() : null;
  if (!hs) { punchAtmoRing(0, 0, 0, 0); return; }
  syncHeroCss(hs);
  if (!(rt.S && rt.S.playing)) { punchAtmoRing(0, 0, 0, 0); return; }
  const box = rt.viewBox();
  const wave = (rt.S && rt.S.sightWave) || 0;
  /* 4차: 심안 파동은 안개 구멍을 열기만 하고, 궤도 안의 두 번째 동심원 획은 그리지 않음. */
  if (wave > 0.04) {
    const holePx = Math.min(box.width, box.height) * (0.12 + 0.28 * wave);
    punchAtmoRing(hs.x, hs.y, holePx, wave);
  } else {
    punchAtmoRing(0, 0, 0, 0);
  }
  /* 착지 소나: 2D #sonarRing 은 걷어냈다(3D 지면 소나와 겹쳐 링이 두 겹이 되었다).
     이제 지면 셰이더(inklights.js)가 한 겹의 수묵 파동만 지형을 따라 내보낸다. */
  if (rt.S && rt.S.landRipple && rt.S.landRipple.t > 0) {
    const lp = rt.projectXZ(rt.S.landRipple.x, rt.S.landRipple.z, 0.15);
    const lt = rt.S.landRipple.t;
    const lr = 8 + (1 - lt) * 68;   /* 화면 픽셀 반경 */
    if (rt.three && rt.three.inkUniforms) {
      /* 착지점에서 1m 가 몇 px 인지로 나눠 월드 반경(m)으로 바꾼다 — 지면 링이 예전 2D 링과 같은 크기로 퍼진다. */
      const lp1 = rt.projectXZ(rt.S.landRipple.x + 1, rt.S.landRipple.z, 0.15);
      const pxPerM = Math.max(1, Math.hypot(lp1.x - lp.x, lp1.y - lp.y));
      rt.three.inkUniforms.uSonarOrigin.value.set(rt.S.landRipple.x, 0, rt.S.landRipple.z);
      rt.three.inkUniforms.uSonarRadius.value = lr / pxPerM;
      /* lt 는 1 → 0 으로 줄어든다: 처음에 가장 밝고 사라진다. 한 겹만 남았으므로 조금 더 세게. */
      rt.three.inkUniforms.uSonarAlpha.value = Math.min(1.15, Math.max(0, lt) * 1.15);
    }
  } else if (rt.three && rt.three.inkUniforms) {
    rt.three.inkUniforms.uSonarAlpha.value = 0;
  }
}
function loop(ts) {
  rt.raf = requestAnimationFrame(loop);
  rt._frameId++;
  let scale = rt.qa.timeScale || 1;
  if (!rt.lastTs) rt.lastTs = ts;
  const real = Math.max(0.0001, (ts - rt.lastTs) / 1000);
  rt.frameDt = Math.min(0.1, real);
  const raw = Math.min((rt.qa.timeScale && rt.qa.timeScale > 1) ? 0.2 : 0.05, real);
  if (rt.S && rt.S.slowT > 0) {
    rt.S.slowT -= raw;
    if (rt.S.slowT < 0) rt.S.slowT = 0;
    else scale *= rt.CFG.slowScale;
  }
  /* v0.30: 튜토리얼 느린 화면·첫 등장 느린 화면. 흔들림을 줄인 설정이면 0.6배까지만.
     prefers-reduced-motion이면 느린 화면 없이 안내 문구만(v0.24 6장). */
  if (rt.S && rt.S.playing && !rt.S.paused) rt.stepTutorial(raw);
  if (rt.S) {
    const floor = rt.a11yShake() ? 0.6 : 0.05;
    const noSlow = rt.reducedMotion();
    if (!noSlow && rt.S.slowMulT > 0 && rt.S.slowMul < 1) {
      scale *= Math.max(floor, rt.S.slowMul);
      rt.S.slowMulT = Math.max(0, rt.S.slowMulT - raw);
    }
    if (!noSlow && rt.S.tutSlow && rt.S.tutSlow < 1) scale *= Math.max(floor, rt.S.tutSlow);
    if (rt.three && rt.three.camera && rt.S.playing) {
      let targetFov = activeFov();
      if (rt.S.camZoomT > 0) {
        rt.S.camZoomT = Math.max(0, rt.S.camZoomT - raw);
        const zf = Math.min(1, rt.S.camZoomT / 0.35);
        targetFov -= (rt.S.camZoomAmt || 0) * zf;
      }
      if (Math.abs(rt.three.camera.fov - targetFov) > 0.04) {
        rt.three.camera.fov += (targetFov - rt.three.camera.fov) * Math.min(1, raw * 7.5);
        rt.three.camera.updateProjectionMatrix();
      }
    }
  }
  const dt = raw * scale;
  rt.lastTs = ts;
  if (real > 0 && real < 1) {
    const f = 1 / real;
    rt.fps.samples.push(f);
    if (rt.fps.samples.length > 300) rt.fps.samples.shift();
    rt.fps.last = f;
    /* v0.87 모바일 60fps 자동 화질 조절기 (Dynamic FPS Governor) */
    if ((rt._frameId % 120) === 0 && rt.S && rt.S.playing && rt.three && rt.three.renderer && rt.fps.samples.length >= 60) {
      let sum60 = 0;
      for (let fi = rt.fps.samples.length - 60; fi < rt.fps.samples.length; fi++) sum60 += rt.fps.samples[fi];
      const avg60 = sum60 / 60;
      const curDpr = rt.three.renderer.getPixelRatio ? rt.three.renderer.getPixelRatio() : 1;
      if (avg60 < 42 && curDpr > 1.05) {
        rt.three.renderer.setPixelRatio(Math.max(1.0, +(curDpr - 0.35).toFixed(2)));
      } else if (avg60 < 34 && rt.three.moon && rt.three.moon.castShadow) {
        rt.three.moon.castShadow = false;
      }
    }
  }
  if (rt.toastT && rt.now() > rt.toastT) { $('toast').hidden = true; rt.toastT = 0; }
  if (rt.guideUntil && rt.S && (rt.S.elapsed || 0) >= rt.guideUntil) rt.hideGuide();
  if (rt.pendingStage && rt.now() >= rt.pendingStage.until && (rt.pendingStage.ready || rt.now() >= rt.pendingStage.until + 8000)) rt.goStageNow(true);
  if (rt.S && rt.S.comboBurstT > 0) {
    rt.S.comboBurstT -= raw;
    if (rt.S.comboBurstT <= 0) {
      rt.S.comboBurstT = 0;
      const app = $('app');
      if (app) app.classList.remove('combo-burst');
    }
  }
  if (rt.inkFade > 0 && !rt.pointers.down) {
    rt.inkFade -= raw;
    if (rt.inkFade <= 0) rt.clearInk();
    else rt.paintInk(rt.lastStroke, rt.clamp(rt.inkFade / 0.35, 0, 1));
  }
  if (rt.S && rt.S.paused === 'levelup' && (rt.qa.autoPick === true || (rt.qa.autoPick !== false && (rt.qa.autoStroke || (rt.qa.noDelay && rt.qa.timeScale > 1))))) {
    const b = document.querySelector('#levelChoices [data-up]');
    if (b) rt.pickUpgrade(b.getAttribute('data-up'));
    else if (rt.S.levelPicks && rt.S.levelPicks[0]) rt.pickUpgrade(rt.S.levelPicks[0].id);
  }
  /* §5.2 QA·빠른 진행: 멈추지 않는 카드는 화면을 막지 않으므로 바로 추천으로 넘긴다. */
  if (rt.S && rt.S.quick) {
    const auto = rt.qa.autoPick === true || (rt.qa.autoPick !== false && (rt.qa.autoStroke || (rt.qa.noDelay && rt.qa.timeScale > 1)));
    if (auto || rt.now() - rt.S.quick.t0 >= rt.S.quick.dur) {
      const id = rt.recommendedPick();
      if (id) rt.pickQuick(id, auto); else rt.closeQuickCards();
    }
  }
  /* §5.2 수용 기준 측정: 멈춰 있는 시간의 합(레벨업 정지). */
  if (rt.S && rt.S.playing && rt.S.paused) rt.S.stopT = (rt.S.stopT || 0) + real;
  if (rt.S && rt.S.hitstop > 0) {
    rt.S.hitstop -= raw;
    if (rt.S.hitstop < 0) rt.S.hitstop = 0;
  } else {
    if (rt.S && rt.S.playing && !rt.S.paused) rt.step(dt);
    rt.stepDash(dt);
  }
  rt.updateCam(dt);
  if (rt.three) {
    /* v0.22 무한 청크: 영웅이 청크를 넘으면 3×3 창을 밀고 새 청크를 세운다. */
    if (rt.three.chunks) rt.three.chunks.update(raw, ts * 0.001, rt.S ? rt.S.hero.x : 0, rt.S ? rt.S.hero.z : 0);
    /* Hand the window's bonfires to the ember field whenever the chunks rebuild or the atmosphere is replaced. */
    if (rt.three.chunks && rt.three.atmo && (rt.three.emberAt !== rt.three.chunks.stats.rebuilds || rt.three.emberAtmo !== rt.three.atmo)) {
      rt.three.emberAt = rt.three.chunks.stats.rebuilds; rt.three.emberAtmo = rt.three.atmo;
      rt.three.atmo.setEmitters(rt.three.chunks.embers);
    }
    if (rt.three.map && rt.three.map.follow && !(rt.three.chunks && rt.three.chunks.bounds)) rt.three.map.follow(rt.S ? rt.S.cam.x : 0, rt.S ? rt.S.cam.z : 0);
    rt.stepArena(raw);
    if (rt.three.map && rt.three.map.update) rt.three.map.update(raw, ts * 0.001);
     if (rt.three.atmo && !(rt.S && rt.S.paused)) {
      if (rt.S && rt.S.hero) {
        rt.three.atmo.setCenter(rt.S.cam.x, 6, rt.S.cam.z);
        rt.three.atmo.update(raw);
      } else rt.three.atmo.update(raw);
    }
    if (rt.three.moon && rt.three.moon.target) {
      const hx = rt.S ? rt.S.cam.x : 0, hz = rt.S ? rt.S.cam.z : 0;
      rt.three.moon.position.set(hx - 18, 28, hz + 10);
      rt.three.moon.target.position.set(hx, 0, hz);
      rt.three.moon.target.updateMatrixWorld();
    }
    rt.stepQuality(real);
    rt.stepDying(raw);
    /* 매 프레임 배열을 새로 만들지 않고 제자리에서 걸러낸다(GC 압박 감소). */
    const fx = rt.three.fx || [];
    let fxN = 0;
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      f.life -= raw;
      fadeFx(f.mesh, Math.max(0, f.life / f.max * 0.85));
      if (f.life <= 0) { if (f.mesh && f.mesh.userData && f.mesh.userData.rig) rt.disposeCharGeom(f.mesh); rt.three.scene.remove(f.mesh); continue; }
      fx[fxN++] = f;
    }
    fx.length = fxN;
    rt.three.fx = fx;
    if (rt.three.heroSpr && rt.art.tickChar) {
      const st = (rt.S && rt.S.dash) ? 'dash' : 'idle';
      let hvx = 0, hvz = 0;
      if (rt.S && rt.S.dash) { hvx = rt.S.dash.to.x - rt.S.dash.from.x; hvz = rt.S.dash.to.z - rt.S.dash.from.z; }
      rt.art.tickChar(rt.three.heroSpr, 'hero', st, raw, hvx, hvz);
      const spr = rt.three.heroSpr.userData && rt.three.heroSpr.userData.sprite;
      if (spr) {
        spr.visible = true;
        if (spr.material) spr.material.opacity = 1;
        if (rt.three.heroSpr.userData.rig) rt.art.setCharOrder(rt.three.heroSpr, 8);
        else { spr.renderOrder = 8; if (spr.material) spr.material.depthTest = false; }
      }
      const onTitle = $('ov-title') && $('ov-title').classList.contains('show');
      rt.three.heroSpr.visible = !onTitle;
    }
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      if (!f.sheet || !f.spr || !f.spr.material || !f.spr.material.map) continue;
      const fr = Math.min(f.n - 1, Math.max(0, Math.floor((1 - f.life / f.max) * f.n)));
      const tmap = f.spr.material.map;
      tmap.repeat.set(1 / f.n, 1);
      tmap.offset.set(fr / f.n, 0);
    }
    if (rt.three.slashes && rt.three.slashes.length) {
      const sl = rt.three.slashes;
      let w = 0;
      for (let i = 0; i < sl.length; i++) {
        const s = sl[i];
        if (s.update && s.update(dt)) { sl[w++] = s; continue; }
        if (s.mesh) rt.three.scene.remove(s.mesh);
        if (s.dispose) s.dispose();
      }
      sl.length = w;
    }
    if (rt.three.ink && rt.three.ink.update) rt.three.ink.update(dt);
    if (rt.three.paper) rt.three.paper.update(dt);
    if (rt.three.traces) rt.three.traces.update(dt);
    if (rt.three.lights) rt.three.lights.update(dt);
    if (rt.three.vfx3d) rt.three.vfx3d.update(dt);
    if (rt.three.shaderFx3d) {
      if (rt.S && rt.S.hero) rt.three.shaderFx3d.syncHeroShield(rt.S.hero.x, rt.S.hero.z, !!(rt.S.playing && rt.relicOn(rt.save, 'mirror') && !rt.S.mirrorUsed), false);
      else rt.three.shaderFx3d.syncHeroShield(0, 0, false, false);
      rt.three.shaderFx3d.update(dt, rt.three.camera);
    }
    /* v0.40 4단계: 초점 거리 = 주인공 가슴. 디오라마의 접사 초점 밴드가 주인공에 고정된다. */
    try {
      const dp = rt.dofPassOf();
      if (dp && rt.three.camera) {
        const hx = rt.S && rt.S.hero ? rt.S.hero.x : 0, hz = rt.S && rt.S.hero ? rt.S.hero.z : 0;
        dp.setFocus(rt.focusDistance(rt.three.camera, hx, 1.05, hz));
      }
    } catch (e) {}
    /* v0.40 5단계: 접힘 스프링 대상(부적·결계·카드) 적분 */
    try { rt.tickFolds(dt); } catch (e) {}
    if (rt.three.inkUniforms && rt.S && rt.S.hero) rt.three.inkUniforms.uHeroPos.value.set(rt.S.hero.x, 0, rt.S.hero.z);
    if (rt.three.inkUniforms && rt.three.inkUniforms.uCrackHeatAmt && rt.three.inkUniforms.uCrackHeatAmt.value > 0.002) {
      rt.three.inkUniforms.uCrackHeatAmt.value *= Math.exp(-dt * 1.45);
      if (rt.three.inkUniforms.uCrackHeatAmt.value < 0.002) rt.three.inkUniforms.uCrackHeatAmt.value = 0;
    }
    /* v0.39: 그림자 프러스텀을 그 프레임의 카메라 가시 바닥에 맞춘다(텍셀 스냅 포함). */
    if (rt.S && rt.S.hero && rt.S.playing) {
      const radius = rt.ringR();
      const aa = rt.arenaActive();
      const zs = rt.S.zombies;
      for (let i = 0; i < zs.length; i++) {
        const enemy = zs[i];
        if (enemy.alive && enemy.obj) enemy.obj.visible = !enemy.hidden && (aa || rt.dist(enemy, rt.S.hero) <= radius);
      }
      const lms = rt.livingMarks();
      for (let i = 0; i < lms.length; i++) {
        const spirit = lms[i];
        if (spirit.obj && spirit.target) spirit.obj.visible = !spirit.target.hidden && (aa || rt.dist(spirit.target, rt.S.hero) <= radius);
      }
    }
    rt.syncGroundEffects();
    if (rt.S && rt.S.boss && rt.S.boss.alive && rt.S.boss.state !== 'groggy' && rt.S.boss.state !== 'seal' && rt.S.boss.state !== 'sealing') {
      const bz = rt.S.boss, pMax = bz.poiseMax || 6;
      if ((bz.poise || 0) < pMax && ((rt.S.elapsed || 0) - (bz.poiseLastHit || 0)) >= 4.2) {
        bz.poise = Math.min(pMax, (bz.poise || 0) + 1.15 * dt);
      }
    }
    rt.bossFx.syncGround3D(rt.S && rt.S.boss, rt.S && rt.S.hazards, (rt.S && rt.S.elapsed) || 0, dt, ((rt.CFG.bossPat || {}).slam || {}).r || 3.2);
    if (rt.three.river && typeof rt.three.river.update === 'function') rt.three.river.update(dt);
    if (rt.three.terrain3d && typeof rt.three.terrain3d.update === 'function') rt.three.terrain3d.update(dt);
     rt.fitShadowFrustum();
    if (rt.three.bloom && rt.three.bloom.render) rt.three.bloom.render(dt);
    else rt.three.renderer.render(rt.three.scene, rt.three.camera);
    rt.updateMarks();
    drawSightFog();
  }
  if (rt.audio) rt.audio.tick(rt.CFG.bpm);
}

function fpsReport() {
  const raw = rt.fps.samples.slice();
  const a = raw.filter(function (f) { return f >= 20 && f <= 144; });
  const use = a.length >= 10 ? a : raw;
  if (!use.length) return { avg: 0, min: 0, n: 0, rawN: raw.length, last: rt.fps.last };
  let s = 0, m = use[0];
  for (let i = 0; i < use.length; i++) { s += use[i]; if (use[i] < m) m = use[i]; }
  return { avg: s / use.length, min: m, n: use.length, rawN: raw.length, last: rt.fps.last };
}

  return { applyCameraLens, applyFxinkAtmo, applyStageAtmo, camDist, drawSightFog, fpsReport, loop, onResize, viewSpanFor };
}
