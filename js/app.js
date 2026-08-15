/**
 * app.js —— 初始化、事件绑定、全局数据与 u01~u12 流程协调
 * V0.8：流程改为「选一个烦恼 → 匹配一件道具 → 生成泡泡」。
 *
 * 场景 id 与 V0.7 的对应关系不是整体平移，u07 起错开一位：
 *   ux-06+ux-07→u06   ux-08→u07   ux-09→u08   ux-10→u09   ux-11→u10   ux-12→u11
 * 因此本文件里的 id 全部是手工重定向的，不要用正则批量替换。
 */
'use strict';

const appData = {
  // ---- 选择结果（u03 / u04 / u05）----
  // 玩家一次选 1~3 条（CONFIG.WORRY_MAX_PICK）。下面两个数组**同序等长**：
  // selectedWorries[i] 配到的就是 matchedGadgets[i]，
  // u04 的三列分配、u05 的算式、u11/u12 的记录全靠这层对应关系，别单独重排其中一个。
  pickedCategory: '',
  selectedWorries: [],      // WorryData.createProfile 的返回值，按选中顺序
  matchedGadgets: [],       // GadgetData 记录，和上面一一对应
  worries: [],              // 送进 BubbleGame 的泡泡文案：选中的烦恼 + 同类兄弟

  // ---- 沉浸段计数（u06~u10）----
  bubbles: [],
  successfulDeleteCount: 0,
  deleteAttemptCount: 0,
  splitCount: 0,
  returnDeleteAttemptCount: 0,
  clickCount: 0,
  buttonUnlocked: false,
  buttonTriggered: false,
  normalPhaseStartedAt: 0,
  normalTimer: 0,
  growthStarted: false,
  growthStartedAt: 0,
  growthIntervalMs: CONFIG.GROWTH_INTERVAL_START_MS,
  transitionProgress: 0,
  chaosLevel: 0,
  currentScene: SCENE_FLOW[0].id,
  chaosTimer: 0,
  returnChoiceVisible: false,
  returnChoiceResolved: false,
  erasureFallbackTimer: 0,

  // ---- 结尾段（u11 / u12）----
  dialogueIndex: 0,
  selectedWorryText: '',   // u10 停下来观察时，玩家盯着的那个泡泡的文案（只有一条）
  finalChoice: '',
  observeSelected: false
};

