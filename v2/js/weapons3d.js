/* v2/js/weapons3d.js — v1.81 2D 일러스트 고증 3D 무기·영물 팩토리 (주인공 비취 대도 + 9종 몬스터 전용 무기)
   - Zero-GC 공유 BufferGeometry 캐시(mesh.userData.sharedGeom = true) + 인스턴스별 독립 Material
   - 로비·도감 3D 뷰어 및 인게임 실시간 전투·무기 궤적(WeaponTrail) 100% 공용 적용 */
import * as THREE from 'three';
import { applyForgedMetal } from './modules/metalStudioEnv.js';

const GEO_CACHE = {};
function cachedGeo(key, factory) {
  if (!GEO_CACHE[key]) GEO_CACHE[key] = factory();
  return GEO_CACHE[key];
}

function makeMat(opts) {
  const m = new THREE.MeshStandardMaterial({
    color: opts.color != null ? opts.color : 0xffffff,
    roughness: opts.roughness != null ? opts.roughness : 0.45,
    metalness: opts.metalness != null ? opts.metalness : 0.45,
    emissive: new THREE.Color(opts.emissive != null ? opts.emissive : 0x000000),
    emissiveIntensity: opts.emissiveIntensity != null ? opts.emissiveIntensity : 0.0,
    flatShading: opts.flatShading !== false,
    side: opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity != null ? opts.opacity : 1.0
  });
  if (opts.name) m.name = opts.name;
  m.userData.baseColor = m.color.clone();
  m.userData.baseEmissive = m.emissive.clone();
  m.userData.baseEmissiveInt = m.emissiveIntensity;
  return m;
}

function makeMesh(geoKey, geoFactory, mat, name, opts) {
  const geo = cachedGeo(geoKey, geoFactory);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name || geoKey;
  mesh.userData.sharedGeom = true;
  mesh.frustumCulled = false;
  mesh.castShadow = !!(opts && opts.castShadow);
  if (opts && opts.forged) {
    mesh.userData._forgedWeapon = true;
    const rough = opts.roughness != null ? opts.roughness : 0.24;
    mesh.onBeforeRender = function (r) {
      if (!mat.envMap && r) applyForgedMetal(mat, r, { roughness: rough, envMapIntensity: 0.92 });
    };
  }
  return mesh;
}

function extrude2D(pts, depth, bevel) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: depth,
    bevelEnabled: !!bevel,
    bevelThickness: bevel ? bevel.t : 0,
    bevelSize: bevel ? bevel.s : 0,
    bevelSegments: 1,
    steps: 1
  });
  /* ExtrudeGeometry는 XY 평면에서 +Z로 돌출 -> 두께 중심을 X=0으로 맞추고 날 너비를 Z(+날끝/-등)로 회전 */
  g.translate(0, 0, -depth * 0.5);
  g.rotateY(-Math.PI * 0.5);
  g.computeVertexNormals();
  return g;
}

/* ============================================================================
   1. 주인공 2D 일러스트 고증 비취 대도 (hero_concept_v3.png)
   - hand_r 로컬 좌표계: grip=(-0.0144, 0.0636, -0.0094), dir=(-0.2914, 0.0987, 0.9515)
   - 기존 얇은 Hero_Sword / Hero_Sword_EmberCore 숨기고 굵직한 비취 대도 장착
   ============================================================================ */
const HERO_GRIP_LOCAL = new THREE.Vector3(-0.0144, 0.0636, -0.0094);
const HERO_BLADE_DIR = new THREE.Vector3(-0.2914, 0.0987, 0.9515).normalize();

