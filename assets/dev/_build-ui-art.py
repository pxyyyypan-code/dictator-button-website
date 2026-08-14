"""
_build-ui-art.py —— 阶段 3 视觉层：从 UI 初稿里抽出 CSS 要用的插画素材。

初稿里的哆啦A梦是低多边形风格、和整套配色是一体的，重画一个只会更不像。
所以这里直接从 U2 / U10 裁出来，把米白底抠成透明，存成 webp。

同心波纹（U1 背景）和四次元口袋（U11）是纯几何图形，
用 SVG 生成比裁位图清晰得多，也能跟着 CSS 变量一起缩放。

用法：
    python assets/dev/_build-ui-art.py

产出：
    assets/images/ui/doraemon-sit.webp    U2 / U05 右侧，坐在青色圆盘上
    assets/images/ui/doraemon-peek.webp   U3 / U10 右下角探头
    assets/images/ui/intro-ripple.svg     U1 背景同心波纹
    assets/images/ui/pocket.svg           U11 四次元口袋
"""

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DRAFTS = Path(r"D:\Desktop\独裁者按钮\素材\UI界面初稿")
OUT = ROOT / "assets" / "images" / "ui"

# 与 css/style.css 的 --c-paper / --c-teal 保持一致，改这里要同步改那边。
TEAL = "#0289B4"
TEAL_DEEP = "#04566C"
PAPER = "#F7EEE1"
PAPER_SOFT = "#FBF5EC"

# 初稿的米白底不是纯色（有轻微噪点），容差放宽到 26 才能抠干净。
BG_TOLERANCE = 26


def cutout(src_name, box, out_name, max_width):
    """裁出 box，把米白底转成透明，等比缩到 max_width，存 webp。"""
    src = Image.open(DRAFTS / src_name).convert("RGBA")
    crop = src.crop(box)

    # 以四角像素的平均值当作背景色：初稿的底色四角一定是纯背景。
    w, h = crop.size
    corners = [crop.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    bg = tuple(sum(c[i] for c in corners) // len(corners) for i in range(3))

    pixels = crop.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if abs(r - bg[0]) <= BG_TOLERANCE and abs(g - bg[1]) <= BG_TOLERANCE \
                    and abs(b - bg[2]) <= BG_TOLERANCE:
                pixels[x, y] = (r, g, b, 0)

    # 抠完再按 alpha 收紧一次边界，去掉裁剪时多留的空白。
    bbox = crop.getbbox()
    if bbox:
        crop = crop.crop(bbox)

    if crop.width > max_width:
        ratio = max_width / crop.width
        crop = crop.resize((max_width, round(crop.height * ratio)), Image.LANCZOS)

    OUT.mkdir(parents=True, exist_ok=True)
    crop.save(OUT / out_name, "WEBP", quality=92, method=6)
    print(f"  {out_name}  {crop.width}x{crop.height}")


def cutout_on_ripple(src_name, box, out_name, max_width):
    """从波纹背景上抠图。

    不能用 cutout()：那个函数拿四角像素当背景色，而 U1 的底是**青白相间**的，
    四角可能是青、也可能是纸，取哪个都会剩下另一半。
    这里改成按颜色分类——主青和纸色都算背景，剩下的才是道具。
    """
    src = Image.open(DRAFTS / src_name).convert("RGBA")
    crop = src.crop(box)
    w, h = crop.size
    pixels = crop.load()

    def is_bg(x, y):
        r, g, b, _ = pixels[x, y]
        teal = b > 120 and b > r + 40
        paper = r > 215 and g > 205 and b > 185
        return teal or paper

    # 只抠**从边缘连进来**的背景。直接按颜色全图抠会把道具内部的浅色一起吃掉：
    # 面包芯是米白的，整片会被判成纸底，透出后面的波纹，只剩一圈面包边。
    stack = [(x, y) for x in range(w) for y in (0, h - 1) if is_bg(x, y)]
    stack += [(x, y) for y in range(h) for x in (0, w - 1) if is_bg(x, y)]
    outside = set(stack)
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if 0 <= n[0] < w and 0 <= n[1] < h and n not in outside and is_bg(*n):
                outside.add(n)
                stack.append(n)

    for x, y in outside:
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)

    bbox = crop.getbbox()
    if bbox:
        crop = crop.crop(bbox)

    if crop.width > max_width:
        ratio = max_width / crop.width
        crop = crop.resize((max_width, round(crop.height * ratio)), Image.LANCZOS)

    OUT.mkdir(parents=True, exist_ok=True)
    crop.save(OUT / out_name, "WEBP", quality=92, method=6)
    print(f"  {out_name}  {crop.width}x{crop.height}")


def build_ripple():
    """U1 背景：青白相间的同心波纹。

    每一圈不是正圆，而是半径按 sin 起伏的闭合曲线——初稿里的波浪边缘就是这么来的。
    用 path 而不是 circle，才能让波峰随圈数错开，避免看起来像同心圆靶子。
    """
    size = 1600
    cx = cy = size / 2
    # 环距**不是等距**的：量 U1 中轴线，半径 113→370 时环距从 10 涨到 44，
    # 相邻边界之比稳定在 1.114。等距画出来中心一片空、外圈几条粗带子，
    # 跟初稿那种「越往里越密」的水波完全不是一回事。
    ratio = 1.114
    # 最外圈要盖过 viewBox 对角线（size/2×√2≈1131），否则四角露出底色。
    outer = size / 2 * math.sqrt(2) + 10
    inner = 26                   # 再往里就细过 1px，画了也看不见

    radii = []
    r = inner
    while r < outer:
        radii.append(r)
        r *= ratio
    parts = []

    # 从外往里画：内圈覆盖在外圈上，相邻两条路径之间就留下一条环带。
    for index in range(len(radii) - 1, -1, -1):
        base = radii[index]
        # 波幅要小于环距，否则相邻两圈会互相穿插。
        # 量初稿：半径 324 幅 ±12、半径 369 幅 ±13，都约等于环距的三分之一。
        amp = base * (1 - 1 / ratio) * 0.34
        # 波峰数必须**逐圈一致**。之前 7/9 交替，两圈波形对不上、彼此穿过，
        # 出来是斑马纹一样的干涉图案，不是水波。
        lobes = 7
        # 相位每圈只挪一点点，波峰连成缓缓外旋的螺线——初稿就是这个走向。
        phase = index * 0.14

        # 采样点的循环变量不能叫 step：它会盖掉上面的圈间距，
        # 第二圈起半径直接变成 239×index，整幅波纹塌成一个中心色块。
        # 采样数跟着半径走——内圈只有几十像素，240 点纯属浪费体积。
        points = []
        samples = max(48, min(240, int(base / 4)))
        for i in range(samples):
            angle = i / samples * math.tau
            radius = base + amp * math.sin(lobes * angle + phase)
            points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))

        d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in points) + " Z"
        fill = TEAL if index % 2 else PAPER
        parts.append(f'  <path d="{d}" fill="{fill}"/>')
    rings = len(radii)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{size}" height="{size}" role="presentation">\n'
        f'  <rect width="{size}" height="{size}" fill="{PAPER}"/>\n'
        + "\n".join(parts)
        + "\n</svg>\n"
    )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "intro-ripple.svg").write_text(svg, encoding="utf-8")
    print(f"  intro-ripple.svg  {rings} 圈")


