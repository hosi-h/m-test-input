"""アプリのアイコン（PNG）を作る。使い方: python3 tools/make_icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "icons"
NAVY = (30, 58, 95)
TEAL = (20, 184, 166)
WHITE = (255, 255, 255)


def font(size):
    for path in ("/System/Library/Fonts/HelveticaNeue.ttc", "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(path, size, index=1)  # Bold
        except (OSError, IndexError):
            continue
    return ImageFont.load_default()


def make(size):
    s = 4  # 大きく描いてから縮小し、ふちを滑らかにする
    n = size * s
    img = Image.new("RGB", (n, n), NAVY)
    d = ImageDraw.Draw(img)

    f = font(int(n * 0.52))
    box = d.textbbox((0, 0), "M", font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((n - w) / 2 - box[0], n * 0.40 - h / 2 - box[1]), "M", font=f, fill=WHITE)

    # チェックマーク
    r = n * 0.15
    cx, cy = n * 0.5, n * 0.78
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=TEAL)
    lw = int(n * 0.035)
    pts = [(cx - r * 0.5, cy + r * 0.02), (cx - r * 0.12, cy + r * 0.4), (cx + r * 0.55, cy - r * 0.38)]
    d.line(pts, fill=WHITE, width=lw, joint="curve")

    img.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png", optimize=True)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for size in (180, 192, 512):
        make(size)
    print("ok")
