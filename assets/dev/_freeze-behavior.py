#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
_freeze-behavior.py —— 把现有 js/worry-data.js 里 100 条预设的 B1~B10 行为分配固化成
_behavior-map.json，供 _gen-data.py 生成新数据时按 id 继承。

只跑一次。跑完之后 worry-data.js 会被重新生成，这个 json 就是行为分配的历史锚点，
避免生成脚本去读它自己刚写出来的文件（自引用）。

同时输出一份 id 对齐报告：新旧文案在同一个 id 上是否指向同一条烦恼。
"""

import os
import re
import json

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
JS = os.path.join(REPO, 'js', 'worry-data.js')
SRC = os.path.join(os.path.dirname(__file__), '_source.json')
OUT = os.path.join(os.path.dirname(__file__), '_behavior-map.json')

PRESET_RE = re.compile(
    r"\{\s*id:\s*(\d+)\s*,\s*text:\s*'([^']*)'\s*,\s*category:\s*'([^']*)'\s*,"
    r"\s*behaviorType:\s*'([^']*)'\s*\}"
)


def main():
    with open(JS, encoding='utf-8') as f:
        js = f.read()
    old = [
        {'id': int(m.group(1)), 'text': m.group(2), 'oldCategory': m.group(3), 'behaviorType': m.group(4)}
        for m in PRESET_RE.finditer(js)
    ]
    if len(old) != 100:
        raise SystemExit('只解析到 %d 条预设，期望 100 条' % len(old))

    with open(SRC, encoding='utf-8') as f:
        new = {w['id']: w for w in json.load(f)['worries']}

    same, diff, missing = 0, [], []
    for o in old:
        n = new.get(o['id'])
        if n is None:
            missing.append(o['id'])
        elif n['text'] == o['text']:
            same += 1
        else:
            diff.append((o['id'], o['text'], n['text']))

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({str(o['id']): {'behaviorType': o['behaviorType'], 'oldText': o['text'],
                                  'oldCategory': o['oldCategory']} for o in old},
                  f, ensure_ascii=False, indent=1)

    print('写入 %s（%d 条行为分配）' % (OUT, len(old)))
    print('id 对齐：文案完全一致 %d / 100' % same)
    if missing:
        print('xlsx 中缺失的 id：%s' % missing)
    for i, a, b in diff:
        print('  id %-3d 旧「%s」 → 新「%s」' % (i, a, b))

    counts = {}
    for o in old:
        counts[o['behaviorType']] = counts.get(o['behaviorType'], 0) + 1
    print('行为分布：%s' % ' '.join('%s=%d' % kv for kv in sorted(counts.items())))


if __name__ == '__main__':
    main()
