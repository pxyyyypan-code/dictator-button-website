/**
 * _u-flow-smoke.js —— 阶段 2 骨架层验收：u01→u12 全流程走通，控制台零报错。
 *
 * 用法（Playwright 只装在全局）：
 *   NODE_PATH="$(npm root -g)" node assets/dev/_u-flow-smoke.js
 *
 * 它做的是**真实点击**，不是直接调 goToId——只有真实路径才能证明
 * 「确认烦恼→匹配道具→泡泡场」这条链路上的数据是通的。
 * 沉浸段的等待时长通过改写 CONFIG 压缩，流程分支本身不变。
 */
'use strict';

const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const EXPECTED_SCENES = ['u01', 'u02', 'u03', 'u04', 'u05', 'u06',
                         'u07', 'u08', 'u09', 'u10', 'u11', 'u12'];

/** u02 逐句推进时两次点击的间隔，要大于 CONFIG.DIALOGUE_LINE_MS 的最小停留。 */
const CONFIG_DIALOGUE_WAIT_MS = 750;

const problems = [];
const visited = [];

function fail(message) {
  problems.push(message);
  console.log('  ✗ ' + message);
}

function pass(message) {
  console.log('  ✓ ' + message);
}

async function sceneOf(page) {
  return page.evaluate(function () { return document.body.dataset.currentScene || ''; });
}

