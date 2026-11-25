/* v2/js/modules/world3d.js — 심안: 묵검 v1.26 Three.js 월드·그림자 프러스텀·청크·포스트패스 */

export function createWorld3d(rt) {
  const $ = rt.$;
function switchMap(id, stageNo) {
  if (!rt.art || !rt.three) return Promise.resolve(null);
  const want = (id && rt.art.atlas && rt.art.atlas.maps && rt.art.atlas.maps[id]) ? id : 'map1';
  const st = stageNo || (rt.S && rt.S.stageNo) || (rt.save.stage || 1);
  const run = function () {
    const _t0 = performance.now();
    return rt.art.applyMap(rt.three.scene, want, rt.three.map, { stage: st }).then(function (m) {
      rt.three.map = m;
      rt.three.torches = [];
      /* v0.39: 장이 바뀌면 새 팔레트·새 종이 소품이 온다 — 같은 종이/안개 규칙으로 다시 칠한다. */
      try { if (m && m.group) rt.paintCard(m.group, 'prop'); } catch (e) {}
      if (rt.three.chunks && rt.three.chunks.arena && typeof rt.three.chunks.arena.tickTheme === 'function') rt.three.chunks.arena.tickTheme(performance.now() * 0.001);
    if (rt.three.atmo) { try { rt.three.atmo.dispose(); } catch (e) {} }
      try { rt.three.atmo = new rt.StageAtmosphere(rt.three.scene, st); } catch (e) { rt.three.atmo = null; }
      const _t1 = performance.now();
      setupChunkWorld(st, m.id);
      rt.perfMark('switchMap.chunks', performance.now() - _t1, { stage: st, map: m.id });
      if (rt.S) { rt.S.mapId = m.id; rt.S.mapStage = st; }
      rt.applyFxinkAtmo(m.id);
      rt.perfMark('switchMap', performance.now() - _t0, { stage: st, map: m.id });
      return { id: m.id, name: m.name, key: m.key, stageId: st };
    });
  };
  if (rt.three._mapP) rt.three._mapP = rt.three._mapP.then(run, run);
  else rt.three._mapP = run();
  const p = rt.three._mapP;
  p.then(function () { if (rt.three._mapP === p) rt.three._mapP = null; });
  return p;
}

/* v0.22: 3×3 시드 청크 무한 맵을 (다시) 세운다. 스테이지가 바뀌면 통째로 갈아 끼운다. */
function setupChunkWorld(stageId, mapId) {
  if (!rt.three) return null;
  if (rt.three.chunks) {
    try { rt.three.chunks.dispose(); } catch (e) {}
    rt.three.chunks = null;
  }
  try {
    rt.three.chunks = rt.createChunkWorld({ stageId: stageId || 1, mapId: mapId || 'map1' });
    rt.three.scene.add(rt.three.chunks.group);
    /* 장이 바뀔 때마다 새 지면 재질이 생기므로 여기서 지면 소나 셰이더를 붙인다(지면만). */
    if (rt.three.inkUniforms) {
      rt.three.chunks.group.traverse(function (obj) {
        if (obj.isMesh && obj.material && obj.material.userData && obj.material.userData.inkGround) {
          rt.attachGroundInkShader(obj.material, rt.three.inkUniforms);
        }
      });
    }
    /* v0.39: 청크 소품도 같은 종이·안개 규칙. 배치 메시는 update() 때 생기므로,
       재질 목록을 직접 칠한다(메시가 생겨도 이미 패치된 재질을 공유한다). */
    try {
      const mats = rt.three.chunks && rt.three.chunks.materials;
      if (mats) mats.forEach(function (m) { rt.paintCard(m, 'prop'); });
      rt.paintCard(rt.three.chunks.group, 'prop');
    } catch (e) {}
    const _t0 = performance.now();
    rt.three.chunks.update(0, 0, (rt.S && rt.S.hero) ? rt.S.hero.x : 0, (rt.S && rt.S.hero) ? rt.S.hero.z : 0);
    rt.perfMark('chunkWorld.build', performance.now() - _t0, { stage: stageId || 1 });
  } catch (e) {
    rt.three.chunks = null;
    if (window.console && console.warn) console.warn('[심안] 청크 월드 생성 실패', e);
  }
  return rt.three.chunks;
}

let DPR_QUERY = 0;
try {
  const q = parseFloat(new URLSearchParams(location.search).get('dpr'));
  if (q > 0) DPR_QUERY = Math.min(2.5, q);
} catch (e) {}

async function makeWorld() {
  const view = $('view');
  const renderer = new rt.THREE.WebGLRenderer({ antialias: !rt.IS_MOBILE, alpha: false, powerPreference: 'high-performance' });
  // On the RTX 3050 ANGLE/D3D11 path, enabling parallel link-status queries
  // produces GL_INVALID_VALUE at startup. Keep Three's ordinary link path on
  // that backend only; do not change the WebGL context or silence its errors.
  const gl = renderer.getContext();
  const gpuInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = gpuInfo ? gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) : '';
  if (/ANGLE.*GeForce RTX 3050.*Direct3D11/i.test(gpuName)) {
    const hasExtension = renderer.extensions.has.bind(renderer.extensions);
    renderer.extensions.has = name => name !== 'KHR_parallel_shader_compile' && hasExtension(name);
  }
  /* 모바일 60fps: 기기 DPR을 2까지만 쓰고, 프레임이 무너지면 1까지 내린다. */
  const dprCap = DPR_QUERY || Math.min(window.devicePixelRatio || 1, rt.IS_MOBILE ? 1.5 : 2);
  renderer.setPixelRatio(dprCap);
  renderer.setSize(view.clientWidth, view.clientHeight);
  renderer.shadowMap.enabled = true;
  /* v0.39 3단계: PCF(반경 사용) 경로 — 그림자 프러스텀을 카메라 가시 바닥에 맞추면서
     texel 이 작아졌으므로, 반경을 키워 부드러운 페넘브라를 얻는다(stock 청크 그대로 = 버전 안전). */
  renderer.shadowMap.type = rt.THREE.PCFShadowMap;
  renderer.outputColorSpace = rt.THREE.SRGBColorSpace;
  renderer.toneMapping = rt.THREE.NoToneMapping;
  /* 셰이더마다 오류 로그를 동기로 읽으면 컴파일이 끝날 때까지 프레임이 멈춘다 — ?debug 때만 검사. */
  try { renderer.debug.checkShaderErrors = new URLSearchParams(location.search).has('debug'); } catch (e) {}
  const clear = rt.nightColor();
  renderer.setClearColor(clear, 1);
  view.appendChild(renderer.domElement);

  const scene = new rt.THREE.Scene();
  scene.background = new rt.THREE.Color(clear);
  scene.fog = new rt.THREE.FogExp2(clear, 0.007);

  const camera = new rt.THREE.PerspectiveCamera(rt.CFG.fov || 62, view.clientWidth / Math.max(1, view.clientHeight), 0.1, 200);
  camera.position.set(rt.CFG.camOff.x, rt.CFG.camOff.y, rt.CFG.camOff.z);
  camera.lookAt(0, rt.CFG.camLookY, 0);

  const amb = new rt.THREE.AmbientLight(rt.palColor('rigAmbient'), 1.02);
  scene.add(amb);
  const hemi = new rt.THREE.HemisphereLight(rt.palColor('rigHemiSky'), rt.palColor('rigHemiGround'), 1.08);
  scene.add(hemi);
  /* v0.97 전투 3D 입체감 강화: 주광(달빛)·보조광·후면 림라이트를 로비 3D 톤에 맞춰 조율 */
  const moon = new rt.THREE.DirectionalLight(rt.palColor('rigMoonlight'), 1.48);
  moon.position.set(-18, 28, 10);
  moon.castShadow = true;
  const initShadowSz = rt.IS_MOBILE ? (rt.fxQ === 'high' ? 1024 : 512) : (rt.fxQ === 'high' ? 2048 : 1024);
  moon.shadow.mapSize.set(initShadowSz, initShadowSz);
  /* 프러스텀은 fitShadowFrustum() 이 매 프레임 카메라가 보는 바닥에 맞춘다(초기값만 넉넉히). */
  moon.shadow.camera.left = -30; moon.shadow.camera.right = 30;
  moon.shadow.camera.top = 30; moon.shadow.camera.bottom = -30;
  moon.shadow.camera.near = 1; moon.shadow.camera.far = 90;
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.032;
  moon.shadow.radius = 2.2;
  moon.target.position.set(0, 0, 0);
  scene.add(moon);
  scene.add(moon.target);
  /* 그림자 진 곳을 죽이지 않는 반대편 달빛(그림자 없음) — 먹 그림자가 검은 구멍이 되지 않게. */
  const fill = new rt.THREE.DirectionalLight(rt.palColor('rigFill'), 0.78);
  fill.position.set(14, 12, -16);
  scene.add(fill);
  /* v0.97 캐릭터·보스 윤곽을 어두운 수묵 바닥에서 또렷하게 분리하는 후면 림라이트 */
  const rim = new rt.THREE.DirectionalLight(0xffebb8, 1.15);
  rim.position.set(-10, 14, -18);
  scene.add(rim);

  const sky = new rt.THREE.Mesh(
    new rt.THREE.SphereGeometry(90, 24, 16),
    new rt.THREE.MeshBasicMaterial({ color: clear, side: rt.THREE.BackSide })
  );
  scene.add(sky);

  const map = await rt.art.applyMap(scene, 'map1', null, { stage: 1 });
  /* v0.39: 무대 소품·원경 병풍·하늘을 같은 종이/안개 규칙으로 칠한다. */
  try { if (map && map.group) rt.paintCard(map.group, 'prop'); } catch (e) {}
  try { if (sky && sky.material) { sky.material.userData.cardProfile = 'backdrop'; rt.paintCard(sky.material, 'backdrop'); } } catch (e) {}
  const world = {
    renderer: renderer, scene: scene, camera: camera, map: map, torches: [], fx: [], slashes: [],
    view: view, fxForced: rt.fxQForced, amb: amb, hemi: hemi, moon: moon, fill: fill, rim: rim, sky: sky, baseClear: clear,
    dprCap: dprCap, dprNow: dprCap, atmo: new rt.StageAtmosphere(scene, 1)
  };
  /* 점광원 풀은 재질 예열(prewarmInkSlash) 전에 만든다 — 조명 개수가 바뀌면 예열한 프로그램이 다시 링크된다.
     상시 visible(강도 0) 점광원은 모든 조명 재질의 프래그먼트 비용이므로, 품질이 high 가 아니면 2개만 만든다. */
  world.lights = new rt.InkLightPool(scene, { maxLights: rt.fxQ === 'high' ? 4 : 2, distance: 13 });
  world.inkUniforms = rt.createWorldInkUniforms();
  try {
    /* post() 는 build() 때마다 다시 불리므로(품질 변경) 패스도 매번 새로 만든다 — dispose 된 패스를 재사용하지 않게. */
    world.bloom = rt.setupBloom(renderer, scene, camera, {
      quality: rt.fxQ,
      depth: true,
      strength: 0.32,
      threshold: 0.88,
      radius: 0.35,
      post: function () {
        if (rt.PIXEL_LOOK) {
          const px = rt.createPixelLookPass();
          px.setPixelRatio(renderer.getPixelRatio());
          return [rt.createCinematicPass(), px];
        }
        const wash = rt.createInkWashPass();
        /* v0.72: 모바일에서는 DepthCapture + TiltShift(DoF) 2패스를 생략해 GPU 필레이트 25~30% 절감 */
        if (rt.IS_MOBILE && rt.fxQ !== 'high') {
          return [wash, rt.createCinematicPass()];
        }
        wash.enableDepth(camera.near, camera.far);
        const dof = rt.createTiltShiftPass({ amount: 0.72, band: 6.5, soft: 14.0 });
        const dep = rt.createDepthCapture(dof);
        dof.setCamera(camera);
        dep.setCamera(camera);
        dof.setLevel(0);
        return [dep, wash, rt.createCinematicPass(), dof];
      }
    });
  } catch (e) { world.bloom = null; }
  /* v0.39 2단계: 후처리에도 같은 월드 안개 목표를 넘긴다 — 재질이 놓친 픽셀(하늘·구멍)을 한 겹 더 잠근다. */
  try {
    const wash = world.bloom && world.bloom.post && washOf(world.bloom.post);
    if (wash && wash.setFadeSource) wash.setFadeSource(camera, WF_POST);
  } catch (e) {}
  try {
    world.ink = new rt.InkParticles(scene, { base: rt.FXINK_BASE, quality: rt.fxQ === 'high' ? 'high' : 'low' });
    /* v0.41: 종이 컷아웃 멀티프레임 이펙트(스킬·타격·부적·혼소멸) */
    try { world.paper = new rt.PaperFx(scene, { quality: rt.fxQ === 'high' ? 'high' : 'low' }); } catch (e) { world.paper = null; }
    /* v0.43: 바닥에 남는 원소 흔적(먹 튐·그을림·얼음 균열·번개 자국) */
    try { world.traces = new rt.TraceField(scene, { cap: rt.fxQ === 'high' ? 10 : 6 }); } catch (e) { world.traces = null; }
    /* v0.60: 스킬 기반 3D 번개·먹소용돌이·잔상빌로우·스파크·임팩트 프레임 통합 엔진 */
    try { world.vfx3d = new rt.SimanVfx3D(scene, { quality: rt.fxQ === 'high' ? 'high' : 'low' }); } catch (e) { world.vfx3d = null; }
    /* v0.73: godot-shaders 3종(3D Dissolve · 3D Shockwave · Force Field) 제로-GC 풀링 엔진 */
    try { world.shaderFx3d = new rt.SimanShaderFx3D(scene, { quality: rt.fxQ === 'high' ? 'high' : 'low' }); } catch (e) { world.shaderFx3d = null; }
    /* 바닥 먹 데칼은 밝아진 2.5D 바닥에서 검은 사각형으로 읽혀 끈다. 튐·터짐은 유지. */
    if (world.ink.decals) world.ink.decals.mesh.visible = false;
  } catch (e) { world.ink = null; }
  try { rt.prewarmInkSlash(renderer, scene, camera); } catch (e) {}
  try {
    renderer.domElement.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      if (window.console && console.warn) console.warn('[심안] WebGL context lost — 복구를 기다립니다');
    }, false);
  } catch (e) {}
  world.ql = { level: 0, lowT: 0, highT: 0, cool: 0, lockAt: 99, lastUp: -99, t: 0 };
  rt.initOverlayShell();
  return world;
}

