"""_measure-pitch.py —— 量汉字的「步进」（反推字号）与实心色块（反推按钮尺寸）。

墨迹高度不能直接当字号：不同字体的字面率不一样，「记忆面包」和
「这个按钮，」在同一字号下墨高能差 10px。标点更糟——行尾一个「。」
只在左下角有一小团墨，按行宽除字数会把字号算小一整档。

可靠的量法是**相邻字的起笔间距**：汉字是等宽全角，这个间距就是
    步进 = 字号 × (1 + letter-spacing)
取所有间距的众数（而不是均值），能自动跳过标点造成的畸变。

用法：
    python assets/dev/_measure-pitch.py
"""
import os
from collections import Counter

from PIL import Image

HERE = os.path.dirname(__file__)
DRAFTS = r"D:\Desktop\独裁者按钮\素材\UI界面初稿"
SHOTS = os.path.join(HERE, '_shots-v08', '1440x900')

# (文件, 说明, y0, y1)  —— y 区间取自 _measure-draft.py / _measure-shot.py 的墨带，两端各留几像素。
DRAFT_LINES = [
    ('U2.png', 'u02 标题 L1', 355, 450),
    ('U2.png', 'u02 标题 L2', 465, 560),
    ('U2.png', 'u02 正文', 590, 632),
    ('U5.png', 'u05 lead', 260, 355),
    ('U5.png', 'u05 name', 372, 480),
    ('U12.png', 'u12 标题 L1', 338, 432),
    ('U12.png', 'u12 标题 L2', 448, 542),
    ('U8.png', 'u08 标题 L1', 132, 214),
    ('U8.png', 'u08 标题 L2', 220, 306),
    ('U8.png', 'u08 说明', 325, 362),
    ('U10.png', 'u10 标题', 370, 470),
    ('U10.png', 'u10 说明', 520, 566),
    # 按钮文字是纸色压在青块上，扫描时要反相（invert 控制）。
    # x 窗口在下面按块的实测左右边收紧，否则会扫到块外的纸底。
    ('U12.png', 'u12 按钮字', 775, 820),
]

# y 区间跟着 _measure-shot.py 报出的墨带走——改了字号就要回来重对一次，
# 否则窗口卡在旧位置上，量到的是半行字。
SHOT_LINES = [
    ('u02.png', 'u02 标题 L1', 335, 415),
    ('u02.png', 'u02 标题 L2', 432, 512),
    ('u02.png', 'u02 正文', 554, 585),
    ('u05.png', 'u05 lead', 262, 338),
    ('u05.png', 'u05 name', 360, 448),
    ('u12.png', 'u12 标题 L1', 313, 393),
    ('u12.png', 'u12 标题 L2', 410, 490),
    ('u08.png', 'u08 标题 L1', 190, 260),
    ('u08.png', 'u08 标题 L2', 274, 344),
]

# 我的截图里的主按钮，和初稿用同一套扫法。(文件, 说明, y0, y1)
SHOT_BUTTONS = [
    ('u02.png', 'u02 继续', 610, 700),
    ('u05.png', 'u05 开始体验', 685, 775),
    ('u12.png', 'u12 保存记录', 590, 680),
]


def pitch(path, y0, y1, x0_ratio, x1_ratio, scale, threshold=175, invert=False):
    """返回 (行宽, 步进众数)。步进即字号 × (1+字距)。

    invert=True 用于压在实心青块上的纸色按钮文字——那里「有墨」是**亮**像素。
    """
    im = Image.open(path).convert('L')
    w, h = im.size
    crop = im.crop((int(w * x0_ratio), y0, int(w * x1_ratio), y1))
    px = crop.load()
    cw, ch = crop.size

    def ink(x, y):
        # 反相档不能写成 255-threshold：主青的灰度约 101，会整块被当成墨。
        # 纸色约 235，取 200 才能只留下字。
        return px[x, y] > 200 if invert else px[x, y] < threshold

    cols = [any(ink(x, y) for y in range(ch)) for x in range(cw)]
    if not any(cols):
        return None

    # 每段连续墨迹的起点＝一个字的起笔（字距把汉字彼此分开了）。
    starts, prev = [], False
    for x, v in enumerate(cols):
        if v and not prev:
            starts.append(x)
        prev = v
    left = starts[0]
    right = max(x for x, v in enumerate(cols) if v)

    gaps = [(starts[i + 1] - starts[i]) * scale for i in range(len(starts) - 1)]
    if not gaps:
        return (right - left + 1) * scale, None

    # 众数按 2px 分箱取：偏旁分离会产生半格小间距，标点会产生大间距，
    # 真正的字步进出现次数最多。
    bins = Counter(round(g / 2) for g in gaps if g > 20)
    if not bins:
        return (right - left + 1) * scale, None
    step = bins.most_common(1)[0][0] * 2
    return (right - left + 1) * scale, step


