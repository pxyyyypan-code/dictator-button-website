/** 线上 V0.7 验证（临时脚本） */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const r = await p.goto('https://pxyyyypan-code.github.io/dictator-button-website/',
    { waitUntil: 'networkidle' });
  const info = await p.evaluate(() => ({
    hasWorryData: typeof WorryData !== 'undefined',
    behaviors: typeof WorryData !== 'undefined' && WorryData.behavior
      ? Object.keys(WorryData).length : 0,
    bubbleGame: typeof BubbleGame !== 'undefined' && BubbleGame.isImplemented(),
    scenes: document.querySelectorAll('[data-scene]').length,
    scene: appData.currentScene
  }));
  console.log('HTTP', r.status(), JSON.stringify(info), 'errs=' + errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ERR: ' + e));
  await b.close();
})();
