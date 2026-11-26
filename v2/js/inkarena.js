/* v2/js/inkarena.js — v1.56 고정 아레나 무대: 경계(ARENA.R) + GLB 지형지물(glbprops.js) 조립.
   구형 절차적 건물·절벽 링(?props=0 폴백)은 v1.56에서 정리됨. */
import * as THREE from 'three';
import { attachGlbArenaProps, preloadArenaProps } from './glbprops.js?v=v158';
import { actFromStageId, getActTheme3D } from './modules/actTheme3d.js';

preloadArenaProps();

export const ARENA = {
  R: 16.5,        /* 플레이 공간 반경 — 경계 클램프 */
  RIM: 20.0,      /* 건축 띠(플레이 밖) */
  CLIFF: 27,      /* 절벽 링 시작 */
  GROUND: 42,     /* 바닥 평면 반경(넉넉히) */
  SEED: 20261120
};

export function buildArena(opts) {
  opts = opts || {};
  const stageId = opts.stageId || 1;
  const actNo = actFromStageId(stageId);

  const group = new THREE.Group();
  group.name = 'arena-' + stageId;

  let activeTheme = getActTheme3D(actNo);
  function applyActTheme(nextActNo) {
    activeTheme = getActTheme3D(nextActNo);
    return activeTheme;
  }
  function tickTheme() {}

  const glbProps = attachGlbArenaProps(group, {
    stageId: stageId,
    actNo: actNo,
    arenaRadius: ARENA.R,
    seed: opts.seed || ARENA.SEED
  });

  return {
    group: group,
    body: null,
    hull: null,
    glow: null,
    props: [],
    spots: [],
    bounds: { x: 0, z: 0, r: ARENA.R },
    materials: [],
    stats: { props: 0, tri: 0, bodies: 0, glow: 0 },
    lightSpots: [],
    applyActTheme: applyActTheme,
    tickTheme: tickTheme,
    glbProps: glbProps
  };
}

/* 아레나 경계 정보 — game.js 가 클램프에 쓴다. */
export function arenaBounds() { return { x: 0, z: 0, r: ARENA.R }; }