const App = (function () {
  const el = {};

  // 注意：bind 只做正向缓存、永不失效。所有 data-bind 节点必须首屏就在，
  // 且此后不能被 innerHTML/克隆重建，否则这里会一直往脱离文档的旧节点写字。
  function bind(name) {
    if (!el[name]) el[name] = document.querySelector('[data-bind="' + name + '"]');
    return el[name];
  }

  function canvas(name) {
    return document.querySelector('[data-canvas="' + name + '"]');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setText(name, value) {
    const node = bind(name);
    if (node) node.textContent = String(value == null ? '' : value);
  }

  function stopChaosTicker() {
    if (appData.chaosTimer) window.clearInterval(appData.chaosTimer);
    appData.chaosTimer = 0;
  }

  /** 正常删除阶段的门控轮询（时长 + 次数双条件）。 */
  function stopNormalTicker() {
    if (appData.normalTimer) window.clearInterval(appData.normalTimer);
    appData.normalTimer = 0;
  }

  function stopErasureFallback() {
    if (appData.erasureFallbackTimer) window.clearTimeout(appData.erasureFallbackTimer);
    appData.erasureFallbackTimer = 0;
  }

  function stopAllTickers() {
    stopChaosTicker();
    stopNormalTicker();
    stopErasureFallback();
  }

  function resetData() {
    stopAllTickers();
    hideReturnChoice();
    appData.pickedCategory = '';
    appData.selectedWorries.length = 0;
    appData.matchedGadgets.length = 0;
    appData.worries.length = 0;
    appData.bubbles.length = 0;
    appData.successfulDeleteCount = 0;
    appData.deleteAttemptCount = 0;
    appData.splitCount = 0;
    appData.returnDeleteAttemptCount = 0;
    appData.clickCount = 0;
    appData.buttonUnlocked = false;
    appData.buttonTriggered = false;
    appData.normalPhaseStartedAt = 0;
    appData.growthStarted = false;
    appData.growthStartedAt = 0;
    appData.growthIntervalMs = CONFIG.GROWTH_INTERVAL_START_MS;
    appData.transitionProgress = 0;
    appData.chaosLevel = 0;
    appData.returnChoiceVisible = false;
    appData.returnChoiceResolved = false;
    appData.dialogueIndex = 0;
    appData.selectedWorryText = '';
    appData.finalChoice = '';
    appData.observeSelected = false;
    BubbleGame.destroy();
  }

  /* ---------------- u03 选择烦恼：留在 app.js 的那一半 ---------------- */

  // 粒子场、悬停预览、展开列表、自由输入分类、飞进四次元口袋——全在 worry-picker.js。
  // 这里只剩两件"选完之后"的事：把烦恼摊成泡泡场、按烦恼配道具。
  // 它们的消费者是 u06 和 u11，不属于选择页，所以没有跟着搬走。

  /**
   * 沉浸段的泡泡不只放选中的那几条：
   * 同一大类的兄弟烦恼一起进场，才撑得起「已处理 0 / 12」的场面。
   * 选中的那几条永远排在最前，保证它们一定出现在首批泡泡里。
   *
   * 兄弟按大类**轮流**取（round-robin），不是把第一类抽干再抽第二类：
   * 选了三条就该三类的烦恼都在场上飘，否则玩家看到的还是单一类别的泡泡场。
   */
  function buildWorryField() {
    appData.worries.length = 0;
    if (!appData.selectedWorries.length) return;
    const seen = Object.create(null);
    appData.selectedWorries.forEach(function (worry) {
      seen[worry.text] = true;
      appData.worries.push(worry);
    });

    // 每个已选大类各留一份兄弟队列，同一大类被选中两条时只留一份，避免重复配额。
    const queues = [];
    appData.selectedWorries.forEach(function (worry) {
      if (queues.some(function (q) { return q.category === worry.category; })) return;
      queues.push({ category: worry.category, list: (WorryData.byCategory(worry.category) || []).slice(), i: 0 });
    });

    let alive = true;
    while (alive && appData.worries.length < CONFIG.WORRY_SIBLING_COUNT) {
      alive = false;
      for (let q = 0; q < queues.length; q += 1) {
        const queue = queues[q];
        while (queue.i < queue.list.length && seen[queue.list[queue.i].text]) queue.i += 1;
        if (queue.i >= queue.list.length) continue;
        alive = true;
        const preset = queue.list[queue.i];
        queue.i += 1;
        seen[preset.text] = true;
        appData.worries.push(WorryData.createProfile(preset.text, {
          presetId: preset.id,
          category: preset.category,
          behaviorType: preset.behaviorType
        }));
        if (appData.worries.length >= CONFIG.WORRY_SIBLING_COUNT) break;
      }
    }
  }

  /**
   * 自由输入可能没有预设道具，此时按大类退化，而不是永远发 1 号道具。
   * taken 是本轮已经发出去的道具 id：两条烦恼配到同一件时换一件，
   * 否则老虎机会出现"两列显示同一张图却说是两件道具"的自相矛盾。
   */
  function matchGadget(profile, taken) {
    if (!profile) return null;
    const used = taken || Object.create(null);
    const direct = GadgetData.forWorry(profile);
    if (direct && !used[direct.id]) return direct;

    // 同大类里另找一件没被占用的。
    const siblings = WorryData.byCategory(profile.category) || [];
    for (let i = 0; i < siblings.length; i += 1) {
      if (!siblings[i].gadget) continue;
      const found = GadgetData.byName(siblings[i].gadget);
      if (found && !used[found.id]) return found;
    }
    // 同类里全被占了就在全表里兜一件，实在兜不到才允许重复。
    const spare = GadgetData.all.find(function (item) { return !used[item.id]; });
    return spare || direct || GadgetData.all[0] || null;
  }

  /* ---------------- worry-picker.js 的回调 ---------------- */

  /**
   * 加/减一条烦恼。返回值决定 worry-picker 说哪句话：
   *   'added' 加上了 · 'removed' 取消了 · 'full' 已经选满、这次什么都没做。
   * 选满时**不顶替**：替掉哪一条都是替玩家做主，让他自己先取消一条。
   */
  function onWorryToggle(profile) {
    if (!profile) return 'full';
    // 同一条的判定用文案而不是 presetId：自由输入没有 presetId，
    // 而"把预设里那句话原样打一遍"和点那一条，对玩家来说就是同一件事。
    const at = appData.selectedWorries.findIndex(function (item) {
      return item.text === profile.text;
    });
    if (at >= 0) {
      appData.selectedWorries.splice(at, 1);
      appData.pickedCategory = appData.selectedWorries.length
        ? appData.selectedWorries[appData.selectedWorries.length - 1].category
        : '';
      return 'removed';
    }
    if (appData.selectedWorries.length >= CONFIG.WORRY_MAX_PICK) return 'full';
    appData.selectedWorries.push(profile);
    appData.pickedCategory = profile.category;
    return 'added';
  }

  /** 清空全部选择：u03 的「清空重选」、u05 的「重新选择」、restart 都会到这里。 */
  function onWorryClear() {
    appData.selectedWorries.length = 0;
    appData.pickedCategory = '';
    appData.matchedGadgets.length = 0;
    appData.worries.length = 0;
  }

  /**
   * 烦恼已经沿弧线飞进四次元口袋——这时才配道具、翻到老虎机页。
   * 配道具放在动画之后而不是之前：老虎机三列要停在这几枚道具上，
   * 早一步晚一步无所谓，但顺序反了就得在两处各写一遍匹配逻辑。
   */
  function onWorryConfirmed() {
    buildWorryField();
    const taken = Object.create(null);
    appData.matchedGadgets = appData.selectedWorries.map(function (worry) {
      const found = matchGadget(worry, taken);
      if (found) taken[found.id] = true;
      return found;
    }).filter(Boolean);
    SceneManager.goToId('u04');
  }

  /** 清空选择并把选择页复位。restart 与 u05 的「重新选择」共用。 */
  function resetWorryPick() {
    onWorryClear();
    WorryPicker.reset();
  }

  /* ---------------- u04 老虎机 / u05 匹配结果 ---------------- */

  // 滚动、停位、拨杆、跨场景飞行、道具说明弹窗全在 gadget-match.js。
  // app.js 只在结果页兜一个底：拿不到道具说明 u03 被跳过了，退回去重选比空着页面好。
  function enterGadgetResult() {
    if (!GadgetMatch.renderResult()) SceneManager.goToId('u03');
  }

  /* ---------------- 连续泡泡体验（u06~u10） ---------------- */

  function immersiveScene() {
    return document.querySelector('[data-scene="u06"]');
  }

  function setImmersivePhase(phase) {
    const scene = immersiveScene();
    if (!scene) return;
    ['calm', 'growth', 'ready', 'erasing', 'blank', 'return'].forEach(function (name) {
      scene.classList.toggle('phase-' + name, phase === name);
    });
    scene.dataset.phase = phase;
    window.requestAnimationFrame(refreshAvoidRects);
  }

  function setContinuousCopy(tag, title, desc) {
    setText('continuousTag', tag);
    setText('continuousTitle', title);
    setText('continuousDesc', desc);
  }

  function setImmersiveStatus(message) {
    setText('immersiveStatus', message || '');
  }

  function syncGameStats() {
    if (appData.currentScene === 'u10') {
      // 重现阶段：只展示尝试次数与当前数量，不出现“删除成功”。
      setText('primaryMetricLabel', '删除尝试');
      setText('primaryMetricValue', appData.returnDeleteAttemptCount);
      setText('bubbleMetricValue', BubbleGame.getBubbleCount());
      setText('systemMetricValue', '再次出现');
      return;
    }
    const growthLike = ['u07', 'u08', 'u09'].includes(appData.currentScene);
    setText('primaryMetricLabel', growthLike ? '删除尝试' : '已处理');
    setText('primaryMetricValue', growthLike ? appData.deleteAttemptCount : appData.successfulDeleteCount);
    setText('bubbleMetricValue', BubbleGame.getBubbleCount());
  }

  function refreshAvoidRects() {
    const experienceCanvas = canvas('experience');
    if (!experienceCanvas || !experienceCanvas.getBoundingClientRect) return;
    const canvasRect = experienceCanvas.getBoundingClientRect();
    if (canvasRect.width < 2 || canvasRect.height < 2) return;

    const selectors = [
      '.immersive-header',
      '.game-hud--immersive',
      '.immersive-exit',
      '.dictator-inline.is-visible',
      '.return-choice.is-visible'
    ];
    const rects = [];
    selectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return;
        const rect = node.getBoundingClientRect();
        rects.push({
          left: rect.left - canvasRect.left,
          top: rect.top - canvasRect.top,
          right: rect.right - canvasRect.left,
          bottom: rect.bottom - canvasRect.top,
          padding: selector.indexOf('header') !== -1 ? 24 : 16
        });
      });
    });
    BubbleGame.setAvoidRects(rects);
  }

  function applyChaosVisuals(level) {
    const scene = immersiveScene();
    if (!scene) return;
    const chaos = clamp(level, 0, 1);
    appData.chaosLevel = chaos;
    BubbleGame.setChaosLevel(chaos);
    scene.style.setProperty('--chaos-level', chaos.toFixed(3));

    const reveal = clamp((chaos - CONFIG.BUTTON_REVEAL_CHAOS_START) /
      Math.max(0.01, 1 - CONFIG.BUTTON_REVEAL_CHAOS_START), 0, 1);
    const device = bind('dictatorInline');
    if (device) {
      if (!appData.buttonUnlocked) {
        device.style.top = '';
        device.style.bottom = '';
      }
      device.classList.toggle('is-visible', reveal > 0.01 || appData.buttonUnlocked);
      device.style.opacity = String(appData.buttonUnlocked ? 1 : reveal);
      device.style.transform = 'translateX(-50%) translateY(' + Math.round((1 - reveal) * 24) + 'px) scale(' + (0.90 + reveal * 0.10).toFixed(3) + ')';
    }
    window.requestAnimationFrame(refreshAvoidRects);
  }

  function computeChaosLevel() {
    if (!appData.growthStarted) return 0;
    const bubbleCount = BubbleGame.getBubbleCount();
    const elapsed = Math.max(0, performance.now() - appData.growthStartedAt);
    const bubbleScore = clamp((bubbleCount - CONFIG.INITIAL_BUBBLE_COUNT) /
      Math.max(1, CONFIG.CHAOS_BUBBLE_FULL - CONFIG.INITIAL_BUBBLE_COUNT), 0, 1);
    const paceScore = clamp((CONFIG.GROWTH_INTERVAL_START_MS - appData.growthIntervalMs) /
      Math.max(1, CONFIG.GROWTH_INTERVAL_START_MS - CONFIG.GROWTH_INTERVAL_MIN_MS), 0, 1);
    const attemptScore = clamp(appData.deleteAttemptCount / Math.max(1, CONFIG.CHAOS_ATTEMPT_FULL), 0, 1);
    const splitScore = clamp(appData.splitCount / Math.max(1, CONFIG.CHAOS_SPLIT_FULL), 0, 1);
    const timeScore = clamp(elapsed / Math.max(1, CONFIG.CHAOS_TIME_FULL_MS), 0, 1);
    return clamp(
      bubbleScore * 0.30 + paceScore * 0.22 + attemptScore * 0.18 + splitScore * 0.12 + timeScore * 0.18,
      0,
      1
    );
  }

  /**
   * 道具在失控阶段逐渐失效——HUD 左上角同步变灰。
   * 拿到几件就写几件的名字；图标位只有一格，放第一件——
   * HUD 是角落里的一行小字，塞三个图标会把标题挤下去。
   */
  function updateGadgetHud(weakened) {
    const name = bind('gadgetHudName');
    const icon = bind('gadgetHudIcon');
    const list = appData.matchedGadgets;
    const gadget = list[0] || null;
    if (name) {
      name.textContent = list.map(function (item) { return item.name; }).join('、');
    }
    if (icon && gadget && icon.getAttribute('src') !== gadget.image) {
      icon.src = gadget.image;
      icon.alt = gadget.name;
    }
    const host = name && name.closest ? name.closest('.gadget-hud') : null;
    if (host) host.classList.toggle('is-weakened', Boolean(weakened));
  }

  /**
   * 失控阶段的标题只由 transitionProgress 推进，且必须按
   * 「删除似乎开始失效」→「为什么越来越多？」的顺序出现。
   * 全程不出现任何「第二阶段」之类的提示。
   */
  function updateGrowthCopy() {
    if (appData.buttonUnlocked || appData.currentScene === 'u08') {
      setContinuousCopy('DANGER · FINAL AUTHORIZATION', '紧急清除协议已开放', '如果你仍想让它们全部消失，可以启动最终授权。');
      setText('systemMetricValue', '最终授权');
      updateGadgetHud(true);
      return;
    }
    if (appData.transitionProgress < 0.28) {
      setContinuousCopy('DELETE TEST', '点击泡泡，尝试删除烦恼', '删除测试仍在继续。');
      setText('systemMetricValue', '响应偏差');
    } else if (appData.transitionProgress < CONFIG.TRANSITION_TITLE_SWITCH) {
      setContinuousCopy('DELETE TEST', '删除响应出现偏差', '道具的效果正在减弱。');
      setText('systemMetricValue', '出现异常');
      updateGadgetHud(true);
    } else {
      setContinuousCopy('DELETE TEST', '为什么越来越多？', '对象数量与删除记录开始不一致。');
      setText('systemMetricValue', '逐渐失控');
      updateGadgetHud(true);
    }
  }

  function buttonConditionsMet() {
    if (!appData.growthStarted) return false;
    const elapsed = performance.now() - appData.growthStartedAt;
    return elapsed >= CONFIG.BUTTON_UNLOCK_MIN_DURATION_MS &&
      appData.deleteAttemptCount >= CONFIG.BUTTON_UNLOCK_MIN_ATTEMPTS &&
      BubbleGame.getBubbleCount() >= CONFIG.BUTTON_UNLOCK_BUBBLE_MIN;
  }

  function unlockDictatorButton() {
    if (appData.buttonUnlocked) return;
    appData.buttonUnlocked = true;
    const button = bind('inlineButton');
    const device = bind('dictatorInline');
    if (button) {
      button.disabled = false;
      button.textContent = '执行全部删除';
    }
    if (device) {
      device.classList.add('is-visible', 'is-interactive');
      device.style.opacity = '1';
      device.style.transform = 'translateX(-50%) translateY(0) scale(1)';
    }
    setText('dictatorLabel', '独裁者按钮 · 最终授权');
    setText('inlineButtonHint', '这是唯一保留在场中央的按钮。一旦按下，无法中断。');
    setText('systemMetricValue', '最终授权');
    setImmersiveStatus('');
    setImmersivePhase('ready');
    applyChaosVisuals(Math.max(0.88, appData.chaosLevel));
    if (appData.currentScene === 'u07') SceneManager.goToId('u08');
  }

  function evaluateChaosAndUnlock() {
    if (!['u07', 'u08'].includes(appData.currentScene)) return;
    // transitionProgress：从进入失控起 0→1，约 9 秒完成渐变。
    const elapsed = Math.max(0, performance.now() - appData.growthStartedAt);
    appData.transitionProgress = clamp(elapsed / Math.max(1, CONFIG.TRANSITION_RAMP_MS), 0, 1);
    BubbleGame.setTransitionProgress(appData.transitionProgress);

    const chaos = computeChaosLevel();
    // 边缘红光随渐变进度同步加强，不会在“刚失控”时就整屏泛红。
    applyChaosVisuals(Math.max(chaos, appData.transitionProgress * 0.85));
    updateGrowthCopy();
    syncGameStats();
    if (buttonConditionsMet()) unlockDictatorButton();
  }

  function startChaosTicker() {
    stopChaosTicker();
    evaluateChaosAndUnlock();
    appData.chaosTimer = window.setInterval(evaluateChaosAndUnlock, 180);
  }

  /**
   * 正常删除阶段的门控：必须同时满足
   *   1) 停留时长 ≥ NORMAL_PHASE_MIN_MS（14 秒）
   *   2) 成功删除 ≥ NORMAL_DELETE_THRESHOLD（8 次）
   * 用轮询而不是只在 onDelete 里判断，是因为用户可能很快点满 8 次，
   * 这时必须由时间条件接手，反之亦然。
   */
  function startNormalTicker() {
    stopNormalTicker();
    appData.normalTimer = window.setInterval(function () {
      if (appData.currentScene !== 'u06' || appData.growthStarted) {
        stopNormalTicker();
        return;
      }
      const elapsed = performance.now() - appData.normalPhaseStartedAt;
      const normalGoalMet = elapsed >= CONFIG.NORMAL_PHASE_MIN_MS &&
        appData.successfulDeleteCount >= CONFIG.NORMAL_DELETE_THRESHOLD;
      const maxWaitReached = elapsed >= CONFIG.NORMAL_PHASE_MAX_MS;
      if (normalGoalMet || maxWaitReached) {
        stopNormalTicker();
        beginGrowthTransition();
      }
    }, 200);
  }

  function beginGrowthTransition() {
    if (appData.growthStarted) return;
    appData.growthStarted = true;
    stopNormalTicker();
    // 第一次异常先发生，再由极短的系统提示接住，不直接解释原因。
    setImmersiveStatus('响应异常');
    SceneManager.addTimer(function () {
      if (appData.currentScene === 'u06') SceneManager.goToId('u07');
    }, 420);
  }

  function buildBubbleCallbacks() {
    return {
      onClick: function () {
        appData.clickCount += 1;
      },
      onDelete: function () {
        if (appData.currentScene === 'u06') {
          appData.successfulDeleteCount += 1;
          setImmersiveStatus('删除成功');
        } else {
          appData.deleteAttemptCount += 1;
          setImmersiveStatus('这一次它消失了');
        }
        syncGameStats();
      },
      onSplit: function (effect) {
        appData.deleteAttemptCount += 1;
        appData.splitCount += 1;
        setImmersiveStatus('它分裂成了 ' + effect.childrenCreated + ' 个，烦恼仍在增加');
        evaluateChaosAndUnlock();
      },
      onReject: function () {
        appData.deleteAttemptCount += 1;
        setImmersiveStatus('响应失败');
        evaluateChaosAndUnlock();
      },
      onBehavior: function (effect) {
        const noDeleteKinds = ['escape', 'return', 'stubborn', 'burst', 'pressure', 'blur'];
        if (noDeleteKinds.includes(effect.kind)) appData.deleteAttemptCount += 1;
        const copy = {
          escape: '它躲开了。',
          return: '它又在别处出现了。',
          cluster: '附近的泡泡被牵动了。',
          stubborn: '它裂开了一点，却还在。',
          linked: '另一个泡泡也发生了变化。',
          burst: '它突然移开了。',
          pressure: '它变小了，却没有消失。',
          blur: '先看清它，才能真正处理。',
          'split-preview': '它消失前留下了几个分裂残影。'
        };
        setImmersiveStatus(copy[effect.kind] || '对象行为发生变化。');
        syncGameStats();
        evaluateChaosAndUnlock();
      },
      onObserveSelect: function (effect) {
        // V0.8 的 u10 不再让用户点泡泡挑一个，这个回调只作为兼容保留。
        if (appData.currentScene !== 'u10' || appData.observeSelected) return;
        appData.observeSelected = true;
        appData.selectedWorryText = effect.text || '';
      },
      onReturnDelete: function () {
        appData.returnDeleteAttemptCount += 1;
        setImmersiveStatus(RETURN_FEEDBACK_LINES[
          Math.floor(Math.random() * RETURN_FEEDBACK_LINES.length)
        ]);
        syncGameStats();
      },
      onMiss: function () {
        if (appData.currentScene === 'u06') setImmersiveStatus('未命中，再试一次');
      },
      onBubbleCount: function () {
        syncGameStats();
        if (appData.growthStarted) evaluateChaosAndUnlock();
      },
      onGrowthPace: function (status) {
        appData.growthIntervalMs = status.intervalMs;
        evaluateChaosAndUnlock();
      }
    };
  }

  function triggerInlineButton() {
    if (!appData.buttonUnlocked || appData.buttonTriggered) return;
    appData.buttonTriggered = true;
    const button = bind('inlineButton');
    if (button) {
      button.disabled = true;
      button.textContent = '删除程序启动';
    }
    setText('inlineButtonHint', '最终授权已确认');
    stopChaosTicker();
    stopNormalTicker();
    BubbleGame.stopGrowth();
    BubbleGame.stopNormalPhase();
    SceneManager.goToId('u09');
  }

  /**
   * 全部删除：泡泡在原地爆裂，不再向按钮或屏幕中心聚集，
   * 因此这里不需要任何目标坐标。空白状态保持 EMPTY_PAUSE_MS。
   */
  function beginErasureSequence() {
    setImmersivePhase('erasing');
    applyChaosVisuals(0);
    setContinuousCopy('ERASURE IN PROGRESS', '删除程序正在运行', '正在移除所有对象……');
    setImmersiveStatus('');
    setText('systemMetricValue', '不可中断');

    let done = false;
    function enterBlank() {
      if (done) return;
      done = true;
      stopErasureFallback();
      setImmersivePhase('blank');
      setContinuousCopy('', '它们消失了。', '');
      SceneManager.addTimer(function () {
        if (appData.currentScene === 'u09') setContinuousCopy('', '', '');
      }, CONFIG.BLANK_TITLE_VISIBLE_MS);
      SceneManager.addTimer(function () {
        if (appData.currentScene === 'u09') SceneManager.goToId('u10');
      }, CONFIG.BLANK_HOLD_MS);
    }

    // onComplete 是推进的唯一信号：一旦中途 destroy/clearAll 就再也不会触发，
    // 流程会永久卡在清空页。这里补一道超时兜底。
    stopErasureFallback();
    appData.erasureFallbackTimer = window.setTimeout(function () {
      if (appData.currentScene === 'u09') enterBlank();
    }, CONFIG.ERASURE_FALLBACK_MS);

    BubbleGame.startErasure({
      durationMs: CONFIG.ERASURE_EXPLOSION_DURATION_MS,
      onComplete: enterBlank
    });
  }

  /**
   * u10 重现：只回来 3~5 个，且**不可点击**。
   * 它们浮现完毕后直接给出唯一出口，不再有「再试一次 / 停下来看看」的二选一。
   */
  function beginReturnSequence() {
    const scene = immersiveScene();
    if (scene) scene.classList.remove('is-observing', 'is-focus');
    setImmersivePhase('return');
    applyChaosVisuals(0);
    setContinuousCopy('SYSTEM ECHO', '它们正在回来', '这一次，你只能看着。');
    setImmersiveStatus('');
    appData.returnDeleteAttemptCount = 0;
    appData.returnChoiceResolved = false;
    hideReturnChoice();
    BubbleGame.setInteractive(false);

    const span = CONFIG.RETURN_BUBBLE_MAX - CONFIG.RETURN_BUBBLE_MIN + 1;
    const count = CONFIG.RETURN_BUBBLE_MIN + Math.floor(Math.random() * Math.max(1, span));

    BubbleGame.respawnSequentially(appData.worries, {
      initialDelayMs: CONFIG.RETURN_INITIAL_DELAY_MS,
      intervalMs: CONFIG.RETURN_INTERVAL_MS,
      mode: 'soft',
      interactive: false,
      count: count,
      onFirst: function () {
        setImmersiveStatus('');
      },
      onComplete: function () {
        SceneManager.addTimer(function () {
          if (appData.currentScene !== 'u10') return;
          setContinuousCopy('UNEXPECTED RETURN', '真的消失了吗？', '');
          syncGameStats();
          showReturnChoice();
          window.requestAnimationFrame(refreshAvoidRects);
        }, CONFIG.RETURN_COPY_DELAY_MS);
      }
    });

    // 兜底：respawnSequentially 若因故没走完，也要保证出口出现。
    SceneManager.addTimer(function () {
      if (appData.currentScene === 'u10' && !appData.returnChoiceVisible) showReturnChoice();
    }, CONFIG.RETURN_INITIAL_DELAY_MS + CONFIG.RETURN_INTERVAL_MS * (CONFIG.RETURN_BUBBLE_MAX + 2) +
       CONFIG.RETURN_COPY_DELAY_MS);
  }

  function showReturnChoice() {
    const panel = bind('returnChoice');
    if (!panel) return;
    appData.returnChoiceVisible = true;
    setText('returnChoiceQuestion', '它又回来了。');
    panel.classList.add('is-visible');
    panel.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(refreshAvoidRects);
  }

  function hideReturnChoice() {
    const panel = bind('returnChoice');
    appData.returnChoiceVisible = false;
    if (!panel) return;
    panel.classList.remove('is-visible');
    panel.setAttribute('aria-hidden', 'true');
    window.requestAnimationFrame(refreshAvoidRects);
  }

  /** 「看看发生了什么」：u10 通往 u11 的唯一出口。 */
  function stopAndObserve() {
    if (appData.currentScene !== 'u10') return;
    if (appData.returnChoiceResolved) return;
    appData.returnChoiceResolved = true;
    appData.finalChoice = '停下来看看';
    appData.selectedWorryText = joinWorryTexts();
    hideReturnChoice();
    SceneManager.goToId('u11');
  }

  /* ---------------- 结尾段（u11 / u12） ---------------- */

  /** 「A、B、C」——记录里的横排写法。 */
  function joinWorryTexts() {
    return appData.selectedWorries.map(function (item) { return item.text; }).join('、');
  }

  /** 「A」「B」「C」——正文里的引号写法，书名号本身就断得开，不再加顿号。 */
  function quoteWorryTexts() {
    return appData.selectedWorries.map(function (item) { return '「' + item.text + '」'; }).join('');
  }

  function joinGadgetNames() {
    return appData.matchedGadgets.map(function (item) { return item.name; }).join('、');
  }

  /** u11 口袋里的道具位：三个全部静态在场，多出来的收起来。 */
  const POCKET_BINDS = ['pocketGadget', 'pocketGadget2', 'pocketGadget3'];

  function renderSummary() {
    const picks = appData.selectedWorries;
    setText('summaryWorry', picks.length ? '关于' + quoteWorryTexts() : '');

    // 每条烦恼有自己的总结段落，但同 behaviorType 的几条会给出同一段话，
    // 原样堆三遍就成了复读机——去重之后一段一行（.summary-body 是 pre-line）。
    const seen = Object.create(null);
    const paragraphs = [];
    picks.forEach(function (worry) {
      const text = WorryData.summaryFor(worry);
      if (!text || seen[text]) return;
      seen[text] = true;
      paragraphs.push(text);
    });
    setText('summaryText', paragraphs.join('\n'));

    // 段数决定这一栏的字号档位。这一屏是定高的，三段按原字号排下来会把
    // 底下那两个按钮顶出视口——而它们是这一页唯一的出口。
    // 报的是去重之后的**段数**而不是选了几条烦恼：真正吃高度的是段数，
    // 三条同类型的烦恼去重后只剩一段，那就该按一段的字号排。
    const tier = String(Math.min(paragraphs.length, 3) || 1);
    const worryNode = bind('summaryWorry');
    const textNode = bind('summaryText');
    if (worryNode) worryNode.dataset.count = tier;
    if (textNode) textNode.dataset.count = tier;

    const stack = bind('pocketStack');
    if (stack) stack.dataset.count = String(Math.min(appData.matchedGadgets.length, 3) || 1);
    POCKET_BINDS.forEach(function (name, i) {
      const image = bind(name);
      const gadget = appData.matchedGadgets[i];
      if (!image) return;
      image.hidden = !gadget;
      if (gadget) {
        image.src = gadget.image;
        image.alt = gadget.name;
      }
    });
    setText('pocketTag', joinGadgetNames());

    const nextButton = bind('summaryNext');
    if (!nextButton) return;
    nextButton.disabled = true;
    nextButton.textContent = '继续观察';
    SceneManager.addTimer(function () {
      if (appData.currentScene !== 'u11') return;
      nextButton.disabled = false;
      nextButton.textContent = '查看体验记录';
    }, CONFIG.THEME_MIN_READ_MS);
  }

  /** u12 体验记录：五节点时间线。不做排行榜、不做评分、不做心理诊断。 */
  function renderLog() {
    stopAllTickers();
    BubbleGame.stop();

    const picks = appData.selectedWorries;
    setText('logSubtitle', picks.length
      ? '你带着' + quoteWorryTexts() + '走完了一次删除实验。'
      : '你走完了一次删除实验。');
    setText('logHint', '');

    const nodes = [
      { label: '你选择的烦恼', value: picks.length ? joinWorryTexts() : '—' },
      { label: '系统匹配的道具', value: appData.matchedGadgets.length ? joinGadgetNames() : '—' },
      { label: '删除有效期', value: '成功删除 ' + appData.successfulDeleteCount + ' 次' },
      {
        label: '失控之后',
        value: '尝试 ' + appData.deleteAttemptCount + ' 次，分裂 ' + appData.splitCount + ' 次'
      },
      { label: '最终', value: '它又回来了，而你停下来看了看' }
    ];

    const list = bind('logNodes');
    if (!list) return;
    list.innerHTML = '';
    nodes.forEach(function (node, index) {
      const li = document.createElement('li');
      li.className = 'log-node';
      li.style.setProperty('--log-delay', (index * CONFIG.LOG_NODE_FADE_MS) + 'ms');
      const num = document.createElement('span');
      num.className = 'log-node__index';
      num.textContent = String(index + 1);
      const label = document.createElement('span');
      label.className = 'log-node__label';
      label.textContent = node.label;
      const value = document.createElement('span');
      value.className = 'log-node__value';
      value.textContent = node.value;
      li.appendChild(num);
      li.appendChild(label);
      li.appendChild(value);
      list.appendChild(li);
    });
  }

  // 保存记录：阶段 6 才做真正的导出图片，这里先给出诚实的反馈而不是假装成功。
  function saveLog() {
    setText('logHint', '保存功能将在下一版开放，本次记录不会离开你的浏览器。');
  }

  function openExitModal() {
    const modal = bind('exitModal');
    if (!modal) return;
    modal.classList.add('modal--open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeExitModal() {
    const modal = bind('exitModal');
    if (!modal) return;
    modal.classList.remove('modal--open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function resetImmersiveUi() {
    const scene = immersiveScene();
    if (scene) {
      scene.style.setProperty('--chaos-level', '0');
      scene.dataset.phase = 'calm';
      scene.classList.remove('is-observing', 'is-focus');
    }
    setImmersivePhase('calm');
    setContinuousCopy('DELETE TEST', '点击气泡，试着把烦恼清除', '先观察它们如何消失。点击空白不会产生惩罚。');
    setText('primaryMetricLabel', '已处理');
    setText('systemMetricValue', '删除有效');
    setImmersiveStatus('');
    updateGadgetHud(false);
    hideReturnChoice();
    setText('returnChoiceQuestion', '它又回来了。');
    const device = bind('dictatorInline');
    if (device) {
      device.classList.remove('is-visible', 'is-interactive');
      device.style.opacity = '0';
      device.style.top = '';
      device.style.bottom = '';
      device.style.transform = 'translateX(-50%) translateY(24px) scale(.9)';
    }
    const button = bind('inlineButton');
    if (button) {
      button.disabled = true;
      button.textContent = '等待授权';
    }
    setText('dictatorLabel', '紧急清除协议');
    setText('inlineButtonHint', '');
  }

  function restart() {
    closeExitModal();
    // 先清除场景级延时任务与所有轮询，再销毁 Canvas 与动画循环，
    // 避免旧流程回调干扰下一轮体验（§八 状态清理）。
    SceneManager.clearTimers();
    stopAllTickers();
    resetData();
    resetWorryPick();
    GadgetMatch.reset();
    resetImmersiveUi();
    syncGameStats();
    SceneManager.reset();
  }

  /* ---------------- 场景钩子 ---------------- */

  // 注意：registerHooks 是覆盖写入，同一个 id 注册两次时后者会顶掉前者。
  // 合并后的节点（u02 / u03 / u06 / u12）必须把逻辑写在同一个 onEnter 里。
  function registerSceneHooks() {
    SceneManager.registerHooks('u02', { onEnter: Dialogue.enter });

    SceneManager.registerHooks('u03', {
      onEnter: WorryPicker.enter,
      onExit: WorryPicker.exit
    });

    SceneManager.registerHooks('u04', {
      onEnter: GadgetMatch.startSpin,
      onExit: GadgetMatch.exitSlot
    });

    SceneManager.registerHooks('u05', {
      onEnter: enterGadgetResult,
      onExit: GadgetMatch.exitResult
    });

    // u06 是容器所有者，也是唯一调用 BubbleGame.init 的地方。
    // u07~u10 只能用 setMode/setInteractive/startGrowth 等，绝不能再 init。
    SceneManager.registerHooks('u06', {
      onEnter: function () {
        if (!appData.worries.length) {
          SceneManager.goToId('u03');
          return;
        }
        appData.successfulDeleteCount = 0;
        appData.deleteAttemptCount = 0;
        appData.splitCount = 0;
        appData.returnDeleteAttemptCount = 0;
        appData.clickCount = 0;
        appData.buttonUnlocked = false;
        appData.buttonTriggered = false;
        appData.normalPhaseStartedAt = 0;
        appData.growthStarted = false;
        appData.growthStartedAt = 0;
        appData.growthIntervalMs = CONFIG.GROWTH_INTERVAL_START_MS;
        appData.transitionProgress = 0;
        appData.chaosLevel = 0;
        appData.returnChoiceVisible = false;
        appData.returnChoiceResolved = false;
        appData.observeSelected = false;
        stopAllTickers();
        hideReturnChoice();
        resetImmersiveUi();

        // init 内部是 mount(..., { interactive: false })，
        // 所以必须紧跟一次 setInteractive(true)，否则平静段点不动。
        BubbleGame.init(appData.worries, canvas('experience'), buildBubbleCallbacks());
        BubbleGame.setInteractive(true);
        BubbleGame.setMode('calm');
        BubbleGame.setChaosLevel(0);
        BubbleGame.setTransitionProgress(0);
        BubbleGame.startNormalPhase();
        appData.normalPhaseStartedAt = performance.now();
        startNormalTicker();
        syncGameStats();
        window.requestAnimationFrame(refreshAvoidRects);
      },
      onExit: stopNormalTicker
    });

    SceneManager.registerHooks('u07', {
      onEnter: function () {
        appData.growthStarted = true;
        appData.growthStartedAt = performance.now();
        appData.growthIntervalMs = CONFIG.GROWTH_INTERVAL_START_MS;
        appData.transitionProgress = 0;
        BubbleGame.stopNormalPhase();
        BubbleGame.setTransitionProgress(0);
        setImmersivePhase('growth');
        setText('systemMetricValue', '出现异常');
        updateGadgetHud(true);
        BubbleGame.setMode('growth');
        BubbleGame.startGrowth();
        startChaosTicker();
        syncGameStats();
      }
    });

    SceneManager.registerHooks('u08', {
      onEnter: function () {
        setImmersivePhase('ready');
        updateGrowthCopy();
        syncGameStats();
      }
    });

    SceneManager.registerHooks('u09', { onEnter: beginErasureSequence });

    SceneManager.registerHooks('u10', {
      onEnter: beginReturnSequence,
      onExit: function () {
        hideReturnChoice();
        BubbleGame.setInteractive(false);
        BubbleGame.clearAll();
        BubbleGame.stop();
      }
    });

    SceneManager.registerHooks('u11', { onEnter: renderSummary });
    SceneManager.registerHooks('u12', { onEnter: renderLog });
  }

  /* ---------------- 事件 ---------------- */

  function handleNext() {
    const current = SceneManager.current();
    if (!current) return;
    // u02 的主按钮先当「继续」用：还有下一句就只翻句，讲完最后一句才翻页。
    if (current.id === 'u02' && Dialogue.next()) return;
    // u03 的出口是「确认这个烦恼」，要先播飞进口袋的动画再翻页。
    if (current.id === 'u03') {
      WorryPicker.confirm();
      return;
    }
    SceneManager.next();
  }

  function handleBack() {
    const current = SceneManager.current();
    if (!current) return;
    // 沉浸段不可回退：中途退出只能走「退出体验」。
    if (['u07', 'u08', 'u09', 'u10'].includes(current.id)) return;
    // u05 往回是 u04，而 u04 一进就自动前进——会原地打转。直接回选择页。
    if (current.id === 'u05') {
      resetWorryPick();
      SceneManager.goToId('u03');
      return;
    }
    SceneManager.back();
  }

  function handleAction(action, target) {
    switch (action) {
      case 'next': handleNext(); break;
      case 'back': handleBack(); break;
      case 'exit': openExitModal(); break;
      case 'exit-cancel': closeExitModal(); break;
      case 'exit-confirm':
      case 'restart': restart(); break;
      case 'pick-category': WorryPicker.pickCategory(target.dataset.category); break;
      // 从展开的完整列表退回九宫粒子场。展开列表里的「← 返回全部类别」
      // 和推测面板上的「返回继续选」都走这一条：两处都只是收起当前视图，
      // 已经挑好的几条烦恼原样留着，别在这里顺手清空。
      case 'worry-back': WorryPicker.backToCategories(); break;
      case 'pick-worry': WorryPicker.pickWorry(target.dataset.presetId); break;
      case 'classify-worry': WorryPicker.classifyFree(); break;
      case 'confirm-worry': WorryPicker.confirm(); break;
      case 'reset-worry-pick': resetWorryPick(); break;
      // 「跳过」只跳过滚动本身；拨杆是规格里明写的衔接动作，不能一起跳掉。
      case 'skip-slot': GadgetMatch.skipSpin(); break;
      case 'pull-lever': GadgetMatch.pullLever(); break;
      // 三个道具位共用这一个 action，点的是哪一件由 data-gadget-index 说了算。
      case 'show-gadget-tip': GadgetMatch.showTip(target.dataset.gadgetIndex); break;
      case 'hide-gadget-tip': GadgetMatch.hideTip(); break;
      case 'trigger-inline-button': triggerInlineButton(); break;
      case 'return-stop': stopAndObserve(); break;
      case 'save-log': saveLog(); break;
      default:
        // handleAction 的 default 会静默吞掉未知 action，
        // 打一条 warn 好过页面「点了没反应」还查不到原因。
        console.warn('[app] 未处理的 data-action：', action);
        break;
    }
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-action]');
      if (!target || target.disabled) return;
      handleAction(target.dataset.action, target);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target.id === 'worry-text') {
        event.preventDefault();
        WorryPicker.classifyFree();
      }
      if (event.key !== 'Escape') return;
      if (GadgetMatch.tipOpen()) {
        GadgetMatch.hideTip();
        return;
      }
      if (bind('exitModal') && bind('exitModal').classList.contains('modal--open')) {
        closeExitModal();
      }
    });

    window.addEventListener('resize', function () {
      window.requestAnimationFrame(refreshAvoidRects);
    }, { passive: true });
  }

  function updateProgress(scene, index) {
    appData.currentScene = scene.id;
    document.body.dataset.currentScene = scene.id;
    const node = bind('progress');
    if (node) node.textContent = (index + 1) + ' / ' + SceneManager.total;
    document.documentElement.style.setProperty('--progress-x', String(index / (SceneManager.total - 1)));
  }

  function init() {
    registerSceneHooks();
    SceneManager.onChange(updateProgress);
    bindEvents();

    // 三个前半段模块只在这里挂一次，之后由场景钩子驱动。
    // 它们都不碰 appData，所有状态读写都经这几个回调，
    // 免得同一份"当前烦恼"在两个文件里各存一份、然后对不上。
    Dialogue.mount({
      onFinish: function () { SceneManager.goToId('u03'); }
    });
    // getSelected / getGadget / getWorry 一律返回**数组**（可能是空的），
    // 而且 getGadget 和 getWorry 同序等长——u05 的算式、u04 的三列分配都靠这层对应。
    WorryPicker.mount({
      getSelected: function () { return appData.selectedWorries; },
      onToggle: onWorryToggle,
      onClear: onWorryClear,
      onConfirmed: onWorryConfirmed
    });
    GadgetMatch.mount({
      getGadget: function () { return appData.matchedGadgets; },
      getWorry: function () { return appData.selectedWorries; },
      onLifted: function () { SceneManager.goToId('u05'); }
    });

    resetImmersiveUi();
    syncGameStats();
    SceneManager.reset();
  }

  return { init: init, data: appData, restart: restart };
})();

document.addEventListener('DOMContentLoaded', App.init);
