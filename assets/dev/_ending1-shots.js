/**
 * _ending1-shots.js —— 第三关 →「远去」→ 结局1 的验收。
 *
 * 查四件事：
 *   1. 两条通往结局1的路（L3A 按钮失效 / 第三关倒计时结束）都走过渡；
 *   2. canvas 上的麻袋确实收进结局页 .ending-sack 的框里（三档分辨率各查一次）；
 *   3. 过渡结束时 u11 真的成为当前场景，且没有 JS 报错；
 *   4. prefers-reduced-motion 下不做位移，照样能走到结局页。
 *
 * 按时间点截图，方便肉眼确认「拥挤 → 松开 → 漂浮 → 远离 → 安静 → 释然」。
 * 截图落在 assets/dev/_shots-ending1/，已进 .gitignore。
 *
 *   NODE_PATH="$(npm root -g)" node assets/dev/_ending1-shots.js
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '_shots-ending1');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8'
};

const SIZES = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];

// 对应 config.js 的 ENDING1_*：起点 / 松开 / 麻袋在路上 / 页面淡入 / 落定。
const MARKS = [0, 900, 2000, 3200, 4800];

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

/**
 * 把玩家直接放到第三关开局。
 * 不重走 u01~u05：那段有滚轮门槛和 2.4 秒的老虎机，跑一遍十几秒，
 * 而这次要验的东西全部发生在 u10 之后。走的仍是公开接口
 * （GameState.completeWithButton / advance + App.data），没有改任何业务代码。
 *
 * 关键路线是 L1 --按钮--> L2A --按钮--> L3A：只有 L3A 那一关按下按钮
 * 才会「没有反应」，也就是结局1 的按钮路。
 */
async function jumpToLevelThree(page) {
  await page.evaluate(function () {
    const blank = {
      manualCleared: 0, escaped: 0, autoBurst: 0, totalSpawned: 0,
      remaining: 0, secondsLeft: 0, packing: 0, elapsedMs: 0
    };
    GameState.reset();
    GameState.completeWithButton(blank); GameState.advance();   // L1  → L2A
    GameState.completeWithButton(blank); GameState.advance();   // L2A → L3A

    const worry = { text: '作业太多', category: 'study' };
    App.data.selectedWorries.length = 0;
    App.data.worries.length = 0;
    App.data.selectedWorries.push(worry);
    App.data.worries.push(worry);
    App.data.gameSessionStarted = true;

    SceneManager.goToId('u10');
  });
}

/**
 * 按**绝对时刻**截图，而不是「上一张之后再等 N 毫秒」。
 * 截一张 1920 全屏要几百毫秒，累加式等待到第三张就偏了一秒多，
 * 于是标着 2000ms 的那张其实是 3000ms 的画面，参数就没法照着调了。
 */
async function shotSet(page, tag, t0) {
  const actual = [];
  for (const mark of MARKS) {
    const wait = t0 + mark - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    actual.push(String(mark) + '/' + String(Date.now() - t0));
    await page.screenshot({ path: path.join(OUT, tag + '-' + String(mark) + 'ms.png') });
  }
  return actual;
}

/** 量 canvas 与结局页线稿的相对位置，顺便记下三个过渡 class 的状态。 */
async function probe(page) {
  return page.evaluate(function () {
    const canvas = document.querySelector('[data-canvas="experience"]');
    const u11 = document.querySelector('[data-scene="u11"]');
    const u06 = document.querySelector('[data-scene="u06"]');
    const sack = u11 && u11.querySelector('.ending-sack');
    if (!canvas || !u11 || !sack) return { why: 'missing node' };
    const c = canvas.getBoundingClientRect();
    const s = sack.getBoundingClientRect();
    const cs = getComputedStyle(u11);
    return {
      canvas: Math.round(c.width) + 'x' + Math.round(c.height),
      sack: Math.round(s.width) + 'x' + Math.round(s.height) +
        ' @ ' + Math.round(s.left - c.left) + ',' + Math.round(s.top - c.top),
      inCanvas: s.left >= c.left - 2 && s.right <= c.right + 2 &&
        s.top >= c.top - 2 && s.bottom <= c.bottom + 2,
      display: cs.display,
      opacity: cs.opacity,
      ending: u11.dataset.ending,
      u11class: u11.className,
      u06class: u06 ? u06.className : '',
      scene: document.body.dataset.currentScene || ''
    };
  });
}