/** 等到 body[data-current-scene] 变成期望值；顺带记录经过的节点。 */
async function waitScene(page, id, timeout) {
  try {
    await page.waitForFunction(
      function (target) { return document.body.dataset.currentScene === target; },
      id,
      { timeout: timeout || 15000 }
    );
  } catch (err) {
    fail('停在 ' + (await sceneOf(page)) + '，没能进入 ' + id);
    throw new Error('flow-stalled-at-' + id);
  }
  if (visited[visited.length - 1] !== id) visited.push(id);
  pass('到达 ' + id);
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  page.on('console', function (msg) {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleErrors.push('[' + msg.type() + '] ' + msg.text());
    }
  });
  page.on('pageerror', function (err) {
    consoleErrors.push('[pageerror] ' + (err && err.message ? err.message : String(err)));
  });

  console.log('\n=== u01~u12 骨架流程冒烟 ===\n');
  console.log('打开 ' + URL + '\n');
  await page.goto(URL);
  await page.waitForFunction(function () { return typeof SceneManager !== 'undefined'; });

  /* ---- 0. 静态结构 ---- */
  console.log('[0] 静态结构');
  const structure = await page.evaluate(function () {
    const sections = Array.from(document.querySelectorAll('[data-scene]'))
      .map(function (n) { return n.getAttribute('data-scene'); });
    const binds = Array.from(document.querySelectorAll('[data-bind]'))
      .map(function (n) { return n.getAttribute('data-bind'); });
    const dupes = binds.filter(function (name, i) { return binds.indexOf(name) !== i; });
    return {
      sections: sections,
      dupes: Array.from(new Set(dupes)),
      canvasCount: document.querySelectorAll('[data-canvas="experience"]').length,
      isCanvas: document.querySelector('[data-canvas="experience"]') instanceof HTMLCanvasElement,
      strayCanvas: document.querySelectorAll('canvas').length,
      flow: SCENE_FLOW.map(function (s) { return s.id; }),
      viewIds: SCENE_FLOW.map(function (s) { return s.viewId || s.id; })
    };
  });

  if (structure.canvasCount !== 1) fail('[data-canvas="experience"] 应恰好 1 个，实际 ' + structure.canvasCount);
  else pass('canvas 唯一');
  if (!structure.isCanvas) fail('[data-canvas="experience"] 不是真的 <canvas>——mount 会直接抛异常');
  if (structure.strayCanvas !== 1) fail('页面里有 ' + structure.strayCanvas + ' 个 canvas，单例只能挂一个');
  if (structure.dupes.length) fail('data-bind 重名（querySelector 只取第一个）：' + structure.dupes.join(', '));
  else pass('data-bind 全局唯一');
  if (structure.flow.join(',') !== EXPECTED_SCENES.join(',')) {
    fail('SCENE_FLOW 顺序不对：' + structure.flow.join(','));
  } else pass('SCENE_FLOW = u01..u12');
  // u07~u10 不该有自己的 section，必须靠 viewId 指回 u06。
  ['u07', 'u08', 'u09', 'u10'].forEach(function (id) {
    if (structure.sections.includes(id)) fail(id + ' 不应有独立 section（应 viewId→u06）');
    const idx = structure.flow.indexOf(id);
    if (structure.viewIds[idx] !== 'u06') fail(id + ' 的 viewId 不是 u06');
  });
  if (!problems.length) pass('u07~u10 正确别名到 u06');

  /* ---- 压缩沉浸段的等待，分支逻辑不改 ---- */
  await page.evaluate(function () {
    CONFIG.NORMAL_PHASE_MIN_MS = 300;
    CONFIG.NORMAL_PHASE_MAX_MS = 900;
    CONFIG.NORMAL_DELETE_THRESHOLD = 0;
    CONFIG.BUTTON_UNLOCK_MIN_DURATION_MS = 300;
    CONFIG.BUTTON_UNLOCK_MIN_ATTEMPTS = 0;
    CONFIG.BUTTON_UNLOCK_BUBBLE_MIN = 0;
    CONFIG.BLANK_TITLE_VISIBLE_MS = 100;
    CONFIG.BLANK_HOLD_MS = 400;
    CONFIG.RETURN_INITIAL_DELAY_MS = 120;
    CONFIG.RETURN_INTERVAL_MS = 120;
    CONFIG.RETURN_COPY_DELAY_MS = 150;
    CONFIG.SLOT_SPIN_MS = 300;
    CONFIG.THEME_MIN_READ_MS = 200;
    // 粒子每帧都在飘，Playwright 的「等元素稳定下来」永远等不到。
    // 振幅归零后 rAF 循环照跑（分支逻辑不变），只是每帧写的都是 0。
    CONFIG.WORRY_DRIFT_PX = 0;
  });

  /* ---- 1. u01 → u03 ---- */
  console.log('\n[1] 前半段');
  await waitScene(page, 'u01');
  await page.click('[data-scene="u01"] .intro-card');
  await waitScene(page, 'u02');
  // u02 是逐句推进的，主按钮要点到最后一句才翻页。
  // DIALOGUE_LINE_MS 有最小停留，点太快会被忽略，所以每次都等一等。
  for (let i = 0; i < 12; i += 1) {
    const scene = await page.evaluate(function () { return document.body.dataset.currentScene; });
    if (scene !== 'u02') break;
    await page.click('[data-scene="u02"] [data-action="next"]');
    await page.waitForTimeout(CONFIG_DIALOGUE_WAIT_MS);
  }
  await waitScene(page, 'u03');

  /* ---- 2. u03 选烦恼（1~3 条多选 + 返回全部类别）---- */
  const categoryCount = await page.locator('[data-bind="worryCategories"] [data-action="pick-category"]').count();
  if (categoryCount !== 9) fail('烦恼大类应为 9 个，实际 ' + categoryCount);
  else pass('9 个烦恼大类已渲染');

  const categories = page.locator('[data-bind="worryCategories"] [data-action="pick-category"]');
  await categories.nth(0).click();
  const subCount = await page.locator('[data-bind="worrySubs"] [data-action="pick-worry"]').count();
  if (subCount < 1) fail('选中大类后没有出现细分烦恼');
  else pass('细分烦恼 ' + subCount + ' 条');

  // 展开态必须有一条回粒子场的出口，否则玩家点进一个大类就出不来了。
  const backCount = await page.locator('[data-bind="worrySubs"] [data-action="worry-back"]').count();
  if (backCount !== 1) fail('展开列表里没有「返回全部类别」，实际 ' + backCount + ' 个');
  else pass('展开列表带返回键');
  await page.click('[data-bind="worrySubs"] [data-action="worry-back"]');
  const stillExpanded = await page.evaluate(function () {
    return document.querySelector('[data-scene="u03"]').classList.contains('is-expanded');
  });
  if (stillExpanded) fail('点了返回键，u03 仍停在展开态');
  else pass('返回键回到粒子场');

  // 跨三个大类各挑一条，验证「最多 3 条、换类不清空、第 4 条不顶替」。
  async function pickFrom(index) {
    await categories.nth(index).click();
    await page.locator('[data-bind="worrySubs"] [data-action="pick-worry"]').first().click();
    return page.evaluate(function () { return App.data.selectedWorries.length; });
  }
  const after1 = await pickFrom(0);
  const after2 = await pickFrom(1);
  const after3 = await pickFrom(2);
  const after4 = await pickFrom(3);
  if (after1 !== 1 || after2 !== 2 || after3 !== 3) {
    fail('多选没累加：依次拿到 ' + after1 + '/' + after2 + '/' + after3 + ' 条');
  } else pass('跨大类累计选到 3 条');
  if (after4 !== 3) fail('选满 3 条后第 4 条不该被收下，实际 ' + after4 + ' 条');
  else pass('第 4 条被挡住，且没有顶替已选');

  // 再点一次已选中的那条 = 取消。
  await categories.nth(2).click();
  await page.locator('[data-bind="worrySubs"] [data-action="pick-worry"]').first().click();
  const afterToggle = await page.evaluate(function () { return App.data.selectedWorries.length; });
  if (afterToggle !== 2) fail('再点已选条目应取消，实际剩 ' + afterToggle + ' 条');
  else pass('重复点击可取消');
  await pickFrom(2);   // 补回第 3 条，后面按 3 条走完整条流程

  const confirmDisabled = await page.locator('[data-bind="confirmWorry"]').isDisabled();
  if (confirmDisabled) fail('选好烦恼后「确认」仍是禁用的');
  else pass('确认按钮已解锁');
  const confirmLabel = await page.locator('[data-bind="confirmWorry"]').textContent();
  if (!/3\s*条/.test(confirmLabel)) fail('确认键文案没跟上条数：' + confirmLabel);
  else pass('确认键文案：' + confirmLabel.trim());

  await page.click('[data-bind="confirmWorry"]');

  /* ---- 3. u04 老虎机 → u05 结果 ---- */
  await waitScene(page, 'u04');
  const reelPool = await page.evaluate(function () {
    return GadgetData.reelPool(1).length;
  });
  if (reelPool !== 21) fail('滚轮池应为 20 道具 + 1 空位 = 21 格，实际 ' + reelPool);
  else pass('滚轮池 21 格');

  // 三条烦恼 → 三列各停一个不同的道具（规格里的分配规律）。
  await page.waitForSelector('[data-bind="slotLever"].is-ready', { timeout: 8000 });
  const winners = await page.evaluate(function () {
    return ['reelA', 'reelB', 'reelC'].map(function (name) {
      const cell = document.querySelector('[data-bind="' + name + '"] .slot__cell.is-winner');
      return cell ? (cell.dataset.gadget || '') : '';
    });
  });
  const wantIds = await page.evaluate(function () {
    return App.data.matchedGadgets.map(function (g) { return String(g.id); });
  });
  if (winners.some(function (id) { return !id; })) {
    fail('三列没有都标出中奖格：' + JSON.stringify(winners));
  } else if (winners.join(',') !== wantIds.join(',')) {
    fail('三列停位与匹配到的道具对不上：列=' + winners.join(',') + ' 期望=' + wantIds.join(','));
  } else pass('三列分别停在 3 件道具上');

  // 拨杆是规格里明写的衔接动作，u04→u05 只有这一条路。
  await page.click('[data-bind="slotLever"]');
  await waitScene(page, 'u05', 8000);
  const match = await page.evaluate(function () {
    return {
      name: document.querySelector('[data-bind="gadgetName"]').textContent.trim(),
      group: document.querySelector('[data-bind="gadgetGroup"]').textContent.trim(),
      desc: document.querySelector('[data-bind="gadgetDesc"]').textContent.trim(),
      img: document.querySelector('[data-bind="gadgetImage"]').getAttribute('src'),
      count: document.querySelector('[data-bind="gadgetGallery"]').dataset.count,
      shown: ['gadgetFigure', 'gadgetFigure2', 'gadgetFigure3'].filter(function (n) {
        return !document.querySelector('[data-bind="' + n + '"]').hidden;
      }).length,
      worryCount: App.data.worries.length
    };
  });
  if (!match.name) fail('u05 没有写出道具名');
  else pass('匹配到道具：' + match.name + '（' + match.group.replace(/\n/g, ' / ') + '）');
  if (!match.desc) fail('u05 道具说明为空');
  if (!match.img) fail('u05 道具图片 src 为空');
  if (match.shown !== 3 || match.count !== '3') {
    fail('u05 应摆出 3 件道具，实际显示 ' + match.shown + ' 件（data-count=' + match.count + '）');
  } else pass('u05 三件道具全部在场');
  if (match.worryCount < 2) fail('送进泡泡场的烦恼只有 ' + match.worryCount + ' 条，同类兄弟没填上');
  else pass('泡泡场烦恼 ' + match.worryCount + ' 条');

  await page.click('[data-scene="u05"] [data-action="next"]');

  /* ---- 4. u06 沉浸段 ---- */
  console.log('\n[2] 沉浸段');
  await waitScene(page, 'u06');

  // 最致命的一条：canvas 挂载时尺寸 <2px 会让循环起不来，且完全静默。
  const canvasState = await page.evaluate(function () {
    const c = document.querySelector('[data-canvas="experience"]');
    const rect = c.getBoundingClientRect();
    const snap = BubbleGame.getDebugSnapshot ? BubbleGame.getDebugSnapshot() : {};
    const style = window.getComputedStyle(c);
    return {
      w: Math.round(rect.width), h: Math.round(rect.height),
      bitmapW: c.width, bitmapH: c.height,
      bubbles: BubbleGame.getBubbleCount(),
      running: snap.running,
      border: style.borderWidth, padding: style.padding, display: style.display
    };
  });
  if (canvasState.w < 2 || canvasState.h < 2) {
    fail('canvas 布局尺寸 ' + canvasState.w + '×' + canvasState.h + '，动画循环起不来');
  } else pass('canvas 尺寸 ' + canvasState.w + '×' + canvasState.h);
  if (!canvasState.bitmapW) fail('canvas 位图尺寸为 0，resizeCanvas 提前 return 了');
  if (canvasState.bubbles < 1) fail('u06 一个泡泡都没有');
  else pass('泡泡 ' + canvasState.bubbles + ' 个');
  if (canvasState.running === false) fail('动画循环没有运行（running=false）');
  if (parseFloat(canvasState.border) > 0) fail('canvas 有 border，点击坐标会整体偏移');
  if (canvasState.display !== 'block') fail('canvas 的 display 是 ' + canvasState.display + '，应为 block');

  const interactive = await page.evaluate(function () {
    const s = BubbleGame.getDebugSnapshot ? BubbleGame.getDebugSnapshot() : {};
    return s.interactive;
  });
  if (interactive === false) fail('u06 泡泡不可点击——init 之后漏了 setInteractive(true)');
  else pass('u06 可交互');

  await waitScene(page, 'u07', 8000);
  await waitScene(page, 'u08', 8000);

  const buttonReady = await page.locator('[data-bind="inlineButton"]').isEnabled();
  if (!buttonReady) fail('u08 独裁者按钮没有解锁');
  else pass('独裁者按钮已解锁');
  await page.click('[data-bind="inlineButton"]');

  await waitScene(page, 'u09', 8000);
  await waitScene(page, 'u10', 10000);

  /* ---- 5. u10 出口 ---- */
  await page.waitForSelector('.return-choice.is-visible', { timeout: 10000 }).catch(function () {
    fail('u10 的出口面板没有出现——这是通往 u11 的唯一路径，会永久卡死');
  });
  const returnInteractive = await page.evaluate(function () {
    const s = BubbleGame.getDebugSnapshot ? BubbleGame.getDebugSnapshot() : {};
    return s.interactive;
  });
  if (returnInteractive === true) fail('u10 的泡泡仍可点击，规格要求不可点');
  else pass('u10 泡泡不可点击');

  await page.click('[data-action="return-stop"]');

  /* ---- 6. u11 / u12 ---- */
  console.log('\n[3] 结尾段');
  await waitScene(page, 'u11');
  const summary = await page.evaluate(function () {
    return {
      worry: document.querySelector('[data-bind="summaryWorry"]').textContent.trim(),
      text: document.querySelector('[data-bind="summaryText"]').textContent.trim(),
      tag: document.querySelector('[data-bind="pocketTag"]').textContent.trim(),
      count: document.querySelector('[data-bind="pocketStack"]').dataset.count,
      shown: ['pocketGadget', 'pocketGadget2', 'pocketGadget3'].filter(function (n) {
        return !document.querySelector('[data-bind="' + n + '"]').hidden;
      }).length
    };
  });
  if (!summary.worry) fail('u11 没有写出玩家选择的烦恼');
  else pass('u11 总结对象：' + summary.worry);
  if (!summary.text) fail('u11 总结正文为空——summaryFor 没取到数据');
  else pass('u11 总结正文 ' + summary.text.length + ' 字');
  if (summary.shown !== 3 || summary.count !== '3') {
    fail('u11 口袋应摆出 3 件道具，实际 ' + summary.shown + ' 件（data-count=' + summary.count + '）');
  } else pass('u11 口袋三件道具：' + summary.tag);

  await page.waitForSelector('[data-bind="summaryNext"]:not([disabled])', { timeout: 5000 });
  await page.click('[data-bind="summaryNext"]');

  await waitScene(page, 'u12');
  const logCount = await page.locator('[data-bind="logNodes"] .log-node').count();
  if (logCount !== 5) fail('u12 时间线应为 5 个节点，实际 ' + logCount);
  else pass('u12 时间线 5 节点');

  /* ---- 7. 重新开始 ---- */
  console.log('\n[4] 重新开始');
  await page.click('[data-scene="u12"] [data-action="restart"]');
  await waitScene(page, 'u01');
  const afterRestart = await page.evaluate(function () {
    return {
      worries: App.data.worries.length,
      selected: App.data.selectedWorries.length,
      bubbles: BubbleGame.getBubbleCount()
    };
  });
  if (afterRestart.worries || afterRestart.selected || afterRestart.bubbles) {
    fail('restart 没清干净：worries=' + afterRestart.worries +
         ' selected=' + afterRestart.selected + ' bubbles=' + afterRestart.bubbles);
  } else pass('状态已清空');

  await browser.close();

  /* ---- 汇总 ---- */
  console.log('\n=== 结果 ===');
  console.log('经过节点：' + visited.join(' → '));
  const missing = EXPECTED_SCENES.filter(function (id) { return !visited.includes(id); });
  if (missing.length) fail('没走到的节点：' + missing.join(', '));

  if (consoleErrors.length) {
    console.log('\n控制台报错 / 警告 ' + consoleErrors.length + ' 条：');
    consoleErrors.forEach(function (line) { console.log('  ' + line); });
    problems.push('控制台有 ' + consoleErrors.length + ' 条 error/warning');
  } else {
    console.log('控制台：干净');
  }

  if (problems.length) {
    console.log('\n失败 ' + problems.length + ' 项：');
    problems.forEach(function (p) { console.log('  · ' + p); });
    process.exit(1);
  }
  console.log('\n阶段 2 骨架层：通过\n');
}

run().catch(function (err) {
  console.error('\n冒烟中断：' + err.message);
  if (problems.length) problems.forEach(function (p) { console.error('  · ' + p); });
  process.exit(1);
});
