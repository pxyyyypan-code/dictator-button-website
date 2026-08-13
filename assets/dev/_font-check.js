const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => errors.push('FAILED ' + r.url().split('/').pop()));

  const url = 'file:///' + path.resolve(__dirname, '../../index.html').replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'load' });

  // 强制把 5 个字重都拉起来，再判定
  const res = await page.evaluate(async () => {
    const weights = [200, 300, 400, 500, 600];
    await Promise.all(weights.map(w => document.fonts.load(`${w} 40px "Canger YuYangTi"`, '独裁者按钮')));
    await document.fonts.ready;

    const c = document.createElement('canvas').getContext('2d');
    const probe = '独裁者按钮删除烦恼22世纪';
    const widths = {};
    for (const w of weights) {
      c.font = `${w} 40px "Canger YuYangTi"`;
      const target = c.measureText(probe).width;
      c.font = `${w} 40px "Microsoft YaHei"`;
      const fb = c.measureText(probe).width;
      widths[w] = {
        target: Math.round(target * 100) / 100,
        yahei: Math.round(fb * 100) / 100,
        distinct: Math.abs(target - fb) > 0.5,
        check: document.fonts.check(`${w} 40px "Canger YuYangTi"`),
      };
    }
    const statuses = [...document.fonts].map(f => `${f.weight}:${f.status}`).join(' ');
    return { widths, statuses };
  });

  console.log('face statuses:', res.statuses);
  for (const [w, d] of Object.entries(res.widths)) {
    console.log(`  weight ${w}: check=${d.check}  仓耳=${d.target}  雅黑=${d.yahei}  区分=${d.distinct}`);
  }
  console.log('errors:', errors.length ? errors : 'none');

  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.resolve(__dirname, '_font-ux01.png') });

  // 走到 UX-04（输入页，字重最密集的一屏）
  await page.evaluate(() => SceneManager.goToId('ux-04'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.resolve(__dirname, '_font-ux04.png') });

  await browser.close();
})();
