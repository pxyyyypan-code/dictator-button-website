/**
 * _v08-shots.js —— 阶段 3 / 4 视觉层验收：三档分辨率逐页截图，对照 U1~U12 初稿。
 *
 * 用法：
 *   NODE_PATH="$(npm root -g)" node assets/dev/_v08-shots.js
 *
 * 产出：assets/dev/_shots-v08/<宽x高>/u01.png … u12.png
 *
 * 三处刻意的处理：
 *   · 沉浸段（u06~u10）共用一个容器，只靠 phase-* 换装，所以必须**沿真实路径走**、
 *     在每一相拍一张，不能直接 goToId 跳过去——跳过去拍到的是上一相的装扮。
 *   · 空白相（u09 phase-blank）默认只停 CONFIG.BLANK_HOLD_MS，太短拍不到，
 *     这里把它拉长到 6 秒。拉长的是等待，不是分支。
 *   · 阶段 4 起，u02 要逐句点完、u03 有四种版式（散布 / 悬停预览 / 展开列表 / 推测面板）、
 *     u04 停稳后必须拨拨杆才会走到 u05——这些都得**照玩家的路径**走一遍，
 *     不能 goToId 跳过去，否则拍不到真实状态，也验证不了衔接动画。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, '_shots-v08');

const SIZES = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function waitScene(page, id, timeout) {
  await page.waitForFunction(
    function (target) { return document.body.dataset.currentScene === target; },
    id,
    { timeout: timeout || 15000 }
  );
}

async function run() {
  const browser = await chromium.launch();

  for (const size of SIZES) {
    const label = size.width + 'x' + size.height;
    const dir = path.join(OUT, label);
    fs.mkdirSync(dir, { recursive: true });
    console.log('\n=== ' + label + ' ===');

    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', function (e) { errors.push(String(e && e.message || e)); });

    async function shot(name) {
      // 等一帧过渡落定再拍，否则拍到淡入中途。
      await sleep(700);
      await page.screenshot({ path: path.join(dir, name + '.png') });
      console.log('  · ' + name);
    }

    await page.goto(URL);
    await page.waitForFunction(function () { return typeof SceneManager !== 'undefined'; });

    // 无头 Chromium 在**首屏合成之前** document.timeline 一直停在 0，
    // 光 sleep 不会推进它：scene-in 卡在 currentTime=0，整个场景 opacity:0，
    // 拍出来是一张空白纸底（只有 progress 是静态的所以还在）。
    // 这只发生在浏览器起来后的第一个页面，所以以前只有 1366（排第一档）中招，
    // 看着像「窄屏的版式 bug」，其实跟分辨率无关。
    // 连等两帧 rAF 逼出一次真实合成，时间轴才开始走。
    await page.evaluate(function () {
      return new Promise(function (resolve) {
        requestAnimationFrame(function () { requestAnimationFrame(resolve); });
      });
    });

    // 压缩等待、拉长空白相，分支逻辑不改。
    // SLOT_SPIN_MS 刻意**不压**：老虎机的滚动本身是要验收的画面，
    // 压到 900ms 后 shot() 那 700ms 的等待就落在停稳前后，拍到的是哪一帧全看运气。
    await page.evaluate(function () {
      CONFIG.NORMAL_PHASE_MIN_MS = 600;
      CONFIG.NORMAL_PHASE_MAX_MS = 1200;
      CONFIG.NORMAL_DELETE_THRESHOLD = 0;
      CONFIG.BUTTON_UNLOCK_MIN_DURATION_MS = 600;
      CONFIG.BUTTON_UNLOCK_MIN_ATTEMPTS = 0;
      CONFIG.BUTTON_UNLOCK_BUBBLE_MIN = 0;
      CONFIG.BLANK_TITLE_VISIBLE_MS = 2000;
      CONFIG.BLANK_HOLD_MS = 6000;      // 拉长，否则空白相拍不到
      CONFIG.RETURN_INITIAL_DELAY_MS = 200;
      CONFIG.RETURN_INTERVAL_MS = 160;
      CONFIG.RETURN_COPY_DELAY_MS = 200;
      CONFIG.THEME_MIN_READ_MS = 200;
      // 逐句推进的最小停留是防连点用的，脚本里连点正是我们要做的事。
      CONFIG.DIALOGUE_LINE_MS = 0;
    });

    await waitScene(page, 'u01');
    await shot('u01');

    await page.click('[data-scene="u01"] .intro-card');
    await waitScene(page, 'u02');
    await shot('u02');

    // 逐句点到底。中途在「独裁者按钮」那一轮停一下——剧情提示是这一页新加的东西，
    // 而且它必须是**按不下去**的，得单独拍一张看清楚。
    // CONFIG 是页内的全局，Node 这边读不到，取回来再用。
    const cueRound = await page.evaluate(function () { return CONFIG.DIALOGUE_CUE_ROUND; });
    for (let i = 1; i < cueRound; i += 1) {
      await page.click('[data-bind="dialogueNext"]');
    }
    await shot('u02-cue');
    for (let i = 0; i < 40; i += 1) {
      if (await page.evaluate(function () { return Dialogue.isLast(); })) break;
      await page.click('[data-bind="dialogueNext"]');
    }
    await shot('u02-last');           // 末句：主按钮应该已经变成「去选择烦恼」

    await page.click('[data-bind="dialogueNext"]');
    await waitScene(page, 'u03');
    // u03 有四种版式，一张都不能少：
    //   idle 散布 → hover 居中放大+白雾 → 展开完整列表 → 选中态
    await shot('u03-idle');

    const particles = page.locator('[data-bind="worryCategories"] [data-action="pick-category"]');
    // force:true：粒子悬停后会飞到画面中央，Playwright 默认的"元素静止"检查会一直重试。
    await particles.first().hover({ force: true });
    await shot('u03-hover');

    /**
     * 点开第 index 个大类。
     *
     * 这里刻意**不走指针**：粒子被悬停后会飞到画面正中，鼠标就落在它原来的位置上了，
     * 于是 pointerout → 失焦飞回来 → 又被悬停 → 再飞走，来回震荡，
     * Playwright 的「元素静止」检查永远等不到头（1366 那一档就是卡在这儿超时的）。
     * 直接让元素自己 click()，事件照样冒泡到 app.js 的委托监听，
     * 落到的 DOM 状态和真人点一模一样——而悬停预览那张照片，
     * 上面已经用真实 hover 拍过了，没有漏掉的态。
     */
    async function openCategory(index) {
      await page.evaluate(function (i) {
        document.querySelectorAll('[data-bind="worryCategories"] [data-action="pick-category"]')[i].click();
      }, index);
      await sleep(500);   // 等飞到中央 + 列表展开的过渡走完
    }

    // 自由输入 → 本地词表推测 → 推测面板。自由输入本身也算一条选择，
    // 所以退出面板走的是「返回继续选」（只收面板），不是「清空重选」——
    // 后者会把这一条连同后面挑的一起抹掉，也就拍不到多选的版式了。
    await page.fill('#worry-text', '最近总担心考试考不好');
    await page.click('[data-action="classify-worry"]');
    await shot('u03-classify');
    await page.click('.classify-panel [data-action="worry-back"]');

    await openCategory(0);
    await shot('u03-expanded');       // 完整列表 + 左侧「← 返回全部类别」
    await page.locator('[data-bind="worrySubs"] [data-action="pick-worry"]').first().click();
    await shot('u03');                // 两条：确认键文案变成「确认这 2 条烦恼」

    // 再挑一条凑满 3 条，这是版面压力最大的一档：
    // 提示行最长、确认键最宽，u05 与 u11 也要摆三件道具。
    // 换大类先按返回键退回粒子场——这正是玩家的走法，也顺带证明返回键真的能用。
    await page.click('[data-bind="worrySubs"] [data-action="worry-back"]');
    await openCategory(1);
    await page.locator('[data-bind="worrySubs"] [data-action="pick-worry"]').first().click();
    await shot('u03-max');

    // 确认 → 米白标签沿弧线飞进四次元口袋 → u04
    await page.click('[data-bind="confirmWorry"]');
    await waitScene(page, 'u04');
    await shot('u04-spin');           // 三列滚动中（SLOT_SPIN_MS 默认 2400，700ms 时必在途中）

    // 阶段 4 起，u05 不再自动到达：必须等拨杆浮出来再拨下去。
    await page.waitForSelector('.slot__lever.is-ready', { timeout: 15000 });
    await shot('u04');                // 停稳 + 拨杆
    await page.click('[data-bind="slotLever"]');

    await waitScene(page, 'u05');
    // 等替身落地撤走再拍，否则 700ms 正好卡在交接那一帧上。
    await page.waitForSelector('.gadget-ghost', { state: 'detached', timeout: 6000 })
      .catch(function () {});
    await shot('u05');
    await page.click('[data-bind="gadgetFigure"]');
    await shot('u05-tip');            // tip-frame.webp 弹窗：叠上去的字要对齐素材画好的框
    await page.click('.tip-frame__ok');

    await page.click('[data-scene="u05"] [data-action="next"]');
    await waitScene(page, 'u06');
    await shot('u06');

    await waitScene(page, 'u07', 12000);
    await shot('u07');

    await waitScene(page, 'u08', 12000);
    await page.waitForFunction(function () {
      const b = document.querySelector('[data-bind="inlineButton"]');
      return b && !b.disabled;
    }, null, { timeout: 12000 });
    await shot('u08');

    await page.click('[data-bind="inlineButton"]');
    await waitScene(page, 'u09', 12000);
    // 等 phase 真正切到 blank 再拍：erasing 阶段画面还没空。
    await page.waitForFunction(function () {
      const s = document.querySelector('[data-scene="u06"]');
      return s && s.classList.contains('phase-blank');
    }, null, { timeout: 12000 }).catch(function () {});
    await shot('u09');

    await waitScene(page, 'u10', 15000);
    await page.waitForSelector('.return-choice.is-visible', { timeout: 15000 }).catch(function () {});
    await shot('u10');

    await page.click('[data-action="return-stop"]');
    await waitScene(page, 'u11');
    await shot('u11');

    await page.click('[data-scene="u11"] [data-action="next"]');
    await waitScene(page, 'u12');
    await shot('u12');

    if (errors.length) console.log('  ✗ 页面报错：' + errors.join(' | '));
    await page.close();
  }

  await browser.close();
  console.log('\n完成 → ' + OUT);
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
