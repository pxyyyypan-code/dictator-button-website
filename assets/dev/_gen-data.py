#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
_gen-data.py —— 生成 js/worry-data.js 与 js/gadget-data.js

输入：
  assets/dev/_source.json        由 _dump-source.py 从 烦恼分类.xlsx 抽出（机器可信）
  assets/dev/_behavior-map.json  由 _freeze-behavior.py 固化的 B1~B10 分配（按 id 继承）
  assets/dev/_authored.json      人工撰写部分：关键词 / 兜底总结 / 悬停预览 / 分类词表
  assets/images/gadgets/*.webp   读取实际像素尺寸，写进数据供布局限制放大倍数

输出的两个 js 文件是**生成产物，不要手改**；要改内容改上面四个输入再重跑。

用法：python assets/dev/_gen-data.py
"""

import os
import json

from PIL import Image

DEV = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(DEV, '..', '..'))
IMG = os.path.join(REPO, 'assets', 'images')

# 10 类行为的填充色。规格把气泡限制在「米白 / 浅青」两族（画在 #049DBF 蓝底上），
# 所以 10 类共用 6 级明度，辨识度由运动方式与点击手感承担，不是靠色相。
RAMP = {
    'P0': '#F7F4EC',  # 纸白
    'P1': '#F5F0E6',  # 米白
    'P2': '#EBE2CE',  # 米白·深
    'P3': '#DCEFF4',  # 青·极浅
    'P4': '#B9E2EA',  # 青·浅
    'P5': '#93CFDE',  # 青·中
}
INK = '#0A3B47'

BEHAVIOR_TYPES = [
    ('B1_LIGHT',    '轻散型', 'P0', '体积偏轻、持续上浮；点击后迅速散成细小光点。'),
    ('B2_ESCAPE',   '逃避型', 'P3', '鼠标靠近就主动远离；第一次点击会明显冲刺躲开。'),
    ('B3_SPLIT',    '增殖型', 'P4', '平静期删除时会留下分裂残影；失控后真正裂成 2～4 个子泡泡。'),
    ('B4_RETURN',   '回返型', 'P1', '点击后消散，但会在短暂延迟后从另一处重新出现。'),
    ('B5_CLUSTER',  '聚集型', 'P3', '主动向附近对象靠拢形成团簇；删除一个会牵动整个小群。'),
    ('B6_STUBBORN', '顽固型', 'P2', '边缘更厚、更沉；必须连续点击多次，裂纹才会扩散并最终消失。'),
    ('B7_LINKED',   '牵连型', 'P4', '会与最近的对象形成可见连接；处理它会让被牵连对象突然变大。'),
    ('B8_BURST',    '突发型', 'P0', '会周期性高速窜动；第一次点击也会突然冲走。'),
    ('B9_PRESSURE', '压迫型', 'P5', '持续膨胀并产生压迫脉冲；点击只能先把它压小，多次处理后才消失。'),
    ('B10_BLUR',    '模糊型', 'P2', '轮廓和文字明显失焦；靠近或先点击"看清"后，第二次才能真正删除。'),
]

# 独裁者按钮不在 xlsx 的 20 个道具里，说明取自 U2 剧情对白。
DICTATOR_DESC = ('只要说出想让谁消失并按下它，对方就会从世界以及所有人的记忆中暂时消失。'
                 '不过，消失不一定等于真正解决——它可能会影响你接下来的每一步。')

BANNER = ('/**\n'
          ' * %s —— 生成产物，请勿手改。\n'
          ' * 生成器：assets/dev/_gen-data.py\n'
          ' * 数据源：烦恼/烦恼分类.xlsx（经 _dump-source.py）+ assets/dev/_authored.json\n'
          ' * 要改内容请改数据源后重跑生成器，不要直接编辑本文件。\n'
          ' */\n')


def js(v):
    """把 Python 值转成 JS 字面量（JSON 是 JS 的子集，直接复用并保留中文）。"""
    return json.dumps(v, ensure_ascii=False)


