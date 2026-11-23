/* v2/js/modules/bossPatterns.js
 * v1.08: 보스 패턴 지속 시간·예고 색상·스킬 배너·막별 페이즈 전환 연출 데이터 분리 모듈.
 * game.js에서 독립 순수 로직을 추출해 유지보수성과 테스트 가능성을 높인다.
 */

/* 실측한 패턴 지속 시간(초): [예고/핵심 길이, 고정 후딜] */
export const PAT_COST = Object.freeze({
  charge: [1.0, 0.03],
  kiai: [2.3, 0],
  slam: [1.03, 0],
  clones: [8.03, 0],
  veil: [5.03, 0],
  volley: [0.83, 0],
  chant: [4.53, 0],
  shrink: [2.6, 0],
  seal: [2.0, 0],
  clash: [5.4, 0],
  mimic: [1.45, 0],
  shuffle: [8.3, 0],
  donut: [3.3, 0],
  soak: [3.3, 0],
  rhythm: [1.9, 0],
  tether: [2.8, 0],
  gaze: [1.5, 0],
  pizza: [2.9, 0]
});

/* 패턴별 예고 색 계열(red: 회피 · gold: 패링/소크 · jade: 파훼/안전지대) */
export const PAT_CUE = Object.freeze({
  charge: 'red',
  slam: 'red',
  sweep: 'red',
  volley: 'red',
  kiai: 'gold',
  chant: 'jade',
  clones: 'jade',
  veil: 'jade',
  shrink: 'gold',
  clash: 'jade',
  mimic: 'red',
  shuffle: 'jade',
  donut: 'jade',
  soak: 'gold',
  rhythm: 'gold',
  tether: 'red',
  gaze: 'red',
  pizza: 'jade'
});

/* v1.08: 막별(1~4막) 고유 페이즈 전환 연출 프로필
 * - 1막(화염/홍련): 주홍-금빛 기합 파동
 * - 2막(설산 묵승): 서리·청백 설풍 빙결 파동
 * - 3막(혈월 무장): 진홍 혈월·피안개 쌍파동
 * - 4막(무간의 검귀): 흑묵·자금 공간 균열 파동
 */
export const ACT_PHASE_FX = Object.freeze({
  1: Object.freeze({
    p2: Object.freeze({
      title: '제2국면 — 홍련 기합!',
      msg: '귀물이 기세를 끌어올립니다 — 새 패턴이 섞입니다',
      hex: 0xe84830,
      core: 0xfff8ee,
      ringCss: '#e84830',
      auraHex: 0xff5a3c,
      swirlR: 6.2,
      bolts: 1
    }),
    p3: Object.freeze({
      title: '제3국면 — 업화 각성!',
      msg: '심연이 조여 옵니다 — 예고가 빨라집니다',
      hex: 0xffd26a,
      core: 0xfff8ee,
      ringCss: '#ffd26a',
      auraHex: 0xffd27a,
      swirlR: 7.8,
      bolts: 2
    })
  }),
  2: Object.freeze({
    p2: Object.freeze({
      title: '제2국면 — 설풍 빙결!',
      msg: '설산의 한기가 결계를 얼립니다 — 안전지대를 읽으세요',
      hex: 0x62d6ff,
      core: 0xeefbff,
      ringCss: '#62d6ff',
      auraHex: 0x7ce6ff,
      swirlR: 6.8,
      bolts: 2
    }),
    p3: Object.freeze({
      title: '제3국면 — 만년설 폭풍!',
      msg: '혹한이 휘몰아칩니다 — 예고가 빨라집니다',
      hex: 0xa6f0ff,
      core: 0xffffff,
      ringCss: '#a6f0ff',
      auraHex: 0xb8f4ff,
      swirlR: 8.2,
      bolts: 3
    })
  }),
  3: Object.freeze({
    p2: Object.freeze({
      title: '제2국면 — 혈월 개화!',
      msg: '붉은 달빛과 피안개가 번집니다 — 박자와 거리를 잡으세요',
      hex: 0xd92434,
      core: 0xffd4cc,
      ringCss: '#e02838',
      auraHex: 0xff3a24,
      swirlR: 6.6,
      bolts: 2
    }),
    p3: Object.freeze({
      title: '제3국면 — 적월 광란!',
      msg: '혈월이 만월로 치닫습니다 — 연격이 거세집니다',
      hex: 0xff4a38,
      core: 0xfff0d6,
      ringCss: '#ff4a38',
      auraHex: 0xff6244,
      swirlR: 8.0,
      bolts: 3
    })
  }),
  4: Object.freeze({
    p2: Object.freeze({
      title: '제2국면 — 흑묵 균열!',
      msg: '무간의 어둠이 공간을 가릅니다 — 모든 기믹이 깨어납니다',
      hex: 0x9b5cff,
      core: 0xf4e8ff,
      ringCss: '#9b5cff',
      auraHex: 0xb27aff,
      swirlR: 7.0,
      bolts: 3
    }),
    p3: Object.freeze({
      title: '제3국면 — 무간 종언!',
      msg: '공간이 붕괴합니다 — 마지막 심안으로 베어내세요',
      hex: 0xffcf54,
      core: 0xfff8e0,
      ringCss: '#ffcf54',
      auraHex: 0xffe07a,
      swirlR: 8.6,
      bolts: 4
    })
  })
});

