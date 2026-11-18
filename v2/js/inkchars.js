/* 수묵 캐릭터: 주인공(맹인 검객), 좀비, 혼령을 캔버스에 붓 획으로 그린다. 모두 오른쪽을 보고, 왼쪽은 뒤집어 쓴다. */
import { rng, brush, stroke, curve, poly, wash, sheetCanvas } from './inkbrush.js';

/** Cell size, foot anchor and world height of the code-drawn characters (world height = whole cell). */
export const INK_CHARS = {
  cell: 256, anchor: [128, 236],
  heroWorldH: 2.45, zombieWorldH: 2.4, spiritWorldH: 2.16,
  paper: 'rgba(232,222,200,', ink: 'rgba(10,9,12,', inkSoft: 'rgba(48,42,46,',
  red: 'rgba(200,40,30,', jade: 'rgba(46,230,166,', steel: 'rgba(214,226,224,',
  seed: 4242
};

const C = INK_CHARS;

/* ---------- hero ---------- */

function heroPose(action, f, n) {
  const T = (f / n) * Math.PI * 2;
  if (action === 'dash') {
    return { lean: 0.38, crouch: 14, bob: Math.sin(T * 2) * 1.5, wind: 1, flap: T, sword: 'drawn', stride: 0.8 };
  }
  return { lean: 0.04 + Math.sin(T) * 0.01, crouch: 0, bob: Math.sin(T) * 1.2, wind: 0.25, flap: T, sword: 'sheathed', stride: 0 };
}

