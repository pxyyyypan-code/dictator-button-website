/**
 * _rating-shots.js —— 星级评定 + 20 件道具收藏的视觉与流程验收
 *
 * 用法（仓库根目录）：
 *   NODE_PATH="$(npm root -g)" node assets/dev/_rating-shots.js
 *
 * 产出：assets/dev/_shots-rating/<宽x高>/*.png
 *
 * 走的是**真实入口**：LevelRating.render / startDraw / storeReward、
 * Collection.store，都是 app.js 里那几个 data-action 调的同一批函数，
 * 只是绕开了「真的打三关」这段耗时（拍图不验证泡泡玩法，那是 _level-look-shot.js 的事）。
 *
 * 要看的四件事：
 *   1. 0 / 1 / 2 / 3 星四种结算卡在三档分辨率下都不顶出视口；
 *   2. 星星是**依次**亮的，不是一次性全出现（拍 delay 中途那一帧对比）；
 *   3. 抽卡 → 展示 → 飞入收藏 → 收回右下角，整条链子跑得通；
 *   4. 滚轮只滚收藏区域，不带动整页。
 *
 * 走 http:// 而不是 file://：@font-face 在 file:// 下会被同源策略挡掉。
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '_shots-rating');

const SIZES = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1440, height: 900, reduced: true }
];

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

/** 造一个 GameState 形状的结算记录 + LevelGame 形状的统计。 */
function fakeRun(level, pass, seconds) {
  return {
    result: pass
      ? { type: 'pass', level: level, method: 'manual', nextKey: 'L' + (level + 1) }
      : { type: 'fail', level: level, levelKey: 'L' + level },
    stats: { elapsedMs: seconds * 1000 }
  };
}

