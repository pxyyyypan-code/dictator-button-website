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
 */
'use strict';

const GadgetMatch = (function () {
  /** 池子重复几遍。要够长：最远停止位是 21*2+20+2 = 64 格，4 遍 84 格有余量。 */
  const STRIP_REPEATS = 4;
  /** 至少滚过两整圈再停，保证"真的转起来"的观感。 */
  const BASE_LOOPS = 2;

  /** @type {{getGadget:Function,getWorry:Function,onLifted:Function}|null} */
  let callbacks = null;
  /** @type {HTMLElement|null} 中奖格（reelB 正中那格），飞行动画的起点 */
  let winnerCell = null;
  /** @type {Animation[]} 三列的滚动动画，跳过时要 finish 掉 */
  let spins = [];
  /** @type {boolean} 三列是否已全部停稳 */
  let settled = false;
  /** @type {boolean} 拨杆是否已经拨下（防连点：上移只能发生一次） */
  let pulled = false;
  /** @type {HTMLElement|null} 跨场景飞行的道具替身 */
  let ghost = null;
  /** @type {number} 替身的兜底清理定时器 */
  let ghostTimer = 0;

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

  function gadget() {
    return (callbacks && typeof callbacks.getGadget === 'function') ? callbacks.getGadget() : null;
  }

  function worryText() {
    const worry = (callbacks && typeof callbacks.getWorry === 'function') ? callbacks.getWorry() : null;
    return worry ? worry.text : '';
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
   */
  function buildReel(bindName, pool, winnerIndex) {
    const reel = node(bindName);
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
    const matched = gadget();
    setText('slotWorryLabel', worryText());
    setText('slotLead', '正在从四次元口袋里翻找……');
    settled = false;
    pulled = false;
    spins = [];
    winnerCell = null;
    removeGhost();

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

    // 中列停在真正匹配到的道具上（初稿里高亮的就是中列正中那格）。
    // 左右两列只是陪跑：按固定偏移取，不用随机——同样的烦恼每次跑出来的画面要一致。
    const midPool = pools[1].pool;
    let winnerIndex = midPool.findIndex(function (item) {
      return item && matched && item.id === matched.id;
    });
    if (winnerIndex < 0) winnerIndex = 0;

    const plans = pools.map(function (entry, i) {
      const index = i === 1
        ? winnerIndex
        : (winnerIndex + (i === 0 ? 7 : 13)) % entry.pool.length;
      return buildReel(entry.name, entry.pool, index);
    }).filter(Boolean);

    const mid = plans[1];
    if (mid) winnerCell = mid.strip.children[mid.cellIndex] || null;
    if (winnerCell) winnerCell.classList.add('is-winner');

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
    const matched = gadget();
    setText('slotLead', matched ? '找到了：' + matched.name : '找到了');
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
      launchGhost();
      if (callbacks && typeof callbacks.onLifted === 'function') callbacks.onLifted();
      landGhost();
    }, reducedMotion() ? 0 : CONFIG.SLOT_LIFT_MS);
  }

  /**
   * 把中奖格里那张图复制成一个 fixed 替身，挂在 body 上。
   * 挂 body 而不是场景里，是因为它必须活过 u04 → u05 这次切换：
   * 场景切换会把 u04 整个 display:none，挂在里面的替身当场消失。
   */
  function launchGhost() {
    removeGhost();
    const matched = gadget();
    if (!matched || !winnerCell || reducedMotion()) return;
    const rect = winnerCell.getBoundingClientRect();
    if (!rect.width) return;
    const img = document.createElement('img');
    img.className = 'gadget-ghost';
    img.src = matched.image;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.style.left = rect.left + 'px';
    img.style.top = rect.top + 'px';
    img.style.width = rect.width + 'px';
    img.style.height = rect.height + 'px';
    document.body.appendChild(img);
    ghost = img;
  }

  /** u05 已经可见了，这时才量得到目标位置，把替身送过去再撤掉。 */
  function landGhost() {
    if (!ghost) return;
    const target = node('gadgetImage');
    const figure = node('gadgetFigure');
    if (!target) { removeGhost(); return; }
    const to = target.getBoundingClientRect();
    if (!to.width) { removeGhost(); return; }
    const from = ghost.getBoundingClientRect();
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    // 两端都是 object-fit:contain 的方图，真正画出来的边长是**盒子的短边**：
    // 替身那格是宽扁的（约 299×123），落点是正方形（254×254）。
    // 按宽度算比例，替身会停在落点四成大的地方，接手那一下"啪"地涨一截；
    // 按短边算，画出来的道具在交接前后一样大。
    const scale = Math.min(to.width, to.height) / Math.min(from.width, from.height);

    // 目标位先留空，等替身落地再显形，否则同一件道具会同时出现两份。
    if (figure) figure.classList.add('is-arriving');

    const ms = CONFIG.GADGET_FLY_MS;
    ghost.animate([
      { transform: 'translate(0px, 0px) scale(1)' },
      { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')' }
    ], { duration: ms, easing: 'cubic-bezier(.28,.02,.2,1)', fill: 'forwards' });

    ghostTimer = window.setTimeout(function () {
      // 交接顺序不能反：先让真图显形（.match__image 没有淡入过渡，是瞬间的），
      // 下一帧再撤替身。反过来就是"替身没了、真图还在淡入"，中间空掉一瞬，
      // 看上去像道具闪了一下才出现。
      if (figure) figure.classList.remove('is-arriving');
      window.requestAnimationFrame(function () { removeGhost(); });
    }, ms);
  }

  function removeGhost() {
    window.clearTimeout(ghostTimer);
    ghostTimer = 0;
    if (ghost) { ghost.remove(); ghost = null; }
    const figure = node('gadgetFigure');
    if (figure) figure.classList.remove('is-arriving');
  }

  /* ---------------- U5 结果页 ---------------- */

  function renderResult() {
    const matched = gadget();
    if (!matched) return false;
    setText('gadgetName', matched.name);
    // 初稿上是一条「烦恼 × 道具」的算式，不是道具类别；类别放进说明弹窗里。
    const worry = worryText();
    setText('gadgetGroup', worry ? worry + ' × ' + matched.name : matched.group);
    setText('gadgetDesc', matched.description || '');
    const image = node('gadgetImage');
    if (image) {
      image.src = matched.image;
      image.alt = matched.name;
    }
    return true;
  }

  /** 点道具弹出说明。外形整个由 tip-frame.webp 承担，这里只填字。 */
  function showTip() {
    const matched = gadget();
    const modal = node('gadgetTip');
    if (!matched || !modal) return;
    setText('tipName', matched.name);
    setText('tipGroup', '道具类别｜' + matched.group);
    setText('tipDesc', matched.description || '');
    const image = node('tipImage');
    if (image) {
      image.src = matched.image;
      image.alt = matched.name;
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
    const figure = node('gadgetFigure');
    if (figure) figure.focus();
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
    removeGhost();
  }

  function reset() {
    exitSlot();
    exitResult();
    settled = false;
    pulled = false;
    winnerCell = null;
  }

  function mount(handlers) {
    callbacks = handlers || null;
  }

  return {
    mount: mount,
    startSpin: startSpin,
    skipSpin: skipSpin,
    pullLever: pullLever,
    renderResult: renderResult,
    showTip: showTip,
    hideTip: hideTip,
    tipOpen: tipOpen,
    exitSlot: exitSlot,
    exitResult: exitResult,
    reset: reset
  };
})();