export function attachHeroGreatDao3D(scene, swordMeshes, allMeshes) {
  let handR = null;
  scene.traverse(function (o) {
    if (o.isBone && o.name === 'hand_r') handR = o;
    if (o.isMesh && /hero_sword/i.test(o.name)) {
      o.visible = false;
    }
  });
  if (!handR) return null;

  /* 기존 숨겨진 Hero_Sword는 swordMeshes에서 제외하고 새 대도 메시를 등록 */
  if (Array.isArray(swordMeshes)) swordMeshes.length = 0;

  const grp = new THREE.Group();
  grp.name = 'Hero_GreatDao_v181';

  /* 칼날 재질: 반투명 짙은 비취빛 다면체 강철 + 민트백색 번개 코어 맥 */
  const bladeMat = makeMat({
    name: 'HeroJadeBlade',
    color: 0x1e9478,
    metalness: 0.72,
    roughness: 0.22,
    emissive: 0x106a56,
    emissiveIntensity: 0.52
  });
  const edgeMat = makeMat({
    name: 'HeroJadeEdge',
    color: 0x7ef7dc,
    metalness: 0.55,
    roughness: 0.18,
    emissive: 0x3adcb6,
    emissiveIntensity: 0.78
  });
  const coreMat = makeMat({
    name: 'HeroJadeCore',
    color: 0xeffffa,
    metalness: 0.05,
    roughness: 0.12,
    emissive: 0x62ffd8,
    emissiveIntensity: 1.55
  });
  const guardMat = makeMat({
    name: 'HeroDaoGuard',
    color: 0x4a3b2c,
    metalness: 0.82,
    roughness: 0.34,
    emissive: 0x16100a,
    emissiveIntensity: 0.14
  });
  const hiltMat = makeMat({
    name: 'HeroDaoHilt',
    color: 0x3b1f1c,
    metalness: 0.12,
    roughness: 0.84
  });

  /* 대도 본체 칼날 (폭이 넓고 칼끝으로 갈수록 묵직하게 휘어지는 한국식 환도·대도 실루엣) */
  const bladeMesh = makeMesh('hero_dao_blade', function () {
    return extrude2D([
      [-0.030, 0.10],
      [0.054, 0.10],
      [0.068, 0.42],
      [0.088, 0.88],
      [0.106, 1.18],
      [0.072, 1.38],
      [0.012, 1.50],
      [-0.036, 1.34],
      [-0.044, 0.92],
      [-0.038, 0.45]
    ], 0.020, { t: 0.008, s: 0.006 });
  }, bladeMat, 'Hero_GreatDao_Blade', { castShadow: true, forged: true, roughness: 0.22 });
  grp.add(bladeMesh);

  /* 날 앞쪽 밝은 비취 칼날 베벨(광택선) */
  const edgeMesh = makeMesh('hero_dao_edge', function () {
    return extrude2D([
      [0.044, 0.12],
      [0.062, 0.12],
      [0.078, 0.44],
      [0.098, 0.89],
      [0.114, 1.19],
      [0.078, 1.40],
      [0.016, 1.52],
      [0.042, 1.32],
      [0.076, 1.12],
      [0.066, 0.84],
      [0.052, 0.42]
    ], 0.007, { t: 0.003, s: 0.002 });
  }, edgeMat, 'Hero_GreatDao_Edge');
  grp.add(edgeMesh);

  /* 중앙 번개빛 균열 에너지 맥 + 마름모 별빛 플레어 2개 */
  const veinMesh = makeMesh('hero_dao_vein', function () {
    return extrude2D([
      [0.002, 0.15], [0.016, 0.15],
      [0.034, 0.42], [0.014, 0.64],
      [0.046, 0.92], [0.026, 1.16],
      [0.016, 1.34], [0.004, 1.30],
      [0.014, 1.12], [0.030, 0.90],
      [0.002, 0.64], [0.020, 0.42]
    ], 0.034, null);
  }, coreMat, 'Hero_GreatDao_EmberCore');
  grp.add(veinMesh);

  const flare1 = makeMesh('hero_dao_flare', function () {
    const g = new THREE.OctahedronGeometry(0.036, 0);
    g.scale(0.55, 1.45, 0.95);
    return g;
  }, coreMat, 'Hero_GreatDao_Flare1');
  flare1.position.set(0, 0.56, 0.022);
  grp.add(flare1);

  const flare2 = makeMesh('hero_dao_flare', function () {
    const g = new THREE.OctahedronGeometry(0.036, 0);
    g.scale(0.55, 1.45, 0.95);
    return g;
  }, coreMat, 'Hero_GreatDao_Flare2');
  flare2.scale.setScalar(0.76);
  flare2.position.set(0, 1.02, 0.036);
  grp.add(flare2);

  /* 청동 타원 코등이(Guard) */
  const guardMesh = makeMesh('hero_dao_guard', function () {
    const g = new THREE.CylinderGeometry(0.072, 0.076, 0.034, 8);
    g.scale(0.68, 1.0, 1.35);
    return g;
  }, guardMat, 'Hero_GreatDao_Guard', { forged: true, roughness: 0.34 });
  guardMesh.position.set(0, 0.095, 0.008);
  grp.add(guardMesh);

  /* 적갈색 끈 감긴 손잡이(Hilt) */
  const hiltMesh = makeMesh('hero_dao_hilt', function () {
    return new THREE.CylinderGeometry(0.024, 0.028, 0.24, 8);
  }, hiltMat, 'Hero_GreatDao_Hilt');
  hiltMesh.position.set(0, -0.04, 0);
  grp.add(hiltMesh);

  /* 자루 끝 발광 비취 마름모 폼멜(Pommel) */
  const pommelMesh = makeMesh('hero_dao_pommel', function () {
    const g = new THREE.OctahedronGeometry(0.044, 0);
    g.scale(0.85, 1.25, 0.85);
    return g;
  }, coreMat, 'Hero_GreatDao_Pommel');
  pommelMesh.position.set(0, -0.185, 0);
  grp.add(pommelMesh);

  /* 정확히 주먹 중심(HERO_GRIP_LOCAL)에 위치시키고 +Y를 칼날 방향(HERO_BLADE_DIR)으로 정렬 */
  grp.position.copy(HERO_GRIP_LOCAL);
  const qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), HERO_BLADE_DIR);
  /* 날(cutting edge +Z)이 손등·전방으로 자연스럽게 서도록 약간의 축 회전 보정 */
  const qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
  grp.quaternion.copy(qAlign).multiply(qSpin);
  handR.add(grp);

  const newMeshes = [bladeMesh, edgeMesh, veinMesh, flare1, flare2, guardMesh, hiltMesh, pommelMesh];
  if (Array.isArray(swordMeshes)) {
    swordMeshes.push(bladeMesh, edgeMesh, veinMesh, flare1, flare2, pommelMesh);
  }
  if (Array.isArray(allMeshes)) {
    for (let i = 0; i < newMeshes.length; i++) allMeshes.push(newMeshes[i]);
  }

  return {
    group: grp,
    meshes: newMeshes,
    baseLocal: new THREE.Vector3(0, 0.16, 0.04),
    tipLocal: new THREE.Vector3(0, 1.48, 0.04)
  };
}

/* ============================================================================
   2. 몬스터 9종 2D 일러스트 고증 3D 무기·영물 빌더
   - 모든 무기는 정규화된 2.4m 캐릭터 기준 단위(local +Y = 무기 축, +Z = 칼날/전면)로 제작
   - 장착 시 scale = targetH / (2.4 * fitScale) 적용 -> 보스·잡몹·도감 어디서나 체형 비례 완벽 일치
   ============================================================================ */
const MONSTER_ALIAS = {
  boss:      'dokkaebi_boss',
  boss_act2: 'gumiho_boss',
  boss_act3: 'jeoseung_boss',
  boss_act4: 'imugi_king_boss',
  minion:    'baekgol_skeleton',
  heavy:     'bulgasari_charger',
  stone:     'jangseung_stone'
};