async function runOne(browser, base, size, opts) {
  const label = opts.tag + '-' + size.width + 'x' + size.height;
  const page = await browser.newPage({
    viewport: size,
    deviceScaleFactor: 1,
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference'
  });
  const errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });

  await page.goto(base + '/index.html');
  await page.waitForFunction(function () {
    return typeof EndingTransition !== 'undefined' && typeof App !== 'undefined' && App.data;
  });
  await page.evaluate(function () { return document.fonts.ready; });
  await jumpToLevelThree(page);
  await page.waitForFunction(function () { return LevelGame.isPlaying(); }, null, { timeout: 8000 });
  await page.waitForTimeout(1200);

  if (opts.path === 'button') {
    // 按钮路：L3A 上按下独裁者按钮 → GameState 判为结局1（button-failed）。
    // 用 evaluate 里的 click，不走 Playwright 的可点击性检查——
    // 画面上一直有泡泡在动，等"稳定"会直接超时。
    await page.evaluate(function () {
      document.querySelector('[data-action="game-dictator"]').click();
    });
    // triggerButton 的失效演出走完才会调 onComplete。
    await page.waitForFunction(function () {
      return document.body.classList.contains('is-ending-transition');
    }, null, { timeout: 12000 });
  } else {
    // 倒计时路：不点任何东西，等第三关自己走完 26 秒。
    // L3A 的 escape 档是 3，全程不点必然有泡泡逃出去，
    // resolveLevelThree 因此落在结局1（natural-escape）。
    await page.waitForFunction(function () {
      return document.body.classList.contains('is-ending-transition');
    }, null, { timeout: 45000 });
  }

  // 过渡起点：以「is-ending-transition 已经挂上」的这一刻为 0。
  // 和 JS 里的 t=0 差一个 waitForFunction 的轮询间隔，量级 ≤100ms，够用。
  const t0 = Date.now();
  const start = await probe(page);
  const actual = await shotSet(page, label, t0);
  const end = await probe(page);

  const problems = [];
  if (errors.length) problems.push('JS 报错：' + errors.join(' | '));
  if (start.ending !== '1') problems.push('data-ending 不是 1（是 ' + start.ending + '）');
  if (start.display === 'none') problems.push('过渡开始时 u11 仍是 display:none，量不到麻袋');
  if (!start.inCanvas) problems.push('结局页麻袋不在画布范围内，canvas 那只会缩到画外');
  if (end.scene !== 'u11') problems.push('过渡结束后当前场景是 ' + end.scene + '，没切到 u11');
  if (end.opacity !== '1') problems.push('结局页最终 opacity=' + end.opacity);

  console.log('\n' + label + (opts.reduced ? '  (reduced-motion)' : ''));
  console.log('  canvas        ' + start.canvas);
  console.log('  结局页麻袋    ' + start.sack + (start.inCanvas ? '  ✓ 在画布内' : '  ✗ 越界'));
  console.log('  起点          display=' + start.display + ' opacity=' + start.opacity);
  console.log('  终点          scene=' + end.scene + ' opacity=' + end.opacity);
  console.log('  u06 class     ' + end.u06class);
  console.log('  u11 class     ' + end.u11class);
  console.log('  截图 标称/实际 ' + actual.join('  '));
  problems.forEach(function (p) { console.log('  ✗ ' + p); });
  if (!problems.length) console.log('  ✓ 通过');

  await page.close();
  return problems.length === 0;
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let allOk = true;

  // 按钮路跑满三档分辨率：麻袋落点的对齐只能靠这个查。
  for (const size of SIZES) {
    allOk = await runOne(browser, base, size, { tag: 'button', path: 'button' }) && allOk;
  }
  // 倒计时路跑一档就够：它和按钮路共用同一段过渡，差别只在触发点。
  allOk = await runOne(browser, base, SIZES[1], { tag: 'timeout', path: 'timeout' }) && allOk;
  // 减少动态：不做位移，但必须照样走到结局页。
  allOk = await runOne(browser, base, SIZES[1],
    { tag: 'reduced', path: 'button', reduced: true }) && allOk;

  await browser.close();
  server.close();
  console.log('\n' + (allOk ? '全部通过' : '有失败项，见上'));
  console.log('截图：' + OUT);
  if (!allOk) process.exitCode = 1;
}

run().catch(function (e) { console.error(e); process.exit(1); });
