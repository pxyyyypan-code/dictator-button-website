/**
 * worry-picker.js —— U3 烦恼选择（粒子悬浮场 → 展开列表 → 确认 → 飞进四次元口袋）
 *
 * 规格（UI 指令第 3 页）逐条对应到下面的实现：
 *   1. 九个素材在画面里**微幅漂移**            → startDrift()，rAF 写 --dx/--dy
 *   2. 悬停 → 位移到中央 + 放大 + 白雾模糊     → setFocus() 加 is-active/is-preview
 *   3. 素材上方浮出 3 条代表烦恼               → renderSubs() 的 preview 分支
 *   4. 点击类别 → 展开完整列表（最多 15 条）    → renderSubs() 的 open 分支
 *   5. 点某条 → 高亮 + 出「确认这个烦恼」       → pickWorry() + syncConfirm()
 *   6. 自由输入 → 推测类别 + 确认/重新选择      → classifyFree()
 *   7. 置信度不足 → 请玩家手选，**不得随机发道具** → classifyFree() 的 low / null 分支
 *   8. 确认后缩成米白标签，沿 #049DBF 弧线飞入口袋 → flyToPocket()
 *
 * 两个容易踩的坑，改之前先读：
 *
 * A. 粒子**只建一次**。之后所有状态变化都只切 class，绝不 innerHTML 重建——
 *    重建出来的是新节点，CSS 过渡没有起始值，"飞到中央"会变成瞬移。
 *
 * B. 漂移写的是 CSS 的 `translate` 属性，不是 `transform`。
 *    居中放大用的是 transform，两者必须分开：如果漂移每帧改 transform，
 *    transition: transform 会被无限重启，等于没有过渡。
 */
'use strict';

