/** 线上部署验证（临时脚本） */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const r = await p.goto('https://pxyyyypan-code.github.io/dictator-button-website/',
    { waitUntil: 'networkidle' });
  const info = await p.evaluate(() => ({
    normalMin: CONFIG.NORMAL_PHASE_MIN_MS,
    returnMin: CONFIG.RETURN_INTERACTION_MIN_MS,
    hasChoice: !!document.querySelector('[data-bind="returnChoice"]'),
    hasReturnBtns: !!document.querySelector('[data-action="return-stop"]'),
    scene: appData.currentScene
  }));
  console.log('HTTP', r.status(), JSON.stringify(info), 'errs=' + errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ERR: ' + e));
  await b.close();
})();
