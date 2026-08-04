/** 实测各阶段时长 + 选择界面截图（临时脚本） */
const { chromium } = require('playwright');
const URL = 'file:///D:/Desktop/独裁者按钮/dictator-button-website/index.html';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL);
  const click = (s) => p.$eval(s, el => el.click());
  const btn = (s, a) => `[data-scene="${s}"] [data-action="${a}"]`;
  const st = () => p.evaluate(() => appData.currentScene);
  const hit = () => p.evaluate(() => {
    const busy = () => BubbleGame.getDebugSnapshot().filter(x => x.state !== 'normal').length;
    const c = [...document.querySelectorAll('canvas')].find(x => x.offsetParent !== null);
    const r = c.getBoundingClientRect();
    const b0 = busy(), n0 = BubbleGame.getBubbleCount();
    for (let gy = 0.1; gy < 0.95; gy += 0.06)
      for (let gx = 0.05; gx < 0.98; gx += 0.04) {
        c.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: r.left + r.width * gx, clientY: r.top + r.height * gy,
          bubbles: true, pointerType: 'mouse'
        }));
        if (busy() !== b0 || BubbleGame.getBubbleCount() !== n0) return true;
      }
    return false;
  });

  await click(btn('ux-01', 'next'));
  await click(btn('ux-02', 'next'));
  await click(btn('ux-03', 'next'));
  for (const t of ['作业没写完', '明天要演讲', '存款不够']) {
    await p.fill('#worry-text', t); await click(btn('ux-04', 'add-worry'));
  }
  await click(btn('ux-04', 'next'));
  await click(btn('ux-05', 'next'));
  await p.waitForFunction(() => appData.currentScene === 'ux-07', null, { timeout: 40000 });

  // 正常删除阶段（较慢的真人节奏：每 1.1s 一次）
  const t0 = Date.now();
  while ((await st()) === 'ux-07' && Date.now() - t0 < 60000) {
    await hit(); await p.waitForTimeout(1100);
  }
  const normalMs = Date.now() - t0;

  // 渐变失控时长：transitionProgress 0 -> 1
  const g0 = Date.now();
  await p.waitForFunction(() => BubbleGame.getTransitionProgress() >= 1, null, { timeout: 30000 });
  const rampMs = Date.now() - g0;

  for (let i = 0; i < 60 && !(await p.evaluate(() => appData.buttonUnlocked)); i++) {
    await hit(); await p.waitForTimeout(220);
  }
  const unlockMs = Date.now() - g0;

  // 爆裂 + 留白
  const e0 = Date.now();
  await click('[data-action="trigger-inline-button"]');
  await p.waitForFunction(() => BubbleGame.getBubbleCount() === 0, null, { timeout: 20000 });
  const burstMs = Date.now() - e0;
  await p.waitForFunction(() => appData.currentScene === 'ux-11', null, { timeout: 30000 });
  const blankMs = Date.now() - e0 - burstMs;

  // 重现阶段：到选择界面出现
  await p.waitForFunction(() => appData.returnInteractionStartedAt > 0, null, { timeout: 30000 });
  const r0 = Date.now();
  while (Date.now() - r0 < 45000) {
    if (await p.evaluate(() => appData.returnChoiceVisible)) break;
    await hit(); await p.waitForTimeout(900);
  }
  const returnMs = Date.now() - r0;
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'assets/dev/_s-v053-choice.png' });

  await click('[data-bind="returnContinue"]');
  const c0 = Date.now();
  while (Date.now() - c0 < 25000) {
    if (await p.evaluate(() => appData.returnChoiceVisible)) break;
    await hit(); await p.waitForTimeout(600);
  }
  const extraMs = Date.now() - c0;
  await p.waitForTimeout(1400);
  await p.screenshot({ path: 'assets/dev/_s-v053-choice2.png' });

  console.log(JSON.stringify({
    正常删除阶段: normalMs + 'ms',
    渐变失控爬坡: rampMs + 'ms',
    从失控到按钮解锁: unlockMs + 'ms',
    原地爆裂清空: burstMs + 'ms',
    留白保持: blankMs + 'ms',
    重现到选择界面: returnMs + 'ms',
    继续删除延长: extraMs + 'ms'
  }, null, 2));
  await b.close();
})();