const WorryPicker = (function () {
  /** @type {{getSelected:Function,onSelect:Function,onClear:Function,onConfirmed:Function}|null} */
  let callbacks = null;
  /** @type {boolean} 九个粒子是否已经建好（只建一次） */
  let built = false;
  /** @type {string} 当前居中放大的大类 id；'' 表示没有 */
  let focusId = '';
  /** @type {string} 已点开完整列表的大类 id；'' 表示只是悬停预览 */
  let openId = '';
  /** @type {number} 指针离开后的收起延时句柄 */
  let leaveTimer = 0;
  /** @type {number} 漂移循环的 rAF 句柄 */
  let driftRaf = 0;
  /** @type {boolean} 飞入口袋动画进行中，此时禁止重复确认 */
  let flying = false;
  /** @type {number} 飞行动画的兜底定时器 */
  let flyTimer = 0;
  /** @type {HTMLElement[]} 九个粒子节点的引用，避免每帧 querySelectorAll */
  let particles = [];

  function node(name) {
    return document.querySelector('[data-bind="' + name + '"]');
  }

  function scene() {
    return document.querySelector('[data-scene="u03"]');
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function setHint(message) {
    const hint = node('worryPickHint');
    if (hint) hint.textContent = message || '';
  }

  function selected() {
    return (callbacks && typeof callbacks.getSelected === 'function')
      ? callbacks.getSelected()
      : null;
  }

  function categoryName(id) {
    const cat = WorryData.category(id);
    return cat ? (cat.fullName || cat.label) : '';
  }

  /* ---------------- 粒子场 ---------------- */

  /** 九个大类只建一次。位置来自 CSS 的 nth-child 槽位，这里不管坐标。 */
  function buildParticles() {
    const container = node('worryCategories');
    if (!container || built) return;
    container.innerHTML = '';
    WorryData.categories.forEach(function (category) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'worry-particle';
      button.textContent = category.label;
      button.title = category.fullName || category.label;
      button.dataset.action = 'pick-category';
      button.dataset.category = category.id;
      container.appendChild(button);
    });
    particles = Array.prototype.slice.call(container.children);
    built = true;
  }

  /**
   * 微幅漂移。用两条不同周期的正弦错开，九个粒子各带相位，看起来才不像整排一起晃。
   * reduced-motion 下整个循环不启动（CLAUDE.md 硬要求）。
   */
  function startDrift() {
    if (driftRaf || reducedMotion() || !particles.length) return;
    const amp = CONFIG.WORRY_DRIFT_PX;
    const period = CONFIG.WORRY_DRIFT_MS;
    driftRaf = window.requestAnimationFrame(function step(now) {
      const t = (now / period) * Math.PI * 2;
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        // 居中放大的那个不参与漂移：它的位置正由 CSS 过渡接管，
        // 每帧再叠一层位移会让停位一直抖。
        if (p.classList.contains('is-active')) {
          p.style.setProperty('--dx', '0px');
          p.style.setProperty('--dy', '0px');
          continue;
        }
        const phase = i * 0.7;
        p.style.setProperty('--dx', (Math.sin(t + phase) * amp).toFixed(2) + 'px');
        p.style.setProperty('--dy', (Math.cos(t * 0.83 + phase * 1.3) * amp).toFixed(2) + 'px');
      }
      driftRaf = window.requestAnimationFrame(step);
    });
  }

  function stopDrift() {
    if (!driftRaf) return;
    window.cancelAnimationFrame(driftRaf);
    driftRaf = 0;
  }

  /* ---------------- 状态同步（只切 class，不重建） ---------------- */

  function sync() {
    const sel = selected();
    particles.forEach(function (p) {
      const isFocus = p.dataset.category === focusId;
      p.classList.toggle('is-active', isFocus);
      // is-preview 只在"悬停预览"时加：加了才有白雾模糊。
      // 已经点开的类别、以及自由输入刚推测出来的那个，都是玩家的当前选择，
      // 必须看得清——尤其后者：面板正指着它说「更接近这一类」，蒙上白雾就白说了。
      p.classList.toggle('is-preview', isFocus && !openId && !sel);
    });
    const root = scene();
    if (root) {
      root.classList.toggle('is-focused', Boolean(focusId));
      root.classList.toggle('is-expanded', Boolean(openId));
      // 「确认这个烦恼」是**选中之后才出现**的（规格原话），不是一直摆在那里灰着。
      root.classList.toggle('is-picked', Boolean(sel));
    }
    renderSubs();
    const confirm = node('confirmWorry');
    if (confirm) confirm.disabled = !sel || flying;
  }

  /**
   * 上方的细分条目。悬停预览给 3 条（WORRY_SUB_COUNT），
   * 点开后给完整列表（最多 WORRY_LIST_MAX 条，超过 4 条自动改紧凑分栏）。
   * 这个容器由 innerHTML 重建，里面**不许**出现 data-bind 节点。
   */
  function renderSubs() {
    const box = node('worrySubs');
    if (!box) return;
    box.innerHTML = '';
    box.classList.remove('worry-subs--full');
    if (!focusId) return;

    const sel = selected();
    let list;
    if (openId) {
      list = (WorryData.byCategory(openId) || []).slice(0, CONFIG.WORRY_LIST_MAX);
    } else {
      const preview = WorryData.hoverPreview(focusId) || [];
      list = (preview.length ? preview : WorryData.byCategory(focusId) || [])
        .slice(0, CONFIG.WORRY_SUB_COUNT);
    }
    if (list.length > CONFIG.WORRY_LIST_COLUMN_AFTER) box.classList.add('worry-subs--full');

    list.forEach(function (preset) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'worry-sub';
      button.textContent = preset.text;
      button.dataset.action = 'pick-worry';
      button.dataset.presetId = String(preset.id);
      button.classList.toggle('is-active', Boolean(sel && sel.presetId === preset.id));
      box.appendChild(button);
    });
  }

  /* ---------------- 悬停预览 ---------------- */

  /**
   * 悬停切焦点。有一个反直觉的地方：粒子一旦飞到中央，指针就"离开"了它，
   * 于是 pointerout 立刻触发 → 收起 → 飞回原位 → 指针又碰到它……来回抖。
   * 所以这里的规则是：**预览不由自己的 pointerout 收起**，
   * 只有指针碰到别的粒子、或整块离开 u03 时才换/收。
   */
  function setFocus(id) {
    if (openId) return;               // 已经点开列表，悬停不再抢焦点
    if (focusId === id) return;
    focusId = id;
    sync();
  }

  function bindHover() {
    const container = node('worryCategories');
    const root = scene();
    if (!container || !root) return;

    // pointerover / pointerout 会冒泡（pointerenter / leave 不会），
    // 容器上的 pointer-events:none 只影响命中测试，不影响冒泡，所以委托是安全的。
    container.addEventListener('pointerover', function (event) {
      const particle = event.target.closest && event.target.closest('.worry-particle');
      if (!particle) return;
      window.clearTimeout(leaveTimer);
      setFocus(particle.dataset.category);
    });

    // 指针移出整页才收预览。留一点缓冲，免得擦边划过就闪一下。
    root.addEventListener('pointerleave', function () {
      if (openId) return;
      window.clearTimeout(leaveTimer);
      leaveTimer = window.setTimeout(function () {
        if (openId) return;
        focusId = '';
        sync();
      }, CONFIG.WORRY_LEAVE_MS);
    });
  }

  /* ---------------- 选择 ---------------- */

  function pickCategory(categoryId) {
    if (!categoryId || flying) return;
    const sel = selected();
    // 换大类等于放弃上一次选择，避免「选了A类的条目却显示B类」。
    const dropSelection = Boolean(sel && sel.category !== categoryId);
    window.clearTimeout(leaveTimer);
    focusId = categoryId;
    openId = categoryId;
    hidePanel();
    if (dropSelection && callbacks && typeof callbacks.onClear === 'function') callbacks.onClear();
    sync();
    const name = categoryName(categoryId);
    setHint(name ? '「' + name + '」——挑一条最贴近此刻的。' : '');
  }

  function pickWorry(presetId) {
    if (flying) return;
    const preset = WorryData.preset(Number(presetId));
    if (!preset) return;
    focusId = preset.category;
    openId = preset.category;
    hidePanel();
    const field = document.getElementById('worry-text');
    if (field) field.value = '';
    if (callbacks && typeof callbacks.onSelect === 'function') {
      callbacks.onSelect(WorryData.createProfile(preset.text, {
        presetId: preset.id,
        category: preset.category,
        behaviorType: preset.behaviorType
      }));
    }
    sync();
    setHint('已选择：「' + preset.text + '」。');
  }

  /**
   * 自由输入：本地词表打分，认不出就请玩家手选。
   * 三个分支的区别只在"要不要让玩家直接确认"——
   * 任何情况下都不许替玩家随便挑一类然后发道具（规格红线）。
   */
  function classifyFree() {
    if (flying) return;
    const field = document.getElementById('worry-text');
    if (!field) return;
    const text = field.value.trim();
    if (!text) {
      setHint('先写下一条烦恼，再看看它属于哪一类。');
      field.focus();
      return;
    }

    const guess = WorryData.classifyFreeText(text);

    // 认不出：不猜、不选、不发道具，只把球踢回给玩家。
    if (!guess) {
      focusId = '';
      openId = '';
      if (callbacks && typeof callbacks.onClear === 'function') callbacks.onClear();
      sync();
      showPanel({
        guess: '这条烦恼我还认不出来。',
        note: '请从画面里的九个大类里挑一个最接近的。',
        canConfirm: false
      });
      setHint('');
      return;
    }

    const name = categoryName(guess.category);
    focusId = guess.category;
    openId = '';                       // 自由输入不需要展开列表，居中那个只是"我们猜的是它"
    if (callbacks && typeof callbacks.onSelect === 'function') {
      callbacks.onSelect(WorryData.createProfile(text, { category: guess.category }));
    }
    sync();

    // 置信度不足：仍然给出推测，但明说不确定，并鼓励手选。
    const unsure = guess.confidence === 'low';
    showPanel({
      guess: '我们认为它更接近：【' + name + '】',
      note: unsure
        ? '不过这次不太确定。如果不对，直接点画面里的大类自己选一个。'
        : '',
      canConfirm: true
    });
    // 提示行在推测面板出场时会被 .is-classified 一起收走（面板正好盖住它的位置），
    // 而且面板自己带 aria-live——两处同时播报会互相打断，所以这里必须清空。
    setHint('');
  }

  function showPanel(options) {
    const panel = node('classifyPanel');
    const guess = node('classifyGuess');
    const note = node('classifyNote');
    const confirm = node('classifyConfirm');
    if (guess) guess.textContent = options.guess || '';
    if (note) note.textContent = options.note || '';
    if (confirm) confirm.hidden = !options.canConfirm;
    if (!panel) return;
    panel.classList.add('is-visible');
    panel.setAttribute('aria-hidden', 'false');
    const root = scene();
    // 面板占的正是自由输入那条下划线的位置，两者不能同时在场。
    if (root) root.classList.add('is-classified');
  }

  function hidePanel() {
    const panel = node('classifyPanel');
    const root = scene();
    if (root) root.classList.remove('is-classified');
    if (!panel) return;
    panel.classList.remove('is-visible');
    panel.setAttribute('aria-hidden', 'true');
  }

  /* ---------------- 确认 → 飞进四次元口袋 ---------------- */

  /**
   * 米白标签沿一条 #049DBF 弧线飞向右下角哆啦A梦的口袋。
   * 轨迹用 offset-path 的二次贝塞尔，控制点抬到两端之上，所以是"抛"过去而不是直线滑过去。
   * 同一条 path 再画一遍当拖尾，描边色就是规格里点名的 #049DBF。
   */
  function flyToPocket(text, done) {
    const root = scene();
    if (!root || reducedMotion()) { done(); return; }

    const rect = root.getBoundingClientRect();
    const source = root.querySelector('.worry-particle.is-active') || node('confirmWorry');
    if (!source) { done(); return; }
    const from = source.getBoundingClientRect();
    const x0 = from.left + from.width / 2 - rect.left;
    const y0 = from.top + from.height / 2 - rect.top;

    // 口袋的位置跟着 .scene--pick::after 那张探头图走：
    // 素材宽 min(16vw,230px)、比例 273/298、贴右下角，口袋大约在它的横向中线偏左、纵向 58% 处。
    const peekW = Math.min(rect.width * 0.16, 230);
    const peekH = peekW * (298 / 273);
    const x1 = rect.width - peekW * 0.46;
    const y1 = rect.height - peekH * 0.42;
    const cx = (x0 + x1) / 2;
    const cy = Math.min(y0, y1) - rect.height * 0.18;
    const d = 'M ' + x0.toFixed(1) + ' ' + y0.toFixed(1) +
              ' Q ' + cx.toFixed(1) + ' ' + cy.toFixed(1) +
              ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1);

    const trail = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    trail.setAttribute('class', 'worry-fly-trail');
    trail.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
    trail.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    trail.appendChild(path);

    const label = document.createElement('span');
    label.className = 'worry-fly';
    label.textContent = text;
    label.setAttribute('aria-hidden', 'true');
    label.style.offsetPath = 'path("' + d + '")';
    label.style.offsetRotate = '0deg';

    root.appendChild(trail);
    root.appendChild(label);

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      window.clearTimeout(flyTimer);
      flyTimer = 0;
      label.remove();
      trail.remove();
      done();
    }

    const ms = CONFIG.WORRY_FLY_MS;
    label.animate([
      { offsetDistance: '0%', opacity: 0, scale: '0.5' },
      { offsetDistance: '10%', opacity: 1, scale: '1', offset: 0.16 },
      { offsetDistance: '100%', opacity: 0, scale: '0.22' }
    ], { duration: ms, easing: 'cubic-bezier(.34,.02,.2,1)', fill: 'forwards' });
    trail.animate([
      { opacity: 0 },
      { opacity: 1, offset: 0.25 },
      { opacity: 0 }
    ], { duration: ms, easing: 'linear', fill: 'forwards' });

    // 不依赖 animation.finished：标签一旦被 exit() 摘掉，那个 Promise 永远不 resolve，
    // 流程就卡在 u03 了。用定时器做唯一的推进信号。
    flyTimer = window.setTimeout(finish, ms);
  }

  function confirm() {
    if (flying) return;
    const sel = selected();
    if (!sel) {
      setHint('请先选一条烦恼，或者自己写一条。');
      return;
    }
    flying = true;
    hidePanel();
    sync();
    setHint('已经放进四次元口袋了。');
    flyToPocket(sel.text, function () {
      flying = false;
      if (callbacks && typeof callbacks.onConfirmed === 'function') callbacks.onConfirmed();
    });
  }

  /* ---------------- 生命周期 ---------------- */

  function reset() {
    focusId = '';
    openId = '';
    flying = false;
    window.clearTimeout(leaveTimer);
    hidePanel();
    const field = document.getElementById('worry-text');
    if (field) field.value = '';
    if (built) sync();
    setHint('');
  }

  function enter() {
    buildParticles();
    // 从 u05 退回来时选择还在，画面要能接着上次的状态显示。
    const sel = selected();
    if (sel && sel.category) {
      focusId = sel.category;
      openId = sel.presetId ? sel.category : '';
    }
    flying = false;
    sync();
    startDrift();
    setHint(sel
      ? '已选择：「' + sel.text + '」。也可以换一条。'
      : '把指针移到任意一个上面，看看里面有什么。');
  }

  function exit() {
    stopDrift();
    window.clearTimeout(leaveTimer);
    window.clearTimeout(flyTimer);
    flyTimer = 0;
    flying = false;
    const root = scene();
    if (!root) return;
    root.querySelectorAll('.worry-fly, .worry-fly-trail').forEach(function (el) { el.remove(); });
  }

  function mount(handlers) {
    callbacks = handlers || null;
    buildParticles();
    bindHover();
    sync();
  }

  return {
    mount: mount,
    enter: enter,
    exit: exit,
    reset: reset,
    pickCategory: pickCategory,
    pickWorry: pickWorry,
    classifyFree: classifyFree,
    confirm: confirm
  };
})();
