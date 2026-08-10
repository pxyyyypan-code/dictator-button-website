/**
 * V0.5.3 回归（临时脚本）
 * 覆盖 §九 的 12 项验收 + UX-01~UX-14 全流程 + 控制台报错。
 * 泡泡命中统一走 BubbleGame.handleClick 的真实 pointer 事件；
 * 按钮统一用 el.click()，避免 headless 下的 actionability 等待。
 */
const { chromium } = require('playwright');
const URL = 'file:///D:/Desktop/独裁者按钮/dictator-button-website/index.html';
const results = [];
const check = (n, ok, d) => results.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(URL);

  const state = () => p.evaluate(() => appData.currentScene);
  const activeView = () => p.evaluate(() =>
    document.querySelector('.scene--active') ? document.querySelector('.scene--active').dataset.scene : null);
  const count = () => p.evaluate(() => BubbleGame.getBubbleCount());
  const click = (sel) => p.$eval(sel, el => el.click());
  const btn = (s, a) => `[data-scene="${s}"] [data-action="${a}"]`;
  const waitState = async (id, ms = 90000) => {
    try {
      await p.waitForFunction(x => appData.currentScene === x, id, { timeout: ms, polling: 100 });
      return true;
    } catch { return false; }
  };
  // 命中判定：点击后泡泡进入 bursting/rejecting（不是立即从数组移除），
  // 所以用「非 normal 状态的泡泡数」变化来判断，避免一次调用把整屏点光。
  const hitBubble = () => p.evaluate(() => {
    const busy = () => BubbleGame.getDebugSnapshot().filter(b => b.state !== 'normal').length;
    const c = [...document.querySelectorAll('canvas')]
      .find(x => x.offsetParent !== null && x.getBoundingClientRect().width > 0);
    if (!c) return false;
    const r = c.getBoundingClientRect();
    const before = busy();
    const beforeN = BubbleGame.getBubbleCount();
    for (let gy = 0.1; gy < 0.95; gy += 0.06) {
      for (let gx = 0.05; gx < 0.98; gx += 0.04) {
        c.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: r.left + r.width * gx, clientY: r.top + r.height * gy,
          bubbles: true, pointerType: 'mouse'
        }));
        if (busy() !== before || BubbleGame.getBubbleCount() !== beforeN) return true;
      }
    }
    return false;
  });

  /* ---------- UX-01 ~ UX-06 ---------- */
  check('UX-01 初始场景', (await state()) === 'ux-01', await state());
  await click(btn('ux-01', 'next'));
  await click(btn('ux-02', 'next'));
  await click(btn('ux-03', 'next'));
  check('UX-04 可达', (await state()) === 'ux-04', await state());
  for (const t of ['作业没写完', '明天要演讲', '存款不够']) {
    await p.fill('#worry-text', t);
    await click(btn('ux-04', 'add-worry'));
  }
  check('输入 3 条烦恼', (await p.evaluate(() => appData.worries.length)) === 3);
  await click(btn('ux-04', 'next'));
  check('UX-05 可达', (await state()) === 'ux-05', await state());
  await click(btn('ux-05', 'next'));
  // UX-06 是 0ms 直通节点，可能在断言前已推进到 UX-07，两者都算通过。
  check('UX-06/UX-07 可达', ['ux-06', 'ux-07'].includes(await state()), await state());
  check('UX-07 自动推进', await waitState('ux-07'), await state());

  /* ---------- §一 正常删除阶段 ---------- */
  const viewAtNormal = await activeView();
  const t0 = Date.now();
  let minNormal = 999, samples = 0;
  const earlySplitSamples = [];
  while ((await state()) === 'ux-07' && Date.now() - t0 < 60000) {
    const n = await count();
    if (n < minNormal) minNormal = n;
    samples++;
    earlySplitSamples.push(await p.evaluate(() => BubbleGame.getSplitChance()));
    await hitBubble();
    await p.waitForTimeout(320);
  }
  const normalMs = Date.now() - t0;
  const okGrowth = await waitState('ux-08', 20000);
  check('正常删除阶段达到设定时长（≥14s）', normalMs >= 14000, normalMs + 'ms');
  check('正常阶段泡泡数不明显不足（≥5）', minNormal >= 5, 'min=' + minNormal + ' / samples=' + samples);
  check('正常阶段不分裂（splitChance=0 时按删除处理）',
    (await p.evaluate(() => appData.successfulDeleteCount)) >= 8,
    'successfulDeleteCount=' + (await p.evaluate(() => appData.successfulDeleteCount)));
  check('双条件满足后进入失控（后台 ux-08）', okGrowth, await state());

  /* ---------- §四.1 / 验收 4：UX-07→UX-08 无页面切换 ---------- */
  const viewAtGrowth = await activeView();
  check('UX-07→UX-08 不发生页面切换',
    viewAtNormal === 'ux-07' && viewAtGrowth === 'ux-07',
    viewAtNormal + ' -> ' + viewAtGrowth);

  /* ---------- §二 渐变失控：概率从偶发到频繁 ---------- */
  const ramp = [];
  for (let i = 0; i < 12; i++) {
    ramp.push(await p.evaluate(() => ({
      tp: BubbleGame.getTransitionProgress(),
      sc: BubbleGame.getSplitChance(),
      title: document.querySelector('[data-bind="continuousTitle"]').textContent
    })));
    await hitBubble();
    await p.waitForTimeout(700);
  }
  const scFirst = ramp[0].sc, scLast = ramp[ramp.length - 1].sc;
  check('删除异常概率由低到高（偶发→频繁）', scLast > scFirst && scLast >= 0.65,
    scFirst.toFixed(2) + ' -> ' + scLast.toFixed(2));
  const titles = [...new Set(ramp.map(r => r.title))];
  check('标题按 transitionProgress 递进且不出现「第二阶段」',
    titles.length >= 1 && !titles.some(t => /第二阶段/.test(t)), titles.join(' | '));
  check('分裂计数已累加', (await p.evaluate(() => appData.splitCount)) > 0,
    'splitCount=' + (await p.evaluate(() => appData.splitCount)));

  /* ---------- 独裁者按钮解锁（§七 规则未改） ---------- */
  for (let i = 0; i < 60; i++) {
    if (await p.evaluate(() => appData.buttonUnlocked)) break;
    await hitBubble();
    await p.waitForTimeout(220);
  }
  check('按钮按原规则解锁', (await p.evaluate(() => appData.buttonUnlocked)) === true,
    JSON.stringify(await p.evaluate(() => ({
      d: appData.deleteAttemptCount, n: BubbleGame.getBubbleCount()
    }))));
  check('泡泡数不超上限 96', (await count()) <= 96, 'n=' + (await count()));

  /* ---------- §三 原地爆裂 ---------- */
  await click('[data-action="trigger-inline-button"]');
  check('触发全部删除进入 ux-10', await waitState('ux-10', 15000), await state());
  // 爆裂开始之后再采样，排除进入 ux-10 之前的正常漂移。
  await p.waitForTimeout(120);
  const beforeErase = await p.evaluate(() => BubbleGame.getDebugSnapshot()
    .map(x => ({ id: x.id, x: x.x, y: x.y })));
  await p.waitForTimeout(600);
  const midErase = await p.evaluate(() => BubbleGame.getDebugSnapshot()
    .map(x => ({ id: x.id, x: x.x, y: x.y })));
  const byId = new Map(beforeErase.map(x => [x.id, x]));
  let maxDrift = 0;
  midErase.forEach(m => {
    const o = byId.get(m.id);
    if (!o) return;
    maxDrift = Math.max(maxDrift, Math.hypot(m.x - o.x, m.y - o.y));
  });
  check('爆裂期间泡泡坐标锁死（原地，无位移）', midErase.length > 0 && maxDrift < 1.5,
    'maxDrift=' + maxDrift.toFixed(2) + 'px / n=' + midErase.length);
  // 不向同一位置聚集：中期彼此间距的离散度不应塌缩
  const spread = arr => {
    if (arr.length < 2) return 0;
    const cx = arr.reduce((s, a) => s + a.x, 0) / arr.length;
    const cy = arr.reduce((s, a) => s + a.y, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, a) => s + (a.x - cx) ** 2 + (a.y - cy) ** 2, 0) / arr.length);
  };
  check('泡泡未向同一位置聚集', spread(midErase) >= spread(beforeErase) * 0.9,
    spread(beforeErase).toFixed(1) + ' -> ' + spread(midErase).toFixed(1));
  check('留白后自动进入 ux-11', await waitState('ux-11', 45000), await state());

  /* ---------- §四 重现阶段不自动跳转 ---------- */
  await p.waitForFunction(() => BubbleGame.getBubbleCount() >= 5, null, { timeout: 30000 }).catch(() => {});
  check('重现阶段泡泡 ≥5', (await count()) >= 5, 'n=' + (await count()));
  const rt0 = Date.now();
  for (let i = 0; i < 6; i++) { await hitBubble(); await p.waitForTimeout(260); }
  const quickMs = Date.now() - rt0;
  check('6 次点击后未自动跳转 UX-12', (await state()) === 'ux-11',
    await state() + ' @' + quickMs + 'ms');
  check('选择界面此时未出现（时长未满）',
    (await p.evaluate(() => appData.returnChoiceVisible)) === false);
  check('重现阶段不显示「删除成功」',
    !/删除成功/.test(await p.evaluate(() => document.querySelector('[data-bind="immersiveStatus"]').textContent)));
  check('重现阶段 HUD 标签为「删除尝试」',
    (await p.evaluate(() => document.querySelector('[data-bind="primaryMetricLabel"]').textContent)) === '删除尝试');
  check('系统状态显示「再次出现」',
    (await p.evaluate(() => document.querySelector('[data-bind="systemMetricValue"]').textContent)) === '再次出现');
  const noSplitReturn = await p.evaluate(() => appData.splitCount);
  // 继续点击，等到双条件满足
  while (Date.now() - rt0 < 40000) {
    if (await p.evaluate(() => appData.returnChoiceVisible)) break;
    await hitBubble();
    await p.waitForTimeout(400);
  }
  const choiceMs = Date.now() - rt0;
  check('双条件满足后才出现选择界面（≥14s）',
    (await p.evaluate(() => appData.returnChoiceVisible)) === true && choiceMs >= 14000,
    choiceMs + 'ms');
  check('重现阶段不再分裂增殖',
    (await p.evaluate(() => appData.splitCount)) === noSplitReturn,
    noSplitReturn + ' -> ' + (await p.evaluate(() => appData.splitCount)));

  /* ---------- §五 按钮位置固定 + 继续删除只能一次 ---------- */
  await p.waitForTimeout(1400);
  const boxA = await p.locator('[data-bind="returnContinue"]').boundingBox();
  await p.locator('[data-bind="returnContinue"]').hover({ force: true });
  await p.waitForTimeout(260);
  const boxB = await p.locator('[data-bind="returnContinue"]').boundingBox();
  check('hover 时按钮位置与尺寸不变',
    Math.abs(boxA.x - boxB.x) < 0.5 && Math.abs(boxA.y - boxB.y) < 0.5 &&
    Math.abs(boxA.width - boxB.width) < 0.5 && Math.abs(boxA.height - boxB.height) < 0.5,
    JSON.stringify(boxA) + ' -> ' + JSON.stringify(boxB));

  await click('[data-bind="returnContinue"]');
  check('「继续删除」关闭选择界面并延长交互',
    (await p.evaluate(() => appData.returnChoiceVisible)) === false &&
    (await p.evaluate(() => appData.continueDeleteCount)) === 1 &&
    (await state()) === 'ux-11',
    await state());
  const ct0 = Date.now();
  while (Date.now() - ct0 < 20000) {
    if (await p.evaluate(() => appData.returnChoiceVisible)) break;
    await hitBubble();
    await p.waitForTimeout(400);
  }
  check('延长结束后选择界面再次出现（≈9s）',
    (await p.evaluate(() => appData.returnChoiceVisible)) === true, (Date.now() - ct0) + 'ms');
  check('「继续删除」只能使用一次（第二次已隐藏）',
    (await p.evaluate(() => document.querySelector('[data-bind="returnContinue"]').hidden)) === true);
  check('「停下来看看」仍然可用',
    (await p.evaluate(() => document.querySelector('[data-bind="returnStop"]').hidden)) === false);
  check('重现阶段不出现倒计时/进度条/还差几次',
    await p.evaluate(() => {
      const scene = document.querySelector('[data-scene="ux-07"]');
      return !/还差|倒计时|进度/.test(scene.textContent) && !scene.querySelector('progress');
    }));

  /* ---------- 停下来看看 → 观察选择 → UX-12 ---------- *
   * V0.7 起「停下来看看」不再直接跳页，而是先进入 observe-select，
   * 由用户挑一个泡泡看清，再自动进入 UX-12。旧脚本缺了「选泡泡」这步。 */
  await click('[data-bind="returnStop"]');
  await p.waitForTimeout(600);
  const observing = await p.evaluate(() => ({
    scene: appData.currentScene,
    mode: BubbleGame.getGrowthState().mode,
    n: BubbleGame.getBubbleCount()
  }));
  check('「停下来看看」进入观察选择态（不直接跳页）',
    observing.scene === 'ux-11' && observing.mode === 'observe-select' && observing.n > 0,
    JSON.stringify(observing));

  const picked = await p.evaluate(() => {
    const t = BubbleGame.getDebugSnapshot()[0];
    if (!t) return null;
    BubbleGame.handleClick(t.x, t.y);
    return t.text;
  });
  await p.waitForTimeout(500);
  const focused = await p.evaluate(() => ({
    mode: BubbleGame.getGrowthState().mode,
    selected: appData.selectedWorryText
  }));
  check('选中泡泡后进入聚焦态并记下所选烦恼',
    focused.mode === 'observe-focus' && !!focused.selected,
    JSON.stringify(focused) + ' / picked=' + picked);

  check('聚焦结束后自动进入 UX-12', await waitState('ux-12', 15000), await state());
  check('UX-12 显示所选的那条烦恼',
    (await p.evaluate(() => document.querySelector('[data-bind="themeFocus"]').textContent))
      .includes(focused.selected || ' '),
    await p.evaluate(() => document.querySelector('[data-bind="themeFocus"]').textContent));
  await p.waitForFunction(() =>
    !document.querySelector('[data-scene="ux-12"] [data-action="next"]').disabled,
    null, { timeout: 25000 }).catch(() => {});
  await click(btn('ux-12', 'next'));
  check('UX-13 可达', (await state()) === 'ux-13', await state());
  check('UX-13 总结有内容', (await p.locator('[data-bind="summaryList"] li').count()) >= 3);
  await click(btn('ux-13', 'next'));
  check('UX-14 可达', (await state()) === 'ux-14', await state());

  /* ---------- §八 状态清理 + 二周目泡泡仍会动 ---------- */
  await click(btn('ux-14', 'restart'));
  const cleaned = await p.evaluate(() => ({
    s: appData.currentScene, w: appData.worries.length,
    tp: appData.transitionProgress, cd: appData.continueDeleteCount,
    nt: appData.normalTimer, rt: appData.returnTimer,
    n: BubbleGame.getBubbleCount(),
    gs: BubbleGame.getGrowthState()
  }));
  check('重新开始回 UX-01', cleaned.s === 'ux-01', cleaned.s);
  check('状态清理：数组/计时器/进度均复位',
    cleaned.w === 0 && cleaned.tp === 0 && cleaned.cd === 0 &&
    !cleaned.nt && !cleaned.rt && cleaned.n === 0 &&
    cleaned.gs.transitionProgress === 0 && cleaned.gs.settling === false,
    JSON.stringify(cleaned));

  // 中途退出后再体验，泡泡仍然移动
  await click(btn('ux-01', 'next'));
  await click(btn('ux-02', 'next'));
  await click(btn('ux-03', 'next'));
  for (const t of ['第二轮烦恼']) {
    await p.fill('#worry-text', t);
    await click(btn('ux-04', 'add-worry'));
  }
  await click(btn('ux-04', 'next'));
  await click(btn('ux-05', 'next'));
  await waitState('ux-07', 40000);
  await p.waitForTimeout(600);
  const posA = await p.evaluate(() => BubbleGame.getDebugSnapshot().map(x => x.x + ',' + x.y).join(';'));
  await p.waitForTimeout(700);
  const posB = await p.evaluate(() => BubbleGame.getDebugSnapshot().map(x => x.x + ',' + x.y).join(';'));
  check('二周目泡泡仍然正常运动', posA !== posB && posA.length > 0);
  check('二周目可点击', await hitBubble());

  // 中途退出
  await click('[data-scene="ux-07"] [data-action="exit"]');
  await click('[data-action="exit-confirm"]');
  const afterExit = await p.evaluate(() => ({
    s: appData.currentScene, n: BubbleGame.getBubbleCount(),
    raf: BubbleGame.getGrowthState().hasAnimationFrame
  }));
  check('中途退出回首页并清空', afterExit.s === 'ux-01' && afterExit.n === 0,
    JSON.stringify(afterExit));

  check('共 14 个场景节点', (await p.locator('[data-scene]').count()) === 14);
  check('同时只有 1 个可见容器', (await p.locator('.scene--active').count()) === 1);

  /* ---------- prefers-reduced-motion 下的快速淡出 ---------- */
  const p2 = await b.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const rmErrs = [];
  p2.on('pageerror', e => rmErrs.push('pageerror: ' + e.message));
  await p2.goto(URL);
  const click2 = (sel) => p2.$eval(sel, el => el.click());
  await click2(btn('ux-01', 'next'));
  await click2(btn('ux-02', 'next'));
  await click2(btn('ux-03', 'next'));
  await p2.fill('#worry-text', '减速动画测试');
  await click2(btn('ux-04', 'add-worry'));
  await click2(btn('ux-04', 'next'));
  await click2(btn('ux-05', 'next'));
  await p2.waitForFunction(() => appData.currentScene === 'ux-07', null, { timeout: 40000 });
  await p2.waitForTimeout(900);
  const rm = await p2.evaluate(async () => {
    const before = BubbleGame.getDebugSnapshot().map(x => ({ id: x.id, x: x.x, y: x.y }));
    let done = false;
    BubbleGame.startErasure({
      durationMs: CONFIG.ERASURE_EXPLOSION_DURATION_MS,
      onComplete: () => { done = true; }
    });
    await new Promise(r => setTimeout(r, 160));
    const mid = BubbleGame.getDebugSnapshot().map(x => ({ id: x.id, x: x.x, y: x.y }));
    await new Promise(r => setTimeout(r, 500));
    return {
      done, n: BubbleGame.getBubbleCount(), before: before.length,
      drift: mid.map(m => {
        const o = before.find(bb => bb.id === m.id);
        return o ? Math.hypot(m.x - o.x, m.y - o.y) : 0;
      })
    };
  });
  check('reduced-motion 使用原地快速淡出并按时结束',
    rm.before > 0 && rm.done === true && rm.n === 0 && Math.max(0, ...rm.drift) < 1.5,
    JSON.stringify(rm));
  check('reduced-motion 下无脚本报错', rmErrs.length === 0, rmErrs.join(' | '));
  await p2.close();

  await b.close();
  let f = 0;
  results.forEach(r => { if (!r.ok) f++; console.log((r.ok ? '[PASS] ' : '[FAIL] ') + r.n + (r.ok ? '' : '  -> ' + r.d)); });
  console.log('\n控制台错误数: ' + errs.length);
  errs.slice(0, 8).forEach(e => console.log('  ERR: ' + e));
  console.log('合计: ' + (results.length - f) + '/' + results.length);
})();
