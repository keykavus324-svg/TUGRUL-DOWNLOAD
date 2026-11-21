#!/usr/bin/env python3
"""PNG uygulama ikonlarını üretir (Pillow gerekir: pip install pillow).

Tasarım: abanoz zemin (#07080C) üzerine altın gradyan yuvarlatılmış kare ve
indirme oku. Android mipmap yoğunluklarına ve store ikonuna yazar.
"""
from pathlib import Path
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow gerekli:  pip install pillow")

SIZES = {
    "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192,
}

def rounded_linear(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = size * 0.06
    r = size * 0.24
    # altın gradyan
    grad = Image.new("RGBA", (size, size))
    gd = ImageDraw.Draw(grad)
    for i in range(size):
        t = i / max(1, size - 1)
        # #FFE08A -> #F7C948 -> #C98A12
        if t < 0.5:
            k = t / 0.5
            c = (int(255 + (247 - 255) * k), int(224 + (201 - 224) * k), int(138 + (72 - 138) * k))
        else:
            k = (t - 0.5) / 0.5
            c = (int(247 + (201 - 247) * k), int(201 + (138 - 201) * k), int(72 + (18 - 72) * k))
        gd.line([(0, i), (size, i)], fill=c + (255,))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=255)
    img.paste(grad, (0, 0), mask)

    # ok
    d = ImageDraw.Draw(img)
    cx = size / 2
    shaft_w = size * 0.11
    top = size * 0.22
    arrow_mid = size * 0.55
    d.rectangle([cx - shaft_w / 2, top, cx + shaft_w / 2, arrow_mid], fill=(7, 8, 12, 255))
    d.polygon([
        (cx - size * 0.20, arrow_mid - size * 0.02),
        (cx + size * 0.20, arrow_mid - size * 0.02),
        (cx, size * 0.78),
    ], fill=(7, 8, 12, 255))
    d.rounded_rectangle(
        [cx - size * 0.24, size * 0.80, cx + size * 0.24, size * 0.86],
        radius=size * 0.03, fill=(7, 8, 12, 255),
    )
    return img


def main() -> None:
    root = Path(__file__).resolve().parents[1] / "frontend/android/app/src/main/res"
    for density, px in SIZES.items():
        out = root / f"mipmap-{density}"
        out.mkdir(parents=True, exist_ok=True)
        img = rounded_linear(px)
        img.save(out / "ic_launcher.png")
        img.save(out / "ic_launcher_round.png")
        fg = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        inner = rounded_linear(int(px * 0.68))
        fg.paste(inner, ((px - inner.width) // 2, (px - inner.height) // 2), inner)
        fg.save(out / "ic_launcher_foreground.png")
    store = Path(__file__).resolve().parents[1] / "docs" / "icon-1024.png"
    store.parent.mkdir(parents=True, exist_ok=True)
    rounded_linear(1024).save(store)
    print("ikonlar üretildi")


if __name__ == "__main__":
    main()
