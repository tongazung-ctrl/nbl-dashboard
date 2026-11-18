#!/usr/bin/env python3
"""Create 1200x630 Open Graph preview and a favicon SVG from map.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path("/workspace/nbl_site")
MAP = json.loads((ROOT / "data/map.json").read_text(encoding="utf-8"))
FONT_DIR = Path("/usr/share/fonts/truetype/sand-box/google/Prompt")

W, H = 1200, 630
# Map is 640x849. Fit into a tall panel on the right-ish / left.
MW, MH = MAP["W"], MAP["H"]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size)


def parse_path(d: str) -> list[list[tuple[float, float]]]:
    toks = re.findall(r"[MLZmlz]|-?\d+\.?\d*", d)
    polys, cur, cmd, nums = [], [], None, []
    def flush_pair(command, a, b, cx, cy):
        x, y = float(a), float(b)
        if command == "l":
            x += cx; y += cy
        return x, y
    i = 0
    cx = cy = 0.0
    started = None
    while i < len(toks):
        t = toks[i]
        if re.fullmatch(r"[MLZmlz]", t):
            cmd = t
            i += 1
            if cmd in "Zz":
                if cur:
                    if started:
                        cur.append(started)
                    polys.append(cur)
                    cur = []
                    started = None
            continue
        if cmd in "MmLl":
            x, y = flush_pair(cmd, toks[i], toks[i + 1], cx, cy)
            i += 2
            if cmd in "Mm" and cur:
                polys.append(cur)
                cur = []
                started = None
            if not cur:
                started = (x, y)
            cur.append((x, y))
            cx, cy = x, y
            if cmd in "Mm":
                cmd = "Ll" if cmd == "M" else "l"
        else:
            i += 1
    if cur:
        polys.append(cur)
    return polys


def transform(pt, ox, oy, s):
    return (ox + pt[0] * s, oy + pt[1] * s)


def main() -> None:
    img = Image.new("RGB", (W, H), "#061018")
    draw = ImageDraw.Draw(img, "RGBA")
    # aurora blobs
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((-80, -120, 620, 420), fill=(14, 165, 233, 50))
    od.ellipse((700, -80, 1400, 400), fill=(167, 139, 250, 40))
    od.ellipse((200, 400, 900, 800), fill=(16, 185, 129, 28))
    img = Image.alpha_composite(img.convert("RGBA"), overlay.filter(ImageFilter.GaussianBlur(40)))
    draw = ImageDraw.Draw(img, "RGBA")

    # map placement: left-center
    pad_top, pad_bot = 20, 20
    avail_h = H - pad_top - pad_bot
    s = avail_h / MH
    ox, oy = 40, pad_top

    # neighbors faint
    for n in MAP["neighbors"]:
        for poly in parse_path(n["d"]):
            pts = [transform(p, ox, oy, s) for p in poly]
            if len(pts) > 2:
                draw.polygon(pts, outline=(148, 163, 184, 50), fill=(148, 163, 184, 18))

    fills = {
        "สุวรรณคูหา": (56, 189, 248, 70),
        "นาวัง": (45, 212, 191, 70),
        "นากลาง": (125, 211, 252, 80),
        "เมืองหนองบัวลำภู": (96, 165, 250, 95),
        "ศรีบุญเรือง": (52, 211, 153, 70),
        "โนนสัง": (167, 139, 250, 70),
    }
    for d in MAP["districts"]:
        for poly in parse_path(d["d"]):
            pts = [transform(p, ox, oy, s) for p in poly]
            if len(pts) > 2:
                draw.polygon(pts, fill=fills.get(d["n"], (56, 189, 248, 70)), outline=(125, 211, 252, 200))
                # slightly thicker outline
                draw.line(pts + [pts[0]], fill=(234, 242, 255, 180), width=2)

    # weather points
    for name, (x, y) in MAP["wx_points"].items():
        px, py = transform((x, y), ox, oy, s)
        draw.ellipse((px - 7, py - 7, px + 7, py + 7), fill=(7, 16, 24, 200), outline=(125, 211, 252, 255), width=2)

    # buyer pins
    colors = [(255, 209, 102), (255, 138, 91), (91, 231, 169), (183, 148, 246), (244, 114, 182)]
    for i, (bid, (x, y)) in enumerate(MAP["buyers"].items()):
        px, py = transform((x, y), ox, oy, s)
        col = colors[i % len(colors)]
        draw.ellipse((px - 6, py - 6, px + 6, py + 6), fill=col + (255,), outline=(255, 255, 255, 230), width=2)

    # text panel on the right
    tx = 560
    title = font("Prompt-Bold.ttf", 54)
    sub = font("Prompt-Medium.ttf", 28)
    body = font("Prompt-Regular.ttf", 22)
    small = font("Prompt-Regular.ttf", 18)

    def shadow_text(xy, text, fnt, fill, max_w=None):
        x, y = xy
        draw.text((x + 2, y + 2), text, font=fnt, fill=(0, 0, 0, 140))
        draw.text((x, y), text, font=fnt, fill=fill)

    shadow_text((tx, 78), "แดชบอร์ดหนองบัวลำภู", title, (234, 242, 255, 255))
    shadow_text((tx, 150), "อากาศ และจุดรับซื้อผลผลิตเกษตร", sub, (125, 211, 252, 255))
    lines = [
        "แผนที่ 6 อำเภอ · 59 ตำบล · จุดหมู่บ้าน 650 แห่ง",
        "พยากรณ์รายช่องกริด ~9 กม. (Open-Meteo ECMWF IFS)",
        "ฝนวัดจริงจากสถานี ThaiWater สสน.",
        "ราคาอ้างอิงพร้อมแหล่ง และจุดรับซื้อ 16 แห่ง",
    ]
    y = 230
    for line in lines:
        shadow_text((tx, y), line, body, (226, 232, 240, 230))
        y += 40
    shadow_text((tx, 520), "เปิดดูฟรี ไม่ต้องเข้าสู่ระบบ", small, (253, 230, 138, 255))

    out = ROOT / "assets/og.png"
    img.convert("RGB").save(out, "PNG", optimize=True)
    print("wrote", out, out.stat().st_size)

    # also a 32-ish favicon already as svg; write a small png apple icon variant 180
    # skip extra

if __name__ == "__main__":
    main()
