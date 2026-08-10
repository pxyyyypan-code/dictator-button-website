/** 实际走一遍 observe 流程：停下来看看 → 选一个泡泡 → UX-12 → UX-13 → UX-14 */
const { chromium } = require('playwright');
const URL = 'file:///D:/Desktop/独裁者按钮/dictator-button-website/index.html';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL);
  const click = (s) => p.$eval(s, el => el.click());
  const btn = (s, a) => `[data-scene="${s}"] [data-action="${a}"]`;
  const state = () => p.evaluate(() => appData.currentScene);
  const hit = () => p.evaluate(() => {
    const busy = () => BubbleGame.getDebugSnapshot().filter(x => x.state !== 'normal').length;
    const c = [...document.querySelectorAll('canvas')].find(x => x.offsetParent !== null);
    const r = c.getBoundingClientRect();
    const b0 = busy(), n0 = BubbleGame.getBubbleCount();
    for (let gy = 0.1; gy < 0.95; gy += 0.06)
      for (let gx = 0.05; gx < 0.98; gx += 0.04) {
        c.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: r.left + r.width * gx, clientY: r.top + r.height * gy,
          bubbles: true, pointerType: 'mouse' }));
        if (busy() !== b0 || BubbleGame.getBubbleCount() !== n0) return true;
      }
    return false;
  });

  await click(btn('ux-01', 'next'));
  await click(btn('ux-02', 'next'));
  await click(btn('ux-03', 'next'));
  for (const t of ['对年龄增长感到压力', '饮食不规律', '工作没有成就感']) {
    await p.fill('#worry-text', t); await click(btn('ux-04', 'add-worry'));
  }
  await click(btn('ux-04', 'next'));
  await click(btn('ux-05', 'next'));
  await p.waitForFunction(() => appData.currentScene === 'ux-07', null, { timeout: 40000 });
  console.log('1. 进入全屏交互:', await state());

  // 解锁独裁者按钮
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (await p.evaluate(() => appData.buttonUnlocked)) break;
    await hit(); await p.waitForTimeout(180);
  }
  console.log('2. 按钮解锁, 泡泡', await p.evaluate(() => BubbleGame.getBubbleCount()));

  await p.$eval('[data-action="trigger-inline-button"]', el => el.click());
  await p.waitForFunction(() => appData.currentScene === 'ux-11', null, { timeout: 40000 });
  console.log('3. 全部删除后进入:', await state());

  // 等重现阶段可交互，点满双条件
  await p.waitForFunction(() => appData.returnInteractionStartedAt > 0, null, { timeout: 40000 });
  const t1 = Date.now();
  while (Date.now() - t1 < 60000) {
    if (await p.evaluate(() => document.querySelector('.return-choice')?.classList.contains('is-visible'))) break;
    await hit(); await p.waitForTimeout(400);
  }
  console.log('4. 选择界面出现, 删除尝试', await p.evaluate(() => appData.returnDeleteAttemptCount));

  // 停下来看看 → 应进入观察选择态（不是直接跳走）
  await click('[data-bind="returnStop"]');
  await p.waitForTimeout(600);
  const observing = await p.evaluate(() => ({
    scene: appData.currentScene,
    mode: BubbleGame.getGrowthState().mode,
    status: document.querySelector('[data-bind="immersiveStatus"]')?.textContent.trim(),
    bubbles: BubbleGame.getBubbleCount()
  }));
  console.log('5. 停下来看看 →', JSON.stringify(observing));
  await p.screenshot({ path: 'assets/dev/_observe-select.png' });

  // 选一个泡泡
  await p.evaluate(() => {
    const t = BubbleGame.getDebugSnapshot()[0];
    if (t) BubbleGame.handleClick(t.x, t.y);
  });
  await p.waitForTimeout(500);
  const picked = await p.evaluate(() => ({
    selected: appData.selectedWorryText,
    mode: BubbleGame.getGrowthState().mode,
    focus: document.querySelector('[data-bind="themeFocus"]')?.textContent.trim()
  }));
  console.log('6. 选中泡泡 →', JSON.stringify(picked));
  await p.screenshot({ path: 'assets/dev/_observe-focus.png' });

  await p.waitForFunction(() => appData.currentScene === 'ux-12', null, { timeout: 30000 });
  console.log('7. 自动进入:', await state());

  await p.waitForFunction(() =>
    !document.querySelector('[data-scene="ux-12"] [data-action="next"]').disabled,
    null, { timeout: 30000 });
  await click(btn('ux-12', 'next'));
  console.log('8. 进入:', await state(),
    '| 总结条目', await p.locator('[data-bind="summaryList"] li').count());
  await p.screenshot({ path: 'assets/dev/_observe-summary.png' });

  await click(btn('ux-13', 'next'));
  console.log('9. 进入:', await state());

  console.log('控制台错误数:', errs.length);
  errs.slice(0, 8).forEach(e => console.log('  ERR: ' + e));
  await b.close();
})();