/* 후처리 fade 소스: cardstock 의 공유 uniform 을 그대로 읽고, 화면 좌표만 여기서 더한다. */
const WF_POST = { uWfHero: rt.WF.uWfHero, uWfRange: rt.WF.uWfRange, uWfAmt: rt.WF.uWfAmt, uWfColor: rt.WF.uWfColor, uWfDirK: rt.WF.uWfDirK, heroScreen: new rt.THREE.Vector2(0.5, 0.5), post: 0.50 };
/* 품질 변경으로 포스트 체인이 다시 만들어져도 안개 소스를 다시 묶는다(새 패스는 소스가 없다). */
function wireFadeSource() {
  try {
    const w = rt.three;
    const wash = w && w.bloom && washOf(w.bloom.post);
    if (wash && wash.setFadeSource && w.camera) wash.setFadeSource(w.camera, WF_POST);
    const dp = dofPassOf();
    if (dp && w && w.camera) { dp.setCamera(w.camera); dp.setLevel(w.ql ? w.ql.level : 0); }
    const dc = depPassOf();
    if (dc && w && w.camera) dc.setCamera(w.camera);
  } catch (e) {}
}
/* v0.40: 포스트 체인에서 수묵 워시 패스를 찾는다(체인 앞에 깊이 캐시 패스가 들어와도 안전). */
function washOf(post) {
  if (!post) return null;
  for (let i = 0; i < post.length; i++) if (post[i] && post[i].setFadeSource) return post[i];
  return null;
}
/* v0.40: 깊이 캐시 패스(체인 맨 앞)를 찾는다. */
function depPassOf() {
  const w = rt.three;
  const post = w && w.bloom && w.bloom.post;
  if (!post) return null;
  for (let i = 0; i < post.length; i++) if (post[i] && post[i].setCamera && !post[i].setFocus) return post[i];
  return null;
}
/* v0.40: 포스트 체인에서 틸트시프트 심도 패스를 찾는다(품질 변경으로 체인이 새로 만들어져도 매번 찾는다). */
function dofPassOf() {
  const w = rt.three;
  const post = w && w.bloom && w.bloom.post;
  if (!post) return null;
  for (let i = 0; i < post.length; i++) if (post[i] && post[i].setFocus) return post[i];
  return null;
}
/* QA/튜닝 스위치 — 0 이면 각 층의 안개를 끈다(전후 비교 스크린샷용). */

