/**
 * worry-picker.js —— U3 烦恼选择（粒子悬浮场 → 展开列表 → 确认 → 飞进四次元口袋）
 *
 * 规格（UI 指令第 3 页）逐条对应到下面的实现：
 *   1. 九个素材在画面里**微幅漂移**            → startDrift()，rAF 写 --dx/--dy
 *   2. 悬停 → 位移到中央 + 放大 + 白雾模糊     → setFocus() 加 is-active/is-preview
 *   3. 素材上方浮出 3 条代表烦恼               → renderSubs() 的 preview 分支
 *   4. 点击类别 → 展开完整列表（最多 15 条）    → renderSubs() 的 open 分支
 *   5. 点某条 → 高亮 + 出「确认这些烦恼」       → pickWorry() + sync()
 *   6. 自由输入 → 推测类别 + 确认/返回继续选    → classifyFree()
 *   7. 置信度不足 → 请玩家手选，**不得随机发道具** → classifyFree() 的 low / null 分支
 *   8. 确认后缩成米白标签，沿 #049DBF 弧线飞入口袋 → flyPicks()
 *
 * 选择是**多选，1~3 条**（CONFIG.WORRY_MAX_PICK），不是单选：
 *   · 同一条再点一次 = 取消，不需要另设一颗删除键；
 *   · 换大类**不清空**已选——多选的全部意义就在于跨大类挑；
 *   · 展开列表里有一条「← 返回全部类别」，它是从展开态回到粒子场的唯一出口
 *     （setFocus 与 pointerleave 在 openId 非空时都提前返回，靠悬停回不去）。
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
  /** @type {{getSelected:Function,onToggle:Function,onClear:Function,onConfirmed:Function}|null} */
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
  /** @type {number[]} 飞行动画的兜底定时器（每条烦恼一个，外加错峰出发的那批） */
  let flyTimers = [];
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

  /** 当前已选的烦恼，永远是数组（可能为空），调用方不必再判 null。 */
  function picks() {
    const list = (callbacks && typeof callbacks.getSelected === 'function')
      ? callbacks.getSelected()
      : null;
    return Array.isArray(list) ? list : [];
  }

  /**
   * 加/减一条。返回 'added' / 'removed' / 'full'，
   * 三种结果对应三句不同的提示，所以状态判断只做一次、由 app.js 那边裁决。
   */
  function toggle(profile) {
    if (!profile || !callbacks || typeof callbacks.onToggle !== 'function') return 'full';
    return callbacks.onToggle(profile);
  }

  /** 已选清单：「A」「B」这样连排，不加顿号——书名号本身就断得开。 */
  function pickedList() {
    return picks().map(function (item) { return '「' + item.text + '」'; }).join('');
  }

  /**
   * 常规提示。三种情形只有这一处措辞，别在各个分支里各写一遍：
   * 一旦上限从 3 改成别的数，那些散落的句子会立刻和 CONFIG 对不上。
   */
  function syncHint() {
    const list = picks();
    if (!list.length) {
      setHint(openId
        ? '挑一条最贴近此刻的，最多可以选 ' + CONFIG.WORRY_MAX_PICK + ' 条。'
        : '把指针移到任意一个上面，看看里面有什么。');
      return;
    }
    const rest = CONFIG.WORRY_MAX_PICK - list.length;
    // 选满了就不再补一句「已经选满，确认吧」：
    // 「3 / 3」和按钮上的「确认这 3 条烦恼」已经把这件事说了两遍，
    // 再加一句只会把这行顶到「社交」那颗粒子底下去。
    setHint('已选 ' + list.length + ' / ' + CONFIG.WORRY_MAX_PICK + '：' + pickedList() +
      (rest > 0 ? '　还能再选 ' + rest + ' 条，也可以直接确认。' : ''));
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
    const list = picks();
    particles.forEach(function (p) {
      const isFocus = p.dataset.category === focusId;
      p.classList.toggle('is-active', isFocus);
      // is-preview 只在"悬停预览"时加：加了才有白雾模糊。
      // 已经点开的类别、以及自由输入刚推测出来的那个，都是玩家的当前选择，
      // 必须看得清——尤其后者：面板正指着它说「更接近这一类」，蒙上白雾就白说了。
      p.classList.toggle('is-preview', isFocus && !openId && !list.length);
      // 已经贡献了选择的大类留一枚记号。跨大类挑的时候，
      // 玩家从展开态退回粒子场，得一眼看出哪几类已经拿过了。
      p.classList.toggle('is-chosen', list.some(function (item) {
        return item.category === p.dataset.category;
      }));
    });
    const root = scene();
    if (root) {
      root.classList.toggle('is-focused', Boolean(focusId));
      root.classList.toggle('is-expanded', Boolean(openId));
      // 确认键是**选中之后才出现**的（规格原话），不是一直摆在那里灰着。
      root.classList.toggle('is-picked', list.length > 0);
    }
    renderSubs();
    const confirm = node('confirmWorry');
    if (confirm) {
      confirm.disabled = !list.length || flying;
      // 文案跟着条数走。多选之后「确认这个烦恼」会和画面上高亮的两三条自相矛盾。
      confirm.textContent = list.length > 1
        ? ('确认这 ' + list.length + ' 条烦恼')
        : '确认这个烦恼';
    }
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

    const chosen = picks();
    let list;
    if (openId) {
      list = (WorryData.byCategory(openId) || []).slice(0, CONFIG.WORRY_LIST_MAX);
    } else {
      const preview = WorryData.hoverPreview(focusId) || [];
      list = (preview.length ? preview : WorryData.byCategory(focusId) || [])
        .slice(0, CONFIG.WORRY_SUB_COUNT);
    }
    if (list.length > CONFIG.WORRY_LIST_COLUMN_AFTER) box.classList.add('worry-subs--full');

    // 「← 返回全部类别」建在这个容器里，而不是场景上另摆一颗绝对定位的按钮：
    // u03 的版面已经被五块禁区排满，独立按钮在三档分辨率里总有一档要压到粒子。
    // 它没有 data-bind，符合「重建容器里不许有 data-bind 子节点」的约束。
    if (openId) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'worry-sub worry-sub--back';
      back.textContent = '← 返回全部类别';
      back.dataset.action = 'worry-back';
      box.appendChild(back);
    }

    list.forEach(function (preset) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'worry-sub';
      button.textContent = preset.text;
      button.dataset.action = 'pick-worry';
      button.dataset.presetId = String(preset.id);
      button.classList.toggle('is-active', chosen.some(function (item) {
        return item.presetId === preset.id;
      }));
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

  /**
   * 展开一个大类。多选之后这里**不再清空已选**：
   * 换大类正是跨类挑选的正常动作，把上一类挑好的抹掉等于把多选废掉一半。
   */
  function pickCategory(categoryId) {
    if (!categoryId || flying) return;
    window.clearTimeout(leaveTimer);
    focusId = categoryId;
    openId = categoryId;
    hidePanel();
    sync();
    const name = categoryName(categoryId);
    const list = picks();
    setHint(name
      ? ('「' + name + '」——挑一条最贴近此刻的。' +
         (list.length ? '　已选 ' + list.length + ' / ' + CONFIG.WORRY_MAX_PICK + '：' + pickedList() : ''))
      : '');
  }

  /** 从展开的完整列表回到九宫粒子场。推测面板上的「返回继续选」也走这里。 */
  function backToCategories() {
    if (flying) return;
    window.clearTimeout(leaveTimer);
    openId = '';
    focusId = '';
    hidePanel();
    sync();
    syncHint();
  }

  /** 点条目 = 加一条；点已选中的同一条 = 取消。选满了只提示，不顶替。 */
  function pickWorry(presetId) {
    if (flying) return;
    const preset = WorryData.preset(Number(presetId));
    if (!preset) return;
    focusId = preset.category;
    openId = preset.category;
    hidePanel();
    const field = document.getElementById('worry-text');
    if (field) field.value = '';
    const result = toggle(WorryData.createProfile(preset.text, {
      presetId: preset.id,
      category: preset.category,
      behaviorType: preset.behaviorType
    }));
    sync();
    if (result === 'full') {
      // 不静默顶替：玩家点的是第 4 条，替掉哪一条都是替他做主。
      setHint('最多选 ' + CONFIG.WORRY_MAX_PICK + ' 条。想换的话，先点一下已选中的那条取消它。');
      return;
    }
    syncHint();
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
    // 注意这里**不再** onClear：自由输入只是三条里的一条，
    // 它认不出来，不该把前面已经挑好的那两条一起清掉。
    if (!guess) {
      focusId = '';
      openId = '';
      sync();
      showPanel({
        guess: '这条烦恼我还认不出来。',
        note: '请从画面里的九个大类里挑一个最接近的。',
        canConfirm: picks().length > 0
      });
      setHint('');
      return;
    }

    const name = categoryName(guess.category);
    focusId = guess.category;
    openId = '';                       // 自由输入不需要展开列表，居中那个只是"我们猜的是它"
    const result = toggle(WorryData.createProfile(text, { category: guess.category }));
    sync();

    if (result === 'full') {
      showPanel({
        guess: '已经选满 ' + CONFIG.WORRY_MAX_PICK + ' 条了。',
        note: '想把这条换进来，先返回取消一条已选的。',
        canConfirm: true
      });
      setHint('');
      return;
    }

    // 同一句话写第二遍 = 取消它。走到这里说明清单里本来就有这条。
    if (result === 'removed') {
      field.value = '';
      showPanel({
        guess: '这条刚才已经在清单里，现在取消了。',
        note: '可以再写一条，或者返回继续挑。',
        canConfirm: picks().length > 0
      });
      setHint('');
      return;
    }

    // 加进来之后清空输入框：面板上的「返回继续选」会把这一行放回来，
    // 玩家可以接着写第二条自由输入的烦恼。
    field.value = '';

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
   *
   * 起点按烦恼各自的大类取那颗粒子——选了三条就是三条不同的弧线，
   * 汇进同一个口袋。取不到就退回确认键，总之要有个起点。
   */
  function flyOne(worry, done) {
    const root = scene();
    if (!root || reducedMotion()) { done(); return; }

    const rect = root.getBoundingClientRect();
    const source = (worry.category &&
        root.querySelector('.worry-particle[data-category="' + worry.category + '"]')) ||
      root.querySelector('.worry-particle.is-active') ||
      node('confirmWorry');
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
    label.textContent = worry.text;
    label.setAttribute('aria-hidden', 'true');
    label.style.offsetPath = 'path("' + d + '")';
    label.style.offsetRotate = '0deg';

    root.appendChild(trail);
    root.appendChild(label);

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
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
    flyTimers.push(window.setTimeout(finish, ms));
  }

  /**
   * 几条烦恼错峰出发，全部落地才算完。
   * 计数器只减不加：任何一条的兜底定时器都能推进它，
   * 少一条就永远停在 u03——所以 flyOne 里那个 finish 必须是幂等的。
   */
  function flyPicks(list, done) {
    if (!list.length || reducedMotion()) { done(); return; }
    let pending = list.length;
    function oneDone() {
      pending -= 1;
      if (pending <= 0) done();
    }
    list.forEach(function (worry, i) {
      if (i === 0) { flyOne(worry, oneDone); return; }
      flyTimers.push(window.setTimeout(function () {
        flyOne(worry, oneDone);
      }, i * CONFIG.WORRY_FLY_STAGGER_MS));
    });
  }

  function clearFlyTimers() {
    flyTimers.forEach(function (id) { window.clearTimeout(id); });
    flyTimers = [];
  }

  function confirm() {
    if (flying) return;
    const list = picks().slice();
    if (!list.length) {
      setHint('请先选一条烦恼，或者自己写一条。');
      return;
    }
    flying = true;
    hidePanel();
    sync();
    setHint(list.length > 1
      ? '这 ' + list.length + ' 条都放进四次元口袋了。'
      : '已经放进四次元口袋了。');
    flyPicks(list, function () {
      flying = false;
      clearFlyTimers();
      if (callbacks && typeof callbacks.onConfirmed === 'function') callbacks.onConfirmed();
    });
  }

  /* ---------------- 生命周期 ---------------- */

  function reset() {
    focusId = '';
    openId = '';
    flying = false;
    window.clearTimeout(leaveTimer);
    clearFlyTimers();
    hidePanel();
    const field = document.getElementById('worry-text');
    if (field) field.value = '';
    if (built) sync();
    setHint('');
  }

  function enter() {
    buildParticles();
    // 从 u05 退回来时选择还在，画面要能接着上次的状态显示。
    // 多条时不替玩家展开任何一类：展开哪一类都是偏心，
    // 直接停在粒子场，已选的那几类带着 is-chosen 记号，一眼看得出。
    const list = picks();
    if (list.length === 1 && list[0].category) {
      focusId = list[0].category;
      openId = list[0].presetId ? list[0].category : '';
    } else if (list.length > 1) {
      focusId = '';
      openId = '';
    }
    flying = false;
    sync();
    startDrift();
    if (list.length) syncHint();
    else setHint('把指针移到任意一个上面，看看里面有什么。');
  }

  function exit() {
    stopDrift();
    window.clearTimeout(leaveTimer);
    clearFlyTimers();
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
    backToCategories: backToCategories,
    pickWorry: pickWorry,
    classifyFree: classifyFree,
    confirm: confirm
  };
})();