def build_pocket():
    """U11 右侧：米白色四次元口袋，虚线缝边 + 铃铛。"""
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 380" width="420" height="380" role="presentation">
  <!-- 口袋主体：上缘平、下缘半圆，初稿里就是这个形状 -->
  <path d="M 40 60 L 380 60 A 170 170 0 0 1 40 60 Z" fill="{PAPER}"/>
  <path d="M 40 60 L 380 60" stroke="{TEAL_DEEP}" stroke-width="7" stroke-linecap="round" fill="none"/>
  <path d="M 40 60 A 170 170 0 0 0 380 60" stroke="{TEAL_DEEP}" stroke-width="7" fill="none"/>
  <!-- 缝线：沿开口内侧走一圈虚线 -->
  <path d="M 62 78 A 148 148 0 0 0 358 78" stroke="{TEAL}" stroke-width="3"
        stroke-dasharray="10 12" stroke-linecap="round" fill="none" opacity="0.55"/>
  <!-- 铃铛 -->
  <circle cx="210" cy="286" r="34" fill="{PAPER_SOFT}" stroke="{TEAL_DEEP}" stroke-width="6"/>
  <path d="M 178 278 L 242 278" stroke="{TEAL_DEEP}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="210" cy="296" r="7" fill="{TEAL_DEEP}"/>
  <path d="M 210 303 L 210 316" stroke="{TEAL_DEEP}" stroke-width="6" stroke-linecap="round"/>
</svg>
"""
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "pocket.svg").write_text(svg, encoding="utf-8")
    print("  pocket.svg")


def main():
    print("抠图：")
    # bbox 由 PIL 扫描初稿得到，改初稿后要重新量，不要凭感觉调。
    cutout("U2.png", (870, 121, 1558, 822), "doraemon-sit.webp", 640)
    cutout("U10.png", (1323, 643, 1672, 941), "doraemon-peek.webp", 360)
    # U1 的四件漂浮道具。assets/images/gadgets 里那套是细线描风格，
    # 和初稿的低多边形实色对不上（任意门还是紫的），所以照样从初稿裁。
    # bbox 由连通块扫描得出，四周各放 8px 余量防止描边被切。
    cutout_on_ripple("U1.png", (216, 420, 480, 684), "intro-bread.webp", 260)
    cutout_on_ripple("U1.png", (1232, 144, 1432, 372), "intro-copter.webp", 200)
    cutout_on_ripple("U1.png", (1024, 256, 1112, 360), "intro-lamp.webp", 96)
    cutout_on_ripple("U1.png", (1048, 408, 1584, 941), "intro-door.webp", 520)
    print("生成 SVG：")
    build_ripple()
    build_pocket()
    print("完成 →", OUT)


if __name__ == "__main__":
    main()