function drawHero(ctx, pose, rnd) {
  const fx = 128, fy = 236;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(pose.lean);
  ctx.translate(-fx, -fy + pose.crouch);
  const top = 50 + pose.bob;
  const w = pose.wind;

  /* Blindfold tails streaming behind (to the left) — pale cloth against the black coat. */
  for (let k = 0; k < 2; k++) {
    const y0 = top + 44 + k * 3;
    const tail = curve([118, y0], [96 - 24 * w, y0 + 6 + Math.sin(pose.flap + k) * (4 + 6 * w)], [70 - 40 * w, y0 + 18 + Math.sin(pose.flap * 1.3 + k) * (6 + 8 * w)], 14);
    stroke(ctx, tail, 4 - k * 0.8, k ? 'rgba(120,112,100,0.55)' : 'rgba(214,204,184,0.78)');
  }

  /* 검은 무사복(전복) — 갓도 흰 도포도 없다. 좁은 소매, 허리 넓은 띠, 검은 바지와 검은 장화.
     어두운 바닥에 검은 옷이 묻히지 않게 왼쪽(달빛) 가장자리와 어깨·허리 띠에 은은한 한지빛 결을 둔다. */
  const st = pose.stride * 10;
  const hemBack = 84 - 18 * w + Math.sin(pose.flap) * 3 * (0.4 + w);
  const RIM = 'rgba(226,214,190,';      /* 한지빛 테두리 */
  const CLOTH = 'rgba(17,16,19,';       /* 옷 검정 */
  const CLOTHLIT = 'rgba(52,48,50,';    /* 달빛 받은 옷면 */

  /* 장화: 바지 밑으로 나온 긴 목검정 가죽부츠. */
  stroke(ctx, curve([118 - st, 204], [114 - st, 222], [126 - st, 228], 8), 11, CLOTH + '1)');
  stroke(ctx, curve([142 + st, 204], [145 + st, 224], [157 + st, 228], 8), 11, CLOTH + '1)');
  brush(ctx, curve([114 - st, 206], [111 - st, 222], [124 - st, 227], 8), 2, RIM, 0.34, rnd, 3);
  brush(ctx, curve([146 + st, 206], [148 + st, 224], [158 + st, 227], 8), 2, RIM, 0.26, rnd, 3);

  /* 검은 바지: 두 다리가 조금 흔들리는 헐렁한 형태. */
  brush(ctx, curve([120, top + 128], [116 - st * 0.6, top + 172], [118 - st, 206], 10), 18, CLOTH, 1, rnd, 5);
  brush(ctx, curve([141, top + 128], [147 + st * 0.6, top + 174], [147 + st, 206], 10), 18, CLOTH, 1, rnd, 5);
  brush(ctx, curve([124, top + 136], [121 - st * 0.5, top + 176], [123 - st, 202], 8), 3, RIM, 0.20, rnd, 3);

  /* 전복(무사 상의): 어깨에서 허리, 허벅지까지 내려오는 검은 겹옷. */
  const coat = [[110, top + 60], [150, top + 60], [152, top + 86], [156, top + 104], [164, top + 148], [134, top + 154], [hemBack, top + 150], [104, top + 104], [108, top + 86]];
  const g = ctx.createLinearGradient(98, 0, 168, 0);
  g.addColorStop(0, CLOTHLIT + '0.98)'); g.addColorStop(0.34, 'rgba(24,23,26,1)'); g.addColorStop(1, 'rgba(8,8,10,1)');
  poly(ctx, coat, g);
  /* 누빔결: 가슴께의 가로 실금. */
  ctx.save(); ctx.beginPath(); coat.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.clip();
  for (let i = 0; i < 5; i++) {
    brush(ctx, [[104, top + 66 + i * 8], [156, top + 64 + i * 8]], 1.4, RIM, 0.10, rnd, 1);
  }
  wash(ctx, 100, top + 60, 66, 96, 9, 'rgba(6,6,8,', rnd, 5, 18);
  ctx.restore();
  /* 어깨 겹과 옷자락 윤곽. */
  brush(ctx, curve([110, top + 64], [130, top + 61], [150, top + 64], 10), 4, 'rgba(70,64,64,', 0.75, rnd, 4);
  brush(ctx, [[104, top + 148], [134, top + 153], [164, top + 147]], 3, RIM, 0.34, rnd, 4);
  brush(ctx, curve([110, top + 62], [104, top + 96], [hemBack, top + 148], 12), 3, RIM, 0.40, rnd, 4);
  brush(ctx, curve([150, top + 62], [156, top + 104], [164, top + 146], 12), 3, RIM, 0.20, rnd, 3);

  /* 넓은 허리띠: 검은 띠에 한지빛 가장자리를 얹고, 오른쪽에 매듭과 늘어진 띠끝. */
  poly(ctx, [[103, top + 99], [157, top + 99], [159, top + 119], [101, top + 119]], 'rgba(5,5,7,1)');
  stroke(ctx, [[103, top + 100], [157, top + 100]], 1.6, 'rgba(226,214,190,0.42)');
  stroke(ctx, [[101, top + 118], [159, top + 118]], 1.6, 'rgba(196,186,166,0.26)');
  ctx.beginPath(); ctx.ellipse(157, top + 108, 6, 8, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,8,10,1)'; ctx.fill();
  brush(ctx, curve([158, top + 112], [150 - 6 * w, top + 128], [142 - 12 * w, top + 140 + Math.sin(pose.flap) * 3], 10), 4, 'rgba(12,12,14,', 0.95, rnd, 4);

  /* 흰 안감 깃이 목에서 한 줄 보인다 — 검은 옷 위의 밝은 초점. */
  stroke(ctx, [[128, top + 61], [131, top + 71]], 2.6, 'rgba(220,212,194,0.75)');
  stroke(ctx, [[139, top + 61], [136, top + 71]], 2.6, 'rgba(196,188,170,0.62)');

  /* 좁은 소매: 왼팔은 허리로, 오른팔은 칼자루로. */
  brush(ctx, curve([112, top + 66], [106, top + 90], [108, top + 114], 10), 12, CLOTH, 1, rnd, 4);
  brush(ctx, curve([148, top + 66], [166, top + 84], [160, top + 104], 10), 12, CLOTH, 1, rnd, 4);
  brush(ctx, curve([150, top + 70], [166, top + 86], [161, top + 103], 8), 2, RIM, 0.22, rnd, 3);
  stroke(ctx, [[107, top + 116], [109, top + 122]], 6, 'rgba(206,184,156,1)');
  stroke(ctx, [[158, top + 104], [154, top + 108]], 6, 'rgba(206,184,156,1)');

  /* Sword: sheathed at the hip pointing back, or drawn low in front. */
  if (pose.sword === 'sheathed') {
    stroke(ctx, [[152, top + 104], [118, top + 124], [80, top + 146]], 8, 'rgba(12,12,14,1)');
    brush(ctx, [[150, top + 103], [118, top + 121], [82, top + 143]], 2, 'rgba(200,190,170,', 0.5, rnd, 2);
    stroke(ctx, [[152, top + 104], [168, top + 94]], 6, 'rgba(120,92,60,1)');
  } else {
    const blade = [[150, top + 104], [190, top + 128], [236, top + 150]];
    stroke(ctx, blade, 5, C.steel + '0.95)');
    brush(ctx, blade, 2, C.jade, 0.9, rnd, 3);
    stroke(ctx, [[140, top + 98], [150, top + 104]], 6, 'rgba(90,70,50,1)');
    stroke(ctx, [[110, top + 112], [80, top + 130]], 6, 'rgba(12,12,14,1)');
  }

  /* Head: black hair, a black manggeon (상투 두건) and a pale blindfold — no gat.
     The hats are off: the swordsman's face and hair read directly at game size. */
  /* Hair mass behind the face, a touch wider than the head so the black silhouette reads. */
  ctx.beginPath(); ctx.ellipse(129, top + 47, 15, 17, -0.08, 0, Math.PI * 2);
  ctx.fillStyle = C.ink + '1)'; ctx.fill();
  /* Face. */
  ctx.beginPath(); ctx.ellipse(134, top + 50, 10.5, 12.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(214,190,160,1)'; ctx.fill();
  /* Hair line over the brow, a strand falling at the nape (left). */
  brush(ctx, curve([120, top + 42], [122, top + 30], [136, top + 29], 10), 4, C.ink, 0.95, rnd, 4);
  brush(ctx, curve([120, top + 44], [116, top + 56], [118, top + 66], 8), 3, C.ink, 0.9, rnd, 3);
  /* 상투 두건: 이마를 두른 검은 머리띠(망건) — 위엔 작은 상투와 비녀. */
  stroke(ctx, [[121, top + 34], [134, top + 31], [146, top + 34]], 6, 'rgba(9,9,11,1)');
  stroke(ctx, [[122, top + 32], [134, top + 29], [145, top + 32]], 1.6, RIM + '0.30)');
  ctx.beginPath(); ctx.ellipse(130, top + 21, 7.5, 6.5, 0.05, 0, Math.PI * 2);
  ctx.fillStyle = C.ink + '1)'; ctx.fill();
  brush(ctx, curve([122, top + 23], [130, top + 15], [138, top + 21], 8), 2, 'rgba(196,182,158,', 0.85, rnd, 2);
  stroke(ctx, [[124, top + 27], [130, top + 24], [137, top + 27]], 2.6, C.red + '0.9)');
  /* 안대: 눈을 가로지르는 검은 천 한 줄 — 창백한 얼굴 위에 어두운 띠가 또렷하게 남는다. */
  stroke(ctx, [[119, top + 45], [134, top + 47], [147, top + 45]], 6.6, 'rgba(10,10,12,1)');
  stroke(ctx, [[119, top + 42.4], [134, top + 44.4], [147, top + 42.4]], 1.4, 'rgba(232,222,200,0.55)');
  ctx.beginPath(); ctx.arc(118, top + 46, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(214,204,184,0.95)'; ctx.fill();

  /* Speed streaks behind the dash. */
  if (w > 0.6) {
    for (let i = 0; i < 6; i++) {
      const y = top + 60 + i * 26 + rnd() * 8;
      brush(ctx, [[96 - rnd() * 10, y], [40 - rnd() * 30, y + 2]], 4, C.ink, 0.35, rnd, 4);
    }
  }
  ctx.restore();
}

function heroSheet(action, frames, fps, loop) {
  const canvas = sheetCanvas(C.cell, C.cell, frames, function (ctx, f) {
    drawHero(ctx, heroPose(action, f, frames), rng(C.seed + f * 13 + action.length));
  });
  const seq = []; for (let i = 0; i < frames; i++) seq.push(i);
  const states = {}; states[action] = seq;
  const fpsBy = {}; fpsBy[action] = fps;
  return { canvas: canvas, sheet: { frame: [C.cell, C.cell], count: frames, dirs: 1, layout: 'frames-x', anchor: C.anchor.slice(), states: states, fpsByState: fpsBy, fps: fps, loop: loop, screenFlip: true, worldH: C.heroWorldH } };
}

/** Hero sheets: idle (10 frames, 8 fps), dash (8, 18) and a 3-frame afterimage taken from the dash. */
export function drawHeroSheets() {
  const idle = heroSheet('idle', 10, 8, true);
  const dash = heroSheet('dash', 8, 18, true);
  const after = heroSheet('dash', 3, 0, false);
  after.sheet.states = { afterimage: [0, 1, 2] };
  after.sheet.fpsByState = { afterimage: 0 };
  return { idle: idle, dash: dash, afterimage: after };
}

/* ---------- shared ---------- */

/* A flame tongue: a teardrop that bends with `sway`. */
function flame(ctx, x, y, w, h, sway, fill) {
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w * 0.9, y - h * 0.55, x + sway, y - h);
  ctx.quadraticCurveTo(x + w * 0.9, y - h * 0.5, x + w, y);
  ctx.quadraticCurveTo(x, y + w * 0.8, x - w, y);
  ctx.fillStyle = fill; ctx.fill();
}

/* ---------- zombie ---------- */

function drawZombie(ctx, f, n, rnd, status) {
  const T = (f / n) * Math.PI * 2;
  const limp = Math.sin(T), bob = Math.abs(Math.sin(T)) * 4;
  const top = 66 + bob;
  const skin = status === 'ice' ? 'rgba(170,200,214,1)' : 'rgba(132,140,118,1)';
  const cloth = status === 'ice' ? 'rgba(170,186,196,' : 'rgba(150,138,112,';

  /* Legs: one steps, the other drags. */
  const stepX = limp * 14;
  stroke(ctx, curve([122, top + 112], [118 + stepX * 0.5, top + 140], [112 + stepX, 232], 10), 13, cloth + '1)');
  stroke(ctx, curve([136, top + 112], [140, top + 142], [146 - stepX * 0.3, 234], 10), 13, cloth + '0.92)');
  stroke(ctx, [[106 + stepX, 232], [120 + stepX, 234]], 7, C.ink + '1)');
  stroke(ctx, [[142 - stepX * 0.3, 234], [154 - stepX * 0.3, 235]], 7, C.ink + '1)');

  /* Back arm hanging forward. */
  stroke(ctx, curve([132, top + 48], [168, top + 70 + limp * 3], [192, top + 84 + limp * 4], 12), 9, cloth + '0.85)');
  stroke(ctx, [[190, top + 84 + limp * 4], [200, top + 92 + limp * 4]], 7, skin);

  /* Ragged jacket (저고리): hunched, torn hem. */
  const jacket = [[112, top + 34], [148, top + 30], [160, top + 66], [156, top + 118], [148, top + 112], [140, top + 122], [128, top + 112], [118, top + 120], [104, top + 110], [102, top + 70]];
  const g = ctx.createLinearGradient(100, 0, 160, 0);
  g.addColorStop(0, cloth + '0.9)'); g.addColorStop(1, 'rgba(90,82,70,1)');
  poly(ctx, jacket, g);
  ctx.save(); ctx.beginPath(); jacket.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.clip();
  wash(ctx, 100, top + 30, 62, 92, 9, 'rgba(40,34,30,', rnd, 6, 20);
  ctx.restore();
  brush(ctx, jacket.concat([jacket[0]]), 4, C.ink, 0.85, rnd, 5);
  brush(ctx, curve([128, top + 40], [130, top + 80], [126, top + 110], 10), 3, C.ink, 0.6, rnd, 3);

  /* Hunched head: grey skin, loose black hair, dim red eye. */
  ctx.beginPath(); ctx.ellipse(152, top + 22, 13, 14, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = skin; ctx.fill();
  brush(ctx, curve([140, top + 14], [150, top + 34], [164, top + 30], 10), 3, C.ink, 0.8, rnd, 3);
  for (let i = 0; i < 7; i++) {
    const hx = 140 + i * 3.5, sway = Math.sin(T + i) * 2;
    stroke(ctx, curve([hx + 6, top + 8], [hx - 4 + sway, top + 24], [hx - 10 + sway, top + 44 + (i % 3) * 6], 10), 3.2, C.ink + '0.95)');
  }
  ctx.beginPath(); ctx.arc(160, top + 22, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = C.red + '1)'; ctx.fill();

  /* Front arm reaching, claw-like fingers. */
  stroke(ctx, curve([140, top + 46], [176, top + 64 - limp * 3], [204, top + 74 - limp * 4], 12), 10, cloth + '1)');
  brush(ctx, curve([140, top + 44], [176, top + 60 - limp * 3], [204, top + 70 - limp * 4], 12), 3, C.ink, 0.7, rnd, 3);
  for (let k = 0; k < 3; k++) {
    stroke(ctx, [[204, top + 74 - limp * 4], [214 + k, top + 76 + k * 4 - limp * 4]], 3, skin);
  }

  /* Status layers. */
  if (status === 'ice') {
    for (let i = 0; i < 9; i++) {
      const x = 104 + rnd() * 70, y = top + 10 + rnd() * 150, s = 6 + rnd() * 10;
      poly(ctx, [[x, y - s], [x + s * 0.4, y], [x, y + s * 0.6], [x - s * 0.4, y]], 'rgba(222,244,252,0.8)');
    }
    brush(ctx, [[100, top + 120], [176, top + 116]], 6, 'rgba(200,236,248,', 0.7, rnd, 6);
  } else if (status === 'fire') {
    for (let i = 0; i < 4; i++) {
      const x = 112 + i * 15, h = 34 + Math.abs(Math.sin(T * 2 + i * 1.7)) * 26;
      const y = top + 96 + (i % 2) * 14, sw = Math.sin(T * 3 + i) * 8;
      flame(ctx, x, y, 10, h, sw, 'rgba(230,60,30,0.8)');
      flame(ctx, x, y - 2, 5, h * 0.6, sw * 0.6, 'rgba(255,200,110,0.9)');
    }
  } else if (status === 'poison') {
    for (let i = 0; i < 8; i++) {
      const ph = (f / n + i / 8) % 1;
      const x = 110 + (i * 37 % 60) + Math.sin(T + i) * 4, y = top + 120 - ph * 120, r = 3 + (i % 3) * 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(176,77,255,' + (0.8 * (1 - ph)).toFixed(3) + ')'; ctx.fill();
    }
  }
}

function zombieSheet(state, status, frames, fps, loop) {
  const canvas = sheetCanvas(C.cell, C.cell, frames, function (ctx, f) {
    drawZombie(ctx, f, frames, rng(C.seed + 101 + f * 17), status);
  });
  const seq = []; for (let i = 0; i < frames; i++) seq.push(i);
  const states = {}; states[state] = seq;
  const fpsBy = {}; fpsBy[state] = fps;
  return { canvas: canvas, sheet: { frame: [C.cell, C.cell], count: frames, dirs: 1, layout: 'frames-x', anchor: C.anchor.slice(), states: states, fpsByState: fpsBy, fps: fps, loop: loop, screenFlip: true, worldH: C.zombieWorldH } };
}

/** Zombie sheets: limping walk (12 frames, 8 fps) and its frozen, burning and poisoned versions. */
export function drawZombieSheets() {
  return {
    walk: zombieSheet('walk', null, 12, 8, true),
    frozen: zombieSheet('frozen', 'ice', 1, 0, false),
    burning: zombieSheet('burning', 'fire', 12, 12, true),
    poisoned: zombieSheet('poisoned', 'poison', 12, 10, true)
  };
}

/* ---------- spirit ---------- */

/* Will-o'-wisp (도깨비불): a round flame orb with tongues licking up and a tail fading below.
   The orb centre (128, 128) is where art.js puts the shape mark. */
function drawSpirit(ctx, f, n, rnd) {
  const T = (f / n) * Math.PI * 2;
  const cx = 128, cy = 128, R = 58 + Math.sin(T) * 2;
  /* Tail drifting down to the anchor. */
  for (let i = 0; i < 6; i++) {
    const u = i / 5, sw = Math.sin(T + u * 3) * 14 * u;
    const y = cy + 40 + u * 64, r = 26 * (1 - u) + 4;
    const gt = ctx.createRadialGradient(cx + sw, y, 0, cx + sw, y, r);
    gt.addColorStop(0, 'rgba(200,236,224,' + (0.35 * (1 - u)).toFixed(3) + ')'); gt.addColorStop(1, 'rgba(200,236,224,0)');
    ctx.fillStyle = gt; ctx.fillRect(cx + sw - r, y - r, r * 2, r * 2);
  }
  /* Flame tongues around the top of the orb. */
  for (let i = 0; i < 4; i++) {
    const off = (i - 1.5) * 22, h = 46 + Math.abs(Math.sin(T * 2 + i * 1.7)) * 26 - Math.abs(off) * 0.5;
    const bx = cx + off, by = cy - R * 0.55 + Math.abs(off) * 0.35;
    const tx = bx + off * 0.25 + Math.sin(T * 3 + i) * 8, ty = by - h;
    ctx.beginPath();
    ctx.moveTo(bx - 24, by + 14);
    ctx.quadraticCurveTo(bx - 20, by - h * 0.55, tx, ty);
    ctx.quadraticCurveTo(bx + 20, by - h * 0.55, bx + 24, by + 14);
    ctx.closePath();
    ctx.fillStyle = 'rgba(214,246,234,' + (0.55 + 0.25 * Math.sin(T + i)).toFixed(2) + ')';
    ctx.fill();
  }
  /* The orb: bright core, pale body, soft rim. */
  const g = ctx.createRadialGradient(cx, cy - 8, 6, cx, cy, R);
  g.addColorStop(0, 'rgba(255,255,250,1)'); g.addColorStop(0.55, 'rgba(226,248,240,0.95)'); g.addColorStop(0.9, 'rgba(180,222,208,0.8)'); g.addColorStop(1, 'rgba(150,200,186,0)');
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  const ring = [];
  for (let i = 0; i <= 28; i++) { const a = Math.PI * 0.15 + (i / 28) * Math.PI * 1.4; ring.push([cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)]); }
  brush(ctx, ring, 5, 'rgba(110,160,146,', 0.5, rnd, 5);
  /* Two small dark eyes near the top of the orb, above where the mark sits. */
  [-1, 1].forEach(function (sd) {
    ctx.beginPath(); ctx.ellipse(cx + sd * 15, cy - 34, 4, 5.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16,40,34,0.85)'; ctx.fill();
  });
}

/** Spirit sheet: one will-o'-wisp, 10 frames at 10 fps; art.js puts the mark at the orb centre (128, 128). */
export function drawSpiritSheet() {
  const frames = 10;
  const canvas = sheetCanvas(C.cell, C.cell, frames, function (ctx, f) {
    drawSpirit(ctx, f, frames, rng(C.seed + 303 + f * 11));
  });
  const seq = []; for (let i = 0; i < frames; i++) seq.push(i);
  return { canvas: canvas, sheet: { frame: [C.cell, C.cell], count: frames, dirs: 1, layout: 'frames-x', anchor: C.anchor.slice(), states: { idle: seq }, fpsByState: { idle: 10 }, fps: 10, loop: true, worldH: C.spiritWorldH } };
}

/* ---------- tougher zombies ---------- */

/* 장정 귀신: broad shoulders, dark indigo clothes, vermilion headband, a broken plank club. */
function drawBrute(ctx, f, n, rnd) {
  const T = (f / n) * Math.PI * 2;
  const limp = Math.sin(T), bob = Math.abs(Math.sin(T)) * 3;
  const top = 58 + bob;
  const cloth = 'rgba(52,58,84,', skin = 'rgba(120,124,108,1)';
  const st = limp * 12;
  stroke(ctx, curve([118, top + 120], [114 + st * 0.5, top + 150], [108 + st, 232], 10), 18, cloth + '1)');
  stroke(ctx, curve([140, top + 120], [146, top + 150], [150 - st * 0.3, 234], 10), 18, cloth + '0.92)');
  stroke(ctx, [[100 + st, 232], [118 + st, 234]], 9, C.ink + '1)');
  stroke(ctx, [[146 - st * 0.3, 234], [162 - st * 0.3, 235]], 9, C.ink + '1)');
  const torso = [[96, top + 34], [160, top + 26], [176, top + 70], [166, top + 126], [150, top + 118], [136, top + 130], [120, top + 118], [104, top + 128], [90, top + 74]];
  const g = ctx.createLinearGradient(90, 0, 176, 0);
  g.addColorStop(0, cloth + '0.95)'); g.addColorStop(1, 'rgba(24,26,40,1)');
  poly(ctx, torso, g);
  ctx.save(); ctx.beginPath(); torso.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.clip();
  wash(ctx, 90, top + 26, 90, 106, 9, 'rgba(10,10,20,', rnd, 8, 24);
  ctx.restore();
  brush(ctx, torso.concat([torso[0]]), 5, C.ink, 0.9, rnd, 6);
  brush(ctx, torso.slice(0, 3), 6, C.paper, 0.4, rnd, 4);
  /* Head with a vermilion headband and topknot. */
  ctx.beginPath(); ctx.ellipse(150, top + 14, 15, 15, 0.2, 0, Math.PI * 2); ctx.fillStyle = skin; ctx.fill();
  stroke(ctx, [[136, top + 6], [164, top + 4]], 6, C.red + '1)');
  stroke(ctx, curve([136, top + 6], [120, top + 10], [108, top + 22 + Math.sin(T) * 3], 8), 4, C.red + '0.9)');
  ctx.beginPath(); ctx.arc(146, top - 4, 7, 0, Math.PI * 2); ctx.fillStyle = C.ink + '1)'; ctx.fill();
  ctx.beginPath(); ctx.arc(158, top + 14, 2.6, 0, Math.PI * 2); ctx.fillStyle = C.red + '1)'; ctx.fill();
  /* Arm with a broken plank. */
  stroke(ctx, curve([150, top + 44], [182, top + 62 - limp * 3], [200, top + 82 - limp * 4], 10), 13, cloth + '1)');
  stroke(ctx, [[196, top + 70 - limp * 4], [236, top + 20 - limp * 4]], 12, 'rgba(90,68,46,1)');
  brush(ctx, [[198, top + 68 - limp * 4], [234, top + 22 - limp * 4]], 3, C.paper, 0.5, rnd, 2);
  brush(ctx, [[236, top + 20 - limp * 4], [240, top + 10], [232, top + 14]], 3, C.ink, 0.8, rnd, 3);
}

/* 돌덩이 귀신: a hunched heap of stone with ink cracks and ember eyes, moss on its back. */
function drawStone(ctx, f, n, rnd) {
  const T = (f / n) * Math.PI * 2;
  const sway = Math.sin(T) * 3, top = 70 + Math.abs(Math.sin(T)) * 2;
  stroke(ctx, curve([110, top + 120], [104 + sway, top + 150], [100 + sway * 2, 234], 8), 26, 'rgba(46,44,44,1)');
  stroke(ctx, curve([152, top + 120], [158 - sway, top + 150], [162 - sway * 2, 234], 8), 26, 'rgba(36,34,36,1)');
  const body = curve([86, top + 130], [70, top + 40], [128, top + 10], 12).concat(curve([128, top + 10], [196, top + 30], [182, top + 130], 12).slice(1));
  const g = ctx.createRadialGradient(120, top + 50, 10, 128, top + 80, 110);
  g.addColorStop(0, 'rgba(96,92,88,1)'); g.addColorStop(0.7, 'rgba(46,44,46,1)'); g.addColorStop(1, 'rgba(20,18,20,1)');
  poly(ctx, body, g);
  brush(ctx, body, 6, C.ink, 0.9, rnd, 6);
  brush(ctx, body.slice(0, 10), 7, C.paper, 0.35, rnd, 4);
  for (let i = 0; i < 5; i++) {
    const x = 96 + i * 18, y = top + 40 + (i % 2) * 30;
    brush(ctx, [[x, y], [x + 10, y + 18], [x + 4, y + 34]], 3, 'rgba(255,120,40,', 0.55, rnd, 2);
  }
  for (let i = 0; i < 8; i++) brush(ctx, [[96 + i * 10, top + 18 + Math.abs(i - 4) * 4], [100 + i * 10, top + 8 + Math.abs(i - 4) * 4]], 5, 'rgba(60,96,52,', 0.8, rnd, 3);
  [-1, 1].forEach(function (s) {
    ctx.beginPath(); ctx.arc(150 + s * 10, top + 50, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,110,40,' + (0.7 + 0.3 * Math.sin(T * 2)).toFixed(2) + ')'; ctx.fill();
  });
  /* Heavy arms dragging on the ground. */
  stroke(ctx, curve([176, top + 60], [204, top + 100 + sway], [208, 228], 10), 24, 'rgba(40,38,40,1)');
  stroke(ctx, curve([88, top + 60], [70, top + 110 - sway], [78, 230], 10), 22, 'rgba(30,28,30,1)');
}

function variantSheet(type, frames, fps, worldK) {
  const draw = type === 'brute' ? drawBrute : drawStone;
  const canvas = sheetCanvas(C.cell, C.cell, frames, function (ctx, f) { draw(ctx, f, frames, rng(C.seed + 501 + f * 19 + type.length)); });
  const seq = []; for (let i = 0; i < frames; i++) seq.push(i);
  return { canvas: canvas, sheet: { frame: [C.cell, C.cell], count: frames, dirs: 1, layout: 'frames-x', anchor: C.anchor.slice(), states: { walk: seq }, fpsByState: { walk: fps }, fps: fps, loop: true, screenFlip: true, worldH: C.zombieWorldH * worldK } };
}

/** Walk sheets of the tougher zombie kinds: brute (1.25x tall) and stone (1.45x, slow shamble). */
export function drawZombieVariantSheets() {
  return { brute: variantSheet('brute', 12, 9, 1.25), stone: variantSheet('stone', 12, 5, 1.45) };
}
