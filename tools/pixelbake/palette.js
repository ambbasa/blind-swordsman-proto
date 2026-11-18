/* 픽셀 룩 공통 팔레트: 먹 바탕 + 한지 + 비취·진홍·금·강철 강조색.
   모든 모델이 같은 팔레트를 쓰고, 화면 후처리(v2/js/pixellook.js)도 같은 색으로 양자화한다.
   재질은 어두운 → 밝은 순서의 팔레트 인덱스 램프다. */
'use strict';

const PALETTE = [
  0x07080b, /* 0 바탕 */
  0x14151a, 0x25272e, 0x3d4049, 0x5f636c, /* 1-4 먹 */
  0x6a6252, 0x9c927b, 0xcfc4a8, 0xf0e7d0, /* 5-8 한지 */
  0x0c4f3d, 0x1fa57e, 0x2ee6a6, 0xa6f7dc, /* 9-12 비취 */
  0x4f100e, 0x9c241c, 0xd8402e, 0xf58a66, /* 13-16 진홍 */
  0x5e410f, 0xa87a1f, 0xe0b23a, 0xf7e08a, /* 17-20 금 */
  0x3f4a54, 0x7d8d96, 0xc2d0d4, 0xf2f8f8, /* 21-24 강철 */
  0x5b4a3c, 0x8c735c, 0xb99a7c, 0xdcc0a0  /* 25-28 살빛 */
];

const M = {
  ink: { r: [1, 2, 3, 4] },
  paper: { r: [5, 6, 7, 8] },
  jade: { r: [9, 10, 11, 12], em: true },
  crimson: { r: [13, 14, 15, 16] },
  gold: { r: [17, 18, 19, 20] },
  steel: { r: [21, 22, 23, 24] },
  skin: { r: [25, 26, 27, 28] }
};

/** 스프라이트용 조명: 카메라 쪽 위에서 비춰 오른쪽을 보는 캐릭터의 앞면이 밝게 읽힌다. bake 전에 부른다. */
function light(S) {
  const v = [0.35, 0.72, 0.6], n = Math.hypot(v[0], v[1], v[2]);
  S.sun = [v[0] / n, v[1] / n, v[2] / n];
  S.amb = 0.3; S.sky = 0.3; S.sunK = 0.7;
}

module.exports = { PALETTE, M, light };
