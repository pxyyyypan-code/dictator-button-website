/**
 * app.js —— 初始化、事件绑定、全局数据与 UX-01~UX-14 流程协调
 * 已实现阶段：M01~M06 的 MVP 核心闭环。
 */
'use strict';

const appData = {
  worries: [],
  bubbles: [],
  deleteCount: 0,
  clickCount: 0,
  buttonUnlocked: false,
  buttonTriggered: false,
  growthStarted: false,
  currentScene: SCENE_FLOW[0].id
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

  function resetData() {
    appData.worries.length = 0;
    appData.bubbles.length = 0;
    appData.deleteCount = 0;
    appData.clickCount = 0;
    appData.buttonUnlocked = false;
    appData.buttonTriggered = false;
    appData.growthStarted = false;
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

  /* ---------------- 泡泡游戏（UX-06~UX-08） ---------------- */

  function setText(name, value) {
    const node = bind(name);
    if (node) node.textContent = String(value);
  }

  function syncGameStats() {
    setText('deleteCount', appData.deleteCount);
    setText('deleteCountGrowth', appData.deleteCount);
    setText('clickCount', appData.clickCount);
    setText('bubbleCount', BubbleGame.getBubbleCount());
  }

  function unlockDictatorButton() {
    if (appData.buttonUnlocked) return;
    appData.buttonUnlocked = true;
    const button = bind('enterButton');
    if (button) {
      button.disabled = false;
      button.textContent = '前往独裁者按钮';
    }
    setText('growthStatus', '独裁者按钮已解锁');
  }

  function buildBubbleCallbacks() {
    return {
      onClick: function () {
        appData.clickCount += 1;
        syncGameStats();
      },
      onDelete: function (bubble, effect) {
        appData.deleteCount += 1;
        syncGameStats();

        if (appData.currentScene === 'ux-07') {
          setText('gameStatus', '删除成功');
          if (!appData.growthStarted && appData.deleteCount >= CONFIG.GROWTH_START_THRESHOLD) {
            appData.growthStarted = true;
            setText('gameStatus', '检测到异常增殖……');
            SceneManager.addTimer(function () {
              if (appData.currentScene === 'ux-07') SceneManager.goToId('ux-08');
            }, 650);
          }
        }

        if (appData.currentScene === 'ux-08') {
          if (effect && effect.split) {
            setText('growthStatus', '删除失败：它分裂成了 ' + effect.childrenCreated + ' 个');
          } else {
            setText('growthStatus', '烦恼仍在增加');
          }
          if (appData.deleteCount >= CONFIG.BUTTON_UNLOCK_THRESHOLD) unlockDictatorButton();
        }
      },
      onMiss: function () {
        if (appData.currentScene === 'ux-07') setText('gameStatus', '未命中，再试一次');
      },
      onBubbleCount: function () {
        syncGameStats();
      },
      onGrowthPace: function (status) {
        if (appData.currentScene !== 'ux-08' || appData.buttonUnlocked) return;
        if (status.intervalMs <= 520) {
          setText('growthStatus', '增殖速度已经失控');
        } else if (status.intervalMs <= 900) {
          setText('growthStatus', '增殖正在加速');
        } else {
          setText('growthStatus', '烦恼仍在增加');
        }
      }
    };
  }

  /* ---------------- 独裁者按钮与剧情（UX-09~UX-12） ---------------- */

  function syncDictatorButton() {
    const trigger = document.querySelector('[data-scene="ux-09"] [data-action="trigger-button"]');
    const nextButton = bind('buttonNext');
    if (trigger) trigger.disabled = appData.buttonTriggered || !appData.buttonUnlocked;
    if (nextButton) nextButton.classList.toggle('is-hidden', !appData.buttonTriggered);
  }

  function triggerDictatorButton() {
    const hint = bind('buttonHint');
    if (!appData.buttonUnlocked) {
      if (hint) hint.textContent = '按钮尚未解锁。';
      return;
    }
    if (appData.buttonTriggered) {
      if (hint) hint.textContent = '删除程序已经执行，无法重复启动。';
      return;
    }
    appData.buttonTriggered = true;
    if (hint) hint.textContent = '最终授权已确认。';
    syncDictatorButton();
    SceneManager.addTimer(function () { SceneManager.next(); }, 320);
  }

  function startThemeReadTimer() {
    const nextButton = bind('themeNext');
    const countdown = bind('themeCountdown');
    if (!nextButton || !countdown) return;
    nextButton.disabled = true;
    const start = Date.now();

    function tick() {
      const remaining = Math.max(0, CONFIG.THEME_MIN_READ_MS - (Date.now() - start));
      if (remaining <= 0) {
        nextButton.disabled = false;
        nextButton.textContent = '查看体验总结';
        countdown.textContent = '你可以继续了。';
        return;
      }
      countdown.textContent = '请在这里停留 ' + Math.ceil(remaining / 1000) + ' 秒。';
      SceneManager.addTimer(tick, 250);
    }
    tick();
  }

  /* ---------------- 总结与退出（UX-13 / UX-14） ---------------- */

  function renderSummary() {
    const list = bind('summaryList');
    if (!list) return;
    const worryText = appData.worries.length ? '“' + appData.worries.join('”“') + '”' : '那些尚未说出口的烦恼';
    const accuracy = appData.clickCount ? Math.round((appData.deleteCount / appData.clickCount) * 100) : 0;
    const rows = [
      '你尝试删除了：' + worryText,
      '有效删除：' + appData.deleteCount + ' 次',
      '总点击：' + appData.clickCount + ' 次，命中率约 ' + accuracy + '%',
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

  function restart() {
    closeExitModal();
    resetData();
    renderWorries();
    setHint('');
    const field = document.getElementById('worry-text');
    if (field) field.value = '';
    const hint = bind('buttonHint');
    if (hint) hint.textContent = '';
    const enterButton = bind('enterButton');
    if (enterButton) {
      enterButton.disabled = true;
      enterButton.textContent = '独裁者按钮尚未解锁';
    }
    syncGameStats();
    syncDictatorButton();
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
        appData.deleteCount = 0;
        appData.clickCount = 0;
        appData.buttonUnlocked = false;
        appData.buttonTriggered = false;
        appData.growthStarted = false;
        syncGameStats();
        setText('generationStatus', '正在建立对象坐标……');
        BubbleGame.init(appData.worries, canvas('create'), buildBubbleCallbacks());
        SceneManager.addTimer(function () { setText('generationStatus', '文字已转化为可交互对象'); }, 850);
        SceneManager.addTimer(function () {
          if (appData.currentScene === 'ux-06') SceneManager.goToId('ux-07');
        }, CONFIG.BUBBLE_CREATE_DURATION_MS);
      },
      onExit: BubbleGame.stop
    });

    SceneManager.registerHooks('ux-07', {
      onEnter: function () {
        BubbleGame.mount(canvas('delete'), { interactive: true, mode: 'calm' });
        BubbleGame.stopGrowth();
        BubbleGame.setMode('calm');
        setText('gameStatus', '删除测试进行中');
        syncGameStats();
      },
      onExit: BubbleGame.stop
    });

    SceneManager.registerHooks('ux-08', {
      onEnter: function () {
        BubbleGame.mount(canvas('growth'), { interactive: true, mode: 'growth' });
        BubbleGame.startGrowth();
        setText('growthStatus', appData.buttonUnlocked ? '独裁者按钮已解锁' : '增殖正在加速');
        if (appData.deleteCount >= CONFIG.BUTTON_UNLOCK_THRESHOLD) unlockDictatorButton();
        syncGameStats();
      },
      onExit: function () {
        BubbleGame.stopGrowth();
        BubbleGame.stop();
      }
    });

    SceneManager.registerHooks('ux-09', {
      onEnter: function () {
        BubbleGame.stopGrowth();
        if (appData.deleteCount >= CONFIG.BUTTON_UNLOCK_THRESHOLD) appData.buttonUnlocked = true;
        const hint = bind('buttonHint');
        if (hint) hint.textContent = appData.buttonTriggered ? '删除程序已经执行。' : '最终授权等待确认。';
        syncDictatorButton();
      }
    });

    SceneManager.registerHooks('ux-10', {
      onEnter: function () {
        BubbleGame.clearAll();
        setText('clearTitle', '删除程序正在运行');
        setText('clearStatus', '正在移除所有对象……');
        SceneManager.addTimer(function () {
          setText('clearTitle', '什么都没有了');
          setText('clearStatus', '……');
        }, Math.round(CONFIG.CLEAR_ANIMATION_MS * 0.48));
        SceneManager.addTimer(function () {
          if (appData.currentScene === 'ux-10') SceneManager.goToId('ux-11');
        }, CONFIG.CLEAR_ANIMATION_MS);
      }
    });

    SceneManager.registerHooks('ux-11', {
      onEnter: function () {
        BubbleGame.respawnSoftly(canvas('return'), appData.worries);
      },
      onExit: BubbleGame.stop
    });

    SceneManager.registerHooks('ux-12', { onEnter: startThemeReadTimer });
    SceneManager.registerHooks('ux-13', { onEnter: renderSummary });
    SceneManager.registerHooks('ux-14', { onEnter: BubbleGame.stop });
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

  function handleAction(action, target) {
    switch (action) {
      case 'next': handleNext(); break;
      case 'back': SceneManager.back(); break;
      case 'exit': openExitModal(); break;
      case 'exit-cancel': closeExitModal(); break;
      case 'exit-confirm':
      case 'restart': restart(); break;
      case 'add-worry': addWorry(); break;
      case 'remove-worry': removeWorry(Number(target.dataset.index)); break;
      case 'enter-button':
        if (appData.buttonUnlocked) SceneManager.next();
        else setText('growthStatus', '继续删除，按钮尚未解锁');
        break;
      case 'trigger-button': triggerDictatorButton(); break;
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
  }

  function renderStaticText() {
    setText('maxWorries', CONFIG.MAX_WORRIES_MVP);
    setText('growthThreshold', CONFIG.GROWTH_START_THRESHOLD);
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
    syncGameStats();
    SceneManager.reset();
  }

  return { init: init, data: appData, restart: restart };
})();

document.addEventListener('DOMContentLoaded', App.init);