function buildBaekgolGlaive() {
  /* 백골 정예: 검은 장창·월도(진홍 불씨 균열) */
  const g = new THREE.Group();
  const shaftMat = makeMat({ color: 0x262426, metalness: 0.42, roughness: 0.65 });
  const bladeMat = makeMat({ color: 0x1e2026, metalness: 0.85, roughness: 0.28, emissive: 0x240a08, emissiveIntensity: 0.30 });
  const emberMat = makeMat({ color: 0xffc694, metalness: 0.0, roughness: 0.15, emissive: 0xff4624, emissiveIntensity: 1.55 });
  const collarMat = makeMat({ color: 0x5c4832, metalness: 0.78, roughness: 0.36 });

  const shaft = makeMesh('bg_shaft', function () { return new THREE.CylinderGeometry(0.030, 0.034, 1.85, 7); }, shaftMat, 'Weapon_Glaive_Shaft');
  shaft.position.y = 0.25;
  g.add(shaft);

  const collar = makeMesh('bg_collar', function () { return new THREE.CylinderGeometry(0.056, 0.048, 0.08, 7); }, collarMat, 'Weapon_Glaive_Collar', { forged: true });
  collar.position.y = 1.15;
  g.add(collar);

  const blade = makeMesh('bg_blade', function () {
    return extrude2D([
      [-0.032, 1.18], [0.052, 1.18], [0.095, 1.46],
      [0.125, 1.72], [0.070, 1.98], [-0.015, 2.16],
      [-0.048, 1.82], [-0.044, 1.45]
    ], 0.022, { t: 0.007, s: 0.005 });
  }, bladeMat, 'Weapon_Glaive_Blade', { castShadow: true, forged: true, roughness: 0.26 });
  g.add(blade);

  const core = makeMesh('bg_core', function () {
    return extrude2D([
      [0.004, 1.24], [0.042, 1.24], [0.072, 1.56],
      [0.082, 1.78], [0.032, 2.02], [0.002, 1.94],
      [0.042, 1.72], [0.030, 1.48]
    ], 0.046, null);
  }, emberMat, 'Weapon_Glaive_Core');
  g.add(core);

  return {
    group: g,
    meshes: [shaft, collar, blade, core],
    baseLocal: new THREE.Vector3(0, 1.15, 0.05),
    tipLocal: new THREE.Vector3(0, 2.16, 0.05),
    trail: { col: 0xffd2a8, tail: 0xd93220, glint: 0xff5a38, scale: 1.05 }
  };
}

function buildDokkaebiKanabo() {
  /* 도깨비 대장: 육각 강철 도깨비방망이(가시 돌기 + 용암 균열) */
  const g = new THREE.Group();
  const handleMat = makeMat({ color: 0x32221a, metalness: 0.25, roughness: 0.76 });
  const ironMat = makeMat({ color: 0x26262c, metalness: 0.86, roughness: 0.30, emissive: 0x2c0e08, emissiveIntensity: 0.26 });
  const spikeMat = makeMat({ color: 0x444248, metalness: 0.88, roughness: 0.26 });
  const magmaMat = makeMat({ color: 0xffd89c, metalness: 0.0, roughness: 0.14, emissive: 0xff5418, emissiveIntensity: 1.65 });

  const handle = makeMesh('dk_handle', function () { return new THREE.CylinderGeometry(0.056, 0.064, 0.72, 6); }, handleMat, 'Weapon_Kanabo_Handle');
  handle.position.y = 0.02;
  g.add(handle);

  const club = makeMesh('dk_club', function () { return new THREE.CylinderGeometry(0.185, 0.088, 1.52, 6); }, ironMat, 'Weapon_Kanabo_Body', { castShadow: true, forged: true, roughness: 0.28 });
  club.position.y = 1.10;
  g.add(club);

  const cap = makeMesh('dk_cap', function () { return new THREE.ConeGeometry(0.185, 0.22, 6); }, ironMat, 'Weapon_Kanabo_Cap', { forged: true });
  cap.position.y = 1.97;
  g.add(cap);

  /* 3단 육각 강철 가시 링 */
  const meshes = [handle, club, cap];
  const rows = [
    { y: 0.76, r: 0.118, s: 0.055 },
    { y: 1.16, r: 0.146, s: 0.068 },
    { y: 1.56, r: 0.172, s: 0.078 }
  ];
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let si = 0; si < 6; si++) {
      const ang = (si / 6) * Math.PI * 2 + (ri % 2) * (Math.PI / 6);
      const spk = makeMesh('dk_spike', function () { return new THREE.ConeGeometry(0.036, 0.105, 4); }, spikeMat, 'Weapon_Kanabo_Spike');
      spk.position.set(Math.cos(ang) * row.r, row.y, Math.sin(ang) * row.r);
      spk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(ang), 0.14, Math.sin(ang)).normalize());
      spk.scale.setScalar(row.s / 0.065);
      g.add(spk);
      meshes.push(spk);
    }
  }

  /* 방망이 표면을 가르는 용암 균열 2줄 */
  const crack1 = makeMesh('dk_crack', function () {
    return extrude2D([
      [0.095, 0.56], [0.125, 0.56], [0.168, 1.04],
      [0.152, 1.24], [0.200, 1.66], [0.178, 1.84],
      [0.146, 1.80], [0.166, 1.56], [0.120, 1.22], [0.132, 0.98]
    ], 0.055, null);
  }, magmaMat, 'Weapon_Kanabo_Magma1');
  g.add(crack1);
  meshes.push(crack1);

  const crack2 = crack1.clone();
  crack2.name = 'Weapon_Kanabo_Magma2';
  crack2.rotation.y = Math.PI * 0.85;
  crack2.userData.sharedGeom = true;
  g.add(crack2);
  meshes.push(crack2);

  return {
    group: g,
    meshes: meshes,
    baseLocal: new THREE.Vector3(0, 0.58, 0),
    tipLocal: new THREE.Vector3(0, 2.08, 0),
    trail: { col: 0xffd680, tail: 0xe0301c, glint: 0xff6238, scale: 1.55 }
  };
}

