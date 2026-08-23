/**
 * collection.js —— 20 件辅助道具收藏册
 *
 * 收藏池就是 GadgetData.all，正好 20 件。独裁者按钮不在里面：
 * gadget-data.js 把它单独放在 DICTATOR_BUTTON 常量里，从来不进 GADGETS 数组，
 * 所以这里**不需要**任何过滤，也不要顺手加一句 filter——加了反而会掩盖
 * 将来数据源真出问题时的症状。
 *
 * 状态只活在本次体验里：unlocked 是一个内存 Set，restart 清空，
 * 不写 localStorage、不落任何存储（CLAUDE.md：不新增后端与云端保存）。
 *
 * 布局 4 列 × 5 行共 20 格，视窗一次只露 2 行，其余靠滚轮看。
 * 滚轮不能带动整页：视窗自身 overscroll-behavior:contain 挡住滚动链，
 * 视窗以外的面板区域再补一个 preventDefault。
 *
 * 格子在 mount() 里建一次，此后只改 class 与 label，不重建 DOM——
 * 飞入动画要量目标格的位置，节点被换掉就量不到了。
 */
'use strict';

const Collection = (function () {
  const COLUMNS = CONFIG.COLLECTION_COLUMNS;

  /** @type {Set<number>} 已解锁道具的 id，仅本次体验有效 */
  const unlocked = new Set();
  /** @type {Object<number,HTMLElement>} id → 格子节点，飞入时按 id 取落点 */
  const cells = Object.create(null);
  /** @type {number[]} 收藏演出的定时器，reset 时全部清掉 */
  let timers = [];
  /** @type {Function|null} 演出结束后要回调谁（收回收藏夹之后才算结束） */
  let pendingDone = null;
  /** @type {HTMLElement|null} 正在飞的那个道具替身 */
  let flyer = null;
  let built = false;
  let autoCloseId = 0;

  function node(name) {
    return document.querySelector('[data-bind="' + name + '"]');
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function later(fn, ms) {
    const id = window.setTimeout(function () {
      timers = timers.filter(function (t) { return t !== id; });
      fn();
    }, Math.max(0, ms));
    timers.push(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(function (id) { window.clearTimeout(id); });
    timers = [];
    autoCloseId = 0;
  }

  /* ---------------- 建格子 ---------------- */

  function makeCell(item) {
    const cell = document.createElement('div');
    cell.className = 'collection__item is-locked';
    cell.dataset.gadgetId = String(item.id);
    cell.tabIndex = 0;
    // 名称默认不显示：已解锁 hover 出名字，未解锁 hover 出"未解锁"。
    cell.setAttribute('aria-label', '未解锁');

    const img = document.createElement('img');
    img.src = item.image;
    img.alt = '';
    img.width = 120;
    img.height = 120;
    img.loading = 'lazy';

    const label = document.createElement('span');
    label.className = 'collection__label';
    label.textContent = '未解锁';

    cell.appendChild(img);
    cell.appendChild(label);
    return cell;
  }

  function buildGrid() {
    const grid = node('collectionGrid');
    if (!grid || built) return;
    const all = GadgetData.all;
    grid.innerHTML = '';
    for (let start = 0; start < all.length; start += COLUMNS) {
      const row = document.createElement('div');
      row.className = 'collection__row';
      row.dataset.row = String(start / COLUMNS);
      all.slice(start, start + COLUMNS).forEach(function (item) {
        const cell = makeCell(item);
        cells[item.id] = cell;
        row.appendChild(cell);
      });
      grid.appendChild(row);
    }
    built = true;
  }

  /* ---------------- 计数与视窗 ---------------- */

  function refreshCount() {
    const count = unlocked.size;
    const label = node('collectionCount');
    if (label) label.textContent = String(count);
    const badge = node('collectionBadge');
    if (badge) badge.textContent = String(count);
  }

  function updateScrollHint() {
    const viewport = node('collectionViewport');
    const hint = node('collectionHint');
    if (!viewport || !hint) return;
    const span = viewport.scrollHeight - viewport.clientHeight;
    const progress = span > 1 ? viewport.scrollTop / span : 0;
    hint.style.setProperty('--scroll-progress', String(Math.min(1, Math.max(0, progress))));
  }

  /** 把目标道具所在的那一行滚到视窗顶部。 */
  function scrollToGadget(gadget) {
    const viewport = node('collectionViewport');
    const grid = node('collectionGrid');
    if (!viewport || !grid || !gadget) return;
    const index = GadgetData.all.findIndex(function (item) { return item.id === gadget.id; });
    if (index < 0) return;
    const row = grid.querySelector('.collection__row[data-row="' + Math.floor(index / COLUMNS) + '"]');
    if (!row) return;
    const top = row.offsetTop - grid.offsetTop;
    if (reducedMotion()) viewport.scrollTop = top;
    else viewport.scrollTo({ top: top, behavior: 'smooth' });
    later(updateScrollHint, 360);
  }

  /* ---------------- 开合 ---------------- */

  function isOpen() {
    const panel = node('collectionPanel');
    return Boolean(panel && panel.classList.contains('is-open'));
  }

  function open() {
    const panel = node('collectionPanel');
    if (!panel) return;
    panel.classList.remove('is-closing');
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    refreshCount();
    updateScrollHint();
  }

  function close() {
    const panel = node('collectionPanel');
    if (!panel || !panel.classList.contains('is-open')) return;
    cancelAutoClose();
    panel.classList.add('is-closing');
    later(function () {
      panel.classList.remove('is-open', 'is-closing');
      panel.setAttribute('aria-hidden', 'true');
      pulseFab();
      const done = pendingDone;
      pendingDone = null;
      if (done) done();
    }, reducedMotion() ? 0 : CONFIG.COLLECTION_CLOSE_MS);
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  function revealFab() {
    const fab = node('collectionFab');
    if (fab) fab.hidden = false;
  }

  function pulseFab() {
    const fab = node('collectionFab');
    if (!fab || fab.hidden || reducedMotion()) return;
    fab.classList.remove('is-pulsing');
    // 强制回流，否则连续两次收藏时动画不会重播。
    void fab.offsetWidth;
    fab.classList.add('is-pulsing');
  }

  /* ---------------- 抽取池 ---------------- */

  function lockedGadgets() {
    return GadgetData.all.filter(function (item) { return !unlocked.has(item.id); });
  }

  function hasRemaining() {
    return lockedGadgets().length > 0;
  }

  /** 从还没收藏过的道具里随机挑一件；已抽过的不会再出现。挑完不落库，收进去才算数。 */
  function draw() {
    const pool = lockedGadgets();
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ---------------- 收藏演出 ---------------- */

  function unlock(gadget) {
    if (!gadget) return;
    unlocked.add(gadget.id);
    const cell = cells[gadget.id];
    if (cell) {
      cell.classList.remove('is-locked');
      cell.classList.add('is-unlocked');
      cell.setAttribute('aria-label', gadget.name);
      const label = cell.querySelector('.collection__label');
      if (label) label.textContent = gadget.name;
      if (!reducedMotion()) {
        cell.classList.remove('is-fresh');
        void cell.offsetWidth;
        cell.classList.add('is-fresh');
      }
    }
    refreshCount();
    revealFab();
  }

  function removeFlyer() {
    if (flyer) flyer.remove();
    flyer = null;
  }

  /**
   * 彩色道具从展示位缩小飞进对应槽位，落地后灰色剪影转成彩色。
   * @param {Object} gadget
   * @param {HTMLElement} fromEl 起飞位置（新道具展示层里的那张图）
   * @param {Function} onLanded
   */
  function flyIntoSlot(gadget, fromEl, onLanded) {
    const cell = cells[gadget.id];
    const from = fromEl && fromEl.getBoundingClientRect();
    const to = cell && cell.getBoundingClientRect();
    if (!from || !to || !from.width || !to.width || reducedMotion()) {
      onLanded();
      return;
    }
    removeFlyer();
    const img = document.createElement('img');
    img.className = 'collection-flyer';
    img.src = gadget.image;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.style.left = from.left + 'px';
    img.style.top = from.top + 'px';
    img.style.width = from.width + 'px';
    img.style.height = from.height + 'px';
    document.body.appendChild(img);
    flyer = img;

    // 两端都是 object-fit:contain 的方图，按短边算比例，交接前后大小才对得上。
    const scale = (Math.min(to.width, to.height) * 0.68) / Math.min(from.width, from.height);
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    const ms = CONFIG.COLLECTION_FLY_MS;
    img.animate([
      { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1 },
      { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ') rotate(-4deg)', opacity: 1 },
      { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ') rotate(-4deg)', opacity: 0 }
    ], {
      duration: ms + 140,
      easing: 'cubic-bezier(.28,.02,.2,1)',
      fill: 'forwards'
    });
    later(function () {
      removeFlyer();
      onLanded();
    }, ms);
  }

  function cancelAutoClose() {
    if (!autoCloseId) return;
    window.clearTimeout(autoCloseId);
    timers = timers.filter(function (t) { return t !== autoCloseId; });
    autoCloseId = 0;
  }

  /**
   * 抽中之后的完整收藏动画：
   *   打开收藏册 → 滚到目标行 → 彩色道具缩小飞进槽位 → 剪影转彩色 → 停留 → 收回右下角。
   * 停留期间玩家一动（滚轮 / 点击 / 键盘），自动收回就取消，让他继续看，
   * 由「收回收藏夹」或右下角图标自己决定什么时候关。
   * onDone 一律等到面板真的收回去才调，不管是自动还是手动。
   */
  function store(gadget, fromEl, onDone) {
    if (!gadget) { if (onDone) onDone(); return; }
    clearTimers();
    pendingDone = typeof onDone === 'function' ? onDone : null;
    open();

    const openMs = reducedMotion() ? 0 : CONFIG.COLLECTION_OPEN_MS;
    later(function () { scrollToGadget(gadget); }, openMs);
    later(function () {
      flyIntoSlot(gadget, fromEl, function () {
        unlock(gadget);
        autoCloseId = later(close, reducedMotion() ? 600 : CONFIG.COLLECTION_UNLOCK_HOLD_MS);
      });
    }, openMs + (reducedMotion() ? 0 : CONFIG.COLLECTION_SCROLL_SETTLE_MS));
  }

  /* ---------------- 生命周期 ---------------- */

  function reset() {
    clearTimers();
    removeFlyer();
    pendingDone = null;
    unlocked.clear();
    Object.keys(cells).forEach(function (id) {
      const cell = cells[id];
      cell.classList.remove('is-unlocked', 'is-fresh');
      cell.classList.add('is-locked');
      cell.setAttribute('aria-label', '未解锁');
      const label = cell.querySelector('.collection__label');
      if (label) label.textContent = '未解锁';
    });
    const panel = node('collectionPanel');
    if (panel) {
      panel.classList.remove('is-open', 'is-closing');
      panel.setAttribute('aria-hidden', 'true');
    }
    const viewport = node('collectionViewport');
    if (viewport) viewport.scrollTop = 0;
    const fab = node('collectionFab');
    if (fab) {
      fab.hidden = true;
      fab.classList.remove('is-pulsing');
    }
    refreshCount();
    updateScrollHint();
  }

  function bindEvents() {
    const panel = node('collectionPanel');
    const viewport = node('collectionViewport');
    if (viewport) {
      viewport.addEventListener('scroll', updateScrollHint, { passive: true });
    }
    if (panel) {
      // 视窗自己靠 overscroll-behavior:contain 断开滚动链；视窗以外的面板区域
      // 直接吞掉滚轮，保证「滚轮只控制收藏区域，不带动整个网页」。
      panel.addEventListener('wheel', function (event) {
        if (viewport && viewport.contains(event.target)) {
          cancelAutoClose();
          return;
        }
        event.preventDefault();
        cancelAutoClose();
      }, { passive: false });
      ['pointerdown', 'keydown'].forEach(function (type) {
        panel.addEventListener(type, cancelAutoClose);
      });
    }
  }

  function mount() {
    buildGrid();
    bindEvents();
    reset();
  }

  return {
    mount: mount,
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    draw: draw,
    store: store,
    hasRemaining: hasRemaining,
    count: function () { return unlocked.size; },
    total: function () { return GadgetData.all.length; },
    reset: reset
  };
})();
