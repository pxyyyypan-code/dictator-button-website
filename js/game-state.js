/**
 * game-state.js —— “独裁者按钮”三关状态机。
 *
 * 只保存规则与路径，不接触 DOM / Canvas。这样同一套分支既能被页面调用，
 * 也能在 Node 中做穷举测试，避免把 L3A/B/C/D 合并错。
 */
'use strict';

const GAME_TUNING = typeof CONFIG !== 'undefined'
  ? CONFIG
  : (typeof require === 'function' ? require('./config.js') : {});

function tunedValue(group, level, fallback) {
  const values = GAME_TUNING[group] || {};
  const value = Number(values[level]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const GameState = (function () {
  const LEVELS = Object.freeze({
    L1:  Object.freeze({ key: 'L1',  level: 1, bag: 1, spawn: 1, expand: 1, escape: 1, duration: tunedValue('LEVEL_GAME_DURATION', 1, 36), target: tunedValue('LEVEL_GAME_TARGET', 1, 36) }),
    L2A: Object.freeze({ key: 'L2A', level: 2, bag: 2, spawn: 2, expand: 1, escape: 2, duration: tunedValue('LEVEL_GAME_DURATION', 2, 30), target: tunedValue('LEVEL_GAME_TARGET', 2, 48) }),
    L2B: Object.freeze({ key: 'L2B', level: 2, bag: 1, spawn: 2, expand: 2, escape: 1, duration: tunedValue('LEVEL_GAME_DURATION', 2, 30), target: tunedValue('LEVEL_GAME_TARGET', 2, 48) }),
    L3A: Object.freeze({ key: 'L3A', level: 3, bag: 3, spawn: 3, expand: 1, escape: 3, duration: tunedValue('LEVEL_GAME_DURATION', 3, 26), target: tunedValue('LEVEL_GAME_TARGET', 3, 60) }),
    L3B: Object.freeze({ key: 'L3B', level: 3, bag: 2, spawn: 3, expand: 2, escape: 2, duration: tunedValue('LEVEL_GAME_DURATION', 3, 26), target: tunedValue('LEVEL_GAME_TARGET', 3, 60) }),
    L3C: Object.freeze({ key: 'L3C', level: 3, bag: 2, spawn: 3, expand: 1, escape: 2, duration: tunedValue('LEVEL_GAME_DURATION', 3, 26), target: tunedValue('LEVEL_GAME_TARGET', 3, 60) }),
    L3D: Object.freeze({ key: 'L3D', level: 3, bag: 1, spawn: 3, expand: 3, escape: 1, duration: tunedValue('LEVEL_GAME_DURATION', 3, 26), target: tunedValue('LEVEL_GAME_TARGET', 3, 60) })
  });

  const MANUAL_NEXT = Object.freeze({ L1: 'L2B', L2A: 'L3B', L2B: 'L3D' });
  const BUTTON_NEXT = Object.freeze({ L1: 'L2A', L2A: 'L3A', L2B: 'L3C' });

  let data = null;

  function freshData() {
    return {
      currentKey: 'L1',
      pendingNextKey: '',
      usedButtonL1: false,
      usedButtonL2: false,
      ending: 0,
      endingTrigger: '',
      attempts: { L1: 0, L2A: 0, L2B: 0, L3A: 0, L3B: 0, L3C: 0, L3D: 0 },
      levelStats: {},
      history: []
    };
  }

  function reset() {
    data = freshData();
    return snapshot();
  }

  function ensure() {
    if (!data) reset();
    return data;
  }

  function current() {
    const state = ensure();
    return LEVELS[state.currentKey];
  }

  function copyStats(stats) {
    const input = stats || {};
    return {
      manualCleared: Math.max(0, Number(input.manualCleared) || 0),
      escaped: Math.max(0, Number(input.escaped) || 0),
      autoBurst: Math.max(0, Number(input.autoBurst) || 0),
      totalSpawned: Math.max(0, Number(input.totalSpawned) || 0),
      remaining: Math.max(0, Number(input.remaining) || 0),
      secondsLeft: Math.max(0, Number(input.secondsLeft) || 0),
      packing: Math.max(0, Number(input.packing) || 0),
      peakPressure: Math.max(0, Number(input.peakPressure) || 0),
      blockedSpawns: Math.max(0, Number(input.blockedSpawns) || 0),
      growthBlocked: Math.max(0, Number(input.growthBlocked) || 0),
      peakGrowthBlocked: Math.max(0, Number(input.peakGrowthBlocked) || 0)
    };
  }

  function remember(kind, stats, extra) {
    const state = ensure();
    const level = current();
    const record = Object.assign({
      levelKey: level.key,
      level: level.level,
      kind: kind,
      stats: copyStats(stats)
    }, extra || {});
    state.levelStats[level.key] = record.stats;
    state.history.push(record);
    return record;
  }

  function completeManual(stats) {
    const state = ensure();
    const level = current();
    if (level.level === 3) return finishEnding(3, 'manual-clear', stats);
    const nextKey = MANUAL_NEXT[level.key];
    if (!nextKey) throw new Error('当前状态不能按手动通关处理：' + level.key);
    state.pendingNextKey = nextKey;
    remember('manual-pass', stats, { nextKey: nextKey });
    return { type: 'pass', level: level.level, method: 'manual', nextKey: nextKey };
  }

  function completeWithButton(stats) {
    const state = ensure();
    const level = current();
    if (level.level === 3) {
      if (level.key === 'L3A') return finishEnding(1, 'button-failed', stats);
      return finishEnding(2, 'button-temporary', stats);
    }
    const nextKey = BUTTON_NEXT[level.key];
    if (!nextKey) throw new Error('当前状态不能按按钮通关处理：' + level.key);
    if (level.level === 1) state.usedButtonL1 = true;
    if (level.level === 2) state.usedButtonL2 = true;
    state.pendingNextKey = nextKey;
    remember('button-pass', stats, { nextKey: nextKey });
    return { type: 'pass', level: level.level, method: 'button', nextKey: nextKey };
  }

  function fail(stats) {
    const state = ensure();
    const level = current();
    if (level.level === 3) return resolveLevelThree(stats);
    state.pendingNextKey = '';
    remember('timeout-fail', stats);
    return { type: 'fail', level: level.level, levelKey: level.key };
  }

  function retry() {
    const state = ensure();
    const level = current();
    state.pendingNextKey = '';
    state.attempts[level.key] += 1;
    state.history.push({ levelKey: level.key, level: level.level, kind: 'retry' });
    return level;
  }

  function advance() {
    const state = ensure();
    if (!state.pendingNextKey) throw new Error('没有待进入的下一关。');
    state.currentKey = state.pendingNextKey;
    state.pendingNextKey = '';
    return current();
  }

  function resolveLevelThree(stats) {
    const result = copyStats(stats);
    const level = current();
    if (level.level !== 3) throw new Error('只有第三关可以直接解析结局。');

    if (result.manualCleared >= level.target && result.escaped === 0 && result.autoBurst === 0) {
      return finishEnding(3, 'manual-clear', result);
    }
    if (result.escaped > 0 && result.escaped >= result.autoBurst) {
      return finishEnding(1, 'natural-escape', result);
    }
    return finishEnding(4, 'auto-burst', result);
  }

  function finishEnding(ending, trigger, stats) {
    const state = ensure();
    const level = current();
    state.ending = ending;
    state.endingTrigger = trigger;
    remember('ending-' + ending, stats, { trigger: trigger });
    return { type: 'ending', ending: ending, trigger: trigger, levelKey: level.key };
  }

  function endExperience(stats) {
    return finishEnding(4, 'end-experience', stats);
  }

  function snapshot() {
    const state = ensure();
    return JSON.parse(JSON.stringify(Object.assign({}, state, { current: current() })));
  }

  function stateFor(key) {
    return LEVELS[key] || null;
  }

  reset();

  return {
    LEVELS: LEVELS,
    reset: reset,
    current: current,
    stateFor: stateFor,
    snapshot: snapshot,
    completeManual: completeManual,
    completeWithButton: completeWithButton,
    fail: fail,
    retry: retry,
    advance: advance,
    resolveLevelThree: resolveLevelThree,
    endExperience: endExperience
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameState;
