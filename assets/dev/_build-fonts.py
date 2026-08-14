#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
_build-fonts.py —— 千图马克手写体子集化

原始 TTF 有 10467 字、转 woff2 是 9.5MB，整包上线不现实。但规格里它只承担
「少量情绪短句或烦恼关键词」，不做长正文，所以按**站内实际出现过的字**裁剪即可。

字表来源是全仓扫描（数据 JSON + index.html + js + css，扫描前先去掉注释），
所以后续阶段新写的界面文案只要落进这些文件，重跑一次就自动被收进来，
不需要手工维护字表。真有扫不到的字（比如运行时拼出来的），写进 _hand-extra.txt。

同时输出 js/font-support.js：把裁进去的字表交给运行时。自由输入的烦恼关键词
可能含子集外的字，逐字回退会让一个词里半手写半黑体，很难看——运行时据此判断
「整词能不能用手写体」，不能就整词用主字体。

仓耳渔阳体不裁：它是界面主字体，自由输入需要全字符覆盖，
而且它本身 7049 字才 800KB，已经足够高效。

用法：python assets/dev/_build-fonts.py [源素材根目录]
"""

import os
import re
import io
import sys
import json
import glob

from fontTools import subset
from fontTools.ttLib import TTFont

DEV = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(DEV, '..', '..'))
SRC_ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(REPO)

TTF = os.path.join(SRC_ROOT, '千图马克手写体', '千图马克手写体.TTF')
OUT_FONT = os.path.join(REPO, 'assets', 'fonts', 'QiantuMarker.woff2')
OUT_JS = os.path.join(REPO, 'js', 'font-support.js')
EXTRA = os.path.join(DEV, '_hand-extra.txt')

CJK = re.compile(r'[㐀-䶿一-鿿豈-﫿]')

# 标点与拉丁：手写体里这些字形也有设计，短句里混排会用到。
BASE = (set(range(0x20, 0x7F))
        | {0x00B7, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026,
           0x3001, 0x3002, 0x300A, 0x300B, 0x300C, 0x300D, 0x3010, 0x3011,
           0xFF01, 0xFF08, 0xFF09, 0xFF0C, 0xFF1A, 0xFF1B, 0xFF1F, 0xFF5E,
           0x2192, 0x2014})


def strip_comments(text, css_only=False):
    """去掉注释再扫字，避免把开发注释里的字也塞进字体。"""
    text = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
    if not css_only:
        text = re.sub(r'(?m)//.*$', ' ', text)
    return text


def scan_sources():
    """返回 {字: [来源, ...]}，顺带能报告每个字是哪来的。"""
    found = {}

    def add(ch, where):
        found.setdefault(ch, set()).add(where)

    def eat(text, where):
        for ch in CJK.findall(text):
            add(ch, where)

    # 1. 数据层（生成 js 的真正来源，最权威）
    for name in ('_source.json', '_authored.json'):
        path = os.path.join(DEV, name)
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                eat(f.read(), name)

    # 2. 页面与脚本、样式里的界面文案
    for pattern, css_only in (('index.html', False), ('js/*.js', False), ('css/*.css', True)):
        for path in sorted(glob.glob(os.path.join(REPO, pattern))):
            rel = os.path.relpath(path, REPO).replace(os.sep, '/')
            if rel == 'js/font-support.js':
                continue  # 生成产物，自己扫自己没意义
            with open(path, encoding='utf-8') as f:
                eat(strip_comments(f.read(), css_only), rel)

    # 3. 手工补充
    if os.path.exists(EXTRA):
        with open(EXTRA, encoding='utf-8') as f:
            eat(strip_comments(f.read()), '_hand-extra.txt')

    return found


def build_subset(codepoints):
    opt = subset.Options()
    opt.flavor = 'woff2'
    opt.desubroutinize = True
    opt.layout_features = ['*']
    opt.drop_tables += ['DSIG']
    opt.notdef_outline = True
    font = subset.load_font(TTF, opt)
    s = subset.Subsetter(options=opt)
    s.populate(unicodes=codepoints)
    s.subset(font)
    buf = io.BytesIO()
    subset.save_font(font, buf, opt)
    return buf.getvalue()


RUNTIME = '''/**
 * font-support.js —— 生成产物，请勿手改。
 * 生成器：assets/dev/_build-fonts.py
 *
 * 千图马克手写体按站内实际用字裁过（原始 9.5MB → 见下方体积注释），所以
 * 自由输入的烦恼关键词可能含子集外的字。浏览器的字体回退是**逐字**的，
 * 一个词里半手写半黑体很难看，所以这里提供整词判断：
 * 只有整词都在子集里才加手写体，否则整词用主字体。
 */
'use strict';

/* 子集里的字符，共 %(count)d 个。 */
const FONT_HAND_CHARSET = %(charset)s;

const FontSupport = (function () {
  const hand = new Set(Array.from(FONT_HAND_CHARSET));

  /* 字体栈只在这里写一次，CSS 那边对应 --ff-hand / --ff，两边要一致。 */
  const HAND_FONT_STACK = '"Qiantu Marker", "Canger YuYangTi", "Microsoft YaHei", sans-serif';
  const MAIN_FONT_STACK = '"Canger YuYangTi", "Microsoft YaHei", "PingFang SC", sans-serif';

  /** 整词能否用手写体渲染。空串返回 false（没内容就别切字体）。 */
  function canRenderHand(text) {
    const s = String(text || '');
    if (!s.trim()) return false;
    for (const ch of s) {
      if (ch === ' ' || ch === '\\n' || ch === '\\t') continue;
      if (!hand.has(ch)) return false;
    }
    return true;
  }

  /**
   * 给元素挂手写体：能整词渲染就加 .u-hand，不能就什么都不做（保持主字体）。
   * 返回是否用上了手写体，便于调用方做别的补偿。
   */
  function applyHand(el, text) {
    if (!el) return false;
    const s = text === undefined ? el.textContent : text;
    const ok = canRenderHand(s);
    el.classList.toggle('u-hand', ok);
    return ok;
  }

  /** Canvas 里没有 class，直接返回该用哪个字体栈。 */
  function fontStackFor(text) {
    return canRenderHand(text) ? HAND_FONT_STACK : MAIN_FONT_STACK;
  }

  return {
    charset: hand,
    canRenderHand: canRenderHand,
    applyHand: applyHand,
    fontStackFor: fontStackFor,
    HAND_FONT_STACK: HAND_FONT_STACK,
    MAIN_FONT_STACK: MAIN_FONT_STACK
  };
})();
'''


def main():
    if not os.path.exists(TTF):
        raise SystemExit('找不到 %s' % TTF)

    avail = set(TTFont(TTF, lazy=True).getBestCmap())
    found = scan_sources()

    wanted = BASE | {ord(c) for c in found}
    missing = sorted(c for c in found if ord(c) not in avail)
    codepoints = wanted & avail

    data = build_subset(codepoints)
    os.makedirs(os.path.dirname(OUT_FONT), exist_ok=True)
    with open(OUT_FONT, 'wb') as f:
        f.write(data)

    charset = ''.join(sorted((chr(cp) for cp in codepoints), key=ord))
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(RUNTIME % {'count': len(codepoints),
                           'charset': json.dumps(charset, ensure_ascii=False)})

    raw = os.path.getsize(TTF) / 1048576.0
    print('千图马克手写体：原始 %.1f MB / %d 字' % (raw, len(avail)))
    print('  扫描到站内用字 %d，加标点拉丁共 %d 字，裁后 %.1f KB'
          % (len(found), len(codepoints), len(data) / 1024.0))
    print('  写入 %s' % os.path.relpath(OUT_FONT, REPO).replace(os.sep, '/'))
    print('  写入 %s' % os.path.relpath(OUT_JS, REPO).replace(os.sep, '/'))
    if missing:
        print('  ! 字体本身缺这些字，将回退主字体：%s' % ''.join(missing))

    by_src = {}
    for ch, wheres in found.items():
        for w in wheres:
            by_src[w] = by_src.get(w, 0) + 1
    print('  字符来源：%s' % ' '.join('%s=%d' % kv for kv in sorted(by_src.items())))


if __name__ == '__main__':
    main()
