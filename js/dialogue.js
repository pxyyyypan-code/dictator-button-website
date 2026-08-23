/**
 * dialogue.js —— U02 烦恼分类前的连续引导分镜
 *
 * Word 新流程被收进一个 U02 场景内部，避免改动 U03 及后续场景编号：
 *   1. 首页点击后，青色由中心扩满；右下白洞与无按钮哆啦A梦出现；
 *   2. 点击切换两句欢迎对白；
 *   3. 向下滚动进入 4×2 道具陈列，再滚动一次转为玩家提问；
 *   4. 玩家提问后直接进入独裁者按钮说明，再查看体验流程；
 *   5. 最后一次点击交还 app.js，由它进入原有 U03 烦恼分类。
 *
 * 所有文本都写入固定 DOM，不重建节点；字体完全继承 style.css 的 --ff。
 */
'use strict';

const Dialogue = (function () {
  const STAGES = [
    {
      id: 'welcome-a', panel: 'welcome', tone: 'primary', input: 'click',
      welcome: '嗨！欢迎来到22世纪未来道具体验馆。',
      announce: '哆啦A梦：嗨！欢迎来到22世纪未来道具体验馆。点击对话继续。'
    },
    {
      id: 'welcome-b', panel: 'welcome', tone: 'primary', input: 'wheel',
      welcome: '在这里你可以体验各种各样的道具，并用它们解决不同的问题！',
      scroll: '滚轮向下浏览道具',
      announce: '哆啦A梦：在这里你可以体验各种各样的道具，并用它们解决不同的问题。向下滚动继续。'
    },
    {
      id: 'gallery', panel: 'gallery', tone: 'primary', input: 'wheel',
      scroll: '继续滚动，向哆啦A梦提问',
      announce: '未来道具陈列。继续向下滚动，向哆啦A梦提问。'
    },
    {
      id: 'question', panel: 'question', tone: 'paper', input: 'click',
      announce: '你：哆啦A梦，我最近好烦啊。有什么道具可以帮我消除烦恼的吗？点击继续。'
    },
    {
      id: 'info', panel: 'info', tone: 'paper', input: 'click',
      announce: '独裁者按钮的功能与风险说明。点击继续。'
    },
    {
      id: 'guide', panel: 'guide', tone: 'paper', input: 'click',
      announce: '烦恼选择与未来道具匹配流程说明。点击去选择烦恼。'
    }
  ];

  /** @type {{onFinish: Function}|null} */
  let callbacks = null;
  let index = 0;
  let enteredAt = 0;
  let lastAdvanceAt = 0;
  let wheelTotal = 0;
  let lastWheelAt = 0;
  let wheelGestureUsed = false;
  let keyBound = false;
  let wheelBound = false;

  function node(name) {
    return document.querySelector('[data-bind="' + name + '"]');
  }

  function scene() {
    return document.querySelector('[data-scene="u02"]');
  }

  function currentStage() {
    return STAGES[index] || STAGES[0];
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function clock() {
    return window.performance && typeof window.performance.now === 'function'
      ? window.performance.now()
      : Date.now();
  }

  function setPanelInteractive(panel, active) {
    panel.classList.toggle('is-active', active);
    panel.setAttribute('aria-hidden', active ? 'false' : 'true');

    // aria-hidden 不会自动移出键盘焦点序列。inert 是主路径，tabindex 是旧浏览器后备。
    panel.inert = !active;
    panel.querySelectorAll('button, a, input, textarea, select').forEach(function (control) {
      if (active) control.removeAttribute('tabindex');
      else control.setAttribute('tabindex', '-1');
    });
  }

  function replayTextAnimation(textNode) {
    if (!textNode || reducedMotion()) return;
    textNode.classList.remove('is-fresh');
    void textNode.offsetWidth;
    textNode.classList.add('is-fresh');
  }

  function render() {
    const root = scene();
    const stage = currentStage();
    if (!root || !stage) return;

    root.dataset.dialogueStage = stage.id;
    root.dataset.dialogueTone = stage.tone;
    document.body.dataset.u02Tone = stage.tone;

    root.querySelectorAll('[data-u02-panel]').forEach(function (panel) {
      setPanelInteractive(panel, panel.dataset.u02Panel === stage.panel);
    });

    const welcomeText = node('dialogueWelcomeText');
    const welcomeBubble = node('dialogueBubble');
    if (stage.welcome && welcomeText) {
      welcomeText.textContent = stage.welcome;
      replayTextAnimation(welcomeText);
    }

    // 第一轮对白按 Word 用点击推进；第二轮同一气泡保留，但必须滚轮推进。
    if (welcomeBubble) {
      const clickable = stage.id === 'welcome-a';
      if (clickable) {
        welcomeBubble.dataset.action = 'next';
        welcomeBubble.removeAttribute('tabindex');
        welcomeBubble.removeAttribute('aria-disabled');
        welcomeBubble.setAttribute('aria-label', '哆啦A梦的对话，点击继续');
      } else {
        welcomeBubble.removeAttribute('data-action');
        welcomeBubble.setAttribute('tabindex', '-1');
        welcomeBubble.setAttribute('aria-disabled', 'true');
        welcomeBubble.setAttribute('aria-label', '哆啦A梦的对话，向下滚动继续');
      }
    }

    const scrollCue = node('dialogueScrollCue');
    const scrollText = node('dialogueScrollText');
    const needsWheel = stage.input === 'wheel';
    if (scrollCue) {
      scrollCue.setAttribute('aria-hidden', needsWheel ? 'false' : 'true');
      scrollCue.setAttribute('tabindex', needsWheel ? '0' : '-1');
    }
    if (scrollText && stage.scroll) scrollText.textContent = stage.scroll;

    const status = node('dialogueStatus');
    if (status) status.textContent = stage.announce || '';
  }

  function isLast() {
    return index >= STAGES.length - 1;
  }

  /**
   * 推进一个内部分镜。只有在最后一屏返回 false，让 app.js 进入 U03。
   * 被最小停留拦住时返回 true：这次输入已被 U02 消费，不能顺势翻到下一场景。
   */
  function advance(source) {
    const now = clock();
    if (index === 0 && now - enteredAt < Number(CONFIG.DIALOGUE_ENTRY_LOCK_MS)) return true;
    const wait = source === 'wheel'
      ? Number(CONFIG.DIALOGUE_WHEEL_LOCK_MS || CONFIG.DIALOGUE_LINE_MS)
      : Number(CONFIG.DIALOGUE_LINE_MS);
    if (now - lastAdvanceAt < wait) return true;
    if (isLast()) return false;

    index += 1;
    lastAdvanceAt = now;
    wheelTotal = 0;
    render();
    return true;
  }

  function finishFromKeyboard() {
    if (callbacks && typeof callbacks.onFinish === 'function') callbacks.onFinish();
  }

  function normalizedWheelDelta(event) {
    if (event.deltaMode === 1) return event.deltaY * 16;
    if (event.deltaMode === 2) return event.deltaY * Math.max(window.innerHeight, 1);
    return event.deltaY;
  }

  /** 一次触控板惯性序列最多推进一个分镜，停顿后下一次滚动才可再推进。 */
  function handleWheel(event) {
    if (document.body.dataset.currentScene !== 'u02') return;
    if (currentStage().input !== 'wheel') return;

    const delta = normalizedWheelDelta(event);
    if (delta <= 0) return;
    event.preventDefault();

    const now = clock();
    if (now - lastWheelAt > 240) {
      wheelTotal = 0;
      wheelGestureUsed = false;
    }
    lastWheelAt = now;
    if (wheelGestureUsed) return;
    if (now - lastAdvanceAt < Number(CONFIG.DIALOGUE_WHEEL_LOCK_MS)) return;

    wheelTotal += delta;
    if (wheelTotal < Number(CONFIG.DIALOGUE_WHEEL_THRESHOLD)) return;

    wheelGestureUsed = true;
    wheelTotal = 0;
    advance('wheel');
  }

  function bindWheel() {
    if (wheelBound) return;
    wheelBound = true;
    window.addEventListener('wheel', handleWheel, { passive: false });
  }

  /** 空格始终可作为后备推进；滚轮分镜另支持方向下键与 PageDown。 */
  function bindKeys() {
    if (keyBound) return;
    keyBound = true;
    document.addEventListener('keydown', function (event) {
      if (document.body.dataset.currentScene !== 'u02') return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

      const isSpace = event.key === ' ' || event.key === 'Spacebar';
      const isWheelKey = currentStage().input === 'wheel'
        && (event.key === 'ArrowDown' || event.key === 'PageDown');
      if (!isSpace && !isWheelKey) return;

      event.preventDefault();
      if (!advance('keyboard')) finishFromKeyboard();
    });
  }

  function mount(handlers) {
    callbacks = handlers || null;
    bindKeys();
    bindWheel();
  }

  /** 每次进入 U02 都从白洞出场重新开始，与原来对话模块的重入行为一致。 */
  function enter() {
    index = 0;
    enteredAt = clock();
    lastAdvanceAt = enteredAt;
    wheelTotal = 0;
    lastWheelAt = 0;
    wheelGestureUsed = false;
    render();
  }

  function exit() {
    delete document.body.dataset.u02Tone;
    wheelTotal = 0;
    lastWheelAt = 0;
    wheelGestureUsed = false;
  }

  /** data-action="next" 的统一入口；内部没讲完就消费，末屏才放行到 U03。 */
  function next() {
    return advance('click');
  }

  return {
    mount: mount,
    enter: enter,
    exit: exit,
    next: next,
    isLast: isLast,
    stageId: function () { return currentStage().id; },
    total: STAGES.length
  };
})();
