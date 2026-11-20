/**
 * v2/js/modules/inputQueue.js
 * 심안(SIMAN) v0.49.2 — 연속 일섬 2칸 FIFO 선입력 버퍼 + 일섬 지연(입력→돌진→착지) 계측 모듈.
 *
 * 해결 과제(2026-11-20 실플레이 리뷰 P0):
 * 1) 기존 1칸 S.inputBuf 덮어쓰기로 연타 중 두 번째 획이 첫 번째 예약을 덮어 유실되던 문제 해결
 * 2) 다중 일섬·히트스톱 중 예약 획이 너무 빨리 만료되던 TTL 완화(450ms + 350ms grace)
 * 3) 단타 / 연타(예약 소비) / 다수 처치별 입력→돌진 시작·착지·히트스톱·프레임 시간 분리 계측
 */

export function createInputQueue({ maxSize = 2, dedupMs = 45, graceMs = 350, hardCapMs = 1400 } = {}) {
  const items = [];
  const counters = { enqueued: 0, consumed: 0, expired: 0, overwritten: 0, deduped: 0 };

  function isExpired(entry, nowMs) {
    const age = nowMs - entry.t0;
    const limit = (entry.ttl || 450) + graceMs;
    return age > limit || age > hardCapMs;
  }

  function prune(nowMs, isBusy = false) {
    let i = 0;
    while (i < items.length) {
      const age = nowMs - items[i].t0;
      const limit = (items[i].ttl || 450) + graceMs;
      const stale = (!isBusy && age > limit) || age > hardCapMs;
      if (stale) {
        items.splice(i, 1);
        counters.expired++;
      } else {
        i++;
      }
    }
    return items.length;
  }

  function push(entry, nowMs) {
    if (!entry || !entry.type) return { queued: false, size: items.length, overwritten: false };
    const tNow = nowMs != null ? nowMs : entry.t0 || 0;
    prune(tNow, true);

    const last = items.length ? items[items.length - 1] : null;
    if (last && last.type === entry.type && Math.abs(tNow - last.t0) < dedupMs) {
      counters.deduped++;
      return { queued: false, size: items.length, overwritten: false, deduped: true };
    }

    const item = Object.assign({ t0: tNow, ttl: 450 }, entry);
    let overwritten = false;
    if (items.length >= maxSize) {
      /* 앞선 첫 번째 예약(선행 입력)은 보존하고, 가장 최근 슬롯만 최신 의도로 교체 */
      items[items.length - 1] = item;
      counters.overwritten++;
      overwritten = true;
    } else {
      items.push(item);
    }
    counters.enqueued++;
    return { queued: true, size: items.length, overwritten };
  }

  function shiftValid(nowMs) {
    while (items.length) {
      const head = items.shift();
      if (isExpired(head, nowMs)) {
        counters.expired++;
        continue;
      }
      counters.consumed++;
      return head;
    }
    return null;
  }

  function peek() {
    return items.length ? items[0] : null;
  }

  function size() {
    return items.length;
  }

  function clear() {
    items.length = 0;
  }

  function stats() {
    return Object.assign({}, counters, { pending: items.length, maxSize });
  }

  return { push, shiftValid, prune, peek, size, clear, stats };
}

function summarizeBucket(list) {
  if (!list.length) {
    return { count: 0, avgInputToStartMs: 0, avgTotalMs: 0, p95TotalMs: 0, avgHitstopMs: 0 };
  }
  let sIn = 0, sTot = 0, sHs = 0;
  const totals = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    sIn += r.inputToStartMs;
    sTot += r.totalMs;
    sHs += r.hitstopMs;
    totals.push(r.totalMs);
  }
  totals.sort((a, b) => a - b);
  const p95Idx = Math.min(totals.length - 1, Math.floor(totals.length * 0.95));
  return {
    count: list.length,
    avgInputToStartMs: Math.round(sIn / list.length),
    avgTotalMs: Math.round(sTot / list.length),
    p95TotalMs: Math.round(totals[p95Idx]),
    avgHitstopMs: Math.round(sHs / list.length)
  };
}

export function createDashLatencyTracker(maxSamples = 60) {
  const samples = [];

  function record({
    shape = null,
    chained = false,
    hits = 0,
    tInput = 0,
    tStart = 0,
    tLand = 0,
    hitstopMs = 0,
    frameDtMs = 16.7,
    tailCanceled = false
  } = {}) {
    const inputToStartMs = Math.max(0, Math.round(tStart - tInput));
    const startToLandMs = Math.max(0, Math.round(tLand - tStart));
    const totalMs = Math.max(0, Math.round(tLand - tInput));
    const entry = {
      shape,
      kind: chained ? 'chained' : 'single',
      multiKill: hits >= 2,
      hits,
      inputToStartMs,
      startToLandMs,
      totalMs,
      hitstopMs: Math.max(0, Math.round(hitstopMs)),
      frameDtMs: +Number(frameDtMs || 16.7).toFixed(1),
      tailCanceled: !!tailCanceled
    };
    samples.push(entry);
    if (samples.length > maxSamples) samples.shift();
    return entry;
  }

  function summary() {
    const single = [];
    const chained = [];
    const multiKill = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.kind === 'chained') chained.push(s);
      else single.push(s);
      if (s.multiKill) multiKill.push(s);
    }
    return {
      count: samples.length,
      single: summarizeBucket(single),
      chained: summarizeBucket(chained),
      multiKill: summarizeBucket(multiKill),
      last: samples.length ? samples[samples.length - 1] : null
    };
  }

  function list() {
    return samples.slice();
  }

  function clear() {
    samples.length = 0;
  }

  return { record, summary, list, clear };
}
