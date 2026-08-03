const { chromium } = require('playwright');
const path = require('path');
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL);
  for (let i = 0; i < 3; i++) { await p.screenshot(); await p.waitForTimeout(150); }

  const go = (s, a) => p.click(`[data-scene="${s}"] [data-action="${a}"]`);
  const settle = async () => { for (let i = 0; i < 3; i++) { await p.screenshot(); await p.waitForTimeout(120); } };

  const r = { reduced: await p.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches) };

  // UX-01：标题应立即可见，且无 title-track 位移动画
  r.ux01Title = await p.evaluate(() => {
    const c = getComputedStyle(document.querySelector('[data-scene="ux-01"] .scene__title'));
    return { opacity: c.opacity, anim: c.animationName, dur: c.animationDuration };
  });
  r.relic = await p.evaluate(() => getComputedStyle(document.querySelector('.hint-relic')).animationName);

  await go('ux-01', 'next'); await go('ux-02', 'next'); await go('ux-03', 'next');
  await p.fill('#worry-text', '测试烦恼');
  await p.click('[data-scene="ux-04"] [data-action="add-worry"]');
  await p.focus('#worry-text');
  await settle();
  r.fieldFocusAnim = await p.evaluate(() =>
    getComputedStyle(document.querySelector('#worry-text')).animationName);

  await go('ux-04', 'next'); await go('ux-05', 'next'); await go('ux-06', 'next'); await go('ux-07', 'next');
  await settle();
  r.ux08TitleAnim = await p.evaluate(() =>
    getComputedStyle(document.querySelector('[data-scene="ux-08"] .scene__title')).animationName);

  await go('ux-08', 'next');
  await settle();
  r.dictatorAnim = await p.evaluate(() =>
    getComputedStyle(document.querySelector('[data-scene="ux-09"] .btn--danger')).animationName);

  // UX-10：减少动效时不应有 900~2400ms 的延迟空屏
  await p.click('[data-scene="ux-09"] [data-action="trigger-button"]');
  await settle();
  r.ux10 = await p.evaluate(() => {
    const t = getComputedStyle(document.querySelector('[data-scene="ux-10"] .scene__title'));
    const a = getComputedStyle(document.querySelector('[data-scene="ux-10"] .scene__actions'));
    return { titleOpacity: t.opacity, actionsOpacity: a.opacity };
  });

  await go('ux-10', 'next'); await go('ux-11', 'next');
  await settle();
  r.ux12 = await p.evaluate(() => {
    const lines = [...document.querySelectorAll('[data-scene="ux-12"] .theme-line')];
    const act = getComputedStyle(document.querySelector('[data-scene="ux-12"] .scene__actions'));
    return { lineOpacities: lines.map(l => getComputedStyle(l).opacity), actions: act.opacity };
  });

  r.errors = errs;
  console.log(JSON.stringify(r, null, 2));
  await b.close();
})();
