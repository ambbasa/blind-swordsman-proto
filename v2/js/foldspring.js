/* v2/js/foldspring.js — v0.40 5단계: 접힘 스프링(1자유도) · 종이 팝업 연출.
   refs/papertrails/src/world/fold.js 의 RISE → LOCKED(과회전) → 정착을 그대로 옮겼다.
   - 고정 서브스텝(1/240s)으로 적분 → 프레임률과 무관하게 같은 곡선(30fps 폰에서도 튀지 않는다).
   - 감쇠비 ~0.45: 8~15% 과회전 후 2~3회 흔들림으로 '종이가 탁 펴지며 눌러앉는' 느낌.
   - 대상: 묵항아리 파손(찢김과 함께), 바닥 아이템/부적 등장, 보스 결계가 솟을 때, 보상 카드.
   대상 객체의 scale(또는 rotation)만 만지므로 재질·지오메트리를 건드리지 않는다. */

const FIXED = 1 / 240;
const MAX_SUB = 12;

const active = [];
let lastInfo = { n: 0, maxT: 0 };

/**
 * obj 를 접힌 상태에서 펴며 세운다.
 * opt: { from, stiff, damp, axis: 'y'|'x'|'z', rot(라디안, 축 회전이면), tilt(좌우 흔들 rad), done() }
 */
export function foldPop(obj, opt) {
  if (!obj) return null;
  const o = opt || {};
  const f = {
    obj: obj,
    x: 0, v: 0, target: 1,
    k: o.stiff != null ? o.stiff : 190,
    d: o.damp != null ? o.damp : 13.5,
    from: o.from != null ? o.from : 0.04,
    axis: o.axis || 'y',
    rot: o.rot != null ? o.rot : 0,
    tilt: o.tilt != null ? o.tilt : 0,
    t: 0, done: o.done || null,
    anchorY: o.anchorY != null ? o.anchorY : null,
    base: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
  };
  /* 이미 도는 애니메이션이 있으면 그 위에서 시작하지 않게 — 한 번만 접힌다. */
  for (let i = 0; i < active.length; i++) if (active[i].obj === obj) { active.splice(i, 1); break; }
  active.push(f);
  apply(f);
  return f;
}

/** 즉시 취소(오브젝트가 사라질 때). */
export function foldCancel(obj) {
  for (let i = active.length - 1; i >= 0; i--) if (active[i].obj === obj) active.splice(i, 1);
}

function apply(f) {
  const s = f.x < 0 ? 0 : f.x;
  const b = f.base;
  if (f.axis === 'y') {
    f.obj.scale.set(b.x * (1 - 0.18 * Math.max(0, s - 1)), b.y * (f.from + (1 - f.from) * s), b.z * (1 - 0.18 * Math.max(0, s - 1)));
    /* 바닥 고정 성장: 중심이 y=anchorY 인 물체를 아래끝 고정으로 세운다(결계 벽). */
    if (f.anchorY != null) f.obj.position.y = f.anchorY * s;
  } else if (f.axis === 'x') {
    f.obj.scale.set(b.x * (f.from + (1 - f.from) * s), b.y * (1 - 0.16 * Math.max(0, s - 1)), b.z);
  } else {
    f.obj.scale.set(b.x, b.y * (1 - 0.16 * Math.max(0, s - 1)), b.z * (f.from + (1 - f.from) * s));
  }
  if (f.tilt) f.obj.rotation.z = Math.sin(f.t * 26) * f.tilt * Math.max(0, 1 - f.t * 2.2) * 0.5;
  if (f.rot) f.obj.rotation.x = f.rot * (1 - Math.min(1, s));
}

/** 매 프레임 호출(게임 루프 끝). dt 는 초. */
export function tickFolds(dt) {
  if (!(dt > 0) || !active.length) { lastInfo.n = active.length; return; }
  let left = Math.min(dt, 0.25);
  while (left > 0) {
    const step = Math.min(FIXED, left);
    left -= step;
    for (let i = active.length - 1; i >= 0; i--) {
      const f = active[i];
      /* 임계 감쇠 스프링(고정 1/240s 스텝) — 과회전 뒤 정착 */
      const a = (f.target - f.x) * f.k - f.v * f.d;
      f.v += a * step;
      f.x += f.v * step;
      f.t += step;
      apply(f);
      if (f.t > 0.06 && Math.abs(f.x - 1) < 0.004 && Math.abs(f.v) < 0.05) {
        f.x = 1; f.v = 0; apply(f);
        if (f.tilt) f.obj.rotation.z = 0;
        if (f.rot) f.obj.rotation.x = 0;
        if (f.anchorY != null) f.obj.position.y = f.anchorY;
        active.splice(i, 1);
        if (f.done) try { f.done(); } catch (e) {}
      } else if (f.t > 4) {           /* 안전: 영원히 남지 않게 */
        active.splice(i, 1);
      }
    }
  }
  lastInfo.n = active.length;
}

/** QA/디버그: 지금 도는 접힘 수 */
export function foldInfo() { return { n: active.length }; }

/** 단발 스칼라 스프링(다른 연출에서 재사용): 목표로 수렴하는 값을 dt 로 적분. */
export function springTo(state, target, dt, k, damp) {
  const s = state || { x: target, v: 0 };
  const sub = Math.max(1, Math.ceil(dt / FIXED));
  const h = dt / sub;
  for (let i = 0; i < Math.min(sub, MAX_SUB); i++) {
    s.v += ((target - s.x) * (k || 180) - s.v * (damp || 14)) * h;
    s.x += s.v * h;
  }
  return s;
}