def load(name):
    path = os.path.join(DEV, name)
    if not os.path.exists(path):
        raise SystemExit('缺少输入文件 %s' % path)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def image_size(rel):
    path = os.path.join(REPO, rel.replace('/', os.sep))
    if not os.path.exists(path):
        raise SystemExit('缺少图片 %s（先跑 _build-assets.py）' % path)
    with Image.open(path) as im:
        return im.size


# --------------------------------------------------------------------------- #
# worry-data.js
# --------------------------------------------------------------------------- #

def build_worry_data(src, behavior, authored):
    kw = {int(it['id']): it['keyword'] for it in authored['keywords']}
    fallback = {it['category']: it['fallbackSummary'] for it in authored['fallbackSummaries']}
    hover = {it['category']: list(it['ids']) for it in authored['hoverPreview']}
    lexicon = {it['category']: {'strong': it['strong'], 'weak': it['weak'], 'exclude': it['exclude']}
               for it in authored['lexicon']}

    lines = [BANNER % 'worry-data.js', "'use strict';\n"]

    lines.append(
        '/* 10 类交互行为。这是交互设计分类，不是心理学诊断，前台永远不显示 B1~B10。\n'
        '   配色被规格限制在「米白 / 浅青」两族（气泡画在 #049DBF 蓝底上），因此 10 类共用\n'
        '   6 级明度，辨识度主要由运动方式与点击手感承担，不靠色相区分。 */')
    lines.append('const BEHAVIOR_TYPES = {')
    for key, name, ramp, desc in BEHAVIOR_TYPES:
        lines.append('  %-13s { id: %s, name: %s, color: %s, ink: %s, description: %s },'
                     % (key + ':', js(key), js(name), js(RAMP[ramp]), js(INK), js(desc)))
    lines[-1] = lines[-1].rstrip(',')
    lines.append('};\n')

    lines.append('/* 9 个烦恼大类，与 烦恼分类.xlsx 的分类编号一致。\n'
                 '   hoverPreview 是 U3 悬停时浮出的 3 条代表烦恼（存 id，正文只在 WORRY_PRESETS 里存一份）。\n'
                 '   fallbackSummary 用于自由输入且匹配不到具体烦恼时的结尾总结。 */')
    lines.append('const WORRY_CATEGORIES = [')
    for c in src['categories']:
        cid = c['id']
        image = 'assets/images/worries/worry-%02d.webp' % c['imageIndex']
        w, h = image_size(image)
        lines.append('  {')
        lines.append('    id: %s, label: %s, fullName: %s,' % (js(cid), js(c['label']), js(c['fullName'])))
        lines.append('    note: %s,' % js(c['note']))
        lines.append('    image: %s, imageWidth: %d, imageHeight: %d,' % (js(image), w, h))
        lines.append('    hoverPreview: %s,' % js(hover[cid]))
        lines.append('    fallbackSummary: %s' % js(fallback[cid]))
        lines.append('  },')
    lines[-1] = lines[-1].rstrip(',')
    lines.append('];\n')

    lines.append('/* 100 条预设烦恼。text/category/gadget/summary 来自 xlsx；\n'
                 '   behaviorType 按 id 继承自 V0.7；keyword 是画在气泡里的短词。 */')
    lines.append('const WORRY_PRESETS = [')
    prev_cat = None
    for w in src['worries']:
        if prev_cat and w['category'] != prev_cat:
            lines.append('')
        prev_cat = w['category']
        b = behavior[str(w['id'])]['behaviorType']
        lines.append('  { id: %d, text: %s, keyword: %s, category: %s, behaviorType: %s,'
                     % (w['id'], js(w['text']), js(kw[w['id']]), js(w['category']), js(b)))
        lines.append('    gadget: %s, summary: %s },' % (js(w['gadget']), js(w['summary'])))
    lines[-1] = lines[-1].rstrip(',')
    lines.append('];\n')

    lines.append('/* 自由输入的本地关键词词表。项目禁止调用任何外部 AI / 接口，分类完全靠\n'
                 '   indexOf 子串命中打分。宁可判"置信度不足"让用户手选，也不要猜错后随机发道具。 */')
    lines.append('const WORRY_LEXICON = {')
    for cid in [c['id'] for c in src['categories']]:
        lx = lexicon[cid]
        lines.append('  %s: {' % cid)
        lines.append('    strong: %s,' % js(lx['strong']))
        lines.append('    weak: %s,' % js(lx['weak']))
        lines.append('    exclude: %s' % js(lx['exclude']))
        lines.append('  },')
    lines[-1] = lines[-1].rstrip(',')
    lines.append('};\n')

    lines.append(RUNTIME_WORRY)
    return '\n'.join(lines)


