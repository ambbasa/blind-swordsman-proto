/* v2/js/modules/gameConfig.js — 심안: 묵검 v1.26 게임 밸런스·제스처·적/보스 기본 상수 모듈 */

import { applyBalanceV049 } from './balance.js';

export const SHAPE_MARK = { hline: '—', vline: 'ㅣ', vee: 'V', bolt: 'Z', star: '⛤', square: 'ㅁ', tri: '△', arc: '◡', spiral: '@' };
/* 기물 전용 제스처: 보스 무늬(장의 무늬)와 겹치지 않고, 기물끼리도 하나씩 나눠 가진다. */
export const TOTEM_SHAPES = ['tri', 'square', 'spiral'];
export const SHAPE_KEY = { hline: 'H', vline: 'I', vee: 'V', bolt: 'Z' };
export const SHAPE_UNLOCK = ['hline', 'vline', 'vee', 'bolt'];
export const COMBAT = SHAPE_UNLOCK.slice();
/* v1.30 무늬별 타격 개성 분화: 횡참(넓은 폭) · 직선 관통(긴 사거리·감쇠 0) · 도약 찍기(착지 광역) · 뇌전 연쇄(전격 체인) */
export const SHAPE_STYLE = {
  hline: { name: '횡참', widthMul: 1.40, reachMul: 1.00, falloff: null, landR: 1.15, landDmgMul: 0, landStun: 0.35, chainN: 0, dur: 0.14, chainDur: 0.10, accentHex: 0x62f2c8 },
  vline: { name: '직선 관통', widthMul: 0.88, reachMul: 1.28, falloff: 1.0, landR: 0.90, landDmgMul: 0, landStun: 0.25, chainN: 0, dur: 0.12, chainDur: 0.09, accentHex: 0xff6b52 },
  vee:   { name: '도약 찍기', widthMul: 1.05, reachMul: 1.00, falloff: null, landR: 1.65, landDmgMul: 0.45, landStun: 0.55, chainN: 0, dur: 0.16, chainDur: 0.12, accentHex: 0xc07eff },
  bolt:  { name: '뇌전 연쇄', widthMul: 1.00, reachMul: 1.06, falloff: null, landR: 1.05, landDmgMul: 0, landStun: 0.30, chainN: 2, dur: 0.13, chainDur: 0.10, accentHex: 0xffd25a }
};