export function getActPhaseFx(act, nextPhase) {
  const a = ACT_PHASE_FX[act] || ACT_PHASE_FX[1];
  return nextPhase >= 3 ? a.p3 : a.p2;
}

/* 스테이지의 평균 보스 패턴 지속 시간 계산 */
export function bossPatternMean(st, tele) {
  const B = (st && st.boss) || {};
  const list = (B.patterns || []).concat(B.phase2 || [], B.phase3 || []);
  if (!list.length) return 2.5;
  const tm = (tele == null ? 1 : tele);
  const SCALED = {
    charge: 1, kiai: 1, slam: 1, volley: 1, chant: 1,
    donut: 1, soak: 1, tether: 1, gaze: 1, pizza: 1
  };
  const sum = list.reduce(function (a, id) {
    const c = PAT_COST[id] || [2.5, 0];
    const t = id === 'charge' ? (B.telegraph != null ? B.telegraph : 1.1) : c[0];
    return a + (SCALED[id] ? t * tm : t) + c[1];
  }, 0);
  return sum / list.length;
}

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

/* 보스 스킬명 + 대응 행동(회피/받아치기/파훼/소크) + 정밀 타이밍 배너 데이터 생성 */
export function buildBossBannerInfo(z, P, bt) {
  if (!z || !z.alive) return null;
  const st = z.state;
  if (st === 'telegraph') {
    const dur = bt.teleT * (z.teleMul || 1);
    return { mode: 'dodge', name: '언월 쇄도', hint: '옆으로 일섬 회피', f: clamp01((z.stateT || 0) / Math.max(0.01, dur)), sweetStart: 0.78 };
  }
  if (st === 'slamTele' && z.slam) {
    return { mode: 'dodge', name: '혈월 내려찍기', hint: '원 밖으로 일섬', f: clamp01((z.stateT || 0) / Math.max(0.01, z.slam.tele)), sweetStart: 0.78 };
  }
  if (st === 'sweepTele' && z.sweep) {
    return { mode: 'dodge', name: '언월 횡참', hint: '등 뒤로 일섬', f: clamp01((z.stateT || 0) / Math.max(0.01, z.sweep.tele)), sweetStart: 0.78 };
  }
  if (st === 'volleyTele') {
    const dur = z.volleyTele || P.volley.tele;
    return { mode: 'dodge', name: '살부적 난사', hint: '금빛 부적은 탭 반사!', f: clamp01((z.stateT || 0) / Math.max(0.01, dur)), sweetStart: 0.78 };
  }
  if (st === 'mimicTele' && z.mimic) {
    return { mode: 'dodge', name: '궤적 흉내', hint: '직각으로 일섬 회피', f: clamp01((z.mimic.t || 0) / Math.max(0.01, z.mimic.tele)), sweetStart: 0.78 };
  }
  if (st === 'clones') {
    return { mode: 'break', name: '환영 분신', hint: '방울 울리는 본체 베기', f: clamp01(1 - (z.stateT || 0) / Math.max(0.01, P.clones.t)), sweetStart: 0.85 };
  }
  if (st === 'veil') {
    return { mode: 'break', name: '어둠 은신', hint: '비취 물결 쪽으로 베기', f: clamp01(1 - (z.stateT || 0) / Math.max(0.01, P.veil.t)), sweetStart: 0.85 };
  }
  if (st === 'shuffle' && z.shuffle) {
    return {
      mode: 'break', name: '무늬 뒤섞기',
      hint: z.shuffle.gold > 0 ? '★ 지금 베면 고정!' : '금빛 순간을 노려라',
      f: clamp01(1 - (z.shuffle.t || 0) / Math.max(0.01, z.shuffle.dur)),
      sweetStart: 0.8, sweetOpen: z.shuffle.gold > 0
    };
  }
  if (st === 'donut' && z.donut) {
    return {
      mode: 'dodge', name: '도넛 결계',
      hint: z.donut.safeInside ? '안쪽 청록 혼령으로 일섬!' : '바깥 청록 혼령으로 일섬!',
      f: clamp01((z.stateT || 0) / Math.max(0.01, z.donut.dur)),
      sweetStart: 0.78
    };
  }
  if (st === 'soak' && z.soak) {
    let remCount = 0;
    let p0 = null;
    const pillars = z.soak.pillars || [];
    for (let i = 0; i < pillars.length; i++) {
      if (!pillars[i].done) {
        if (!p0) p0 = pillars[i];
        remCount++;
      }
    }
    const f = p0 ? clamp01((p0.t || 0) / Math.max(0.01, p0.dur)) : 1;
    return { mode: 'soak', name: '결계 기둥', hint: '기둥 혼령으로 일섬! (' + remCount + '남음)', f: f, sweetStart: 0.72 };
  }
  if (st === 'gaze' && z.gaze) {
    return { mode: 'dodge', name: '붉은 시선', hint: '보스 등 뒤 혼령으로 일섬!', f: clamp01((z.stateT || 0) / Math.max(0.01, z.gaze.dur)), sweetStart: 0.78 };
  }
  if (st === 'pizza' && z.pizza) {
    return { mode: 'dodge', name: '부채꼴 절단', hint: '청록 안전 칸으로 일섬!', f: clamp01((z.stateT || 0) / Math.max(0.01, z.pizza.dur)), sweetStart: 0.78 };
  }
  if (st === 'rhythm' && z.rhythm) {
    const dur = z.rhythm.beats[z.rhythm.idx] || 0.6;
    const rem = dur - z.rhythm.t;
    return {
      mode: 'parry',
      name: '삼연격 ' + (z.rhythm.idx + 1) + '/3',
      hint: '박자에 맞춰 탭! (' + (z.rhythm.ok || 0) + '/3)',
      f: clamp01(z.rhythm.t / Math.max(0.01, dur)),
      sweetStart: 0.62,
      sweetOpen: rem <= 0.24 && rem >= -0.06
    };
  }
  if (st === 'tether' && z.tether) {
    return { mode: 'dodge', name: '혈사슬 결속', hint: '외곽 혼령으로 일섬해 절단!', f: clamp01((z.stateT || 0) / Math.max(0.01, z.tether.dur)), sweetStart: 0.75 };
  }
  return null;
}