RUNTIME_WORRY = r'''const WorryData = (function () {
  const weightedTypes = [
    ['B1_LIGHT', 10], ['B2_ESCAPE', 10], ['B3_SPLIT', 12], ['B4_RETURN', 15], ['B5_CLUSTER', 10],
    ['B6_STUBBORN', 12], ['B7_LINKED', 8], ['B8_BURST', 8], ['B9_PRESSURE', 8], ['B10_BLUR', 7]
  ];

  const byId = {};
  WORRY_PRESETS.forEach(function (item) { byId[item.id] = item; });

  const categoryById = {};
  WORRY_CATEGORIES.forEach(function (item) { categoryById[item.id] = item; });

  // 阈值都放 config.js；这里只做取值兜底，避免脚本顺序变动时炸掉。
  function cfg(key, fallback) {
    if (typeof CONFIG === 'object' && CONFIG && typeof CONFIG[key] === 'number') return CONFIG[key];
    return fallback;
  }

  function normalize(text) {
    return String(text || '').trim().toLowerCase().replace(/[\s，。！？、,.!?/\\_-]+/g, '');
  }

  function presetForText(text) {
    const needle = normalize(text);
    if (!needle) return null;
    const exact = WORRY_PRESETS.find(function (item) { return normalize(item.text) === needle; });
    if (exact) return exact;
    return WORRY_PRESETS.find(function (item) {
      const itemText = normalize(item.text);
      return itemText.length >= 4 && (needle.includes(itemText) || itemText.includes(needle));
    }) || null;
  }

  function preset(id) { return byId[Number(id)] || null; }
  function category(id) { return categoryById[id] || null; }

  function byCategory(id) {
    return WORRY_PRESETS.filter(function (item) { return item.category === id; });
  }

  function hoverPreview(id) {
    const cat = categoryById[id];
    if (!cat) return [];
    return cat.hoverPreview.map(preset).filter(Boolean);
  }

  /**
   * 自由输入分类：子串命中打分，纯本地，无网络无 AI。
   * 返回 null 表示置信度不足——此时前台必须提示用户手动选类，不得随机分配道具。
   */
  function classifyFreeText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const hit = presetForText(raw);
    if (hit) {
      return { category: hit.category, confidence: 'exact', score: null, runnerUp: null, presetId: hit.id };
    }

    const strong = cfg('CLASSIFY_STRONG_WEIGHT', 2);
    const weak = cfg('CLASSIFY_WEAK_WEIGHT', 1);
    const penalty = cfg('CLASSIFY_EXCLUDE_PENALTY', 3);

    // 词表里的英文条目（deadline / ddl / emo）一律小写，这里把原文也压成小写再比，
    // 中文不受影响。
    const hay = raw.toLowerCase();

    const scored = WORRY_CATEGORIES.map(function (cat) {
      const lex = WORRY_LEXICON[cat.id] || { strong: [], weak: [], exclude: [] };
      let score = 0;
      lex.strong.forEach(function (w) { if (hay.indexOf(w) >= 0) score += strong; });
      lex.weak.forEach(function (w) { if (hay.indexOf(w) >= 0) score += weak; });
      lex.exclude.forEach(function (w) { if (hay.indexOf(w) >= 0) score -= penalty; });
      return { category: cat.id, score: score };
    }).sort(function (a, b) { return b.score - a.score; });

    const top = scored[0];
    const second = scored[1];
    if (top.score < cfg('CLASSIFY_MIN_SCORE', 2)) return null;
    if ((top.score - second.score) < cfg('CLASSIFY_MIN_MARGIN', 2)) return null;

    return {
      category: top.category,
      confidence: top.score >= cfg('CLASSIFY_HIGH_SCORE', 5) ? 'high' : 'low',
      score: top.score,
      runnerUp: second.category,
      presetId: null
    };
  }

  function randomBehaviorType() {
    const total = weightedTypes.reduce(function (sum, pair) { return sum + pair[1]; }, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < weightedTypes.length; i += 1) {
      roll -= weightedTypes[i][1];
      if (roll <= 0) return weightedTypes[i][0];
    }
    return 'B1_LIGHT';
  }

  /** 自由输入没有预设关键词时，从原文截一个能塞进气泡的短词。 */
  function deriveKeyword(text) {
    const clean = String(text || '').replace(/[\s，。！？、,.!?]+/g, '');
    return clean.slice(0, cfg('BUBBLE_KEYWORD_MAX_CHARS', 6)) || '烦恼';
  }

  function createProfile(text, options) {
    const opts = options || {};
    const found = opts.presetId ? preset(opts.presetId) : presetForText(text);
    const behaviorType = opts.behaviorType || (found && found.behaviorType) || randomBehaviorType();
    const cat = opts.category || (found && found.category) || null;
    return {
      id: 'worry-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      text: String(text || '').trim(),
      keyword: (found && found.keyword) || deriveKeyword(text),
      category: cat,
      presetId: found ? found.id : null,
      behaviorType: behaviorType,
      gadget: (found && found.gadget) || (opts.gadget || null),
      isCustom: !found
    };
  }

  /** 结尾页文案：预设烦恼用它自己的总结，自由输入退回大类兜底总结。 */
  function summaryFor(profile) {
    if (!profile) return '';
    const found = profile.presetId ? preset(profile.presetId) : presetForText(profile.text);
    if (found) return found.summary;
    const cat = categoryById[profile.category];
    return cat ? cat.fallbackSummary : '';
  }

  function gadgetNameFor(profile) {
    if (!profile) return null;
    if (profile.gadget) return profile.gadget;
    const found = profile.presetId ? preset(profile.presetId) : presetForText(profile.text);
    return found ? found.gadget : null;
  }

  function examples(categoryId, count) {
    const pool = categoryId && categoryId !== 'all' ? byCategory(categoryId) : WORRY_PRESETS.slice();
    const copy = pool.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i]; copy[i] = copy[j]; copy[j] = temp;
    }
    return copy.slice(0, Math.max(1, Number(count) || 6));
  }

  function behavior(type) {
    return BEHAVIOR_TYPES[type] || BEHAVIOR_TYPES.B1_LIGHT;
  }

  return {
    categories: WORRY_CATEGORIES,
    presets: WORRY_PRESETS,
    behaviorTypes: BEHAVIOR_TYPES,
    lexicon: WORRY_LEXICON,
    preset: preset,
    category: category,
    byCategory: byCategory,
    hoverPreview: hoverPreview,
    classifyFreeText: classifyFreeText,
    summaryFor: summaryFor,
    gadgetNameFor: gadgetNameFor,
    deriveKeyword: deriveKeyword,
    createProfile: createProfile,
    examples: examples,
    behavior: behavior,
    presetForText: presetForText,
    randomBehaviorType: randomBehaviorType
  };
})();
'''


