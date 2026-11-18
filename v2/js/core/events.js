/* v2/js/core/events.js — game.js 모듈 분리를 위한 경량 Pub/Sub 이벤트 버스.
   아직 구독/발행하는 곳이 없어 game.js 에 연결하지 않는다 — 모듈 분리 작업 때 연결한다. */

/** Creates an isolated event bus: on(event, fn) returns an unsubscribe function; emit isolates handler errors. */
export function createEventBus() {
  const listeners = new Map();
  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => off(event, handler);
  }
  function off(event, handler) {
    const set = listeners.get(event);
    if (set) set.delete(handler);
  }
  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (e) { if (console && console.error) console.error('[EventBus]', event, e); }
    }
  }
  function clear() { listeners.clear(); }
  return { on, off, emit, clear };
}
