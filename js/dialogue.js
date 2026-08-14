/**
 * dialogue.js —— U2 哆啦A梦引导对话（五轮，逐句推进）
 *
 * 规格（UI 指令第 2 页）三条硬要求，实现时都不要绕开：
 *   1. 每次只出现 1～2 句，上一句降低透明度，不许一屏堆满长文；
 *   2. 点「继续」或按空格推进，末句后主按钮改成「去选择烦恼」；
 *   3. 独裁者按钮此时只是剧情提示，玩家不允许提前按下。
 *
 * 页面上没有大型对话框——规格明写「不使用大型聊天框」「不要大型对话框」，
 * 所以台词直接落在左侧的标题槽里，靠 prev/title/note 三个固定节点轮换。
 * 三个节点首屏静态存在、此后只改 textContent，不重建（App.bind 是永不失效的正向缓存）。
 */
'use strict';

const Dialogue = (function () {
  /**
   * 台词逐字取自 UI 指令第 2 页的「对话」段落，一句不删。
   * 规格是**五轮发言**（哆啦A梦 3 次 + 玩家 2 次），但同时要求「每次只出现 1～2 句」，
   * 所以五轮按句切成 8 屏——轮数和屏数本来就不是一回事，不要为了凑 5 屏去砍句子。
   * lead 是当前这句（大标题），note 是同一屏的第二句（下方补充说明）。
   *
   * 唯一的改写：原文「也可以在思考云朵中写下自己的烦恼」里的「思考云朵」
   * 在 U3 上并不存在（那页的自由输入是一条下划线输入框），
   * 照抄会让玩家在下一页找一个找不到的东西，所以改成与 U3 实际文案一致的说法。
   *
   * 改这里的任何一个字，都必须重跑 assets/dev/_build-fonts.py，否则新字掉回默认字形。
   */
  const ROUNDS = [
    {
      speaker: '哆啦A梦',
      lead: '嗨！欢迎来到「22世纪未来道具体验馆」。',
      note: '在这里你可以体验各种各样的道具，并用它们解决不同的问题！'
    },
    {
      speaker: '你',
      lead: '哆啦A梦，我最近好烦啊。',
      note: '有什么道具可以帮我消除烦恼的吗？'
    },
    {
      speaker: '哆啦A梦',
      lead: '喏，这是独裁者按钮。',
      note: '只要说出想让谁消失并按下它，对方就会从世界以及所有人的记忆中暂时消失。'
    },
    {
      speaker: '哆啦A梦',
      lead: '不过，消失不一定等于真正解决。',
      note: '请谨慎使用，它可能会影响你接下来的每一步。'
    },
    {
      speaker: '你',
      lead: '这个道具还挺有意思的，',
      note: '那体验流程是什么呢？'
    },
    {
      speaker: '哆啦A梦',
      lead: '接下来，你需要先从不同类别中选择一个此刻最困扰你的烦恼；',
      note: '如果没有合适的选项，也可以自己写下烦恼。'
    },
    {
      speaker: '哆啦A梦',
      lead: '我会根据你选择的内容，从四次元口袋里匹配相应的未来道具。',
      note: '然后，你将会进入烦恼消除环节，这是最解压也是最刺激的一个体验环节啦！'
    },
    {
      speaker: '哆啦A梦',
      lead: '通过使用道具，你可以进行消除烦恼等其他操作。',
      note: '准备好后，就去选出你现在最想摆脱的烦恼吧！'
    }
  ];

  /** @type {{onFinish: Function}|null} 末句后再点「继续」时回调，由 app.js 决定翻页。 */
  let callbacks = null;
  /** @type {number} 当前轮次下标 */
  let index = 0;
  /** @type {number} 上一次推进的时间戳，用于 DIALOGUE_LINE_MS 防连点 */
  let lastAdvanceAt = 0;
  /** @type {boolean} 空格键监听只挂一次 */
  let keyBound = false;

  function node(name) {
    return document.querySelector('[data-bind="' + name + '"]');
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function pad(value) {
    return (value < 10 ? '0' : '') + value;
  }

  /** 把第 i 轮画到三个固定文本槽里。i-1 轮留在 prev 槽，靠 CSS 降透明度。 */
  function render() {
    const round = ROUNDS[index];
    if (!round) return;

    const tag = node('dialogueTag');
    const prev = node('dialoguePrev');
    const lead = node('dialogueText');
    const note = node('dialogueNote');
    const page = node('dialoguePage');
    const next = node('dialogueNext');
    const cue = node('dialogueCue');

    if (tag) tag.textContent = 'STEP 02 · ' + round.speaker;
    if (prev) {
      const before = ROUNDS[index - 1];
      prev.textContent = before ? before.lead : '';
      prev.classList.toggle('is-visible', Boolean(before));
    }
    if (lead) lead.textContent = round.lead;
    if (note) note.textContent = round.note;
    if (page) page.textContent = pad(index + 1) + ' / ' + pad(ROUNDS.length);

    // 末句才把主按钮换成出口文案；在此之前它只是翻句。
    if (next) next.textContent = isLast() ? '去选择烦恼' : '继续';

    // 独裁者按钮的剧情提示：从「喏，这是独裁者按钮」那一轮起浮出，之后不再收回。
    if (cue) {
      cue.classList.toggle('is-visible', index + 1 >= CONFIG.DIALOGUE_CUE_ROUND);
    }

    // 换句时给标题一次极短的淡入，reduced-motion 下直接省略。
    if (lead && !reducedMotion()) {
      lead.classList.remove('is-fresh');
      // 强制回流，否则同一帧内移除再添加，动画不会重放。
      void lead.offsetWidth;
      lead.classList.add('is-fresh');
    }
  }

  function isLast() {
    return index >= ROUNDS.length - 1;
  }

  /**
   * 推进一句。已经是末句时返回 false，由 app.js 接着翻页。
   * DIALOGUE_LINE_MS 是最小停留：防止连点或长按空格一口气刷掉全部台词。
   */
  function advance() {
    const now = performance.now();
    if (now - lastAdvanceAt < CONFIG.DIALOGUE_LINE_MS) return true;
    if (isLast()) return false;
    lastAdvanceAt = now;
    index += 1;
    render();
    return true;
  }

  /** 场景进入：从第一轮重新讲起。 */
  function enter() {
    index = 0;
    lastAdvanceAt = performance.now();
    render();
  }

  /**
   * 空格键推进。只在 u02 生效，且输入框聚焦时让位给正常输入。
   * 监听挂在 document 上一次，不随场景反复增删——避免退出重进后堆叠多份。
   */
  function bindKeys() {
    if (keyBound) return;
    keyBound = true;
    document.addEventListener('keydown', function (event) {
      if (event.key !== ' ' && event.key !== 'Spacebar') return;
      if (document.body.dataset.currentScene !== 'u02') return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      // 空格默认会滚动页面，也会"按下"当前聚焦的按钮——两者都要拦掉，
      // 否则一次空格会翻两句。
      event.preventDefault();
      if (!advance() && callbacks && typeof callbacks.onFinish === 'function') {
        callbacks.onFinish();
      }
    });
  }

  function mount(handlers) {
    callbacks = handlers || null;
    bindKeys();
  }

  /** 「继续」按钮：还有下一句就翻句，末句则交给 app.js 翻页。 */
  function next() {
    return advance();
  }

  return {
    mount: mount,
    enter: enter,
    next: next,
    isLast: isLast,
    total: ROUNDS.length
  };
})();
