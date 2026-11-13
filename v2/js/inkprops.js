/* 수묵 소품: 맵의 초가·담장·성문·해태·대나무·장승·서낭당 등을 캔버스에 붓 획으로 그린다. */
import { rng, brush, stroke, curve, poly, wash } from './inkbrush.js';

/** Props are drawn at their atlas pixel size and scaled up by `scale` in the world (the camera is zoomed out 2x). */
export const INK_PROPS = { scale: 2.5, seed: 9001 };

const INK = 'rgba(10,9,12,', SOFT = 'rgba(40,36,38,', PAPER = 'rgba(220,210,188,', RED = 'rgba(200,40,30,', GOLD = 'rgba(217,180,90,';

function mass(ctx, pts, rnd, light) {
  const g = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
  g.addColorStop(0, 'rgba(26,22,22,1)'); g.addColorStop(0.6, 'rgba(14,12,14,1)'); g.addColorStop(1, 'rgba(8,7,9,1)');
  poly(ctx, pts, g);
  ctx.save();
  ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.clip();
  wash(ctx, 0, 0, ctx.canvas.width, ctx.canvas.height, 10, SOFT, rnd, 10, 40);
  ctx.restore();
  brush(ctx, pts.concat([pts[0]]), 5, light || PAPER, 0.45, rnd, 5);
}

function roof(ctx, x0, x1, y, h, rnd, tile) {
  /* Curved Korean eaves: the ends lift. */
  const mid = (x0 + x1) / 2;
  const pts = curve([x0 - 14, y - 8], [mid, y + 6], [x1 + 14, y - 8], 16).concat([[x1 - 10, y - h], [x0 + 10, y - h]]);
  mass(ctx, pts, rnd);
  if (tile) for (let x = x0; x <= x1; x += 12) brush(ctx, [[x, y - h + 4], [x + 2, y]], 3, PAPER, 0.25, rnd, 2);
  brush(ctx, curve([x0 - 14, y - 8], [mid, y + 6], [x1 + 14, y - 8], 16), 4, PAPER, 0.7, rnd, 4);
}

