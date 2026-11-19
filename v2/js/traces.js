/* v2/js/traces.js — v0.43 '바닥에 남는 원소 흔적'.
   일섬·원소가 발동한 자리에 **먹 튐·그을림·얼음 균열·번개 자국**이 남아 서서히 사라진다.
   (창현님 승인: combat-skill-polish / LinearAbilityCastingThreeJS 의 '타격 순간 바닥 흔적' 기법)

   · 에셋: assets/diorama/ground/trace_{ink,scorch,ice,bolt}.png (256, 알파 있는 한 장)
   · 한 종류 = 한 배치(InstancedBufferGeometry) → 드로우콜 4.
   · 인스턴스마다 알파를 들고 있어 update() 에서 페이드만 넘긴다(매 프레임 new 없음).
   · 바닥에 눕혀(z=0 평면) 지면 바로 위에 얹는다 — 지형·물길·돌 위에 겹쳐도 z-fight 없이 읽힌다. */
import * as THREE from 'three';

const BASE = new URL('../assets/diorama/ground/', import.meta.url).href;
const KINDS = ['ink', 'scorch', 'ice', 'bolt'];
export const tex = {};
const state = { started: false, ready: false, fail: [] };

function loadImage(url) {
  return new Promise(function (res) {
    const img = new Image();
    img.decoding = 'async';
    let done = false;
    const fin = function (ok) { if (done) return; done = true; res(ok ? img : null); };
    img.onload = function () { fin(true); };
    img.onerror = function () { fin(false); };
    img.src = url;
    if (img.decode) img.decode().then(function () { fin(true); }, function () {});
  });
}

let p = null;
export function preloadTraces() {
  if (p) return p;
  state.started = true;
  p = Promise.all(KINDS.map(function (k) {
    return loadImage(BASE + 'trace_' + k + '.png').then(function (img) {
      if (!img) { state.fail.push(k); return; }
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      tex[k] = t;
    });
  })).then(function () {
    state.ready = state.fail.length === 0;
    try {
      if (window.console && console.info) console.info('[심안] 바닥 흔적 ' + Object.keys(tex).length + '장' + (state.fail.length ? ' · 실패 ' + state.fail.join(',') : ''));
    } catch (e) {}
    return state;
  });
  return p;
}
try { preloadTraces(); } catch (e) {}
export function tracesReady() { return state.ready; }

const VERT = /* glsl */`
attribute vec3 iPos; attribute vec2 iScale; attribute float iRot; attribute float iAlpha; attribute vec3 iTint;
varying vec2 vUv; varying float vA; varying vec3 vTint;
void main() {
  float c = cos(iRot), s = sin(iRot);
  vec2 q = vec2(c * position.x * iScale.x - s * position.y * iScale.y,
                s * position.x * iScale.x + c * position.y * iScale.y);
  /* 평면(PlaneGeometry)의 y 를 바닥 z 로 — 눕혀 놓는다. */
  vec3 g = iPos + vec3(q.x, 0.0, -q.y);
  vUv = uv; vA = iAlpha; vTint = iTint;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(g, 1.0);
  if (iAlpha <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */`
