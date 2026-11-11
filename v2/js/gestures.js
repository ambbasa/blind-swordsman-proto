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
    if (bb.h < 32) return 0;
    var sc = 1;
    sc *= clamp01((ny - 0.62) / 0.28);
    sc *= clamp01((0.50 - nx) / 0.50);
    sc *= clamp01((s - 0.70) / 0.20);
    sc *= clamp01((0.70 - aspect) / 0.70);
    sc *= clamp01((0.28 - dev) / 0.28);
    return sc;
  }
  function scoreHline(pts, bb, L) {
    var a = pts[0], b = pts[pts.length - 1], s = straightness(pts);
    var ny = Math.abs(b.y - a.y) / L, nx = Math.abs(b.x - a.x) / L;
    var dev = lineDev(pts, a, b) / L;
    var aspect = bb.h / bb.w;
    if (bb.w < 32) return 0;
    var sc = 1;
    sc *= clamp01((nx - 0.62) / 0.28);
    sc *= clamp01((0.50 - ny) / 0.50);
    sc *= clamp01((s - 0.70) / 0.20);
    sc *= clamp01((0.70 - aspect) / 0.70);
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
    sc *= clamp01((dropA - 0.22) / 0.35);
    sc *= clamp01((dropB - 0.22) / 0.35);
    sc *= clamp01((0.55 - closeY) / 0.55);
    sc *= clamp01((spread - 0.22) / 0.4);
    sc *= clamp01((sL - 0.68) / 0.22);
    sc *= clamp01((sR - 0.68) / 0.22);
    sc *= clamp01((deg - 24) / 30) * clamp01((155 - deg) / 40);
    sc *= clamp01((down / (left.length - 1) - 0.55) / 0.35);
    sc *= clamp01((up / (right.length - 1) - 0.55) / 0.35);
    sc *= clamp01((bb.w / bb.h - 0.24) / 0.35);
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

  var LABELS = { vline: 'ㅣ', hline: '—', vee: 'V', circle: 'O', bolt: '⚡' };
  var COMBAT = ['vline', 'hline', 'vee', 'circle'];

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
    if (pts.length < 6) return { type: null, reason: 'short', scores: {}, label: null };
    var L = pathLen(pts);
    if (L < 48) return { type: null, reason: 'short', scores: {}, label: null };
    var rs = resample(pts, 48);
    var bb = bbox(rs);
    var scores = {
      vline: scoreVline(rs, bb, pathLen(rs)),
      hline: scoreHline(rs, bb, pathLen(rs)),
      vee: scoreVee(rs, bb, pathLen(rs)),
      circle: scoreCircle(rs, bb, pathLen(rs)),
      bolt: scoreBolt(rs, bb, pathLen(rs))
    };
    var allowBolt = !!opts.allowBolt;
    var keys = allowBolt ? COMBAT.concat(['bolt']) : COMBAT.slice();
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
    } else if ((scores.circle || 0) >= 0.36 && (scores.circle || 0) + 0.08 >= (scores.vee || 0) && (scores.circle || 0) >= (scores.vline || 0) && (scores.circle || 0) >= (scores.hline || 0)) {
      best = 'circle'; bestS = scores.circle;
    }
    if (!best || bestS < TH || (second > 0 && bestS - second < MARGIN && second >= TH * 0.9 && best !== 'circle')) {
      return { type: null, reason: best ? 'ambiguous' : 'unknown', scores: scores, label: null, best: best, bestScore: bestS };
    }
    return { type: best, reason: null, scores: scores, label: LABELS[best], best: best, bestScore: bestS };
  }

  var API = {
    recognize: recognize,
    resample: resample,
    pathLen: pathLen,
    bbox: bbox,
    simplify: simplify,
    LABELS: LABELS,
    COMBAT: COMBAT
  };
  root.GPGestures = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