function buildSusalSpear() {
  /* 수살귀: 옥빛 영혼 장창 */
  const g = new THREE.Group();
  const shaftMat = makeMat({ color: 0x1c2529, metalness: 0.35, roughness: 0.72 });
  const jadeMat = makeMat({ color: 0x28c6b8, metalness: 0.52, roughness: 0.20, emissive: 0x16a89c, emissiveIntensity: 0.72 });
  const coreMat = makeMat({ color: 0xe4fffc, metalness: 0.0, roughness: 0.12, emissive: 0x62ffe8, emissiveIntensity: 1.55 });
  const collarMat = makeMat({ color: 0x3b4a4e, metalness: 0.78, roughness: 0.34 });

  const shaft = makeMesh('ss_shaft', function () { return new THREE.CylinderGeometry(0.028, 0.032, 1.86, 7); }, shaftMat, 'Weapon_Spear_Shaft');
  shaft.position.y = 0.24;
  g.add(shaft);

  const collar = makeMesh('ss_collar', function () { return new THREE.OctahedronGeometry(0.068, 0); }, collarMat, 'Weapon_Spear_Collar', { forged: true });
  collar.scale.set(0.85, 1.25, 0.85);
  collar.position.y = 1.18;
  g.add(collar);

  const head = makeMesh('ss_head', function () {
    return extrude2D([
      [0.0, 1.18], [0.112, 1.46], [0.072, 1.82],
      [0.0, 2.18], [-0.072, 1.82], [-0.112, 1.46]
    ], 0.026, { t: 0.008, s: 0.006 });
  }, jadeMat, 'Weapon_Spear_Blade', { castShadow: true, forged: true, roughness: 0.20 });
  g.add(head);

  const core = makeMesh('ss_core', function () {
    return extrude2D([
      [0.0, 1.28], [0.036, 1.50], [0.0, 2.02], [-0.036, 1.50]
    ], 0.038, null);
  }, coreMat, 'Weapon_Spear_Core');
  g.add(core);

  return {
    group: g,
    meshes: [shaft, collar, head, core],
    baseLocal: new THREE.Vector3(0, 1.18, 0),
    tipLocal: new THREE.Vector3(0, 2.20, 0),
    trail: { col: 0xd0fff8, tail: 0x20bca8, glint: 0x72fff0, scale: 1.10 }
  };
}

function buildJeoseungScythe() {
  /* 저승사자 보스: 초대형 초승달 사신의 낫(진홍 백열 삼각 코어) */
  const g = new THREE.Group();
  const shaftMat = makeMat({ color: 0x1c1c22, metalness: 0.72, roughness: 0.36 });
  const bladeMat = makeMat({ color: 0x181920, metalness: 0.90, roughness: 0.22, emissive: 0x2e080c, emissiveIntensity: 0.36 });
  const edgeMat = makeMat({ color: 0x787e8c, metalness: 0.95, roughness: 0.16 });
  const coreMat = makeMat({ color: 0xfff0ec, metalness: 0.0, roughness: 0.12, emissive: 0xff3024, emissiveIntensity: 1.75 });

  const shaft = makeMesh('js_shaft', function () { return new THREE.CylinderGeometry(0.036, 0.042, 2.48, 7); }, shaftMat, 'Weapon_Scythe_Shaft', { forged: true, roughness: 0.38 });
  shaft.position.y = 0.56;
  g.add(shaft);

  const cap = makeMesh('js_cap', function () { return new THREE.ConeGeometry(0.072, 0.24, 6); }, shaftMat, 'Weapon_Scythe_Cap', { forged: true });
  cap.position.y = 1.90;
  g.add(cap);

  /* 초승달처럼 앞으로 크게 휘어 내려오는 낫날 (+Z 방향으로 뻗어 전방 베기!) */
  const blade = makeMesh('js_blade', function () {
    return extrude2D([
      [-0.04, 1.66], [0.24, 1.84], [0.68, 1.92],
      [1.06, 1.76], [1.28, 1.44], [1.20, 1.18],
      [0.98, 1.44], [0.66, 1.62], [0.24, 1.56], [-0.04, 1.46]
    ], 0.024, { t: 0.008, s: 0.006 });
  }, bladeMat, 'Weapon_Scythe_Blade', { castShadow: true, forged: true, roughness: 0.22 });
  g.add(blade);

  const innerEdge = makeMesh('js_edge', function () {
    return extrude2D([
      [0.24, 1.58], [0.66, 1.64], [0.99, 1.46],
      [1.22, 1.17], [1.04, 1.49], [0.68, 1.68], [0.24, 1.63]
    ], 0.012, null);
  }, edgeMat, 'Weapon_Scythe_Edge', { forged: true, roughness: 0.16 });
  g.add(innerEdge);

  /* 낫 목 부위의 발광 진홍 삼각 인장 코어 */
  const core = makeMesh('js_core', function () {
    return extrude2D([
      [0.08, 1.56], [0.46, 1.72], [0.16, 1.78]
    ], 0.042, null);
  }, coreMat, 'Weapon_Scythe_Core');
  g.add(core);

  return {
    group: g,
    meshes: [shaft, cap, blade, innerEdge, core],
    baseLocal: new THREE.Vector3(0, 1.58, 0.16),
    tipLocal: new THREE.Vector3(0, 1.28, 1.24),
    trail: { col: 0xffa088, tail: 0xc8141c, glint: 0xff3c28, scale: 1.65 }
  };
}

