/** 性能剖析：在失控阶段测 FPS，并统计各类昂贵 Canvas 调用的每帧次数 */
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
          bubbles: true, pointerType: 'mouse'
        }));
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

  // 推进到失控阶段，堆到 ~26 个泡泡（与截图一致）
  const t0 = Date.now();
  while (Date.now() - t0 < 70000) {
    const n = await p.evaluate(() => BubbleGame.getBubbleCount());
    if (n >= 26 && (await p.evaluate(() => appData.buttonUnlocked))) break;
    await hit(); await p.waitForTimeout(200);
  }

  const info = await p.evaluate(() => ({
    n: BubbleGame.getBubbleCount(), scene: appData.currentScene,
    types: BubbleGame.getDebugSnapshot().reduce((m, x) => {
      m[x.behaviorType || '?'] = (m[x.behaviorType || '?'] || 0) + 1; return m; }, {})
  }));
  console.log('场景:', info.scene, '| 泡泡数:', info.n);
  console.log('行为类型分布:', JSON.stringify(info.types));

  // 埋点统计：包装昂贵 API，测 2 秒
  const prof = await p.evaluate(async () => {
    const c = [...document.querySelectorAll('canvas')].find(x => x.offsetParent !== null);
    const ctx = c.getContext('2d');
    const proto = Object.getPrototypeOf(ctx);
    const counts = {};
    const originals = {};
    ['measureText', 'createRadialGradient', 'createLinearGradient', 'fillText',
     'arc', 'stroke', 'fill', 'save'].forEach(name => {
      originals[name] = proto[name];
      proto[name] = function (...a) { counts[name] = (counts[name] || 0) + 1; return originals[name].apply(this, a); };
    });
    // filter / shadowBlur 是属性，用 setter 统计
    let filterSets = 0, shadowSets = 0;
    const d1 = Object.getOwnPropertyDescriptor(proto, 'filter');
    const d2 = Object.getOwnPropertyDescriptor(proto, 'shadowBlur');
    Object.defineProperty(proto, 'filter', { ...d1, set(v) { if (v && v !== 'none') filterSets++; d1.set.call(this, v); } });
    Object.defineProperty(proto, 'shadowBlur', { ...d2, set(v) { if (v > 0) shadowSets++; d2.set.call(this, v); } });

    let frames = 0;
    const start = performance.now();
    await new Promise(res => {
      const tick = () => { frames++; if (performance.now() - start < 2000) requestAnimationFrame(tick); else res(); };
      requestAnimationFrame(tick);
    });
    const ms = performance.now() - start;

    ['measureText','createRadialGradient','createLinearGradient','fillText','arc','stroke','fill','save']
      .forEach(name => { proto[name] = originals[name]; });
    Object.defineProperty(proto, 'filter', d1);
    Object.defineProperty(proto, 'shadowBlur', d2);

    const per = {};
    Object.keys(counts).forEach(k => per[k] = Math.round(counts[k] / frames));
    per['filter(blur)'] = Math.round(filterSets / frames);
    per['shadowBlur>0'] = Math.round(shadowSets / frames);
    return { fps: +(frames / (ms / 1000)).toFixed(1), frames, perFrame: per };
  });

  console.log('\n实测 FPS:', prof.fps, '（' + prof.frames + ' 帧 / 2 秒）');
  console.log('每帧调用次数:');
  Object.entries(prof.perFrame).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log('  ' + k.padEnd(22) + v));

  await b.close();
})();
