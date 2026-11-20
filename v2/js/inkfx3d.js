/* v2/js/inkfx3d.js — v0.41 '종이 컷아웃' 멀티프레임 이펙트(스킬·타격·부적·혼령 소멸·바닥 고리).
   v2/assets/diorama/fx/ 의 가로 스트립 시트(6~8프레임)를 인스턴스 빌보드로 재생한다.

   · 한 시트 = 한 배치(InstancedBufferGeometry 1개) → 드로우콜 종류 수만큼.
   · 인스턴스마다 위치·크기·회전·프레임·알파·틴트를 들고 있어, update() 에서 프레임만 넘긴다.
   · 바닥에 눕는 효과(고리·부적 그림자)는 uGround=1 배치로 같은 시트를 눕혀 쓴다.
   · 에셋이 없으면 조용히 비활성(게임은 기존 이펙트만으로 돈다). */
import * as THREE from 'three';

const BASE = new URL('../assets/diorama/fx/', import.meta.url).href;
const elementalSheets = new Set(['fire', 'ice', 'bolt', 'poison']);
const SHEETS = ['slash', 'spark', 'fire', 'ice', 'bolt', 'poison', 'talisman', 'ring', 'dissolve', 'splat'];
export const tex = {};
const state = { started: false, ready: false, fail: [], ms: 0 };

