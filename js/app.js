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
  pickedCategory: '',
  selectedWorry: null,      // WorryData.createProfile 的返回值
  matchedGadget: null,      // GadgetData 记录
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
  selectedWorryText: '',
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
    appData.selectedWorry = null;
    appData.matchedGadget = null;
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

  /* ---------------- u02 引导对话 ---------------- */

  // 阶段 4 由 dialogue.js 接管逐句推进，这里只维护页码，让骨架可走通。
  function renderDialogue() {
    setText('dialoguePage', '02 / 12');
  }

  /* ---------------- u03 选择烦恼 ---------------- */

  function setHint(message) {
    setText('worryPickHint', message || '');
  }

  function worryTexts() {
    return appData.worries.map(function (item) { return item.text; });
  }

  function renderWorryCategories() {
    const container = bind('worryCategories');
    if (!container) return;
    container.innerHTML = '';
    WorryData.categories.forEach(function (category) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'worry-particle';
      button.textContent = category.label;
      button.title = category.fullName || category.label;
      button.dataset.action = 'pick-category';
      button.dataset.category = category.id;
      button.classList.toggle('is-active', appData.pickedCategory === category.id);
      container.appendChild(button);
    });
  }

  /** 展开某个大类下的细分烦恼（初稿是 3 条）。 */
  function renderWorrySubs(categoryId) {
    const container = bind('worrySubs');
    if (!container) return;
    container.innerHTML = '';
    if (!categoryId) return;
    const previews = WorryData.hoverPreview(categoryId) || [];
    const presets = previews.length
      ? previews
      : WorryData.byCategory(categoryId).slice(0, CONFIG.WORRY_SUB_COUNT);
    presets.slice(0, CONFIG.WORRY_SUB_COUNT).forEach(function (preset) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'worry-sub';
      button.textContent = preset.text;
      button.dataset.action = 'pick-worry';
      button.dataset.presetId = String(preset.id);
      const picked = appData.selectedWorry && appData.selectedWorry.presetId === preset.id;
      button.classList.toggle('is-active', Boolean(picked));
      container.appendChild(button);
    });
  }

  function renderWorryPicker() {
    renderWorryCategories();
    renderWorrySubs(appData.pickedCategory);
    syncConfirmButton();
  }

  function syncConfirmButton() {
    const button = bind('confirmWorry');
    if (button) button.disabled = !appData.selectedWorry;
  }

  function pickCategory(categoryId) {
    if (!categoryId) return;
    appData.pickedCategory = categoryId;
    // 换大类等于放弃上一次选择，避免「选了A类的条目却显示B类」。
    appData.selectedWorry = null;
    hideClassifyPanel();
    renderWorryPicker();
    const category = WorryData.category(categoryId);
    setHint(category ? '「' + (category.fullName || category.label) + '」——选一条最贴近你的。' : '');
  }

  function pickWorry(presetId) {
    const preset = WorryData.preset(Number(presetId));
    if (!preset) return;
    appData.pickedCategory = preset.category;
    appData.selectedWorry = WorryData.createProfile(preset.text, {
      presetId: preset.id,
      category: preset.category,
      behaviorType: preset.behaviorType
    });
    hideClassifyPanel();
    renderWorryPicker();
    setHint('已选择：「' + preset.text + '」。');
  }

  /** 自由输入：本地词表打分，认不出就请用户手选，绝不随机发道具。 */
  function classifyFreeWorry() {
    const field = document.getElementById('worry-text');
    if (!field) return;
    const text = field.value.trim();
    if (!text) {
      setHint('先写下一条烦恼，再看看它属于哪一类。');
      field.focus();
      return;
    }
    const guess = WorryData.classifyFreeText(text);
    if (!guess) {
      hideClassifyPanel();
      setHint('这条烦恼我还认不出来。请从上面的九大类里挑一个最接近的。');
      return;
    }
    const category = WorryData.category(guess.category || guess);
    appData.pickedCategory = category ? category.id : '';
    appData.selectedWorry = WorryData.createProfile(text, {
      category: appData.pickedCategory
    });
    renderWorryPicker();
    showClassifyPanel(category ? category.fullName || category.label : '');
    setHint('');
  }

  function showClassifyPanel(categoryName) {
    const panel = bind('classifyPanel');
    setText('classifyGuess', categoryName
      ? '看起来，这更像是「' + categoryName + '」方面的烦恼。'
      : '');
    if (!panel) return;
    panel.classList.add('is-visible');
    panel.setAttribute('aria-hidden', 'false');
  }

  function hideClassifyPanel() {
    const panel = bind('classifyPanel');
    if (!panel) return;
    panel.classList.remove('is-visible');
    panel.setAttribute('aria-hidden', 'true');
  }

  /**
   * 沉浸段的泡泡不只放选中的那一条：
   * 同一大类的兄弟烦恼一起进场，才撑得起「已处理 0 / 12」的场面。
   * 选中的那条永远排第一，保证它一定出现在首批泡泡里。
   */
  function buildWorryField() {
    appData.worries.length = 0;
    if (!appData.selectedWorry) return;
    appData.worries.push(appData.selectedWorry);
    const siblings = WorryData.byCategory(appData.selectedWorry.category) || [];
    siblings.forEach(function (preset) {
      if (appData.worries.length >= CONFIG.WORRY_SIBLING_COUNT) return;
      if (preset.text === appData.selectedWorry.text) return;
      appData.worries.push(WorryData.createProfile(preset.text, {
        presetId: preset.id,
        category: preset.category,
        behaviorType: preset.behaviorType
      }));
    });
  }

  /** 自由输入可能没有预设道具，此时按大类退化，而不是永远发 1 号道具。 */
  function matchGadget(profile) {
    if (!profile) return null;
    const direct = GadgetData.forWorry(profile);
    if (direct) return direct;
    const sibling = (WorryData.byCategory(profile.category) || []).find(function (item) {
      return Boolean(item.gadget);
    });
    return (sibling && GadgetData.byName(sibling.gadget)) || GadgetData.all[0] || null;
  }

  function confirmWorry() {
    if (!appData.selectedWorry) {
      setHint('请先选一条烦恼，或者自己写一条。');
      return;
    }
    buildWorryField();
    appData.matchedGadget = matchGadget(appData.selectedWorry);
    SceneManager.goToId('u04');
  }

  function resetWorryPick() {
    appData.pickedCategory = '';
    appData.selectedWorry = null;
    appData.matchedGadget = null;
    appData.worries.length = 0;
    hideClassifyPanel();
    const field = document.getElementById('worry-text');
    if (field) field.value = '';
    renderWorryPicker();
    setHint('');
  }

  /* ---------------- u04 老虎机匹配 ---------------- */

  // 阶段 4 由 gadget-match.js 接管真实滚动与拨杆动画；
  // 骨架期只把三列填满、等一段时间就翻页，保证流程能走通。
  function startSlotMatch() {
    setText('slotWorryLabel', appData.selectedWorry ? appData.selectedWorry.text : '');
    ['reelA', 'reelB', 'reelC'].forEach(function (name, index) {
      const reel = bind(name);
      if (!reel) return;
      reel.innerHTML = '';
      GadgetData.reelPool(index + 1).forEach(function (gadget) {
        const cell = document.createElement('span');
        cell.className = 'slot__cell' + (gadget ? '' : ' slot__cell--empty');
        if (gadget) {
          const img = document.createElement('img');
          img.src = gadget.image;
          img.alt = gadget.name;
          img.width = 64;
          img.height = 64;
          img.loading = 'lazy';
          cell.appendChild(img);
        }
        reel.appendChild(cell);
      });
    });
    SceneManager.addTimer(function () {
      if (appData.currentScene === 'u04') SceneManager.goToId('u05');
    }, CONFIG.SLOT_SPIN_MS);
  }

  /* ---------------- u05 匹配结果 ---------------- */

  function renderGadgetResult() {
    const gadget = appData.matchedGadget;
    if (!gadget) {
      // 正常走不到这里；真到了说明 u03 被跳过，退回去重选比空着页面好。
      SceneManager.goToId('u03');
      return;
    }
    setText('gadgetName', gadget.name);
    setText('gadgetGroup', '道具类别｜' + gadget.group);
    setText('gadgetDesc', gadget.description || '');
    const image = bind('gadgetImage');
    if (image) {
      image.src = gadget.image;
      image.alt = gadget.name;
    }
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

  /** 道具在失控阶段逐渐失效——HUD 左上角同步变灰。 */
  function updateGadgetHud(weakened) {
    const name = bind('gadgetHudName');
    const icon = bind('gadgetHudIcon');
    const gadget = appData.matchedGadget;
    if (name) name.textContent = gadget ? gadget.name : '';
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
    appData.selectedWorryText = appData.selectedWorry ? appData.selectedWorry.text : '';
    hideReturnChoice();
    SceneManager.goToId('u11');
  }

  /* ---------------- 结尾段（u11 / u12） ---------------- */

  function renderSummary() {
    const worry = appData.selectedWorry;
    setText('summaryWorry', worry ? '关于「' + worry.text + '」' : '');
    setText('summaryText', worry ? WorryData.summaryFor(worry) : '');
    const gadget = appData.matchedGadget;
    const image = bind('pocketGadget');
    if (image && gadget) {
      image.src = gadget.image;
      image.alt = gadget.name;
    }
    setText('pocketTag', gadget ? gadget.name : '');

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

    const worry = appData.selectedWorry;
    const gadget = appData.matchedGadget;
    setText('logSubtitle', worry
      ? '你带着「' + worry.text + '」走完了一次删除实验。'
      : '你走完了一次删除实验。');
    setText('logHint', '');

    const nodes = [
      { label: '你选择的烦恼', value: worry ? worry.text : '—' },
      { label: '系统匹配的道具', value: gadget ? gadget.name : '—' },
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
    hideClassifyPanel();
    const field = document.getElementById('worry-text');
    if (field) field.value = '';
    renderWorryPicker();
    setHint('');
    resetImmersiveUi();
    syncGameStats();
    SceneManager.reset();
  }

  /* ---------------- 场景钩子 ---------------- */

  // 注意：registerHooks 是覆盖写入，同一个 id 注册两次时后者会顶掉前者。
  // 合并后的节点（u02 / u03 / u06 / u12）必须把逻辑写在同一个 onEnter 里。
  function registerSceneHooks() {
    SceneManager.registerHooks('u02', { onEnter: renderDialogue });

    SceneManager.registerHooks('u03', {
      onEnter: function () {
        renderWorryPicker();
        setHint(appData.selectedWorry
          ? '已选择：「' + appData.selectedWorry.text + '」。'
          : '先选一个大类，再挑一条具体的烦恼。');
      }
    });

    SceneManager.registerHooks('u04', { onEnter: startSlotMatch });
    SceneManager.registerHooks('u05', { onEnter: renderGadgetResult });

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
    if (current.id === 'u03') {
      confirmWorry();
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
      case 'pick-category': pickCategory(target.dataset.category); break;
      case 'pick-worry': pickWorry(target.dataset.presetId); break;
      case 'classify-worry': classifyFreeWorry(); break;
      case 'confirm-worry': confirmWorry(); break;
      case 'reset-worry-pick': resetWorryPick(); break;
      case 'skip-slot': SceneManager.goToId('u05'); break;
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
        classifyFreeWorry();
      }
      if (event.key === 'Escape' && bind('exitModal') && bind('exitModal').classList.contains('modal--open')) {
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
    renderWorryPicker();
    resetImmersiveUi();
    syncGameStats();
    SceneManager.reset();
  }

  return { init: init, data: appData, restart: restart };
})();

document.addEventListener('DOMContentLoaded', App.init);
