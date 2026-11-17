/* 판 시작 전 재질 예열(pre-warm).
   증상: 보스가 처음 나오거나 원소 각인·진화가 처음 열리는 프레임에 화면이 0.1~0.3초 멈춘다.
   원인: 그 순간 처음 쓰이는 재질의 셰이더 프로그램을 GL이 그때 링크(link)하고, 캔버스로 그린
   텍스처를 그때 GPU에 올리기(texSubImage2D) 때문이다. 게임 로직 비용이 아니다.
   해결: 스테이지 소개 카드가 떠 있는 동안, 이 판에 등장할 수 있는 모든 재질 변형을 카메라 밖
   한 곳에 세워 실제로 컴파일하고 텍스처를 올린다. 그리고 그 재질들을 (장면에서 내린 뒤에도)
   붙들고 있는다. three는 재질이 dispose될 때만 프로그램 사용 횟수를 줄이므로, 붙들고 있는 동안
   프로그램은 해제되지 않고 런 중에는 새 링크가 일어나지 않는다.
   예열은 프레임당 예산(기본 24ms)만큼만 하고 다음 프레임으로 넘긴다 — 소개 카드·타이틀이
   멈추지 않게.
   QA 지표: renderer.info.programs.length 가 런 중에 늘지 않아야 하고,
            warmInfo().shapes 에 구운 혼령 기호가 모두 들어 있어야 한다. */

const KEEP = [];              // 예열에 쓴 재질·오브젝트(프로그램 수명 유지)
let rig = null;               // 예열용 그룹(장면에서는 내리고 보관만)
let warmed = false;
let promise = null;
const state = { phase: 'idle', step: 0, total: 0, ms: 0, programs: 0, textures: 0, labels: [] };

const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap',
  'aoMap', 'bumpMap', 'displacementMap', 'specularMap', 'lightMap', 'gradientMap', 'envMap'];

function forEachMaterial(obj, fn) {
  obj.traverse(function (o) {
    if (!o.material) return;
    if (Array.isArray(o.material)) o.material.forEach(fn);
    else fn(o.material);
  });
}

function uploadTextures(renderer, mats, extra) {
  if (!renderer.initTexture) return 0;
  let n = 0;
  const seen = new Set();
  const up = function (t) {
    if (!t || !t.isTexture || seen.has(t)) return;
    seen.add(t);
    try { renderer.initTexture(t); n++; } catch (e) {}
  };
  mats.forEach(function (mat) {
    if (!mat) return;
    TEX_SLOTS.forEach(function (k) { if (mat[k]) up(mat[k]); });
  });
  (extra || []).forEach(up);
  return n;
}

/**
 * opts: { THREE, renderer, scene, camera, recipes:[{label, make()}], textures:[Texture],
 *         budgetMs, onDone(info) }
 * Returns a promise for the info object. Idempotent: only the first call does the work.
 */
