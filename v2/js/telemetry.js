/* v0.29 §13 데이터 기록 — 기기 안에만 쌓고, 사용자가 내보낼 때만 파일로 나간다.
   상용 튜닝은 숫자 없이는 불가능하다. 서버가 없으므로 우선 '기기 저장 + 수동 내보내기'만 한다.

   이벤트: stage_start · stage_end · death · stroke · card_pick · boss_pattern · parry · fps
   저장: localStorage 한 칸(최근 2,000개). 개인정보는 담지 않는다(장·시각·수치만).
   보내기: 설정에서 켠 경우에만. 지금은 서버가 없어 '켬' 상태는 기록만 하고, 파일 내보내기는
          사용자가 직접 누를 때만 일어난다. */
export function createTelemetry(opts) {
  opts = opts || {};
  const KEY = opts.key || 'gesture-proto.v2.telemetry';
  const OPT_KEY = KEY + '.optin';
  const MAX = opts.max || 2000;
  const VERSION = opts.version || '0.29';
  let events = [];
  let optIn = false;
  let dirty = 0;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.e)) events = o.e.slice(-MAX);
      }
      optIn = localStorage.getItem(OPT_KEY) === '1';
    } catch (e) { events = []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, e: events.slice(-MAX) })); dirty = 0; } catch (e) {}
  }
  function event(name, data) {
    events.push({ t: Date.now(), n: name, d: data || null });
    if (events.length > MAX) events = events.slice(-MAX);
    /* 매 이벤트마다 쓰지 않는다 — 20개마다, 그리고 판이 끝날 때. */
    if (++dirty >= 20) save();
  }
  function all() { return events.slice(); }
  function clear() { events = []; save(); }
  function setOptIn(v) { optIn = !!v; try { localStorage.setItem(OPT_KEY, optIn ? '1' : '0'); } catch (e) {} return optIn; }
  function stats() {
    const by = {};
    events.forEach(function (e) { by[e.n] = (by[e.n] || 0) + 1; });
    return { total: events.length, by: by, optIn: optIn, version: VERSION };
  }
  function exportJSON(nowIso) {
    return JSON.stringify({
      app: '심안', version: VERSION, exportedAt: nowIso || new Date().toISOString(),
      note: '기기에서 쌓인 기록. 개인정보 없음.', events: events
    }, null, 1);
  }
  function download(name) {
    try {
      const blob = new Blob([exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name || ('siman-telemetry-' + new Date().toISOString().slice(0, 10) + '.json');
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
      return true;
    } catch (e) { return false; }
  }
  load();
  return {
    event: event, all: all, clear: clear, save: save, stats: stats,
    setOptIn: setOptIn, isOptIn: function () { return optIn; },
    exportJSON: exportJSON, download: download, KEY: KEY
  };
}
