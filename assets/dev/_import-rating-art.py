# -*- coding: utf-8 -*-
"""
_import-rating-art.py —— 把星级结算与收藏册用到的四张原型素材转成 webp 收进主站。

来源：独裁者按钮_星级评定与20道具收藏_独立原型_V2/assets/ui/
产物：assets/images/ui/{ribbon,star-gray,star-yellow,collection}.webp

原图是 400~700KB 的 PNG，四张加起来 2.1MB，直接搬进来会拖慢首屏。
这里统一转 webp（带 alpha，q=92）。

锦旗单独处理：原图是 1024x1536 的竖幅，四周还留了大片透明边。
结算卡要的是横幅，如果留着竖幅在 CSS 里 rotate(90deg)，object-fit:contain
会按**未旋转**的框去算内切，透明边一起参与计算，实际画出来只有框宽的一半，
三颗星就会挂到锦旗外面去。所以旋转和裁边都在这里一次做掉，
CSS 只剩一个自然比例的 <img>，不再有 transform。
改这里之后记得同步 index.html 上锦旗的 width/height 与 style.css 的 --ribbon-ar。
"""
import os
from PIL import Image

SRC = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    '..', '..', '独裁者按钮_星级评定与20道具收藏_独立原型_V2', 'assets', 'ui'
)
DST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'images', 'ui')

NAMES = ['ribbon', 'star-gray', 'star-yellow', 'collection']


def trim(img):
    """按 alpha 裁掉四周透明边；素材要是不带 alpha 就原样返回。"""
    box = img.getchannel('A').getbbox()
    return img.crop(box) if box else img


def main():
    src = os.path.normpath(SRC)
    dst = os.path.normpath(DST)
    for name in NAMES:
        img = Image.open(os.path.join(src, name + '.png')).convert('RGBA')
        before = img.size
        if name == 'ribbon':
            # ROTATE_270 = 顺时针 90°，和原先 CSS 里的 rotate(90deg) 同向：
            # 竖幅的两个尖角转到左右两端，中段下沉成吊床形，三颗星正好落在中段。
            img = trim(img).transpose(Image.ROTATE_270)
        out = os.path.join(dst, name + '.webp')
        img.save(out, 'WEBP', quality=92, method=6)
        note = ''
        if img.size != before:
            note = '  <- %dx%d  比例 %.4f' % (before[0], before[1], img.size[0] / img.size[1])
        print('%-14s %-12s %8d bytes%s' % (name, '%dx%d' % img.size, os.path.getsize(out), note))


if __name__ == '__main__':
    main()
