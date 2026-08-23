/**
 * _proto-shot.js —— 给 assets/dev/proto/ 下的原型切片拍照 + 抓运行时报错。
 *
 * 用法（仓库根目录）：
 *   NODE_PATH="$(npm root -g)" node assets/dev/_proto-shot.js
 *
 * 走 http:// 而不是 file://：@font-face 在 file:// 下会被同源策略挡掉，
 * 拍出来是回退字形，量出来的换行位置也不对。
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '_shots-proto');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

function serve() {
  return new Promise(function (resolve) {
    const server = http.createServer(function (req, res) {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
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
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  const errors = [];
  page.on('pageerror', function (e) { errors.push('pageerror: ' + (e && e.message || e)); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(base + '/assets/dev/proto/bubble-look.html');
  await page.waitForFunction(function () { return typeof FontSupport !== 'undefined'; });
  await page.evaluate(function () { return document.fonts.ready; });
  // 等主循环把 perf 读数刷出来（30 帧一次）
  await page.waitForFunction(function () {
    return document.getElementById('perf').textContent.indexOf('ms/帧') > -1;
  }, null, { timeout: 15000 });

  async function shot(name, setup) {
    if (setup) { await page.evaluate(setup); await page.waitForTimeout(500); }
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('  · ' + name);
  }

  const pick = function (seg, val) {
    document.querySelector('.seg[data-seg="' + seg + '"] button[data-val="' + val + '"]').click();
  };

  await shot('01-warm-split', function () {
    document.querySelector('.seg[data-seg="mode"] button[data-val="split"]').click();
  });
  await shot('02-warm-new', function () {
    document.querySelector('.seg[data-seg="mode"] button[data-val="new"]').click();
  });
  await shot('03-flat-split', function () {
    document.querySelector('.seg[data-seg="bg"] button[data-val="flat"]').click();
    document.querySelector('.seg[data-seg="mode"] button[data-val="split"]').click();
  });
  await shot('04-teal-split', function () {
    document.querySelector('.seg[data-seg="bg"] button[data-val="teal"]').click();
  });
  await shot('05-teal-warn', function () {
    document.querySelector('.seg[data-seg="mode"] button[data-val="new"]').click();
    const w = document.getElementById('p-warn'); w.checked = true;
    w.dispatchEvent(new Event('change'));
  });

  // 压力档：L3 满员 60 颗，1920×1080，看绘制预算撑不撑得住
  await page.setViewportSize({ width: 1920, height: 1080 });
  await shot('06-stress-60', function () {
    document.querySelector('.seg[data-seg="bg"] button[data-val="warm"]').click();
    const w = document.getElementById('p-warn'); w.checked = false;
    w.dispatchEvent(new Event('change'));
    const c = document.getElementById('p-count'); c.value = 60;
    c.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(1600);
  console.log('\n  压力档读数：' + await page.textContent('#perf'));
  await page.screenshot({ path: path.join(OUT, '06-stress-60.png') });

  console.log(errors.length ? '\n  ✗ 报错：\n    ' + errors.join('\n    ') : '\n  ✓ 无报错');

  await browser.close();
  server.close();
  console.log('\n完成 → ' + OUT);
}

run().catch(function (err) { console.error(err); process.exit(1); });
