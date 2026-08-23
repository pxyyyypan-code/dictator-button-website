/**
 * _rating-2560.js —— 临时排查：在 2560x1440 大屏下看结算卡是不是还成立。
 * 顺便打印锦旗与星星的实际计算值，确认 CSS 有没有被应用上。
 *   NODE_PATH="$(npm root -g)" node assets/dev/_rating-2560.js
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8'
};

function serve() {
  return new Promise(function (resolve) {
    const server = http.createServer(function (req, res) {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('nope'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', function () { resolve(server); });
  });
}

async function run() {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();

  for (const size of [{ width: 2560, height: 1440 }, { width: 2560, height: 1080 }]) {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    page.on('pageerror', function (e) { console.log('  ✗ pageerror: ' + e.message); });
    await page.goto(base + '/index.html');
    await page.waitForFunction(function () { return typeof LevelRating !== 'undefined'; });
    await page.evaluate(function () { return document.fonts.ready; });
    await page.evaluate(function () {
      LevelRating.render({ type: 'pass', level: 1, method: 'manual' }, { elapsedMs: 18000 });
      const modal = document.querySelector('[data-bind="levelResult"]');
      modal.dataset.result = 'pass';
      modal.classList.add('modal--open');
      document.querySelector('[data-bind="levelResultTitle"]').textContent = '恭喜你！通关第一关';
      document.querySelector('[data-bind="levelResultNote"]').textContent =
        '你在倒计时结束前，亲手清空了麻袋里的全部泡泡。';
      document.querySelector('[data-bind="levelResultPrimary"]').textContent = '进入下一关';
    });
    await page.waitForTimeout(1500);

    const m = await page.evaluate(function () {
      function box(sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return Math.round(r.width) + 'x' + Math.round(r.height) + ' @ ' + Math.round(r.left) + ',' + Math.round(r.top);
      }
      const lit = document.querySelector('.star--lit');
      const gray = document.querySelector('.star--gray');
      return {
        card: box('.level-result-card'),
        band: box('.level-result-band'),
        dora: box('.level-result-doraemon'),
        stars: box('.level-stars'),
        ribbon: box('.level-stars__ribbon'),
        slot: box('.star-slot'),
        litPos: getComputedStyle(lit).position,
        litOpacity: getComputedStyle(lit).opacity,
        grayPos: getComputedStyle(gray).position,
        ribbonW: getComputedStyle(document.querySelector('.level-stars')).getPropertyValue('--ribbon-w'),
        litCount: document.querySelectorAll('.star-slot.is-lit').length,
        time: document.querySelector('[data-bind="levelResultTime"]').textContent,
        rating: document.querySelector('[data-bind="levelResultRating"]').textContent
      };
    });
    console.log('\n' + size.width + 'x' + size.height);
    Object.keys(m).forEach(function (k) { console.log('  ' + k + ': ' + m[k]); });
    await page.screenshot({ path: path.join(__dirname, '_shots-rating', 'big-' + size.width + 'x' + size.height + '.png') });
    await page.close();
  }

  await browser.close();
  server.close();
}

run().catch(function (e) { console.error(e); process.exit(1); });
