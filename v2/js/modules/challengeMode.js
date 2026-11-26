/* v2/js/modules/challengeMode.js — 심안: 묵검 v1.25 도전 모드(무한 심연 · 보스 러시 · 무늬 시련) 컨트롤러 모듈 */

import { STAGES, stageOf } from './stages.js';
import { CHALLENGES, challengeOf } from './upgrades.js';

export function createChallengeController(deps) {
  const {
    getState,
    getSave,
    persist,
    cfg,
    shapeUnlock,
    elById,
    challengeUnlocked,
    challengeRecord,
    curMode,
    spawnBoss,
    closeArena,
    gainXp,
    xpNeed,
    openLevelUp,
    endRun,
    startRun,
    showBossCard,
    toast,
    telemetry
  } = deps;

  function initChallenge(id, stageNo) {
    const S = getState();
    if (!S) return;
    const c = challengeOf(id);
    if (!c || !challengeUnlocked(id)) { S.challenge = null; return; }
    S.challenge = id;
    S.challengeT = 0;
    if (id === 'endless') {
      S.timeLeft = 99999;
      S.endlessKills = 0; S.endlessBossN = 0; S.endlessNextBoss = 180;
    } else if (id === 'bossrush') {
      S.timeLeft = 99999;
      S.bossIdx = 0; S.rushNext = 0.8;
    } else if (id === 'trial') {
      const pool = (S.stage.shapes || shapeUnlock).slice(0, 2);
      S.pool = pool.slice(0, Math.max(1, Math.min(2, pool.length)));
      S.trialPool = S.pool.slice();
    }
    telemetry.event('challenge_start', { id: id, stage: stageNo, record: challengeRecord(id) });
    toast(c.name + ' — ' + c.desc);
  }

  function endlessBoss() {
    const S = getState();
    if (!S) return null;
    const n = (S.endlessBossN || 0);
    const stageNo = 1 + (n % STAGES.length);
    const st = stageOf(stageNo);
    const shapes = 4 + Math.floor(Math.random() * 5);
    const prev = S.stage;
    S.stage = st;
    S.bossShapeAdj = curMode().bossShapes;
    const b = spawnBoss({ r: cfg.bossSpawnR, nShapes: shapes });
    S.stage = prev;
    if (b) {
      toast('무한 심연 — ' + (st.bossName || '귀물') + ' (무늬 ' + shapes + ')');
      telemetry.event('endless_boss', { n: n + 1, stage: stageNo, shapes: shapes });
    }
    S.bossSpawned = true;
    return b;
  }

  function spawnRushBoss() {
    const S = getState();
    if (!S || S.challenge !== 'bossrush') return null;
    const idx = S.bossIdx || 0;
    const st = stageOf(Math.min(STAGES.length, idx + 1));
    const prev = S.stage, prevAdj = S.bossShapeAdj;
    S.stage = st;
    const shapes = Math.max(3, st.bossShapes + (curMode().bossShapes || 0));
    const b = spawnBoss({ r: cfg.bossSpawnR, nShapes: shapes });
    S.stage = prev; S.bossShapeAdj = prevAdj;
    S.bossSpawned = true;
    S.rushNext = 0;
    if (b) {
      toast('보스 러시 ' + (idx + 1) + '/' + STAGES.length + ' — ' + (st.bossName || st.name));
      showBossCard(st);
      telemetry.event('rush_boss', { n: idx + 1, stage: st.id, shapes: shapes });
    }
    return b;
  }

  function challengeProgress() {
    const S = getState();
    const save = getSave();
    if (!S || !S.challenge) return;
    const b = S.boss;
    if (S.challenge === 'bossrush') {
      if (S.rushNext > 0) {
        S.rushNext -= 1 / 60;
        if (S.rushNext <= 0) spawnRushBoss();
        return;
      }
      if (b && !b.alive) {
        S.bossIdx = (S.bossIdx || 0) + 1;
        if (S.bossIdx >= STAGES.length) {
          save.records = save.records || {};
          save.records.bossrush = Math.max(save.records.bossrush || 0, STAGES.length);
          persist();
          endRun(true, '열두 보스를 모두 베었습니다');
          return;
        }
        closeArena(true);
        S.boss = null; S.bossSpawned = false;
        S.rushNext = 1.2;
        gainXp(xpNeed(S.level) - (S.xp || 0));
        return;
      }
      return;
    }
    if (S.challenge === 'endless') {
      if (b && !b.alive) {
        S.endlessBossN = (S.endlessBossN || 0) + 1;
        save.records = save.records || {};
        save.records.endless = Math.max(save.records.endless || 0, S.endlessBossN);
        persist();
        closeArena(true);
        S.boss = null; S.bossSpawned = false;
        S.endlessNextBoss = (S.elapsed || 0) + 180;
        gainXp(60);
        toast('귀물을 베었다 — 3분 뒤 다음 귀물');
        return;
      }
      if (!b && !S.bossSpawned && (S.elapsed || 0) >= (S.endlessNextBoss || 180)) {
        endlessBoss();
      }
    }
  }

  function startChallenge(id) {
    const save = getSave();
    if (!challengeUnlocked(id)) { toast('아직 잠긴 도전입니다'); return false; }
    startRun({ stage: save.stage || 1, challenge: id });
    return true;
  }

  function renderChallenges() {
    const box = elById('titleChallenges');
    if (!box) return;
    const rows = CHALLENGES.map(function (c) {
      const on = challengeUnlocked(c.id);
      const rec = challengeRecord(c.id);
      const recTxt = c.id === 'endless' ? (rec ? '최고 ' + rec + '귀물' : '기록 없음')
        : c.id === 'bossrush' ? (rec ? '최고 ' + rec + '/' + STAGES.length : '기록 없음')
        : (rec ? '기록 ' + rec : '기록 없음');
      return '<button type="button" class="btn chal' + (on ? '' : ' locked') + '" data-chal="' + c.id + '"' + (on ? '' : ' disabled') + '>'
        + '<b>' + c.name + '</b><span>' + (on ? recTxt : c.unlock + '장 클리어로 해금') + '</span></button>';
    });
    box.innerHTML = rows.join('');
    Array.prototype.forEach.call(box.querySelectorAll('button[data-chal]'), function (b) {
      b.addEventListener('click', function () { startChallenge(b.getAttribute('data-chal')); });
    });
  }

  return {
    initChallenge,
    challengeProgress,
    endlessBoss,
    spawnRushBoss,
    startChallenge,
    renderChallenges
  };
}
