/**
 * app.js —— 初始化、事件绑定、全局数据与 UX-01~UX-14 流程协调
 * V0.5.3：延长正常删除阶段、渐变进入失控、原地爆裂清空，
 *         并在烦恼重现后交给用户主动选择「继续删除 / 停下来看看」。
 */
'use strict';

const appData = {
  worries: [],
  bubbles: [],
  successfulDeleteCount: 0,
  deleteAttemptCount: 0,
  splitCount: 0,
  returnDeleteAttemptCount: 0,
  returnAdvanceScheduled: false,
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
  returnInteractionStartedAt: 0,
  returnTimer: 0,
  returnChoiceVisible: false,
  returnChoiceResolved: false,
  continueDeleteCount: 0,
  returnExtraUntil: 0
};

const App = (function () {
  const el = {};

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

  /** 重现阶段的门控轮询（时长 + 次数双条件）。 */
  function stopReturnTicker() {
    if (appData.returnTimer) window.clearInterval(appData.returnTimer);
    appData.returnTimer = 0;
  }

  function stopAllTickers() {
    stopChaosTicker();
    stopNormalTicker();
    stopReturnTicker();
  }

  function resetData() {
    stopAllTickers();
    hideReturnChoice();
    appData.worries.length = 0;
    appData.bubbles.length = 0;
    appData.successfulDeleteCount = 0;
    appData.deleteAttemptCount = 0;
    appData.splitCount = 0;
    appData.returnDeleteAttemptCount = 0;
    appData.returnAdvanceScheduled = false;
    appData.clickCount = 0;
    appData.buttonUnlocked = false;
    appData.buttonTriggered = false;
    appData.normalPhaseStartedAt = 0;
    appData.growthStarted = false;
    appData.growthStartedAt = 0;
    appData.growthIntervalMs = CONFIG.GROWTH_INTERVAL_START_MS;
    appData.transitionProgress = 0;
    appData.chaosLevel = 0;
    appData.returnInteractionStartedAt = 0;
    appData.returnChoiceVisible = false;
    appData.returnChoiceResolved = false;
    appData.continueDeleteCount = 0;
    appData.returnExtraUntil = 0;
    BubbleGame.destroy();
  }

  /* ---------------- 烦恼输入（UX-04 / UX-05） ---------------- */

  function setHint(message) {
    const node = bind('worryHint');
    if (node) node.textContent = message || '';
  }

  function addWorry() {
    const field = document.getElementById('worry-text');
    if (!field) return;
    const text = field.value.trim();

    if (!text) {
      setHint('请先写下一条想要删除的烦恼。');
      field.focus();
      return;
    }
    if (appData.worries.length >= CONFIG.MAX_WORRIES_MVP) {
      setHint('本次体验最多记录 ' + CONFIG.MAX_WORRIES_MVP + ' 条烦恼。');
      return;
    }
    if (appData.worries.includes(text)) {
      setHint('这条烦恼已经记录过了。');
      field.focus();
      return;
    }

    appData.worries.push(text);
    field.value = '';
    setHint('已记录 ' + appData.worries.length + ' 条。');
    renderWorries();
    field.focus();
  }

  function removeWorry(index) {
    if (!Number.isInteger(index) || index < 0 || index >= appData.worries.length) return;
    appData.worries.splice(index, 1);
    setHint(appData.worries.length ? '已移除，共保留 ' + appData.worries.length + ' 条。' : '尚未记录烦恼。');
    renderWorries();
  }

  function renderWorries() {
    const editable = bind('worryList');
    if (editable) {
      editable.innerHTML = '';
      if (!appData.worries.length) {
        const li = document.createElement('li');
        li.className = 'worry-list__empty';
        li.textContent = '尚未记录烦恼';
        editable.appendChild(li);
      } else {
        appData.worries.forEach(function (text, index) {
          const li = document.createElement('li');
          const span = document.createElement('span');
          span.textContent = text;
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'worry-list__remove';
          remove.textContent = '移除';
          remove.dataset.action = 'remove-worry';
          remove.dataset.index = String(index);
          li.appendChild(span);
          li.appendChild(remove);
          editable.appendChild(li);
        });
      }
    }

    const confirmList = bind('worryListConfirm');
    if (confirmList) {
      confirmList.innerHTML = '';
      appData.worries.forEach(function (text) {
        const li = document.createElement('li');
        li.textContent = text;
        confirmList.appendChild(li);
      });
    }
  }

  /* ---------------- 连续泡泡体验（UX-06~UX-11） ---------------- */

  function immersiveScene() {
    return document.querySelector('[data-scene="ux-07"]');
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
    if (appData.currentScene === 'ux-11') {
      // 重现阶段：只展示尝试次数与当前数量，不出现“删除成功”。
      setText('primaryMetricLabel', '删除尝试');
      setText('primaryMetricValue', appData.returnDeleteAttemptCount);
      setText('bubbleMetricValue', BubbleGame.getBubbleCount());
      setText('systemMetricValue', '再次出现');
      return;
    }
    const growthLike = ['ux-08', 'ux-09', 'ux-10'].includes(appData.currentScene);
    setText('primaryMetricLabel', growthLike ? '删除尝试' : '已删除');
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
   * 失控阶段的标题只由 transitionProgress 推进，且必须按
   * 「删除似乎开始失效」→「为什么越来越多？」的顺序出现。
   * 全程不出现任何「第二阶段」之类的提示。
   */
  function updateGrowthCopy() {
    if (appData.buttonUnlocked || appData.currentScene === 'ux-09') {
      setContinuousCopy('DANGER · FINAL AUTHORIZATION', '紧急清除协议已开放', '它可以一次清除全部烦恼，但你无法中断执行过程。');
      setText('systemMetricValue', '最终授权');
      return;
    }
    if (appData.transitionProgress < CONFIG.TRANSITION_TITLE_SWITCH) {
      setContinuousCopy('DELETE TEST', '删除似乎开始失效', '有些泡泡没有消失。它们正在重新聚集。');
      setText('systemMetricValue', '出现异常');
    } else {
      setContinuousCopy('DELETE TEST', '为什么越来越多？', '每一次删除尝试，都可能让它分裂成更多泡泡。');
      setText('systemMetricValue', '逐渐失控');
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
    setText('dictatorLabel', '紧急清除协议');
    setText('inlineButtonHint', '最终授权已开放');
    setText('systemMetricValue', '最终授权');
    setImmersiveStatus('');
    setImmersivePhase('ready');
    applyChaosVisuals(Math.max(0.88, appData.chaosLevel));
    if (appData.currentScene === 'ux-08') SceneManager.goToId('ux-09');
  }

  function evaluateChaosAndUnlock() {
    if (!['ux-08', 'ux-09'].includes(appData.currentScene)) return;
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
      if (appData.currentScene !== 'ux-07' || appData.growthStarted) {
        stopNormalTicker();
        return;
      }
      const elapsed = performance.now() - appData.normalPhaseStartedAt;
      if (elapsed >= CONFIG.NORMAL_PHASE_MIN_MS &&
          appData.successfulDeleteCount >= CONFIG.NORMAL_DELETE_THRESHOLD) {
        stopNormalTicker();
        beginGrowthTransition();
      }
    }, 200);
  }

  function beginGrowthTransition() {
    if (appData.growthStarted) return;
    appData.growthStarted = true;
    stopNormalTicker();
    // 不提示“阶段切换”，只让状态栏出现第一处异常。
    setImmersiveStatus('删除请求出现异常……');
    SceneManager.addTimer(function () {
      if (appData.currentScene === 'ux-07') SceneManager.goToId('ux-08');
    }, 420);
  }

  function buildBubbleCallbacks() {
    return {
      onClick: function () {
        appData.clickCount += 1;
      },
      onDelete: function () {
        appData.successfulDeleteCount += 1;
        if (appData.currentScene === 'ux-07') {
          setImmersiveStatus('删除成功');
        } else {
          // 失控阶段的“这次居然删掉了”，不再报“删除成功”。
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
        setImmersiveStatus('它没有消失，增殖仍在继续');
        evaluateChaosAndUnlock();
      },
      onReturnDelete: function () {
        appData.returnDeleteAttemptCount += 1;
        // 只给随机反馈文案，绝不在这里推进场景：
        // 是否显示选择界面由 startReturnTicker 的双条件判定。
        setImmersiveStatus(RETURN_FEEDBACK_LINES[
          Math.floor(Math.random() * RETURN_FEEDBACK_LINES.length)
        ]);
        syncGameStats();
      },
      onMiss: function () {
        if (appData.currentScene === 'ux-07') setImmersiveStatus('未命中，再试一次');
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
    SceneManager.goToId('ux-10');
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

    BubbleGame.startErasure({
      durationMs: CONFIG.ERASURE_EXPLOSION_DURATION_MS,
      onComplete: function () {
        setImmersivePhase('blank');
        setContinuousCopy('', '什么都没有了', '');
        SceneManager.addTimer(function () {
          if (appData.currentScene === 'ux-10') setContinuousCopy('', '', '');
        }, CONFIG.BLANK_TITLE_VISIBLE_MS);
        SceneManager.addTimer(function () {
          if (appData.currentScene === 'ux-10') SceneManager.goToId('ux-11');
        }, CONFIG.EMPTY_PAUSE_MS);
      }
    });
  }

  function beginReturnSequence() {
    setImmersivePhase('return');
    applyChaosVisuals(0);
    setContinuousCopy('SYSTEM ECHO', '它们正在回来', '请先看着这些烦恼重新出现。');
    setImmersiveStatus('');
    appData.returnDeleteAttemptCount = 0;
    appData.returnAdvanceScheduled = false;
    appData.returnInteractionStartedAt = 0;
    appData.returnChoiceResolved = false;
    appData.continueDeleteCount = 0;
    appData.returnExtraUntil = 0;
    hideReturnChoice();
    BubbleGame.setInteractive(false);

    BubbleGame.respawnSequentially(appData.worries, {
      initialDelayMs: CONFIG.RETURN_INITIAL_DELAY_MS,
      intervalMs: CONFIG.RETURN_INTERVAL_MS,
      mode: 'soft',
      interactive: false,
      count: Math.max(CONFIG.RETURN_MIN_BUBBLES, appData.worries.length * 2),
      onFirst: function () {
        setImmersiveStatus('');
      },
      onComplete: function () {
        SceneManager.addTimer(function () {
          if (appData.currentScene !== 'ux-11') return;
          setContinuousCopy('UNEXPECTED RETURN', '真的消失了吗？', '试着再次点击这些泡泡。');
          BubbleGame.setMode('return');
          BubbleGame.setInteractive(true);
          setImmersiveStatus('再次点击泡泡，看看会发生什么');
          syncGameStats();
          // 交互计时从“可以点”这一刻开始，而不是从进入 UX-11 开始。
          appData.returnInteractionStartedAt = performance.now();
          startReturnTicker();
          window.requestAnimationFrame(refreshAvoidRects);
        }, CONFIG.RETURN_COPY_DELAY_MS);
      }
    });
  }

  /**
   * 重现阶段门控：必须同时满足
   *   1) 可交互时长 ≥ RETURN_INTERACTION_MIN_MS（14 秒）
   *   2) 删除尝试 ≥ RETURN_ATTEMPT_THRESHOLD（6 次）
   * 满足后只是「显示选择界面」，不自动进入 UX-12。
   */
  function startReturnTicker() {
    stopReturnTicker();
    appData.returnTimer = window.setInterval(function () {
      if (appData.currentScene !== 'ux-11') {
        stopReturnTicker();
        return;
      }
      syncGameStats();
      if (appData.returnChoiceResolved || appData.returnChoiceVisible) return;

      // 「继续删除」带来的延长期内不打扰用户。
      if (appData.returnExtraUntil) {
        if (performance.now() < appData.returnExtraUntil) return;
        appData.returnExtraUntil = 0;
        showReturnChoice();
        return;
      }

      const elapsed = performance.now() - appData.returnInteractionStartedAt;
      if (elapsed >= CONFIG.RETURN_INTERACTION_MIN_MS &&
          appData.returnDeleteAttemptCount >= CONFIG.RETURN_ATTEMPT_THRESHOLD) {
        showReturnChoice();
      }
    }, 200);
  }

  function showReturnChoice() {
    const panel = bind('returnChoice');
    if (!panel) return;
    appData.returnChoiceVisible = true;
    // 用完一次后「继续删除」不再出现，只留下「停下来看看」。
    const continueButton = bind('returnContinue');
    if (continueButton) {
      const exhausted = appData.continueDeleteCount >= CONFIG.MAX_CONTINUE_DELETE_COUNT;
      continueButton.hidden = exhausted;
      continueButton.disabled = exhausted;
    }
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

  /** 「继续删除」：只允许一次，延长约 9 秒后重新给出选择。 */
  function continueDeleting() {
    if (appData.currentScene !== 'ux-11') return;
    if (appData.continueDeleteCount >= CONFIG.MAX_CONTINUE_DELETE_COUNT) return;
    appData.continueDeleteCount += 1;
    hideReturnChoice();
    appData.returnExtraUntil = performance.now() + CONFIG.RETURN_EXTRA_INTERACTION_MS;
    setContinuousCopy('UNEXPECTED RETURN', '它还会再回来一次', '删除仍然可以继续，但结果不会改变。');
    setImmersiveStatus('它还在这里。');
    BubbleGame.setMode('return');
    BubbleGame.setInteractive(true);
  }

  /** 「停下来看看」：停止点击交互，泡泡缓慢静止，再进入既有的 UX-12。 */
  function stopAndObserve() {
    if (appData.currentScene !== 'ux-11') return;
    if (appData.returnChoiceResolved) return;
    appData.returnChoiceResolved = true;
    appData.returnExtraUntil = 0;
    stopReturnTicker();
    hideReturnChoice();
    BubbleGame.setInteractive(false);
    BubbleGame.settle();
    setContinuousCopy('UNEXPECTED RETURN', '它们仍然会回来', '删除没有让烦恼真正离开。');
    setImmersiveStatus('');
    SceneManager.addTimer(function () {
      if (appData.currentScene === 'ux-11') SceneManager.goToId('ux-12');
    }, CONFIG.RETURN_SETTLE_DELAY_MS);
  }

  /* ---------------- 主题与总结（UX-12~UX-14） ---------------- */

  function startThemeReadTimer() {
    const nextButton = bind('themeNext');
    const countdown = bind('themeCountdown');
    if (!nextButton || !countdown) return;
    nextButton.disabled = true;
    nextButton.textContent = '阅读中';
    countdown.textContent = '先让这句话停留片刻。';
    SceneManager.addTimer(function () {
      if (appData.currentScene !== 'ux-12') return;
      nextButton.disabled = false;
      nextButton.textContent = '查看体验总结';
      countdown.textContent = '你可以继续了。';
    }, CONFIG.THEME_MIN_READ_MS);
  }

  function renderSummary() {
    const list = bind('summaryList');
    if (!list) return;
    const worryText = appData.worries.length ? '“' + appData.worries.join('”“') + '”' : '那些尚未说出口的烦恼';
    const rows = [
      '你曾试图删除：' + worryText,
      '真正消失过：' + appData.successfulDeleteCount + ' 次',
      '失控后，你又进行了 ' + appData.deleteAttemptCount + ' 次删除尝试，并触发 ' + appData.splitCount + ' 次分裂。',
      '它们最终仍然出现了，但已经不再像最初那样急迫。',
      '也许需要改变的，不是它们是否存在，而是你与它们相处的方式。'
    ];
    list.innerHTML = '';
    rows.forEach(function (text) {
      const li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    });
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
    }
    setImmersivePhase('calm');
    setContinuousCopy('DELETE TEST', '点击泡泡，尝试删除烦恼', '先观察它们如何消失。点击空白不会产生惩罚。');
    setText('primaryMetricLabel', '已删除');
    setText('systemMetricValue', '删除有效');
    setImmersiveStatus('');
    hideReturnChoice();
    const device = bind('dictatorInline');
    if (device) {
      device.classList.remove('is-visible', 'is-interactive');
      device.style.opacity = '0';
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
    renderWorries();
    setHint('');
    const field = document.getElementById('worry-text');
    if (field) field.value = '';
    resetImmersiveUi();
    syncGameStats();
    SceneManager.reset();
  }

  /* ---------------- 场景钩子 ---------------- */

  function registerSceneHooks() {
    SceneManager.registerHooks('ux-04', {
      onEnter: function () {
        renderWorries();
        const field = document.getElementById('worry-text');
        if (field) field.focus();
      }
    });

    SceneManager.registerHooks('ux-05', { onEnter: renderWorries });

    SceneManager.registerHooks('ux-06', {
      onEnter: function () {
        if (!appData.worries.length) {
          setHint('请至少输入一条烦恼。');
          SceneManager.goToId('ux-04');
          return;
        }
        appData.successfulDeleteCount = 0;
        appData.deleteAttemptCount = 0;
        appData.splitCount = 0;
        appData.returnDeleteAttemptCount = 0;
        appData.returnAdvanceScheduled = false;
        appData.clickCount = 0;
        appData.buttonUnlocked = false;
        appData.buttonTriggered = false;
        appData.normalPhaseStartedAt = 0;
        appData.growthStarted = false;
        appData.growthStartedAt = 0;
        appData.growthIntervalMs = CONFIG.GROWTH_INTERVAL_START_MS;
        appData.transitionProgress = 0;
        appData.chaosLevel = 0;
        appData.returnInteractionStartedAt = 0;
        appData.returnChoiceVisible = false;
        appData.returnChoiceResolved = false;
        appData.continueDeleteCount = 0;
        appData.returnExtraUntil = 0;
        stopAllTickers();
        hideReturnChoice();
        resetImmersiveUi();

        // UX-06 仅作为后台初始化节点：直接在全屏交互 Canvas 上创建泡泡，
        // 不再展示旧的矩形“具象化”加载页面，也不让用户等待两秒。
        BubbleGame.init(appData.worries, canvas('experience'), buildBubbleCallbacks());
        syncGameStats();
        SceneManager.addTimer(function () {
          if (appData.currentScene === 'ux-06') SceneManager.goToId('ux-07');
        }, 0);
      }
    });

    SceneManager.registerHooks('ux-07', {
      onEnter: function () {
        resetImmersiveUi();
        BubbleGame.mount(canvas('experience'), { interactive: true, mode: 'calm' });
        BubbleGame.stopGrowth();
        BubbleGame.setMode('calm');
        BubbleGame.setChaosLevel(0);
        BubbleGame.setTransitionProgress(0);
        // 正常删除阶段：持续补充泡泡，保证 14 秒内都有东西可点。
        BubbleGame.startNormalPhase();
        appData.normalPhaseStartedAt = performance.now();
        startNormalTicker();
        syncGameStats();
        window.requestAnimationFrame(refreshAvoidRects);
      },
      onExit: stopNormalTicker
    });

    SceneManager.registerHooks('ux-08', {
      onEnter: function () {
        appData.growthStarted = true;
        appData.growthStartedAt = performance.now();
        appData.growthIntervalMs = CONFIG.GROWTH_INTERVAL_START_MS;
        appData.transitionProgress = 0;
        BubbleGame.stopNormalPhase();
        BubbleGame.setTransitionProgress(0);
        setImmersivePhase('growth');
        setText('systemMetricValue', '出现异常');
        BubbleGame.setMode('growth');
        BubbleGame.startGrowth();
        startChaosTicker();
        syncGameStats();
      }
    });

    SceneManager.registerHooks('ux-09', {
      onEnter: function () {
        setImmersivePhase('ready');
        updateGrowthCopy();
        syncGameStats();
      }
    });

    SceneManager.registerHooks('ux-10', { onEnter: beginErasureSequence });
    SceneManager.registerHooks('ux-11', {
      onEnter: beginReturnSequence,
      onExit: function () {
        stopReturnTicker();
        hideReturnChoice();
        BubbleGame.setInteractive(false);
        BubbleGame.clearAll();
        BubbleGame.stop();
      }
    });
    SceneManager.registerHooks('ux-12', { onEnter: startThemeReadTimer });
    SceneManager.registerHooks('ux-13', { onEnter: renderSummary });
    SceneManager.registerHooks('ux-14', {
      onEnter: function () {
        stopAllTickers();
        BubbleGame.stop();
      }
    });
  }

  /* ---------------- 事件 ---------------- */

  function handleNext() {
    const current = SceneManager.current();
    if (!current) return;
    if (current.id === 'ux-04' && !appData.worries.length) {
      setHint('请至少输入一条烦恼后再继续。');
      const field = document.getElementById('worry-text');
      if (field) field.focus();
      return;
    }
    SceneManager.next();
  }

  function handleBack() {
    const current = SceneManager.current();
    if (current && ['ux-08', 'ux-09', 'ux-10', 'ux-11'].includes(current.id)) return;
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
      case 'add-worry': addWorry(); break;
      case 'remove-worry': removeWorry(Number(target.dataset.index)); break;
      case 'trigger-inline-button': triggerInlineButton(); break;
      case 'return-continue': continueDeleting(); break;
      case 'return-stop': stopAndObserve(); break;
      default: break;
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
        addWorry();
      }
      if (event.key === 'Escape' && bind('exitModal') && bind('exitModal').classList.contains('modal--open')) {
        closeExitModal();
      }
    });

    window.addEventListener('resize', function () {
      window.requestAnimationFrame(refreshAvoidRects);
    }, { passive: true });
  }

  function renderStaticText() {
    setText('maxWorries', CONFIG.MAX_WORRIES_MVP);
  }

  function updateProgress(scene, index) {
    appData.currentScene = scene.id;
    document.body.dataset.currentScene = scene.id;
    const node = bind('progress');
    if (node) node.textContent = (index + 1) + ' / ' + SceneManager.total;
    document.documentElement.style.setProperty('--progress-x', String(index / (SceneManager.total - 1)));
  }

  function init() {
    renderStaticText();
    registerSceneHooks();
    SceneManager.onChange(updateProgress);
    bindEvents();
    renderWorries();
    resetImmersiveUi();
    syncGameStats();
    SceneManager.reset();
  }

  return { init: init, data: appData, restart: restart };
})();

document.addEventListener('DOMContentLoaded', App.init);