export function warmScene(opts) {
  if (warmed) return Promise.resolve(info());
  if (promise) return promise;
  const THREE = opts.THREE, renderer = opts.renderer, scene = opts.scene, camera = opts.camera;
  const recipes = opts.recipes || [];
  const budget = opts.budgetMs || 24;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const group = new THREE.Group();
  group.name = 'prewarm-rig';
  group.position.set(0, -1000, 0);   // 카메라 far(200) 밖 — 렌더되지 않는다
  /* visible=false 로 두면 renderer.compile 이 traverseVisible 을 쓰는 빌드에서 예열이 통째로 건너뛴다.
     카메라 밖 좌표만으로 충분히 가려지므로 보이는 상태로 둔다. */
  group.visible = true;
  scene.add(group);
  state.phase = 'building';
  state.total = recipes.length;

  const nextFrame = function (fn) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { fn(); });
    else setTimeout(fn, 16);
  };

  promise = new Promise(function (resolve) {
    const finish = function () {
      const mats = [];
      forEachMaterial(group, function (m) { mats.push(m); KEEP.push(m); });
      /* 무대(장면)가 이미 쓰는 재질의 텍스처도 함께 올린다(맵 교체 직후 첫 프레임 끊김 방지). */
      try { forEachMaterial(scene, function (m) { mats.push(m); }); } catch (e) {}
      const nt = uploadTextures(renderer, mats, opts.textures || []);
      scene.remove(group);
      rig = group;              // 재질 dispose 금지 = 프로그램 유지
      warmed = true;
      state.phase = 'done';
      state.textures = nt;
      state.ms = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0));
      state.programs = renderer.info && renderer.info.programs ? renderer.info.programs.length : 0;
      const out = info();
      if (opts.onDone) opts.onDone(out);
      resolve(out);
    };
    const step = function () {
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      while (state.step < recipes.length) {
        const r = recipes[state.step];
        try {
          let obj = r.make();
          if (obj && obj.isMaterial) {
            const g = new THREE.PlaneGeometry(1, 1);
            obj = new THREE.Mesh(g, obj);
            obj.frustumCulled = false;
          }
          if (obj) { group.add(obj); state.labels.push(r.label || '?'); }
        } catch (e) {}
        state.step++;
        if (performance.now() - t > budget) break;
      }
      /* 이번 프레임에 붙은 재질만 실제로 링크된다(이미 링크된 것은 캐시로 통과). */
      try {
        if (renderer.compile) renderer.compile(scene, camera);
        else if (renderer.compileAsync) renderer.compileAsync(scene, camera);
      } catch (e) {}
      if (state.step < recipes.length) { state.phase = 'compile'; nextFrame(step); return; }
      state.phase = 'textures';
      finish();
    };
    nextFrame(step);
  });
  return promise;
}

export function info() {
  return {
    warmed: warmed, ms: state.ms, programs: state.programs, textures: state.textures,
    recipes: state.total, done: state.step, phase: state.phase, kept: KEEP.length,
    labels: state.labels.slice()
  };
}
export function isWarmed() { return warmed; }

/** 씬 코드가 어디서든 만들 수 있는 기본 재질 변형(fog·투명·면)을 한 번에 덮는 레시피.
 *  개별 생성부를 하나하나 따라다니지 않아도 '처음 보는 변형'으로 인한 링크를 막아 준다. */
export function materialVariants(THREE, tex) {
  const out = [];
  const geo = new THREE.PlaneGeometry(1, 1);
  const mesh = function (mat) { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m; };
  const sides = [['F', THREE.FrontSide], ['D', THREE.DoubleSide], ['B', THREE.BackSide]];
  [true, false].forEach(function (fog) {
    [true, false].forEach(function (tr) {
      sides.forEach(function (sd) {
        out.push({
          label: 'var:basic:' + (fog ? 'fog' : '-') + (tr ? 'T' : '-') + sd[0],
          make: function () {
            return mesh(new THREE.MeshBasicMaterial({
              color: 0x808080, fog: fog, transparent: tr, opacity: tr ? 0.5 : 1,
              side: sd[1], depthWrite: !tr,
              blending: tr ? THREE.AdditiveBlending : THREE.NormalBlending
            }));
          }
        });
      });
    });
    if (!tex) return;
    [0, 0.02, 0.05].forEach(function (at) {
      out.push({
        label: 'var:map:' + (fog ? 'fog' : '-') + ':' + at,
        make: function () { return mesh(new THREE.MeshBasicMaterial({ map: tex, alphaTest: at, fog: fog, transparent: true, depthWrite: false })); }
      });
      out.push({
        label: 'var:sprite:' + (fog ? 'fog' : '-') + ':' + at,
        make: function () {
          return new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, alphaTest: at, fog: fog, transparent: true, depthWrite: false,
            blending: THREE.NormalBlending
          }));
        }
      });
    });
  });
  return out;
}
