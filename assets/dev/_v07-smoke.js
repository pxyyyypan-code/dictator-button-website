/** V0.7 上传前冒烟检查（临时脚本） */
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
  const st = () => p.evaluate(() => appData.currentScene);

  const boot = await p.evaluate(() => ({
    scene: appData.currentScene,
    scenes: document.querySelectorAll('[data-scene]').length,
    active: document.querySelectorAll('.scene--active').length,
    hasWorryData: typeof WorryData !== 'undefined',
    hasBubbleGame: typeof BubbleGame !== 'undefined' && BubbleGame.isImplemented(),
    version: typeof CONFIG !== 'undefined'
  }));
  console.log('启动:', JSON.stringify(boot));

  // 走到全屏交互场景，确认泡泡生成并在动
  await click(btn('ux-01', 'next'));
  await click(btn('ux-02', 'next'));
  await click(btn('ux-03', 'next'));
  for (const t of ['作业没写完', '明天要演讲']) {
    await p.fill('#worry-text', t);
    await click(btn('ux-04', 'add-worry'));
  }
  await click(btn('ux-04', 'next'));
  await click(btn('ux-05', 'next'));
  await p.waitForFunction(() => appData.currentScene === 'ux-07', null, { timeout: 40000 });
  await p.waitForTimeout(900);
  const a = await p.evaluate(() => BubbleGame.getDebugSnapshot().map(x => x.x + ',' + x.y).join(';'));
  await p.waitForTimeout(700);
  const c = await p.evaluate(() => BubbleGame.getDebugSnapshot().map(x => x.x + ',' + x.y).join(';'));
  console.log('场景:', await st(), '| 泡泡数:', await p.evaluate(() => BubbleGame.getBubbleCount()),
    '| 在运动:', a !== c && a.length > 0);
  await p.screenshot({ path: 'assets/dev/_s-v07-ux07.png' });

  console.log('控制台错误数: ' + errs.length);
  errs.slice(0, 8).forEach(e => console.log('  ERR: ' + e));
  await b.close();
})();
