/** 视觉/交互回归：确认贴图缓存没有冻结 B10 的抖动与模糊揭示 */
const { chromium } = require('playwright');
const URL = 'file:///D:/Desktop/独裁者按钮/dictator-button-website/index.html';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL);
  const click = (s) => p.$eval(s, el => el.click());
  const btn = (s, a) => `[data-scene="${s}"] [data-action="${a}"]`;
  const ok = (n, c, d) => console.log((c ? '[PASS] ' : '[FAIL] ') + n + (c ? '' : '  -> ' + d));

  await click(btn('ux-01', 'next'));
  await click(btn('ux-02', 'next'));
  await click(btn('ux-03', 'next'));
  for (const t of ['对年龄增长感到压力', '饮食不规律', '工作没有成就感']) {
    await p.fill('#worry-text', t); await click(btn('ux-04', 'add-worry'));
  }
  await click(btn('ux-04', 'next'));
  await click(btn('ux-05', 'next'));
  await p.waitForFunction(() => appData.currentScene === 'ux-07', null, { timeout: 40000 });
  await p.waitForTimeout(1500);

  // 1) 画面每帧都在变（贴图缓存没把整屏冻住）
  const shot = async () => (await p.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].find(x => x.offsetParent !== null);
    return c.toDataURL().slice(-3000);
  }));
  const f1 = await shot(); await p.waitForTimeout(300); const f2 = await shot();
  ok('画面逐帧在变化（未被缓存冻结）', f1 !== f2, 'identical');

  // 2) 指针靠近 B10 时模糊逐渐揭示
  const reveal = await p.evaluate(async () => {
    const snap = () => BubbleGame.getDebugSnapshot();
    const target = snap().find(x => x.behaviorType === 'B10_BLUR');
    if (!target) return { skipped: true };
    const before = target.hoverReveal;
    const c = [...document.querySelectorAll('canvas')].find(x => x.offsetParent !== null);
    const r = c.getBoundingClientRect();
    for (let i = 0; i < 25; i += 1) {
      const now = snap().find(x => x.id === target.id);
      if (!now) break;
      c.dispatchEvent(new PointerEvent('pointermove', {
        clientX: r.left + now.x, clientY: r.top + now.y, bubbles: true, pointerType: 'mouse' }));
      await new Promise(res => setTimeout(res, 40));
    }
    const after = (snap().find(x => x.id === target.id) || {}).hoverReveal;
    return { before: before, after: after };
  });
  if (reveal.skipped) console.log('[SKIP] 本轮没有 B10_BLUR 泡泡');
  else ok('指针靠近时模糊被揭示（hoverReveal 上升）',
    reveal.after > reveal.before + 0.2, 'before=' + reveal.before + ' after=' + reveal.after);

  // 3) B10 被点击后进入 rejecting（抖动反馈仍触发）
  const rejecting = await p.evaluate(() => {
    const t = BubbleGame.getDebugSnapshot().find(x => x.behaviorType === 'B10_BLUR' && x.state === 'normal');
    if (!t) return { skipped: true };
    BubbleGame.handleClick(t.x, t.y);
    const after = BubbleGame.getDebugSnapshot().find(x => x.id === t.id);
    return { state: after ? after.state : 'gone' };
  });
  if (rejecting.skipped) console.log('[SKIP] 无可点击的 B10_BLUR');
  else ok('B10 点击后进入 rejecting/bursting（反馈未丢失）',
    rejecting.state === 'rejecting' || rejecting.state === 'bursting' || rejecting.state === 'gone', rejecting.state);

  console.log('控制台错误数:', errs.length);
  errs.slice(0, 6).forEach(e => console.log('  ERR: ' + e));
  await b.close();
})();
