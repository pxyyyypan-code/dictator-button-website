const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

const REDUCED = process.argv.includes('--reduced');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: REDUCED ? 'reduce' : 'no-preference'
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(URL);
  // 无头 Chromium 只在产生帧时推进动画时钟，故先强制预热若干帧再截图
  const settle = async (ms) => {
    const step = 220;
    for (let t = 0; t < ms; t += step) { await page.screenshot(); await page.waitForTimeout(step); }
  };
  const shot = async (n) => {
    await settle(REDUCED ? 400 : 2200);
    await page.screenshot({ path: path.join(__dirname, `_s-${n}.png`) });
  };
  const go = (s, a) => page.click(`[data-scene="${s}"] [data-action="${a}"]`);

  await shot('ux01');
  await go('ux-01', 'next'); await go('ux-02', 'next'); await go('ux-03', 'next');
  await page.fill('#worry-text', '明天的演讲还没准备');
  await page.click('[data-scene="ux-04"] [data-action="add-worry"]');
  await page.fill('#worry-text', '存款不够');
  await page.click('[data-scene="ux-04"] [data-action="add-worry"]');
  await page.focus('#worry-text');
  await shot('ux04');

  await go('ux-04', 'next'); await go('ux-05', 'next'); await go('ux-06', 'next');
  await shot('ux07');
  await go('ux-07', 'next');
  await go('ux-08', 'next');
  await shot('ux09');
  await page.click('[data-scene="ux-09"] [data-action="trigger-button"]');
  await settle(REDUCED ? 400 : 3400);
  await page.screenshot({ path: path.join(__dirname, '_s-ux10.png') });
  await go('ux-10', 'next');
  await shot('ux11');
  await go('ux-11', 'next');
  await settle(REDUCED ? 400 : 6000);
  await page.screenshot({ path: path.join(__dirname, '_s-ux12.png') });

  await browser.close();
  console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no console errors');
})();