uniform sampler2D map;
varying vec2 vUv; varying float vA; varying vec3 vTint;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(t.rgb * vTint, a);
  #include <colorspace_fragment>
}`;

class Batch {
  constructor(kind, cap, renderOrder) {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.scale = new Float32Array(cap * 2);
    this.rot = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.tint = new Float32Array(cap * 3);
    const add = (n, arr, k) => {
      const a = new THREE.InstancedBufferAttribute(arr, k);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(n, a);
      return a;
    };
    this.attrs = [add('iPos', this.pos, 3), add('iScale', this.scale, 2), add('iRot', this.rot, 1),
      add('iAlpha', this.alpha, 1), add('iTint', this.tint, 3)];
    g.instanceCount = cap;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex[kind] } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.geo = g; this.baseGeo = base;
  }
  flush() { for (let i = 0; i < this.attrs.length; i++) this.attrs[i].needsUpdate = true; }
  dispose() { this.geo.dispose(); this.baseGeo.dispose(); this.mat.dispose(); }
}

class Trace {
  constructor(b, slot, o) {
    this.b = b; this.slot = slot; this.t = 0;
    this.dur = o.dur; this.a0 = o.alpha; this.grow = o.grow || 0;
    this.s0 = o.size;
  }
}

export class TraceField {
  constructor(scene, opts) {
    this.scene = scene;
    this.enabled = false;
    this.batches = {};
    this.live = [];
    this.cap = (opts && opts.cap) || 8;
    this.tints = {
      ink: [1, 1, 1], scorch: [1.1, 0.86, 0.76], ice: [0.92, 1.02, 1.12], bolt: [1.05, 1.03, 1.12]
    };
    /* 에셋이 늦게 도착해도 한 번만 만들어 두도록 — 처음 흔적을 놓을 때 지연 생성한다. */
    if (tracesReady()) this._build();
  }

  _build() {
    if (this.enabled) return true;
    if (!tracesReady()) return false;
    const scene = this.scene;
    KINDS.forEach(function (k, i) {
      const b = new Batch(k, this.cap, 1.36 + i * 0.004);
      scene.add(b.mesh);
      this.batches[k] = b;
    }, this);
    this.enabled = true;
    return true;
  }

  /** 바닥 흔적 하나. kind: ink|scorch|ice|bolt */
  decal(kind, x, z, o) {
    if (!this.enabled && !(this._build())) return null;
    const b = this.batches[kind] || this.batches.ink;
    if (!b) return null;
    /* 빈 슬롯(알파 0) 우선, 없으면 가장 흐린 슬롯을 덮는다. */
    let slot = -1, faint = 2;
    for (let i = 0; i < b.cap; i++) {
      if (b.alpha[i] <= 0.001) { slot = i; break; }
      if (b.alpha[i] < faint) { faint = b.alpha[i]; slot = i; }
    }
    if (slot < 0) return null;
    o = o || {};
    const size = o.size == null ? 2.6 : o.size;
    b.pos[slot * 3] = x;
    b.pos[slot * 3 + 1] = o.y == null ? 0.026 : o.y;
    b.pos[slot * 3 + 2] = z;
    b.scale[slot * 2] = size;
    b.scale[slot * 2 + 1] = size * (o.aspect == null ? 1 : o.aspect);
    b.rot[slot] = o.rot == null ? Math.random() * 6.2832 : o.rot;
    b.alpha[slot] = o.alpha == null ? 0.9 : o.alpha;
    const t = (o.tint || this.tints[kind] || [1, 1, 1]);
    b.tint[slot * 3] = t[0]; b.tint[slot * 3 + 1] = t[1]; b.tint[slot * 3 + 2] = t[2];
    b.flush();
    const tr = new Trace(b, slot, {
      dur: o.dur == null ? 4.0 : o.dur,
      alpha: o.alpha == null ? 0.9 : o.alpha,
      grow: o.grow == null ? 0.10 : o.grow,
      size: size
    });
    this.live.push(tr);
    return tr;
  }

  update(dt) {
    if (!this.enabled) return;
    const list = this.live;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.t += dt;
      const u = p.t / Math.max(0.05, p.dur);
      if (u >= 1) { p.b.alpha[p.slot] = 0; continue; }
      /* 앞 12% 는 젖은 먹처럼 또렷하게, 뒤는 서서히 종이로 스며들며 사라진다. */
      const fade = u < 0.12 ? 1 : 1 - (u - 0.12) / 0.88;
      p.b.alpha[p.slot] = p.a0 * Math.max(0, fade * fade);
      const g = 1 + p.grow * u;
      p.b.scale[p.slot * 2] = p.s0 * g;
      p.b.scale[p.slot * 2 + 1] = p.s0 * g;
      list[w++] = p;
    }
    list.length = w;
    for (const k in this.batches) this.batches[k].flush();
  }

  clear() {
    this.live.length = 0;
    for (const k in this.batches) {
      const b = this.batches[k];
      for (let i = 0; i < b.cap; i++) b.alpha[i] = 0;
      b.flush();
    }
  }

  dispose() {
    for (const k in this.batches) {
      const b = this.batches[k];
      this.scene.remove(b.mesh);
      b.dispose();
    }
    this.batches = {};
    this.live.length = 0;
  }
}
