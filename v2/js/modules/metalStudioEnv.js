/* v2/js/modules/metalStudioEnv.js — 3d-metal-material 기반 PMREM 다크 HDR 스튜디오 반사 환경
   Three.js r170+ 규칙: metalness 1.0 + 선형 F0 색 + 명시적 mat.envMap 바인딩(scene.environment만 쓰면 envMapIntensity 무시됨). */
import * as THREE from 'three';

const _envCache = new WeakMap();

/** 렌더러당 1회만 다크 HDR 스튜디오 카드 룸을 PMREM 큐브맵으로 베이킹해 캐시합니다. */
export function getMetalStudioEnv(renderer) {
  if (!renderer) return null;
  if (_envCache.has(renderer)) return _envCache.get(renderer);
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color().setRGB(0.045, 0.050, 0.060, THREE.LinearSRGBColorSpace);

    const addCard = (w, h, pos, lookAt, r, g, b) => {
      const m = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace),
        toneMapped: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.lookAt(lookAt[0], lookAt[1], lookAt[2]);
      envScene.add(mesh);
    };

    /* 주 창문 카드 (4x3 격자 느낌의 밝은 HDR 하이라이트) */
    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = 0; iy <= 1; iy++) {
        addCard(1.08, 1.20, [-5.0 + ix * 1.32, 3.6 + iy * 1.48, 4.8], [0, 0, 0], 3.8, 3.55, 3.05);
      }
    }
    /* 차가운 측면 반사 카드 */
    addCard(3.0, 5.4, [6.0, 1.6, 2.0], [0, 0, 0], 0.52, 0.68, 0.90);
    /* 따뜻한 후면 림 카드 */
    addCard(2.2, 4.6, [2.5, 2.2, -5.5], [0, 0, 0], 1.50, 1.22, 0.88);
    /* 상단 은은한 천장 카드 */
    addCard(7.5, 2.2, [0.0, 6.0, 0.0], [0, 0, 0], 0.52, 0.55, 0.60);
    /* 바닥 반사 바운스 */
    addCard(9.0, 9.0, [0.0, -4.0, 0.0], [0, 0, 0], 0.18, 0.12, 0.07);

    const rt = pmrem.fromScene(envScene, 0.006);
    const tex = rt.texture;
    pmrem.dispose();
    envScene.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
    _envCache.set(renderer, tex);
    return tex;
  } catch (_) {
    return null;
  }
}

/** 실제 도체(강철/황동/금) PBR 설정을 무기 메시 재질에 일괄 적용합니다. */
export function applyForgedMetal(mat, renderer, opts = {}) {
  if (!mat) return mat;
  const f0 = opts.f0 || [0.56, 0.57, 0.58]; /* 강철 선형 F0 */
  mat.metalness = opts.metalness != null ? opts.metalness : 1.0;
  mat.roughness = opts.roughness != null ? opts.roughness : 0.24;
  if (mat.color && mat.color.setRGB) {
    mat.color.setRGB(f0[0], f0[1], f0[2], THREE.LinearSRGBColorSpace);
  }
  const env = getMetalStudioEnv(renderer);
  if (env) {
    mat.envMap = env;
    mat.envMapIntensity = opts.envMapIntensity != null ? opts.envMapIntensity : 0.94;
  }
  mat.needsUpdate = true;
  return mat;
}
