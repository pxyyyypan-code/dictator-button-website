/**
 * app.js —— 初始化、事件绑定、全局数据、流程协调（文档 §7.1）
 * 本轮范围：全局可点击薄框架。不含泡泡游戏逻辑。
 */
'use strict';

/** 全局数据（文档 §5.2）。烦恼仅存于内存，刷新即清空（文档 §1.2 数据原则）。 */
const appData = {
  worries: [],
  bubbles: [],
  deleteCount: 0,
  clickCount: 0,
  buttonUnlocked: false,
  buttonTriggered: false,
  currentScene: SCENE_FLOW[0].id
};

const App = (function () {
  /** 缓存 data-bind 节点，避免重复查询。 */
  const el = {};

  function bind(name) {
    if (!el[name]) {
      el[name] = document.querySelector('[data-bind="' + name + '"]');
    }
    return el[name];
  }

  /** 恢复到初始数据状态（FR-06-03 / 文档 §5.3 重置）。 */
  function resetData() {
    appData.worries.length = 0;
    appData.bubbles.length = 0;
    appData.deleteCount = 0;
    appData.clickCount = 0;
    appData.buttonUnlocked = false;
    appData.buttonTriggered = false;
    BubbleGame.destroy();
  }

  /* ---------------- UX-04 烦恼输入（FR-02-01 / FR-02-03） ---------------- */

  function setHint(message) {
    const node = bind('worryHint');
    if (node) {
      node.textContent = message || '';
    }
  }

  function addWorry() {
    const field = document.getElementById('worry-text');
    if (!field) {
      return;
    }
    const text = field.value.trim();

    // 空白字符串与仅空格内容无效（文档 §5.3 输入）
    if (text === '') {
      setHint('请先补充一条烦恼内容。');
      field.focus();
      return;
    }
    if (appData.worries.length >= CONFIG.MAX_WORRIES_MVP) {
      setHint('首版最多输入 ' + CONFIG.MAX_WORRIES_MVP + ' 条烦恼。');
      return;
    }

    appData.worries.push(text);
    field.value = '';
    setHint('已添加，共 ' + appData.worries.length + ' 条。');
    renderWorries();
    field.focus();
  }

  function removeWorry(index) {
    appData.worries.splice(index, 1);
    setHint('已删除该条，共 ' + appData.worries.length + ' 条。');
    renderWorries();
  }

  /** 渲染烦恼列表；三个场景共用同一数组（UX-04 / UX-05 / UX-11）。 */
  function renderWorries() {
    const editable = bind('worryList');
    if (editable) {
      editable.innerHTML = '';
      if (appData.worries.length === 0) {
        const li = document.createElement('li');
        li.className = 'worry-list__empty';
        li.textContent = '尚未添加烦恼';
        editable.appendChild(li);
      } else {
        appData.worries.forEach(function (text, index) {
          const li = document.createElement('li');
          const span = document.createElement('span');
          span.textContent = (index + 1) + '. ' + text;
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'worry-list__remove';
          remove.textContent = '删除';
          remove.setAttribute('data-action', 'remove-worry');
          remove.setAttribute('data-index', String(index));
          li.appendChild(span);
          li.appendChild(remove);
          editable.appendChild(li);
        });
      }
    }

    ['worryListConfirm', 'worryListReturn'].forEach(function (key) {
      const list = bind(key);
      if (!list) {
        return;
      }
      list.innerHTML = '';
      if (appData.worries.length === 0) {
        const li = document.createElement('li');
        li.className = 'worry-list__empty';
        li.textContent = '尚未添加烦恼';
        list.appendChild(li);
        return;
      }
      appData.worries.forEach(function (text, index) {
        const li = document.createElement('li');
        li.textContent = (index + 1) + '. ' + text;
        list.appendChild(li);
      });
    });
  }

  /* ---------------- UX-13 总结（FR-06-02 / AC-07） ---------------- */

  function renderSummary() {
    const list = bind('summaryList');
    if (!list) {
      return;
    }
    const rows = [
      '输入烦恼数量：' + appData.worries.length + ' 条',
      '删除次数：' + appData.deleteCount + ' 次（占位：泡泡游戏未实现）',
      '点击次数：' + appData.clickCount + ' 次（占位：泡泡游戏未实现）',
      '简短总结：烦恼不会真正消失，但你可以学会面对它。'
    ];
    list.innerHTML = '';
    rows.forEach(function (text) {
      const li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    });
  }

  /* ---------------- UX-09 按钮（FR-05-01 重复点击忽略） ---------------- */

  /** 按钮锁定后显示「下一步」，保证返回 UX-09 仍有前进出口。 */
  function syncDictatorButton() {
    const trigger = document.querySelector('[data-scene="ux-09"] [data-action="trigger-button"]');
    const nextBtn = bind('buttonNext');
    if (trigger) {
      trigger.disabled = appData.buttonTriggered;
    }
    if (nextBtn) {
      nextBtn.classList.toggle('is-hidden', !appData.buttonTriggered);
    }
  }

  function triggerDictatorButton() {
    const hint = bind('buttonHint');
    if (appData.buttonTriggered) {
      // 重复点击被忽略，不报错、不重复推进
      if (hint) {
        hint.textContent = '按钮已锁定，重复点击已忽略。';
      }
      return;
    }
    appData.buttonTriggered = true;
    if (hint) {
      hint.textContent = '按钮已触发并锁定。';
    }
    syncDictatorButton();
    SceneManager.next();
  }

  /* ---------------- 退出确认（FR-01-03） ---------------- */

  function openExitModal() {
    const modal = bind('exitModal');
    if (modal) {
      modal.classList.add('modal--open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeExitModal() {
    const modal = bind('exitModal');
    if (modal) {
      modal.classList.remove('modal--open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  /** 退出与重新开始共用：清数据 + 回首页（UX-14 / FR-06-03）。 */
  function restart() {
    closeExitModal();
    resetData();
    renderWorries();
    setHint('');
    const hint = bind('buttonHint');
    if (hint) {
      hint.textContent = '';
    }
    const field = document.getElementById('worry-text');
    if (field) {
      field.value = '';
    }
    syncDictatorButton();
    SceneManager.reset();
  }

  /* ---------------- 场景钩子（进入/退出时的最小逻辑） ---------------- */

  function registerSceneHooks() {
    // UX-04：进入时刷新列表并聚焦输入框
    SceneManager.registerHooks('ux-04', {
      onEnter: function () {
        renderWorries();
        const field = document.getElementById('worry-text');
        if (field) {
          field.focus();
        }
      }
    });

    // UX-05：确认页需要已有至少 1 条；否则退回 UX-04（AC-02）
    SceneManager.registerHooks('ux-05', {
      onEnter: function () {
        if (appData.worries.length === 0) {
          setHint('请至少输入 1 条烦恼后再继续。');
          SceneManager.goToId('ux-04');
          return;
        }
        renderWorries();
      }
    });

    // UX-06：占位——真实实现将在此调用 BubbleGame.init()
    SceneManager.registerHooks('ux-06', {
      onEnter: function () {
        BubbleGame.init(appData.worries);
      }
    });

    // UX-09：进入时按 CONFIG 阈值判断解锁（本轮框架内直接解锁）
    SceneManager.registerHooks('ux-09', {
      onEnter: function () {
        appData.buttonUnlocked = true;
        const hint = bind('buttonHint');
        if (hint) {
          hint.textContent = appData.buttonTriggered
            ? '按钮已锁定，请点击下一步继续。'
            : '按钮已解锁。';
        }
        syncDictatorButton();
      }
    });

    // UX-11：柔和重现的文本占位
    SceneManager.registerHooks('ux-11', { onEnter: renderWorries });

    // UX-13：进入时生成总结
    SceneManager.registerHooks('ux-13', { onEnter: renderSummary });
  }

  /* ---------------- 事件绑定：单一委托，避免残留监听 ---------------- */

  function handleAction(action, target) {
    switch (action) {
      case 'next':
        SceneManager.next();
        break;
      case 'back':
        SceneManager.back();
        break;
      case 'exit':
        openExitModal();
        break;
      case 'exit-cancel':
        closeExitModal();
        break;
      case 'exit-confirm':
      case 'restart':
        restart();
        break;
      case 'add-worry':
        addWorry();
        break;
      case 'remove-worry':
        removeWorry(Number(target.getAttribute('data-index')));
        break;
      case 'trigger-button':
        triggerDictatorButton();
        break;
      default:
        break;
    }
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-action]');
      if (!target) {
        return; // 点击空白不报错（UX-07 异常处理）
      }
      handleAction(target.getAttribute('data-action'), target);
    });

    // 回车快捷添加烦恼
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target.id === 'worry-text') {
        event.preventDefault();
        addWorry();
      }
    });
  }

  /* ---------------- 初始化 ---------------- */

  function renderStaticText() {
    const maxNode = bind('maxWorries');
    if (maxNode) {
      maxNode.textContent = String(CONFIG.MAX_WORRIES_MVP);
    }
    const themeNode = bind('themeReadSec');
    if (themeNode) {
      themeNode.textContent = String(CONFIG.THEME_MIN_READ_MS / 1000);
    }
  }

  function updateProgress(scene, index) {
    appData.currentScene = scene.id;
    const node = bind('progress');
    if (node) {
      // 只显示编号与进度：APP_STATE 含 WORLD_CLEAR / WORRIES_RETURN 等字样，
      // 提前显示会泄露剧情反转，故不呈现给用户。
      node.textContent = scene.id.toUpperCase()
        + ' · ' + (index + 1) + ' / ' + SceneManager.total;
    }
    // 供进度光点定位（0~1），细线轨道上的位置
    document.documentElement.style.setProperty(
      '--progress-x', String(index / (SceneManager.total - 1)));
  }

  function init() {
    renderStaticText();
    registerSceneHooks();
    SceneManager.onChange(updateProgress);
    bindEvents();
    renderWorries();
    SceneManager.reset();
  }

  return {
    init: init,
    // 暴露给测试与调试
    data: appData,
    restart: restart
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
