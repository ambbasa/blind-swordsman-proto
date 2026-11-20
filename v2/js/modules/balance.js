/**
 * v2/js/modules/balance.js
 * 심안(SIMAN) v0.49 — 상용 기준 경제·생존 밸런스 상수 모듈.
 *
 * 조정 근거 (v0.48 실측 기반):
 * 1) 방치 보상 정상화: 기존 분당 4엽전 × 8시간 = 1,920엽전(coinLv 10이면 6,720엽전)으로
 *    최고가 무구(귀문검 1,500엽전)를 무전투로 구매 가능하던 역전 현상을 교정.
 *    → 분당 1엽전, 최대 6시간(기본 상한 360엽전)으로 하향하고 액티브 전투 보상을 2~4배 강화.
 * 2) 체력 곡선 완화: 기존 기본 10 + (10 × 3) = 40 (초반 4배 격차)에서
 *    기본 14 + (10 × 2) = 34 (2.43배)로 초반 즉사 압박을 완화하고 후반 긴장감을 유지.
 */

export const BALANCE_V049 = Object.freeze({
  /* 생존·성장 곡선 */
  hpBase: 14,          /* 10 → 14 (초반 bomber/stone 2피해 즉사 압박 완화) */
  hpStep: 2,           /* 3 → 2 (Lv10 기준 최대 체력 34, 완만한 2.43배) */
  atkStep: 0.06,       /* 0.05 → 0.06 (공격력 성장 체감 보강) */
  iframeMs: 850,       /* 800 → 850ms (난전 연속 피격 완화) */
  dashDur: 0.24,       /* 0.28 → 0.24s (단발 일섬 체감 경쾌화, 연타 시 0.19s 가속) */
  bossSpeed: 1.85,     /* 1.0 → 1.85 m/s (보스가 답답하게 기어오지 않고 위압적으로 성큼 접근) */
  bossCatchUp: 0.35,   /* 0.30 → 0.35 (거리 벌어졌을 때 추격 텐션 강화) */

  /* 액티브 전투 중심 경제 vs 방치 보상 균형 */
  coinPerKill: 4,      /* 2 → 4 (적 처치 체감 보상 2배) */
  bossCoin: 80,        /* 20 → 80 (보스 처치 체감 보상 4배) */
  coinStep: 0.18,      /* 0.25 → 0.18 (후반 엽전 인플레 조절) */
  idlePerMin: 1,       /* 4 → 1 (시간당 60엽전) */
  idleMaxHours: 6,     /* 8 → 6 (기본 최대 360엽전) */
  idleCoinMultCap: 2.0 /* 방치 보상에는 엽전 획득 배율 상한 ×2.0 적용 (최대 720엽전) */
});

/**
 * game.js의 CFG 객체에 v0.49 밸런스 상수를 병합합니다.
 * @param {Record<string, any>} cfg
 */
export function applyBalanceV049(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg;
  return Object.assign(cfg, BALANCE_V049);
}