function buildImugiTrident() {
  /* 이무기 용왕 보스: 옥빛 용왕 삼지창 */
  const g = new THREE.Group();
  const shaftMat = makeMat({ color: 0x1a282c, metalness: 0.78, roughness: 0.30 });
  const prongMat = makeMat({ color: 0x26383e, metalness: 0.88, roughness: 0.24, emissive: 0x0c3430, emissiveIntensity: 0.32 });
  const jadeMat = makeMat({ color: 0x36e6b8, metalness: 0.42, roughness: 0.16, emissive: 0x1ec89a, emissiveIntensity: 0.95 });
  const coreMat = makeMat({ color: 0xeefff8, metalness: 0.0, roughness: 0.10, emissive: 0x72ffdc, emissiveIntensity: 1.75 });

  const shaft = makeMesh('im_shaft', function () { return new THREE.CylinderGeometry(0.038, 0.044, 2.28, 8); }, shaftMat, 'Weapon_Trident_Shaft', { forged: true, roughness: 0.30 });
  shaft.position.y = 0.44;
  g.add(shaft);

  const cross = makeMesh('im_cross', function () { return new THREE.BoxGeometry(0.08, 0.11, 0.56); }, prongMat, 'Weapon_Trident_Guard', { forged: true });
  cross.position.y = 1.58;
  g.add(cross);

  /* 중앙 거대 비취 수정 창날 */
  const centerBlade = makeMesh('im_center', function () {
    return extrude2D([
      [0.0, 1.56], [0.118, 1.88], [0.072, 2.24],
      [0.0, 2.58], [-0.072, 2.24], [-0.118, 1.88]
    ], 0.034, { t: 0.008, s: 0.006 });
  }, jadeMat, 'Weapon_Trident_CenterBlade', { castShadow: true, forged: true, roughness: 0.18 });
  g.add(centerBlade);

  const core = makeMesh('im_core', function () {
    return extrude2D([
      [0.0, 1.66], [0.044, 1.92], [0.0, 2.42], [-0.044, 1.92]
    ], 0.048, null);
  }, coreMat, 'Weapon_Trident_Core');
  g.add(core);

  /* 양옆 곡선 용아 삼지창 뿔 2개 */
  const prongL = makeMesh('im_prong', function () {
    return extrude2D([
      [0.20, 1.56], [0.34, 1.76], [0.36, 2.06],
      [0.22, 2.34], [0.24, 2.02], [0.18, 1.78], [0.12, 1.60]
    ], 0.024, { t: 0.006, s: 0.004 });
  }, prongMat, 'Weapon_Trident_ProngF', { forged: true });
  g.add(prongL);

  const prongR = prongL.clone();
  prongR.name = 'Weapon_Trident_ProngB';
  prongR.rotation.y = Math.PI;
  prongR.userData.sharedGeom = true;
  g.add(prongR);

  return {
    group: g,
    meshes: [shaft, cross, centerBlade, core, prongL, prongR],
    baseLocal: new THREE.Vector3(0, 1.56, 0),
    tipLocal: new THREE.Vector3(0, 2.58, 0),
    trail: { col: 0xa4fff0, tail: 0x1ca898, glint: 0x62ffe4, scale: 1.65 }
  };
}

function buildMudangFan() {
  /* 무당 원령(오른손): 황금빛 주름 무당 부채 */
  const g = new THREE.Group();
  const woodMat = makeMat({ color: 0x3b2416, metalness: 0.15, roughness: 0.72 });
  const silkMat = makeMat({
    color: 0xe6ad3e,
    metalness: 0.32,
    roughness: 0.44,
    emissive: 0x7c4a0c,
    emissiveIntensity: 0.42,
    doubleSided: true
  });
  const trimMat = makeMat({
    color: 0xfff0a6,
    metalness: 0.68,
    roughness: 0.24,
    emissive: 0xd48e20,
    emissiveIntensity: 0.58,
    doubleSided: true
  });

  const meshes = [];
  const pivot = makeMesh('md_pivot', function () { return new THREE.CylinderGeometry(0.028, 0.032, 0.14, 6); }, woodMat, 'Weapon_Fan_Handle');
  pivot.position.y = 0.04;
  g.add(pivot);
  meshes.push(pivot);

  /* 부채꼴 주름 날개 (7분할 다면체 부채살) */
  const fanShape = makeMesh('md_fan_leaf', function () {
    const s = new THREE.Shape();
    const rIn = 0.12, rOut = 0.62;
    const a0 = -Math.PI * 0.36, a1 = Math.PI * 0.36;
    const segs = 10;
    s.moveTo(Math.sin(a0) * rIn, Math.cos(a0) * rIn);
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (a1 - a0) * (i / segs);
      s.lineTo(Math.sin(a) * rOut, Math.cos(a) * rOut);
    }
    for (let i = segs; i >= 0; i--) {
      const a = a0 + (a1 - a0) * (i / segs);
      s.lineTo(Math.sin(a) * rIn, Math.cos(a) * rIn);
    }
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.016, bevelEnabled: false, steps: 1 });
    geo.translate(0, 0, -0.008);
    geo.rotateY(-Math.PI * 0.5);
    geo.computeVertexNormals();
    return geo;
  }, silkMat, 'Weapon_Fan_Silk', { castShadow: true });
  g.add(fanShape);
  meshes.push(fanShape);

  /* 금빛 테두리 장식 */
  const trim = makeMesh('md_fan_trim', function () {
    const s = new THREE.Shape();
    const rIn = 0.56, rOut = 0.64;
    const a0 = -Math.PI * 0.36, a1 = Math.PI * 0.36;
    const segs = 10;
    s.moveTo(Math.sin(a0) * rIn, Math.cos(a0) * rIn);
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (a1 - a0) * (i / segs);
      s.lineTo(Math.sin(a) * rOut, Math.cos(a) * rOut);
    }
    for (let i = segs; i >= 0; i--) {
      const a = a0 + (a1 - a0) * (i / segs);
      s.lineTo(Math.sin(a) * rIn, Math.cos(a) * rIn);
    }
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.024, bevelEnabled: false, steps: 1 });
    geo.translate(0, 0, -0.012);
    geo.rotateY(-Math.PI * 0.5);
    geo.computeVertexNormals();
    return geo;
  }, trimMat, 'Weapon_Fan_Trim');
  g.add(trim);
  meshes.push(trim);

  /* 나무 부채살 5가닥 */
  for (let i = -2; i <= 2; i++) {
    const rib = makeMesh('md_fan_rib', function () { return new THREE.BoxGeometry(0.022, 0.58, 0.014); }, woodMat, 'Weapon_Fan_Rib');
    const a = i * 0.27;
    rib.position.set(0, Math.cos(a) * 0.30, Math.sin(a) * 0.30);
    rib.rotation.x = a;
    g.add(rib);
    meshes.push(rib);
  }

  return {
    group: g,
    meshes: meshes,
    baseLocal: new THREE.Vector3(0, 0.14, 0),
    tipLocal: new THREE.Vector3(0, 0.66, 0),
    trail: { col: 0xfff0b2, tail: 0xd98a22, glint: 0xffd25a, scale: 0.95 }
  };
}

