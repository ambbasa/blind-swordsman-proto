/* 주인공(맹인 검객) — 갓, 진홍 안대, 한지색 도포, 비취 술이 달린 검. 오른쪽(+x)을 본다.
   팔레트는 먹 바탕 + 비취·진홍·금 강조색(palette.js). 단위: 발바닥 y=0, 갓 꼭대기 약 2.55. */
'use strict';
const { PALETTE, M, light } = require('../palette.js');

const ACTIONS = {
  /* 대기: 숨쉬기 — 몸이 살짝 늘었다 줄고, 갓이 따라 끄덕인다. */
  idle(t, p) {
    const s = Math.sin(t * Math.PI * 2);
    p.pose.body = { stretch: 1 + 0.025 * s };
    p.pose.head = { pos: [0, 0.03 * s, 0], rot: [0, 0, -2 * s] };
    p.pose.arm = { rot: [0, 0, 3 * s] };
  },
  /* 돌진: 몸을 앞으로 숙이고 검을 찌르듯 뻗는다. 달리는 흔들림만 반복한다. */
  dash(t, p) {
    const s = Math.sin(t * Math.PI * 2), c = Math.cos(t * Math.PI * 2);
    p.pose.body = { rot: [0, 0, -24 + 3 * s], pos: [0.1, -0.06 + 0.04 * Math.abs(c), 0], stretch: 0.96 };
    p.pose.head = { rot: [0, 0, 10], pos: [0, 0.01 * s, 0] };
    p.pose.arm = { rot: [0, 0, -18 + 6 * c], pos: [0.12, 0.02, 0] };
  }
};

function build({ makeBuilder, makeSculpt, KIT: K }, spec) {
  const B = makeBuilder(4242, PALETTE);
  const S = K.sculpt(makeSculpt(B));
  light(S);
  const tags = K.deform.tags(S);
  const res = 0.045;

  /* 몸: 도포 자락(아래로 퍼짐) + 상체 + 남색 허리띠 + 칼집 */
  S.ball([0, 0.62, 0], [0.36, 0.66, 0.3], M.paper, { tag: 'robe', res });
  S.ball([0.02, 1.32, 0], [0.33, 0.46, 0.26], M.paper, { tag: 'torso', res });
  S.ball([0, 1.02, 0], [0.35, 0.075, 0.29], M.ink, { tag: 'sash', res });
  S.tube([[-0.5, 0.78, 0.26], [0.22, 1.06, 0.3]], 0.05, 0.045, M.ink, { tag: 'sheath', res });
  S.ball([-0.09, 0.07, 0.12], [0.17, 0.08, 0.1], M.ink, { tag: 'shoeL', res });
  S.ball([0.13, 0.07, -0.1], [0.17, 0.08, 0.1], M.ink, { tag: 'shoeR', res });

  /* 머리: 얼굴 + 진홍 안대 + 상투 + 갓(넓은 양태와 모자집) */
  S.ball([0.03, 1.98, 0], 0.25, M.skin, { tag: 'face', res });
  S.ball([0.03, 2.03, 0], [0.262, 0.06, 0.262], M.crimson, { tag: 'blindfold', res: 0.035 });
  S.tube([[-0.2, 2.03, 0.02], [-0.5, 1.86, 0.06]], 0.035, 0.02, M.crimson, { tag: 'bandtail', res: 0.035 });
  S.ball([0.02, 2.24, 0], [0.62, 0.04, 0.62], M.ink, { tag: 'brim', res });
  S.tube([[0.02, 2.24, 0], [0.02, 2.52, 0]], 0.2, 0.17, M.ink, { tag: 'crown', res });
  S.ball([0.02, 2.3, 0], [0.215, 0.03, 0.215], M.gold, { tag: 'hatband', res: 0.035 });

  /* 팔과 검: 앞으로 든 오른팔, 비취 술, 강철 칼날 */
  S.tube([[0.14, 1.56, 0.24], [0.5, 1.26, 0.3]], 0.12, 0.09, M.paper, { tag: 'sleeve', res });
  S.ball([0.54, 1.23, 0.3], 0.075, M.skin, { tag: 'hand', res: 0.035 });
  S.tube([[0.44, 1.2, 0.3], [0.66, 1.27, 0.3]], 0.04, 0.04, M.ink, { tag: 'hilt', res: 0.035 });
  S.ball([0.67, 1.27, 0.3], [0.03, 0.09, 0.09], M.gold, { tag: 'guard', res: 0.03 });
  S.tube([[0.68, 1.275, 0.3], [1.5, 1.52, 0.3]], 0.034, 0.014, M.steel, { tag: 'blade', res: 0.03 });
  S.ball([0.42, 1.08, 0.3], [0.035, 0.1, 0.035], M.jade, { tag: 'tassel', res: 0.03 });
  S.bake();

  const W = B.finish({ cam: { target: [0, 1.3, 0], dist: 10, pitch: 0.2, yaw: 0 }, detail: 14, dither: 0.2 });
  const act = ACTIONS[spec.action];
  K.puppet(W, {
    parts: {
      body: { ids: tags.of('robe', 'torso', 'sash', 'sheath', 'shoeL', 'shoeR'), pivot: [0, 0, 0], slices: 6 },
      head: { ids: tags.of('face', 'blindfold', 'bandtail', 'brim', 'crown', 'hatband'), pivot: [0.02, 1.75, 0], parent: 'body' },
      arm: { ids: tags.of('sleeve', 'hand', 'hilt', 'guard', 'blade', 'tassel'), pivot: [0.14, 1.56, 0.24], parent: 'body' }
    },
    pose(t, dt, puppet) { act(t, puppet); }
  });
  return W;
}

module.exports = {
  worldH: 2.45,
  build,
  /* 셀 전체(256px)가 세로 3.6 단위. 발(y=0)이 anchor y=236 에 오도록 target 높이를 잡는다. */
  view: { viewH: 3.6, yaw: 0, pitch: 0.22, target: [0.25, 1.46, 0] },
  sheets: {
    idle: { action: 'idle', frames: 10, fps: 8, loop: true, time: (f) => f / 10 },
    dash: { action: 'dash', frames: 8, fps: 18, loop: true, time: (f) => f / 8 },
    after: { action: 'dash', frames: 3, fps: 0, loop: false, time: (f) => [0.125, 0.5, 0.875][f] }
  }
};
