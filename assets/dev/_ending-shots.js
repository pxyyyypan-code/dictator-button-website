/**
 * _ending-shots.js —— 结局2/3/4 的三条真实路径截图。
 *
 * 结局2 和结局3 都必须真的动手才能走到（按下按钮、把泡泡一颗颗点掉），
 * 所以这里不是"直接跳到结局页"，而是照玩家的顺序驱动一遍：
 * 按钮 → 空白 → 回返泡泡 → 整批飘回，以及第三关清场 → 静下来 → 结局页。
 * 结局4 的时间线自己会跑完，只需要在关键相位各截一张。
 */
const chromium = require('playwright').chromium;
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = url.pathToFileURL(path.resolve(__dirname, '..', '..', 'index.html')).href + '?ending';

function state(page) {
  return page.evaluate(function () {
    const scene = document.querySelector('.game-scene');
    function text(name) {
      const node = document.querySelector('[data-bind="' + name + '"]');
      return node ? node.textContent : null;
    }
    return {
      scene: document.body.dataset.currentScene,
      phase: scene ? scene.dataset.phase : null,
      cls: scene ? scene.className.replace('scene scene--immersive game-scene scene--active', '').trim() : null,
      status: text('gameStatus'),
      label: text('endingLabel'),
      title: text('endingTitle')
    };
  });
}

/** 泡泡位置每帧都在动，直接问引擎要坐标，比在画布上瞎扫准得多。 */
function bubblePoints(page) {
  return page.evaluate(function () {
    const canvas = document.querySelector('[data-canvas="experience"]');
    if (!canvas || typeof LevelGame === 'undefined') return [];
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const list = LevelGame._test && LevelGame._test.bubbles ? LevelGame._test.bubbles() : [];
    return list.map(function (b) {
      return [rect.left + b.x * scaleX, rect.top + b.y * scaleY];
    });
  });
}

/** 是否还停在第三关的可点击画面上。 */
function inLevel(page) {
  return page.evaluate(function () {
    return document.body.dataset.currentScene === 'u10';
  });
}

/** 只点第三关画面里的泡泡。逐颗校验场景：结局一旦触发就立刻收手，
    否则剩下的点击会落到结局页的「重新体验」上，把测试自己带回首页。 */
async function clickField(page) {
  const points = await bubblePoints(page);
  let clicked = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (!(await inLevel(page))) break;
    await page.mouse.click(points[i][0], points[i][1]);
    clicked += 1;
  }
  return clicked;
}

async function open(browser, n, report) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', function (e) { errors.push(String(e)); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ROOT + n + 'demo=1');
  await page.waitForTimeout(1600);
  report.push(['ending' + n + ' 进场', await state(page)]);
  return { page: page, errors: errors };
}

(async function () {
  const browser = await chromium.launch();
  const report = [];

  // ---- 结局2：按下按钮 → 真的空了 → 它一次次回来 ----
  const e2 = await open(browser, 2, report);
  await e2.page.click('[data-action="game-dictator"]');
  await e2.page.waitForTimeout(1400);
  await e2.page.screenshot({ path: 'assets/dev/_ending2-blank.png' });
  report.push(['ending2 空白', await state(e2.page)]);
  for (let round = 0; round < 9; round += 1) {
    await e2.page.waitForTimeout(1100);
    await clickField(e2.page);
  }
  await e2.page.waitForTimeout(2200);
  await e2.page.screenshot({ path: 'assets/dev/_ending2-group.png' });
  report.push(['ending2 整批回返', await state(e2.page)]);
  await e2.page.waitForTimeout(4200);
  await e2.page.screenshot({ path: 'assets/dev/_ending2-final.png' });
  report.push(['ending2 结局页', await state(e2.page)]);
  report.push(['ending2 控制台', e2.errors.join(' | ') || 'clean']);

  // ---- 结局3：把场上泡泡一颗颗清干净 ----
  const e3 = await open(browser, 3, report);
  for (let round = 0; round < 40; round += 1) {
    const now = await state(e3.page);
    if (now.scene !== 'u10' || now.phase === 'ending3-calm') break;
    await clickField(e3.page);
    await e3.page.waitForTimeout(260);
  }
  await e3.page.waitForTimeout(1200);
  await e3.page.screenshot({ path: 'assets/dev/_ending3-calm.png' });
  report.push(['ending3 静下来', await state(e3.page)]);
  await e3.page.waitForTimeout(4600);
  await e3.page.screenshot({ path: 'assets/dev/_ending3-final.png' });
  report.push(['ending3 结局页', await state(e3.page)]);
  report.push(['ending3 控制台', e3.errors.join(' | ') || 'clean']);

  // ---- 结局4：过载时间线自己跑完 ----
  const e4 = await open(browser, 4, report);
  await e4.page.waitForTimeout(4200);
  await e4.page.screenshot({ path: 'assets/dev/_ending4-pulse.png' });
  report.push(['ending4 脉动', await state(e4.page)]);
  await e4.page.waitForTimeout(3600);
  await e4.page.screenshot({ path: 'assets/dev/_ending4-still.png' });
  report.push(['ending4 静止', await state(e4.page)]);
  await e4.page.waitForTimeout(5200);
  await e4.page.screenshot({ path: 'assets/dev/_ending4-final.png' });
  report.push(['ending4 结局页', await state(e4.page)]);
  report.push(['ending4 控制台', e4.errors.join(' | ') || 'clean']);

  fs.writeFileSync(path.join(__dirname, '_ending-shots.txt'),
    report.map(function (row) {
      return row[0] + ': ' + (typeof row[1] === 'string' ? row[1] : JSON.stringify(row[1]));
    }).join('\n') + '\n', 'utf8');
  console.log('done');
  await browser.close();
}());