/* ---------- v0.39 3단계: 그림자 프러스텀 피팅 ----------
   60m 고정 ortho(1024)는 화면에 보이는 10~15m 바닥에 비해 해상도를 4배 이상 낭비했다.
   매 프레임 카메라가 보는 바닥 영역을 재어 반음(0.5m) 단위로 맞추고, 그림자 텍셀에 스냅한다
   (스냅하지 않으면 카메라가 움직일 때 그림자 가장자리가 흐물흐물 떨린다). */
const _shadowDir = new rt.THREE.Vector3(-18, 28, 10).normalize();
const _shadowC = new rt.THREE.Vector3();
const _shadowR = new rt.THREE.Vector3();
const _shadowU = new rt.THREE.Vector3();
const _shadowTmp = new rt.THREE.Vector3();
const _shadowFwd = new rt.THREE.Vector3();
const _shadowUp = new rt.THREE.Vector3();
const _shadowEye = new rt.THREE.Vector3();
const WORLD_UP = new rt.THREE.Vector3(0, 1, 0);
let _shadowExtent = -1;
function fitShadowFrustum() {
  const w = rt.three;
  if (!w || !w.moon || !w.camera) return;
  const moon = w.moon, cam = w.camera;
  if (!moon.castShadow) return;
  const MS = moon.shadow, c = MS.camera;
  cam.updateMatrixWorld();
  const e = cam.matrixWorld.elements;
  _shadowR.set(e[0], 0, e[2]);
  _shadowFwd.set(-e[8], -e[9], -e[10]);
  _shadowUp.set(e[4], 0, e[6]);
  if (_shadowR.lengthSq() < 1e-8) _shadowR.set(1, 0, 0);
  _shadowR.normalize();
  const sinPitch = Math.min(1, Math.max(0.2, -_shadowFwd.y));
  _shadowEye.setFromMatrixPosition(cam.matrixWorld);
  let dist = 18;
  if (_shadowFwd.y < -0.05) {
    const t = Math.min(200, _shadowEye.y / -_shadowFwd.y);
    _shadowC.copy(_shadowEye).addScaledVector(_shadowFwd, t);
    dist = t;
  } else {
    _shadowC.copy(_shadowEye);
    dist = _shadowEye.distanceTo(_shadowC);
  }
  _shadowC.y = 0;
  /* 영웅 쪽으로 조금 당겨, 화면 아래(플레이어) 그림자가 더 선명하게 들어오게. */
  if (rt.S && rt.S.hero) {
    _shadowC.x += (rt.S.hero.x - _shadowC.x) * 0.35;
    _shadowC.z += (rt.S.hero.z - _shadowC.z) * 0.35;
  }
  const fovTan = Math.tan(rt.THREE.MathUtils.degToRad(cam.fov) * 0.5);
  const halfW = dist * fovTan * (cam.aspect || 1);
  const halfD = (dist * fovTan) / sinPitch;
  let want = Math.max(halfW, halfD) * 1.12 + 1.5;
  want = Math.min(26, Math.max(6, Math.ceil(want * 2) / 2));
  const size = MS.mapSize.x || 1024;
  if (want !== _shadowExtent) {
    _shadowExtent = want;
    c.left = -want; c.right = want; c.top = want; c.bottom = -want;
    c.near = 1; c.far = 90;
    c.updateProjectionMatrix();
    /* penumbra: 프러스텀 반경에 반비례하는 월드 크기를 텍셀 단위로 환산한다. */
    moon.shadow.radius = Math.max(1.4, Math.min(3.4, 2.4 * (30 / want)));
  }
  /* 텍셀 스냅 */
  const texel = (2 * _shadowExtent) / size;
  _shadowR.crossVectors(WORLD_UP, _shadowDir).normalize();
  _shadowU.crossVectors(_shadowDir, _shadowR).normalize();
  const a = Math.round(_shadowC.dot(_shadowR) / texel) * texel;
  const b = Math.round(_shadowC.dot(_shadowU) / texel) * texel;
  _shadowTmp.set(0, 0, 0).addScaledVector(_shadowR, a).addScaledVector(_shadowU, b).addScaledVector(_shadowDir, _shadowC.dot(_shadowDir));
  moon.target.position.copy(_shadowTmp);
  moon.position.copy(_shadowTmp).addScaledVector(_shadowDir, 35);
  moon.target.updateMatrixWorld();
  moon.updateMatrixWorld();
}