# --------------------------------------------------------------------------- #
# gadget-data.js
# --------------------------------------------------------------------------- #

def build_gadget_data(src):
    lines = [BANNER % 'gadget-data.js', "'use strict';\n"]

    groups = []
    for g in src['gadgets']:
        if g['group'] not in groups:
            groups.append(g['group'])

    lines.append('/* 5 个道具大类，顺序与 xlsx「道具统计」一致。 */')
    lines.append('const GADGET_GROUPS = %s;\n' % js(groups))

    lines.append('/* 20 个未来道具。图片走**显式索引映射**，不靠文件名推断——\n'
                 '   源文件叫「6透明斗篷」，xlsx 里叫「隐身斗篷」，只有索引是可靠的。\n'
                 '   width/height 是压缩后的实际像素，布局时据此限制放大倍数：\n'
                 '   其中 12 个源图只有 200×200，裁边后最小的只有 88×182，放大超过 2 倍会明显发糊。 */')
    lines.append('const GADGETS = [')
    for i, g in enumerate(src['gadgets'], start=1):
        image = 'assets/images/gadgets/gadget-%02d.webp' % i
        w, h = image_size(image)
        lines.append('  { id: %d, name: %s, group: %s,' % (i, js(g['name']), js(g['group'])))
        lines.append('    image: %s, width: %d, height: %d,' % (js(image), w, h))
        lines.append('    description: %s },' % js(g['description']))
    lines[-1] = lines[-1].rstrip(',')
    lines.append('];\n')

    dw, dh = image_size('assets/images/gadgets/dictator.webp')
    lines.append('/* 独裁者按钮不在 xlsx 的 20 个道具里（它不是"匹配"得到的道具），\n'
                 '   说明取自 U2 剧情对白。源图仅 %dx%d，只适合当小图标；\n'
                 '   U8 那个大型红色按钮请用几何色块绘制，不要放大这张图。 */' % (dw, dh))
    lines.append('const DICTATOR_BUTTON = {')
    lines.append('  id: 0, name: "独裁者按钮", group: %s,' % js(groups[-1]))
    lines.append('  image: "assets/images/gadgets/dictator.webp", width: %d, height: %d,' % (dw, dh))
    lines.append('  description: %s' % js(DICTATOR_DESC))
    lines.append('};\n')

    lines.append(RUNTIME_GADGET)
    return '\n'.join(lines)