# 主按钮是实心青块，按颜色扫比按墨迹扫准。(文件, 说明, y0, y1)
BUTTONS = [
    ('U2.png', 'u02 继续', 730, 870),
    ('U5.png', 'u05 开始体验', 690, 840),
    ('U12.png', 'u12 保存记录', 720, 880),
    ('U10.png', 'u10 看看发生了什么', 730, 880),
]


def solid_block(path, y0, y1, scale, x0_ratio=0.03, x1_ratio=0.52,
                target=(2, 137, 180), tol=45):
    """找带内**最长的一段连续同色像素**，当作实心按钮。

    不能用 bbox：同一行里的次要按钮（「重新选择」「返回体验馆」）也是青字，
    bbox 会把它们一起框进来，量出 418 这种明显不对的宽度。
    连续行程只会命中真正的实心块。
    """
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()

    def solid(x, y):
        r, g, b = px[x, y]
        return (abs(r - target[0]) < tol and abs(g - target[1]) < tol
                and abs(b - target[2]) < tol)

    best = None
    x_lo, x_hi = int(w * x0_ratio), int(w * x1_ratio)
    for y in range(y0, y1):
        run = 0
        for x in range(x_lo, x_hi):
            if solid(x, y):
                run += 1
                if best is None or run > best[0]:
                    best = (run, x - run + 1, y)
            else:
                run = 0
    if best is None:
        return None

    width, left, _ = best
    # 竖直方向不能沿中轴走：块中央是白色按钮文字，一撞上就提前收边，
    # 量出来只有 17~30px。改成统计「本行是否有 ≥80% 宽的连续行程」。
    rows = []
    for y in range(y0, y1):
        run = longest = 0
        for x in range(left, left + width):
            run = run + 1 if solid(x, y) else 0
            longest = max(longest, run)
        rows.append(longest >= width * 0.8)
    top = rows.index(True)
    bottom = len(rows) - 1 - rows[::-1].index(True)
    return (width * scale, (bottom - top + 1) * scale, left * scale, (y0 + top) * scale)


if __name__ == '__main__':
    print('初稿（已折算到 1440 宽）')
    # 扫描窗口要避开插画：U8 的按钮在右半屏，U10 的泡泡从 0.44 就开始，
    # 窗口一旦盖到插画，行宽就变成插画宽度、步进也会被噪点污染。
    for name, label, y0, y1 in DRAFT_LINES:
        x0, x1 = {'U8.png': (0.52, 0.66), 'U10.png': (0.03, 0.42)}.get(name, (0.03, 0.52))
        inv = '按钮字' in label
        if inv:
            # U12 的青块实测 x 65..264 @1440；窗口必须**完全落在块内**，
            # 否则块外的纸底在反相档里也算「墨」，行宽会被撑爆。
            x0, x1 = 0.050, 0.180
        r = pitch(os.path.join(DRAFTS, name), y0, y1, x0, x1, 1440 / 1672, invert=inv)
        if r:
            print('  %-14s 行宽 %5.1f  步进 %s' % (label, r[0], r[1]))

    print('我的截图（1440）')
    for name, label, y0, y1 in SHOT_LINES:
        if y1 <= y0:
            continue
        path = os.path.join(SHOTS, name)
        if not os.path.exists(path):
            continue
        x0, x1 = (0.55, 0.92) if name == 'u08.png' else (0.03, 0.52)
        r = pitch(path, y0, y1, x0, x1, 1.0)
        if r:
            print('  %-14s 行宽 %5.1f  步进 %s' % (label, r[0], r[1]))

    print('主按钮实心块')
    for name, label, y0, y1 in BUTTONS:
        r = solid_block(os.path.join(DRAFTS, name), y0, y1, 1440 / 1672)
        if r:
            print('  初稿 %-18s %.0f x %.0f  左%.0f 上%.0f' % (label, r[0], r[1], r[2], r[3]))
    for name, label, y0, y1 in SHOT_BUTTONS:
        path = os.path.join(SHOTS, name)
        if not os.path.exists(path):
            continue
        # 我的主按钮用的是 --c-teal-bright #049CBF，比初稿的主青亮一档。
        r = solid_block(path, y0, y1, 1.0, target=(4, 156, 191))
        if r:
            print('  截图 %-18s %.0f x %.0f  左%.0f 上%.0f' % (label, r[0], r[1], r[2], r[3]))