async function run() {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const errors = [];
  const report = [];

  for (const size of SIZES) {
    const tag = size.width + 'x' + size.height + (size.reduced ? '-reduced' : '');
    const dir = path.join(OUT, tag);
    fs.mkdirSync(dir, { recursive: true });

    const page = await browser.newPage({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      reducedMotion: size.reduced ? 'reduce' : 'no-preference'
    });
    page.on('pageerror', function (e) { errors.push(tag + ' pageerror: ' + (e && e.message || e)); });
    page.on('console', function (m) { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });

    await page.goto(base + '/index.html');
    await page.waitForFunction(function () {
      return typeof App !== 'undefined' && typeof LevelRating !== 'undefined' && typeof Collection !== 'undefined';
    });
    await page.evaluate(function () { return document.fonts.ready; });

    async function shot(name) {
      await page.screenshot({ path: path.join(dir, name + '.png') });
      console.log('  · ' + tag + ' / ' + name);
    }

    /** 走 app.js 的真实入口：塞好 levelResult / latestGameStats 再让它自己渲染。 */
    async function open(level, pass, seconds) {
      await page.evaluate(function (run) {
        LevelRating.reset();
        App.data.levelResult = run.result;
        App.data.latestGameStats = run.stats;
        // showLevelResult 是 app.js 的私有函数，这里用它唯一的外部触发点：
        // 直接把 LevelRating.render 跑一遍 + 开弹层，等价于关卡结束那一步。
        const rating = LevelRating.render(run.result, run.stats);
        const modal = document.querySelector('[data-bind="levelResult"]');
        modal.dataset.result = run.result.type === 'pass' ? 'pass' : 'fail';
        modal.classList.add('modal--open');
        modal.setAttribute('aria-hidden', 'false');
        document.querySelector('[data-bind="levelResultTitle"]').textContent =
          run.result.type === 'pass' ? '恭喜你！通关第一关' : '还差一点就通关了';
        document.querySelector('[data-bind="levelResultNote"]').textContent =
          '这是验收用的说明文案，长度接近线上最长的一条，用来看两行时卡片会不会顶出视口。';
        document.querySelector('[data-bind="levelResultPrimary"]').textContent =
          run.result.type === 'pass' ? '进入下一关' : '再来一次';
        document.querySelector('[data-bind="levelResultEnd"]').hidden = run.result.type === 'pass';
        return rating;
      }, fakeRun(level, pass, seconds));
    }

    async function closeResult() {
      await page.evaluate(function () {
        const modal = document.querySelector('[data-bind="levelResult"]');
        modal.classList.remove('modal--open');
        modal.setAttribute('aria-hidden', 'true');
        LevelRating.reset();
      });
    }

    // ---- 1. 四种星数的结算卡 ----
    // 阈值（config.js）：L1 three=22 two=29；L2 three=19 two=25。
    const cases = [
      { name: '01-0星-未通关', level: 1, pass: false, seconds: 36 },
      { name: '02-1星-刚好通关', level: 1, pass: true, seconds: 33 },
      { name: '03-2星', level: 1, pass: true, seconds: 26 },
      { name: '04-3星', level: 1, pass: true, seconds: 18 }
    ];
    for (const c of cases) {
      await open(c.level, c.pass, c.seconds);
      await sleep(1500);   // 等三颗星全部亮完
      await shot(c.name);
      const measured = await page.evaluate(function () {
        const card = document.querySelector('.level-result-card');
        const dora = document.querySelector('.level-result-doraemon');
        const box = card.getBoundingClientRect();
        const top = dora ? Math.min(box.top, dora.getBoundingClientRect().top) : box.top;
        return {
          top: Math.round(top),
          bottom: Math.round(box.bottom),
          stars: Number(document.querySelector('[data-bind="levelResult"]').dataset.stars),
          drawShown: !document.querySelector('[data-bind="levelResultDraw"]').hidden,
          endShown: !document.querySelector('[data-bind="levelResultEnd"]').hidden,
          time: document.querySelector('[data-bind="levelResultTime"]').textContent,
          rating: document.querySelector('[data-bind="levelResultRating"]').textContent
        };
      });
      const fits = measured.top >= 0 && measured.bottom <= size.height;
      report.push('  ' + tag + ' ' + c.name +
        ' · ' + measured.stars + '星 · ' + measured.rating + ' · ' + measured.time +
        ' · 抽卡按钮' + (measured.drawShown ? '在' : '无') +
        ' · 结束体验' + (measured.endShown ? '在' : '无') +
        ' · 卡片 ' + measured.top + '~' + measured.bottom + (fits ? ' ✓' : ' ✗ 顶出视口'));
      if (!fits) errors.push(tag + ' ' + c.name + ' 卡片超出视口 ' + measured.top + '~' + measured.bottom);
      await closeResult();
    }

    // ---- 2. 星星是依次亮的，不是一次性 ----
    if (!size.reduced) {
      await open(1, true, 18);   // 3 星
      // DELAY 260 + STAGGER 360：约 700ms 时应该只亮了两颗。
      await sleep(700);
      const midway = await page.evaluate(function () {
        return document.querySelectorAll('.star-slot.is-lit').length;
      });
      await shot('05-星星依次亮起-中途');
      await sleep(1200);
      const done = await page.evaluate(function () {
        return document.querySelectorAll('.star-slot.is-lit').length;
      });
      report.push('  ' + tag + ' 逐颗亮起 · 700ms 时 ' + midway + ' 颗 / 最终 ' + done + ' 颗' +
        (midway > 0 && midway < done ? ' ✓' : ' ✗ 没有依次亮起'));
      if (!(midway > 0 && midway < done)) errors.push(tag + ' 星星没有依次亮起（' + midway + '/' + done + '）');
    } else {
      await open(1, true, 18);
      await sleep(300);
    }

    // ---- 3. 抽卡 → 展示 → 飞入收藏 → 收回 ----
    await page.evaluate(function () { LevelRating.startDraw(); });
    await sleep(size.reduced ? 200 : 900);
    await shot('06-老虎机');
    await page.waitForSelector('[data-bind="rewardReveal"].modal--open', { timeout: 8000 });
    await sleep(400);
    await shot('07-新道具');

    const before = await page.evaluate(function () { return Collection.count(); });
    await page.evaluate(function () { LevelRating.storeReward(); });
    await sleep(size.reduced ? 300 : 700);
    await shot('08-收藏册打开');
    await sleep(size.reduced ? 500 : 1200);
    await shot('09-飞入落位');

    // 玩家动一下（滚轮）就取消自动收回，这里正好用来验证滚轮不带动整页。
    const wheel = await page.evaluate(async function () {
      const viewport = document.querySelector('[data-bind="collectionViewport"]');
      const pageBefore = window.scrollY;
      viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 420, bubbles: true, cancelable: true }));
      viewport.scrollTop += 420;
      await new Promise(function (r) { setTimeout(r, 500); });
      // 面板空白处（视窗以外）滚轮必须被吞掉
      const panel = document.querySelector('.collection__panel');
      const evt = new WheelEvent('wheel', { deltaY: 420, bubbles: true, cancelable: true });
      panel.dispatchEvent(evt);
      return {
        viewportScrolled: viewport.scrollTop > 0,
        pageMoved: window.scrollY !== pageBefore,
        panelWheelBlocked: evt.defaultPrevented,
        docScrollable: document.documentElement.scrollHeight > window.innerHeight
      };
    });
    await shot('10-滚轮看第二屏');
    report.push('  ' + tag + ' 滚轮 · 收藏区滚动=' + wheel.viewportScrolled +
      ' 整页移动=' + wheel.pageMoved + ' 面板外滚轮被吞=' + wheel.panelWheelBlocked +
      (wheel.viewportScrolled && !wheel.pageMoved ? ' ✓' : ' ✗'));
    if (wheel.pageMoved) errors.push(tag + ' 滚轮带动了整页');

    const after = await page.evaluate(function () {
      return { count: Collection.count(), total: Collection.total(), badge: document.querySelector('[data-bind="collectionBadge"]').textContent };
    });
    report.push('  ' + tag + ' 收藏 ' + before + ' → ' + after.count + ' / ' + after.total +
      ' · 角标 ' + after.badge + (after.count === before + 1 ? ' ✓' : ' ✗'));
    if (after.count !== before + 1) errors.push(tag + ' 收藏计数没有 +1');

    // 手动收回 → 右下角常驻入口
    await page.evaluate(function () { Collection.close(); });
    await sleep(size.reduced ? 200 : 700);
    await shot('11-收回后的常驻入口');
    const fab = await page.evaluate(function () {
      const el = document.querySelector('[data-bind="collectionFab"]');
      const box = el.getBoundingClientRect();
      return { hidden: el.hidden, inView: box.right <= window.innerWidth + 1 && box.bottom <= window.innerHeight + 1 };
    });
    report.push('  ' + tag + ' 右下角入口 · 显示=' + !fab.hidden + ' 在视口内=' + fab.inView +
      (!fab.hidden && fab.inView ? ' ✓' : ' ✗'));
    if (fab.hidden || !fab.inView) errors.push(tag + ' 右下角收藏夹入口不可用');

    // ---- 4. 抽卡机会只有一次：3 星再点也不能抽第二次 ----
    const second = await page.evaluate(function () {
      const btn = document.querySelector('[data-bind="levelResultDraw"]');
      const wasDisabled = btn.disabled;
      LevelRating.startDraw();
      return {
        disabled: wasDisabled,
        label: btn.textContent,
        rewardOpen: document.querySelector('[data-bind="rewardDraw"]').classList.contains('modal--open')
      };
    });
    report.push('  ' + tag + ' 二次抽卡 · 按钮禁用=' + second.disabled + ' 文案「' + second.label +
      '」 老虎机再开=' + second.rewardOpen + (second.disabled && !second.rewardOpen ? ' ✓' : ' ✗'));
    if (!second.disabled || second.rewardOpen) errors.push(tag + ' 3 星能抽第二次');

    // ---- 5. 收藏册的滚动范围（20 格 5 行，视窗只露 2 行） ----
    // 这里**不**去凑「20 件全解锁」：只有第一、二关给抽卡机会，一轮体验最多 2 件，
    // 20/20 是走不到的状态。而且 store() 开头就 clearTimers()，连着调 20 次
    // 只会把前 19 次的解锁定时器全掐掉，拍出来仍然是 1/20，白拍。
    // 真正要看的是后三行确实存在、能滚到底、滚到底之后面板不变形。
    await page.evaluate(function () {
      Collection.open();
      const viewport = document.querySelector('[data-bind="collectionViewport"]');
      viewport.scrollTop = viewport.scrollHeight;
    });
    await sleep(600);
    await shot('12-收藏册-滚到底');
    const grid = await page.evaluate(function () {
      const viewport = document.querySelector('[data-bind="collectionViewport"]');
      const rows = document.querySelectorAll('.collection__row');
      const cells = document.querySelectorAll('.collection__item');
      const panel = document.querySelector('.collection__panel').getBoundingClientRect();
      const last = rows[rows.length - 1].getBoundingClientRect();
      const view = viewport.getBoundingClientRect();
      return {
        rows: rows.length,
        cells: cells.length,
        cols: getComputedStyle(rows[0]).gridTemplateColumns.split(' ').length,
        visibleRows: Math.round(viewport.clientHeight / rows[0].getBoundingClientRect().height * 10) / 10,
        scrollable: viewport.scrollHeight > viewport.clientHeight + 2,
        // 滚到底之后最后一行必须整行落在视窗里，不能只露半行
        lastRowShown: last.bottom <= view.bottom + 2 && last.top >= view.top - 2,
        panelFits: panel.top >= 0 && panel.bottom <= window.innerHeight
      };
    });
    report.push('  ' + tag + ' 收藏册 · ' + grid.cols + ' 列 × ' + grid.rows + ' 行 = ' + grid.cells +
      ' 格 · 视窗露 ' + grid.visibleRows + ' 行 · 可滚=' + grid.scrollable +
      ' · 滚到底末行完整=' + grid.lastRowShown + ' · 面板不出屏=' + grid.panelFits +
      (grid.cols === 4 && grid.rows === 5 && grid.cells === 20 && grid.scrollable &&
        grid.lastRowShown && grid.panelFits ? ' ✓' : ' ✗'));
    if (!grid.panelFits) errors.push(tag + ' 收藏册面板顶出视口');
    if (!grid.lastRowShown) errors.push(tag + ' 滚到底之后最后一行没露全');
    if (grid.cells !== 20) errors.push(tag + ' 收藏格不是 20 个（' + grid.cells + '）');

    // ---- 6. 重新开始要把收藏清空 ----
    const cleared = await page.evaluate(function () {
      Collection.reset();
      return {
        count: Collection.count(),
        fabHidden: document.querySelector('[data-bind="collectionFab"]').hidden,
        locked: document.querySelectorAll('.collection__item.is-locked').length
      };
    });
    report.push('  ' + tag + ' 重新开始 · 收藏 ' + cleared.count + ' · 灰格 ' + cleared.locked +
      ' · 入口收起=' + cleared.fabHidden + (cleared.count === 0 && cleared.locked === 20 ? ' ✓' : ' ✗'));
    if (cleared.count !== 0 || cleared.locked !== 20) errors.push(tag + ' restart 没有清空收藏');

    await page.close();
  }

  await browser.close();
  server.close();

  console.log('\n读数：\n' + report.join('\n'));
  console.log(errors.length ? '\n✗ 问题：\n  ' + errors.join('\n  ') : '\n✓ 无报错');
  console.log('\n完成 → ' + OUT);
  if (errors.length) process.exit(1);
}

run().catch(function (err) { console.error(err); process.exit(1); });
