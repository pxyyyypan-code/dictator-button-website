'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

// 玩家能直接看见的 HTML 不得出现内部阶段、分支或结局编号。
['LEVEL 0', 'ENDING 0', 'MATCH RESULT', 'EXPERIENCE LOG', '正常阶段', '结局形成阶段', '手动清除']
  .forEach(function (term) { assert(!html.includes(term), 'HTML 泄露开发词：' + term); });
['正常阶段', '结局形成阶段', 'ENDING 03 · 手动清除']
  .forEach(function (term) { assert(!app.includes(term), '动态文案泄露开发词：' + term); });

// data-bind 是单例缓存，重名会让后续更新写到错误节点。
const binds = Array.from(html.matchAll(/data-bind="([^"]+)"/g), function (m) { return m[1]; });
assert.strictEqual(new Set(binds).size, binds.length, '存在重复 data-bind');
['gameTimer', 'gameWorry', 'gameStatus', 'levelResult', 'endingWorry', 'endingBubbleC', 'logNodes']
  .forEach(function (name) { assert(binds.includes(name), '缺少 data-bind=' + name); });

// 玩家提供的完整 PNG 必须真正用于结果、结局与遗留装饰。
assert(html.includes('doraemon-card-peek.png'));
assert(html.includes('doraemon-wave.png'));
assert(!html.includes('doraemon-sit.webp'));
assert(!css.includes('doraemon-peek.webp'));

// 所有静态 src 都必须存在。
Array.from(html.matchAll(/(?:src|href)="([^"#]+)"/g), function (m) { return m[1]; })
  .filter(function (ref) { return !/^(?:https?:|data:|mailto:)/.test(ref); })
  .forEach(function (ref) {
    assert(fs.existsSync(path.join(root, ref)), '静态资源不存在：' + ref);
  });

// 最小 CSS 结构校验：去掉注释与字符串后，花括号必须完全配对。
const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
let depth = 0;
for (const ch of cleanCss) {
  if (ch === '{') depth += 1;
  if (ch === '}') depth -= 1;
  assert(depth >= 0, 'CSS 出现多余右花括号');
}
assert.strictEqual(depth, 0, 'CSS 花括号未闭合');

console.log('static-ui: bindings, assets, player copy and CSS structure passed');
