/**
 * v2/js/modules/bossCatalog.js
 * 심안(SIMAN) v0.49 — 보스 패턴 도감(기본 9칸 + 막 보스 전용 3칸) 메타데이터 모듈.
 * (v0.49: 도감 공략 문구 오탈자 6건 교정 반영)
 */

export const PAT_CODE = Object.freeze([
  { slot: 1, id: 'charge', name: '돌진', desc: '예고 뒤 곧장 닿는 돌진', guides: ['붉은 선이 뻗으면 일섬으로 비켜서세요.', '스치기만 해도 간발 — 기세가 한 칸 깎입니다.'] },
  { slot: 2, id: 'kiai', name: '기모으기', desc: '금빛 칸에 맞춰 탭하면 받아치는 기합', guides: ['게이지 끝의 금빛 칸에서 탭하세요.', '이른 탭은 관대한 편 — 두 번째부터는 실패합니다.'] },
  { slot: 3, id: 'slam', name: '내려찍기', desc: '붉은 원 안에 내리꽂는 일격', guides: ['원 밖으로 일섬하세요.', '뒤가 빈틈 — 내려찍은 보스를 베면 두 칸입니다.'] },
  { slot: 4, id: 'volley', name: '부적 탄막', desc: '부적을 펼쳐 던지는 탄막', guides: ['사이로 일섬해 빠져나가세요.', '금빛 부적은 탭으로 되받으면 보스에게 돌아갑니다.'] },
  { slot: 5, id: 'chant', name: '영창', desc: '무늬 셋을 부르는 영창', guides: ['위에 뜬 무늬를 순서대로 그으세요.', '둘 이상 끊으면 피해가 1로 줄어듭니다.'] },
  { slot: 6, id: 'clones', name: '분신', desc: '가짜 몸을 펼치는 분신', guides: ['방울이 우는 쪽이 진짜입니다.', '가짜를 베면 반격을 받습니다.'] },
  { slot: 7, id: 'veil', name: '은신', desc: '안개에 몸을 감추고 옮기는 술', guides: ['방울 소리가 나는 쪽으로 획을 그으세요.', '가까이에서는 은신 전에 반격 기회가 있습니다.'] },
  { slot: 8, id: 'shrink', name: '결계 조임', desc: '결계를 좁히는 부적 기둥', guides: ['부적 기둥을 모두 베세요.', '못 끊으면 결계가 조여 쓰러집니다.'] },
  { slot: 9, id: 'seal', name: '봉인', desc: '무릎 꿇은 보스를 닫는 마지막 무늬', guides: ['획이 교차하는 한붓별(⛤)을 그으세요.', '봉인 중에는 다른 획이 듣지 않습니다.'] },
  { slot: 10, id: 'clash', name: '합 겨루기(8장)', desc: '칼이 맞부딪힌 순간 무늬를 받는 3합', guides: ['1.2초 안에 뜬 무늬를 그으세요.', '받아내면 보스가 밀리고 기세가 깎입니다.'] },
  { slot: 11, id: 'mimic', name: '흉내(8장)', desc: '방금 그은 궤적을 그대로 따라오는 돌진', guides: ['그 선과 직각으로 일섬하세요.', '궤적은 빛나지 않는 붉은 선으로 보입니다.'] },
  { slot: 12, id: 'shuffle', name: '무늬 뒤섞기(12장)', desc: '2초마다 바뀌는 무늬', guides: ['금빛 테두리 0.4초에 그으면 고정됩니다.', '고정하면 남은 무늬를 차분하게 벨 수 있습니다.'] }
]);

export function getPatternMeta(id) {
  for (let i = 0; i < PAT_CODE.length; i++) if (PAT_CODE[i].id === id) return PAT_CODE[i];
  return null;
}
