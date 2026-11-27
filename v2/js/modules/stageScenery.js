// Layout coordinates are metres, in camera-right / away-from-camera axes.
// Only the 41 authored GLB scenery models from design/scenery-concepts/ are placed.
export const LANDMARKS = {
  marketAwning: { name: '그을린 포목전 좌판', proxy: 'market', height: 3.4, model: 'marketAwning.glb' },
  brokenGate: { name: '기울어진 홍예 성문', proxy: 'door', height: 6, model: 'brokenGate.glb' },
  bambooShrine: { name: '금줄을 두른 서낭목', proxy: 'tree', height: 6, model: 'bambooShrine.glb' },
  moonPavilion: { name: '달맞이 누대', proxy: 'court', height: 5, model: 'moonPavilion.glb' },
  mistPagoda: { name: '깎여 나간 층층 석탑', proxy: 'pagoda', height: 7, model: 'mistPagoda.glb' },
  snowHall: { name: '눈 쌓인 무너진 법당', proxy: 'roof', height: 5, model: 'snowHall.glb' },
  rootArch: { name: '뿌리가 얽힌 고목 아치', proxy: 'deadTree', height: 6, model: 'rootArch.glb' },
  bellGate: { name: '범종을 매단 산문', proxy: 'door', height: 6, model: 'bellGate.glb' },
  bloodAltar: { name: '쪼개진 혈석 제단', proxy: 'altarStone', height: 5, model: 'bloodAltar.glb' },
  ribBridge: { name: '갈비뼈로 엮은 나루다리', proxy: 'ribs', height: 3, model: 'ribBridge.glb' },
  siegeTower: { name: '포대가 무너진 망루', proxy: 'pagoda', height: 7, model: 'siegeTower.glb' },
  riftSpire: { name: '갈라진 심연의 첨탑', proxy: 'spire', height: 7, model: 'riftSpire.glb' },
  corridorPillar: { name: '형벌 회랑의 파손 열주', proxy: 'spire', height: 6, model: 'corridorPillar.glb' },
  ferryJetty: { name: '기울어진 나룻배와 잔교', proxy: 'bridge', height: 3, model: 'ferryJetty.glb' },
  blackPavilion: { name: '검게 탄 중층 누각', proxy: 'court', height: 7, model: 'blackPavilion.glb' },
  sealMonolith: { name: '반으로 갈라진 봉인비', proxy: 'sealStone', height: 6, model: 'sealMonolith.glb' },
  pine_tree: { proxy: 'tree', height: 4.5, model: 'pine_tree.glb' },
  rock_cluster: { proxy: 'rubble', height: 1.3, model: 'rock_cluster.glb' },
  lantern: { proxy: 'lamp', height: 2.2, model: 'lantern.glb' },
  shrine: { proxy: 'shrine', height: 3.6, model: 'shrine.glb' },
  /* v1.66 추가 21종 GLB 지형지물 (슬롯 복원 9종 + 분위기 보강 10종 + 기믹 2종) */
  ruinedWall: { name: '무너진 성벽', proxy: 'wall', height: 3.5, model: 'ruinedWall.glb' },
  deadTree: { name: '고사목', proxy: 'deadTree', height: 4.8, model: 'deadTree.glb' },
  basaltSpire: { name: '현무암 첨탑', proxy: 'spire', height: 5.2, model: 'basaltSpire.glb' },
  bambooGrove: { name: '대나무 숲', proxy: 'grove', height: 5.8, model: 'bambooGrove.glb' },
  boneRibs: { name: '거대 뼈 아치', proxy: 'ribs', height: 2.8, model: 'boneRibs.glb' },
  charredHouse: { name: '불탄 기와집', proxy: 'roof', height: 4.5, model: 'charredHouse.glb' },
  brokenStall: { name: '부서진 장터 좌판', proxy: 'market', height: 2.8, model: 'brokenStall.glb' },
  woodenBridge: { name: '낡은 목교', proxy: 'bridge', height: 2.5, model: 'woodenBridge.glb' },
  corridorGate: { name: '회랑 대문', proxy: 'door', height: 5.5, model: 'corridorGate.glb' },
  warBanner: { name: '찢어진 군기', proxy: 'lamp', height: 3.6, model: 'warBanner.glb' },
  ironBrazier: { name: '무쇠 화로', proxy: 'lamp', height: 1.6, model: 'ironBrazier.glb' },
  bronzeCenser: { name: '청동 향로', proxy: 'lamp', height: 1.8, model: 'bronzeCenser.glb' },
  mossySteps: { name: '이끼 낀 돌계단', proxy: 'rubble', height: 1.2, model: 'mossySteps.glb' },
  moonStele: { name: '달빛 비석', proxy: 'spire', height: 3.2, model: 'moonStele.glb' },
  snowPillar: { name: '눈 덮인 석주', proxy: 'lamp', height: 2.6, model: 'snowPillar.glb' },
  dockPilings: { name: '나루터 말뚝', proxy: 'rubble', height: 2.0, model: 'dockPilings.glb' },
  mapleTree: { name: '단풍나무', proxy: 'tree', height: 4.8, model: 'mapleTree.glb' },
  fernCluster: { name: '고사리 군락', proxy: 'rubble', height: 0.9, model: 'fernCluster.glb' },
  skyLantern: { name: '풍등', proxy: 'lamp', height: 0.9, model: 'skyLantern.glb' },
  interactiveBelfry: { name: '범종각', proxy: 'shrine', height: 4.2, model: 'interactiveBelfry.glb' },
  interactiveBloodstone: { name: '혈석 결정', proxy: 'altarStone', height: 2.8, model: 'interactiveBloodstone.glb' }
};