/* One quality ladder for the whole look. Going down: shadows off, bloom low, then resolution in steps.
   Going up again when the frame rate has recovered, so a hitch early in a run does not leave the
   screen soft for the rest of it. A level that drops again within 10 s of being restored is locked. */
const QL_LEVELS = 5;
function applyQuality(level) {
  const w = rt.three; if (!w) return;
  const shadows = level < 1;
  if (w.moon && w.moon.castShadow !== shadows) w.moon.castShadow = shadows;
  /* v0.39 3단계: 그림자 맵 해상도도 레더에 연결한다. 프러스텀이 카메라 가시 바닥에 맞춰지므로
     1024 로도 충분히 선명하다 — 한 단계 내려가면 바로 1024 로 떨어뜨린다.
     (맵 크기를 바꿀 때는 기존 맵을 버려야 three 가 다시 굽는다.) */
  if (w.moon) {
    const want = rt.IS_MOBILE ? (level < 1 && rt.fxQ === 'high' ? 1024 : 512) : (level < 1 && rt.fxQ === 'high' ? 2048 : 1024);
    const ms = w.moon.shadow.mapSize;
    if (ms.x !== want) {
      ms.set(want, want);
      if (w.moon.shadow.map) { w.moon.shadow.map.dispose(); w.moon.shadow.map = null; }
      _shadowExtent = -1;
    }
  }
  /* 가장 낮은 두 단계에서는 후처리 안개 한 겸을 생략한다(재질 안개가 그대로 남아 룩은 유지된다). */
  rt.qaFadePostK = level >= 3 ? 0 : 1;
  /* v0.40 4단계: 틸트시프트 심도도 같은 레더에 매단다 — 3단계 이하(저사양)에서 자동으로 꺼진다. */
  try { const dp = dofPassOf(); if (dp) dp.setLevel(level); } catch (e) {}
  const bq = level < 2 ? rt.fxQualityFromUrl() : 'low';
  if (w.bloom && w.bloom.quality !== bq && bq !== 'off') {
    w.bloom.setQuality(bq);
    if (w.ink) w.ink.setQuality(bq === 'high' ? 'high' : 'low');
    wireFadeSource();
  }
  const dprSteps = [w.dprCap, w.dprCap, Math.max(1, w.dprCap - 0.25), Math.max(1, w.dprCap - 0.5), 1];
  const d = Math.round(dprSteps[Math.min(level, QL_LEVELS - 1)] * 10) / 10;
  if (Math.abs((w.dprNow || 0) - d) > 0.01) { w.dprNow = d; w.renderer.setPixelRatio(d); rt.onResize(); }
}
function stepQuality(real) {
  const w = rt.three;
  if (!w || !w.renderer || DPR_QUERY || w.fxForced || !w.ql || !(real > 0) || real > 0.5) return;
  const q = w.ql;
  q.t += real;
  if (q.cool > 0) { q.cool -= real; return; }
  const fpsNow = 1 / real;
  q.lowT = fpsNow < rt.CFG.qlLowFps ? q.lowT + real : Math.max(0, q.lowT - real * 0.5);
  q.highT = fpsNow >= rt.CFG.qlHighFps ? q.highT + real : 0;
  if (q.lowT >= rt.CFG.qlDownSec && q.level < QL_LEVELS - 1) {
    if (q.t - q.lastUp < 10) q.lockAt = q.level;
    q.level++; q.lowT = 0; q.highT = 0; q.cool = 2;
    applyQuality(q.level);
  } else if (q.highT >= rt.CFG.qlUpSec && q.level > 0 && q.level - 1 < q.lockAt) {
    q.level--; q.lowT = 0; q.highT = 0; q.cool = 2; q.lastUp = q.t;
    applyQuality(q.level);
  }
}

