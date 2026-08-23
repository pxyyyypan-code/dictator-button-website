/**
 * gadget-match.js —— U4 老虎机匹配 + U5 匹配结果
 *
 * 规格（UI 指令第 4、5 页）：
 *   · 三列滚轮，每列 20 个道具 + 1 个空位，自动播 2～3 秒，可「跳过」；
 *   · 停下后**拨动老虎机旁边的拨杆**，蓝色部分界面上移，直接衔接第 5 页；
 *   · 第 5 页里「道具位置依然不变」，点击道具弹出 xlsx 里的功能说明。
 *
 * 「位置不变」这句得说清楚：初稿第 4 页的中奖格在正中，第 5 页的道具在右侧圆形里，
 * 像素级重合是不可能的。所以这里按**同一个物体**来实现——
 * 拨杆按下后把中奖格里那张图复制成一个 position:fixed 的替身，
 * 它横跨场景切换不被销毁，从停止位一路飞到结果位。
 * 道具全程没有被重排、重抽或换过一张图，玩家看到的是同一件东西被拿出来。
 *
 * 滚动实现：每列是「窗口(.slot__reel, overflow:hidden) + 长条(.slot__strip)」，
 * 长条把 21 格的池子重复 4 遍，用 translateY 一路拉上去。
 * 窗口高 SLOT_ROW_VISIBLE 格，**正中那格**是停止位：
 * 位移 -k 格时露出 strip[k]、strip[k+1]、strip[k+2]，所以中奖格的下标是 k+1。
 *
 * 三列的分配规律由玩家在 u03 选了几条烦恼决定（planAssignment），不是随机：
 *   1 条 → 三列都停在同一个道具；
 *   2 条 → 前两列 A、第三列 B；
 *   3 条 → 三列各一个。
 * 换句话说，**三列停下来能看到几个不同的道具，就等于玩家选了几条烦恼**。
 * 以前中列是唯一的中奖列、左右两列按固定偏移陪跑，那套逻辑在这里被整个换掉了。
 */
'use strict';

