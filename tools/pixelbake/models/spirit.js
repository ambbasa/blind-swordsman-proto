/* 혼령 — 창백한 한지빛 넋. 비취 불씨를 품고 꼬리를 끌며 떠다닌다. 목에 금빛 종. 오른쪽(+x)을 본다.
   머리 위(표식 자리)는 비워 둔다: 게임이 그 위에 종 모양 표식을 그린다. */
'use strict';
const { PALETTE, M, light } = require('../palette.js');

function build({ makeBuilder, makeSculpt, KIT: K }) {
  const B = makeBuilder(4545, PALETTE);
  const S = K.sculpt(makeSculpt(B));
  light(S);
  const tags = K.deform.tags(S);
  const res = 0.045;

  S.ball([0.05, 1.3, 0], [0.5, 0.56, 0.44], M.paper, { tag: 'head', res });
  S.ball([0.34, 1.36, 0.3], [0.09, 0.13, 0.07], M.ink, { tag: 'eyeR', res: 0.03 });
  S.ball([0.02, 1.36, 0.42], [0.09, 0.13, 0.07], M.ink, { tag: 'eyeL', res: 0.03 });
  S.ball([0.22, 1.08, 0.36], [0.1, 0.05, 0.06], M.ink, { tag: 'mouth', res: 0.03 });
  S.ball([0.05, 1.82, 0], [0.12, 0.2, 0.12], M.jade, { tag: 'flame', res: 0.035 });

  S.tube([[0, 0.95, 0], [-0.3, 0.6, 0], [-0.22, 0.32, 0], [-0.42, 0.12, 0]], 0.4, 0.04, M.paper, { tag: 'tail', res });

  S.tube([[0.2, 0.9, 0.3], [0.22, 0.72, 0.34]], 0.015, 0.015, M.crimson, { tag: 'cord', res: 0.03 });
  S.ball([0.22, 0.62, 0.34], [0.1, 0.12, 0.1], M.gold, { tag: 'bell', res: 0.03 });
  S.bake();

  const W = B.finish({ cam: { target: [0, 1.1, 0], dist: 10, pitch: 0.2, yaw: 0 }, detail: 14, dither: 0.2 });
  K.puppet(W, {
    parts: {
      body: { ids: tags.of('head', 'eyeR', 'eyeL', 'mouth'), pivot: [0, 1.3, 0] },
      flame: { ids: tags.flame, pivot: [0.05, 1.7, 0], parent: 'body' },
      tail: { ids: tags.tail, pivot: [0, 1.0, 0], parent: 'body', slices: 6 },
      bell: { ids: tags.of('cord', 'bell'), pivot: [0.2, 0.9, 0.3], parent: 'body' }
    },
    pose(t, dt, p) {
      const a = t * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      p.pose.body = { pos: [0, 0.07 * s, 0], rot: [0, 0, 3 * c] };
      p.pose.flame = { stretch: 1 + 0.25 * Math.sin(a * 2), rot: [0, 0, 8 * c] };
      p.pose.tail = { rot: [0, 0, 10 * s], bend: [0.25 * c, 0] };
      p.pose.bell = { rot: [0, 0, 16 * Math.sin(a + 0.8)] };
    }
  });
  return W;
}

module.exports = {
  worldH: 2.16,
  build,
  view: { viewH: 3.0, yaw: 0, pitch: 0.22, target: [0, 1.5, 0] },
  sheets: { idle: { frames: 10, fps: 10, loop: true, time: (f) => f / 10 } }
};