RUNTIME_GADGET = r'''const GadgetData = (function () {
  const byName = {};
  const byId = {};
  GADGETS.forEach(function (item) { byName[item.name] = item; byId[item.id] = item; });

  function get(name) { return byName[name] || null; }
  function byIndex(id) { return byId[Number(id)] || null; }

  function inGroup(group) {
    return GADGETS.filter(function (item) { return item.group === group; });
  }

  /** 按烦恼取匹配道具。烦恼 → 道具名的映射只存在 worry-data.js 里，这里不复制一份。 */
  function forWorry(worryOrId) {
    if (typeof WorryData === 'undefined') return null;
    const name = typeof worryOrId === 'object'
      ? WorryData.gadgetNameFor(worryOrId)
      : (WorryData.preset(worryOrId) || {}).gadget;
    return name ? get(name) : null;
  }

  /**
   * 老虎机滚轮：20 个道具 + 1 个空位（null）。
   * offset 让三列错开起始位置，因此三列外观不同但不依赖随机数。
   */
  function reelPool(offset) {
    const pool = GADGETS.slice();
    const gap = Math.abs(Number(offset) || 0) % (pool.length + 1);
    pool.splice(gap, 0, null);
    const shift = (Math.abs(Number(offset) || 0) * 7) % pool.length;
    return pool.slice(shift).concat(pool.slice(0, shift));
  }

  return {
    all: GADGETS,
    groups: GADGET_GROUPS,
    dictator: DICTATOR_BUTTON,
    get: get,
    byName: get,
    byIndex: byIndex,
    inGroup: inGroup,
    forWorry: forWorry,
    reelPool: reelPool
  };
})();
'''


def main():
    src = load('_source.json')
    behavior = load('_behavior-map.json')
    authored = load('_authored.json')

    worry_js = build_worry_data(src, behavior, authored)
    gadget_js = build_gadget_data(src)

    for rel, body in (('js/worry-data.js', worry_js), ('js/gadget-data.js', gadget_js)):
        path = os.path.join(REPO, rel.replace('/', os.sep))
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(body)
        print('写入 %-22s %5d 行' % (rel, body.count('\n') + 1))


if __name__ == '__main__':
    main()