const GadgetMatch = (function () {
  /** 池子重复几遍。要够长：最远停止位是 21*2+20+2 = 64 格，4 遍 84 格有余量。 */
  const STRIP_REPEATS = 4;
  /** 至少滚过两整圈再停，保证"真的转起来"的观感。 */
  const BASE_LOOPS = 2;

  /** @type {{getGadget:Function,getWorry:Function,onLifted:Function}|null} */
  let callbacks = null;
  /** @type {HTMLElement[]} 三列各自的中奖格，飞行动画的起点从这里挑 */
  let winnerCells = [];
  /** @type {Animation[]} 三列的滚动动画，跳过时要 finish 掉 */
  let spins = [];
  /** @type {boolean} 三列是否已全部停稳 */
  let settled = false;
  /** @type {boolean} 拨杆是否已经拨下（防连点：上移只能发生一次） */
  let pulled = false;
  /** @type {HTMLElement[]} 跨场景飞行的道具替身（每件道具一个） */
  let ghosts = [];
  /** @type {number[]} 替身的兜底清理定时器 */
  let ghostTimers = [];
  /** @type {number} 最近一次点开说明的是第几件道具（关闭弹窗时焦点要还回去） */
  let lastTipSlot = 0;

  function node(name) {
    return document.querySelector('[data-bind="' + name + '"]');
  }

  function slotScene() {
    return document.querySelector('[data-scene="u04"]');
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function setText(name, value) {
    const el = node(name);
    if (el) el.textContent = value || '';
  }

  /** 匹配到的道具，永远是数组（1~3 件），顺序和玩家选烦恼的顺序一一对应。 */
  function gadgets() {
    const list = (callbacks && typeof callbacks.getGadget === 'function')
      ? callbacks.getGadget()
      : null;
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  /** 对应的烦恼，和 gadgets() 同序同长（app.js 那边是 map 出来的）。 */
  function worries() {
    const list = (callbacks && typeof callbacks.getWorry === 'function')
      ? callbacks.getWorry()
      : null;
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  function joinNames(list) {
    return list.map(function (item) { return item.name; }).join('、');
  }

  function joinWorries() {
    return worries().map(function (item) { return item.text; }).join('、');
  }

  /**
   * 三列各停在哪件道具上。规格原话：
   *   1 条烦恼 → 三列都是同一个；2 条 → 前两列一个、第三列另一个；3 条 → 各一个。
   * 这里按 list.length 写死三种排法，所以 CONFIG.WORRY_MAX_PICK 一旦不是 3，这个函数要跟着改。
   */
  function planAssignment(list) {
    if (list.length >= 3) return [list[0], list[1], list[2]];
    if (list.length === 2) return [list[0], list[0], list[1]];
    if (list.length === 1) return [list[0], list[0], list[0]];
    return [];
  }

  /**
   * 每件道具由哪一列送出去（下标是 planAssignment 的列号）。
   * 取的是它占据的**最靠中间**那一列：一件时走中列，两件时中列 + 右列，三件时各归各列。
   * 这样每个替身都是从一格**真的正显示着它**的位置起飞的，不会出现"从别的道具身上飞出来"。
   */
  function ghostReels(count) {
    if (count >= 3) return [0, 1, 2];
    if (count === 2) return [1, 2];
    return [1];
  }

  /* ---------------- U4 三列滚轮 ---------------- */

  function makeCell(item) {
    const cell = document.createElement('span');
    cell.className = 'slot__cell' + (item ? '' : ' slot__cell--empty');
    if (item) {
      const img = document.createElement('img');
      img.src = item.image;
      img.alt = item.name;
      img.width = 72;
      img.height = 72;
      cell.appendChild(img);
      cell.dataset.gadget = item.id;
    }
    return cell;
  }

  /**
   * 建一列：窗口里塞一条重复 STRIP_REPEATS 遍的长条，并返回停止位所需的信息。
   * pool 里的 null 就是规格要求的那个「空位」，照样占一格。
   *
   * 第一个参数既收 data-bind 名（u04 的三列），也直接收元素——
   * 奖励老虎机的三列在文档级弹层里，没有 data-bind，走后一条路。
   */
  function buildReel(reelRef, pool, winnerIndex) {
    const reel = typeof reelRef === 'string' ? node(reelRef) : reelRef;
    if (!reel) return null;
    reel.innerHTML = '';
    const strip = document.createElement('div');
    strip.className = 'slot__strip';
    for (let loop = 0; loop < STRIP_REPEATS; loop += 1) {
      pool.forEach(function (item) { strip.appendChild(makeCell(item)); });
    }
    reel.appendChild(strip);
    // 位移 k 格后正中露出的是 strip[k+1]，所以 k = 目标下标 - 1。
    const target = pool.length * BASE_LOOPS + winnerIndex;
    return { reel: reel, strip: strip, offset: target - 1, cellIndex: target };
  }

  /** 一格有多高只有 CSS 说了算（clamp），所以从窗口实测，别在 JS 里再写一份数值。 */
  function cellHeight(reel) {
    const h = reel.getBoundingClientRect().height;
    return h > 0 ? h / CONFIG.SLOT_ROW_VISIBLE : 0;
  }

  function startSpin() {
    const matched = gadgets();
    setText('slotWorryLabel', joinWorries());
    setText('slotLead', '正在从四次元口袋里翻找……');
    settled = false;
    pulled = false;
    spins = [];
    winnerCells = [];
    removeGhosts();

    const scene = slotScene();
    if (scene) scene.classList.remove('is-lifting');
    const lever = node('slotLever');
    if (lever) {
      lever.classList.remove('is-ready', 'is-pulled');
      lever.setAttribute('aria-hidden', 'true');
      lever.setAttribute('tabindex', '-1');
    }
    const skip = node('slotSkip');
    if (skip) skip.hidden = false;

    const pools = ['reelA', 'reelB', 'reelC'].map(function (name, i) {
      return { name: name, pool: GadgetData.reelPool(i + 1) };
    });

    // 三列各自停在 planAssignment 指定的那件道具上，没有"陪跑列"了。
    // 每列的池子都含全部 20 件（只是顺序和空位位置不同），所以任何一件都找得到。
    const assign = planAssignment(matched);
    const plans = pools.map(function (entry, i) {
      const want = assign[i];
      let index = want ? entry.pool.findIndex(function (item) {
        return item && item.id === want.id;
      }) : -1;
      if (index < 0) index = 0;
      return buildReel(entry.name, entry.pool, index);
    }).filter(Boolean);

    // 三格全部算中奖格：玩家选了几条，就该看到几个高亮的、真正属于自己的结果。
    winnerCells = plans.map(function (plan) {
      return plan.strip.children[plan.cellIndex] || null;
    });
    winnerCells.forEach(function (cell) {
      if (cell) cell.classList.add('is-winner');
    });

    const unit = plans.length ? cellHeight(plans[0].reel) : 0;
    if (!unit || reducedMotion()) {
      // 量不到高度（极端情况下场景还没排版完）或用户要求减少动效：直接摆到停止位。
      plans.forEach(function (plan) {
        plan.strip.style.transform = 'translateY(' + (-plan.offset * (unit || 0)) + 'px)';
      });
      onAllSettled();
      return;
    }

    // 三列先后停下：最后一列正好落在 SLOT_SPIN_MS，整段自动播控制在 2～3 秒内。
    plans.forEach(function (plan, i) {
      const duration = CONFIG.SLOT_SPIN_MS - (plans.length - 1 - i) * CONFIG.SLOT_REEL_STAGGER_MS;
      const anim = plan.strip.animate([
        { transform: 'translateY(0px)' },
        { transform: 'translateY(' + (-plan.offset * unit) + 'px)' }
      ], {
        duration: Math.max(duration, 400),
        easing: 'cubic-bezier(.12,.62,.16,1)',
        fill: 'forwards'
      });
      spins.push(anim);
      if (i === plans.length - 1) anim.onfinish = onAllSettled;
    });

    // onfinish 不是可靠的唯一信号（标签页切走时会拖后），补一个兜底。
    SceneManager.addTimer(onAllSettled, CONFIG.SLOT_SPIN_MS + 240);
  }

  /** 三列停稳：换文案、收起「跳过」、让拨杆浮出来。 */
  function onAllSettled() {
    if (settled) return;
    settled = true;
    const matched = gadgets();
    setText('slotLead', matched.length ? '找到了：' + joinNames(matched) : '找到了');
    const skip = node('slotSkip');
    if (skip) skip.hidden = true;
    SceneManager.addTimer(function () {
      const lever = node('slotLever');
      if (!lever) return;
      lever.classList.add('is-ready');
      lever.setAttribute('aria-hidden', 'false');
      lever.removeAttribute('tabindex');
    }, reducedMotion() ? 0 : CONFIG.SLOT_LEVER_DELAY_MS);
  }

  /** 「跳过」只跳过滚动，不跳过拨杆——拨杆是规格里明写的衔接动作。 */
  function skipSpin() {
    if (settled) return;
    spins.forEach(function (anim) {
      try { anim.finish(); } catch (err) { /* 已经停了就无所谓 */ }
    });
    spins = [];
    onAllSettled();
  }

  /* ---------------- 奖励抽卡：复用同一套滚轮 ---------------- */

  // 星级结算给的那一次抽卡，用的就是上面这台老虎机——同样的 makeCell / buildReel /
  // cellHeight，同样的 SLOT_SPIN_MS + SLOT_REEL_STAGGER_MS 停列节奏。
  // 不能直接调 startSpin() 的原因只有两条，都不涉及动画本身：
  //   1. startSpin 的三列写死在 [data-bind="reelA/B/C"]，那是 u04 场景里的节点；
  //   2. 它的中奖道具来自 planAssignment(玩家选的烦恼)，而抽卡的中奖道具是外面随机挑的。
  // 所以这里只换「哪三列」和「停在谁身上」，其余原样。
  /** @type {Animation[]} */
  let rewardSpins = [];
  /** @type {number[]} */
  let rewardTimers = [];
  let rewardSettled = true;

  function clearRewardTimers() {
    rewardTimers.forEach(function (id) { window.clearTimeout(id); });
    rewardTimers = [];
  }

  /**
   * 三列一起停在同一件道具上（一次只抽一件，等同于 u04 里"只选了一条烦恼"那种排法）。
   * @param {{reels:HTMLElement[], winner:Object, onSettle:Function}} options
   */
  function spinReward(options) {
    const opts = options || {};
    const reels = (opts.reels || []).filter(Boolean);
    const winner = opts.winner;
    const done = typeof opts.onSettle === 'function' ? opts.onSettle : function () {};
    cancelReward();
    if (!reels.length || !winner) { done(); return; }
    rewardSettled = false;

    function finish() {
      if (rewardSettled) return;
      rewardSettled = true;
      done();
    }

    const plans = reels.map(function (reel, i) {
      const pool = GadgetData.reelPool(i + 1);
      let index = pool.findIndex(function (item) { return item && item.id === winner.id; });
      if (index < 0) index = 0;
      return buildReel(reel, pool, index);
    }).filter(Boolean);
    if (!plans.length) { finish(); return; }

    plans.forEach(function (plan) {
      const cell = plan.strip.children[plan.cellIndex];
      if (cell) cell.classList.add('is-winner');
    });

    const unit = cellHeight(plans[0].reel);
    if (!unit || reducedMotion()) {
      plans.forEach(function (plan) {
        plan.strip.style.transform = 'translateY(' + (-plan.offset * (unit || 0)) + 'px)';
      });
      finish();
      return;
    }

    plans.forEach(function (plan, i) {
      const duration = CONFIG.SLOT_SPIN_MS - (plans.length - 1 - i) * CONFIG.SLOT_REEL_STAGGER_MS;
      const anim = plan.strip.animate([
        { transform: 'translateY(0px)' },
        { transform: 'translateY(' + (-plan.offset * unit) + 'px)' }
      ], {
        duration: Math.max(duration, 400),
        easing: 'cubic-bezier(.12,.62,.16,1)',
        fill: 'forwards'
      });
      rewardSpins.push(anim);
      if (i === plans.length - 1) anim.onfinish = finish;
    });
    // 和 startSpin 一样补一个兜底：标签页切走时 onfinish 会拖后。
    // 这里用 window.setTimeout 而不是 SceneManager.addTimer——抽卡弹层是文档级的，
    // 不该被场景切换连带清掉。
    rewardTimers.push(window.setTimeout(finish, CONFIG.SLOT_SPIN_MS + 240));
  }

  function cancelReward() {
    clearRewardTimers();
    rewardSpins.forEach(function (anim) {
      try { anim.cancel(); } catch (err) { /* 忽略 */ }
    });
    rewardSpins = [];
    rewardSettled = true;
  }

  /* ---------------- 拨杆 → 蓝色区上移 → 交给 U5 ---------------- */

  function pullLever() {
    if (!settled || pulled) return;
    pulled = true;
    const lever = node('slotLever');
    const scene = slotScene();
    if (lever) {
      lever.classList.add('is-pulled');
      lever.setAttribute('tabindex', '-1');
    }
    if (scene) scene.classList.add('is-lifting');
    SceneManager.addTimer(function () {
      launchGhosts();
      if (callbacks && typeof callbacks.onLifted === 'function') callbacks.onLifted();
      landGhosts();
    }, reducedMotion() ? 0 : CONFIG.SLOT_LIFT_MS);
  }

  /** u05 上三个道具位的绑定名，下标就是 data-gadget-index。 */
  const FIGURE_BINDS = ['gadgetFigure', 'gadgetFigure2', 'gadgetFigure3'];
  const IMAGE_BINDS = ['gadgetImage', 'gadgetImage2', 'gadgetImage3'];

  /**
   * 把中奖格里那张图复制成 fixed 替身，挂在 body 上。
   * 挂 body 而不是场景里，是因为它必须活过 u04 → u05 这次切换：
   * 场景切换会把 u04 整个 display:none，挂在里面的替身当场消失。
   *
   * 几件道具就放几个替身，各自从"正显示着它"的那一列起飞（ghostReels）。
   */
  function launchGhosts() {
    removeGhosts();
    const matched = gadgets();
    if (!matched.length || reducedMotion()) return;
    const from = ghostReels(matched.length);
    matched.forEach(function (item, i) {
      const cell = winnerCells[from[i]];
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      if (!rect.width) return;
      const img = document.createElement('img');
      img.className = 'gadget-ghost';
      img.src = item.image;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.style.left = rect.left + 'px';
      img.style.top = rect.top + 'px';
      img.style.width = rect.width + 'px';
      img.style.height = rect.height + 'px';
      img.dataset.slot = String(i);
      document.body.appendChild(img);
      ghosts.push(img);
    });
  }

  /** u05 已经可见了，这时才量得到目标位置，把替身送过去再撤掉。 */
  function landGhosts() {
    if (!ghosts.length) return;
    ghosts.forEach(function (ghost) {
      const slot = Number(ghost.dataset.slot) || 0;
      const target = node(IMAGE_BINDS[slot]);
      const figure = node(FIGURE_BINDS[slot]);
      if (!target) { ghost.remove(); return; }
      const to = target.getBoundingClientRect();
      if (!to.width) { ghost.remove(); return; }
      const box = ghost.getBoundingClientRect();
      const dx = (to.left + to.width / 2) - (box.left + box.width / 2);
      const dy = (to.top + to.height / 2) - (box.top + box.height / 2);
      // 两端都是 object-fit:contain 的方图，真正画出来的边长是**盒子的短边**：
      // 替身那格是宽扁的（约 299×123），落点是正方形。
      // 按宽度算比例，替身会停在落点四成大的地方，接手那一下"啪"地涨一截；
      // 按短边算，画出来的道具在交接前后一样大。
      const scale = Math.min(to.width, to.height) / Math.min(box.width, box.height);

      // 目标位先留空，等替身落地再显形，否则同一件道具会同时出现两份。
      if (figure) figure.classList.add('is-arriving');

      const ms = CONFIG.GADGET_FLY_MS;
      ghost.animate([
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')' }
      ], { duration: ms, easing: 'cubic-bezier(.28,.02,.2,1)', fill: 'forwards' });

      ghostTimers.push(window.setTimeout(function () {
        // 交接顺序不能反：先让真图显形（.match__image 没有淡入过渡，是瞬间的），
        // 下一帧再撤替身。反过来就是"替身没了、真图还在淡入"，中间空掉一瞬，
        // 看上去像道具闪了一下才出现。
        if (figure) figure.classList.remove('is-arriving');
        window.requestAnimationFrame(function () {
          ghost.remove();
          ghosts = ghosts.filter(function (g) { return g !== ghost; });
        });
      }, ms));
    });
  }

  function removeGhosts() {
    ghostTimers.forEach(function (id) { window.clearTimeout(id); });
    ghostTimers = [];
    ghosts.forEach(function (g) { g.remove(); });
    ghosts = [];
    FIGURE_BINDS.forEach(function (name) {
      const figure = node(name);
      if (figure) figure.classList.remove('is-arriving');
    });
  }

  /* ---------------- U5 结果页 ---------------- */

  function renderResult() {
    const matched = gadgets();
    if (!matched.length) return false;
    const list = worries();
    setText('gadgetName', joinNames(matched));

    // 初稿上是一条「烦恼 × 道具」的算式，不是道具类别；类别放进说明弹窗里。
    // 多件就一行一条，靠 .match__formula 的 white-space:pre-line 断行——
    // 挤成一行的话，三条算式在 1366 宽下会直接撞穿左半栏。
    setText('gadgetGroup', matched.map(function (item, i) {
      const worry = list[i];
      return worry ? worry.text + ' × ' + item.name : item.group;
    }).join('\n'));

    // 一件时把说明直接摆出来；多件时不能只显示其中一件的说明，
    // 也不该把三段堆成一大块（左半栏放不下）。
    // 这里写的是**对应关系**，不是「点它」——「点它」已经由道具下面那行
    // .match__tip「点击道具以查看功能」说过了，同一句写两遍等于白占一行。
    setText('gadgetDesc', matched.length === 1
      ? (matched[0].description || '')
      : '一条烦恼配一件道具，上面的算式就是它们的对应关系。');

    // 用不到的位置收起来。data-count 只管排布尺寸，隐藏靠各自的 hidden。
    const gallery = node('gadgetGallery');
    if (gallery) gallery.dataset.count = String(Math.min(matched.length, 3));
    FIGURE_BINDS.forEach(function (name, i) {
      const figure = node(name);
      const image = node(IMAGE_BINDS[i]);
      const item = matched[i];
      if (figure) figure.hidden = !item;
      if (image && item) {
        image.src = item.image;
        image.alt = item.name;
      }
    });
    return true;
  }

  /** 点道具弹出说明。外形整个由 tip-frame.webp 承担，这里只填字。 */
  function showTip(index) {
    const matched = gadgets();
    const slot = Math.min(Math.max(Number(index) || 0, 0), matched.length - 1);
    const item = matched[slot];
    const modal = node('gadgetTip');
    if (!item || !modal) return;
    lastTipSlot = slot;
    setText('tipName', item.name);
    setText('tipGroup', '道具类别｜' + item.group);
    setText('tipDesc', item.description || '');
    const image = node('tipImage');
    if (image) {
      image.src = item.image;
      image.alt = item.name;
    }
    modal.classList.add('modal--open');
    modal.setAttribute('aria-hidden', 'false');
    const close = modal.querySelector('.tip-frame__ok');
    if (close) close.focus();
  }

  function hideTip() {
    const modal = node('gadgetTip');
    if (!modal) return;
    modal.classList.remove('modal--open');
    modal.setAttribute('aria-hidden', 'true');
    // 焦点要还给**刚才点开的那一件**，不是永远还给第一件——
    // 键盘玩家挨个看三件说明时，每关一次就跳回第一件是走不下去的。
    const figure = node(FIGURE_BINDS[lastTipSlot]);
    if (figure && !figure.hidden) figure.focus();
  }

  function tipOpen() {
    const modal = node('gadgetTip');
    return Boolean(modal && modal.classList.contains('modal--open'));
  }

  /* ---------------- 生命周期 ---------------- */

  function exitSlot() {
    spins.forEach(function (anim) {
      try { anim.cancel(); } catch (err) { /* 忽略 */ }
    });
    spins = [];
    const scene = slotScene();
    if (scene) scene.classList.remove('is-lifting');
  }

  function exitResult() {
    hideTip();
    removeGhosts();
  }

  function reset() {
    exitSlot();
    exitResult();
    cancelReward();
    settled = false;
    pulled = false;
    winnerCells = [];
    lastTipSlot = 0;
    // 重新开始时把多出来的两个道具位收回去，否则上一轮选三条、这一轮选一条，
    // 第二、三个位置会挂着上一轮的图不放。
    const gallery = node('gadgetGallery');
    if (gallery) gallery.dataset.count = '1';
    FIGURE_BINDS.forEach(function (name, i) {
      const figure = node(name);
      if (figure) figure.hidden = i > 0;
    });
  }

  function mount(handlers) {
    callbacks = handlers || null;
  }

  return {
    mount: mount,
    startSpin: startSpin,
    skipSpin: skipSpin,
    pullLever: pullLever,
    spinReward: spinReward,
    cancelReward: cancelReward,
    renderResult: renderResult,
    showTip: showTip,
    hideTip: hideTip,
    tipOpen: tipOpen,
    exitSlot: exitSlot,
    exitResult: exitResult,
    reset: reset
  };
})();