const DRAW = {
  'choga-hut': function (ctx, W, H, ax, ay, rnd) {
    poly(ctx, [[ax - 120, ay], [ax + 120, ay], [ax + 110, ay - 130], [ax - 110, ay - 130]], 'rgba(150,140,118,1)');
    wash(ctx, ax - 120, ay - 130, 240, 130, 8, 'rgba(60,50,40,', rnd, 10, 30);
    poly(ctx, [[ax - 26, ay], [ax + 26, ay], [ax + 26, ay - 80], [ax - 26, ay - 80]], 'rgba(12,10,12,1)');
    brush(ctx, [[ax - 120, ay], [ax - 110, ay - 130], [ax + 110, ay - 130], [ax + 120, ay]], 5, INK, 0.8, rnd, 5);
    /* Rounded thatch (초가지붕) with straw strokes. */
    const thatch = curve([ax - 160, ay - 120], [ax, ay - 330], [ax + 160, ay - 120], 20);
    poly(ctx, thatch, 'rgba(120,104,72,1)');
    for (let i = 0; i < 26; i++) {
      const x = ax - 140 + i * 11;
      brush(ctx, [[x, ay - 118], [x + (rnd() - 0.5) * 10, ay - 170 - rnd() * 90]], 3, 'rgba(60,48,30,', 0.6, rnd, 2);
    }
    brush(ctx, thatch, 6, INK, 0.9, rnd, 6);
    for (let k = 0; k < 3; k++) brush(ctx, curve([ax - 150 + k * 20, ay - 150 - k * 40], [ax, ay - 200 - k * 50], [ax + 150 - k * 20, ay - 150 - k * 40], 16), 2, INK, 0.5, rnd, 2);
  },
  'palace-wall': function (ctx, W, H, ax, ay, rnd) {
    mass(ctx, [[ax - 130, ay], [ax + 130, ay], [ax + 126, ay - 150], [ax - 126, ay - 150]], rnd);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) brush(ctx, [[ax - 120 + c * 44 + (r % 2) * 20, ay - 20 - r * 34], [ax - 90 + c * 44 + (r % 2) * 20, ay - 20 - r * 34]], 2, PAPER, 0.25, rnd, 2);
    roof(ctx, ax - 126, ax + 126, ay - 150, 60, rnd, true);
  },
  torch: function (ctx, W, H, ax, ay, rnd) {
    /* Smouldering bonfire: crossed logs and embers (the flame glow is added by art.js). */
    stroke(ctx, [[ax - 70, ay - 10], [ax + 60, ay - 50]], 22, INK + '1)');
    stroke(ctx, [[ax + 70, ay - 10], [ax - 60, ay - 50]], 22, 'rgba(30,24,22,1)');
    brush(ctx, [[ax - 68, ay - 12], [ax + 58, ay - 52]], 5, PAPER, 0.4, rnd, 3);
    for (let i = 0; i < 14; i++) {
      ctx.beginPath(); ctx.arc(ax + (rnd() - 0.5) * 90, ay - 30 - rnd() * 40, 2 + rnd() * 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,' + Math.floor(80 + rnd() * 120) + ',40,0.9)'; ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(ax - 34, ay - 40); ctx.quadraticCurveTo(ax - 30, ay - 90, ax + 4, ay - 130);
    ctx.quadraticCurveTo(ax + 10, ay - 80, ax + 34, ay - 40); ctx.closePath(); ctx.fillStyle = 'rgba(230,70,30,0.85)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(ax - 14, ay - 42); ctx.quadraticCurveTo(ax - 12, ay - 70, ax + 2, ay - 96);
    ctx.quadraticCurveTo(ax + 6, ay - 66, ax + 14, ay - 42); ctx.closePath(); ctx.fillStyle = 'rgba(255,214,120,0.9)'; ctx.fill();
  },
  'stone-lantern': function (ctx, W, H, ax, ay, rnd) {
    mass(ctx, [[ax - 40, ay], [ax + 40, ay], [ax + 30, ay - 20], [ax - 30, ay - 20]], rnd);
    mass(ctx, [[ax - 14, ay - 20], [ax + 14, ay - 20], [ax + 14, ay - 110], [ax - 14, ay - 110]], rnd);
    mass(ctx, [[ax - 44, ay - 110], [ax + 44, ay - 110], [ax + 40, ay - 170], [ax - 40, ay - 170]], rnd);
    ctx.fillStyle = 'rgba(255,190,90,0.85)'; ctx.fillRect(ax - 14, ay - 156, 28, 30);
    roof(ctx, ax - 50, ax + 50, ay - 170, 30, rnd, false);
    mass(ctx, [[ax - 8, ay - 200], [ax + 8, ay - 200], [ax, ay - 222]], rnd);
  },
  'ssari-fence': function (ctx, W, H, ax, ay, rnd) {
    for (let i = 0; i < 26; i++) {
      const x = ax - 140 + i * 11 + (rnd() - 0.5) * 6;
      brush(ctx, curve([x, ay], [x + (rnd() - 0.5) * 16, ay - 100], [x + (rnd() - 0.5) * 30, ay - 170 - rnd() * 60], 10), 5, INK, 0.85, rnd, 3);
    }
    stroke(ctx, [[ax - 146, ay - 60], [ax + 146, ay - 70]], 8, 'rgba(60,48,36,1)');
    stroke(ctx, [[ax - 146, ay - 120], [ax + 146, ay - 128]], 8, 'rgba(60,48,36,1)');
  },
  'vegetable-patch': function (ctx, W, H, ax, ay, rnd) {
    for (let r = 0; r < 4; r++) {
      const y = ay - 20 - r * 30;
      stroke(ctx, [[ax - 130 + r * 8, y], [ax + 130 - r * 8, y]], 14, 'rgba(40,32,26,1)');
      for (let i = 0; i < 9; i++) {
        const x = ax - 110 + i * 27 + r * 4;
        brush(ctx, curve([x, y], [x - 8, y - 20], [x - 14, y - 30], 6), 4, 'rgba(70,110,60,', 0.8, rnd, 3);
        brush(ctx, curve([x, y], [x + 8, y - 22], [x + 14, y - 28], 6), 4, 'rgba(70,110,60,', 0.8, rnd, 3);
      }
    }
  },
  reeds: function (ctx, W, H, ax, ay, rnd) {
    for (let i = 0; i < 18; i++) {
      const x = ax - 60 + i * 7, h = 180 + rnd() * 120, bend = (rnd() - 0.3) * 50;
      brush(ctx, curve([x, ay], [x + bend * 0.3, ay - h * 0.6], [x + bend, ay - h], 12), 4, INK, 0.9, rnd, 2);
      stroke(ctx, curve([x + bend * 0.9, ay - h + 20], [x + bend * 1.1, ay - h - 4], [x + bend * 1.3, ay - h - 20], 6), 7, 'rgba(180,160,120,0.8)');
    }
  },
  boulder: function (ctx, W, H, ax, ay, rnd) {
    mass(ctx, curve([ax - 130, ay], [ax - 140, ay - 150], [ax - 20, ay - 170], 12).concat(curve([ax - 20, ay - 170], [ax + 140, ay - 160], [ax + 130, ay], 12).slice(1)), rnd);
    brush(ctx, curve([ax - 90, ay - 120], [ax - 30, ay - 160], [ax + 60, ay - 140], 10), 6, PAPER, 0.5, rnd, 5);
  },
  'map2-gate': function (ctx, W, H, ax, ay, rnd) {
    mass(ctx, [[ax - 240, ay], [ax + 240, ay], [ax + 230, ay - 200], [ax - 230, ay - 200]], rnd);
    poly(ctx, curve([ax - 70, ay], [ax, ay - 260], [ax + 70, ay], 16), 'rgba(4,3,5,1)');
    brush(ctx, curve([ax - 70, ay], [ax, ay - 260], [ax + 70, ay], 16), 6, PAPER, 0.6, rnd, 5);
    mass(ctx, [[ax - 150, ay - 200], [ax + 150, ay - 200], [ax + 140, ay - 270], [ax - 140, ay - 270]], rnd);
    roof(ctx, ax - 170, ax + 170, ay - 270, 70, rnd, true);
    /* Broken corner: the roof is cracked and a beam has fallen. */
    stroke(ctx, [[ax + 110, ay - 300], [ax + 190, ay - 220]], 10, 'rgba(60,46,36,1)');
    brush(ctx, [[ax + 40, ay - 340], [ax + 70, ay - 300], [ax + 54, ay - 280]], 3, PAPER, 0.7, rnd, 3);
  },
  'map2-wall': function (ctx, W, H, ax, ay, rnd) {
    const top = [];
    for (let i = 0; i <= 10; i++) top.push([ax - 190 + i * 38, ay - 170 - (i % 2 ? 26 : 0) - rnd() * 10]);
    mass(ctx, [[ax - 190, ay], [ax + 190, ay]].concat(top.reverse()), rnd);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) brush(ctx, [[ax - 180 + c * 46 + (r % 2) * 22, ay - 24 - r * 36], [ax - 148 + c * 46 + (r % 2) * 22, ay - 24 - r * 36]], 2, PAPER, 0.25, rnd, 2);
  },
  'map2-rubble': function (ctx, W, H, ax, ay, rnd) {
    for (let i = 0; i < 9; i++) {
      const x = ax - 130 + rnd() * 260, y = ay - rnd() * 50, s = 24 + rnd() * 36;
      mass(ctx, [[x - s, y], [x + s, y], [x + s * 0.7, y - s], [x - s * 0.6, y - s * 0.9]], rnd);
    }
    stroke(ctx, [[ax - 120, ay - 40], [ax + 90, ay - 120]], 12, 'rgba(60,46,36,1)');
  },
  'map2-banner': function (ctx, W, H, ax, ay, rnd) {
    stroke(ctx, [[ax - 40, ay], [ax - 40, ay - 310]], 9, INK + '1)');
    const T = rnd() * 3;
    const flag = curve([ax - 36, ay - 300], [ax + 40, ay - 290 + Math.sin(T) * 6], [ax + 100, ay - 300], 10).concat(curve([ax + 100, ay - 180], [ax + 30, ay - 170], [ax - 36, ay - 180], 10));
    poly(ctx, flag, RED + '0.95)');
    brush(ctx, flag.concat([flag[0]]), 4, INK, 0.7, rnd, 4);
    brush(ctx, [[ax + 20, ay - 270], [ax + 26, ay - 200]], 6, INK, 0.9, rnd, 5);
    brush(ctx, [[ax + 4, ay - 240], [ax + 44, ay - 244]], 5, INK, 0.9, rnd, 5);
  },
  'map2-barricade': function (ctx, W, H, ax, ay, rnd) {
    stroke(ctx, [[ax - 96, ay - 40], [ax + 96, ay - 40]], 12, 'rgba(60,46,36,1)');
    for (let i = 0; i < 5; i++) {
      const x = ax - 80 + i * 40;
      stroke(ctx, [[x - 30, ay], [x + 20, ay - 170]], 9, INK + '1)');
      stroke(ctx, [[x + 30, ay], [x - 20, ay - 170]], 9, 'rgba(30,24,22,1)');
      brush(ctx, [[x + 18, ay - 160], [x + 22, ay - 176]], 4, PAPER, 0.8, rnd, 3);
    }
  },
  'map2-haetae': function (ctx, W, H, ax, ay, rnd) {
    mass(ctx, [[ax - 90, ay], [ax + 90, ay], [ax + 80, ay - 40], [ax - 80, ay - 40]], rnd);
    /* Seated haetae: haunches, chest, maned head with a horn. */
    mass(ctx, curve([ax - 70, ay - 40], [ax - 90, ay - 150], [ax - 10, ay - 170], 10).concat(curve([ax - 10, ay - 170], [ax + 80, ay - 150], [ax + 60, ay - 40], 10).slice(1)), rnd);
    ctx.beginPath(); ctx.arc(ax + 20, ay - 190, 44, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,18,20,1)'; ctx.fill();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * 0.6 + i * 0.22;
      brush(ctx, curve([ax + 20 + Math.cos(a) * 30, ay - 190 + Math.sin(a) * 30], [ax + 20 + Math.cos(a) * 52, ay - 190 + Math.sin(a) * 52], [ax + 20 + Math.cos(a + 0.3) * 64, ay - 190 + Math.sin(a + 0.3) * 64], 6), 5, PAPER, 0.55, rnd, 3);
    }
    stroke(ctx, [[ax + 24, ay - 232], [ax + 30, ay - 258]], 8, INK + '1)');
    ctx.beginPath(); ctx.arc(ax + 38, ay - 196, 5, 0, Math.PI * 2); ctx.fillStyle = GOLD + '1)'; ctx.fill();
  },
  'map3-bamboo': function (ctx, W, H, ax, ay, rnd) {
    for (let i = 0; i < 7; i++) {
      const x = ax - 140 + i * 46 + (rnd() - 0.5) * 20, lean = (rnd() - 0.5) * 50, h = 330 + rnd() * 80;
      const stem = curve([x, ay], [x + lean * 0.4, ay - h * 0.5], [x + lean, ay - h], 16);
      stroke(ctx, stem, 13, 'rgba(30,40,30,1)');
      for (let k = 1; k < 6; k++) { const p = stem[Math.floor(k * 16 / 6)]; stroke(ctx, [[p[0] - 8, p[1]], [p[0] + 8, p[1]]], 4, PAPER + '0.5)'); }
      for (let k = 0; k < 5; k++) {
        const p = stem[6 + Math.floor(rnd() * 10)], d = rnd() > 0.5 ? 1 : -1;
        stroke(ctx, curve(p, [p[0] + d * 30, p[1] - 6], [p[0] + d * 58, p[1] + 10], 8), 9, 'rgba(20,32,22,0.95)');
      }
    }
  },
  'map3-jangseung': function (ctx, W, H, ax, ay, rnd) {
    [-1, 1].forEach(function (s) {
      const x = ax + s * 54;
      mass(ctx, [[x - 26, ay], [x + 26, ay], [x + 22, ay - 280], [x - 22, ay - 280]], rnd, 'rgba(160,130,90,');
      poly(ctx, [[x - 34, ay - 280], [x + 34, ay - 280], [x + 24, ay - 314], [x - 24, ay - 314]], 'rgba(20,18,20,1)');
      [-1, 1].forEach(function (e) { ctx.beginPath(); ctx.arc(x + e * 10, ay - 246, 7, 0, Math.PI * 2); ctx.fillStyle = PAPER + '0.9)'; ctx.fill(); ctx.beginPath(); ctx.arc(x + e * 10, ay - 246, 3, 0, Math.PI * 2); ctx.fillStyle = INK + '1)'; ctx.fill(); });
      brush(ctx, [[x - 12, ay - 214], [x, ay - 206], [x + 12, ay - 214]], 4, RED, 0.9, rnd, 3);
      for (let k = 0; k < 4; k++) brush(ctx, [[x - 4, ay - 180 + k * 30], [x + 4, ay - 160 + k * 30]], 4, RED, 0.85, rnd, 3);
    });
  },
  'map3-seonangdang': function (ctx, W, H, ax, ay, rnd) {
    for (let i = 0; i < 12; i++) { const x = ax - 90 + rnd() * 180, y = ay - rnd() * 40; mass(ctx, [[x - 18, y], [x + 18, y], [x + 10, y - 22], [x - 10, y - 20]], rnd); }
    stroke(ctx, curve([ax, ay - 30], [ax - 20, ay - 160], [ax + 10, ay - 300], 14), 22, INK + '1)');
    for (let k = 0; k < 6; k++) {
      const by = ay - 200 - k * 18, d = k % 2 ? 1 : -1;
      stroke(ctx, curve([ax, by], [ax + d * 60, by - 30], [ax + d * 110, by - 20 - rnd() * 30], 10), 8, INK + '0.95)');
    }
    /* Cloth strips (오방색) tied to the branches. */
    const cols = [RED, GOLD, 'rgba(46,120,200,', PAPER, 'rgba(40,140,90,'];
    for (let k = 0; k < 10; k++) {
      const x = ax + (rnd() - 0.5) * 180, y = ay - 220 - rnd() * 90;
      stroke(ctx, [[x, y], [x + (rnd() - 0.5) * 8, y + 40 + rnd() * 30]], 6, cols[k % cols.length] + '0.95)');
    }
    stroke(ctx, curve([ax - 60, ay - 110], [ax, ay - 96], [ax + 60, ay - 110], 12), 4, PAPER + '0.8)');
  },
  'map3-bridge': function (ctx, W, H, ax, ay, rnd) {
    const deck = curve([ax - 180, ay - 30], [ax, ay - 120], [ax + 180, ay - 30], 18);
    stroke(ctx, deck, 22, 'rgba(60,46,36,1)');
    brush(ctx, deck.map(function (p) { return [p[0], p[1] - 10]; }), 4, PAPER, 0.6, rnd, 4);
    for (let i = 0; i < 7; i++) { const p = deck[2 + i * 2]; stroke(ctx, [[p[0], p[1]], [p[0], p[1] - 60]], 6, INK + '1)'); }
    stroke(ctx, deck.map(function (p) { return [p[0], p[1] - 60]; }), 6, INK + '1)');
    [-1, 1].forEach(function (s) { stroke(ctx, [[ax + s * 120, ay - 60], [ax + s * 120, ay + 0]], 12, INK + '1)'); });
  },
  'map3-rock': function (ctx, W, H, ax, ay, rnd) {
    mass(ctx, curve([ax - 160, ay], [ax - 150, ay - 130], [ax - 30, ay - 180], 12).concat(curve([ax - 30, ay - 180], [ax + 170, ay - 140], [ax + 160, ay], 12).slice(1)), rnd);
    brush(ctx, curve([ax - 120, ay - 110], [ax - 40, ay - 170], [ax + 70, ay - 150], 10), 6, PAPER, 0.45, rnd, 5);
    for (let i = 0; i < 6; i++) brush(ctx, [[ax - 100 + i * 36, ay - 10], [ax - 90 + i * 36, ay - 30]], 6, 'rgba(60,90,50,', 0.7, rnd, 3);
  },
  'map3-cairn': function (ctx, W, H, ax, ay, rnd) {
    let y = ay;
    for (let i = 0; i < 6; i++) {
      const w = 70 - i * 9, h = 26 - i * 2;
      mass(ctx, curve([ax - w, y], [ax - w, y - h], [ax, y - h - 4], 6).concat(curve([ax, y - h - 4], [ax + w, y - h], [ax + w, y], 6).slice(1)), rnd);
      y -= h;
    }
  }
};

