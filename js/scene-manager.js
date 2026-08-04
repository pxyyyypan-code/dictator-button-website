/**
 * scene-manager.js —— UX 场景切换、进入/退出钩子与状态清理（文档 §7.1）
 * 本文件只负责「哪个场景可见」与「切换时清理什么」，不含任何游戏逻辑。
 */
'use strict';

const SceneManager = (function () {
  /** @type {number} SCENE_FLOW 中的当前下标 */
  let currentIndex = 0;
  /** @type {Array<number>} 本场景注册的定时器，切场景时统一清理（文档 §5.3 重置） */
  let sceneTimers = [];
  /** @type {Object<string, {onEnter?: Function, onExit?: Function}>} */
  const hooks = {};
  /** @type {Function|null} 每次切换后的通知回调，供 app.js 更新界面 */
  let changeListener = null;

  /** 注册某场景的进入/退出钩子。 */
  function registerHooks(sceneId, handlers) {
    hooks[sceneId] = handlers || {};
  }

  function onChange(fn) {
    changeListener = fn;
  }

  /**
   * 注册一个受管定时器：切换场景时会被自动清除，
   * 避免文档 §6.1 所列「重新开始后重复生成 / 旧事件残留」。
   */
  function addTimer(fn, delayMs) {
    const id = window.setTimeout(function () {
      sceneTimers = sceneTimers.filter(function (t) { return t !== id; });
      fn();
    }, delayMs);
    sceneTimers.push(id);
    return id;
  }

  function clearTimers() {
    sceneTimers.forEach(function (id) { window.clearTimeout(id); });
    sceneTimers = [];
  }

  function getScene(index) {
    return SCENE_FLOW[index] || null;
  }

  function current() {
    return getScene(currentIndex);
  }

  function currentIdx() {
    return currentIndex;
  }

  /** 按 SCENE_FLOW 下标切换场景；越界则忽略。 */
  function goToIndex(index) {
    const target = getScene(index);
    if (!target) {
      return false;
    }

    const leaving = getScene(currentIndex);
    if (leaving && hooks[leaving.id] && typeof hooks[leaving.id].onExit === 'function') {
      hooks[leaving.id].onExit();
    }
    clearTimers();

    currentIndex = index;
    renderVisibility(target.viewId || target.id);

    if (hooks[target.id] && typeof hooks[target.id].onEnter === 'function') {
      hooks[target.id].onEnter();
    }
    if (typeof changeListener === 'function') {
      changeListener(target, currentIndex);
    }
    return true;
  }

  /** 按场景 id 切换，例如 'ux-01'。 */
  function goToId(sceneId) {
    const index = SCENE_FLOW.findIndex(function (s) { return s.id === sceneId; });
    return index === -1 ? false : goToIndex(index);
  }

  function next() {
    return goToIndex(currentIndex + 1);
  }

  function back() {
    return goToIndex(currentIndex - 1);
  }

  /** 只让目标场景可见，其余隐藏（单页场景切换，文档 §1.3）。 */
  function renderVisibility(sceneId) {
    const all = document.querySelectorAll('[data-scene]');
    all.forEach(function (el) {
      const isTarget = el.getAttribute('data-scene') === sceneId;
      el.classList.toggle('scene--active', isTarget);
      el.setAttribute('aria-hidden', isTarget ? 'false' : 'true');
    });
  }

  /** 回到流程起点并清理定时器（文档 FR-06-03 / UX-14）。 */
  function reset() {
    clearTimers();
    currentIndex = 0;
    renderVisibility(SCENE_FLOW[0].viewId || SCENE_FLOW[0].id);
    if (typeof changeListener === 'function') {
      changeListener(SCENE_FLOW[0], 0);
    }
  }

  return {
    registerHooks: registerHooks,
    onChange: onChange,
    addTimer: addTimer,
    clearTimers: clearTimers,
    current: current,
    currentIndex: currentIdx,
    goToIndex: goToIndex,
    goToId: goToId,
    next: next,
    back: back,
    reset: reset,
    total: SCENE_FLOW.length
  };
})();
