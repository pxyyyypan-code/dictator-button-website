/**
 * _card-budget.js —— 量结算卡每一段的实际高度，用来定锦旗能占多大。
 * 一次性排版工具，不进验收流程。
 *   NODE_PATH="$(npm root -g)" node assets/dev/_card-budget.js
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

  for (const size of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
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
        '够快了。这一关额外解锁了一次未来道具抽取——抽到的道具只进收藏册，不影响下一关。';
      document.querySelector('[data-bind="levelResultPrimary"]').textContent = '进入下一关';
    });
    await page.waitForTimeout(1400);

    const m = await page.evaluate(function () {
      function box(sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
      }
      const dora = box('.level-result-doraemon');
      const card = box('.level-result-card');
      const band = box('.level-result-band');
      const label = box('.level-result-band span');
      return {
        vh: window.innerHeight,
        dora: dora, card: card, band: band, label: label,
        stars: box('.level-stars'),
        title: box('.level-result-title'),
        note: box('.level-result-note'),
        meta: box('.level-result-meta'),
        actions: box('.level-result-actions'),
        // 哆啦A梦压到标签上没有：他的下沿越过标签上沿就算压住了
        doraOverLabel: dora && label ? dora.bottom - label.top : null,
        topSlack: Math.min(dora ? dora.top : card.top, card.top),
        bottomSlack: window.innerHeight - card.bottom
      };
    });

    console.log('\n' + size.width + 'x' + size.height + '  视口高 ' + m.vh);
    ['dora', 'band', 'stars', 'title', 'note', 'meta', 'actions'].forEach(function (k) {
      const b = m[k];
      if (b) console.log('  %-8s %4d 高   %4d ~ %4d', k, b.h, b.top, b.bottom);
    });
    console.log('  卡片     %4d 高   %4d ~ %4d', m.card.h, m.card.top, m.card.bottom);
    console.log('  上余 %d / 下余 %d   哆啦A梦压标签 %d px %s',
      m.topSlack, m.bottomSlack, m.doraOverLabel, m.doraOverLabel > 0 ? '← 遮住了' : '✓');
    await page.close();
  }

  await browser.close();
  server.close();
}

run().catch(function (e) { console.error(e); process.exit(1); });