function buildMudangBell() {
  /* 무당 원령(왼손): 청동 무당 방울 다발 */
  const g = new THREE.Group();
  const handleMat = makeMat({ color: 0x3b2416, metalness: 0.15, roughness: 0.72 });
  const bronzeMat = makeMat({ color: 0xb88c3e, metalness: 0.84, roughness: 0.28, emissive: 0x3a260a, emissiveIntensity: 0.28 });

  const handle = makeMesh('mb_handle', function () { return new THREE.CylinderGeometry(0.024, 0.028, 0.22, 6); }, handleMat, 'Weapon_Bell_Handle');
  handle.position.y = 0.04;
  g.add(handle);

  const ring = makeMesh('mb_ring', function () { return new THREE.TorusGeometry(0.082, 0.016, 6, 12); }, bronzeMat, 'Weapon_Bell_Ring', { forged: true });
  ring.position.y = 0.21;
  g.add(ring);

  const meshes = [handle, ring];
  const bellOffs = [
    [0, 0.30, 0],
    [0.075, 0.22, 0.04],
    [-0.075, 0.22, 0.04],
    [0, 0.22, -0.075]
  ];
  for (let i = 0; i < bellOffs.length; i++) {
    const b = makeMesh('mb_bell', function () { return new THREE.OctahedronGeometry(0.056, 0); }, bronzeMat, 'Weapon_Bell_Orb' + i, { forged: true });
    b.position.set(bellOffs[i][0], bellOffs[i][1], bellOffs[i][2]);
    g.add(b);
    meshes.push(b);
  }
  return { group: g, meshes: meshes };
}

function buildGwibulTalisman() {
  /* 귀불 폭파병(왼손): 불타는 붉은 화염 부적 */
  const g = new THREE.Group();
  const paperMat = makeMat({
    color: 0xff5a22,
    metalness: 0.05,
    roughness: 0.42,
    emissive: 0xff3b10,
    emissiveIntensity: 1.35,
    doubleSided: true
  });
  const sigilMat = makeMat({
    color: 0xfff2b8,
    metalness: 0.0,
    roughness: 0.16,
    emissive: 0xffc83c,
    emissiveIntensity: 1.75
  });

  const paper = makeMesh('gb_paper', function () { return new THREE.BoxGeometry(0.016, 0.44, 0.22); }, paperMat, 'Weapon_Talisman_Paper');
  paper.position.y = 0.24;
  g.add(paper);

  const sigil1 = makeMesh('gb_sigil1', function () { return new THREE.BoxGeometry(0.026, 0.28, 0.045); }, sigilMat, 'Weapon_Talisman_Sigil1');
  sigil1.position.y = 0.25;
  g.add(sigil1);

  const sigil2 = makeMesh('gb_sigil2', function () { return new THREE.BoxGeometry(0.026, 0.045, 0.14); }, sigilMat, 'Weapon_Talisman_Sigil2');
  sigil2.position.y = 0.32;
  g.add(sigil2);

  return {
    group: g,
    meshes: [paper, sigil1, sigil2],
    anim: { type: 'pulse', target: g, baseY: 0.06, phase: Math.random() * 6.28 }
  };
}

function buildCheonyeoFlame() {
  /* 처녀귀신(왼손): 손바닥 위 떠도는 청백 도깨비불 */
  const g = new THREE.Group();
  const outerMat = makeMat({
    color: 0x62f4ff,
    metalness: 0.0,
    roughness: 0.14,
    emissive: 0x26d4f0,
    emissiveIntensity: 1.25,
    transparent: true,
    opacity: 0.72
  });
  const coreMat = makeMat({
    color: 0xf4ffff,
    metalness: 0.0,
    roughness: 0.10,
    emissive: 0xaefeff,
    emissiveIntensity: 1.85
  });

  const outer = makeMesh('cn_flame_out', function () {
    const geo = new THREE.OctahedronGeometry(0.18, 0);
    geo.scale(0.88, 1.48, 0.88);
    return geo;
  }, outerMat, 'Weapon_SpiritFlame_Outer');
  outer.position.y = 0.24;
  g.add(outer);

  const core = makeMesh('cn_flame_core', function () {
    const geo = new THREE.OctahedronGeometry(0.10, 0);
    geo.scale(0.82, 1.35, 0.82);
    return geo;
  }, coreMat, 'Weapon_SpiritFlame_Core');
  core.position.y = 0.21;
  g.add(core);

  const wisp = makeMesh('cn_flame_wisp', function () { return new THREE.OctahedronGeometry(0.048, 0); }, coreMat, 'Weapon_SpiritFlame_Wisp');
  wisp.position.set(0.16, 0.34, 0.08);
  g.add(wisp);

  return {
    group: g,
    meshes: [outer, core, wisp],
    anim: { type: 'orbit', target: outer, wisp: wisp, phase: Math.random() * 6.28 }
  };
}

