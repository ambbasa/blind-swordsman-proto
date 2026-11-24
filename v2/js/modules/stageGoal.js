/* v2/js/modules/stageGoal.js — 심안: 묵검 v1.25 스테이지 부목표(수호·사냥·한무늬·어둠·시간사냥) 엔진 모듈 */

export function createStageGoalController(deps) {
  const {
    getState,
    elById,
    shapeUnlock,
    totemShapes,
    shapeMark,
    dist,
    spawnZombie,
    showJudge,
    toast,
    getAudio,
    telemetry
  } = deps;

  let _goalHudCache = '';

  function goalHudText() {
    const S = getState();
    const g = S && S.goal;
    if (!g) return '';
    const left = Math.max(0, Math.ceil((g.win || 0) - g.t));
    if (g.ok) return '✔ ' + g.label;
    if (g.fail) return '✘ ' + g.label;
    if (g.id === 'guard') return '석등 ' + g.hp + '/' + g.hpMax + ' · ' + left + '초';
    if (g.id === 'hunt') return '정예 ' + g.n + '/' + g.need + ' · ' + left + '초';
    if (g.id === 'shapeLock') return (g.t >= g.at ? '한 무늬 ' + Math.max(0, Math.ceil(g.at + g.win - g.t)) + '초' : '한 무늬까지 ' + Math.ceil(g.at - g.t) + '초');
    if (g.id === 'dark') return '어둠 ' + left + '초';
    if (g.id === 'timed') return '시간 사냥 · 처치 +' + ((S.stage && S.stage.subgoal && S.stage.subgoal.add) || 0.5) + '초';
    return g.label;
  }

  function renderGoalHud() {
    const el = elById('goalLabel');
    if (!el) return;
    const S = getState();
    const txt = goalHudText();
    if (txt === _goalHudCache) return;
    _goalHudCache = txt;
    el.textContent = txt;
    el.hidden = !txt;
    el.classList.toggle('ok', !!(S && S.goal && S.goal.ok));
    el.classList.toggle('fail', !!(S && S.goal && S.goal.fail));
  }

  function initGoal(st, opts) {
    const S = getState();
    if (!S) return;
    if (!st || !st.subgoal || (opts && (opts.sandbox || opts.challenge))) {
      S.goal = null;
      renderGoalHud();
      return;
    }
    const g = st.subgoal;
    S.goal = {
      id: g.id, label: g.label || '', t: 0, ok: false, fail: false, hp: g.hp || 0, hpMax: g.hp || 0,
      n: 0, need: g.n || 0, win: g.t || 0, at: g.at || 0, ringMul: 1, shape: null,
      pos: g.id === 'guard' ? { x: S.hero.x + 4.2, z: S.hero.z - 1.0 } : null, ids: []
    };
    if (g.id === 'shapeLock') {
      const pool = (st.shapes && st.shapes.length) ? st.shapes : shapeUnlock;
      S.goal.shape = pool[pool.length - 1];
    }
    if (g.id === 'timed') S.timeLeft = Math.max(30, Math.round((S.timeLeft || st.time) * (1 - (g.cut || 0.3))));
    renderGoalHud();
  }

  function goalWindowOn() {
    const S = getState();
    const g = S && S.goal;
    if (!g) return false;
    if (g.id === 'shapeLock') return g.t >= g.at && g.t < g.at + g.win;
    if (g.id === 'dark') return g.t < g.win;
    return false;
  }

  function goalPass(msg) {
    const S = getState();
    const g = S && S.goal;
    if (!g || g.ok) return;
    g.ok = true;
    showJudge('부목표 달성');
    toast('부목표 달성 — ' + g.label + (msg ? ' · ' + msg : ''));
    S.goldEdge = Math.max(S.goldEdge || 0, 0.25);
    const audio = getAudio();
    if (audio && audio.gong) audio.gong();
    renderGoalHud();
    telemetry.event('subgoal', { id: g.id, result: 'pass' });
  }

  function goalFail(msg) {
    const S = getState();
    const g = S && S.goal;
    if (!g || g.fail || g.ok) return;
    g.fail = true;
    renderGoalHud();
    toast('부목표 실패 — ' + (msg || g.label));
    telemetry.event('subgoal', { id: g.id, result: 'fail', why: msg || null });
  }

  function goalOnStroke(type) {
    const S = getState();
    const g = S && S.goal;
    if (!g || g.fail || g.ok) return false;
    if (g.id === 'shapeLock' && goalWindowOn() && type !== 'tap' && type !== 'circle' && totemShapes.indexOf(type) < 0 && type !== g.shape) {
      g.fail = true;
      renderGoalHud();
      showJudge('다른 무늬 — 목표 실패');
      toast('부목표 실패: ' + g.label + ' — ' + (shapeMark[g.shape] || '') + '만 써야 했습니다');
      telemetry.event('subgoal', { id: g.id, result: 'fail', got: type, want: g.shape });
      return true;
    }
    return false;
  }

  function goalOnKill(z) {
    const S = getState();
    const g = S && S.goal;
    if (!g || g.fail) return;
    if (g.id === 'hunt' && g.ids.indexOf(z.id) >= 0) {
      g.n++;
      if (g.n >= g.need) goalPass('사냥 완료');
    }
    if (g.id === 'timed') S.timeLeft = Math.min((S.stage && S.stage.time) || 999, (S.timeLeft || 0) + ((S.stage && S.stage.subgoal && S.stage.subgoal.add) || 0.5));
  }

  function tickGoal(dt) {
    const S = getState();
    const g = S && S.goal;
    if (!g || g.ok || g.fail) { renderGoalHud(); return; }
    g.t += dt;
    const audio = getAudio();
    if (g.id === 'guard') {
      g.hitT = (g.hitT || 0) + dt;
      g.spawnT = (g.spawnT || 0) + dt;
      let guardN = 0;
      const zList = S.zombies || [];
      for (let i = 0; i < zList.length; i++) if (zList[i].alive && zList[i].goalTarget) guardN++;
      if (g.spawnT >= 6 && guardN < 5 && g.t < g.win) {
        g.spawnT = 0;
        const a = Math.random() * Math.PI * 2;
        const z = spawnZombie({ x: g.pos.x + Math.cos(a) * 8, z: g.pos.z + Math.sin(a) * 8, type: Math.random() < 0.3 ? 'brute' : 'imp' });
        if (z) z.goalTarget = true;
      }
      if (g.hitT >= 1.2) {
        let near = false;
        for (let i = 0; i < zList.length; i++) {
          const z = zList[i];
          if (z.alive && !z.isBoss && dist(z, g.pos) < 1.5) { near = true; break; }
        }
        if (near) {
          g.hitT = 0;
          g.hp -= 1;
          S.shake = Math.max(S.shake || 0, 0.3);
          if (audio && audio.drum) audio.drum();
          if (g.hp <= 0) { g.hp = 0; goalFail('석등이 꺼졌습니다'); }
        }
      }
      if (g.t >= g.win && g.hp > 0) goalPass('석등이 살아 있습니다');
    } else if (g.id === 'hunt') {
      if (!g.ids.length && g.t >= 2) {
        for (let i = 0; i < g.need; i++) {
          const a = i / g.need * Math.PI * 2 + 0.4;
          const z = spawnZombie({ x: S.hero.x + Math.cos(a) * 9, z: S.hero.z + Math.sin(a) * 9, type: 'elite' });
          if (z) { z.elite = true; z.goalTarget = true; g.ids.push(z.id); }
        }
        toast('사냥감 — 정예 셋이 골짜기에 들어섰습니다');
      }
      if (g.ids.length && g.ids.every(function (id) { return !(S.zombies || []).some(function (z) { return z.id === id && z.alive; }); })) goalPass('셋 다 베었습니다');
      else if (g.t > g.win) goalFail('시간이 지났습니다');
    } else if (g.id === 'shapeLock') {
      if (g.t >= g.at && !g.announced) { g.announced = true; toast('한 무늬 구간 — ' + (shapeMark[g.shape] || '') + '만 쓸 수 있습니다'); }
      if (g.t >= g.at + g.win) goalPass('한 무늬로 버텼습니다');
    } else if (g.id === 'dark') {
      g.ringMul = g.t < g.win ? 0.78 : 1;
      if (g.t >= g.win) goalPass('어둠을 버텼습니다');
    }
    renderGoalHud();
  }

  return {
    initGoal,
    goalWindowOn,
    goalOnStroke,
    goalOnKill,
    goalPass,
    goalFail,
    tickGoal,
    goalHudText,
    renderGoalHud,
    resetCache: function () { _goalHudCache = ''; }
  };
}
