/** A/B 剖析：逐项屏蔽昂贵调用，看各自对 FPS 的贡献 */
const { chromium } = require('playwright');
const URL = 'file:///D:/Desktop/独裁者按钮/dictator-button-website/index.html';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL);
  const click = (s) => p.$eval(s, el => el.click());
  const btn = (s, a) => `[data-scene="${s}"] [data-action="${a}"]`;
  const hit = () => p.evaluate(() => {
    const busy = () => BubbleGame.getDebugSnapshot().filter(x => x.state !== 'normal').length;
    const c = [...document.querySelectorAll('canvas')].find(x => x.offsetParent !== null);
    const r = c.getBoundingClientRect();
    const b0 = busy(), n0 = BubbleGame.getBubbleCount();
    for (let gy = 0.1; gy < 0.95; gy += 0.06)
      for (let gx = 0.05; gx < 0.98; gx += 0.04) {
        c.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: r.left + r.width * gx, clientY: r.top + r.height * gy,
          bubbles: true, pointerType: 'mouse' }));
        if (busy() !== b0 || BubbleGame.getBubbleCount() !== n0) return true;
      }
    return false;
  });

  await click(btn('ux-01', 'next'));
  await click(btn('ux-02', 'next'));
  await click(btn('ux-03', 'next'));
  for (const t of ['对年龄增长感到压力', '饮食不规律', '工作没有成就感']) {
    await p.fill('#worry-text', t); await click(btn('ux-04', 'add-worry'));
  }
  await click(btn('ux-04', 'next'));
  await click(btn('ux-05', 'next'));
  await p.waitForFunction(() => appData.currentScene === 'ux-07', null, { timeout: 40000 });

  const t0 = Date.now();
  while (Date.now() - t0 < 80000) {
    const n = await p.evaluate(() => BubbleGame.getBubbleCount());
    if (n >= 26) break;
    await hit(); await p.waitForTimeout(200);
  }
  console.log('泡泡数:', await p.evaluate(() => BubbleGame.getBubbleCount()));

  // 在 ctx 原型上打补丁，逐项停用，测 1.5 秒 FPS
  const measure = (mode) => p.evaluate(async (mode) => {
    const c = [...document.querySelectorAll('canvas')].find(x => x.offsetParent !== null);
    const proto = Object.getPrototypeOf(c.getContext('2d'));
    const restore = [];
    const noop = (name, fn) => {
      const o = proto[name]; restore.push(() => { proto[name] = o; });
      proto[name] = fn(o);
    };
    const prop = (name, guard) => {
      const d = Object.getOwnPropertyDescriptor(proto, name);
      restore.push(() => Object.defineProperty(proto, name, d));
      Object.defineProperty(proto, name, { ...d, set(v) { d.set.call(this, guard(v)); } });
    };
    if (mode.includes('blur')) prop('filter', () => 'none');
    if (mode.includes('shadow')) prop('shadowBlur', () => 0);
    if (mode.includes('text')) {
      noop('fillText', () => function () {});
      noop('measureText', (o) => function (s) { return { width: s.length * 14 }; });
    }
    if (mode.includes('grad')) {
      noop('createRadialGradient', (o) => function (...a) {
        const g = o.apply(this, a); return g;
      });
    }
    let frames = 0; const start = performance.now();
    await new Promise(res => {
      const tick = () => { frames++; if (performance.now() - start < 1500) requestAnimationFrame(tick); else res(); };
      requestAnimationFrame(tick);
    });
    const fps = +(frames / ((performance.now() - start) / 1000)).toFixed(1);
    restore.forEach(f => f());
    return fps;
  }, mode);

  for (const m of [[], ['blur'], ['shadow'], ['text'], ['blur','shadow'], ['blur','shadow','text']]) {
    const fps = await measure(m);
    console.log('停用 [' + (m.join(',') || '无（基线）') + '] → FPS ' + fps);
    await p.waitForTimeout(400);
  }

  await b.close();
})();
