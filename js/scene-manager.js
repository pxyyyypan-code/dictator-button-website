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
    announceAudio(target.id, leaving ? leaving.id : '');
    if (typeof changeListener === 'function') {
      changeListener(target, currentIndex);
    }
    return true;
  }

  /**
   * 切场景的音频：换 BGM，并在白名单内的节点上放一声「页面出现」。
   *
   * 写在这里而不是 onChange：那个回调是单变量（changeListener），
   * 只能注册一个，已经被 app.js 的 updateProgress 占了。
   *
   * BGM 切曲本身是幂等的（同曲重复调用不重头播），所以 u06→u08
   * 这种都是 BGM3 的路径不会断。SFX03 则必须走白名单：
   * u06~u10 共用同一块 canvas，画面是连续的，响一声反而把连续感打断。
   */
  function announceAudio(enteringId, leavingId) {
    if (typeof AudioManager === 'undefined') return;
    const tuning = typeof CONFIG !== 'undefined' ? CONFIG : {};
    const bgm = (tuning.AUDIO_SCENE_BGM || {})[enteringId];
    if (bgm) AudioManager.playBgm(bgm);
    if (enteringId === leavingId) return;
    const list = tuning.AUDIO_SCENE_ENTER_SFX || [];
    if (list.indexOf(enteringId) !== -1) AudioManager.playSfx('sfx03');
  }

  /** 按场景 id 切换，例如 'u01'。找不到时静默返回 false，注意排查拼写。 */
  function goToId(sceneId) {
    const index = SCENE_FLOW.findIndex(function (s) { return s.id === sceneId; });
    if (index === -1) {
      console.warn('[scene] 未知场景 id：', sceneId);
      return false;
    }
    return goToIndex(index);
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

  /** 回到流程起点并清理定时器（文档 FR-06-03 / u12 重新开始）。 */
  function reset() {
    clearTimers();
    currentIndex = 0;
    renderVisibility(SCENE_FLOW[0].viewId || SCENE_FLOW[0].id);
    // 重新开始：app.js 的 restart 链里 AudioManager.reset() 已经把 BGM 停了，
    // 这里要把首页那首重新起上，否则重新体验一路到 u02 都是静的。
    announceAudio(SCENE_FLOW[0].id, '');
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
