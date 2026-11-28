/* Gesture recognizer for 제스처 키우기.
   Shapes: vline (|), hline (—), vee (V), circle (O), plus bolt (⚡) for the skill.
   Axis-aligned, size-tolerant, slight jitter OK. Ambiguous / short / other shapes → null. */
(function (root) {
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function pathLen(pts) {
    var l = 0, i; for (i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
    return l;
  }
  function bbox(pts) {
    var i, x0 = pts[0].x, y0 = pts[0].y, x1 = x0, y1 = y0;
    for (i = 1; i < pts.length; i++) {
      if (pts[i].x < x0) x0 = pts[i].x; if (pts[i].x > x1) x1 = pts[i].x;
      if (pts[i].y < y0) y0 = pts[i].y; if (pts[i].y > y1) y1 = pts[i].y;
    }
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), diag: Math.hypot(x1 - x0, y1 - y0) };
  }
  function resample(pts, n) {
    if (pts.length < 2) return pts.slice();
    var L = pathLen(pts), I = L / (n - 1), out = [ { x: pts[0].x, y: pts[0].y } ];
    var acc = 0, i = 1, prev = { x: pts[0].x, y: pts[0].y };
    while (i < pts.length && out.length < n) {
      var d = dist(prev, pts[i]);
      if (acc + d >= I && d > 0) {
        var t = (I - acc) / d;
        var p = { x: prev.x + t * (pts[i].x - prev.x), y: prev.y + t * (pts[i].y - prev.y) };
        out.push(p); prev = p; acc = 0;
      } else { acc += d; prev = pts[i]; i++; }
    }
    while (out.length < n) out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    return out;
  }
  function straightness(pts) {
    var L = pathLen(pts), c = dist(pts[0], pts[pts.length - 1]);
    return L < 1 ? 0 : c / L;
  }
  function lineDev(pts, a, b) {
    var lx = b.x - a.x, ly = b.y - a.y, ll = Math.hypot(lx, ly) || 1, i, m = 0;
    for (i = 0; i < pts.length; i++) {
      var d = Math.abs(lx * (a.y - pts[i].y) - ly * (a.x - pts[i].x)) / ll;
      if (d > m) m = d;
    }
    return m;
  }
  function perpDist(a, p, b) {
    var lx = b.x - a.x, ly = b.y - a.y, ll = Math.hypot(lx, ly);
    if (ll < 1e-6) return dist(a, p);
    return Math.abs(lx * (a.y - p.y) - ly * (a.x - p.x)) / ll;
  }
  function simplify(pts, eps) {
    if (pts.length <= 2) return pts.slice();
    var maxD = -1, idx = -1, i;
    for (i = 1; i < pts.length - 1; i++) {
      var d = perpDist(pts[0], pts[i], pts[pts.length - 1]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) {
      var L = simplify(pts.slice(0, idx + 1), eps);
      var R = simplify(pts.slice(idx), eps);
      return L.slice(0, -1).concat(R);
    }
    return [pts[0], pts[pts.length - 1]];
  }
  function centroid(pts) {
    var i, x = 0, y = 0; for (i = 0; i < pts.length; i++) { x += pts[i].x; y += pts[i].y; }
    return { x: x / pts.length, y: y / pts.length };
  }
  function totalTurn(pts) {
    var i, a = 0, prev;
    for (i = 1; i < pts.length; i++) {
      var ang = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
      if (i > 1) {
        var d = ang - prev;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        a += d;
      }
      prev = ang;
    }
    return a;
  }
  function angleSpan(pts, c) {
    var angs = pts.map(function (p) { return Math.atan2(p.y - c.y, p.x - c.x); });
    var i, seen = 0, buckets = [];
    for (i = 0; i < 36; i++) buckets[i] = 0;
    for (i = 0; i < angs.length; i++) {
      var b = Math.floor(((angs[i] + Math.PI) / (2 * Math.PI)) * 36) % 36;
      if (!buckets[b]) { buckets[b] = 1; seen++; }
    }
    return seen / 36;
  }
  function radiusStats(pts, c) {
    var i, rs = [], s = 0, m, v = 0;
    for (i = 0; i < pts.length; i++) { rs.push(dist(pts[i], c)); s += rs[i]; }
    m = s / rs.length;
    for (i = 0; i < rs.length; i++) v += (rs[i] - m) * (rs[i] - m);
    return { mean: m, cv: m < 1 ? 1 : Math.sqrt(v / rs.length) / m };
  }
  function vertexIndex(pts) {
    var i, m = -1, idx = 0;
    for (i = 0; i < pts.length; i++) if (pts[i].y > m) { m = pts[i].y; idx = i; }
    return idx;
  }
  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  /* V in any orientation: the vertex is the point farthest from the chord of the two ends. */
  function veeApex(pts) {
    var a = pts[0], b = pts[pts.length - 1], i, best = -1, idx = 0;
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    for (i = 0; i < pts.length; i++) {
      var d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / L;
      if (d > best) { best = d; idx = i; }
    }
    var mx = (a.x + b.x) * 0.5, my = (a.y + b.y) * 0.5;
    var ux = pts[idx].x - mx, uy = pts[idx].y - my, ul = Math.hypot(ux, uy);
    return { index: idx, depth: best, dir: ul > 1e-6 ? { x: ux / ul, y: uy / ul } : null };
  }
  function rotateApexDown(pts, dir) {
    var t = Math.PI / 2 - Math.atan2(dir.y, dir.x), c = Math.cos(t), s = Math.sin(t), out = [], i;
    for (i = 0; i < pts.length; i++) out.push({ x: pts[i].x * c - pts[i].y * s, y: pts[i].x * s + pts[i].y * c });
    var bb = bbox(out);
    for (i = 0; i < out.length; i++) { out[i].x -= bb.x; out[i].y -= bb.y; }
    return out;
  }
  /* Bolt in any direction: turn the stroke so it runs top to bottom, then score the zigzag. */
  function scoreBoltAny(pts, bb, L) {
    var up = scoreBolt(pts, bb, L);
    var a = pts[0], b = pts[pts.length - 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < 1e-6) return up;
    var r = rotateApexDown(pts, { x: dx / d, y: dy / d });
    return Math.max(up, scoreBolt(r, bbox(r), L));
  }
  function scoreVeeAny(pts, bb, L) {
    var up = scoreVee(pts, bb, L);
    var ap = veeApex(pts);
    if (!ap.dir) return up;
    var r = rotateApexDown(pts, ap.dir);
    return Math.max(up, scoreVee(r, bbox(r), L));
  }

  function scoreVline(pts, bb, L) {
    var a = pts[0], b = pts[pts.length - 1], s = straightness(pts);
    var ny = Math.abs(b.y - a.y) / L, nx = Math.abs(b.x - a.x) / L;
    var dev = lineDev(pts, a, b) / L;
    var aspect = bb.w / bb.h;
    if (bb.h < 24) return 0;
    var sc = 1;
    sc *= clamp01((ny - 0.55) / 0.30);
    sc *= clamp01((0.72 - nx) / 0.35);
    sc *= clamp01((s - 0.70) / 0.20);
    sc *= clamp01((1.05 - aspect) / 0.55);
    sc *= clamp01((0.28 - dev) / 0.28);
    return sc;
  }
  function scoreHline(pts, bb, L) {
    var a = pts[0], b = pts[pts.length - 1], s = straightness(pts);
    var ny = Math.abs(b.y - a.y) / L, nx = Math.abs(b.x - a.x) / L;
    var dev = lineDev(pts, a, b) / L;
    var aspect = bb.h / bb.w;
    if (bb.w < 24) return 0;
    var sc = 1;
    sc *= clamp01((nx - 0.55) / 0.30);
    sc *= clamp01((0.72 - ny) / 0.35);
    sc *= clamp01((s - 0.70) / 0.20);
    sc *= clamp01((1.05 - aspect) / 0.55);
    sc *= clamp01((0.28 - dev) / 0.28);
    return sc;
  }
  /* 직선을 '축'이 아니라 '방향'으로 판정한다. 모바일 엄지의 35~55° 대각선이 사각지대에 빠지지 않게,
     가장 가까운 축(세로/가로)으로 흡수하고 45° 근처(tie)는 조준으로 확정하도록 넘긴다. */
  function scoreLineAxis(pts, bb, L) {
    var a = pts[0], b = pts[pts.length - 1];
    var s = straightness(pts), dev = lineDev(pts, a, b) / L;
    var ny = Math.abs(b.y - a.y) / L, nx = Math.abs(b.x - a.x) / L;
    var span = Math.max(bb.w, bb.h);
    if (span < 40 || L < 56) return null;
    if (s < 0.86 || dev > 0.10) return null;
    var axis = ny >= nx ? 'vline' : 'hline';
    var lean = Math.max(ny, nx);
    var score = clamp01((lean - 0.62) / 0.25) * 0.9 + 0.1;
    return { type: axis, score: score, tie: Math.abs(ny - nx) < 0.06, dev: dev };
  }
  function scoreVee(pts, bb, L) {
    /* 손으로 그린 얕은 V는 높이가 20px 남짓이다 — 높이 문턱을 낮추고 꼭짓점 각도로 거른다. */
    if (bb.w < 28 || bb.h < 13) return 0;
    var vi = vertexIndex(pts);
    var t = vi / (pts.length - 1);
    if (t < 0.18 || t > 0.82) return 0;
    var v = pts[vi], a = pts[0], b = pts[pts.length - 1];
    var dropA = (v.y - a.y) / bb.h, dropB = (v.y - b.y) / bb.h;
    var closeY = Math.abs(a.y - b.y) / bb.h;
    var spread = Math.abs(a.x - b.x) / bb.w;
    var left = pts.slice(0, vi + 1), right = pts.slice(vi);
    if (left.length < 3 || right.length < 3) return 0;
    var sL = straightness(left), sR = straightness(right);
    var closure = dist(a, b) / L;
    // angle at vertex
    var a1 = Math.atan2(a.y - v.y, a.x - v.x), a2 = Math.atan2(b.y - v.y, b.x - v.x);
    var ang = Math.abs(a1 - a2); if (ang > Math.PI) ang = 2 * Math.PI - ang;
    var deg = ang * 180 / Math.PI;
    // downward first half, upward second (y increases downward)
    var down = 0, i;
    for (i = 1; i < left.length; i++) if (left[i].y >= left[i - 1].y) down++;
    var up = 0;
    for (i = 1; i < right.length; i++) if (right[i].y <= right[i - 1].y) up++;
    // closed paths (O, square) and wide basins (U) are not V
    if (closure < 0.22 || dist(a, b) < bb.diag * 0.28) return 0;
    var near = 0;
    for (i = 0; i < pts.length; i++) if ((v.y - pts[i].y) / bb.h < 0.18) near++;
    if (near / pts.length > 0.28) return 0;
    var sc = 1;
    sc *= clamp01((dropA - 0.15) / 0.35);
    sc *= clamp01((dropB - 0.15) / 0.35);
    sc *= clamp01((0.75 - closeY) / 0.75);
    sc *= clamp01((spread - 0.22) / 0.4);
    sc *= clamp01((sL - 0.68) / 0.22);
    sc *= clamp01((sR - 0.68) / 0.22);
    sc *= clamp01((deg - 24) / 30) * clamp01((155 - deg) / 40);
    sc *= clamp01((down / (left.length - 1) - 0.55) / 0.35);
    sc *= clamp01((up / (right.length - 1) - 0.55) / 0.35);
    sc *= clamp01((bb.w / bb.h - 0.15) / 0.35);
    return sc;
  }
  function scoreCircle(pts, bb, L) {
    if (Math.min(bb.w, bb.h) < 28) return 0;
    var a = pts[0], b = pts[pts.length - 1];
    var closure = dist(a, b) / Math.max(bb.diag, 1);
    var c = centroid(pts);
    var rs = radiusStats(pts, c);
    var cover = angleSpan(pts, c);
    var turn = Math.abs(totalTurn(pts));
    var loops = turn / (2 * Math.PI);
    var aspect = bb.w / bb.h; if (aspect < 1) aspect = 1 / aspect;
    var circ = L / (2 * Math.PI * Math.max(rs.mean, 1));
    var sc = 1;
    /* 끝을 40° 남짓 열어 둔 O도 동그라미로 읽는다(사람 손은 잘 닫지 않는다). */
    sc *= clamp01((0.46 - closure) / 0.26);
    sc *= clamp01((0.38 - rs.cv) / 0.38);
    sc *= clamp01((cover - 0.62) / 0.28);
    sc *= clamp01((loops - 0.62) / 0.28) * clamp01((1.45 - loops) / 0.4);
    sc *= clamp01((2.15 - aspect) / 1.15);
    sc *= clamp01((circ - 0.62) / 0.25) * clamp01((1.5 - circ) / 0.45);
    return sc;
  }
  /* v0.29 §2.1 — 번개는 '지그재그'일 때만이다.
     v0.27의 좁은 번개 완화 뒤로 손 떨림이 있는 세로선이 번개로 읽히는 회귀가 있었다
     (세로선을 그었는데 자동 조준 번개가 엉뚱한 혼령으로 돌진).
     ① 진행 방향에 수직인 폭 / 길이 ≥ 0.18 — 손 떨림은 대개 0.05~0.12다.
     ② 60° 이상 꺾임이 2곳 이상 — 완만한 물결(휘어진 직선)은 번개가 아니다.
     곧은 정도(≥0.9)가 높은 획을 축 흡수가 먼저 가져가는 규칙은 recognize()가 맡는다. */
  var BOLT_MIN_ASPECT = 0.18, BOLT_MIN_CORNER = 60;
  function boltCorners(pts, eps) {
    var simple = simplify(pts, eps), i, n = simple.length, out = [];
    for (i = 1; i < n - 1; i++) {
      var a1 = Math.atan2(simple[i - 1].y - simple[i].y, simple[i - 1].x - simple[i].x);
      var a2 = Math.atan2(simple[i + 1].y - simple[i].y, simple[i + 1].x - simple[i].x);
      var d = Math.abs(a2 - a1);
      if (d > Math.PI) d = 2 * Math.PI - d;
      out.push(d * 180 / Math.PI);
    }
    return { n: n, corners: out };
  }
  /* 번개의 기하 검사: {aspect, sharp, straight, ok} — 회전시킨(위→아래) 좌표에서 잰다.
     ① 폭/길이는 획 그대로(raw)에서 잰다 — 좁은 번개(폭 20px)의 폭이 뭉개지지 않게.
     ② 꺾임은 손떨림을 한 번 걸러낸(smooth 3) 경로에서 잰다 — 잡음으로 생긴 가짜 꺾임을 빼기 위해서다. */
  function boltGeometry(pts, bb, epsMul) {
    var m = epsMul == null ? 0.14 : epsMul;
    var sm = smoothPts(pts, 3), sbb = bbox(sm);
    var eps = Math.max(5, Math.min(sbb.diag * 0.06, Math.max(5, sbb.w * m)));
    var c = boltCorners(sm, eps);
    var sharp = c.corners.filter(function (d) { return d >= BOLT_MIN_CORNER; }).length;
    var aspect = bb.h > 0 ? bb.w / bb.h : 0;
    return { aspect: aspect, sharp: sharp, corners: c.corners, n: c.n, straight: straightness(pts), ok: aspect >= BOLT_MIN_ASPECT && sharp >= 2 };
  }
  function scoreBolt(pts, bb, L) {
    if (bb.h < 24) return 0;
    /* 좁은 지그재그(폭 20px)도 살리도록 단순화 여유를 획 폭에 맞춘다. */
    var eps = Math.max(6, Math.min(bb.diag * 0.13, Math.max(6, bb.w * 0.35)));
    var simple = simplify(pts, eps);
    if (simple.length < 3 || simple.length > 7) return 0;
    /* §2.1①·②: 폭이 좁거나 꺾임이 완만하면 번개가 아니다. */
    var geo = boltGeometry(pts, bb);
    if (!geo.ok) return 0;
    var netY = simple[simple.length - 1].y - simple[0].y;
    if (netY / bb.h < 0.2 && bb.h / bb.w < 0.7) {
      // horizontal Z still ok if 3 segments zigzag
    }
    var i, flips = 0, downs = 0;
    for (i = 1; i < simple.length; i++) {
      if (simple[i].y > simple[i - 1].y) downs++;
    }
    for (i = 2; i < simple.length; i++) {
      var dx0 = simple[i - 1].x - simple[i - 2].x;
      var dx1 = simple[i].x - simple[i - 1].x;
      if (dx0 * dx1 < 0 && Math.abs(dx0) > 4 && Math.abs(dx1) > 4) flips++;
    }
    var closure = dist(pts[0], pts[pts.length - 1]) / L;
    var sc = 1;
    sc *= clamp01((flips - 0.9) / 1.2);
    sc *= clamp01((simple.length - 2.9) / 1.2) * clamp01((7.4 - simple.length) / 2.6);
    sc *= clamp01((closure - 0.2) / 0.3);
    sc *= clamp01((Math.max(bb.w, bb.h) - 30) / 40);
    /* 폭이 길이의 4%도 안 되면 지그재그가 아니라 손 떨림이 있는 직선으로 본다. */
    var thin = Math.min(bb.w, bb.h) / Math.max(1, Math.max(bb.w, bb.h));
    sc *= clamp01((thin - 0.045) / 0.06);
    /* 진짜 번개의 꺾임은 몇 점 사이에서 급하게 꺾인다. 완만한 물결(손 떨림)은 배제. */
    sc *= clamp01((maxTurnWindow(pts, 3) - 0.55) / 0.40);
    /* must not be a plain V (3 corners) or circle */
    if (flips < 2) sc *= 0.6;
    return sc;
  }

  function scoreSquare(pts, bb, L) {
    if (Math.min(bb.w, bb.h) < 28) return 0;
    var a = pts[0], b = pts[pts.length - 1];
    var closure = dist(a, b) / Math.max(bb.diag, 1);
    var aspect = bb.w / bb.h; if (aspect < 1) aspect = 1 / aspect;
    var simple = simplify(pts, Math.max(6, bb.diag * 0.09));
    if (simple.length >= 2 && dist(simple[0], simple[simple.length - 1]) < bb.diag * 0.16) {
      simple = simple.slice(0, simple.length - 1);
    }
    var n = simple.length;
    var c = centroid(pts);
    var rs = radiusStats(pts, c);
    var cover = angleSpan(pts, c);
    var turn = Math.abs(totalTurn(pts));
    var loops = turn / (2 * Math.PI);
    var sc = 1;
    sc *= clamp01((0.32 - closure) / 0.32);
    sc *= clamp01((1.38 - aspect) / 0.38);
    sc *= clamp01((n - 3.15) / 0.85) * clamp01((7.2 - n) / 2.4);
    sc *= clamp01((cover - 0.68) / 0.22);
    /* Open-path totalTurn often misses the last corner (~0.75 turns on a square). */
    sc *= clamp01((loops - 0.45) / 0.25) * clamp01((1.5 - loops) / 0.4);
    /* A square's radius varies (cv ~0.1); a circle's does not. */
    sc *= clamp01((rs.cv - 0.04) / 0.07);
    if (n >= 3) {
      var angScore = 0, i, p0, p1, p2, a1, a2, ang;
      for (i = 0; i < n; i++) {
        p0 = simple[(i - 1 + n) % n]; p1 = simple[i]; p2 = simple[(i + 1) % n];
        a1 = Math.atan2(p0.y - p1.y, p0.x - p1.x);
        a2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        ang = Math.abs((a2 - a1) * 180 / Math.PI);
        while (ang > 180) ang = Math.abs(ang - 360);
        ang = Math.abs(ang);
        if (ang > 180) ang = 360 - ang;
        angScore += clamp01(1 - Math.abs(ang - 90) / 50);
      }
      sc *= angScore / n;
    }
    if (n >= 4 && n <= 5 && sc > 0 && (bb.w / Math.max(bb.h, 1) < 1.3) && (bb.h / Math.max(bb.w, 1) < 1.3)) {
      if (sc < 0.7) sc = Math.min(0.92, sc + 0.35);
    }
    return sc;
  }

  /* v0.26 기물 전용 제스처(보스전에서만 인식): 삼각 △, 반달 ◡, 소용돌이 @.
     기존 무늬(선·V·O·ㅁ·⚡)와 겹치지 않는 모양만 골랐다. */
  function cornerAngles(simple) {
    var n = simple.length, out = [], i, p0, p1, p2, a1, a2, ang;
    for (i = 0; i < n; i++) {
      p0 = simple[(i - 1 + n) % n]; p1 = simple[i]; p2 = simple[(i + 1) % n];
      a1 = Math.atan2(p0.y - p1.y, p0.x - p1.x);
      a2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      ang = Math.abs(a2 - a1);
      if (ang > Math.PI) ang = 2 * Math.PI - ang;
      out.push(ang * 180 / Math.PI);
    }
    return out;
  }
  function smoothPts(pts, k) {
    var out = [], i, j, n = pts.length;
    for (i = 0; i < n; i++) {
      var x = 0, y = 0, c = 0;
      for (j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { x += pts[j].x; y += pts[j].y; c++; }
      out.push({ x: x / c, y: y / c });
    }
    out[0] = { x: pts[0].x, y: pts[0].y }; out[n - 1] = { x: pts[n - 1].x, y: pts[n - 1].y };
    return out;
  }
  function scoreTri(pts, bb, L) {
    if (Math.min(bb.w, bb.h) < 28) return 0;
    var closure = dist(pts[0], pts[pts.length - 1]) / Math.max(bb.diag, 1);
    var simple = simplify(pts, Math.max(6, bb.diag * 0.1));
    if (simple.length >= 2 && dist(simple[0], simple[simple.length - 1]) < bb.diag * 0.2) simple = simple.slice(0, simple.length - 1);
    if (simple.length !== 3) return 0;
    var angs = cornerAngles(simple), i, sc = 1;
    for (i = 0; i < 3; i++) sc *= clamp01((angs[i] - 20) / 15) * clamp01((125 - angs[i]) / 20);
    var loops = Math.abs(totalTurn(pts)) / (2 * Math.PI);
    sc *= clamp01((0.34 - closure) / 0.2);
    /* An open path counts only two of the three corners (~0.67 turns), so the floor sits at half a turn. */
    sc *= clamp01((loops - 0.5) / 0.1) * clamp01((1.4 - loops) / 0.3);
    return sc;
  }
  /* Largest turn over any 3 resampled steps: a V spends it at one corner, an arc spreads it out. */
  function maxTurnWindow(pts, w) {
    var i, j, m = 0, angs = [];
    for (i = 1; i < pts.length; i++) angs.push(Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x));
    for (i = 0; i + w < angs.length; i++) {
      var t = 0;
      for (j = i + 1; j <= i + w; j++) {
        var d = angs[j] - angs[j - 1];
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        t += d;
      }
      if (Math.abs(t) > m) m = Math.abs(t);
    }
    return m;
  }
  /* 꺾임이 몰린 구간의 개수: V는 1곳, 반달(U자)은 2곳, 네모는 3~4곳. */
  function sharpRuns(pts, thresh) {
    var i, runs = 0, inRun = false, prev;
    for (i = 1; i < pts.length; i++) {
      var ang = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
      var sharp = false;
      if (i > 1) {
        var d = ang - prev;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        sharp = Math.abs(d) > thresh;
      }
      prev = ang;
      if (sharp) { if (!inRun) { runs++; inRun = true; } }
      else inRun = false;
    }
    return runs;
  }
  function scoreArc(pts, bb, L) {
    if (Math.max(bb.w, bb.h) < 40) return 0;
    var chord = dist(pts[0], pts[pts.length - 1]) / L;
    var loops = Math.abs(totalTurn(pts)) / (2 * Math.PI);
    var sharp = maxTurnWindow(pts, 3);
    var runs = sharpRuns(pts, 0.35);
    var sc = 1;
    /* U자로 그린 반달은 양 끝이 곧게 내려와 코드 대비 길이가 짧다 — 하한을 0.26까지 연다. */
    sc *= clamp01((chord - 0.26) / 0.12) * clamp01((0.86 - chord) / 0.1);
    sc *= clamp01((loops - 0.3) / 0.1) * clamp01((0.72 - loops) / 0.1);
    /* 부드러운 호는 꺾임이 없고, U자는 꺾인 두 모서리를 허용한다(V의 한 꼭짓점은 배제). */
    if (runs <= 1) sc *= clamp01((1.0 - sharp) / 0.35);
    else sc *= clamp01((2.6 - sharp) / 0.8) * (runs <= 2 ? 1 : 0.3);
    return sc;
  }
  function scoreSpiral(pts, bb, L) {
    if (Math.min(bb.w, bb.h) < 36) return 0;
    var loops = Math.abs(totalTurn(pts)) / (2 * Math.PI);
    if (loops < 1.35) return 0;
    var c = centroid(pts), n = pts.length, i, mi = (n - 1) / 2, mr = 0, rs = [];
    for (i = 0; i < n; i++) { rs.push(dist(pts[i], c)); mr += rs[i]; }
    mr /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) { sxy += (i - mi) * (rs[i] - mr); sxx += (i - mi) * (i - mi); syy += (rs[i] - mr) * (rs[i] - mr); }
    var corr = Math.abs(sxy / Math.sqrt(Math.max(1e-9, sxx * syy)));
    var sc = 1;
    sc *= clamp01((loops - 1.35) / 0.3) * clamp01((4.5 - loops) / 1.0);
    sc *= clamp01((corr - 0.55) / 0.25);
    return sc;
  }

  function densify(pts, step) {
    step = step || 10;
    if (!pts || pts.length < 2) return (pts || []).slice();
    var out = [{ x: pts[0].x, y: pts[0].y }], i, k, n, a, b, d, t;
    for (i = 1; i < pts.length; i++) {
      a = out[out.length - 1];
      b = pts[i];
      d = dist(a, b);
      if (d < 0.5) continue;
      n = Math.max(1, Math.ceil(d / step));
      for (k = 1; k <= n; k++) {
        t = k / n;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }

  function isTap(pts, L, bb) {
    if (!pts || !pts.length) return false;
    var box = bb || bbox(pts);
    var len = (L != null) ? L : pathLen(pts);
    return len <= 22 && Math.max(box.w, box.h) <= 16;
  }

  var LABELS = { vline: 'ㅣ', hline: '—', vee: 'V', circle: 'O', bolt: 'Z', tap: '탭', square: 'ㅁ', tri: '△', arc: '◡', spiral: '@' };
  var TOTEM = ['tri', 'square', 'spiral'];
  var COMBAT = ['vline', 'hline', 'vee', 'circle', 'square', 'tap'];

  function recognize(raw, opts) {
    opts = opts || {};
    var pts = [];
    var i, p;
    for (i = 0; i < (raw || []).length; i++) {
      p = raw[i];
      if (!p) continue;
      if (pts.length && dist(pts[pts.length - 1], p) < 0.8) continue;
      pts.push({ x: +p.x, y: +p.y });
    }
    if (!pts.length) return { type: null, reason: 'short', scores: {}, label: null };
    var L0 = pathLen(pts);
    var bb0 = bbox(pts);
    if (isTap(pts, L0, bb0)) {
      return { type: 'tap', reason: null, scores: { tap: 1 }, label: LABELS.tap, best: 'tap', bestScore: 1, q: 1 };
    }
    /* Fast flicks often arrive with 2–5 samples. Densify first, then judge by length/shape. */
    pts = densify(pts, 10);
    L0 = pathLen(pts);
    bb0 = bbox(pts);
    if (pts.length < 2) return { type: null, reason: 'short', scores: {}, label: null };
    var L = L0;
    if (L < 36) return { type: null, reason: 'short', scores: {}, label: null };
    // A pentagram closes after five long legs with same-direction sharp turns.
    if (opts.seal && dist(pts[0], pts[pts.length - 1]) < L * 0.065) {
      var tips = resample(pts, 6), winding = 0, valid = true;
      for (var leg = 0; leg < 5; leg++) {
        var a = tips[leg], b = tips[(leg + 1) % 5], c = tips[(leg + 2) % 5];
        var ab = dist(a,b), bc = dist(b,c);
        var dot = (b.x-a.x)*(c.x-b.x) + (b.y-a.y)*(c.y-b.y);
        var cross = Math.sign((b.x-a.x)*(c.y-b.y) - (b.y-a.y)*(c.x-b.x));
        if (ab < L * 0.135 || dot > -0.56 * ab * bc || (leg && cross !== winding)) valid = false;
        winding = cross;
      }
      if (valid) return { type:'star', best:'star', label:'★', scores:{star:1}, bestScore:1, q:1 };
    }
    var rs = resample(pts, 48);
    var bb = bbox(rs);
    var steady = smoothPts(rs, 3);
    var axis = scoreLineAxis(rs, bb, pathLen(rs)) || scoreLineAxis(steady, bbox(steady), pathLen(steady));
    var scores = {
      vline: scoreVline(rs, bb, pathLen(rs)),
      hline: scoreHline(rs, bb, pathLen(rs)),
      vee: scoreVeeAny(rs, bb, pathLen(rs)),
      circle: scoreCircle(rs, bb, pathLen(rs)),
      square: scoreSquare(rs, bb, pathLen(rs)),
      bolt: scoreBoltAny(rs, bb, pathLen(rs)),
      axisLine: axis ? axis.score : 0
    };
    /* 기물 제스처는 opts.totem일 때(보스전에 기물이 서 있을 때)만 겨룬다. 평소 인식은 그대로다. */
    if (opts.totem) {
      /* 손 떨림이 꺾임·회전량을 부풀리지 않게 한 번 고른 뒤 잰다. */
      var sm = smoothPts(rs, 4), sbb = bbox(sm), sL = pathLen(sm);
      var tScores = { tri: scoreTri(rs, bb, pathLen(rs)), square: scores.square, spiral: scoreSpiral(sm, sbb, sL) };
      var tk = null, ts = 0;
      TOTEM.forEach(function (k) { scores[k] = tScores[k]; if (tScores[k] > ts) { ts = tScores[k]; tk = k; } });
      var rival = Math.max(scores.vee || 0, scores.circle || 0, scores.square || 0, (opts.allowBolt ? scores.bolt || 0 : 0), axis ? axis.score : 0);
      if (tk && ts >= 0.45 && ts + 0.05 >= rival) {
        return { type: tk, reason: null, scores: scores, label: LABELS[tk], best: tk, bestScore: ts, q: clamp01(ts) };
      }
    }
    var allowBolt = !!opts.allowBolt;
    /* §2.1③: 충분히 곧은 획(곧은 정도 ≥ 0.9)은 번개 후보에서 뺀다 — 직선은 그은 방향대로 가는 편이 덜 억울하다. */
    if (allowBolt && straightness(rs) >= 0.9) scores.bolt = 0;
    var keys = ['vline', 'hline', 'vee', 'circle', 'square'];
    if (allowBolt) keys = keys.concat(['bolt']);
    var best = null, bestS = 0, second = 0;
    for (i = 0; i < keys.length; i++) {
      var s = scores[keys[i]] || 0;
      if (s > bestS) { second = bestS; bestS = s; best = keys[i]; }
      else if (s > second) second = s;
    }
    var TH = 0.38;
    var MARGIN = 0.05;
    var preferCircle = !!opts.preferCircle && !opts.totem;
    if (allowBolt && (scores.bolt || 0) >= 0.55 && (scores.bolt || 0) >= bestS - 0.02) {
      best = 'bolt'; bestS = scores.bolt;
    } else if (preferCircle && (scores.circle || 0) >= 0.32 && (scores.circle || 0) + 0.08 >= (scores.vee || 0) && (scores.circle || 0) >= (scores.vline || 0) && (scores.circle || 0) >= (scores.hline || 0)) {
      best = 'circle'; bestS = scores.circle;
    } else if ((scores.square || 0) >= 0.42 && (scores.square || 0) >= (scores.circle || 0) + 0.10 && (scores.square || 0) >= (scores.vee || 0)) {
      best = 'square'; bestS = scores.square;
    } else if ((scores.circle || 0) >= 0.34 && (scores.circle || 0) + 0.08 >= (scores.vee || 0) && (scores.circle || 0) >= (scores.vline || 0) && (scores.circle || 0) >= (scores.hline || 0) && (scores.circle || 0) + 0.10 >= (scores.square || 0)) {
      best = 'circle'; bestS = scores.circle;
    }
    var stable = best === 'circle' || best === 'square';
    /* §2.1④: 세로선·가로선과 번개가 2등 안에서 0.08 이내로 붙으면 직선으로 읽는다. */
    if (allowBolt && (best === 'vline' || best === 'hline') && (scores.bolt || 0) > 0
        && (scores.bolt || 0) >= bestS - 0.08) { scores.bolt = 0; }
    /* 좁은 번개(⚡)는 폭이 좁아 세로선으로 보이기 쉽다 — 지그재그가 확인되면 축 흡수보다 먼저 인정한다. */
    var boltStrong = allowBolt && (scores.bolt || 0) >= 0.5;
    /* 대각선 흡수: 충분히 곧은 획은 가장 가까운 축의 직선으로 확정한다. */
    var axisPick = null;
    if (!boltStrong && axis && axis.score >= TH && axis.score + 0.10 >= bestS) { axisPick = axis; best = axis.type; bestS = axis.score; }
    if (boltStrong) { best = 'bolt'; bestS = Math.max(bestS, scores.bolt || 0); }
    if (axisPick && axisPick.tie) {
      return { type: axis.type, reason: null, tie: true, scores: scores, label: LABELS[axis.type], best: axis.type, bestScore: bestS, axis: axis.type, q: qualityOf(axis.type, rs, axis, scores, bestS) };
    }
    if (!best || bestS < TH || (second > 0 && bestS - second < MARGIN && second >= TH * 0.9 && !stable)) {
      return { type: null, reason: best ? 'ambiguous' : 'unknown', scores: scores, label: null, best: best, bestScore: bestS, q: 0 };
    }
    return { type: best, reason: null, scores: scores, label: LABELS[best], best: best, bestScore: bestS, q: qualityOf(best, rs, axis, scores, bestS) };
  }
  /* '정확한 획' 판정용 품질(0~1): 직선은 축에서 벗어난 정도, 나머지는 모양 점수.
     모양 점수는 모든 방향에서 1.00에 붙는 직선과 달리 휘고 삐뚤어질수록 떨어진다. */
  function qualityOf(type, pts, axis, scores, bestS) {
    if (type === 'vline' || type === 'hline') {
      var a = pts[0], b = pts[pts.length - 1];
      var dev = (axis && axis.dev != null) ? axis.dev : (lineDev(pts, a, b) / Math.max(1, pathLen(pts)));
      return clamp01(1 - dev / 0.10);
    }
    if (type === 'vee') return clamp01(((bestS || 0) - 0.35) / 0.55);
    return clamp01(bestS || 0);
  }

  var NAMES = { vline: '세로선', hline: '가로선', vee: 'V자', circle: '동그라미', square: '네모', tap: '탭', bolt: '번개', tri: '삼각', arc: '반달', spiral: '소용돌이' };
  var TIPS = {
    hline: '가로로 길게 그어 보세요.',
    vline: '세로로 길게 그어 보세요.',
    vee: 'V는 꼭짓점을 더 깊게 그려 보세요.',
    square: '네모는 네 변을 닫아 보세요.',
    circle: '동그라미는 더 둥글게 닫아 보세요.',
    tap: '점을 찍거나 짧게 눌러 보세요.',
    tri: '세모는 세 꼭짓점을 또렷하게 닫아 보세요.',
    arc: '반달(◡)은 U자처럼 둥글게 반만 그어 보세요.',
    spiral: '소용돌이는 두 바퀴쯤 감으며 넓혀 보세요.'
  };
  function readMessage(rec) {
    if (!rec) return '';
    var key = rec.best || rec.type;
    if (!key) return '';
    var name = NAMES[key] || key;
    var glyph = LABELS[key] || '';
    var tip = TIPS[key] || '';
    return name + (glyph ? '(' + glyph + ')' : '') + '으로 읽었어요. ' + tip;
  }

  var API = {
    recognize: recognize,
    scoreLineAxis: function (pts) {
      if (!pts || pts.length < 2) return null;
      var d = densify(pts, 10);
      var bb = bbox(d);
      return scoreLineAxis(d, bb, pathLen(d));
    },
    veeApex: veeApex,
    boltGeometry: boltGeometry,
    straightness: straightness,
    BOLT: { minAspect: BOLT_MIN_ASPECT, minCorner: BOLT_MIN_CORNER },
    readMessage: readMessage,
    resample: resample,
    densify: densify,
    pathLen: pathLen,
    bbox: bbox,
    simplify: simplify,
    LABELS: LABELS,
    NAMES: NAMES,
    COMBAT: COMBAT,
    TOTEM: TOTEM
  };
  root.GPGestures = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
