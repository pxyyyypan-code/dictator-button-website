"""_measure-draft.py —— 量稿工具：扫初稿左半屏的文字行带，用来定字号刻度。

初稿是 1672 宽的位图，CSS 要按 1440 基准写，所以量出来的行高要乘 1440/1672≈0.861。
"""
import os

from PIL import Image

DRAFTS = r'D:\Desktop\独裁者按钮\素材\UI界面初稿'
SCALE = 1440 / 1672


def bands_of(path, x0_ratio, x1_ratio, threshold=175):
    im = Image.open(path).convert('L')
    w, h = im.size
    x0, x1 = int(w * x0_ratio), int(w * x1_ratio)
    crop = im.crop((x0, 0, x1, h))
    px = crop.load()
    cw, ch = crop.size

    rows = []
    for y in range(ch):
        count = 0
        for x in range(0, cw, 2):          # 隔列采样，纯 PIL 全扫太慢
            if px[x, y] < threshold:
                count += 1
        rows.append(count)

    bands, start = [], None
    for y, v in enumerate(rows):
        if v > 2 and start is None:
            start = y
        elif v <= 2 and start is not None:
            if y - start > 4:
                bands.append((start, y, y - start, round((y - start) * SCALE)))
            start = None
    if start is not None:
        bands.append((start, ch, ch - start, round((ch - start) * SCALE)))
    return bands


if __name__ == '__main__':
    for name, x0, x1 in [('U2.png', 0.03, 0.50), ('U5.png', 0.03, 0.52),
                         ('U12.png', 0.03, 0.50), ('U11.png', 0.03, 0.52),
                         ('U8.png', 0.52, 0.97)]:
        path = os.path.join(DRAFTS, name)
        if not os.path.exists(path):
            continue
        print(name)
        for b in bands_of(path, x0, x1):
            print('   y%-5d h=%-4d ≈%dpx @1440' % (b[0], b[2], b[3]))
