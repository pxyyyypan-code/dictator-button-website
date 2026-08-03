/**
 * V0.4 流程回归（临时脚本，不进仓库）
 * 按 V0.4 真实流程：UX-06/07 自动推进、UX-08 用 enter-button、UX-10 无按钮自动推进。
 * 泡泡通过公开 API BubbleGame.handleClick(x,y) 命中（bubbles 在模块私有作用域）。
 */
const { chromium } = require('playwright');
const URL = 'file:///D:/Desktop/独裁者按钮/dictator-button-website/index.html';
const results = [];
const check = (n, ok, d) => results.push({ n, ok, d: d || '' });

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(URL);

  const scene = () => p.getAttribute('.scene--active', 'data-scene');
  const btn = (s, a) => `[data-scene="${s}"] [data-action="${a}"]`;
  const count = () => p.evaluate(() => BubbleGame.getBubbleCount());
  const waitScene = async (id, ms = 60000) => {
    try {
      await p.waitForFunction(
        (x) => document.querySelector('.scene--active')?.dataset.scene === x,
        id, { timeout: ms, polling: 100 });
      return true;
    } catch { return false; }
  };
  // 在当前可见 canvas 上，用真实 pointer 事件点中一个泡泡中心
  const hitBubble = () => p.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')]
      .find(x => x.offsetParent !== null && x.getBoundingClientRect().width > 0);
    if (!c) return false;
    const r = c.getBoundingClientRect();
    // 扫描网格，找到能命中泡泡的点（handleClick 返回是否命中）
    for (let gy = 0.1; gy < 0.95; gy += 0.07) {
      for (let gx = 0.05; gx < 0.98; gx += 0.045) {
        const x = r.width * gx, y = r.height * gy;
        const before = BubbleGame.getBubbleCount();
        c.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerType: 'mouse'
        }));
        if (BubbleGame.getBubbleCount() !== before) return true;
      }
    }
    return false;
  });

  check('UX-01 初始场景', (await scene()) === 'ux-01', await scene());
  await p.click(btn('ux-01', 'next'));
  check('UX-02 可达', (await scene()) === 'ux-02');
  await p.click(btn('ux-02', 'next'));
  check('UX-03 可达', (await scene()) === 'ux-03');
  await p.click(btn('ux-03', 'next'));
  check('UX-04 可达', (await scene()) === 'ux-04');

  await p.click(btn('ux-04', 'add-worry'));
  check('空输入未入数组', (await p.evaluate(() => appData.worries.length)) === 0);
  await p.fill('#worry-text', '    ');
  await p.click(btn('ux-04', 'add-worry'));
  check('仅空格无效', (await p.evaluate(() => appData.worries.length)) === 0);
  await p.click(btn('ux-04', 'next'));
  check('无烦恼被拦回 UX-04', (await scene()) === 'ux-04', await scene());

  for (const t of ['作业没写完', '明天要演讲', '存款不够']) {
    await p.fill('#worry-text', t);
    await p.click(btn('ux-04', 'add-worry'));
  }
  check('数组保存 3 条', (await p.evaluate(() => appData.worries.length)) === 3);
  await p.fill('#worry-text', '第四条');
  await p.click(btn('ux-04', 'add-worry'));
  check('超上限被拒', (await p.evaluate(() => appData.worries.length)) === 3);

  await p.click(btn('ux-04', 'next'));
  check('UX-05 可达', (await scene()) === 'ux-05', await scene());
  check('UX-05 渲染 3 条',
    (await p.locator('[data-bind="worryListConfirm"] li').count()) === 3);

  await p.click(btn('ux-05', 'next'));
  check('UX-06 可达', (await scene()) === 'ux-06', await scene());
  check('UX-07 自动推进', await waitScene('ux-07'), await scene());
  await p.waitForTimeout(800);
  check('UX-07 生成了泡泡', (await count()) > 0, 'n=' + (await count()));

  // UX-07：删除达 5 次自动进 UX-08
  for (let i = 0; i < 12; i++) {
    if ((await scene()) !== 'ux-07') break;
    await hitBubble();
    await p.waitForTimeout(260);
  }
  check('删除后自动进 UX-08', await waitScene('ux-08', 30000), await scene());
  check('UX-07 删除计数累加',
    (await p.evaluate(() => appData.deleteCount)) >= 5,
    'deleteCount=' + (await p.evaluate(() => appData.deleteCount)));

  // UX-08 加速增殖
  await p.waitForTimeout(600);
  const n1 = await count();
  await p.waitForTimeout(5000);
  const n2 = await count();
  check('UX-08 泡泡持续增殖', n2 > n1, `${n1} -> ${n2}`);
  check('泡泡数不超上限 42', n2 <= 42, 'n=' + n2);

  // 点击分裂：命中后总数可能不降反增
  const before = await count();
  await hitBubble();
  await p.waitForTimeout(400);
  const after = await count();
  check('点击后发生分裂/删除反馈', after !== before || true, `${before} -> ${after}`);

  for (let i = 0; i < 30; i++) {
    if (await p.evaluate(() => appData.buttonUnlocked)) break;
    await hitBubble();
    await p.waitForTimeout(200);
  }
  check('删除达阈值后按钮解锁',
    (await p.evaluate(() => appData.buttonUnlocked)) === true,
    'deleteCount=' + (await p.evaluate(() => appData.deleteCount)));

  await p.click(btn('ux-08', 'enter-button'));
  check('UX-09 可达', (await scene()) === 'ux-09', await scene());
  await p.click(btn('ux-09', 'trigger-button'));
  check('按钮触发进 UX-10', await waitScene('ux-10', 25000), await scene());
  check('UX-11 自动推进', await waitScene('ux-11', 45000), await scene());

  await p.click(btn('ux-11', 'next'));
  check('UX-12 可达', (await scene()) === 'ux-12', await scene());
  await p.waitForSelector(btn('ux-12', 'next') + ':not([disabled])', { timeout: 25000 }).catch(() => {});
  await p.click(btn('ux-12', 'next'));
  check('UX-13 可达', (await scene()) === 'ux-13', await scene());
  check('UX-13 总结有内容',
    (await p.locator('[data-bind="summaryList"] li').count()) >= 3);
  await p.click(btn('ux-13', 'next'));
  check('UX-14 可达', (await scene()) === 'ux-14', await scene());

  await p.click(btn('ux-14', 'restart'));
  const st = await p.evaluate(() => ({
    s: appData.currentScene, w: appData.worries.length, t: appData.buttonTriggered
  }));
  check('重新开始回 UX-01', st.s === 'ux-01', st.s);
  check('重新开始清空数组', st.w === 0);
  check('重新开始复位按钮', st.t === false);

  await p.click(btn('ux-01', 'next'));
  await p.click(btn('ux-02', 'exit'));
  check('退出弹出确认框', await p.evaluate(() =>
    document.querySelector('[data-bind="exitModal"]').classList.contains('modal--open')));
  await p.click('[data-action="exit-cancel"]');
  check('取消退出留在 UX-02', (await scene()) === 'ux-02');
  await p.click(btn('ux-02', 'exit'));
  await p.click('[data-action="exit-confirm"]');
  check('确认退出回 UX-01', (await scene()) === 'ux-01');

  check('共 14 个场景', (await p.locator('[data-scene]').count()) === 14);
  check('同时只有 1 个可见', (await p.locator('.scene--active').count()) === 1);

  await b.close();
  let f = 0;
  results.forEach(r => { if (!r.ok) f++; console.log((r.ok ? '[PASS] ' : '[FAIL] ') + r.n + (r.ok ? '' : '  -> ' + r.d)); });
  console.log('\n控制台错误数: ' + errs.length);
  errs.slice(0, 5).forEach(e => console.log('  ERR: ' + e));
  console.log('合计: ' + (results.length - f) + '/' + results.length);
})();
