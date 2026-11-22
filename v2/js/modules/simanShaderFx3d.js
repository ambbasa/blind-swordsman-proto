/**
 * v2/js/modules/simanShaderFx3d.js
 * 심안(SIMAN) v0.73 — gdquest-demos/godot-shaders 핵심 3종(3D Dissolve · 3D Shockwave · Force Field)을
 * Three.js WebGL GLSL(ShaderMaterial)로 경량 포팅한 제로-GC 풀링 VFX 엔진.
 *
 * 모바일 60fps 원칙:
 *  - 모든 메시·지오메트리·머티리얼은 초기화 시 1회 생성 후 풀에서 재사용 (런타임 new/dispose 0건)
 *  - 비활성 슬롯은 visible = false로 드로우콜 0
 */
import * as THREE from 'three';

/* ---------- 1. 3D Dissolve (먹재·불씨·금박 테두리 소멸) ---------- */
const DISSOLVE_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DISSOLVE_FRAG = /* glsl */`
precision mediump float;
uniform float uProgress;
uniform float uSeed;
uniform float uEdgeWidth;
uniform vec3 uBodyCol;
uniform vec3 uEdgeCol;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p *= 2.05;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 centered = vUv * 2.0 - 1.0;
  /* 세로로 길쭉한 영혼·도포 실루엣 마스크 */
  float radial = length(vec2(centered.x * 1.25, centered.y * 0.92));
  if (radial > 1.0) discard;
  float n = fbm(vUv * 5.2 + vec2(uSeed, -uProgress * 2.2));
  /* 위쪽으로 타오르며 흩어지는 디졸브 임계값 */
  float dissolve = n * 0.72 + (1.0 - vUv.y) * 0.28;
  float cut = uProgress * 1.15;
  if (dissolve < cut) discard;

  float edge = 1.0 - smoothstep(cut, cut + uEdgeWidth, dissolve);
  float softMask = smoothstep(1.0, 0.28, radial);
  vec3 col = mix(uBodyCol, uEdgeCol * 2.1, edge);
  float alpha = softMask * (1.0 - smoothstep(0.75, 1.0, uProgress)) * (0.68 + 0.32 * edge);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

/* ---------- 2. 3D Shockwave (자세 붕괴·패링·참 파동 충격파) ---------- */
const SHOCK_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SHOCK_FRAG = /* glsl */`
precision mediump float;
uniform float uProgress;
uniform vec3 uColor;
uniform vec3 uCoreColor;
varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0 || r < 0.08) discard;

  /* 중심에서 바깥으로 퍼지는 이중 파동 링 + 잔파 */
  float crest = exp(-pow((r - 0.84) / 0.11, 2.0));
  float inner = exp(-pow((r - 0.62) / 0.14, 2.0)) * 0.48;
  float ripple = (0.5 + 0.5 * sin(r * 34.0 - uProgress * 16.0)) * smoothstep(0.25, 0.85, r) * 0.24;
  float fade = (1.0 - uProgress) * (1.0 - uProgress * 0.45);
  float intensity = (crest + inner + ripple) * fade;
  if (intensity < 0.015) discard;

  vec3 col = mix(uColor, uCoreColor, clamp(crest * 1.15, 0.0, 1.0)) * (1.25 + crest * 0.85);
  gl_FragColor = vec4(col, clamp(intensity * 0.92, 0.0, 0.95));
}
`;

/* ---------- 3. Force Field (청동 거울 보호막 · 보스 기합 결계) ---------- */
const FIELD_VERT = /* glsl */`
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vLocalPos;
void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FIELD_FRAG = /* glsl */`
precision mediump float;
uniform float uTime;
uniform float uOpacity;
uniform float uPulse;
uniform vec3 uColor;
uniform vec3 uRimColor;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vLocalPos;

void main() {
  float ndotv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
  float fresnel = pow(1.0 - clamp(ndotv, 0.0, 1.0), 2.35);

  /* 조선 창살·부적 느낌의 흐르는 격자 문양 */
  float ang = atan(vLocalPos.z, vLocalPos.x);
  float bandY = sin(vLocalPos.y * 16.0 - uTime * 3.2);
  float bandA = sin(ang * 8.0 + vLocalPos.y * 4.0);
  float lattice = smoothstep(0.76, 0.98, abs(bandY * bandA));

  /* 하단 바닥면 자연 페이드 */
  float yMask = smoothstep(-0.85, -0.15, vLocalPos.y);
  float energy = (fresnel * 0.95 + lattice * 0.28 + uPulse * 0.85) * yMask;
  vec3 col = mix(uColor, uRimColor, clamp(fresnel + uPulse * 0.6, 0.0, 1.0)) * (1.05 + uPulse * 1.3);
  float alpha = clamp(energy * uOpacity, 0.0, 0.92);
  if (alpha < 0.015) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

export class SimanShaderFx3D {
  constructor(scene, opts = {}) {
    this.scene = scene;
    const isHigh = opts.quality === 'high';
    this.group = new THREE.Group();
    this.group.name = 'simanShaderFx3D';
    scene.add(this.group);

    /* 1) 3D Dissolve 풀 (8슬롯) */
    const disCap = isHigh ? 8 : 5;
    this._disGeo = new THREE.PlaneGeometry(1.15, 1.75);
    this._dissolves = [];
    for (let i = 0; i < disCap; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: DISSOLVE_VERT,
        fragmentShader: DISSOLVE_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uProgress: { value: 0 },
          uSeed: { value: 1 },
          uEdgeWidth: { value: 0.16 },
          uBodyCol: { value: new THREE.Color(0x1e1a18) },
          uEdgeCol: { value: new THREE.Color(0xff9442) },
        }
      });
      const mesh = new THREE.Mesh(this._disGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this._dissolves.push({ active: false, age: 0, dur: 0.55, rise: 0.9, mesh, mat });
    }

    /* 2) 3D Shockwave 풀 (6슬롯) */
    const shCap = isHigh ? 6 : 4;
    this._shockGeo = new THREE.PlaneGeometry(2, 2);
    this._shockGeo.rotateX(-Math.PI * 0.5);
    this._shocks = [];
    for (let i = 0; i < shCap; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: SHOCK_VERT,
        fragmentShader: SHOCK_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uProgress: { value: 0 },
          uColor: { value: new THREE.Color(0xffd258) },
          uCoreColor: { value: new THREE.Color(0xfffbe0) },
        }
      });
      const mesh = new THREE.Mesh(this._shockGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.group.add(mesh);
      this._shocks.push({ active: false, age: 0, dur: 0.45, r0: 0.8, r1: 5.5, mesh, mat });
    }

    /* 3) Force Field — 영웅 청동 거울 상시 보호막 + 보스/갑옷 펄스 풀(3슬롯) */
    this._fieldGeo = new THREE.SphereGeometry(1.0, 20, 14);
    this._heroShieldMat = new THREE.ShaderMaterial({
      vertexShader: FIELD_VERT,
      fragmentShader: FIELD_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.52 },
        uPulse: { value: 0 },
        uColor: { value: new THREE.Color(0x52d4b8) },
        uRimColor: { value: new THREE.Color(0xf6e2a2) },
      }
    });
    this._heroShield = new THREE.Mesh(this._fieldGeo, this._heroShieldMat);
    this._heroShield.visible = false;
    this._heroShield.scale.set(0.95, 1.15, 0.95);
    this._heroShield.renderOrder = 9;
    this.group.add(this._heroShield);
    this._heroPulse = 0;

    this._barriers = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: FIELD_VERT,
        fragmentShader: FIELD_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0.72 },
          uPulse: { value: 0.8 },
          uColor: { value: new THREE.Color(0xd83a32) },
          uRimColor: { value: new THREE.Color(0xffc670) },
        }
      });
      const mesh = new THREE.Mesh(this._fieldGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 9;
      this.group.add(mesh);
      this._barriers.push({ active: false, age: 0, dur: 0.55, r0: 1.1, r1: 2.0, mesh, mat });
    }
    this._t = 0;
  }

  /** 원귀·보스 처치 시 먹재·불씨 3D 디졸브 소멸 연출 */
  spawnDissolve(x, z, opts = {}) {
    let slot = null;
    for (let i = 0; i < this._dissolves.length; i++) {
      if (!this._dissolves[i].active) { slot = this._dissolves[i]; break; }
    }
    if (!slot) slot = this._dissolves[0];
    slot.active = true;
    slot.age = 0;
    slot.dur = opts.dur || 0.52;
    slot.rise = opts.rise != null ? opts.rise : 0.85;
    const sc = opts.scale || 1.0;
    slot.mesh.position.set(x, 0.85 * sc, z);
    slot.mesh.scale.set(sc, sc, sc);
    slot.mesh.rotation.y = Math.random() * Math.PI * 2;
    slot.mesh.visible = true;
    const u = slot.mat.uniforms;
    u.uProgress.value = 0;
    u.uSeed.value = Math.random() * 50;
    u.uBodyCol.value.setHex(opts.bodyHex != null ? opts.bodyHex : 0x1e1816);
    u.uEdgeCol.value.setHex(opts.edgeHex != null ? opts.edgeHex : 0xff9a44);
  }

  /** 자세 붕괴·패링·참(O) 발동 시 3D 원형 충격파 */
  spawnShockwave(x, z, opts = {}) {
    let slot = null;
    for (let i = 0; i < this._shocks.length; i++) {
      if (!this._shocks[i].active) { slot = this._shocks[i]; break; }
    }
    if (!slot) slot = this._shocks[0];
    slot.active = true;
    slot.age = 0;
    slot.dur = opts.dur || 0.42;
    slot.r0 = opts.r0 != null ? opts.r0 : 0.7;
    slot.r1 = opts.r1 != null ? opts.r1 : 5.6;
    slot.mesh.position.set(x, opts.y != null ? opts.y : 0.16, z);
    slot.mesh.scale.setScalar(slot.r0);
    slot.mesh.visible = true;
    const u = slot.mat.uniforms;
    u.uProgress.value = 0;
    u.uColor.value.setHex(opts.colorHex != null ? opts.colorHex : 0xffd258);
    u.uCoreColor.value.setHex(opts.coreHex != null ? opts.coreHex : 0xfffce4);
  }

  /** 청동 거울 보호막 위치·활성화 동기화 (타격 방어 시 hitPulse=1) */
  syncHeroShield(x, z, active, hitPulse) {
    if (hitPulse) this._heroPulse = 1.0;
    if (!active && this._heroPulse <= 0.01) {
      this._heroShield.visible = false;
      return;
    }
    this._heroShield.visible = true;
    this._heroShield.position.set(x, 1.05, z);
    const s = 0.96 + this._heroPulse * 0.42;
    this._heroShield.scale.set(s, s * 1.18, s);
    this._heroShieldMat.uniforms.uOpacity.value = active ? 0.50 : (this._heroPulse * 0.85);
    this._heroShieldMat.uniforms.uPulse.value = this._heroPulse;
  }

  /** 보스 기합 방어·갑옷 파훼 순간 영력 결계 돔 펄스 */
  spawnBarrierPulse(x, z, opts = {}) {
    let slot = null;
    for (let i = 0; i < this._barriers.length; i++) {
      if (!this._barriers[i].active) { slot = this._barriers[i]; break; }
    }
    if (!slot) slot = this._barriers[0];
    slot.active = true;
    slot.age = 0;
    slot.dur = opts.dur || 0.48;
    slot.r0 = opts.r0 != null ? opts.r0 : 1.15;
    slot.r1 = opts.r1 != null ? opts.r1 : 2.15;
    slot.mesh.position.set(x, opts.y != null ? opts.y : 1.15, z);
    slot.mesh.scale.setScalar(slot.r0);
    slot.mesh.visible = true;
    const u = slot.mat.uniforms;
    u.uColor.value.setHex(opts.colorHex != null ? opts.colorHex : 0xd83a32);
    u.uRimColor.value.setHex(opts.rimHex != null ? opts.rimHex : 0xffcc6e);
    u.uOpacity.value = 0.78;
    u.uPulse.value = 1.0;
  }

  update(dt, camera) {
    const d = Math.min(0.05, Math.max(0, Number(dt || 0.016)));
    this._t += d;

    if (this._heroPulse > 0) {
      this._heroPulse = Math.max(0, this._heroPulse - d * 2.8);
    }
    if (this._heroShield.visible) {
      this._heroShieldMat.uniforms.uTime.value = this._t;
    }

    for (let i = 0; i < this._dissolves.length; i++) {
      const s = this._dissolves[i];
      if (!s.active) continue;
      s.age += d;
      const p = s.age / s.dur;
      if (p >= 1) { s.active = false; s.mesh.visible = false; continue; }
      s.mat.uniforms.uProgress.value = p;
      s.mesh.position.y += s.rise * d;
      if (camera) s.mesh.quaternion.copy(camera.quaternion);
    }

    for (let i = 0; i < this._shocks.length; i++) {
      const s = this._shocks[i];
      if (!s.active) continue;
      s.age += d;
      const p = s.age / s.dur;
      if (p >= 1) { s.active = false; s.mesh.visible = false; continue; }
      const ease = 1 - Math.pow(1 - p, 2.4);
      s.mesh.scale.setScalar(s.r0 + (s.r1 - s.r0) * ease);
      s.mat.uniforms.uProgress.value = p;
    }

    for (let i = 0; i < this._barriers.length; i++) {
      const b = this._barriers[i];
      if (!b.active) continue;
      b.age += d;
      const p = b.age / b.dur;
      if (p >= 1) { b.active = false; b.mesh.visible = false; continue; }
      const ease = 1 - Math.pow(1 - p, 2.0);
      b.mesh.scale.setScalar(b.r0 + (b.r1 - b.r0) * ease);
      b.mat.uniforms.uTime.value = this._t;
      b.mat.uniforms.uOpacity.value = 0.78 * (1 - p);
      b.mat.uniforms.uPulse.value = Math.max(0, 1 - p * 1.6);
    }
  }

  dispose() {
    this._disGeo.dispose();
    this._shockGeo.dispose();
    this._fieldGeo.dispose();
    this._heroShieldMat.dispose();
    this._dissolves.forEach((s) => s.mat.dispose());
    this._shocks.forEach((s) => s.mat.dispose());
    this._barriers.forEach((b) => b.mat.dispose());
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
