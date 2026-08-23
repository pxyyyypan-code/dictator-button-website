/**
 * _level-look-shot.js —— 阶段 5 视觉验收：只拍 u06 三关游戏画面。
 *
 * 用法（仓库根目录）：
 *   NODE_PATH="$(npm root -g)" node assets/dev/_level-look-shot.js
 *
 * 产出：assets/dev/_shots-level/<宽x高>/{早期,中期,满员,排队,挤出扎口,逃逸中}.png
 * 顺带量满员时的帧间隔，确认 5.3 的软体袋没有吃掉 5.2 攒下的余量。
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
  { width: 1920, height: 1080 },
  // 第四趟同样是 1440×900，但强制 prefers-reduced-motion。
  // 要确认的是「流程一步不少、只是不抖」：袋壁不再振荡、泡泡不再形变，
  // 但排队 → 挤过扎口 → 飘走这三段仍然拍得到。
  { width: 1440, height: 900, reduced: true }
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
    const tag = size.width + 'x' + size.height + (size.reduced ? '-reduced' : '');
    const dir = path.join(OUT, tag);
    fs.mkdirSync(dir, { recursive: true });

    const page = await browser.newPage({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      reducedMotion: size.reduced ? 'reduce' : 'no-preference'
    });
    page.on('pageerror', function (e) {
      errors.push(tag + ' pageerror: ' + (e && e.message || e));
    });
    page.on('console', function (m) {
      if (m.type() === 'error') errors.push(tag + ' console: ' + m.text());
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
      console.log('  · ' + tag + ' / ' + name);
    }

    await shot('01-早期');
    await sleep(6000);
    await shot('02-中期');
    await sleep(9000);
    await shot('03-满员');

    // 满员状态下量一段帧耗时：袋壁 96 个质点 + 每帧重建路径是 5.3 的新开销，
    // 必须确认它没有把 5.2 攒下来的余量吃掉。
    const fps = await page.evaluate(function () {
      return new Promise(function (resolve) {
        const marks = [];
        let last = performance.now();
        function tick(now) {
          marks.push(now - last);
          last = now;
          if (marks.length < 90) requestAnimationFrame(tick);
          else {
            marks.sort(function (a, b) { return a - b; });
            resolve({
              median: Math.round(marks[45] * 100) / 100,
              p95: Math.round(marks[85] * 100) / 100
            });
          }
        }
        requestAnimationFrame(tick);
      });
    });

    const perf = await page.evaluate(function () {
      const raw = LevelGame.getStats();
      return {
        remaining: raw.remaining,
        pressure: Math.round(raw.pressure * 100) / 100,
        mouthOpen: Math.round((raw.mouthOpen || 0) * 100) / 100
      };
    });

    // 5.4 逃逸演出：把扎口整个松开，排队挤出去。三张覆盖「排队 / 正在挤 / 已逃出」。
    await page.evaluate(function () { LevelGame.playOutcome('escape', function () {}); });
    await sleep(500);
    await shot('04-排队');
    await sleep(900);
    await shot('05-挤出扎口');
    await sleep(1400);
    await shot('06-逃逸中');

    bakeReport += '  ' + tag +
      ' · 进场到可拍 ' + bake + 'ms · 满员 ' + perf.remaining + ' 颗 · 压力 ' + perf.pressure +
      ' · 扎口 ' + perf.mouthOpen +
      ' · 帧间隔 中位 ' + fps.median + 'ms / p95 ' + fps.p95 + 'ms\n';

    await page.close();
  }

  await browser.close();
  server.close();

  console.log('\n读数：\n' + bakeReport);
  console.log(errors.length ? '✗ 报错：\n  ' + errors.join('\n  ') : '✓ 无报错');
  console.log('\n完成 → ' + OUT);
}

run().catch(function (err) { console.error(err); process.exit(1); });