function buildGumihoFoxOrb() {
  /* 구미호 보스(오른손): 신비로운 보라·비취빛 여우구슬 */
  const g = new THREE.Group();
  const orbMat = makeMat({
    color: 0xb08eff,
    metalness: 0.10,
    roughness: 0.14,
    emissive: 0x7a4ef5,
    emissiveIntensity: 1.45,
    transparent: true,
    opacity: 0.86
  });
  const coreMat = makeMat({
    color: 0xf0fffc,
    metalness: 0.0,
    roughness: 0.08,
    emissive: 0x72ffe4,
    emissiveIntensity: 1.85
  });
  const ringMat = makeMat({
    color: 0xe6d6ff,
    metalness: 0.35,
    roughness: 0.20,
    emissive: 0xa474ff,
    emissiveIntensity: 1.30
  });

  const orb = makeMesh('gm_orb', function () { return new THREE.IcosahedronGeometry(0.165, 1); }, orbMat, 'Weapon_FoxOrb_Sphere');
  orb.position.y = 0.24;
  g.add(orb);

  const core = makeMesh('gm_core', function () { return new THREE.OctahedronGeometry(0.088, 0); }, coreMat, 'Weapon_FoxOrb_Core');
  core.position.y = 0.24;
  g.add(core);

  const ring = makeMesh('gm_ring', function () { return new THREE.TorusGeometry(0.245, 0.018, 6, 18); }, ringMat, 'Weapon_FoxOrb_Ring');
  ring.position.y = 0.24;
  ring.rotation.x = Math.PI * 0.36;
  g.add(ring);

  return {
    group: g,
    meshes: [orb, core, ring],
    anim: { type: 'orb', target: orb, ring: ring, phase: Math.random() * 6.28 }
  };
}

const _qHandW = new THREE.Quaternion();
const _qHandInv = new THREE.Quaternion();
const _mBasis = new THREE.Matrix4();
const _qDesW = new THREE.Quaternion();
const _vX = new THREE.Vector3();
const _vY = new THREE.Vector3();
const _vZ = new THREE.Vector3();

function mountOnMonsterHand(handBone, weaponGrp, targetH, fitScale, desiredDirW, desiredEdgeW, palmOffsetY, worldHoverOff, scaleMul, modelOffset) {
  handBone.getWorldQuaternion(_qHandW);
  _qHandInv.copy(_qHandW).invert();

  _vY.copy(desiredDirW).normalize();
  _vZ.copy(desiredEdgeW).addScaledVector(_vY, -desiredEdgeW.dot(_vY));
  if (_vZ.lengthSq() < 1e-5) _vZ.set(0, 0, 1);
  _vZ.normalize();
  _vX.crossVectors(_vY, _vZ).normalize();
  _mBasis.makeBasis(_vX, _vY, _vZ);
  _qDesW.setFromRotationMatrix(_mBasis);

  weaponGrp.quaternion.copy(_qHandInv).multiply(_qDesW);
  const s = (targetH * (scaleMul != null ? scaleMul : 1.0)) / (2.4 * Math.max(1e-4, fitScale));
  weaponGrp.scale.setScalar(s);

  /* 손목 본 원점에서 손바닥 중심(+Y 로컬) 쪽으로 살짝 이동해 손가락이 자루를 쥐도록 배치 */
  weaponGrp.position.set(0, palmOffsetY != null ? palmOffsetY : 0.065, 0);
  if (modelOffset) {
    const mLoc = modelOffset.clone().applyQuaternion(_qHandInv);
    weaponGrp.position.add(mLoc);
  }
  if (worldHoverOff) {
    const loc = worldHoverOff.clone().multiplyScalar(1 / Math.max(1e-4, fitScale)).applyQuaternion(_qHandInv);
    weaponGrp.position.add(loc);
  }
  handBone.add(weaponGrp);
}

/* 종별 2D 일러스트 무기 스펙 테이블
   - hand: 'hand_r'(+X, 전면 우측) 또는 'hand_l'(-X, 전면 좌측)
   - dirW: 휴지 A-포즈(팔이 아래로 내려간 상태)에서 무기 +Y축이 향하는 월드 방향
           (Idle 팔꿈치 -26° 굴곡 시 +Z는 앞으로+위로 올라오고, Attack 내려찍기 시 전방 하향 회전)
   - edgeW: 날/전면(+Z) 방향 */
