/**
 * _check-data.js —— 数据层一致性校验（Node 直接跑，无依赖）
 *
 *   node assets/dev/_check-data.js
 *
 * 校验 js/worry-data.js 与 js/gadget-data.js 是否自洽、是否与磁盘上的图片对得上，
 * 并把自由输入分类器拿 100 条预设原文实测一遍。任何一条硬性检查失败会以非 0 退出。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..', '..');

const fails = [];
const warns = [];

function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { fails.push(msg); console.log('  ✗ ' + msg); }
}
function warn(cond, msg) {
  if (!cond) { warns.push(msg); console.log('  ! ' + msg); }
}
function head(title) { console.log('\n' + title); }

// ---------------------------------------------------------------- 装载
// 数据文件用的是顶层 const。vm 里 const/let 只落在脚本自己的词法作用域，
// 不会挂到 sandbox 全局上（只有 var 和函数声明会），所以拼成一段脚本跑，
// 末尾用一个表达式把需要的绑定原样取出来。
// config.js 一并前置，这样 worry-data.js 的 cfg() 读到的是真实阈值，
// 顺带验证浏览器里 config.js → worry-data.js 的加载顺序确实能取到值。
const sandbox = { console: console };
const bundle = ['js/config.js', 'js/worry-data.js', 'js/gadget-data.js']
  .map(function (rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); })
  .join('\n')
  + '\n;({ CONFIG, WorryData, GadgetData, WORRY_CATEGORIES, WORRY_PRESETS, WORRY_LEXICON, BEHAVIOR_TYPES })';

let exported;
try {
  exported = vm.runInNewContext(bundle, sandbox, { filename: 'config+worry-data+gadget-data' });
} catch (err) {
  console.error('装载数据文件失败：' + err.message);
  process.exit(1);
}

const W = exported.WorryData;
const G = exported.GadgetData;
const CATS = exported.WORRY_CATEGORIES;
const PRESETS = exported.WORRY_PRESETS;
const LEX = exported.WORRY_LEXICON;
const CFG = exported.CONFIG;
sandbox.BEHAVIOR_TYPES = exported.BEHAVIOR_TYPES;

// ---------------------------------------------------------------- 结构
head('结构');
ok(CATS.length === 9, '大类 9 个（实际 ' + CATS.length + '）');
ok(PRESETS.length === 100, '烦恼 100 条（实际 ' + PRESETS.length + '）');
ok(G.all.length === 20, '道具 20 个（实际 ' + G.all.length + '）');
ok(Object.keys(sandbox.BEHAVIOR_TYPES).length === 10, '行为类型 10 类');

const ids = PRESETS.map(function (p) { return p.id; });
ok(new Set(ids).size === 100, 'id 无重复');
ok(Math.min.apply(null, ids) === 1 && Math.max.apply(null, ids) === 100, 'id 覆盖 1~100');

// ---------------------------------------------------------------- 字段完整性
head('字段完整性');
const missing = { keyword: [], gadget: [], summary: [], behaviorType: [], category: [] };
PRESETS.forEach(function (p) {
  Object.keys(missing).forEach(function (k) {
    if (!p[k] || String(p[k]).trim() === '') missing[k].push(p.id);
  });
});
Object.keys(missing).forEach(function (k) {
  ok(missing[k].length === 0, '100 条都有 ' + k + (missing[k].length ? '（缺：' + missing[k].join(',') + '）' : ''));
});

const catIds = CATS.map(function (c) { return c.id; });
const badCat = PRESETS.filter(function (p) { return catIds.indexOf(p.category) < 0; });
ok(badCat.length === 0, '所有 category 都是已知大类');

const bIds = Object.keys(sandbox.BEHAVIOR_TYPES);
const badB = PRESETS.filter(function (p) { return bIds.indexOf(p.behaviorType) < 0; });
ok(badB.length === 0, '所有 behaviorType 都是已知行为');

// ---------------------------------------------------------------- 关键词
head('气泡关键词');
const kws = PRESETS.map(function (p) { return p.keyword; });
const dup = {};
kws.forEach(function (k) { dup[k] = (dup[k] || 0) + 1; });
const dupList = Object.keys(dup).filter(function (k) { return dup[k] > 1; });
ok(dupList.length === 0, '100 个关键词互不重复' + (dupList.length ? '（重复：' + dupList.join('、') + '）' : ''));

const badLen = PRESETS.filter(function (p) {
  return [].concat(Array.from(p.keyword)).length < 2 || Array.from(p.keyword).length > 6;
});
ok(badLen.length === 0, '关键词长度都在 2~6 字'
  + (badLen.length ? '（越界：' + badLen.map(function (p) { return p.id + ':' + p.keyword; }).join(' ') + '）' : ''));

const badChar = PRESETS.filter(function (p) { return !/^[一-龥]+$/.test(p.keyword); });
ok(badChar.length === 0, '关键词只含汉字，无标点/空格/英文/数字'
  + (badChar.length ? '（越界：' + badChar.map(function (p) { return p.id + ':' + p.keyword; }).join(' ') + '）' : ''));

const vague = ['压力', '焦虑', '迷茫', '内耗'];
const vagueHits = PRESETS.filter(function (p) { return vague.indexOf(p.keyword) >= 0; });
warn(vagueHits.length <= 6, '空泛关键词偏多：' + vagueHits.length + ' 条');

// ---------------------------------------------------------------- 道具映射
head('烦恼 → 道具');
const gadgetNames = G.all.map(function (g) { return g.name; });
const unknownG = PRESETS.filter(function (p) { return gadgetNames.indexOf(p.gadget) < 0; });
ok(unknownG.length === 0, '所有 gadget 都能在 GADGETS 里找到'
  + (unknownG.length ? '（未知：' + unknownG.map(function (p) { return p.gadget; }).join('、') + '）' : ''));

const used = new Set(PRESETS.map(function (p) { return p.gadget; }));
ok(used.size === 20, '20 个道具全部被引用（实际被引用 ' + used.size + ' 个）');

const viaApi = PRESETS.filter(function (p) {
  const g = G.forWorry(p.id);
  return !g || g.name !== p.gadget;
});
ok(viaApi.length === 0, 'GadgetData.forWorry(id) 与预设一致');

// ---------------------------------------------------------------- 图片
head('图片资源');
function exists(rel) { return fs.existsSync(path.join(REPO, rel)); }
const missImg = [];
G.all.forEach(function (g) { if (!exists(g.image)) missImg.push(g.image); });
if (!exists(G.dictator.image)) missImg.push(G.dictator.image);
CATS.forEach(function (c) { if (!exists(c.image)) missImg.push(c.image); });
['assets/images/ui/dialog-frame.webp', 'assets/images/ui/tip-frame.webp'].forEach(function (p) {
  if (!exists(p)) missImg.push(p);
});
ok(missImg.length === 0, '21 道具图 + 9 大类图 + 2 UI 框都在磁盘上'
  + (missImg.length ? '（缺：' + missImg.join(' ') + '）' : ''));

const noSize = G.all.filter(function (g) { return !g.width || !g.height; });
ok(noSize.length === 0, '每个道具都记录了实际像素尺寸');
const tiny = G.all.filter(function (g) { return Math.max(g.width, g.height) < 220; });
warn(tiny.length === 0, tiny.length + ' 个道具图长边不足 220px，放大展示会发糊：'
  + tiny.map(function (g) { return g.name + '(' + g.width + 'x' + g.height + ')'; }).join(' '));

let bytes = 0;
['gadgets', 'worries', 'ui'].forEach(function (dir) {
  const d = path.join(REPO, 'assets', 'images', dir);
  if (!fs.existsSync(d)) return;
  fs.readdirSync(d).forEach(function (f) {
    if (f.endsWith('.webp')) bytes += fs.statSync(path.join(d, f)).size;
  });
});
console.log('  · 图片总体积 ' + (bytes / 1048576).toFixed(2) + ' MB');
ok(bytes < 2 * 1048576, '图片总体积在 2MB 以内');

// ---------------------------------------------------------------- 大类附加数据
head('大类附加数据');
const badHover = CATS.filter(function (c) {
  if (!Array.isArray(c.hoverPreview) || c.hoverPreview.length !== 3) return true;
  return c.hoverPreview.some(function (id) {
    const p = W.preset(id);
    return !p || p.category !== c.id;
  });
});
ok(badHover.length === 0, '每类 3 条悬停预览且都属于本类'
  + (badHover.length ? '（问题类：' + badHover.map(function (c) { return c.id; }).join(' ') + '）' : ''));

const badFb = CATS.filter(function (c) {
  const n = c.fallbackSummary ? Array.from(c.fallbackSummary).length : 0;
  return n < 30 || n > 90;
});
ok(badFb.length === 0, '9 条兜底总结字数都在 30~90 之间'
  + (badFb.length ? '（越界：' + badFb.map(function (c) { return c.id + '(' + Array.from(c.fallbackSummary).length + ')'; }).join(' ') + '）' : ''));

const counts = {};
PRESETS.forEach(function (p) { counts[p.category] = (counts[p.category] || 0) + 1; });
console.log('  · 分布 ' + CATS.map(function (c) { return c.id + c.label + '=' + counts[c.id]; }).join(' '));

// ---------------------------------------------------------------- 词表
head('自由输入词表');
const strongOwner = {};
const crossStrong = [];
CATS.forEach(function (c) {
  (LEX[c.id].strong || []).forEach(function (w) {
    if (strongOwner[w]) crossStrong.push(w + '(' + strongOwner[w] + '/' + c.id + ')');
    else strongOwner[w] = c.id;
  });
});
ok(crossStrong.length === 0, 'strong 词跨类不重复'
  + (crossStrong.length ? '（重复：' + crossStrong.join(' ') + '）' : ''));

const thinLex = CATS.filter(function (c) { return (LEX[c.id].strong || []).length < 8; });
ok(thinLex.length === 0, '每类 strong 词不少于 8 个'
  + (thinLex.length ? '（偏少：' + thinLex.map(function (c) { return c.id; }).join(' ') + '）' : ''));

// 拿 100 条原文实测分类器。原文会被 presetForText 精确命中，所以要绕开它，
// 只测纯词表打分的部分——把原文改写成"口语化转述"不现实，这里退而求其次：
// 用原文但屏蔽精确匹配路径，直接复算打分逻辑。
function scoreOnly(raw) {
  const hay = raw.toLowerCase();
  const scored = CATS.map(function (c) {
    const lex = LEX[c.id];
    let s = 0;
    lex.strong.forEach(function (w) { if (hay.indexOf(w) >= 0) s += 2; });
    lex.weak.forEach(function (w) { if (hay.indexOf(w) >= 0) s += 1; });
    lex.exclude.forEach(function (w) { if (hay.indexOf(w) >= 0) s -= 3; });
    return { category: c.id, score: s };
  }).sort(function (a, b) { return b.score - a.score; });
  if (scored[0].score < 2 || (scored[0].score - scored[1].score) < 2) return null;
  return scored[0].category;
}
let right = 0, wrong = 0, low = 0;
const wrongList = [];
const lowList = [];
PRESETS.forEach(function (p) {
  const got = scoreOnly(p.text);
  if (got === null) { low += 1; lowList.push(p.id + ' 「' + p.text + '」 应为 ' + p.category); }
  else if (got === p.category) right += 1;
  else { wrong += 1; wrongList.push(p.id + ' 「' + p.text + '」 ' + p.category + '→' + got); }
});
console.log('  · 100 条原文实测：判对 ' + right + ' / 判错 ' + wrong + ' / 置信度不足 ' + low);
ok(wrong <= 8, '误判不超过 8 条（实际 ' + wrong + '）');
warn(right >= 70, '判对率偏低：' + right + '%');
if (wrongList.length) {
  wrongList.slice(0, 12).forEach(function (s) { console.log('      ✗ ' + s); });
  if (wrongList.length > 12) console.log('      …还有 ' + (wrongList.length - 12) + ' 条');
}
// 置信度不足不算失败——分类器宁可让用户手选也不猜。列出来只是为了知道是哪几条。
lowList.forEach(function (s) { console.log('      ? ' + s); });

// ---------------------------------------------------------------- 运行时 API
head('运行时 API');
const p1 = W.createProfile('考试压力');
ok(p1.presetId !== null && p1.gadget && p1.keyword, 'createProfile 命中预设时带出道具与关键词');
ok(W.summaryFor(p1).length > 10, 'summaryFor 对预设烦恼返回个性化总结');

const p2 = W.createProfile('我妈天天念叨我什么时候结婚', { category: 'C01' });
ok(p2.isCustom === true, 'createProfile 能标记自由输入');
ok(W.summaryFor(p2) === W.category('C01').fallbackSummary, 'summaryFor 对自由输入退回大类兜底总结');
ok(Array.from(p2.keyword).length <= 6, 'deriveKeyword 把自由输入截到 6 字以内');

ok(W.hoverPreview('C03').length === 3, 'hoverPreview 返回 3 条');
ok(W.byCategory('C03').length === counts.C03, 'byCategory 条数正确');
ok(W.classifyFreeText('') === null, '空输入返回 null');
ok(W.classifyFreeText('阿巴阿巴阿巴') === null, '无法识别时返回 null（不猜）');

// 阈值必须来自 config.js，而不是 worry-data.js 里的兜底常量。
const cfgKeys = ['CLASSIFY_STRONG_WEIGHT', 'CLASSIFY_WEAK_WEIGHT', 'CLASSIFY_EXCLUDE_PENALTY',
  'CLASSIFY_MIN_SCORE', 'CLASSIFY_MIN_MARGIN', 'CLASSIFY_HIGH_SCORE', 'BUBBLE_KEYWORD_MAX_CHARS'];
const missCfg = cfgKeys.filter(function (k) { return typeof CFG[k] !== 'number'; });
ok(missCfg.length === 0, '分类器阈值都在 config.js 里' + (missCfg.length ? '（缺：' + missCfg.join(' ') + '）' : ''));
ok(CFG.CLASSIFY_STRONG_WEIGHT === 2 && CFG.CLASSIFY_EXCLUDE_PENALTY === 3,
  'config.js 的权重与校验脚本用的一致（否则上面的实测数字不作数）');

const pool = G.reelPool(0);
ok(pool.length === 21, 'reelPool 返回 20 道具 + 1 空位');
ok(pool.filter(function (x) { return x === null; }).length === 1, 'reelPool 恰有 1 个空位');
ok(JSON.stringify(G.reelPool(1)) !== JSON.stringify(G.reelPool(2)), 'reelPool 不同 offset 顺序不同');

// ---------------------------------------------------------------- 汇总
console.log('\n' + '='.repeat(60));
if (warns.length) console.log('提醒 ' + warns.length + ' 条');
if (fails.length) {
  console.log('失败 ' + fails.length + ' 条：');
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('全部通过。');