/** Draws prop `name` on a 640x640 canvas, ground anchor (320, 620), one shared pixel scale; null if unknown. */
export function drawProp(name) {
  const fn = DRAW[name];
  if (!fn) return null;
  const c = document.createElement('canvas');
  c.width = 640; c.height = 640;
  fn(c.getContext('2d'), 640, 640, 320, 620, rng(INK_PROPS.seed + name.length * 97));
  return { canvas: c, size: [640, 640], anchor: [320, 620], flame: name === 'torch' ? [0, -80] : null };
}

/** Distant landscape (산수화 원경): a moon and three ridges fading into mist, tinted per map. */
export function drawBackdrop(mapId) {
  const W = 1024, H = 576;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const rnd = rng(INK_PROPS.seed + (mapId || 'map1').length * 13 + (mapId === 'map2' ? 5 : mapId === 'map3' ? 9 : 0));
  const tint = { map1: [60, 40, 32], map2: [30, 38, 56], map3: [34, 50, 34] }[mapId] || [50, 44, 40];
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, 'rgba(8,7,9,1)'); sky.addColorStop(1, 'rgba(' + tint.join(',') + ',1)');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const mx = 720, my = 120;
  const moon = ctx.createRadialGradient(mx, my, 10, mx, my, 120);
  moon.addColorStop(0, 'rgba(240,230,206,0.9)'); moon.addColorStop(0.3, 'rgba(240,230,206,0.25)'); moon.addColorStop(1, 'rgba(240,230,206,0)');
  ctx.fillStyle = moon; ctx.fillRect(mx - 120, my - 120, 240, 240);
  ctx.beginPath(); ctx.arc(mx, my, 34, 0, Math.PI * 2); ctx.fillStyle = 'rgba(240,230,206,0.95)'; ctx.fill();
  for (let layer = 0; layer < 3; layer++) {
    const base = 300 + layer * 90, amp = 140 - layer * 30, a = 0.45 + layer * 0.25;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) {
      const y = base - amp * (0.5 + 0.5 * Math.sin(x * 0.006 + layer * 2.1 + rnd() * 0.2)) * (0.6 + 0.4 * Math.sin(x * 0.017 + layer));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, base - amp, 0, H);
    g.addColorStop(0, 'rgba(10,9,12,' + a.toFixed(2) + ')'); g.addColorStop(0.5, 'rgba(' + tint.join(',') + ',' + (a * 0.5).toFixed(2) + ')'); g.addColorStop(1, 'rgba(10,9,12,0)');
    ctx.fillStyle = g; ctx.fill();
  }
  return c;
}
