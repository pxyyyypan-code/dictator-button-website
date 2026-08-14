#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
_build-assets.py —— 素材构建脚本（开发期手动运行，不参与运行时）

把仓库外的原始 PNG 素材裁掉透明边、限制长边、转成 WebP，写进 assets/images/。
原始素材 14MB，输出约 0.7MB。素材更新时重跑一次即可。

用法：
    python assets/dev/_build-assets.py [源素材根目录]

源目录默认取仓库上一级（D:\\Desktop\\独裁者按钮）。
道具图片按文件名前缀数字 1~20 索引，与 烦恼分类.xlsx「道具统计」表顺序一一对应；
唯一的名称差异是 6透明斗篷.png ↔ 表里的「隐身斗篷」，因此**只认索引、不认名称**。
"""

import os
import re
import sys
import glob

from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC_ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(REPO)
OUT_ROOT = os.path.join(REPO, 'assets', 'images')

WEBP = dict(quality=88, method=6)

# 道具：索引 -> 输出名。索引来自源文件名前缀数字，与 xlsx 表顺序对齐。
GADGET_COUNT = 20


def prepare(path, max_side, crop_alpha=True):
    """打开 → 可选裁掉透明边 → 限制长边（只缩不放）→ 返回 RGBA 图。"""
    im = Image.open(path).convert('RGBA')
    if crop_alpha:
        box = im.getbbox()
        if box:
            im = im.crop(box)
    if max(im.size) > max_side:
        im.thumbnail((max_side, max_side), Image.LANCZOS)
    return im


def save(im, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    im.save(out_path, 'WEBP', **WEBP)
    return os.path.getsize(out_path)


def build_gadgets(report):
    src_dir = os.path.join(SRC_ROOT, '道具')
    out_dir = os.path.join(OUT_ROOT, 'gadgets')
    found = {}
    for f in glob.glob(os.path.join(src_dir, '*.png')):
        base = os.path.basename(f).replace('已移除背景的', '').replace('.png', '')
        if base.startswith('AAA'):
            found['dictator'] = (f, base[3:])
            continue
        m = re.match(r'^(\d+)(.+)$', base)
        if m:
            found[int(m.group(1))] = (f, m.group(2))

    missing = [i for i in range(1, GADGET_COUNT + 1) if i not in found]
    if missing:
        raise SystemExit('道具素材缺失，索引：%s' % missing)
    if 'dictator' not in found:
        raise SystemExit('缺少独裁者按钮素材 已移除背景的AAA*.png')

    for i in range(1, GADGET_COUNT + 1):
        src, name = found[i]
        im = prepare(src, 400)
        out = os.path.join(out_dir, 'gadget-%02d.webp' % i)
        report.append(('gadget-%02d' % i, name, im.size, save(im, out)))

    src, name = found['dictator']
    im = prepare(src, 400)
    out = os.path.join(out_dir, 'dictator.webp')
    report.append(('dictator', name, im.size, save(im, out)))


def build_worries(report):
    src_dir = os.path.join(SRC_ROOT, '烦恼', '烦恼素材')
    out_dir = os.path.join(OUT_ROOT, 'worries')
    found = {}
    for f in glob.glob(os.path.join(src_dir, '*.png')):
        base = os.path.basename(f).replace('.png', '')
        m = re.match(r'^(\d+)(.+)$', base)
        if m:
            found[int(m.group(1))] = (f, m.group(2))

    missing = [i for i in range(1, 10) if i not in found]
    if missing:
        raise SystemExit('烦恼大类素材缺失，索引：%s' % missing)

    for i in range(1, 10):
        src, name = found[i]
        im = prepare(src, 360)
        out = os.path.join(out_dir, 'worry-%02d.webp' % i)
        report.append(('worry-%02d' % i, name, im.size, save(im, out)))


def build_ui(report):
    src_dir = os.path.join(SRC_ROOT, '素材', '其他素材')
    out_dir = os.path.join(OUT_ROOT, 'ui')
    # 对话框 / 提示框保持原始长宽比，只裁透明边并限制长边。
    for src_name, out_name, max_side in (
        ('对话框.png', 'dialog-frame.webp', 1200),
        ('提示框.png', 'tip-frame.webp', 1000),
    ):
        src = os.path.join(src_dir, src_name)
        if not os.path.exists(src):
            raise SystemExit('缺少 UI 素材：%s' % src)
        im = prepare(src, max_side)
        out = os.path.join(out_dir, out_name)
        report.append((out_name.replace('.webp', ''), src_name.replace('.png', ''), im.size, save(im, out)))


def main():
    if not os.path.isdir(SRC_ROOT):
        raise SystemExit('源素材根目录不存在：%s' % SRC_ROOT)
    report = []
    build_gadgets(report)
    build_worries(report)
    build_ui(report)

    total = sum(r[3] for r in report)
    print('源目录：%s' % SRC_ROOT)
    print('输出：  %s' % OUT_ROOT)
    print('-' * 62)
    for key, name, size, nbytes in report:
        print('%-14s %-10s %4dx%-4d %7.1f KB' % (key, name, size[0], size[1], nbytes / 1024))
    print('-' * 62)
    print('共 %d 个文件，合计 %.2f MB' % (len(report), total / 1048576))


if __name__ == '__main__':
    main()
