/* v2/js/core/events.js — game.js 모듈 분리를 위한 경량 Pub/Sub 이벤트 버스. */
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
