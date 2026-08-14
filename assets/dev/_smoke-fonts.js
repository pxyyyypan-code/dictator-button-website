/**
 * _smoke-fonts.js —— 字体冒烟：证明两个 webfont 真的被用上了，而不是悄悄回退系统字。
 *
 *   node assets/dev/_smoke-fonts.js
 *
 * 判定方式是量字形墨迹范围：同一串字用「目标字体」和「只有回退字」分别量，
 * 范围不同说明目标字体确实参与了排版。document.fonts.check() 只说"能不能用"，
 * 不说"实际用没用"，所以这里用测量做实证。
 *
 * 注意别用 measureText().width——汉字是全角等宽的，「烦恼」在任何中文字体里
 * 都正好 2em，量出来完全一样，会把生效的字体误判成没生效。
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
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', function (e) { errors.push(e.message); });

  const requested = [];
  page.on('request', function (r) {
    if (/\.woff2?$/.test(r.url())) requested.push(decodeURIComponent(r.url().split('/').pop()));
  });

  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(function () { return document.fonts.ready; });

  const result = await page.evaluate(async function () {
    // Canvas 只能用文档里已加载的字体，页面此刻还没用到手写体，得先显式加载。
    await Promise.all([
      document.fonts.load('400 64px "Canger YuYangTi"', '烦恼'),
      document.fonts.load('400 64px "Qiantu Marker"', '烦恼')
    ]);

    const c = document.createElement('canvas').getContext('2d');

    /* 不能用 measureText().width 判断：汉字是全角等宽的，「烦恼」在任何中文字体里
       都正好是 2em，宽度一模一样。要看字形实际的墨迹范围（actualBoundingBox），
       它反映的是笔画铺开的位置，不同字体必然不同。 */
    function ink(text, stack, size) {
      c.font = (size || 64) + 'px ' + stack;
      const m = c.measureText(text);
      return [m.actualBoundingBoxLeft, m.actualBoundingBoxRight,
        m.actualBoundingBoxAscent, m.actualBoundingBoxDescent]
        .map(function (v) { return Math.round(v * 100) / 100; }).join('/');
    }

    const FALLBACK = '"Microsoft YaHei", sans-serif';
    const sample = '烦恼';
    const fb = ink(sample, FALLBACK);
    const cy = ink(sample, '"Canger YuYangTi", ' + FALLBACK);
    const qt = ink(sample, '"Qiantu Marker", ' + FALLBACK);

    const out = {
      metrics: { 回退字: fb, 仓耳渔阳体: cy, 千图马克: qt },
      loaded: Array.from(document.fonts).map(function (f) { return f.family + ' ' + f.weight + ' ' + f.status; }),
      canger: { check: document.fonts.check('400 64px "Canger YuYangTi"'), differs: cy !== fb },
      qiantu: {
        check: document.fonts.check('400 64px "Qiantu Marker"'),
        differs: qt !== fb,
        // 手写体和仓耳渔阳体也必须彼此不同，否则说明其实回退到了后者
        differsFromMain: qt !== cy
      },
      support: typeof FontSupport === 'undefined' ? null : {
        charsetSize: FontSupport.charset.size,
        presetKeywordsAllCovered: WorryData.presets.every(function (p) {
          return FontSupport.canRenderHand(p.keyword);
        }),
        uncovered: WorryData.presets.filter(function (p) {
          return !FontSupport.canRenderHand(p.keyword);
        }).map(function (p) { return p.id + ':' + p.keyword; }),
        categoryLabelsCovered: WorryData.categories.every(function (c) {
          return FontSupport.canRenderHand(c.label);
        }),
        summariesCovered: WorryData.presets.filter(function (p) {
          return !FontSupport.canRenderHand(p.summary);
        }).length,
        // 子集外的字必须被整词拒绝，而不是逐字混排
        rejectsRareChar: FontSupport.canRenderHand('龘') === false,
        rejectsMixed: FontSupport.canRenderHand('考试龘') === false,
        stackForPreset: FontSupport.fontStackFor('考试压力').indexOf('"Qiantu Marker"') === 0,
        stackForRare: FontSupport.fontStackFor('龘龘龘').indexOf('Qiantu') < 0
      }
    };

    // .u-hand 真的改变了计算样式
    const el = document.createElement('span');
    el.textContent = '烦恼';
    document.body.appendChild(el);
    const before = getComputedStyle(el).fontFamily;
    const applied = FontSupport.applyHand(el, '烦恼');
    const after = getComputedStyle(el).fontFamily;
    el.remove();
    out.uHand = { applied: applied, before: before.slice(0, 24), after: after.slice(0, 24), changed: before !== after };

    return out;
  });

  await browser.close();

  console.log('请求到的字体文件：' + (requested.join(', ') || '（无）'));
  console.log(JSON.stringify(result, null, 2));

  const fails = [];
  if (!result.canger.check || !result.canger.differs) fails.push('仓耳渔阳体没生效');
  if (!result.qiantu.check || !result.qiantu.differs) fails.push('千图马克手写体没生效');
  if (!result.qiantu.differsFromMain) fails.push('手写体与主字体渲染一致，说明实际回退到了主字体');
  if (!result.support.presetKeywordsAllCovered) fails.push('有预设关键词不在子集里：' + result.support.uncovered.join(' '));
  if (!result.support.categoryLabelsCovered) fails.push('有大类名不在子集里');
  if (!result.support.rejectsRareChar || !result.support.rejectsMixed) fails.push('整词判断没挡住子集外的字');
  if (!result.uHand.changed || !result.uHand.applied) fails.push('.u-hand 没改变计算样式');
  if (errors.length) fails.push('控制台报错：' + errors.join(' | '));

  if (fails.length) {
    console.log('\n失败：');
    fails.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
  }
  console.log('\n两个字体都已生效，整词判断有效，控制台无报错。');
})();