export const STAGE_SCENERY = {
  // Slot tuple: [key, side, depth, yawDeg?, scaleMul?]
  // Portrait camera sweet spots: backdrop d=+10..+15 (side ±9), mid-sides d=+1..+8 (side ±6.8..±8.8), low foreground d=-7..-10 (side ±5..±6.8).
  1: { name: '잿빛 장터', edge: '#32302e', mid: '#766757', path: '#987552', ground: 'street',
    route: [[-12,-7],[-5,-3],[3,3],[10,9]],
    slots: [
      ['marketAwning', -4.8, 10.5, 12, 1.04], ['charredHouse', 5.2, 12.2, -18, 1.12],
      ['charredHouse', -8.8, 12.5, 28, 0.92], ['ruinedWall', 0.8, 15.2, -8, 0.95],
      ['brokenStall', -7.8, 4.2, 35, 1.0], ['brokenStall', 7.8, 5.6, -30, 0.92],
      ['ironBrazier', 7.4, 1.2, 0, 1.0], ['skyLantern', -6.8, -4.6, 0, 1.15],
      ['rock_cluster', 6.2, -7.8, 40, 1.0], ['ironBrazier', -5.2, -9.2, 0, 0.92]
    ] },
  2: { name: '무너진 성문', edge: '#2c3438', mid: '#677070', path: '#897f6d', ground: 'stone',
    route: [[-3,-16],[0,-6],[0,5],[2,15]],
    slots: [
      ['brokenGate', 0.5, 11.8, 0, 1.08], ['ruinedWall', -6.8, 10.8, 18, 1.05],
      ['ruinedWall', 7.6, 11.2, -18, 1.05], ['siegeTower', -9.4, 13.8, 22, 0.85],
      ['warBanner', -7.4, 5.2, 15, 1.0], ['warBanner', 7.4, 5.0, -15, 1.0],
      ['ironBrazier', -7.4, 0.8, 0, 1.0], ['ironBrazier', 7.4, 0.8, 0, 1.0],
      ['rock_cluster', -5.8, -7.4, 25, 1.15], ['mossySteps', 5.6, -8.2, -20, 1.1]
    ] },
  3: { name: '대나무 골', edge: '#20372f', mid: '#526952', path: '#9c986b', ground: 'trail',
    route: [[-12,-9],[5,-5],[-4,4],[6,14]],
    slots: [
      ['bambooShrine', -3.8, 11.2, 10, 1.05], ['bambooGrove', -8.6, 10.8, 25, 1.08],
      ['bambooGrove', 4.8, 12.6, -20, 1.12], ['bambooGrove', 8.8, 9.6, -35, 0.95],
      ['mapleTree', -7.6, 3.8, 20, 0.95], ['shrine', 7.6, 4.4, -28, 0.88],
      ['lantern', -6.4, 7.6, 0, 1.0], ['fernCluster', -5.6, -7.2, 15, 1.25],
      ['fernCluster', 5.0, -8.6, -30, 1.2], ['rock_cluster', 7.2, -4.4, 50, 1.0]
    ] },
  4: { name: '붉은 달', edge: '#352834', mid: '#735154', path: '#ad7563', ground: 'court',
    route: [[-8,-12],[0,-5],[2,4],[-4,13]],
    slots: [
      ['moonPavilion', 3.2, 11.8, -14, 1.08], ['moonStele', -5.4, 11.4, 16, 1.1],
      ['ruinedWall', -8.8, 11.8, 24, 1.0], ['deadTree', 8.6, 10.6, -22, 1.05],
      ['deadTree', -7.8, 4.2, 30, 0.92], ['bronzeCenser', 7.4, 4.5, 0, 1.05],
      ['skyLantern', -7.4, 0.5, 0, 1.15], ['ironBrazier', -5.4, -7.8, 0, 1.0],
      ['skyLantern', 5.8, -7.4, 0, 1.15], ['mossySteps', 0.4, -10.4, 0, 1.1]
    ] },
  5: { name: '안개 석탑', edge: '#2c4040', mid: '#637779', path: '#91a6a0', ground: 'stone',
    route: [[-10,-14],[-2,-6],[-5,3],[-3,15]],
    slots: [
      ['mistPagoda', -1.8, 11.6, 8, 1.08], ['pine_tree', 6.8, 11.8, -18, 1.1],
      ['pine_tree', -8.2, 11.2, 22, 1.0], ['interactiveBelfry', 7.8, 7.6, -24, 0.88],
      ['mossySteps', -7.4, 5.2, 20, 1.15], ['bronzeCenser', -7.4, 0.6, 0, 1.05],
      ['lantern', 7.4, 1.8, -12, 1.0], ['rock_cluster', -5.8, -7.4, 30, 1.1],
      ['mossySteps', 5.2, -8.8, -15, 1.15], ['fernCluster', 7.0, -4.8, 10, 1.15]
    ] },
  6: { name: '설산 폐사찰', edge: '#414958', mid: '#839297', path: '#b9c3c0', ground: 'trail',
    route: [[10,-15],[3,-6],[5,2],[-6,13]],
    slots: [
      ['snowHall', -3.2, 11.6, 12, 1.12], ['pine_tree', 6.6, 11.4, -20, 1.08],
      ['snowPillar', 2.8, 13.8, -8, 1.05], ['deadTree', -8.8, 10.4, 24, 0.95],
      ['snowPillar', -7.4, 5.0, 16, 1.0], ['snowPillar', 7.6, 4.6, -16, 1.0],
      ['bronzeCenser', 7.4, 0.4, 0, 1.05], ['rock_cluster', -5.2, -8.4, 18, 1.15],
      ['lantern', 5.8, -7.8, -10, 1.0], ['snowPillar', -7.0, -4.2, 25, 0.85]
    ] },
  7: { name: '고목 골', edge: '#353329', mid: '#676748', path: '#88734f', ground: 'trail',
    route: [[9,-12],[-5,-5],[4,4],[-7,13]],
    slots: [
      ['rootArch', 2.4, 10.6, -10, 1.08], ['deadTree', -5.8, 10.6, 22, 1.12],
      ['mapleTree', 8.2, 10.6, -24, 1.12], ['bambooGrove', -9.2, 12.6, 15, 0.95],
      ['mapleTree', -7.6, 4.2, 32, 1.0], ['deadTree', 7.8, 3.8, -28, 0.95],
      ['mossySteps', -7.4, 0.2, 18, 1.1], ['fernCluster', -5.4, -7.6, 20, 1.3],
      ['fernCluster', 5.0, -8.4, -25, 1.25], ['rock_cluster', 7.2, -4.4, 45, 1.1]
    ] },
  8: { name: '무명 산문', edge: '#302c3c', mid: '#645d70', path: '#9e8668', ground: 'street',
    route: [[2,-16],[2,-6],[0,4],[0,16]],
    slots: [
      ['bellGate', 0.0, 12.0, 0, 1.08], ['shrine', -7.2, 10.6, 20, 1.0],
      ['interactiveBelfry', 7.6, 10.4, -22, 0.98], ['ruinedWall', -10.2, 13.6, 14, 1.0],
      ['lantern', -7.2, 5.2, 10, 1.0], ['lantern', 7.2, 5.2, -10, 1.0],
      ['bronzeCenser', -7.4, 0.4, 0, 1.05], ['ruinedWall', 8.4, 1.8, -35, 0.88],
      ['mossySteps', -5.4, -8.0, 12, 1.15], ['lantern', 5.6, -7.8, -15, 1.0]
    ] },
  9: { name: '혈석 제단', edge: '#35262c', mid: '#714749', path: '#a96759', ground: 'court',
    route: [[9,-14],[6,-5],[-3,2],[-5,13]],
    slots: [
      ['bloodAltar', -1.2, 11.4, 6, 1.12], ['basaltSpire', -7.8, 10.6, 18, 1.08],
      ['basaltSpire', 7.8, 11.4, -22, 1.12], ['interactiveBloodstone', 5.8, 8.0, -14, 1.05],
      ['interactiveBloodstone', -7.4, 4.4, 24, 0.95], ['ironBrazier', 7.4, 3.8, 0, 1.05],
      ['basaltSpire', -8.2, 0.4, 40, 0.82], ['ironBrazier', -5.6, -7.6, 0, 1.05],
      ['rock_cluster', 6.0, -7.4, -30, 1.15]
    ] },
  10: { name: '뼈의 강', edge: '#353538', mid: '#736d63', path: '#ab9b81', ground: 'river',
    route: [[-16,5],[-7,0],[2,3],[15,-6]],
    slots: [
      ['ribBridge', -3.2, 11.4, 14, 1.12], ['boneRibs', 5.8, 10.6, -22, 1.12],
      ['deadTree', 9.2, 12.2, -30, 1.02], ['woodenBridge', -8.4, 9.6, 28, 1.05],
      ['boneRibs', -7.6, 3.6, 32, 1.0], ['dockPilings', 7.4, 4.6, -20, 1.1],
      ['deadTree', 8.0, 0.2, -15, 0.92], ['dockPilings', -5.8, -7.4, 24, 1.15],
      ['rock_cluster', 5.2, -8.4, -18, 1.15], ['boneRibs', 7.0, -4.4, -40, 0.78]
    ] },
  11: { name: '혈월 성채', edge: '#372d32', mid: '#725457', path: '#a16b59', ground: 'stone',
    route: [[9,-14],[4,-5],[4,4],[7,14]],
    slots: [
      ['siegeTower', 3.8, 11.6, -14, 1.08], ['ruinedWall', -3.8, 13.0, 8, 1.08],
      ['ruinedWall', -9.0, 10.4, 28, 1.0], ['warBanner', 8.6, 9.8, -18, 1.08],
      ['warBanner', -7.4, 5.2, 16, 1.05], ['ironBrazier', 7.4, 4.6, 0, 1.05],
      ['ruinedWall', 8.4, 0.8, -32, 0.9], ['ironBrazier', -5.2, -8.2, 0, 1.0],
      ['warBanner', 6.2, -7.0, -22, 0.9], ['rock_cluster', -7.0, -4.2, 35, 1.1]
    ] },
  12: { name: '나락의 심연', edge: '#252830', mid: '#4b4a5b', path: '#8e6978', ground: 'court',
    route: [[-12,-12],[-6,-4],[1,3],[8,13]],
    slots: [
      ['riftSpire', -2.6, 11.4, 10, 1.12], ['basaltSpire', 6.8, 11.4, -20, 1.15],
      ['basaltSpire', -8.6, 10.6, 26, 1.0], ['moonStele', 2.8, 13.6, -8, 1.05],
      ['boneRibs', -7.6, 4.2, 30, 1.05], ['interactiveBloodstone', 7.6, 4.6, -18, 0.95],
      ['basaltSpire', 8.2, 0.2, -35, 0.82], ['rock_cluster', -5.8, -7.6, 20, 1.2],
      ['moonStele', 5.8, -7.8, -22, 0.82]
    ] },
  13: { name: '무간의 회랑', edge: '#40272c', mid: '#795050', path: '#aa7569', ground: 'street',
    route: [[0,-16],[0,-6],[0,6],[0,16]],
    slots: [
      ['corridorPillar', -5.4, 10.4, 10, 1.06], ['corridorPillar', 5.4, 10.4, -10, 1.06],
      ['corridorGate', 0.0, 14.8, 0, 1.12], ['ruinedWall', -7.8, 4.6, 22, 1.0],
      ['ruinedWall', 7.8, 4.6, -22, 1.0], ['interactiveBloodstone', -7.4, 0.0, 15, 0.95],
      ['interactiveBloodstone', 7.4, 0.0, -15, 0.95], ['ironBrazier', -5.6, -7.4, 0, 1.0],
      ['ironBrazier', 5.6, -7.4, 0, 1.0]
    ] },
  14: { name: '망각의 나루', edge: '#293741', mid: '#546b73', path: '#96a8a6', ground: 'river',
    route: [[-13,-10],[-4,-4],[5,1],[11,14]],
    slots: [
      ['ferryJetty', 3.4, 10.6, -14, 1.12], ['deadTree', -6.8, 11.2, 22, 1.08],
      ['dockPilings', -2.2, 13.6, 10, 1.15], ['woodenBridge', 8.4, 10.2, -26, 0.95],
      ['boneRibs', -7.6, 4.4, 28, 1.0], ['lantern', 7.2, 4.8, -12, 1.08],
      ['dockPilings', -7.4, 0.0, 18, 1.05], ['skyLantern', -5.6, -7.4, 0, 1.15],
      ['lantern', 5.2, -8.4, -10, 1.0], ['rock_cluster', 7.2, -4.4, 35, 1.0]
    ] },
  15: { name: '검은 누각', edge: '#302933', mid: '#644d62', path: '#948395', ground: 'stone',
    route: [[-11,-13],[-4,-6],[-3,5],[-6,15]],
    slots: [
      ['blackPavilion', -2.8, 11.8, 12, 1.1], ['charredHouse', 6.6, 12.0, -20, 1.08],
      ['ruinedWall', -8.8, 10.8, 24, 1.02], ['warBanner', -7.4, 4.8, 16, 1.08],
      ['warBanner', 7.4, 4.8, -16, 1.08], ['lantern', 7.4, 0.6, -10, 1.0],
      ['ironBrazier', -7.4, 0.6, 0, 1.0], ['skyLantern', -5.4, -7.8, 0, 1.1],
      ['rock_cluster', 5.8, -7.6, -24, 1.15]
    ] },
  16: { name: '심안의 끝', edge: '#233136', mid: '#536665', path: '#97ada1', ground: 'court',
    route: [[0,-15],[-3,-7],[0,4],[0,15]],
    slots: [
      ['sealMonolith', 0.0, 11.6, 0, 1.14], ['basaltSpire', -7.4, 11.0, 18, 1.1],
      ['basaltSpire', 7.4, 11.0, -18, 1.1], ['moonStele', -4.8, 14.2, 12, 1.0],
      ['moonStele', 4.8, 14.2, -12, 1.0], ['bronzeCenser', -7.2, 4.6, 12, 1.1],
      ['bronzeCenser', 7.2, 4.6, -12, 1.1], ['lantern', -7.4, 0.0, 0, 1.0],
      ['lantern', 7.4, 0.0, 0, 1.0], ['skyLantern', -5.4, -7.8, 0, 1.15],
      ['skyLantern', 5.4, -7.8, 0, 1.15]
    ] }
};

export function groundPoint(side, depth) {
  return { x: (side - depth) * Math.SQRT1_2, z: (-side - depth) * Math.SQRT1_2 };
}
