/**
 * _v08-shots.js —— 阶段 3 视觉层验收：三档分辨率逐页截图，对照 U1~U12 初稿。
 *
 * 用法：
 *   NODE_PATH="$(npm root -g)" node assets/dev/_v08-shots.js
 *
 * 产出：assets/dev/_shots-v08/<宽x高>/u01.png … u12.png
 *
 * 两处刻意的处理：
 *   · 沉浸段（u06~u10）共用一个容器，只靠 phase-* 换装，所以必须**沿真实路径走**、
 *     在每一相拍一张，不能直接 goToId 跳过去——跳过去拍到的是上一相的装扮。
 *   · 空白相（u09 phase-blank）默认只停 CONFIG.BLANK_HOLD_MS，太短拍不到，
 *     这里把它拉长到 6 秒。拉长的是等待，不是分支。
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
      CONFIG.SLOT_SPIN_MS = 900;
      CONFIG.THEME_MIN_READ_MS = 200;
    });

    await waitScene(page, 'u01');
    await shot('u01');

    await page.click('[data-scene="u01"] .intro-card');
    await waitScene(page, 'u02');
    await shot('u02');

    await page.click('[data-scene="u02"] [data-action="next"]');
    await waitScene(page, 'u03');
    // 先拍未选中的散布态，再选一个拍放大态——两种版式都要看。
    await shot('u03-idle');
    await page.locator('[data-bind="worryCategories"] [data-action="pick-category"]').first().click();
    await page.locator('[data-bind="worrySubs"] [data-action="pick-worry"]').first().click();
    await shot('u03');

    await page.click('[data-bind="confirmWorry"]');
    await waitScene(page, 'u04');
    await shot('u04');

    await waitScene(page, 'u05');
    await shot('u05');

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
