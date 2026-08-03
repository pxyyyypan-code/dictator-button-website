/**
 * _smoke-test.js —— 临时验证脚本（测试后删除，非交付文件）
 * 原 31 项：走通 UX-01 ~ UX-14 + 异常/边界路径 + 控制台检查。
 *
 * 注意：以 reducedMotion:'reduce' 启动（情绪化 UI 后动画使 headless
 * 点击等待变慢；按需求 reduce 模式仅保留简单淡入淡出，DOM/状态行为
 * 不变，27 项断言不受影响）。动画本身由 _diag.js 单独验证。
 */
const { chromium } = require('playwright');
const path = require('path');

const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const errors = [];
const results = [];

function check(name, pass, detail) {
  results.push({ name, pass, detail: detail || '' });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce'
  });

  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(URL);

  const activeScene = () => page.getAttribute('.scene--active', 'data-scene');
  const btn = (scene, action) => `[data-scene="${scene}"] [data-action="${action}"]`;

  check('UX-01 初始场景', (await activeScene()) === 'ux-01', await activeScene());

  // 正常路径 UX-01 -> UX-03
  await page.click(btn('ux-01', 'next'));
  check('UX-02 可达', (await activeScene()) === 'ux-02', await activeScene());
  await page.click(btn('ux-02', 'next'));
  check('UX-03 可达', (await activeScene()) === 'ux-03', await activeScene());
  await page.click(btn('ux-03', 'next'));
  check('UX-04 可达', (await activeScene()) === 'ux-04', await activeScene());

  // 异常：空输入
  await page.click(btn('ux-04', 'add-worry'));
  const emptyHint = await page.textContent('[data-bind="worryHint"]');
  check('空输入有提示', emptyHint.includes('补充'), emptyHint);
  const worriesAfterEmpty = await page.evaluate(() => appData.worries.length);
  check('空输入未入数组', worriesAfterEmpty === 0, 'len=' + worriesAfterEmpty);

  // 异常：仅空格
  await page.fill('#worry-text', '    ');
  await page.click(btn('ux-04', 'add-worry'));
  const spaceLen = await page.evaluate(() => appData.worries.length);
  check('仅空格无效', spaceLen === 0, 'len=' + spaceLen);

  // 异常：无烦恼时点下一步应被 UX-05 钩子退回 UX-04
  await page.click(btn('ux-04', 'next'));
  check('无烦恼被拦回 UX-04', (await activeScene()) === 'ux-04', await activeScene());

  // 正常：添加 3 条
  for (const t of ['作业没写完', '明天要演讲', '存款不够']) {
    await page.fill('#worry-text', t);
    await page.click(btn('ux-04', 'add-worry'));
  }
  const len3 = await page.evaluate(() => appData.worries.length);
  check('数组保存 3 条', len3 === 3, 'len=' + len3);

  // 边界：超出上限
  await page.fill('#worry-text', '第四条');
  await page.click(btn('ux-04', 'add-worry'));
  const len4 = await page.evaluate(() => appData.worries.length);
  const capHint = await page.textContent('[data-bind="worryHint"]');
  check('超上限被拒', len4 === 3 && capHint.includes('最多'), 'len=' + len4 + ' hint=' + capHint);

  // UX-05 -> UX-08
  await page.click(btn('ux-04', 'next'));
  check('UX-05 可达', (await activeScene()) === 'ux-05', await activeScene());
  const confirmItems = await page.locator('[data-bind="worryListConfirm"] li').count();
  check('UX-05 渲染 3 条', confirmItems === 3, 'count=' + confirmItems);

  for (const s of ['ux-05', 'ux-06', 'ux-07', 'ux-08']) {
    await page.click(btn(s, 'next'));
  }
  check('UX-09 可达', (await activeScene()) === 'ux-09', await activeScene());

  // 边界：重复点击独裁者按钮
  await page.click(btn('ux-09', 'trigger-button'));
  check('按钮触发进 UX-10', (await activeScene()) === 'ux-10', await activeScene());
  await page.click(btn('ux-10', 'back'));

  const dupBlocked = await page.evaluate(() =>
    document.querySelector('[data-scene="ux-09"] [data-action="trigger-button"]').disabled);
  check('重复点击被 disabled 阻止', dupBlocked === true, 'disabled=' + dupBlocked);

  await page.evaluate(() => {
    document.querySelector('[data-scene="ux-09"] [data-action="trigger-button"]').disabled = false;
  });
  await page.click(btn('ux-09', 'trigger-button'));
  const dupHint = await page.textContent('[data-bind="buttonHint"]');
  const sceneAfterDup = await activeScene();
  check('重复点击被 JS 忽略', sceneAfterDup === 'ux-09' && dupHint.includes('忽略'),
        'scene=' + sceneAfterDup + ' hint=' + dupHint);

  // 死路检查：锁定后出现「下一步」出口
  const nextVisible = await page.evaluate(() =>
    !document.querySelector('[data-bind="buttonNext"]').classList.contains('is-hidden'));
  check('锁定后出现下一步出口', nextVisible === true, 'visible=' + nextVisible);

  await page.click('[data-bind="buttonNext"]');
  check('经出口回到 UX-10', (await activeScene()) === 'ux-10', await activeScene());
  for (const s of ['ux-10', 'ux-11', 'ux-12', 'ux-13']) {
    await page.click(btn(s, 'next'));
  }
  check('UX-14 可达', (await activeScene()) === 'ux-14', await activeScene());

  // UX-13 总结渲染（回看一次）
  await page.click(btn('ux-14', 'back'));
  const summaryCount = await page.locator('[data-bind="summaryList"] li').count();
  check('UX-13 总结有内容', summaryCount === 4, 'count=' + summaryCount);
  await page.click(btn('ux-13', 'next'));

  // 重新开始：数据清空
  await page.click(btn('ux-14', 'restart'));
  const afterRestart = await page.evaluate(() => ({
    scene: appData.currentScene,
    worries: appData.worries.length,
    triggered: appData.buttonTriggered
  }));
  check('重新开始回 UX-01', afterRestart.scene === 'ux-01', afterRestart.scene);
  check('重新开始清空数组', afterRestart.worries === 0, 'len=' + afterRestart.worries);
  check('重新开始复位按钮', afterRestart.triggered === false, 'triggered=' + afterRestart.triggered);
  const exitHiddenAgain = await page.evaluate(() =>
    document.querySelector('[data-bind="buttonNext"]').classList.contains('is-hidden'));
  check('重新开始隐藏出口', exitHiddenAgain === true, 'hidden=' + exitHiddenAgain);

  // 退出确认路径
  await page.click(btn('ux-01', 'next'));
  await page.click(btn('ux-02', 'exit'));
  const modalOpen = await page.evaluate(() =>
    document.querySelector('[data-bind="exitModal"]').classList.contains('modal--open'));
  check('退出弹出确认框', modalOpen === true, 'open=' + modalOpen);
  await page.click('[data-action="exit-cancel"]');
  check('取消退出留在 UX-02', (await activeScene()) === 'ux-02', await activeScene());
  await page.click(btn('ux-02', 'exit'));
  await page.click('[data-action="exit-confirm"]');
  check('确认退出回 UX-01', (await activeScene()) === 'ux-01', await activeScene());

  // 边界：UX-01 点返回不应越界报错
  await page.evaluate(() => SceneManager.back());
  check('首页返回不越界', (await activeScene()) === 'ux-01', await activeScene());

  // 边界：快速连点
  await page.click(btn('ux-01', 'next'));
  for (let i = 0; i < 6; i++) await page.click(btn('ux-02', 'next'), { delay: 5 }).catch(() => {});
  const afterRapid = await activeScene();
  check('快速连点无报错', typeof afterRapid === 'string', 'scene=' + afterRapid);

  // 场景数量与唯一可见性
  const sceneCount = await page.locator('[data-scene]').count();
  const activeCount = await page.locator('.scene--active').count();
  check('共 14 个场景', sceneCount === 14, 'count=' + sceneCount);
  check('同时只有 1 个可见', activeCount === 1, 'count=' + activeCount);

  await browser.close();

  console.log('\n===== 原有 31 项测试 =====');
  let failed = 0;
  results.forEach((r) => {
    if (!r.pass) failed++;
    console.log((r.pass ? '[PASS] ' : '[FAIL] ') + r.name + (r.pass ? '' : '  -> ' + r.detail));
  });
  console.log('\n控制台错误数: ' + errors.length);
  errors.forEach((e) => console.log('  ERR: ' + e));
  console.log('\n合计: ' + (results.length - failed) + '/' + results.length + ' 通过');
  process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
})();