export const SHAPE_HINT = {
  hline: '가로로 길게 그어 보세요',
  vline: '세로로 길게 그어 보세요',
  vee: 'V자를 그려 보세요',
  bolt: '번개(Z)처럼 지그재그로 그어 보세요'
};
/* v1 numbers reused where the new brief is silent. Documented as defaults. */
export const CFG = {
  hpBase: 10, dmg: 1, bossDmg: 2, bossCoin: 20, iframeMs: 800,
  timeLimit: 75, bossAt: 50, bossShapes: 6,
  coinPerKill: 2,
  idlePerMin: 4, idleMaxHours: 8,
  upgradeBase: 20, atkStep: 0.05, hpStep: 3, coinStep: 0.25, maxLv: 10,
  xpBase: 9, xpStep: 5, xpPerKill: 1,
  /* Hit feedback: white flash, stagger and knockback (stone resists); death sinks and fades. */
  flinchDur: 0.14, hitKnockZ: 0.35, stoneKnockMul: 0.35, dieDur: 0.5,
  dashDur: 0.28, pathRadius: 1.35, dashDmg: 2.5, spiritHp: 1,
  /* Zombie kinds: hp grows over the run by (1 + hpGrowth * t / timeLimit). */
  zombieTypes: {
    imp: { hp: 2, speed: 1.0, r: 0.55, dmg: 1, xp: 1, coin: 1 },
    brute: { hp: 5, speed: 0.9, r: 0.7, dmg: 1, xp: 2, coin: 2 },
    stone: { hp: 10, speed: 0.6, r: 0.9, dmg: 2, xp: 3, coin: 3 },
    /* v0.23 후반 장(5~12장) 변주: 빠른 돌진형·부적 투척형·자폭형 */
    charger: { hp: 3, speed: 1.1, r: 0.56, dmg: 1, xp: 2, coin: 2, dashSpeed: 5.6, dashRange: 7.5, dashCd: 3.4, dashT: 0.3, windT: 0.35, tint: 0x8fd8ff },
    thrower: { hp: 3, speed: 0.78, r: 0.55, dmg: 1, xp: 2, coin: 2, hold: 4.6, throwRange: 10, throwCd: 2.9, shotSpeed: 7.2, tint: 0xd8b6ff },
    bomber: { hp: 2, speed: 1.34, r: 0.5, dmg: 1, xp: 2, coin: 2, fuseR: 2.0, fuse: 0.85, blastR: 2.7, blastDmg: 2, tint: 0xffc06a },
    /* 정예 원귀: 금테를 두른 느린 귀물. 처치하면 부적 상자(강화 3연속)를 떨어뜨린다. */
    elite: { hp: 12, speed: 0.8, r: 0.85, dmg: 1, xp: 5, coin: 6 }
  },
  /* v0.23 투척 부적·보스 장판 */
  shotSpeed: 7.2, shotR: 0.42, shotDmg: 1, shotLife: 3.2,
  hazardR: 2.5, hazardDmg: 1, hazardDelay: 1.05, hazardLife: 2.6,
  zombieMix: [[0, { imp: 1 }], [25, { imp: 0.75, brute: 0.25 }], [45, { imp: 0.55, brute: 0.3, stone: 0.15 }]],
  hpGrowth: 0.18,
  /* v0.31 §3.3 콤보: 1+0.04c(15 상한 → ×1.5). 끊기면 0이 아니라 절반, 연속 두 번 끊기면 0. */
  comboMulStep: 0.04, comboMulCap: 15, comboMulMax: 1.5, pierceFalloff: 0.85,
  spreadR: 1.5, iceSlowDur: 2, iceSlowMul: 0.5, poisonCloudR: 2, poisonCloudDur: 3,
  dashCount: 1, spawnZombieMs: 900,
  spawnZombieMax: 20,
  spawnZombieMinMs: 450,
  spawnZombieDelay: 1.2, practiceZombieMs: 3200, practiceZombieMax: 2, earlyZombieMax: 6, earlyZombieUntil: 15, earlyZombieMinMs: 1400,
  openingZombies: 6, openingRing: [0.5, 0.8],
  spiritStreamAlpha: 0.55, spiritFadeIn: 0.4, spiritAlpha: 1, spiritHover: 1.26, spiritCapStart: 1, spiritMax: 5, spiritGlowAlpha: 0.22,
  /* 혼령 회수 되돌림(hysteresis): 획득 1.02R, 회수 1.15R(안개 경계 fogOuter 1.16 바로 안). */
  spiritReleaseMul: 1.15, spiritAcquireMul: 1.02,
  /* 제자리 탭 = 칼집 패링 */
  parryR: 2.4, parryPush: 1.6, parryStun: 0.35, parryDmg: 0.5, parryCd: 0.45, parryFailCd: 0.2, parryIframe: 0.2, parryHitstop: 0.05,
  /* 선입력 버퍼 */
  inputBufMs: 200,
  /* 참(斬) 필살기 */
  cleaveCharge: 100, cleaveR: 12, cleaveDmgMul: 3, cleaveBossDmg: 6, cleaveGainKill: 7, cleaveGainWave: 15, cleaveGainBoss: 10,
  /* 자석 수집 */
  magnetR: 2.2, magnetDur: 0.18, magnetStep: 0.6, magnetMax: 3.8,
  /* 포위 웨이브 */
  waves: [
    { t: 20, n: 14, mix: { imp: 0.7, brute: 0.3 }, r: [9, 10] },
    { t: 40, n: 20, mix: { imp: 0.6, brute: 0.3, stone: 0.1 }, r: [9, 11], elite: 1 }
  ],
  ringScreenFrac: 0.70, ringMaxFrac: 0.90, ringBoost: 0.095, /* Lv3 lands on ringMaxFrac (0.70 x 1.285 = 0.90) so each level shows in portrait */ ringLvMax: 3,
  spiritOmega: 2.8, spiritAvoidMax: 0.30, spiritAvoidOmega: 8, bossSpeed: 1.0, bossCatchUp: 0.3, bossSpawnR: 11,
  dashThroughMul: 1.5, dashPastTarget: 0.8, dashPastBodyMul: 1.5, dashPastExtra: 2.0,
  /* v0.22 보스 결계(아레나): 보스가 서면 이 반경 안에서만 싸운다. */
  arenaR: 12,
  /* v0.26 보스 패턴: 예고 색으로 대응을 알린다(붉은 = 일섬 회피, 금 = 탭 패링, 비취 = 무늬 그리기).
     장별 패턴 목록은 STAGES[n].boss.patterns. 목록이 없는 장은 예전 돌진 순환을 쓴다. */
  bossPat: {
    walk: 2.6, poise: 3, groggyT: 3.0, dodgeSlow: 0.5, dodgeR: 1.4,
    kiai: { t: 2.2, win: 0.4, grace: 0.08, dmg: 2, charge: 20 },
    slam: { tele: 1.0, r: 3.0, dmg: 2, stun: 1.0 },
    clones: { n: 3, t: 8, r: 0.72, dmg: 1, bell: 0.9 },
    veil: { t: 5, bell: 1.0, cone: 0.82, ambushTele: 0.7, dist: [6, 9] },
    volley: { n: 7, spread: 1.0, gold: 2, tele: 0.8, speed: 7.5 },
    chant: { n: 3, t: 4.5, dmg: 2, stun: 1.6 },
    shrink: { to: 6.5, t: 10, n: 3, dmg: 2 },
    seal: { t: 4, extra: 2 },
    /* 보스전 기물: 주인공은 일섬으로만 움직이므로, 보스 곁에 늘 피해 갈 고정 기물을 세워 둔다(1~12장 공통).
       기물은 움직이지 않고 번갈아 느린 부적을 쏜다. 일섬에 부서지면 비어 있는 방향에 다시 선다. */
    summon: { keep: 3, every: 2.5, r: [0.55, 0.85], shotEvery: 3.0, shotWarn: 0.6, shotSpeed: 4.5 },
    tips: {
      charge: '붉은 선이 뻗으면 일섬으로 비켜서세요. 스치듯 피하면 "간발"입니다.',
      kiai: '귀물이 기를 모읍니다 — 게이지가 금빛 칸에 닿는 순간 탭!',
      slam: '붉은 원이 깔리면 원 밖으로 일섬하세요. 내려찍은 뒤가 빈틈입니다.',
      clones: '분신 가운데 방울이 우는 것이 진짜입니다. 가짜를 베면 반격당합니다.',
      veil: '귀물이 안개에 숨었습니다 — 방울이 우는 쪽으로 획을 그으세요.',
      volley: '부적 탄막입니다. 사이로 일섬하고, 금빛 부적은 탭으로 되받아치세요.',
      chant: '영창입니다 — 아래 뜬 무늬를 순서대로 그려 끊으세요.',
      shrink: '결계가 조여 옵니다 — 부적 기둥을 모두 베세요.',
      seal: '귀물이 무릎 꿇었습니다 — 획이 교차하는 한붓별(⛤)을 그려 봉인하세요.',
      /* v0.32 §4.4 막 보스 전용 */
      clash: '칼이 맞붙었습니다 — 1.2초 안에 뜬 무늬를 그으면 한 합을 받습니다.',
      mimic: '귀물이 방금 그은 궤적을 따라옵니다 — 그 선과 직각으로 비켜서세요.',
      shuffle: '무늬가 2초마다 바뀝니다 — 금빛 테두리 0.4초에 그으면 무늬가 고정됩니다.',
      donut: '청록 안전 구역 혼령으로 일섬하세요 — 첫 폭발 뒤 안팎이 반전됩니다.',
      soak: '호박빛 기둥 중앙의 혼령으로 일섬해 폭주를 막으세요.',
      rhythm: '옥빛 수축 링이 겹치는 3박자에 맞춰 화면을 탭하세요.',
      tether: '외곽 탈출 혼령으로 일섬해 혈사슬을 끊으세요.',
      gaze: '보스 등 뒤 혼령으로 일섬해 붉은 시선을 피하세요.',
      pizza: '청록 안전 칸 혼령으로 일섬해 교차 절단을 피하세요.'
    }
  },
  /* v0.22 묵항아리: 부수면 세 가지 픽업 중 하나 */
  jarDropWeights: { herb: 0.4, magnet: 0.3, bang: 0.3 }, herbHeal: 2, bangR: 15,
  landBounce: 0.28, landBounceT: 0.16, landRippleDur: 0.45,
  landIframe: 0.25, landShockR: 1.6, landPush: 1.2, landStun: 0.3, landPast: 1.0,
  hitstopKill: 0.06, hitstopKillMax: 0.12, hitHitstop: 0.08, hitKnock: 0.6,
  /* v0.29 §3.1 타격감: 일반 명중에 히트스톱을 넣고, 파훼는 더 길게, 칼 튕길 때는 짧은 쇳소리. */
  hitstopHit: 0.035, hitstopHitCap: 0.06, hitstopBreak: 0.10, hitstopBounce: 0.03, killSplatScale: 1.4,
  /* v0.29 §4.1 기물 역공: 보스 예고 중 기물로 일섬하면 기물이 먹궤적이 되어 날아가 보스를 1.0초 경직시킨다. */
  reflectStun: 1.0, reflectCharge: 12, reflectPoise: 1,
  /* v0.29 §4.2 빈틈 고리: 걷는 보스 발밑에 1.6초마다 차오르는 고리. 다 차기 전에 그은 획은 0.5초까지 선입력한다. */
  gapPeriod: 1.6, gapFlash: 0.5, gapBufWait: 0.5,
  /* v0.29 §3.4 공정성: 판에서 처음 맞는 '피할 수 없는' 공격은 피해 1, 피격 무적 중에는 다음 공격이 발동하지 않는다. */
  firstForcedDmg: 1, chainGuard: 0.8,
  recoilU: 0.34, recoilT: 0.13, hurtVignette: 0.3,
  aimConeCos: 0.5, aimNearW: 0.35, telegraphRange: 3.2,
  zombieRing: [6, 8.5],
  zombieSpeed: 2.15,
  qlLowFps: 44, qlHighFps: 57, qlDownSec: 3.5, qlUpSec: 8,
  camOff: { x: 14.4, y: 22.4, z: 14.4 }, camLookY: 1.2, fov: 62,
  markMinCss: 12, seqDotGap: 16, markMaxCss: 32,
  comboTimeout: 2.8, bpm: 100,
  /* v0.23 아이템 개편: 자동 흡수·수명 · 원소 각인 · 정확한 획 · 칼집 각성 */
  autoPickR: 1.25, itemLife: 24, tempElemDur: 12, elemLvMax: 3,
  iceDurStep: 0.5, shatterStep: 1, burnDurStep: 0.5, burnDmgStep: 0.3,
  poisonMaxStep: 1, poisonDmgStep: 0.25, cloudRStep: 0.6,
  perfectDmgMul: 1.5, perfectStep: 0.15, perfectThresh: 0.80, perfectThreshStep: 0.05,
  parryAwakenR: 0.45, parryAwakenDmg: 0.4, parryAwakenCharge: 14, parryAwakenStun: 0.12,
  bellMyriadDur: 12,
  comboBurstAt: [4, 8, 12],
  comboBurstR: [3.2, 4.2, 5.2], comboBurstDmg: [1, 1.5, 2],
  practiceSec: 10, practiceSpawns: 6, comboBurstMs: 220,
  iceDur: 2.5, burnDur: 3, burnPeriod: 0.75, burnDmg: 1,
  poisonMax: 5, poisonDur: 4, poisonPeriod: 1, poisonDmgPer: 0.75,
  shatterDmg: 4, explodeDmg: 3, explodeR: 2.5,
  bellDur: 8, slowDur: 0.45, slowScale: 0.35,
  sightWaveDur: 0.45,
  /* Fog outside the mind's-eye ring: clear inside fogInner x ring, fully fogged at fogOuter x ring. */
  fogColor: [7, 6, 8], fogAlpha: 0.78, fogInner: 0.86, fogOuter: 1.16, fogWisps: 28, fogWispAlpha: 0.05,
  /* 혼령의 창: 혼령은 먹안개를 뚫고 보인다. 링 경계·그 너머·짙은 안개에서도 혼령 몸과 기호가 읽히도록
     혼령 자리에 부드러운 창을 뚫는다(중심 지움 정도 / 구슬·몸 높이 대비 반지름 / 최소·최대 px). */
  spiritLightClear: 0.84, spiritLightOrb: 2.4, spiritLightBody: 0.72, spiritLightPx: 26,
  spiritLightBoss: 1.45, spiritLightMax: 120,
  /* v0.30 §8.1 첫 10초 몸통 튜토리얼: 느린 화면 + 유도 획 → 첫 성공 → 제자리 탭. */
  tut: { slow0: 0.45, firstSlow: 0.75, firstDur: 0.8, tapAt: 5.0, tapSlow: 0.35, tapSlowDur: 0.6, end: 10 },
  /* v0.30 §8.2 '처음 보는 순간': 한 번 본 것은 다시 늦추지 않는다(저장 단위 기록). */
  firstPatTele: 1.6, firstPatSlow: 0.5, firstPatSlowDur: 0.6, firstShapeGuide: 0.8, totemPractice: 3.0,
  /* v0.30 §7.3 동적 보정: 같은 장 연패 시 조용히 돕는다(고수 모드 제외). */
  help2Charge: 30, help3Tele: 1.1, helpOfferAt: 4,
  /* v0.30 §4.3 보스전 시간 예산: 목표 여유 비율 1.4~1.8, 수용 기준 '시간 초과 패배 10% 이하'. */
  budget: { walk: 2.6, stun: 1.2, seal: 2, K: 2, slackMin: 1.4, slackMax: 1.8, overMax: 0.10 },
  /* v0.31 §3.2 강적 깨는 법: 장정=갑옷 1겹 · 돌덩이=금 2단계 · 정예=봉인 순서 3개. */
  bruteArmor: 1, armorDmg: 0.5, breakRimT: 0.3, crackStages: 2, crackSameMul: 0.5,
  eliteSeqLen: 3, eliteSeqCharge: 20,
  /* v0.31 §3.3 콤보 단계 보상: 10 참+10 · 15 다음 일섬 폭 ×1.5 · 20 혼백+3·엽전+5 · 30부터 10마다 참+10. */
  comboTiers: { 10: { charge: 10 }, 15: { wide: 1.5 }, 20: { xp: 3, coin: 5 }, 30: { charge: 10 } },
  /* v0.31 §3.5 정확한 패링: 공격이 닿기 0.2초 안의 탭 = 피해 2배·참 +10·0.2초 느린 화면. */
  preciseWin: 0.2, justParryWin: 0.18, preciseDmgMul: 2, preciseCharge: 10, preciseSlow: 0.2, preciseStun: 0.6,
  /* v0.31 §5.2 멈추지 않는 선택: 0.3배 1.5초 + 아래 카드 3장, 4초 안에 고르면 자동 추천. */
  quick: { slow: 0.3, slowDur: 1.5, pickSec: 4.0, zone: 0.22 },
  /* v0.31 §5.3 새 카드 */
  ward: { n: 2, r: 2.2, dmg: 0.8, period: 0.35, r2: 2.6, n3: 4, spin: 2.1, manryunR: 1.2, manryunSlow: 0.3 },
  boltCard: { every: 4.5, r: 2.2, dmg: 2.2, tele: 0.6, range: 6, lvStep: 0.4, lvMax: 5, freeze: 1.5 },
  echoCard: { delay: 0.4, mul: [0.4, 0.55, 0.7] },
  resonCard: { dmg: [0.65, 0.95, 1.25] },
  inkStep: { dur: 2, slow: [0.3, 0.4, 0.5], r: 1.7 },
  /* 자동 피해(호신부·벼락부적)는 총 피해의 25%를 넘지 않는다 — 제스처 정체성 유지(§17-4). */
  /* v0.31 §5.5 판 안 경험치: 곡선(7+4n+0.6n²)이 정해졌으니, 목표 레벨(1장 4~5·12장 8~9)에 맞게
     한 마리의 경험치 양을 맞춘다. v0.23 이후 연쇄·참·자동으로 처치 밀도가 2~3배가 되어 0.3으로 낮춤. */
  xpScale: 0.2,
  autoCap: 0.25
};
applyBalanceV049(CFG);
/* v0.49: MODES, CHALLENGES, RUN_UPGRADES, EVO_RECIPES, STAGES, HANJI_TONE, ACT_NAMES 는
   v2/js/modules/upgrades.js 및 stages.js 로 분리했습니다. */
