/**
 * v2/js/modules/simanVfx3d.js
 * 심안(SIMAN) v0.60 — 스킬 기반 3D 전투 VFX 통합 엔진
 * 적용 스킬:
 *  - lightning-energy-skill-vfx: 계층 분기 번개(트렁크→분기→잔가지, 30Hz 리롤·애프터글로우),
 *    마른 붓 먹물 잔상 빌로우(NormalBlending), 속도 궤적 불꽃 스파크, 2톤 수묵 임팩트 프레임(초당 3회 제한)
 *  - game-dev-combat-skill-polish: 카메라 대응 3D 먹·주홍 회전 소용돌이(참/횡참/패링)
 *  - game-perf: 전 버퍼 사전 풀링(매 프레임 new Geometry/Material 할당 0)
 */
import * as THREE from 'three';

/* ---------- 1) 3D 수묵·주홍 회전 검기 소용돌이 셰이더 ---------- */
const SWIRL_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SWIRL_FRAG = /* glsl */`
uniform float uProgress;
uniform float uSeed;
uniform vec3 uInkCol;
uniform vec3 uAccentCol;
varying vec2 vUv;

float h21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.12);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
    mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 0.98) discard;
  float ang = atan(p.y, p.x);
  float spin = ang + uProgress * 6.8 + r * 3.6 + uSeed;
  /* 마른 붓 결(방사형 갈필 스트로크) */
  float bristle = vnoise(vec2(spin * 2.4, r * 14.0 + uSeed));
  float fine = vnoise(vec2(spin * 6.2, r * 26.0 - uProgress * 4.0));
  float ring = smoothstep(0.18 + uProgress * 0.25, 0.56 + uProgress * 0.14, r)
             * (1.0 - smoothstep(0.68, 0.98, r));
  float arcMask = smoothstep(-0.35, 0.65, sin(spin * 2.0 + bristle * 1.4));
  float stroke = ring * (0.45 + 0.55 * arcMask) * smoothstep(0.24, 0.78, bristle * 0.7 + fine * 0.35);
  float lifeFade = smoothstep(0.0, 0.10, uProgress) * (1.0 - smoothstep(0.52, 1.0, uProgress));
  float alpha = clamp(stroke * lifeFade * 1.35, 0.0, 0.92);
  if (alpha < 0.015) discard;
  /* 안쪽은 선명한 주홍/비취 검기 핵, 바깥은 깊은 먹물 갈필 */
  float coreBand = smoothstep(0.55, 0.85, fine) * smoothstep(0.82, 0.32, r);
  vec3 col = mix(uInkCol, uAccentCol, clamp(coreBand * 1.15 + (1.0 - uProgress) * 0.35, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ---------- 2) 마른 붓 먹물 잔상 빌로우 셰이더 (NormalBlending으로 한지 위 먹연기 표현) ---------- */
const BILLOW_VERT = /* glsl */`
attribute vec3 aPos;
attribute float aScale;
attribute float aAlpha;
attribute float aRot;
varying vec2 vUv;
varying float vAlpha;
varying float vRot;
void main() {
  vUv = uv;
  vAlpha = aAlpha;
  vRot = aRot;
  if (aAlpha <= 0.005) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  float c = cos(aRot), s = sin(aRot);
  vec2 q = (uv - 0.5);
  vec2 rq = vec2(q.x * c - q.y * s, q.x * s + q.y * c) * aScale;
  mv.xy += rq;
  gl_Position = projectionMatrix * mv;
}
`;

const BILLOW_FRAG = /* glsl */`
varying vec2 vUv;
varying float vAlpha;
varying float vRot;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 0.98) discard;
  float n1 = vn(vUv * 5.5 + vRot);
  float n2 = vn(vUv * 13.0 - vRot * 1.4);
  float fray = 1.0 - smoothstep(0.32, 0.96, r + (n1 - 0.5) * 0.42 + (n2 - 0.5) * 0.22);
  float a = fray * vAlpha;
  if (a < 0.015) discard;
  /* 단색 검정 대신 먹물 농담 결 (lightning-energy-skill-vfx: never flat black) */
  vec3 col = mix(vec3(0.03, 0.032, 0.042), vec3(0.11, 0.10, 0.095), n1 * 0.7 + n2 * 0.3);
  gl_FragColor = vec4(col, a);
}
`;

/* ---------- 3) 번개 세그먼트 계층 생성기 (lightning-energy-skill-vfx midpoint displacement) ---------- */
function subdivideBolt(ax, ay, az, bx, by, bz, levels, jag, outPairs, maxPairs) {
  let pts = [[ax, ay, az], [bx, by, bz]];
  let amp = jag;
  for (let lv = 0; lv < levels; lv++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      /* 32~68% 비대칭 분할로 인공적인 균일 톱니 방지 */
      const u = 0.32 + Math.random() * 0.36;
      const mx = p0[0] + (p1[0] - p0[0]) * u;
      const my = p0[1] + (p1[1] - p0[1]) * u;
      const mz = p0[2] + (p1[2] - p0[2]) * u;
      const segLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const off = segLen * amp * (lv === 0 ? 0.65 : 1.0);
      next.push([
        mx + (Math.random() - 0.5) * 2.0 * off,
        Math.max(0.06, my + (Math.random() - 0.45) * 1.4 * off),
        mz + (Math.random() - 0.5) * 2.0 * off,
      ]);
      next.push(p1);
    }
    pts = next;
    amp *= 0.58; /* 0.5 대신 0.58 감쇠로 잔가지 결 유지 */
  }
  for (let i = 0; i < pts.length - 1 && outPairs.length < maxPairs; i++) {
    outPairs.push(pts[i], pts[i + 1]);
  }
  return pts;
}

function generateLightningTree(from, to, opts) {
  const maxPairs = 140;
  const trunkPairs = [];
  const forkPairs = [];
  const dx = to.x - from.x, dy = (to.y || 0.9) - (from.y || 0.9), dz = to.z - from.z;
  const len = Math.max(0.4, Math.hypot(dx, dy, dz));
  const levels = len > 3.0 ? 4 : 3;
  const jag = opts.jag || 0.28;
  const trunkPts = subdivideBolt(
    from.x, from.y != null ? from.y : 1.0, from.z,
    to.x, to.y != null ? to.y : 0.15, to.z,
    levels, jag, trunkPairs, maxPairs
  );

  /* 1차 분기 + 2차 잔가지 */
  const forkCount = Math.min(6, Math.max(2, Math.floor(1.5 + len * 0.7)));
  for (let f = 0; f < forkCount; f++) {
    const idx = Math.floor((0.15 + Math.random() * 0.70) * (trunkPts.length - 1));
    const o = trunkPts[idx];
    const dirA = Math.atan2(dz, dx) + (Math.random() < 0.5 ? 1 : -1) * (0.35 + Math.random() * 0.65);
    const fLen = len * (0.16 + Math.random() * 0.34);
    const tx = o[0] + Math.cos(dirA) * fLen;
    const ty = Math.max(0.06, o[1] + (Math.random() - 0.6) * fLen * 0.45);
    const tz = o[2] + Math.sin(dirA) * fLen;
    const fPts = subdivideBolt(o[0], o[1], o[2], tx, ty, tz, 2, jag * 1.25, forkPairs, maxPairs);
    /* 잔가지 1개 */
    if (fPts.length >= 3 && Math.random() < 0.7) {
      const o2 = fPts[Math.floor(fPts.length * 0.5)];
      const a2 = dirA + (Math.random() < 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.55);
      const l2 = fLen * (0.28 + Math.random() * 0.32);
      subdivideBolt(o2[0], o2[1], o2[2], o2[0] + Math.cos(a2) * l2, Math.max(0.05, o2[1] - 0.15), o2[2] + Math.sin(a2) * l2, 1, jag * 1.4, forkPairs, maxPairs);
    }
  }
  return { trunkPairs, forkPairs };
}

export class SimanVfx3D {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.quality = opts.quality || 'high';
    this.group = new THREE.Group();
    this.group.name = 'siman-vfx-3d';
    if (scene) scene.add(this.group);

    this._elapsed = 0;
    this._tickAccum = 0;

    /* --- 풀 1: 계층 분기 번개 (트렁크 코어 + 글로우 2레이어, 단일 LineSegments 버퍼) --- */
    const MAX_BOLT_VERTS = this.quality === 'high' ? 1800 : 900;
    this._maxBoltVerts = MAX_BOLT_VERTS;
    this._corePos = new Float32Array(MAX_BOLT_VERTS * 3);
    this._coreCol = new Float32Array(MAX_BOLT_VERTS * 3);
    this._coreGeo = new THREE.BufferGeometry();
    this._coreGeo.setAttribute('position', new THREE.BufferAttribute(this._corePos, 3));
    this._coreGeo.setAttribute('color', new THREE.BufferAttribute(this._coreCol, 3));
    this._coreGeo.setDrawRange(0, 0);
    this._coreMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.98,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._coreLines = new THREE.LineSegments(this._coreGeo, this._coreMat);
    this._coreLines.frustumCulled = false;
    this._coreLines.renderOrder = 8;
    this.group.add(this._coreLines);
    this._bolts = [];

    /* --- 풀 2: 속도 궤적 불꽃 스파크 (단일 LineSegments, 120개 풀링) --- */
    const MAX_SPARKS = this.quality === 'high' ? 120 : 64;
    this._maxSparks = MAX_SPARKS;
    this._sparks = [];
    for (let i = 0; i < MAX_SPARKS; i++) {
      this._sparks.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0.4, r: 1, g: 0.8, b: 0.3 });
    }
    this._sparkPos = new Float32Array(MAX_SPARKS * 2 * 3);
    this._sparkCol = new Float32Array(MAX_SPARKS * 2 * 3);
    this._sparkGeo = new THREE.BufferGeometry();
    this._sparkGeo.setAttribute('position', new THREE.BufferAttribute(this._sparkPos, 3));
    this._sparkGeo.setAttribute('color', new THREE.BufferAttribute(this._sparkCol, 3));
    this._sparkGeo.setDrawRange(0, 0);
    this._sparkMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.96,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._sparkLines = new THREE.LineSegments(this._sparkGeo, this._sparkMat);
    this._sparkLines.frustumCulled = false;
    this._sparkLines.renderOrder = 8;
    this.group.add(this._sparkLines);

    /* --- 풀 3: 마른 붓 먹물 잔상 빌로우 (InstancedBufferGeometry 1드로우콜, NormalBlending) --- */
    const MAX_BILLOWS = this.quality === 'high' ? 48 : 24;
    this._maxBillows = MAX_BILLOWS;
    this._billows = [];
    for (let i = 0; i < MAX_BILLOWS; i++) {
      this._billows.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0.45, s0: 0.6, s1: 1.5, rot: 0, vrot: 0 });
    }
    const baseQ = new THREE.PlaneGeometry(1, 1);
    this._billowGeo = new THREE.InstancedBufferGeometry();
    this._billowGeo.index = baseQ.index;
    this._billowGeo.setAttribute('position', baseQ.getAttribute('position'));
    this._billowGeo.setAttribute('uv', baseQ.getAttribute('uv'));
    this._bPos = new Float32Array(MAX_BILLOWS * 3);
    this._bScale = new Float32Array(MAX_BILLOWS);
    this._bAlpha = new Float32Array(MAX_BILLOWS);
    this._bRot = new Float32Array(MAX_BILLOWS);
    this._billowGeo.setAttribute('aPos', new THREE.InstancedBufferAttribute(this._bPos, 3));
    this._billowGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(this._bScale, 1));
    this._billowGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this._bAlpha, 1));
    this._billowGeo.setAttribute('aRot', new THREE.InstancedBufferAttribute(this._bRot, 1));
    this._billowGeo.instanceCount = MAX_BILLOWS;
    this._billowBase = baseQ;
    this._billowMat = new THREE.ShaderMaterial({
      vertexShader: BILLOW_VERT, fragmentShader: BILLOW_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this._billowMesh = new THREE.Mesh(this._billowGeo, this._billowMat);
    this._billowMesh.frustumCulled = false;
    this._billowMesh.renderOrder = 5;
    this.group.add(this._billowMesh);

    /* --- 풀 4: 3D 수묵·주홍 회전 검기 소용돌이 (최대 6개 재사용) --- */
    this._swirlGeo = new THREE.PlaneGeometry(1, 1);
    this._swirlGeo.rotateX(-Math.PI / 2);
    this._swirls = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: SWIRL_VERT, fragmentShader: SWIRL_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          uProgress: { value: 1 },
          uSeed: { value: i * 1.7 },
          uInkCol: { value: new THREE.Color(0x161416) },
          uAccentCol: { value: new THREE.Color(0xe64830) },
        },
      });
      const mesh = new THREE.Mesh(this._swirlGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 6;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this._swirls.push({ active: false, mesh, mat, age: 0, dur: 0.42, r0: 2.0, r1: 4.2 });
    }

    /* --- 2톤 수묵 임팩트 프레임 상태 (초당 최대 3회 안전 캡) --- */
    this._impact = { t: 0, dur: 0, seed: 1, mode: 'center', safe: false };
    this._flashTimes = [];
  }

  /** 계층 분기 번개 생성 (30Hz 리롤·홀드·애프터글로우) */
  spawnLightning(from, to, opts = {}) {
    if (!from || !to) return;
    const color = new THREE.Color(opts.color != null ? opts.color : 0x6ea8ff);
    const core = new THREE.Color(opts.core != null ? opts.core : 0xf2f8ff);
    const tree = generateLightningTree(from, to, opts);
    this._bolts.push({
      from: { x: from.x, y: from.y != null ? from.y : 1.0, z: from.z },
      to: { x: to.x, y: to.y != null ? to.y : 0.18, z: to.z },
      opts,
      tree,
      color,
      core,
      age: 0,
      hold: opts.hold != null ? opts.hold : 0.14,
      fade: opts.fade != null ? opts.fade : 0.18,
      rerollEvery: opts.rerollEvery != null ? opts.rerollEvery : 0.066,
      nextReroll: 0.066,
    });
    if (this._bolts.length > 14) this._bolts.shift();
    /* 접지 스파크 동반 */
    this.spawnSparks(to.x, to.z, opts.sparks != null ? opts.sparks : 10, {
      y: to.y != null ? to.y : 0.25,
      color: opts.sparkColor || 0xffa84c,
      speed: 5.5,
    });
  }

  /** 3D 수묵·주홍 회전 검기 소용돌이 */
  spawnSwirl(x, z, opts = {}) {
    let slot = null;
    for (let i = 0; i < this._swirls.length; i++) {
      if (!this._swirls[i].active) { slot = this._swirls[i]; break; }
    }
    if (!slot) slot = this._swirls[0];
    slot.active = true;
    slot.age = 0;
    slot.dur = opts.dur || 0.42;
    slot.r0 = opts.r0 || 2.2;
    slot.r1 = opts.r1 || 5.2;
    slot.mesh.visible = true;
    slot.mesh.position.set(x, opts.y != null ? opts.y : 0.28, z);
    slot.mesh.rotation.y = Math.random() * Math.PI * 2;
    slot.mat.uniforms.uProgress.value = 0;
    slot.mat.uniforms.uSeed.value = Math.random() * 20;
    slot.mat.uniforms.uInkCol.value.setHex(opts.inkHex != null ? opts.inkHex : 0x181518);
    slot.mat.uniforms.uAccentCol.value.setHex(opts.accentHex != null ? opts.accentHex : 0xe84a32);
  }

  /** 속도 궤적 불꽃 스파크 (중력 + 바닥 바운스) */
  spawnSparks(x, z, count = 12, opts = {}) {
    if (!this._tmpCol) this._tmpCol = new THREE.Color();
    const col = this._tmpCol.set(opts.color != null ? opts.color : 0xffaa44);
    const y0 = opts.y != null ? opts.y : 0.65;
    const spd = opts.speed || 6.0;
    let spawned = 0;
    for (let i = 0; i < this._maxSparks && spawned < count; i++) {
      const s = this._sparks[i];
      if (s.active) continue;
      const a = Math.random() * Math.PI * 2;
      const sp = spd * (0.45 + Math.random() * 0.85);
      s.active = true;
      s.x = x + (Math.random() - 0.5) * 0.35;
      s.y = y0 + Math.random() * 0.3;
      s.z = z + (Math.random() - 0.5) * 0.35;
      s.vx = Math.cos(a) * sp;
      s.vy = 2.2 + Math.random() * 4.4;
      s.vz = Math.sin(a) * sp;
      s.age = 0;
      s.life = 0.28 + Math.random() * 0.28;
      s.r = col.r; s.g = col.g; s.b = col.b;
      spawned++;
    }
  }

  /** 일섬·돌진 경로를 따라 남는 마른 붓 먹물 잔상 빌로우 */
  spawnInkTrail(from, to, count = 5) {
    if (!from || !to) return;
    let spawned = 0;
    for (let step = 0; step < count; step++) {
      const u = (step + 0.5) / count;
      const bx = from.x + (to.x - from.x) * u;
      const bz = from.z + (to.z - from.z) * u;
      for (let i = 0; i < this._maxBillows; i++) {
        const b = this._billows[i];
        if (b.active) continue;
        b.active = true;
        b.x = bx + (Math.random() - 0.5) * 0.45;
        b.y = 0.45 + Math.random() * 0.7;
        b.z = bz + (Math.random() - 0.5) * 0.45;
        b.vx = (from.x - to.x) * 0.12 + (Math.random() - 0.5) * 0.8;
        b.vy = 0.45 + Math.random() * 0.55;
        b.vz = (from.z - to.z) * 0.12 + (Math.random() - 0.5) * 0.8;
        b.age = 0;
        b.life = 0.34 + Math.random() * 0.22;
        b.s0 = 0.65 + Math.random() * 0.35;
        b.s1 = 1.65 + Math.random() * 0.6;
        b.rot = Math.random() * Math.PI * 2;
        b.vrot = (Math.random() - 0.5) * 2.2;
        spawned++;
        break;
      }
      if (spawned >= count) break;
    }
  }

  /** 2톤 수묵 집중선 임팩트 프레임 트리거 (WCAG 안전 캡: 초당 최대 3회) */
  triggerImpactFrame(opts = {}) {
    const now = this._elapsed;
    while (this._flashTimes.length && now - this._flashTimes[0] > 1.0) this._flashTimes.shift();
    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const safe = !!(opts.safe || reduced || this._flashTimes.length >= 3);
    if (!safe) this._flashTimes.push(now);
    this._impact.dur = Math.min(0.11, opts.dur || 0.075);
    this._impact.t = this._impact.dur;
    this._impact.seed = Math.floor(Math.random() * 9999) + 1;
    this._impact.mode = opts.mode || 'center';
    this._impact.safe = safe;
  }

  /** 2D HUD 캔버스 위에 수묵 집중선 임팩트 프레임 드로우 */
  drawImpactFrame(ctx, w, h, dt) {
    const im = this._impact;
    if (!ctx || im.t <= 0) return;
    im.t = Math.max(0, im.t - Math.min(0.05, dt || 0.016));
    const k = im.dur > 0 ? im.t / im.dur : 0;
    if (k <= 0.01) return;
    ctx.save();
    if (im.safe) {
      /* 안전 모드: 섬광 대신 은은한 먹빛 수축 비네트 */
      ctx.fillStyle = 'rgba(12, 10, 14, ' + (0.24 * k).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      return;
    }
    const cx = w * 0.5, cy = h * 0.52;
    const maxR = Math.hypot(w, h) * 0.65;
    /* 가장자리 짧은 먹빛 방사형 집중선 (tapered manga ink speed lines) */
    const rays = 48;
    ctx.fillStyle = 'rgba(14, 12, 16, ' + (0.58 * k).toFixed(3) + ')';
    for (let i = 0; i < rays; i++) {
      const h1 = Math.sin((i + im.seed) * 12.9898) * 43758.5453;
      const r1 = h1 - Math.floor(h1);
      if (r1 > 0.52) continue;
      const a = (i / rays) * Math.PI * 2 + r1 * 0.08;
      const innerR = maxR * (0.42 + r1 * 0.24);
      const halfW = 0.010 + r1 * 0.022;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
      ctx.lineTo(cx + Math.cos(a - halfW) * maxR, cy + Math.sin(a - halfW) * maxR);
      ctx.lineTo(cx + Math.cos(a + halfW) * maxR, cy + Math.sin(a + halfW) * maxR);
      ctx.closePath();
      ctx.fill();
    }
    /* 중앙 한지빛 미세 잔광 링 */
    const g = ctx.createRadialGradient(cx, cy, maxR * 0.22, cx, cy, maxR * 0.85);
    g.addColorStop(0, 'rgba(248, 240, 224, ' + (0.14 * k).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(14, 12, 16, ' + (0.28 * k).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  update(dt) {
    const d = Math.min(0.05, Number(dt || 0.016));
    this._elapsed += d;

    /* 1) 번개 30Hz 리롤 & 버퍼 패킹 */
    let bv = 0;
    for (let i = this._bolts.length - 1; i >= 0; i--) {
      const b = this._bolts[i];
      b.age += d;
      const total = b.hold + b.fade;
      if (b.age >= total) { this._bolts.splice(i, 1); continue; }
      if (b.age < b.hold && b.age >= b.nextReroll) {
        b.nextReroll += b.rerollEvery;
        b.tree = generateLightningTree(b.from, b.to, b.opts);
      }
      const bright = b.age < b.hold
        ? 1.0
        : Math.pow(1.0 - (b.age - b.hold) / Math.max(0.01, b.fade), 1.6);
      const pushPairs = (pairs, col, scale) => {
        for (let j = 0; j < pairs.length && bv + 2 <= this._maxBoltVerts; j += 2) {
          const p0 = pairs[j], p1 = pairs[j + 1];
          const o = bv * 3;
          this._corePos[o] = p0[0]; this._corePos[o + 1] = p0[1]; this._corePos[o + 2] = p0[2];
          this._corePos[o + 3] = p1[0]; this._corePos[o + 4] = p1[1]; this._corePos[o + 5] = p1[2];
          const r = col.r * bright * scale, g = col.g * bright * scale, bl = col.b * bright * scale;
          this._coreCol[o] = r; this._coreCol[o + 1] = g; this._coreCol[o + 2] = bl;
          this._coreCol[o + 3] = r; this._coreCol[o + 4] = g; this._coreCol[o + 5] = bl;
          bv += 2;
        }
      };
      pushPairs(b.tree.trunkPairs, b.core, 1.35);
      pushPairs(b.tree.forkPairs, b.color, 0.85);
    }
    this._coreGeo.setDrawRange(0, bv);
    if (bv > 0) {
      this._coreGeo.attributes.position.needsUpdate = true;
      this._coreGeo.attributes.color.needsUpdate = true;
    }

    /* 2) 속도 궤적 불꽃 스파크 업데이트 */
    let sv = 0;
    for (let i = 0; i < this._maxSparks; i++) {
      const s = this._sparks[i];
      if (!s.active) continue;
      s.age += d;
      if (s.age >= s.life) { s.active = false; continue; }
      s.vy -= 9.8 * d;
      const drag = Math.max(0, 1 - 1.2 * d);
      s.vx *= drag; s.vy *= drag; s.vz *= drag;
      s.x += s.vx * d; s.y += s.vy * d; s.z += s.vz * d;
      if (s.y < 0.04) { s.y = 0.04; s.vy = Math.abs(s.vy) * 0.35; s.vx *= 0.72; s.vz *= 0.72; }
      const u = 1.0 - s.age / s.life;
      const tail = 0.028;
      const o = sv * 3;
      this._sparkPos[o] = s.x; this._sparkPos[o + 1] = s.y; this._sparkPos[o + 2] = s.z;
      this._sparkPos[o + 3] = s.x - s.vx * tail; this._sparkPos[o + 4] = Math.max(0.02, s.y - s.vy * tail); this._sparkPos[o + 5] = s.z - s.vz * tail;
      /* 흰뜨거움 → 주황 → 진홍 냉각 */
      const cr = Math.min(1, s.r * (0.65 + 0.65 * u));
      const cg = Math.min(1, s.g * u * u);
      const cb = Math.min(1, s.b * u * u * u);
      this._sparkCol[o] = cr; this._sparkCol[o + 1] = cg; this._sparkCol[o + 2] = cb;
      this._sparkCol[o + 3] = cr * 0.4; this._sparkCol[o + 4] = cg * 0.3; this._sparkCol[o + 5] = cb * 0.2;
      sv += 2;
    }
    this._sparkGeo.setDrawRange(0, sv);
    if (sv > 0) {
      this._sparkGeo.attributes.position.needsUpdate = true;
      this._sparkGeo.attributes.color.needsUpdate = true;
    }

    /* 3) 마른 붓 먹물 잔상 빌로우 업데이트 */
    let bDirty = false;
    for (let i = 0; i < this._maxBillows; i++) {
      const b = this._billows[i];
      if (!b.active) {
        if (this._bAlpha[i] !== 0) { this._bAlpha[i] = 0; bDirty = true; }
        continue;
      }
      b.age += d;
      if (b.age >= b.life) { b.active = false; this._bAlpha[i] = 0; bDirty = true; continue; }
      const u = b.age / b.life;
      b.x += b.vx * d; b.y += b.vy * d; b.z += b.vz * d;
      b.rot += b.vrot * d;
      this._bPos[i * 3] = b.x; this._bPos[i * 3 + 1] = b.y; this._bPos[i * 3 + 2] = b.z;
      this._bScale[i] = b.s0 + (b.s1 - b.s0) * Math.sqrt(u);
      this._bAlpha[i] = Math.sin(Math.min(1, u * 4.0) * Math.PI * 0.5) * (1.0 - u) * 0.46;
      this._bRot[i] = b.rot;
      bDirty = true;
    }
    if (bDirty) {
      this._billowGeo.attributes.aPos.needsUpdate = true;
      this._billowGeo.attributes.aScale.needsUpdate = true;
      this._billowGeo.attributes.aAlpha.needsUpdate = true;
      this._billowGeo.attributes.aRot.needsUpdate = true;
    }

    /* 4) 3D 회전 검기 소용돌이 업데이트 */
    for (let i = 0; i < this._swirls.length; i++) {
      const sw = this._swirls[i];
      if (!sw.active) continue;
      sw.age += d;
      const p = sw.age / sw.dur;
      if (p >= 1) { sw.active = false; sw.mesh.visible = false; continue; }
      const ease = 1 - Math.pow(1 - p, 2.2);
      const rad = sw.r0 + (sw.r1 - sw.r0) * ease;
      sw.mesh.scale.set(rad * 2, 1, rad * 2);
      sw.mat.uniforms.uProgress.value = p;
    }
  }

  clear() {
    this._bolts.length = 0;
    this._coreGeo.setDrawRange(0, 0);
    for (let i = 0; i < this._maxSparks; i++) this._sparks[i].active = false;
    this._sparkGeo.setDrawRange(0, 0);
    for (let i = 0; i < this._maxBillows; i++) { this._billows[i].active = false; this._bAlpha[i] = 0; }
    this._billowGeo.attributes.aAlpha.needsUpdate = true;
    for (let i = 0; i < this._swirls.length; i++) { this._swirls[i].active = false; this._swirls[i].mesh.visible = false; }
    this._impact.t = 0;
  }

  dispose() {
    if (this.scene) this.scene.remove(this.group);
    this._coreGeo.dispose(); this._coreMat.dispose();
    this._sparkGeo.dispose(); this._sparkMat.dispose();
    this._billowGeo.dispose(); this._billowBase.dispose(); this._billowMat.dispose();
    this._swirlGeo.dispose();
    for (let i = 0; i < this._swirls.length; i++) this._swirls[i].mat.dispose();
  }
}
