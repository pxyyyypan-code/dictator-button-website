/** 线上性能验证：确认 GitHub Pages 上的版本已应用优化并达到满帧 */
const { chromium } = require('playwright');
const URL = 'https://pxyyyypan-code.github.io/dictator-button-website/';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const res = await p.goto(URL, { waitUntil: 'networkidle' });
  console.log('HTTP', res.status());

  const click = (s) => p.$eval(s, el => el.click());
  const btn = (s, a) => `[data-scene="${s}"] [data-action="${a}"]`;
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
  const fps = (ms) => p.evaluate(async (ms) => {
    let f = 0; const s = performance.now();
    await new Promise(r => { const t = () => { f++; performance.now() - s < ms ? requestAnimationFrame(t) : r(); }; requestAnimationFrame(t); });
    return +(f / ((performance.now() - s) / 1000)).toFixed(1);
  }, ms);

  await click(btn('ux-01', 'next'));
  await click(btn('ux-02', 'next'));
  await click(btn('ux-03', 'next'));
  for (const t of ['对年龄增长感到压力', '饮食不规律', '工作没有成就感']) {
    await p.fill('#worry-text', t); await click(btn('ux-04', 'add-worry'));
  }
  await click(btn('ux-04', 'next'));
  await click(btn('ux-05', 'next'));
  await p.waitForFunction(() => appData.currentScene === 'ux-07', null, { timeout: 40000 });

  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (await p.evaluate(() => BubbleGame.getBubbleCount()) >= 26) break;
    await hit(); await p.waitForTimeout(150);
  }
  const n = await p.evaluate(() => BubbleGame.getBubbleCount());
  const scene = await p.evaluate(() => appData.currentScene);
  const types = await p.evaluate(() => BubbleGame.getDebugSnapshot()
    .reduce((m, x) => { m[x.behaviorType] = (m[x.behaviorType] || 0) + 1; return m; }, {}));
  console.log('场景', scene, '| 泡泡', n, '| 类型', JSON.stringify(types));
  console.log('线上实测 FPS:', await fps(2000));
  await p.screenshot({ path: 'assets/dev/_live-perf.png' });
  console.log('控制台错误数:', errs.length);
  errs.slice(0, 6).forEach(e => console.log('  ERR: ' + e));
  await b.close();
})();
