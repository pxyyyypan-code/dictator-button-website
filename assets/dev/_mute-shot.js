'use strict';
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const URL = 'file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/');
const OUT = path.join(__dirname, '_shots-mute');
(async () => {
  const b = await chromium.launch();
  for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    const p = await b.newPage({ viewport: size });
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForTimeout(600);
    const tag = size.width + 'x' + size.height;
    await p.screenshot({ path: path.join(OUT, tag + '-u01.png') });
    await p.evaluate(() => { AudioManager.setMuted(true); });
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, tag + '-u01-muted.png') });
    await p.evaluate(() => { AudioManager.setMuted(false); SceneManager.goToId('u06'); });
    await p.waitForTimeout(1400);
    await p.screenshot({ path: path.join(OUT, tag + '-u06.png') });
    await p.evaluate(() => { SceneManager.goToId('u11'); });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, tag + '-u11.png') });
    await p.close();
  }
  await b.close();
  process.stdout.write('shots in ' + OUT + '\n');
})();
