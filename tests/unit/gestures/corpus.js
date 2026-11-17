/* 합성 획 생성기 — 인식 회귀 시험(v0.29 §2.3)의 입력.
   같은 시드는 언제나 같은 획을 만든다. 브라우저(page.evaluate)와 Node 양쪽에서 쓴다.

   구성: 무늬 10종 × 흔들림 3단계(3·6·9px) × 크기 3단계(작음·보통·큼) × 기울기 5단계(-20°~+20°).
   기울기는 '축에서 조금 비뚤어진 손'을 흉내 낸다(±20°까지). ±45°는 어느 축으로 읽어도
   틀리지 않게 45° 근처에서 조준으로 확정하는 별도 규칙(리졸버)의 몫이라 여기서는 다루지 않는다.

   한 획의 형식은 QA 훅 `GPv2.strokePath(pts)`가 받는 것과 같다: {x, y}의 배열, 화면 픽셀. */
(function (root) {
  /* 고정 시드 난수(mulberry32). */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function line(a, b, n, out) {
    out = out || [];
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0 : i / (n - 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
  }
  function poly(vertices, per) {
    var out = [];
    for (var i = 1; i < vertices.length; i++) {
      var seg = line(vertices[i - 1], vertices[i], per, []);
      out = out.concat(i === 1 ? seg : seg.slice(1));
    }
    return out;
  }
  /* 무늬 본체. s = 반지름/반폭(픽셀). y는 아래로 증가. */
  function baseShape(type, s) {
    var i, p;
    if (type === 'vline') return line({ x: 0, y: -s }, { x: 0, y: s }, 34);
    if (type === 'hline') return line({ x: -s, y: 0 }, { x: s, y: 0 }, 34);
    if (type === 'vee') return poly([{ x: -s, y: -0.7 * s }, { x: 0, y: 0.8 * s }, { x: s, y: -0.7 * s }], 20);
    if (type === 'circle') {
      p = [];
      /* 끝을 30° 남짓 열어 둔 O — 사람 손이 실제로 그리는 모양. */
      var a0 = -Math.PI * 0.62, sweep = Math.PI * 2 * 0.92;
      for (i = 0; i <= 64; i++) {
        var a = a0 + sweep * (i / 64);
        p.push({ x: Math.cos(a) * s * 0.92, y: Math.sin(a) * s * 0.92 });
      }
      return p;
    }
    if (type === 'square') return poly([{ x: -s, y: -s }, { x: s, y: -s }, { x: s, y: s }, { x: -s, y: s }, { x: -s, y: -s }], 14);
    if (type === 'bolt') {
      /* 번개: 폭 w(=s*0.45) 안에서 세 번 꺾인다. 길이는 2s. */
      var w = s * 0.45;
      return poly([
        { x: w, y: -s }, { x: -w, y: -0.28 * s }, { x: w * 0.85, y: 0.06 * s }, { x: -w, y: 0.55 * s }, { x: w * 0.6, y: s }
      ], 12);
    }
    if (type === 'tri') return poly([{ x: 0, y: -s }, { x: s * 0.95, y: s * 0.75 }, { x: -s * 0.95, y: s * 0.75 }, { x: 0, y: -s }], 18);
    if (type === 'arc') {
      p = [];
      for (i = 0; i <= 40; i++) {
        var b = Math.PI * (i / 40);
        p.push({ x: -Math.cos(b) * s * 0.9, y: Math.sin(b) * s * 0.72 });
      }
      return p;
    }
    if (type === 'spiral') {
      p = [];
      for (i = 0; i <= 90; i++) {
        var u = i / 90, ang = u * Math.PI * 4.1, rr = s * (0.12 + 0.78 * u);
        p.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr });
      }
      return p;
    }
    if (type === 'tap') return [{ x: 0, y: 0 }, { x: 1.2, y: 0.8 }];
    return [];
  }
  /* 손 떨림: 점마다의 잡음(주) + 획 전체가 한 번 완만하게 휘는 것(부). amp는 최대 어긋남(px).
     실제 손은 '2~3번 꺾인 지그재그'처럼 떨지 않는다 — 그건 의도해 그린 번개다. */
  function shake(pts, amp, rand) {
    var out = [], i, n = pts.length;
    if (!amp) return pts.map(function (q) { return { x: q.x, y: q.y }; });
    var bowSign = rand() < 0.5 ? -1 : 1;
    for (i = 0; i < n; i++) {
      var u = n === 1 ? 0 : i / (n - 1);
      var bow = Math.sin(Math.PI * u) * amp * 0.4 * bowSign;
      var tremor = (rand() * 2 - 1) * amp * 0.55;
      /* 진행 방향의 수직 성분만 흔든다(길이는 거의 그대로). */
      var a = pts[Math.min(n - 1, i + 1)], b = pts[Math.max(0, i - 1)];
      var dx = a.x - b.x, dy = a.y - b.y, L = Math.hypot(dx, dy) || 1;
      var nx = -dy / L, ny = dx / L;
      var k = bow + tremor;
      out.push({ x: pts[i].x + nx * k, y: pts[i].y + ny * k });
    }
    return out;
  }
  function rot(pts, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    return pts.map(function (p) { return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; });
  }
  function translate(pts, x, y) {
    return pts.map(function (p) { return { x: p.x + x, y: p.y + y }; });
  }

  var SHAPES = ['vline', 'hline', 'vee', 'circle', 'square', 'bolt', 'tri', 'arc', 'spiral', 'tap'];
  var JITTERS = [3, 6, 9];
  /* 반폭(px) — 선 길이 90·124·160px. 폰 엄지로 그리는 획의 실제 크기대(연습 획은 약 160px). */
  var SIZES = [45, 62, 80];
  var ROTATIONS = [-20, -10, 0, 10, 20];
  var NARROW_BOLT = { width: 20, half: 48, rot: 0, jitter: 3 }; /* 인식 하한 시험: 폭 20px(길이 96px) 번개 */

  /* opts: {seed, shapes, jitters, sizes, rotations, narrowBolts} */
  function makeCorpus(opts) {
    opts = opts || {};
    var seed = opts.seed == null ? 20261129 : opts.seed;
    var shapes = opts.shapes || SHAPES;
    var jitters = opts.jitters || JITTERS;
    var sizes = opts.sizes || SIZES;
    var rots = opts.rotations || ROTATIONS;
    var rand = rng(seed);
    var out = [];
    shapes.forEach(function (type) {
      jitters.forEach(function (jit) {
        sizes.forEach(function (s) {
          rots.forEach(function (deg) {
            var base = baseShape(type, s);
            var pts = shake(base, jit, rand);
            pts = rot(pts, deg * Math.PI / 180);
            pts = translate(pts, 200, 300);
            out.push({ shape: type, jitter: jit, size: s, rot: deg, narrow: false,
              pts: pts.map(function (p) { return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; }) });
          });
        });
      });
    });
    /* 좁은 번개: 폭 20px(반폭 10px), 길이 110px. 회전·떨림 몇 가지만. */
    var nNarrow = opts.narrowBolts == null ? 60 : opts.narrowBolts;
    for (var i = 0; i < nNarrow; i++) {
      var s2 = NARROW_BOLT.half, w2 = NARROW_BOLT.width * 0.5;
      var b = poly([
        { x: w2, y: -s2 }, { x: -w2, y: -0.28 * s2 }, { x: w2 * 0.85, y: 0.06 * s2 }, { x: -w2, y: 0.55 * s2 }, { x: w2 * 0.6, y: s2 }
      ], 12);
      var amp = [2, 3, 4][i % 3];
      var deg2 = ROTATIONS[i % ROTATIONS.length];
      var p2 = translate(rot(shake(b, amp, rand), deg2 * Math.PI / 180), 200, 300);
      out.push({ shape: 'bolt', jitter: amp, size: 55, rot: deg2, narrow: true,
        pts: p2.map(function (p) { return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; }) });
    }
    return out;
  }

  var API = {
    makeCorpus: makeCorpus, baseShape: baseShape, rng: rng,
    SHAPES: SHAPES, JITTERS: JITTERS, SIZES: SIZES, ROTATIONS: ROTATIONS
  };
  root.GPCorpus = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
