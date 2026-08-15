/**
 * _slot-assign-check.js —— 老虎机三列分配规律的定点验收。
 *
 * 用法（Playwright 只装在全局）：
 *   NODE_PATH="$(npm root -g)" node assets/dev/_slot-assign-check.js
 *
 * 规格原话：
 *   选 1 条 → 三列都是同一个道具；
 *   选 2 条 → 前两列一个、第三列另一个；
 *   选 3 条 → 三列各一个。
 *
 * _u-flow-smoke.js 只跑 3 条那一档（它要的是一条完整链路），
 * 1 条和 2 条这两档没人守，所以单独拉一个脚本，把三档都跑一遍。
 * 每一档都重新载入页面：老虎机的停位是一次性的，同一页跑两遍会互相污染。
 */
'use strict';

const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const problems = [];
function fail(m) { problems.push(m); console.log('  ✗ ' + m); }
function pass(m) { console.log('  ✓ ' + m); }

/** 每一档期望的三列排法，写成"列 → 第几条烦恼"的下标。 */
const EXPECTED = {
  1: [0, 0, 0],
  2: [0, 0, 1],
  3: [0, 1, 2]
};

async function runCase(browser, count) {
  console.log('\n[' + count + ' 条烦恼]');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  await page.goto(URL);
  // App / SceneManager 是 const，挂在全局词法环境而不是 window 上，
  // 所以别用 window.App 判就绪——等首屏那一页拿到 .scene--active 才是可靠信号。
  await page.waitForSelector('[data-scene="u01"].scene--active');

  await page.evaluate(function () {
    // 粒子每帧都在飘，Playwright 等不到"稳定"；振幅归零不改任何分支。
    CONFIG.WORRY_DRIFT_PX = 0;
    SceneManager.goToId('u03');
  });
  await page.waitForSelector('[data-scene="u03"].scene--active');

  // 从前 count 个大类里各挑第一条，保证 count 条烦恼来自不同大类。
  const categories = page.locator('[data-bind="worryCategories"] [data-action="pick-category"]');
  for (let i = 0; i < count; i += 1) {
    await categories.nth(i).click();
    await page.locator('[data-bind="worrySubs"] [data-action="pick-worry"]').first().click();
  }
  const picked = await page.evaluate(function () { return App.data.selectedWorries.length; });
  if (picked !== count) fail('应选中 ' + count + ' 条，实际 ' + picked + ' 条');

  await page.click('[data-bind="confirmWorry"]');
  await page.waitForSelector('[data-bind="slotLever"].is-ready', { timeout: 12000 });

  const result = await page.evaluate(function () {
    return {
      reels: ['reelA', 'reelB', 'reelC'].map(function (name) {
        const cell = document.querySelector('[data-bind="' + name + '"] .slot__cell.is-winner');
        return cell ? (cell.dataset.gadget || '') : '';
      }),
      gadgets: App.data.matchedGadgets.map(function (g) { return String(g.id); }),
      names: App.data.matchedGadgets.map(function (g) { return g.name; })
    };
  });

  const want = EXPECTED[count].map(function (i) { return result.gadgets[i]; });
  if (result.reels.join(',') !== want.join(',')) {
    fail('三列停位不符：实际 ' + result.reels.join(',') + '，期望 ' + want.join(','));
  } else {
    const distinct = new Set(result.reels).size;
    pass('三列 = ' + EXPECTED[count].map(function (i) { return result.names[i]; }).join(' / ') +
         '（' + distinct + ' 种道具）');
  }

  // 结果页：拨杆拨下去之后，摆出来的件数要等于选中的条数。
  await page.click('[data-bind="slotLever"]');
  await page.waitForSelector('[data-scene="u05"].scene--active', { timeout: 12000 });
  const gallery = await page.evaluate(function () {
    return {
      count: document.querySelector('[data-bind="gadgetGallery"]').dataset.count,
      shown: ['gadgetFigure', 'gadgetFigure2', 'gadgetFigure3'].filter(function (n) {
        return !document.querySelector('[data-bind="' + n + '"]').hidden;
      }).length,
      lines: document.querySelector('[data-bind="gadgetGroup"]').textContent.trim().split('\n').length
    };
  });
  if (gallery.shown !== count || gallery.count !== String(count)) {
    fail('u05 应摆出 ' + count + ' 件，实际 ' + gallery.shown + ' 件（data-count=' + gallery.count + '）');
  } else pass('u05 摆出 ' + count + ' 件道具');
  if (gallery.lines !== count) fail('u05 算式应有 ' + count + ' 行，实际 ' + gallery.lines + ' 行');
  else pass('u05 算式 ' + count + ' 行');

  if (errors.length) errors.forEach(function (e) { fail('页面报错：' + e); });
  await page.close();
}

(async function () {
  console.log('=== 老虎机三列分配规律 ===');
  const browser = await chromium.launch();
  for (const count of [1, 2, 3]) {
    await runCase(browser, count);
  }
  await browser.close();

  console.log('\n=== 结果 ===');
  if (problems.length) {
    console.log('失败 ' + problems.length + ' 项：');
    problems.forEach(function (p) { console.log('  · ' + p); });
    process.exit(1);
  }
  console.log('三档全部通过\n');
})();
