#!/usr/bin/env node
/* tools/pixelbake/bake.js — ink-studio(SDF → 픽셀아트 스플랫) 모델을 게임용 스프라이트 시트로 굽는다.
 *
 *   node tools/pixelbake/bake.js            모든 모델을 assets/v2/pixel/ 에 굽는다
 *   node tools/pixelbake/bake.js hero       이름에 'hero' 가 들어간 시트만
 *   node tools/pixelbake/bake.js --preview  시트 대신 어두운 바탕의 확인용 PNG(4배 확대)를 같이 쓴다
 *
 * ink-studio 위치: 환경변수 INK_STUDIO, 없으면 이 저장소 옆의 ../shapeshift-labs-ink-studio.
 * 시트 규격은 v2/js/inkchars.js 와 같다: 셀 256×256, 프레임을 가로로, 발 anchor (128, 236), 오른쪽을 본다.
 * 아트 픽셀 하나 = 화면 픽셀 ART_PX 개(가장 가까운 이웃 확대)라 게임에서 NearestFilter 로 쓰면 격자가 유지된다. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const STUDIO = process.env.INK_STUDIO || path.resolve(ROOT, '..', 'shapeshift-labs-ink-studio');
const OUT = path.join(ROOT, 'assets', 'v2', 'pixel');
const CELL = 256, ANCHOR = [128, 236], ART_PX = 4;

if (!fs.existsSync(path.join(STUDIO, 'index.js'))) {
  console.error('ink-studio 를 찾지 못했습니다: ' + STUDIO + '\nINK_STUDIO 환경변수로 경로를 지정하세요.');
  process.exit(1);
}
const studio = require(STUDIO);
const R = require(path.join(STUDIO, 'cli', 'render.js'));
const PNG = require(path.join(STUDIO, 'cli', 'png.js'));
const kit = studio.load();

/** Advances a world to time t the way the ink-studio CLI does (stateless clips; GPU-bone splats put in place). */
function pose(w, t) {
  if (!w.anim) return;
  w.anim.update(1 / 60, t);
  if (w.anim.bones) {
    if (!w.rest) w.rest = w.data;
    w.data = kit.KIT.bones.posed({
      data: w.rest, anim: w.anim,
      get posedBuf() { return w.posedBuf; }, set posedBuf(v) { w.posedBuf = v; }
    });
  }
}

/** Renders one frame as an RGBA cell (nearest-neighbour upscaled art pixels, background keyed out). */
function renderCell(world, view) {
  const n = CELL / ART_PX;
  const o = Object.assign({ w: CELL, h: CELL, px: ART_PX, ortho: true, atmosphere: false, reflections: false }, view);
  /* viewH: 셀 세로가 담는 모델 높이(단위). 평행 투영의 화면 크기는 dist * tan(FOV/2) 로 정해진다. */
  if (o.viewH) o.dist = o.viewH / 2 / Math.tan(R.FOV / 2);
  const im = R.render(world, o);
  if (im.w !== n || im.h !== n) throw new Error('unexpected render size ' + im.w + 'x' + im.h);
  /* 알파: 팔레트 0번(바탕색)은 어떤 재질도 쓰지 않으므로 '바탕색이 아닌 픽셀'이 곧 캐릭터다.
     (렌더러의 captureCoverage 는 평행 투영·포즈가 색 렌더와 어긋나 쓸 수 없었다.) */
  const bg = world.pal[0], br = (bg >> 16) & 255, bgG = (bg >> 8) & 255, bb = bg & 255;
  const out = new Uint8Array(CELL * CELL * 4);
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const s = ((y / ART_PX) | 0) * n + ((x / ART_PX) | 0), d = (y * CELL + x) * 4;
      const r = im.rgb[s * 3], g = im.rgb[s * 3 + 1], b = im.rgb[s * 3 + 2];
      const a = (r === br && g === bgG && b === bb) ? 0 : 255;
      out[d] = a ? r : 0; out[d + 1] = a ? g : 0; out[d + 2] = a ? b : 0; out[d + 3] = a;
    }
  }
  return out;
}

/** Bakes model sheets. A model module returns { build(kit) -> world, view, sheets: { name: { frames, time(f) } } }. */
function bakeModel(name, model, filter, preview) {
  const written = [];
  for (const sheetName of Object.keys(model.sheets)) {
    const id = name + '-' + sheetName;
    if (filter && !id.includes(filter)) continue;
    const spec = model.sheets[sheetName];
    const world = model.build(kit, spec);
    const strip = new Uint8Array(CELL * spec.frames * CELL * 4);
    for (let f = 0; f < spec.frames; f++) {
      pose(world, spec.time(f));
      const cell = renderCell(world, Object.assign({}, model.view, spec.view));
      for (let y = 0; y < CELL; y++) {
        strip.set(cell.subarray(y * CELL * 4, (y + 1) * CELL * 4), (y * CELL * spec.frames + f * CELL) * 4);
      }
    }
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, id + '.png');
    fs.writeFileSync(file, PNG.encode(CELL * spec.frames, CELL, strip, 4));
    written.push(file);
    if (preview) {
      /* 확인용: 게임 바닥과 비슷한 어두운 바탕에 올리고 anchor 를 붉은 점으로 찍는다. */
      const W = CELL * spec.frames, rgb = new Uint8Array(W * CELL * 3);
      for (let i = 0; i < W * CELL; i++) {
        const a = strip[i * 4 + 3] / 255;
        rgb[i * 3] = strip[i * 4] * a + 34 * (1 - a); rgb[i * 3 + 1] = strip[i * 4 + 1] * a + 36 * (1 - a); rgb[i * 3 + 2] = strip[i * 4 + 2] * a + 40 * (1 - a);
      }
      for (let f = 0; f < spec.frames; f++) {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const q = ((ANCHOR[1] + dy) * W + f * CELL + ANCHOR[0] + dx) * 3;
          rgb[q] = 255; rgb[q + 1] = 40; rgb[q + 2] = 40;
        }
      }
      const pf = path.join(OUT, '_preview-' + id + '.png');
      fs.writeFileSync(pf, PNG.encode(W, CELL, rgb, 3));
      written.push(pf);
    }
    console.log('baked', id, spec.frames + ' frames', world.count + ' splats');
  }
  return written;
}

function main() {
  const args = process.argv.slice(2);
  const preview = args.includes('--preview');
  const filter = args.find((a) => !a.startsWith('--')) || '';
  const dir = path.join(__dirname, 'models');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  const manifest = { cell: CELL, anchor: ANCHOR, artPx: ART_PX, sheets: {} };
  for (const f of files) {
    const name = path.basename(f, '.js');
    const model = require(path.join(dir, f));
    bakeModel(name, model, filter, preview);
    for (const s of Object.keys(model.sheets)) {
      const sp = model.sheets[s];
      manifest.sheets[name + '-' + s] = { file: name + '-' + s + '.png', frames: sp.frames, fps: sp.fps || 0, loop: sp.loop !== false, worldH: model.worldH };
    }
  }
  fs.writeFileSync(path.join(OUT, 'pixel-manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log('wrote', path.join(OUT, 'pixel-manifest.json'));
}
main();
