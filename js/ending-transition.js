/**
 * ending-transition.js —— 第三关 → 结局1「远去」的连续过渡
 *
 * 立意：这不是失败结局。要说的是「有些烦恼不一定需要一直消除；当不再紧紧
 * 抓住它，换一个角度，它也可能自己慢慢远去」。情绪线是
 *   拥挤 → 松开 → 漂浮 → 远离 → 安静 → 释然。
 * 所以整段没有爆裂、没有红色警报、没有失控逃跑，也**不新建结局页面**——
 * 终点就是网站里已经存在的那个 u11 [data-ending="1"]。
 *
 * ── 为什么需要这个模块 ──────────────────────────────────────
 * SceneManager 切场景是硬切：renderVisibility() 翻的是 .scene--active，
 * 对应 display:none → grid，全站没有跨场景的交叉淡入。直接 goToId('u11')
 * 就会「关卡画面啪一下变成结局页」。
 *
 * 这里的做法是把硬切藏起来：
 *   1. 先给 u11 加 .is-arriving —— display:grid + opacity:0 + z-index 抬高，
 *      并且整页预先向上偏移，结局页此刻已经**排好版但看不见**；
 *   2. canvas 那边交给 LevelGame.playFarewell()：扎口松开，泡泡一颗接一颗
 *      挤出袋口向上浮走；袋子空了失去支撑，往下掉出画面；镜头跟着泡泡上抬，
 *      青蓝色从画面上方漫下来；
 *   3. 结局页从上方滑入并淡入（.is-lit）——滑入方向和镜头、泡泡一致，
 *      都是向上，所以两屏是同一个运动的两段，不是两个独立的动画；
 *   4. 最后才真正 goToId('u11')。切换发生在两屏一模一样的那一帧，看不见。
 *
 * 这里不再量结局页麻袋的位置：canvas 上的袋子是掉出画面的，不和结局页的
 * 线稿对接，也就没有「缩到哪儿去」这个问题。
 *
 * SceneManager 本身一行没改：这个模块只操作 u11 那个 <section> 的 class，
 * 另外 11 个节点的行为完全不受影响。
 *
 * 所有时长在 config.js 的 ENDING1_*，这里不写裸数字。
 */
'use strict';

const EndingTransition = (function () {
  const T = typeof CONFIG !== 'undefined' ? CONFIG : {};

  let active = false;

  function reducedMotion() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function gameScene() { return document.querySelector('[data-scene="u06"]'); }
  function endingScene() { return document.querySelector('[data-scene="u11"]'); }

  function timer(fn, delay) {
    if (typeof SceneManager !== 'undefined' && typeof SceneManager.addTimer === 'function') {
      // 走 SceneManager 的定时器池：重新开始时 clearTimers() 一次全清，
      // 不会留下一个「过几秒自己跳到结局页」的幽灵回调。
      SceneManager.addTimer(fn, delay);
      return;
    }
    setTimeout(fn, delay);
  }

  /**
   * @param {{fillCopy: function, commit: function}} hooks
   *   fillCopy —— 把结局1的文案填进 u11（app.js 的 fillEnding）。
   *               要在挂 .is-arriving 之前调：它会写 data-ending="1"，
   *               而结局页的一部分样式挂在这个属性上。
   *   commit   —— 真正切场景（app.js 里就是 SceneManager.goToId('u11')）。
   */
  function play(hooks) {
    const opts = hooks || {};
    const scene = gameScene();
    const ending = endingScene();
    const done = typeof opts.commit === 'function' ? opts.commit : function () {};

    if (!scene || !ending || active) {
      done();
      return;
    }
    active = true;

    if (typeof opts.fillCopy === 'function') opts.fillCopy();

    // 1. HUD、收藏夹、独裁者按钮淡出。只动 opacity——
    //    canvas 及其祖先在 u06~u10 期间不得 display:none（CLAUDE.md）。
    scene.classList.add('is-farewell');
    document.body.classList.add('is-ending-transition');

    // 结局页先「铺开但不可见」，停在画面上方等着被镜头带下来。
    ending.classList.add('is-arriving');

    if (reducedMotion()) {
      // 减少动态：不做位移、不做漂浮，只留一次短交叉淡入。
      const fast = Number(T.ENDING1_REDUCED_MS) || 420;
      requestAnimationFrame(function () { ending.classList.add('is-lit'); });
      timer(function () { commit(ending, scene, done); }, fast);
      return;
    }

    // 读一次布局，逼浏览器把 .is-arriving 的 display:grid 和起始位移结算掉，
    // 否则下面加 .is-lit 时浏览器会把两个 class 合成一帧，滑入根本不发生。
    void ending.offsetWidth;

    // 2/3/4. 泡泡挤出袋口向上浮、空袋下坠、镜头上抬、米白转青蓝——
    //        全在同一块 canvas 上，交给 LevelGame 一帧一帧推。
    LevelGame.playFarewell();

    // 5. 结局页从上方滑入并淡入：哆啦A梦从右下轻轻进场，左侧文案错峰出现。
    timer(function () { ending.classList.add('is-lit'); },
      Number(T.ENDING1_VEIL_START_MS) || 4700);

    timer(function () { commit(ending, scene, done); },
      Number(T.ENDING1_TOTAL_MS) || 5900);
  }

  /**
   * 真正切场景。此刻 u11 已经 opacity:1 盖在上面，goToId 只是把底下那层
   * 关掉，画面不会跳。
   *
   * .is-arriving 要一直留到离开 u11 才摘：它带 animation:none，
   * 用来压住 .scene--ending.scene--active 自带的 fade-in——
   * 提前摘掉会让结局页在切换那一刻又重新淡入一次，反而闪一下。
   * 摘除统一在 reset() 里做（u11 的 onExit / restart）。
   */
  function commit(ending, scene, done) {
    done();
    ending.classList.add('is-committed');
    scene.classList.remove('is-farewell');
    document.body.classList.remove('is-ending-transition');
    active = false;
  }

  /** 离开 u11 或重新开始时调用：把三个临时 class 全部摘干净。 */
  function reset() {
    const scene = gameScene();
    const ending = endingScene();
    if (scene) scene.classList.remove('is-farewell');
    if (ending) ending.classList.remove('is-arriving', 'is-lit', 'is-committed');
    document.body.classList.remove('is-ending-transition');
    active = false;
  }

  function isPlaying() { return active; }

  return { play: play, reset: reset, isPlaying: isPlaying };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = EndingTransition;