function load(url) {
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
export function preloadFx() {
  if (p) return p;
  state.started = true;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  p = Promise.all(SHEETS.map(function (k) {
    const url = elementalSheets.has(k) ? new URL('../assets/ink-edition/' + k + '.webp', import.meta.url).href : BASE + k + '.png';
    return load(url).then(function (img) {
      if (!img) { state.fail.push(k); return; }
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 2;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      tex[k] = t;
    });
  })).then(function () {
    state.ready = state.fail.length === 0;
    state.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    try { if (window.console && console.info) console.info('[심안] 이펙트 시트 ' + Object.keys(tex).length + '장 · ' + state.ms + 'ms' + (state.fail.length ? ' · 실패 ' + state.fail.join(',') : '')); } catch (e) {}
    return state;
  });
  return p;
}
/* 손가락 획(제스처)용 붓 텍스처 — 게임 2D 캔버스가 직접 drawImage/pattern 으로 쓴다. */
export const brushTex = { ink: null, gold: null, splat: null };
(function () {
  load(BASE + 'brush_ink.png').then(function (i) { if (i) brushTex.ink = i; });
  load(BASE + 'brush_gold.png').then(function (i) { if (i) brushTex.gold = i; });
  load(BASE + 'splat.png').then(function (i) { if (i) brushTex.splat = i; });
})();

export function fxReady() { return !!state.ready; }
export function fxInfo() { return { ready: state.ready, n: Object.keys(tex).length, ms: state.ms, fail: state.fail.slice() }; }
try { preloadFx(); } catch (e) {}

/* 프레임 수(시트별) */
const FRAMES = { slash: 6, spark: 6, fire: 6, ice: 6, bolt: 6, poison: 6, talisman: 6, ring: 6, dissolve: 8, splat: 6 };

const VERT = /* glsl */`
attribute vec3 iPos; attribute vec2 iScale; attribute float iRot; attribute float iFrame; attribute float iAlpha;
attribute vec3 iTint;
uniform vec2 uGrid; uniform float uGround;
varying vec2 vUv; varying float vA; varying vec3 vTint;
void main() {
  float c = cos(iRot), s = sin(iRot);
  vec2 q = vec2(c * position.x * iScale.x - s * position.y * iScale.y,
                s * position.x * iScale.x + c * position.y * iScale.y);
  float col = mod(iFrame, uGrid.x), row = floor(iFrame / uGrid.x);
  vUv = vec2((col + uv.x) / uGrid.x, 1.0 - (1.0 - (row + uv.y) / uGrid.y));
  vA = iAlpha; vTint = iTint;
  if (uGround > 0.5) {
    vec3 g = iPos + vec3(q.x, 0.0, -q.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(g, 1.0);
  } else {
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    mv.xy += q;
    gl_Position = projectionMatrix * mv;
  }
  if (iAlpha <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */`
uniform sampler2D map; uniform float uGridX;
varying vec2 vUv; varying float vA; varying vec3 vTint;
void main() {
  vec4 t = texture2D(map, vUv);
  t.a *= vA;
  if (t.a < 0.004) discard;
  gl_FragColor = vec4(t.rgb * vTint, t.a);
  #include <colorspace_fragment>
}`;

class Batch {
  constructor(kind, cap, ground, renderOrder, noDepth) {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.scale = new Float32Array(cap * 2);
    this.rot = new Float32Array(cap);
    this.frame = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.tint = new Float32Array(cap * 3);
    const add = (n, arr, k) => { const a = new THREE.InstancedBufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a; };
    this.attrs = [add('iPos', this.pos, 3), add('iScale', this.scale, 2), add('iRot', this.rot, 1),
      add('iFrame', this.frame, 1), add('iAlpha', this.alpha, 1), add('iTint', this.tint, 3)];
    g.instanceCount = cap;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex[kind] }, uGrid: { value: new THREE.Vector2(FRAMES[kind], 1) }, uGround: { value: ground ? 1 : 0 }, uGridX: { value: FRAMES[kind] } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: !noDepth,
      side: THREE.DoubleSide, blending: THREE.NormalBlending
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.geo = g; this.baseGeo = base;
    this.live = 0;
  }
  flush() { for (let i = 0; i < this.attrs.length; i++) this.attrs[i].needsUpdate = true; }
  dispose() { this.geo.dispose(); this.baseGeo.dispose(); this.mat.dispose(); }
}

/* 재생 중인 효과 하나: 프레임을 시간에 따라 넘긴다. */
class Play {
  constructor(batch, slot, o) {
    this.b = batch; this.slot = slot; this.t = 0;
    this.dur = o.dur; this.frames = o.frames; this.pos = o.pos; this.scale = o.scale;
    this.spin = o.spin || 0; this.drift = o.drift || null; this.grow = o.grow || 0;
    this.tint = o.tint || [1, 1, 1]; this.alpha = o.alpha == null ? 1 : o.alpha;
    this.hold = o.hold || 0;
  }
}

export class PaperFx {
  constructor(scene, opts) {
    this.scene = scene;
    this.batches = {};
    this.plays = [];
    this.enabled = fxReady();
    if (!this.enabled) return;
    const q = (opts && opts.quality) || 'high';
    const k = q === 'high' ? 1 : 0.5;
    const mk = (kind, cap, ground, ord, noDepth) => {
      const b = new Batch(kind, Math.max(8, Math.round(cap * k)), ground, ord, noDepth);
      scene.add(b.mesh);
      this.batches[kind + (ground ? ':g' : '')] = b;
      return b;
    };
    mk('slash', 10, false, 7.2, true);
    mk('spark', 26, false, 7.4, true);
    mk('fire', 12, false, 7.0, true);
    mk('ice', 12, false, 7.0, true);
    mk('bolt', 8, false, 7.4, true);
    mk('poison', 12, false, 7.0, true);
    mk('talisman', 12, false, 6.8, true);
    mk('dissolve', 20, false, 7.2, true);
    mk('ring', 8, true, 1.6);
    mk('splat', 14, true, 1.5);
    this.n = 0;
  }

  _slot(batch) {
    /* 빈 슬롯: 알파 0 인 인스턴스 재사용. 없으면 가장 오래된 것을 덮는다. */
    if (!batch) return -1;
    let best = -1, bestA = 2;
    for (let i = 0; i < batch.cap; i++) {
      if (batch.alpha[i] <= 0.001) { best = i; break; }
      if (batch.alpha[i] < bestA) { bestA = batch.alpha[i]; best = i; }
    }
    return best;
  }

  /** 시트 하나를 띄운다. o: {x,y,z, size, dur, tint, spin, drift, grow, ground, alpha} */
  emit(kind, o) {
    if (!this.enabled) return null;
    const batch = this.batches[kind + (o && o.ground ? ':g' : '')];
    if (!batch) return null;
    const slot = this._slot(batch);
    if (slot < 0) return null;
    o = o || {};
    const size = o.size == null ? 2.0 : o.size;
    batch.pos[slot * 3] = o.x || 0;
    batch.pos[slot * 3 + 1] = (o.y == null ? 1.0 : o.y) + (o.ground ? 0.03 : 0);
    batch.pos[slot * 3 + 2] = o.z || 0;
    batch.scale[slot * 2] = size;
    batch.scale[slot * 2 + 1] = size * (o.aspect == null ? 1 : o.aspect);
    batch.rot[slot] = o.rot || 0;
    batch.frame[slot] = 0;
    batch.alpha[slot] = o.alpha == null ? 1 : o.alpha;
    const t = o.tint || [1, 1, 1];
    batch.tint[slot * 3] = t[0]; batch.tint[slot * 3 + 1] = t[1]; batch.tint[slot * 3 + 2] = t[2];
    const pl = new Play(batch, slot, {
      dur: o.dur == null ? 0.45 : o.dur, frames: FRAMES[kind],
      pos: [o.x || 0, (o.y == null ? 1.0 : o.y), o.z || 0],
      scale: [size, size * (o.aspect == null ? 1 : o.aspect)],
      spin: o.spin || 0, drift: o.drift || null, grow: o.grow || 0, tint: t, alpha: o.alpha == null ? 1 : o.alpha,
      hold: o.hold || 0
    });
    pl.rot0 = o.rot || 0;
    this.plays.push(pl);
    return pl;
  }

  /** 일섬 검기: 진행 방향으로 늘인 아크 + 잔불·파편. */
  slash(from, to, elem) {
    if (!this.enabled) return;
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.max(0.6, Math.hypot(dx, dz));
    const yaw = Math.atan2(dx, dz);
    /* 빌보드 회전: 화면 기준 각도 — 카메라가 고정 45°라 월드 방향을 그대로 각도로 쓴다. */
    const ang = -yaw + Math.PI * 0.25;
    const cx = (from.x + to.x) / 2, cz = (from.z + to.z) / 2;
    const pl = this.emit('slash', {
      x: cx, y: 1.45, z: cz, size: Math.max(2.6, len * 1.7), aspect: 0.55,
      rot: ang, dur: 0.34, grow: 0.9
    });
    if (pl) pl.title = 'slash';
    const tint = elemTint(elem);
    if (elem && (elem === 'fire' || elem === 'ice' || elem === 'poison' || elem === 'lightning')) {
      const k = elem === 'lightning' ? 'bolt' : elem;
      for (let i = 0; i < 2; i++) {
        const u = 0.35 + i * 0.3;
        this.emit(k, { x: from.x + dx * u, y: 0.9, z: from.z + dz * u, size: 1.5 + i * 0.4, dur: 0.34 + i * 0.1, tint: tint });
      }
    }
  }

  /** 타격 스파크: 방향 반대로 살짝 밀리며 커진다. */
  hit(x, y, z, opts) {
    if (!this.enabled) return;
    opts = opts || {};
    this.emit('spark', { x: x, y: y == null ? 1.0 : y, z: z, size: opts.size || 1.5, dur: 0.28, tint: opts.tint || [1, 1, 1], rot: Math.random() * 6.28 });
    for (let i = 0; i < (opts.shards || 2); i++) {
      this.emit('splat', { x: x + (Math.random() - 0.5) * 0.7, z: z + (Math.random() - 0.5) * 0.7, size: 0.7 + Math.random() * 0.5, dur: 0.42, ground: true });
    }
  }

  /** 원소 폭발(스킬·상태이상): 불길·얼음·번개·독. */
  elem(kind, x, z, opts) {
    if (!this.enabled) return;
    opts = opts || {};
    const k = kind === 'lightning' ? 'bolt' : kind;
    this.emit(k, { x: x, y: opts.y == null ? 0.9 : opts.y, z: z, size: opts.size || 1.7, dur: opts.dur || 0.5, tint: opts.tint || elemTint(kind) });
    if (opts.ring !== false) {
      this.emit('ring', { x: x, z: z, size: (opts.ringR || 2.4), dur: 0.55, ground: true, rot: Math.random() * 6.28 });
    }
  }

  /** 부적·아이템 등장(종이 펄럭임). */
  talisman(x, y, z, opts) {
    if (!this.enabled) return;
    opts = opts || {};
    this.emit('talisman', { x: x, y: y == null ? 1.2 : y, z: z, size: opts.size || 0.85, dur: 0.62, tint: opts.tint || [1, 1, 1] });
  }

  /** 혼령 처치: 종이 부스러기로 흩어진다. */
  dissolve(x, y, z, opts) {
    if (!this.enabled) return;
    opts = opts || {};
    this.emit('dissolve', { x: x, y: y == null ? 1.4 : y, z: z, size: opts.size || 1.6, dur: 0.72, tint: opts.tint || [1, 1, 1] });
  }

  ring(x, z, size, opts) {
    if (!this.enabled) return;
    opts = opts || {};
    this.emit('ring', { x: x, z: z, size: size || 3.0, dur: opts.dur || 0.6, ground: true, tint: opts.tint || [1, 1, 1] });
  }

  /** 매 프레임: 프레임 번호·알파·크기 갱신. */
  update(dt) {
    if (!this.enabled) return;
    const list = this.plays;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.t += dt;
      const u = Math.min(1, p.t / Math.max(0.02, p.dur));
      const b = p.b, s = p.slot;
      if (p.t >= p.dur) {
        b.alpha[s] = 0; b.frame[s] = 0;
        continue;
      }
      const fi = Math.min(p.frames - 1, Math.floor(u * p.frames));
      b.frame[s] = fi;
      /* 마지막 40%는 서서히 사라진다 */
      const fade = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
      b.alpha[s] = p.alpha * Math.max(0, fade);
      const g = 1 + p.grow * u;
      b.scale[s * 2] = p.scale[0] * g;
      b.scale[s * 2 + 1] = p.scale[1] * g;
      b.rot[s] = (p.rot0 || 0) + p.spin * p.t;
      if (p.drift) {
        b.pos[s * 3] = p.pos[0] + p.drift[0] * u;
        b.pos[s * 3 + 1] = p.pos[1] + p.drift[1] * u;
        b.pos[s * 3 + 2] = p.pos[2] + p.drift[2] * u;
      }
      list[w++] = p;
    }
    list.length = w;
    for (const k in this.batches) this.batches[k].flush();
  }

  clear() {
    this.plays.length = 0;
    for (const k in this.batches) {
      const b = this.batches[k];
      for (let i = 0; i < b.cap; i++) b.alpha[i] = 0;
      b.flush();
    }
  }

  info() {
    const out = {};
    for (const k in this.batches) out[k] = this.batches[k].cap;
    return { live: this.plays.length, batches: out };
  }
}

function elemTint(elem) {
  switch (elem) {
    case 'fire': return [1.15, 0.72, 0.5];
    case 'ice': return [0.72, 1.02, 1.2];
    case 'poison': return [0.95, 0.75, 1.15];
    case 'lightning': return [1.2, 1.15, 1.3];
    default: return [1, 1, 1];
  }
}
