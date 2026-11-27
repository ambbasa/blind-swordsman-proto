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
  // v1.68: Story-driven, naturally clustered multi-layer dioramas (14-18 props/stage) with
  // river-aligned bridges on Stages 10 & 14 while keeping central combat circle (r >= 7m) open.
  1: { name: '잿빛 장터', edge: '#32302e', mid: '#766757', path: '#987552', ground: 'street',
    route: [[-12,-7],[-5,-3],[3,3],[10,9]],
    slots: [
      // 좌측 상단: 불탄 포목전 골목 군락
      ['marketAwning', -5.4, 9.6, 22, 1.06],
      ['brokenStall', -8.8, 6.2, 42, 0.98],
      ['charredHouse', -9.8, 12.6, 26, 1.08],
      ['ironBrazier', -6.8, 7.6, 0, 0.95],
      // 우측 상단: 무너진 기와집·담장 상가
      ['charredHouse', 5.6, 12.8, -22, 1.15],
      ['ruinedWall', 0.2, 15.2, -10, 1.02],
      ['brokenStall', 8.6, 7.2, -38, 0.94],
      ['mapleTree', 11.4, 11.6, -15, 0.96],
      ['lantern', 6.8, 9.8, -14, 0.95],
      // 좌우 측면·전경: 어지럽혀진 장터 어귀
      ['brokenStall', -8.2, -1.2, 68, 0.90],
      ['ironBrazier', 7.8, 1.4, 0, 1.0],
      ['rock_cluster', -7.2, -4.6, 35, 1.05],
      ['skyLantern', -6.4, -7.2, 0, 1.15],
      ['rock_cluster', 6.8, -6.8, -42, 1.12],
      ['ironBrazier', -4.2, -9.2, 0, 0.92],
      ['skyLantern', 7.6, 4.0, 0, 1.05]
    ] },
  2: { name: '무너진 성문', edge: '#2c3438', mid: '#677070', path: '#897f6d', ground: 'stone',
    route: [[-3,-16],[0,-6],[0,5],[2,15]],
    slots: [
      // 북쪽: 연속 성곽 방어선 (성문 + 좌우 성벽 + 망루)
      ['brokenGate', 0.4, 12.0, 2, 1.12],
      ['ruinedWall', -6.2, 11.6, 12, 1.08],
      ['ruinedWall', 7.0, 11.6, -12, 1.08],
      ['ruinedWall', -12.0, 10.0, 32, 1.0],
      ['siegeTower', -10.4, 14.4, 18, 0.92],
      ['ruinedWall', 12.4, 9.8, -30, 0.96],
      // 성문 진입로: 군기 + 돌계단 + 봉화 화로
      ['mossySteps', 0.4, 8.8, 0, 1.15],
      ['warBanner', -5.6, 8.4, 14, 1.06],
      ['warBanner', 6.2, 8.2, -16, 1.06],
      ['ironBrazier', -7.2, 4.2, 0, 1.02],
      ['ironBrazier', 7.4, 4.0, 0, 1.02],
      ['warBanner', -8.6, 0.6, 24, 0.96],
      // 전경: 무너진 성벽 잔해 군집
      ['rock_cluster', -6.6, -6.4, 20, 1.25],
      ['rock_cluster', -8.4, -4.4, -35, 0.95],
      ['deadTree', 9.0, -3.2, -25, 0.95],
      ['mossySteps', 5.8, -8.4, -18, 1.05]
    ] },
  3: { name: '대나무 골', edge: '#20372f', mid: '#526952', path: '#9c986b', ground: 'trail',
    route: [[-12,-9],[5,-5],[-4,4],[6,14]],
    slots: [
      // 좌상단: 금줄 서낭목 성소 비네트
      ['bambooShrine', -4.2, 10.8, 12, 1.10],
      ['shrine', -8.6, 9.2, 30, 0.90],
      ['lantern', -7.2, 6.8, 14, 0.98],
      ['mossySteps', -4.8, 7.6, 12, 1.05],
      // 배경·측면을 감싸는 다층 청죽 협곡
      ['bambooGrove', -10.8, 12.2, 20, 1.15],
      ['bambooGrove', 1.8, 14.4, -14, 1.18],
      ['bambooGrove', 6.8, 12.6, -24, 1.10],
      ['bambooGrove', 10.6, 8.8, -36, 1.02],
      ['bambooGrove', -9.2, 2.8, 34, 0.98],
      ['bambooGrove', 9.2, 2.6, -28, 0.94],
      // 단풍·바위·고사리 숲바닥 식생
      ['mapleTree', 8.4, 6.0, -22, 0.96],
      ['fernCluster', -7.2, 4.4, 24, 1.25],
      ['rock_cluster', 7.4, -2.4, 48, 1.12],
      ['fernCluster', 6.2, -4.4, -30, 1.30],
      ['fernCluster', -6.2, -6.8, 18, 1.32],
      ['rock_cluster', -8.0, -5.6, -15, 0.96],
      ['lantern', 5.4, -8.2, -16, 0.92]
    ] },
  4: { name: '붉은 달', edge: '#352834', mid: '#735154', path: '#ad7563', ground: 'court',
    route: [[-8,-12],[0,-5],[2,4],[-4,13]],
    slots: [
      // 우상단: 달맞이 누대와 단풍·고사목 정원
      ['moonPavilion', 4.4, 11.4, -18, 1.12],
      ['mossySteps', 3.4, 8.4, -18, 1.05],
      ['mapleTree', 9.8, 10.4, -24, 1.08],
      ['bronzeCenser', 7.4, 6.2, -12, 1.05],
      // 좌상단: 붉은 달빛 비석 제단과 무너진 담장
      ['moonStele', -5.6, 11.2, 18, 1.14],
      ['ruinedWall', -10.2, 12.4, 26, 1.04],
      ['ruinedWall', -1.8, 15.2, 4, 0.98],
      ['deadTree', -8.8, 6.6, 32, 1.02],
      ['lantern', -6.8, 8.4, 16, 0.96],
      // 정원 외곽: 풍등·화로·바위
      ['skyLantern', -7.8, 1.4, 0, 1.15],
      ['skyLantern', 8.2, 2.2, 0, 1.10],
      ['deadTree', 8.8, -2.8, -32, 0.92],
      ['ironBrazier', -6.6, -5.8, 0, 1.0],
      ['skyLantern', 5.6, -7.4, 0, 1.18],
      ['rock_cluster', -8.4, -4.8, 40, 1.05],
      ['mossySteps', -0.4, -9.8, 0, 1.12]
    ] },
  5: { name: '안개 석탑', edge: '#2c4040', mid: '#637779', path: '#91a6a0', ground: 'stone',
    route: [[-10,-14],[-2,-6],[-5,3],[-3,15]],
    slots: [
      // 북서: 안개 석탑 + 계단 + 향로
      ['mistPagoda', -2.4, 11.8, 8, 1.12],
      ['mossySteps', -2.2, 8.4, 8, 1.12],
      ['bronzeCenser', -5.2, 8.2, 16, 1.05],
      // 우측 언덕: 범종각과 소나무 숲
      ['interactiveBelfry', 7.6, 9.2, -26, 0.96],
      ['pine_tree', 5.4, 13.6, -18, 1.12],
      ['pine_tree', 10.8, 12.0, -32, 1.04],
      ['pine_tree', -8.8, 11.8, 22, 1.08],
      ['pine_tree', -10.4, 6.4, 34, 0.94],
      // 참배로 석등·바위·고사리
      ['lantern', 5.6, 6.2, -16, 1.0],
      ['lantern', -7.6, 3.6, 18, 0.98],
      ['rock_cluster', -8.2, 0.4, 28, 1.12],
      ['fernCluster', -7.4, -2.2, 12, 1.20],
      ['rock_cluster', 8.0, -1.6, -38, 1.08],
      ['fernCluster', 6.8, -4.8, -22, 1.24],
      ['mossySteps', 4.6, -8.8, -12, 1.12],
      ['rock_cluster', -5.8, -7.6, 30, 1.14]
    ] },
  6: { name: '설산 폐사찰', edge: '#414958', mid: '#839297', path: '#b9c3c0', ground: 'trail',
    route: [[10,-15],[3,-6],[5,2],[-6,13]],
    slots: [
      // 북서: 눈 쌓인 무너진 법당 + 향로(꺼지지 않은 향) + 계단
      ['snowHall', -3.6, 11.8, 14, 1.14],
      ['mossySteps', -2.8, 8.6, 14, 1.08],
      ['bronzeCenser', 0.4, 8.8, 0, 1.08],
      // 설산 소나무·석주 열주
      ['pine_tree', 5.6, 12.6, -16, 1.14],
      ['pine_tree', 10.2, 9.8, -28, 1.04],
      ['pine_tree', -9.8, 11.4, 24, 1.02],
      ['snowPillar', 2.4, 14.2, -6, 1.08],
      ['snowPillar', -7.8, 6.6, 18, 1.02],
      ['snowPillar', 7.8, 5.4, -18, 1.02],
      ['snowPillar', -7.4, -2.6, 26, 0.88],
      // 설산 고사목·바위·등롱
      ['deadTree', -9.4, 2.2, 34, 0.98],
      ['deadTree', 9.2, -1.0, -28, 0.94],
      ['rock_cluster', -5.8, -7.8, 22, 1.22],
      ['rock_cluster', 8.2, -4.6, -34, 1.05],
      ['lantern', 5.6, -7.8, -14, 1.0]
    ] },
  7: { name: '고목 골', edge: '#353329', mid: '#676748', path: '#88734f', ground: 'trail',
    route: [[9,-12],[-5,-5],[4,4],[-7,13]],
    slots: [
      // 우상단: 뿌리가 얽힌 고목 아치 + 고목 군락
      ['rootArch', 2.8, 10.6, -12, 1.12],
      ['deadTree', -4.8, 11.8, 20, 1.14],
      ['deadTree', 8.6, 11.4, -26, 1.08],
      ['mapleTree', -9.4, 10.6, 28, 1.12],
      ['bambooGrove', -10.8, 14.0, 14, 1.04],
      ['mapleTree', 10.4, 6.4, -32, 1.04],
      // 길을 막듯 뻗은 양측 고사목·단풍나무
      ['deadTree', -8.0, 4.4, 34, 1.0],
      ['deadTree', 8.2, 1.4, -24, 0.96],
      ['mapleTree', -8.4, -2.6, 40, 0.92],
      ['bambooGrove', 10.6, -3.4, -40, 0.90],
      // 숲바닥 식생 (고사리·바위·이끼 계단·외딴 등롱)
      ['mossySteps', -7.5, 0.6, 22, 1.08],
      ['lantern', 6.4, 6.4, -18, 0.94],
      ['fernCluster', -5.8, -7.2, 20, 1.32],
      ['fernCluster', 5.2, -8.2, -26, 1.28],
      ['fernCluster', 7.4, -4.8, 14, 1.20],
      ['rock_cluster', -7.6, -5.8, 42, 1.12],
      ['rock_cluster', 7.6, -1.8, -30, 1.0]
    ] },
  8: { name: '무명 산문', edge: '#302c3c', mid: '#645d70', path: '#9e8668', ground: 'street',
    route: [[2,-16],[2,-6],[0,4],[0,16]],
    slots: [
      // 정북: 산문 축선 (범종 산문 + 좌 사당 + 우 범종각 + 외곽 담장)
      ['bellGate', 0.0, 12.2, 0, 1.12],
      ['shrine', -7.4, 11.0, 20, 1.04],
      ['interactiveBelfry', 7.8, 10.8, -22, 1.02],
      ['ruinedWall', -11.8, 12.6, 24, 1.0],
      ['ruinedWall', 11.8, 12.4, -24, 1.0],
      ['pine_tree', -9.8, 15.2, 14, 1.08],
      ['mapleTree', 9.8, 15.0, -18, 1.05],
      // 참배길 좌우 등롱·향로·담장
      ['bronzeCenser', -4.2, 8.6, 12, 1.04],
      ['bronzeCenser', 4.2, 8.6, -12, 1.04],
      ['lantern', -7.4, 5.2, 10, 1.02],
      ['lantern', 7.4, 5.2, -10, 1.02],
      ['ruinedWall', -9.0, 0.6, 48, 0.88],
      ['ruinedWall', 9.0, 0.6, -48, 0.88],
      ['lantern', -6.8, -4.8, 14, 0.96],
      ['lantern', 6.8, -4.8, -14, 0.96],
      ['mossySteps', 0.6, -9.8, 0, 1.18]
    ] },
  9: { name: '혈석 제단', edge: '#35262c', mid: '#714749', path: '#a96759', ground: 'court',
    route: [[9,-14],[6,-5],[-3,2],[-5,13]],
    slots: [
      // 북쪽 의식 중심: 혈석 제단 + 암봉 왕관
      ['bloodAltar', -1.0, 11.6, 4, 1.15],
      ['basaltSpire', -7.6, 11.4, 18, 1.14],
      ['basaltSpire', 7.4, 11.6, -20, 1.16],
      ['basaltSpire', -11.4, 8.6, 36, 0.94],
      ['basaltSpire', 11.2, 8.2, -34, 0.96],
      // 의식 혈석 결정 + 봉화 화로 + 군기
      ['interactiveBloodstone', 5.2, 8.4, -14, 1.08],
      ['interactiveBloodstone', -6.6, 6.2, 22, 1.02],
      ['interactiveBloodstone', 7.4, 1.8, -26, 0.94],
      ['ironBrazier', -4.6, 8.8, 0, 1.04],
      ['ironBrazier', 7.6, 5.0, 0, 1.02],
      ['warBanner', -8.8, 2.2, 24, 1.0],
      ['warBanner', 9.2, -2.0, -28, 0.96],
      // 전경 암석·화로
      ['basaltSpire', -8.6, -2.6, 44, 0.80],
      ['ironBrazier', -5.4, -7.8, 0, 1.02],
      ['rock_cluster', 6.0, -7.4, -28, 1.22],
      ['rock_cluster', -7.2, -6.2, 22, 1.04]
    ] },
  10: { name: '뼈의 강', edge: '#353538', mid: '#736d63', path: '#ab9b81', ground: 'river',
    // 강물이 북쪽 강변(depth ≈ 8.6..9.6)을 따라 좌→우로 유려하게 흐름
    route: [[-16,8.8],[-5,9.6],[5,9.4],[16,8.2]],
    slots: [
      // ★ 강물 위 수직 배치 다리 2개: ribBridge(로컬 Z=길이) & woodenBridge(로컬 X=길이)
      ['ribBridge', -3.6, 9.5, 5, 1.22],
      ['woodenBridge', 7.8, 8.9, 82, 1.06],
      // 강 건너편(북안) 뼈 아치·고사목 실루엣
      ['boneRibs', 2.2, 13.4, -12, 1.15],
      ['boneRibs', -9.4, 12.6, 22, 1.08],
      ['deadTree', 12.0, 12.2, -28, 1.06],
      ['deadTree', -12.6, 10.6, 30, 0.96],
      // 강가 수변 말뚝·갈비뼈·바위
      ['dockPilings', -8.2, 7.6, 18, 1.12],
      ['dockPilings', 3.4, 7.6, -14, 1.08],
      ['boneRibs', -8.4, 2.6, 34, 1.02],
      ['boneRibs', 8.6, 2.4, -32, 0.96],
      ['deadTree', 9.0, -2.8, -20, 0.94],
      ['fernCluster', -7.4, -2.4, 20, 1.20],
      ['rock_cluster', -6.4, -7.0, 26, 1.18],
      ['dockPilings', 5.8, -7.6, -24, 1.05],
      ['rock_cluster', 7.4, -5.8, -14, 1.02],
      ['lantern', -6.0, 6.4, 12, 0.92]
    ] },
  11: { name: '혈월 성채', edge: '#372d32', mid: '#725457', path: '#a16b59', ground: 'stone',
    route: [[9,-14],[4,-5],[4,4],[7,14]],
    slots: [
      // 북동~북서 L자 성채 성벽 + 무너진 망루
      ['siegeTower', 4.6, 11.8, -14, 1.12],
      ['ruinedWall', -2.4, 13.2, 6, 1.10],
      ['ruinedWall', -8.8, 11.4, 24, 1.06],
      ['ruinedWall', 10.4, 9.6, -34, 1.02],
      ['ruinedWall', -10.0, 5.2, 54, 0.96],
      ['ruinedWall', 9.6, 2.4, -56, 0.94],
      // 공성 진영 군기 + 봉화 화로
      ['warBanner', 8.2, 7.6, -22, 1.10],
      ['warBanner', -6.8, 8.2, 18, 1.08],
      ['warBanner', -7.6, 1.8, 26, 1.0],
      ['warBanner', 7.6, -3.4, -24, 0.96],
      ['ironBrazier', 7.0, 4.6, 0, 1.06],
      ['ironBrazier', -6.6, 4.8, 0, 1.04],
      ['ironBrazier', -5.4, -8.0, 0, 1.02],
      // 전경 파괴 잔해
      ['rock_cluster', -7.4, -4.4, 34, 1.16],
      ['rock_cluster', 6.2, -7.4, -30, 1.12],
      ['mossySteps', 2.4, -9.6, -12, 1.10]
    ] },
  12: { name: '나락의 심연', edge: '#252830', mid: '#4b4a5b', path: '#8e6978', ground: 'court',
    route: [[-12,-12],[-6,-4],[1,3],[8,13]],
    slots: [
      // 심연의 첨탑 + 현무암 협곡
      ['riftSpire', -2.2, 11.6, 10, 1.16],
      ['basaltSpire', 6.4, 12.0, -18, 1.18],
      ['basaltSpire', -8.6, 11.2, 26, 1.06],
      ['basaltSpire', 11.0, 8.4, -32, 0.94],
      ['basaltSpire', -10.8, 6.2, 38, 0.88],
      // 달빛 비석·혈석·뼈 아치 심연 유물
      ['moonStele', 2.6, 14.0, -8, 1.08],
      ['boneRibs', -7.8, 3.6, 30, 1.08],
      ['interactiveBloodstone', 7.4, 4.6, -18, 1.02],
      ['interactiveBloodstone', -7.6, -1.8, 22, 0.92],
      ['basaltSpire', 8.4, -0.8, -36, 0.84],
      ['boneRibs', 7.8, -5.0, -40, 0.88],
      ['rock_cluster', -6.0, -7.4, 20, 1.22],
      ['moonStele', 5.2, -8.2, -22, 0.86],
      ['deadTree', -9.4, -4.6, 28, 0.92]
    ] },
  13: { name: '무간의 회랑', edge: '#40272c', mid: '#795050', path: '#aa7569', ground: 'street',
    route: [[0,-16],[0,-6],[0,6],[0,16]],
    slots: [
      // 회랑 중심 축: 회랑 대문 + 2쌍의 파손 열주(4기)
      ['corridorPillar', -5.4, 10.6, 8, 1.08],
      ['corridorPillar', 5.4, 10.6, -8, 1.08],
      ['corridorGate', 0.0, 15.0, 0, 1.14],
      ['corridorPillar', -7.2, 4.4, 14, 1.0],
      ['corridorPillar', 7.2, 4.4, -14, 1.0],
      // 외벽·혈석·향로·화로 회랑 장식
      ['ruinedWall', -10.2, 8.2, 52, 1.0],
      ['ruinedWall', 10.2, 8.2, -52, 1.0],
      ['interactiveBloodstone', -7.6, -0.4, 16, 0.96],
      ['interactiveBloodstone', 7.6, -0.4, -16, 0.96],
      ['bronzeCenser', -5.6, 7.6, 12, 1.02],
      ['bronzeCenser', 5.6, 7.6, -12, 1.02],
      ['ironBrazier', -6.8, -4.8, 0, 1.02],
      ['ironBrazier', 6.8, -4.8, 0, 1.02],
      ['ironBrazier', -5.2, -8.4, 0, 0.96],
      ['ironBrazier', 5.2, -8.4, 0, 0.96]
    ] },
  14: { name: '망각의 나루', edge: '#293741', mid: '#546b73', path: '#96a8a6', ground: 'river',
    // 검은 강물이 북서(depth≈11)에서 들어와 우측 강변(side≈9.5, depth≈4)을 따라 남동으로 굽이침
    route: [[-15,11.2],[-3,10.6],[6.5,7.6],[14,-2.0]],
    slots: [
      // ★ 물가에 정확히 맞물린 나룻배 잔교(로컬 Z=돌출) + 우측 강을 수직 횡단하는 목교(로컬 X=길이)
      ['ferryJetty', -1.2, 10.3, -6, 1.18],
      ['woodenBridge', 9.2, 4.2, 38, 1.08],
      // 강가 말뚝·등롱·풍등 나루터 풍경
      ['dockPilings', -6.0, 9.6, 12, 1.15],
      ['dockPilings', 3.4, 8.0, -24, 1.12],
      ['dockPilings', 10.8, -0.8, -48, 1.06],
      ['lantern', -3.8, 8.2, 8, 1.06],
      ['lantern', 6.4, 5.2, -26, 1.04],
      ['deadTree', -9.4, 11.4, 24, 1.10],
      ['deadTree', 10.2, 10.4, -22, 1.02],
      ['boneRibs', -8.4, 4.4, 30, 1.0],
      ['skyLantern', -7.6, 0.4, 0, 1.12],
      ['skyLantern', -5.4, -7.2, 0, 1.18],
      ['skyLantern', 6.8, -5.6, 0, 1.10],
      ['lantern', 5.0, -8.4, -14, 0.98],
      ['fernCluster', -7.2, -3.6, 22, 1.24],
      ['rock_cluster', -7.8, -5.8, 36, 1.10]
    ] },
  15: { name: '검은 누각', edge: '#302933', mid: '#644d62', path: '#948395', ground: 'stone',
    route: [[-11,-13],[-4,-6],[-3,5],[-6,15]],
    slots: [
      // 북서: 검게 탄 중층 누각 + 계단 + 향로
      ['blackPavilion', -3.0, 12.0, 12, 1.14],
      ['mossySteps', -2.4, 8.6, 12, 1.10],
      ['bronzeCenser', 1.0, 9.2, -8, 1.06],
      // 좌우 불탄 별채·담장·군기
      ['charredHouse', 6.8, 12.0, -22, 1.10],
      ['ruinedWall', -9.8, 11.0, 26, 1.04],
      ['charredHouse', -10.2, 5.6, 44, 0.92],
      ['ruinedWall', 9.6, 6.2, -36, 0.96],
      ['warBanner', -7.2, 6.6, 16, 1.08],
      ['warBanner', 7.4, 7.0, -18, 1.08],
      ['warBanner', 8.2, -1.6, -28, 0.96],
      // 누각 마당 조명·단풍·잔해
      ['ironBrazier', -7.6, 0.8, 0, 1.04],
      ['lantern', 7.6, 1.8, -12, 1.0],
      ['mapleTree', 10.6, 10.6, -24, 1.02],
      ['skyLantern', -5.6, -7.6, 0, 1.14],
      ['skyLantern', 6.4, -6.2, 0, 1.10],
      ['rock_cluster', 5.8, -8.0, -24, 1.16]
    ] },
  16: { name: '심안의 끝', edge: '#233136', mid: '#536665', path: '#97ada1', ground: 'court',
    route: [[0,-15],[-3,-7],[0,4],[0,15]],
    slots: [
      // 최종 결전 성역: 갈라진 봉인비 + 계단 + 좌우 달빛 비석 & 현무암 반월 진형
      ['sealMonolith', 0.0, 11.8, 0, 1.16],
      ['mossySteps', 0.0, 8.6, 0, 1.15],
      ['moonStele', -5.2, 13.8, 14, 1.08],
      ['moonStele', 5.2, 13.8, -14, 1.08],
      ['basaltSpire', -8.8, 10.8, 22, 1.14],
      ['basaltSpire', 8.8, 10.8, -22, 1.14],
      ['basaltSpire', -11.0, 5.2, 34, 0.92],
      ['basaltSpire', 11.0, 5.2, -34, 0.92],
      // 성역 향로·등롱·부유 풍등
      ['bronzeCenser', -7.2, 4.8, 14, 1.10],
      ['bronzeCenser', 7.2, 4.8, -14, 1.10],
      ['lantern', -7.6, 0.0, 10, 1.02],
      ['lantern', 7.6, 0.0, -10, 1.02],
      ['skyLantern', -6.8, -4.6, 0, 1.12],
      ['skyLantern', 6.8, -4.6, 0, 1.12],
      ['skyLantern', -5.0, -8.2, 0, 1.18],
      ['skyLantern', 5.0, -8.2, 0, 1.18]
    ] }
};

export function groundPoint(side, depth) {
  return { x: (side - depth) * Math.SQRT1_2, z: (-side - depth) * Math.SQRT1_2 };
}
