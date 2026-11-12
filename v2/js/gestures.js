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
  function scoreVee(pts, bb, L) {
    if (bb.w < 28 || bb.h < 28) return 0;
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
    sc *= clamp01((0.32 - closure) / 0.32);
    sc *= clamp01((0.38 - rs.cv) / 0.38);
    sc *= clamp01((cover - 0.62) / 0.28);
    sc *= clamp01((loops - 0.62) / 0.28) * clamp01((1.45 - loops) / 0.4);
    sc *= clamp01((2.15 - aspect) / 1.15);
    sc *= clamp01((circ - 0.62) / 0.25) * clamp01((1.5 - circ) / 0.45);
    return sc;
  }
  function scoreBolt(pts, bb, L) {
    if (bb.h < 40) return 0;
    var simple = simplify(pts, Math.max(8, bb.diag * 0.1));
    if (simple.length < 4 || simple.length > 8) return 0;
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
    sc *= clamp01((flips - 1.1) / 1.2);
    sc *= clamp01((simple.length - 3.1) / 1.2) * clamp01((8.2 - simple.length) / 3);
    sc *= clamp01((closure - 0.2) / 0.3);
    sc *= clamp01((Math.max(bb.w, bb.h) - 40) / 40);
    // must not be a plain V (3 corners) or circle
    if (flips < 2) sc *= 0.2;
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

  var LABELS = { vline: 'ㅣ', hline: '—', vee: 'V', circle: 'O', bolt: '⚡', tap: '탭', square: 'ㅁ' };
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
      return { type: 'tap', reason: null, scores: { tap: 1 }, label: LABELS.tap, best: 'tap', bestScore: 1 };
    }
    /* Fast flicks often arrive with 2–5 samples. Densify first, then judge by length/shape. */
    pts = densify(pts, 10);
    L0 = pathLen(pts);
    bb0 = bbox(pts);
    if (pts.length < 2) return { type: null, reason: 'short', scores: {}, label: null };
    var L = L0;
    if (L < 36) return { type: null, reason: 'short', scores: {}, label: null };
    var rs = resample(pts, 48);
    var bb = bbox(rs);
    var scores = {
      vline: scoreVline(rs, bb, pathLen(rs)),
      hline: scoreHline(rs, bb, pathLen(rs)),
      vee: scoreVee(rs, bb, pathLen(rs)),
      circle: scoreCircle(rs, bb, pathLen(rs)),
      square: scoreSquare(rs, bb, pathLen(rs)),
      bolt: scoreBolt(rs, bb, pathLen(rs))
    };
    var allowBolt = !!opts.allowBolt;
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
    if (allowBolt && (scores.bolt || 0) >= 0.55 && (scores.bolt || 0) >= bestS - 0.02) {
      best = 'bolt'; bestS = scores.bolt;
    } else if ((scores.square || 0) >= 0.38 && (scores.square || 0) + 0.03 >= (scores.circle || 0) && (scores.square || 0) >= (scores.vee || 0)) {
      best = 'square'; bestS = scores.square;
    } else if ((scores.circle || 0) >= 0.36 && (scores.circle || 0) + 0.08 >= (scores.vee || 0) && (scores.circle || 0) >= (scores.vline || 0) && (scores.circle || 0) >= (scores.hline || 0) && (scores.circle || 0) + 0.04 >= (scores.square || 0)) {
      best = 'circle'; bestS = scores.circle;
    }
    var stable = best === 'circle' || best === 'square';
    if (!best || bestS < TH || (second > 0 && bestS - second < MARGIN && second >= TH * 0.9 && !stable)) {
      return { type: null, reason: best ? 'ambiguous' : 'unknown', scores: scores, label: null, best: best, bestScore: bestS };
    }
    return { type: best, reason: null, scores: scores, label: LABELS[best], best: best, bestScore: bestS };
  }

  var NAMES = { vline: '세로선', hline: '가로선', vee: 'V자', circle: '동그라미', square: '네모', tap: '탭', bolt: '번개' };
  var TIPS = {
    hline: '가로로 길게 그어 보세요.',
    vline: '세로로 길게 그어 보세요.',
    vee: 'V는 꼭짓점을 더 깊게 그려 보세요.',
    square: '네모는 네 변을 닫아 보세요.',
    circle: '동그라미는 더 둥글게 닫아 보세요.',
    tap: '점을 찍거나 짧게 눌러 보세요.'
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
    readMessage: readMessage,
    resample: resample,
    densify: densify,
    pathLen: pathLen,
    bbox: bbox,
    simplify: simplify,
    LABELS: LABELS,
    NAMES: NAMES,
    COMBAT: COMBAT
  };
  root.GPGestures = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