function addEntityVisual(kind, shape, opt) {
  const group = rt.art.makeChar(kind, shape, opt);
  rt.three.scene.add(group);
  /* v0.39: 캐릭터 파츠는 그림(그림자 재질)이므로 안개를 면제하고 종이 결만 얇게 입힌다.
     혼령·보스는 조준 표적이라 더더욱 어둠에 잠기면 안 된다. */
  try { if (group) rt.paintCard(group, kind === 'spirit' ? 'spirit' : kind === 'item' ? 'item' : 'figure'); } catch (e) {}
  return group;
}
/* 잔상(3D 뼈대 고스트)은 주인공의 지오메트리를 공유한다 — 지오메트리만 놓지 않고 재질만 놓아 준다. */
function disposeCharGeom(g) {
  if (g && g.userData && g.userData.sharedGeom) {
    const mesh = g.userData.sprite;
    mesh.skeleton.dispose();
    mesh.material.dispose();
    return;
  }
  try {
    g.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
  } catch (e) {}
}
function groundYAt(x, z) {
  return (rt.three && rt.three.terrain3d && rt.three.terrain3d.getGroundY) ? rt.three.terrain3d.getGroundY(x, z) : 0;
}
function placeGroup(g, x, z, bob) {
  if (!g) return;   /* 그림 없는 판정용 개체(QA·임시 기물) — 위치를 옮길 몸이 없다 */
  const gy = groundYAt(x, z);
  g.position.set(x, gy + (bob || 0), z);
}

  return { DPR_QUERY, WF_POST, addEntityVisual, disposeCharGeom, dofPassOf, fitShadowFrustum, groundYAt, makeWorld, placeGroup, setupChunkWorld, stepQuality, switchMap, wireFadeSource };
}
