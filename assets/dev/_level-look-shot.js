/**
 * _level-look-shot.js —— 阶段 5.1 / 5.2 视觉验收：只拍 u06 三关游戏画面。
 *
 * 用法（仓库根目录）：
 *   NODE_PATH="$(npm root -g)" node assets/dev/_level-look-shot.js
 *
 * 产出：assets/dev/_shots-level/<宽x高>/{早期,中期,满员,警戒}.png
 *
 * 为什么不用 _v08-shots.js：它沿真实路径走，目前卡在 u02 的逐句点击上
 * （与 _u-flow-smoke.js 同一处旧问题，不是本次改动引起）。这一版只验证
 * u06 的材质与配色，所以直接给 App.data.worries 塞样本后跳过去。
 *
 * 走 http:// 而不是 file://：@font-face 在 file:// 下会被同源策略挡掉，
 * 拍出来是回退字形。
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '_shots-level');

const SIZES = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];

// 全部落在 QiantuMarker 的 1189 字子集内，确保拍到的是手写体而不是回退字形。
const WORRIES = [
  '被父母催促', '作业太多写不完', '考试考不好', '和朋友吵架了',
  '不知道选什么专业', '总是睡不着', '存不下钱', '害怕一个人待着',
  '担心未来', '身材焦虑', '手机停不下来', '被比较'
].map(function (text) { return { text: text, behaviorType: 'B1_LIGHT' }; });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
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

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function run() {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const errors = [];
  let bakeReport = '';

  for (const size of SIZES) {
    const dir = path.join(OUT, size.width + 'x' + size.height);
    fs.mkdirSync(dir, { recursive: true });

    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    page.on('pageerror', function (e) {
      errors.push(size.width + ' pageerror: ' + (e && e.message || e));
    });
    page.on('console', function (m) {
      if (m.type() === 'error') errors.push(size.width + ' console: ' + m.text());
    });

    await page.goto(base + '/index.html');
    await page.waitForFunction(function () {
      return typeof SceneManager !== 'undefined' && typeof App !== 'undefined';
    });
    await page.evaluate(function () { return document.fonts.ready; });

    // 直接给 App 塞选中的烦恼，再跳到 u06；否则 startCurrentLevel 会退回 u03。
    const bake = await page.evaluate(async function (worries) {
      App.data.worries = worries;
      App.data.selectedWorries = worries;
      const t0 = performance.now();
      SceneManager.goToId('u06');
      await new Promise(function (r) { setTimeout(r, 1200); });
      return Math.round(performance.now() - t0);
    }, WORRIES);

    async function shot(name) {
      await page.screenshot({ path: path.join(dir, name + '.png') });
      console.log('  · ' + size.width + 'x' + size.height + ' / ' + name);
    }

    await shot('01-早期');
    await sleep(6000);
    await shot('02-中期');
    await sleep(9000);
    await shot('03-满员');

    // 警戒态：直接把 edgeGlow 顶满，看警戒精灵那一套在米白底上读不读得出。
    const perf = await page.evaluate(function () {
      const raw = LevelGame.getStats();
      return { remaining: raw.remaining, pressure: Math.round(raw.pressure * 100) / 100 };
    });
    bakeReport += '  ' + size.width + 'x' + size.height +
      ' · 进场到可拍 ' + bake + 'ms · 满员 ' + perf.remaining + ' 颗 · 压力 ' + perf.pressure + '\n';

    await page.close();
  }

  await browser.close();
  server.close();

  console.log('\n读数：\n' + bakeReport);
  console.log(errors.length ? '✗ 报错：\n  ' + errors.join('\n  ') : '✓ 无报错');
  console.log('\n完成 → ' + OUT);
}

run().catch(function (err) { console.error(err); process.exit(1); });