const MONSTER_WEAPON_SPECS = {
  baekgol_skeleton: [
    { hand: 'hand_r', build: buildBaekgolGlaive, dirW: [0.10, 0.24, 0.96], edgeW: [-0.20, 0.96, -0.20], palmY: 0.06 }
  ],
  dokkaebi_boss: [
    { hand: 'hand_r', build: buildDokkaebiKanabo, dirW: [0.14, 0.16, 0.97], edgeW: [0.0, 0.98, -0.18], palmY: 0.08 }
  ],
  susal_ghost: [
    { hand: 'hand_r', build: buildSusalSpear, dirW: [0.06, 0.12, 0.99], edgeW: [0.0, 0.99, -0.12], palmY: 0.06 }
  ],
  jeoseung_boss: [
    { hand: 'hand_r', build: buildJeoseungScythe, dirW: [0.16, 0.50, 0.85], edgeW: [-0.65, -0.58, 0.48], palmY: 0.07, scaleMul: 0.88 }
  ],
  imugi_king_boss: [
    /* imugi_king_boss는 모델 본(hand_l=-1.344)보다 실제 용 발톱 메시(-1.066, 2.165, +0.341)가 안쪽·전방에 위치 -> modelOff로 손아귀 정중앙 밀착! */
    { hand: 'hand_l', build: buildImugiTrident, dirW: [-0.08, 0.16, 0.98], edgeW: [0.0, 0.98, -0.16], palmY: 0.0, scaleMul: 0.66, modelOff: [0.28, -0.02, 0.34] }
  ],
  mudang_wraith: [
    { hand: 'hand_r', build: buildMudangFan, dirW: [0.22, 0.36, 0.90], edgeW: [-0.90, 0.16, 0.38], palmY: 0.06 },
    { hand: 'hand_l', build: buildMudangBell, dirW: [-0.12, 0.45, 0.88], edgeW: [0.0, 0.88, -0.45], palmY: 0.06 }
  ],
  gwibul_bomber: [
    { hand: 'hand_l', build: buildGwibulTalisman, dirW: [-0.08, 0.68, 0.72], edgeW: [0.95, 0.10, 0.24], palmY: 0.06, hoverW: [0, 0.06, 0.06] }
  ],
  cheonyeo_ghost: [
    { hand: 'hand_l', build: buildCheonyeoFlame, dirW: [0.0, 0.94, 0.34], edgeW: [0.0, -0.34, 0.94], palmY: 0.06, hoverW: [0, 0.10, 0.08] }
  ],
  gumiho_boss: [
    { hand: 'hand_r', build: buildGumihoFoxOrb, dirW: [0.0, 0.94, 0.34], edgeW: [0.0, -0.34, 0.94], palmY: 0.07, hoverW: [0, 0.12, 0.08] }
  ]
};

export function attachMonsterWeapon3D(scene, species, targetH, fitScale) {
  const key = MONSTER_ALIAS[species] || species;
  const specs = MONSTER_WEAPON_SPECS[key];
  if (!specs || !specs.length) return null;

  const bones = {};
  scene.traverse(function (o) {
    if (o.isBone && (o.name === 'hand_r' || o.name === 'hand_l')) bones[o.name] = o;
  });

  /* 휴지 본 월드 회전(rest pose)이 최신 상태여야 정확히 정렬됨 */
  scene.updateMatrixWorld(true);

  const weaponMeshes = [];
  const animList = [];
  let primaryTrail = null;

  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    const bone = bones[sp.hand];
    if (!bone) continue;
    const built = sp.build();
    const dirW = new THREE.Vector3(sp.dirW[0], sp.dirW[1], sp.dirW[2]);
    const edgeW = new THREE.Vector3(sp.edgeW[0], sp.edgeW[1], sp.edgeW[2]);
    const hoverW = sp.hoverW ? new THREE.Vector3(sp.hoverW[0], sp.hoverW[1], sp.hoverW[2]) : null;
    const modelOff = sp.modelOff ? new THREE.Vector3(sp.modelOff[0], sp.modelOff[1], sp.modelOff[2]) : null;
    mountOnMonsterHand(bone, built.group, targetH, fitScale, dirW, edgeW, sp.palmY, hoverW, sp.scaleMul, modelOff);

    for (let j = 0; j < built.meshes.length; j++) weaponMeshes.push(built.meshes[j]);
    if (built.anim) animList.push(built.anim);
    if (!primaryTrail && built.trail && built.baseLocal && built.tipLocal) {
      primaryTrail = {
        anchor: built.group,
        baseLocal: built.baseLocal,
        tipLocal: built.tipLocal,
        col: built.trail.col,
        tail: built.trail.tail,
        glint: built.trail.glint,
        scale: built.trail.scale
      };
    }
  }

  if (!weaponMeshes.length) return null;
  return {
    weaponMeshes: weaponMeshes,
    animList: animList,
    primaryTrail: primaryTrail
  };
}

export function tickWeaponFx3D(weaponFx, dt) {
  if (!weaponFx || !weaponFx.animList || !weaponFx.animList.length) return;
  for (let i = 0; i < weaponFx.animList.length; i++) {
    const a = weaponFx.animList[i];
    a.phase += dt * 3.4;
    if (a.type === 'pulse' && a.target) {
      const s = 1.0 + 0.07 * Math.sin(a.phase * 1.4);
      a.target.rotation.z = Math.sin(a.phase) * 0.08;
      if (a.target.children[0]) a.target.children[0].scale.set(1, s, 1);
    } else if (a.type === 'orbit') {
      if (a.target) {
        a.target.rotation.y += dt * 2.2;
        const s = 1.0 + 0.11 * Math.sin(a.phase * 1.6);
        a.target.scale.set(0.88 * s, 1.48 * (1.0 + 0.14 * Math.cos(a.phase * 1.9)), 0.88 * s);
      }
      if (a.wisp) {
        a.wisp.position.set(Math.cos(a.phase * 1.3) * 0.18, 0.30 + Math.sin(a.phase * 1.7) * 0.07, Math.sin(a.phase * 1.3) * 0.18);
      }
    } else if (a.type === 'orb') {
      if (a.target) a.target.rotation.y += dt * 1.6;
      if (a.ring) {
        a.ring.rotation.z += dt * 2.6;
        a.ring.rotation.x = Math.PI * 0.36 + Math.sin(a.phase * 0.8) * 0.24;
      }
    }
  }
}
