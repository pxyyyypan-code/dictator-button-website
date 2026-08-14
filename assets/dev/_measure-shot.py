"""_measure-shot.py —— 把量稿工具对准自己的截图，和初稿逐行对比。

初稿是 1672 宽、截图是 1440 宽，_measure-draft.py 已经把初稿折算到 1440，
所以这里的数字可以和它直接并排看，不必再换算。

用法：
    python assets/dev/_measure-shot.py
"""
import os

from PIL import Image

SHOTS = os.path.join(os.path.dirname(__file__), '_shots-v08', '1440x900')


def bands_of(path, x0_ratio, x1_ratio, threshold=175):
    im = Image.open(path).convert('L')
    w, h = im.size
    crop = im.crop((int(w * x0_ratio), 0, int(w * x1_ratio), h))
    px = crop.load()
    cw, ch = crop.size

    rows = []
    for y in range(ch):
        count = 0
        for x in range(0, cw, 2):
            if px[x, y] < threshold:
                count += 1
        rows.append(count)

    bands, start = [], None
    for y, v in enumerate(rows):
        if v > 2 and start is None:
            start = y
        elif v <= 2 and start is not None:
            if y - start > 4:
                bands.append((start, y - start))
            start = None
    if start is not None:
        bands.append((start, ch - start))
    return bands


if __name__ == '__main__':
    for name, x0, x1 in [('u02.png', 0.03, 0.50), ('u05.png', 0.03, 0.52),
                         ('u12.png', 0.03, 0.50), ('u08.png', 0.52, 0.97)]:
        path = os.path.join(SHOTS, name)
        if not os.path.exists(path):
            continue
        print(name)
        for y, h in bands_of(path, x0, x1):
            print('   y%-5d h=%d' % (y, h))
