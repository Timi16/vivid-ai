"""Render the Vivid mark (vivid-frontend/app/icon.svg) at every size the
editor needs. Drawn rather than rasterized: no SVG renderer is installed, and
the mark is three points and a rounded square, so exact control is cheaper
than a dependency."""
import os, subprocess, sys
from PIL import Image, ImageDraw

INK = (10, 10, 10, 255)        # #0a0a0a  panel/ink
MARK = (232, 232, 234, 255)    # #e8e8ea  primary

# From the SVG's 32x32 viewBox.
RADIUS = 7 / 32
STROKE = 3.2 / 32
V = [(8.5 / 32, 9.5 / 32), (16 / 32, 22.5 / 32), (23.5 / 32, 9.5 / 32)]
# macOS squircles sit inset in their canvas; a full-bleed tile looks oversized
# in the dock next to every other app.
INSET = 0.09


def render(size: int, inset: float = INSET) -> Image.Image:
    ss = 8 if size <= 64 else 4          # supersample, then downscale
    n = size * ss
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = n * inset
    box = [pad, pad, n - pad - 1, n - pad - 1]
    side = box[2] - box[0]
    d.rounded_rectangle(box, radius=RADIUS * side, fill=INK)

    pts = [(box[0] + x * side, box[1] + y * side) for x, y in V]
    w = max(1, int(STROKE * side))
    d.line(pts, fill=MARK, width=w, joint="curve")
    # joint="curve" rounds the join; the two ends still need caps.
    for x, y in (pts[0], pts[2]):
        r = w / 2
        d.ellipse([x - r, y - r, x + r, y + r], fill=MARK)

    return img.resize((size, size), Image.LANCZOS)


def main(out: str):
    os.makedirs(out, exist_ok=True)

    # --- macOS .icns
    iconset = os.path.join(out, "code.iconset")
    os.makedirs(iconset, exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        render(base).save(f"{iconset}/icon_{base}x{base}.png")
        render(base * 2).save(f"{iconset}/icon_{base}x{base}@2x.png")
    subprocess.run(["iconutil", "-c", "icns", iconset,
                    "-o", os.path.join(out, "code.icns")], check=True)

    # --- Linux
    render(512).save(os.path.join(out, "code.png"))

    # --- Windows
    render(256).save(os.path.join(out, "code.ico"),
                     sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64),
                            (128, 128), (256, 256)])
    # Tiles are drawn on the accent colour, so they keep their own padding.
    render(70, inset=0.16).save(os.path.join(out, "code_70x70.png"))
    render(150, inset=0.16).save(os.path.join(out, "code_150x150.png"))

    # --- a preview sheet so the result can be eyeballed at real sizes
    sheet = Image.new("RGBA", (560, 190), (24, 24, 27, 255))
    x = 20
    for s in (16, 32, 64, 128):
        sheet.alpha_composite(render(s), (x, 20 + (128 - s) // 2))
        x += s + 24
    sheet.save(os.path.join(out, "preview.png"))
    print("wrote", out)


if __name__ == "__main__":
    main(sys.argv[1])
