/**
 * _smoke-data.js —— 阶段 1 冒烟：真浏览器里加载 index.html，确认换掉数据层之后
 * 页面能正常启动、控制台没有报错、两个数据对象都挂上了。
 *
 *   npx playwright test 不需要；直接 node assets/dev/_smoke-data.js
 *
 * 这一步只验"没坏"，完整流程冒烟在阶段 7。
 */
'use strict';

const path = require('path');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..', '..');
const URL = 'file:///' + path.join(REPO, 'index.html').replace(/\\/g, '/');

(async function () {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('console', function (msg) {
    if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
  });
  page.on('pageerror', function (err) { errors.push('pageerror: ' + err.message); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const probe = await page.evaluate(function () {
    const w = typeof WorryData !== 'undefined' ? WorryData : null;
    const g = typeof GadgetData !== 'undefined' ? GadgetData : null;
    if (!w || !g) return { ok: false, reason: 'WorryData / GadgetData 未挂上' };
    const p = w.createProfile('考试压力');
    return {
      ok: true,
      categories: w.categories.length,
      presets: w.presets.length,
      gadgets: g.all.length,
      sampleKeyword: p.keyword,
      sampleGadget: g.forWorry(p.presetId) ? g.forWorry(p.presetId).name : null,
      sampleSummary: (w.summaryFor(p) || '').slice(0, 24) + '…',
      classifyKnown: w.classifyFreeText('我妈天天念叨我什么时候结婚'),
      classifyUnknown: w.classifyFreeText('阿巴阿巴阿巴'),
      dictator: g.dictator.name
    };
  });

  await browser.close();

  console.log(JSON.stringify(probe, null, 2));
  if (errors.length) {
    console.log('\n控制台报错 ' + errors.length + ' 条：');
    errors.forEach(function (e) { console.log('  - ' + e); });
    process.exit(1);
  }
  if (!probe.ok) { console.log('\n' + probe.reason); process.exit(1); }
  console.log('\n页面加载无报错，数据层已生效。');
})();
