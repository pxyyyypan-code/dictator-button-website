/**
 * level-rating.js —— 第一、二关的星级评定与 2/3 星的道具抽取
 *
 * 只作用于第一、二关。第三关不判通关与否、直接导向结局，
 * 它的三条路径（手动清空 / 超时 / 按钮）在 app.js 里全部直接跳 u11，不经过这里。
 *
 * 星级规则（阈值在 CONFIG.LEVEL_STAR_THRESHOLDS，这里不写死任何秒数）：
 *   没通关 → 0 星，三颗灰星，出口是「再来一次 / 结束体验」；
 *   通关   → 至少 1 星，出口是「进入下一关」；
 *   用时够快 → 2 或 3 星，多一颗「抽取未来道具」，一次机会（3 星不多给）。
 *
 * 用时取 stats.elapsedMs：独裁者按钮按下的瞬间 LevelGame 就把 gameplay 置 false，
 * 计时随即冻结，所以用按钮提前清空拿到的是真实用时，不额外扣星。
 *
 * 抽卡用的是 u04 那台老虎机本体（GadgetMatch.spinReward），不是另做的一套动画。
 * 抽到的道具只进收藏册，不影响下一关的任何能力。
 */
'use strict';

const LevelRating = (function () {
  const LEVEL_CN = ['零', '一', '二', '三'];

  /** @type {number[]} 星星逐颗亮起的定时器 */
  let revealTimers = [];
  /** @type {number[]} 抽卡流程的定时器 */
  let drawTimers = [];
  /** 本次结算的抽卡机会是否已经用掉（2 星和 3 星都只有一次） */
  let drawUsed = false;
  /** 当前这次抽卡抽到的道具，等玩家点「放进收藏夹」时用 */
  let pendingGadget = null;
  let drawing = false;

  function node(name) {
    return document.querySelector('[data-bind="' + name + '"]');
  }

  function setText(name, value) {
    const el = node(name);
    if (el) el.textContent = String(value == null ? '' : value);
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function laterIn(list, fn, ms) {
    const id = window.setTimeout(function () {
      const at = list.indexOf(id);
      if (at >= 0) list.splice(at, 1);
      fn();
    }, Math.max(0, ms));
    list.push(id);
    return id;
  }

  function clearList(list) {
    list.forEach(function (id) { window.clearTimeout(id); });
    list.length = 0;
  }

  function showModal(name) {
    const modal = node(name);
    if (!modal) return;
    modal.classList.add('modal--open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function hideModal(name) {
    const modal = node(name);
    if (!modal) return;
    modal.classList.remove('modal--open');
    modal.setAttribute('aria-hidden', 'true');
  }

  /* ---------------- 评定 ---------------- */

  /**
   * @param {{type:string, level:number}} result GameState 的结算记录
   * @param {{elapsedMs:number}} stats LevelGame 的统计
   * @returns {{stars:number, seconds:number}}
   */
  function evaluate(result, stats) {
    const seconds = Math.max(0, (stats && Number(stats.elapsedMs)) || 0) / 1000;
    if (!result || result.type !== 'pass') return { stars: 0, seconds: seconds };
    const gate = CONFIG.LEVEL_STAR_THRESHOLDS[result.level];
    // 查不到阈值就只给保底的 1 星，别在这里补一套默认秒数——
    // 阈值只许住在 config.js 里（CLAUDE.md）。
    if (!gate) return { stars: 1, seconds: seconds };
    if (seconds <= gate.three) return { stars: 3, seconds: seconds };
    if (seconds <= gate.two) return { stars: 2, seconds: seconds };
    return { stars: 1, seconds: seconds };
  }

  function formatSeconds(seconds) {
    return (Math.round(seconds * 10) / 10).toFixed(1) + ' 秒';
  }

  /* ---------------- 结算卡上的三颗星 ---------------- */

  function starSlots() {
    const box = node('levelStars');
    return box ? Array.prototype.slice.call(box.querySelectorAll('.star-slot')) : [];
  }

  /** 依次亮起，不要一次性全出现：第一颗等 DELAY，之后每颗隔 STAGGER。 */
  function revealStars(stars) {
    clearList(revealTimers);
    const slots = starSlots();
    slots.forEach(function (slot) { slot.classList.remove('is-lit'); });
    const box = node('levelStars');
    if (box) box.setAttribute('aria-label', '三星评定：获得 ' + stars + ' 星');
    if (!stars) return;
    const delay = reducedMotion() ? 0 : CONFIG.STAR_REVEAL_DELAY_MS;
    const stagger = reducedMotion() ? 0 : CONFIG.STAR_REVEAL_STAGGER_MS;
    if (reducedMotion()) {
      // 星星一次性全亮，声音也就只能响一下——
      // 三声叠在同一帧只会糊成一团。
      if (typeof AudioManager !== 'undefined') AudioManager.playSfx('sfx07');
    }
    slots.slice(0, stars).forEach(function (slot, i) {
      laterIn(revealTimers, function () {
        slot.classList.add('is-lit');
        // 每多一颗星音高抬一点（rate 1.00 / 1.09 / 1.18），
        // 同一条素材就能读出「越来越好」的递进感。
        if (!reducedMotion() && typeof AudioManager !== 'undefined') {
          AudioManager.playSfx('sfx07', { rate: 1 + i * 0.09, cooldown: 0 });
        }
      }, delay + i * stagger);
    });
  }

  /**
   * 把星级写进结算卡，并决定露出哪几颗按钮。
   * 0 星走原来的失败分支（再来一次 / 结束体验），1 星走原来的通关分支（进入下一关），
   * 只有 2、3 星多出一颗「抽取未来道具」——这是本次唯一新增的出口。
   */
  function render(result, stats) {
    const rating = evaluate(result, stats);
    drawUsed = false;
    pendingGadget = null;
    drawing = false;
    clearList(drawTimers);

    const modal = node('levelResult');
    if (modal) modal.dataset.stars = String(rating.stars);
    setText('levelResultLabel', '第' + LEVEL_CN[result.level] + '关 · 结算');
    setText('levelResultTime', rating.stars ? formatSeconds(rating.seconds) : '未通关');
    setText('levelResultRating', rating.stars ? rating.stars + ' 星' : '0 星');

    const drawButton = node('levelResultDraw');
    if (drawButton) {
      drawButton.hidden = rating.stars < 2;
      drawButton.disabled = false;
      drawButton.textContent = '抽取未来道具';
    }
    // 2、3 星时主按钮退成次要样式：这一屏真正想让玩家先做的是抽卡。
    const primary = node('levelResultPrimary');
    if (primary) primary.classList.toggle('btn--link', rating.stars >= 2);

    revealStars(rating.stars);
    return rating;
  }

  /* ---------------- 2/3 星的一次抽取 ---------------- */

  function rewardReels() {
    return [node('rewardReelA'), node('rewardReelB'), node('rewardReelC')].filter(Boolean);
  }

  function startDraw() {
    if (drawing || drawUsed) return;
    const winner = Collection.draw();
    if (!winner) {
      // 20 件全收齐了：不再空转一次老虎机，直接说明情况。
      setText('rewardNote', '20 件未来道具已经全部收藏，这次没有新的可抽了。');
      showModal('rewardDraw');
      drawUsed = true;
      markDrawUsed('已全部收藏');
      laterIn(drawTimers, function () { hideModal('rewardDraw'); }, 1600);
      return;
    }
    drawing = true;
    drawUsed = true;
    pendingGadget = winner;
    setText('rewardNote', '已经收藏过的道具不会再次进入抽取池。');
    showModal('rewardDraw');
    markDrawUsed('已抽取');

    GadgetMatch.spinReward({
      reels: rewardReels(),
      winner: winner,
      onSettle: function () {
        laterIn(drawTimers, showReveal, reducedMotion() ? 0 : CONFIG.REWARD_REVEAL_DELAY_MS);
      }
    });
  }

  /** 抽卡机会只有一次：按钮当场失效，别让玩家以为 3 星能抽第二次。 */
  function markDrawUsed(label) {
    const drawButton = node('levelResultDraw');
    if (!drawButton) return;
    drawButton.disabled = true;
    drawButton.textContent = label;
  }

  function showReveal() {
    const item = pendingGadget;
    if (!item) return;
    hideModal('rewardDraw');
    const image = node('rewardRevealImage');
    if (image) {
      image.src = item.image;
      image.alt = item.name;
    }
    setText('rewardRevealName', item.name);
    setText('rewardRevealDesc', item.description || '新的未来道具已经出现，接下来会放进收藏册。');
    showModal('rewardReveal');
  }

  /** 「放进收藏夹」：量好起飞位置再收起展示层，然后交给 Collection 播飞入动画。 */
  function storeReward() {
    const item = pendingGadget;
    if (!item) return;
    pendingGadget = null;
    const image = node('rewardRevealImage');
    const rect = image ? image.getBoundingClientRect() : null;
    hideModal('rewardReveal');
    const from = rect && rect.width
      ? { getBoundingClientRect: function () { return rect; } }
      : null;
    Collection.store(item, from, function () {
      drawing = false;
    });
  }

  /* ---------------- 生命周期 ---------------- */

  function reset() {
    clearList(revealTimers);
    clearList(drawTimers);
    drawUsed = false;
    pendingGadget = null;
    drawing = false;
    GadgetMatch.cancelReward();
    hideModal('rewardDraw');
    hideModal('rewardReveal');
    starSlots().forEach(function (slot) { slot.classList.remove('is-lit'); });
    const drawButton = node('levelResultDraw');
    if (drawButton) {
      drawButton.hidden = true;
      drawButton.disabled = false;
      drawButton.textContent = '抽取未来道具';
    }
    const primary = node('levelResultPrimary');
    if (primary) primary.classList.remove('btn--link');
  }

  return {
    evaluate: evaluate,
    render: render,
    startDraw: startDraw,
    storeReward: storeReward,
    reset: reset
  };
})();
