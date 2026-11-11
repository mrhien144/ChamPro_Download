"""Generate PWA icon PNGs from a simple self-contained vector-like design.
Only outputs to app-preview/. Never changes the production app.
Requires Pillow. Run: python scripts/make_pwa_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "app-preview"
NAVY = "#0d2341"
PANEL = "#163e6b"
MINT = "#76e1c4"
WHITE = "#ffffff"

def font(size, bold=True):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()

def make_icon(size, maskable=False):
    # Draw at 512 then downsample for consistent icon appearance.
    scale = 512
    img = Image.new("RGB", (scale, scale), NAVY)
    d = ImageDraw.Draw(img)
    if not maskable:
        d.rounded_rectangle((0, 0, 511, 511), radius=108, fill=NAVY)
        d.rounded_rectangle((72, 88, 440, 424), radius=56, fill=PANEL, outline=MINT, width=10)
        pts = [(154, 160), (154, 352), (356, 160), (356, 352)]
        rad = 24
        text_y = 272
        f1, f2 = font(130), font(31)
        sub_y = 317
    else:
        d.rounded_rectangle((116, 116, 396, 396), radius=45, fill=PANEL, outline=MINT, width=8)
        pts = [(170, 170), (170, 342), (342, 170), (342, 342)]
        rad = 15
        text_y = 273
        f1, f2 = font(100), font(23)
        sub_y = 310
    for x, y in pts:
        d.ellipse((x-rad,y-rad,x+rad,y+rad),outline=MINT,width=9)
    d.text((256,text_y),"CP",font=f1,fill=WHITE,anchor="mm")
    d.text((256,sub_y),"TEST",font=f2,fill=MINT,anchor="mm")
    if size != 512:
        img=img.resize((size,size),Image.Resampling.LANCZOS)
    return img

for n in (192,512):
    make_icon(n).save(ROOT/f"pwa-icon-{n}.png", optimize=True)
make_icon(512,True).save(ROOT/"pwa-maskable-512.png",optimize=True)
make_icon(180).save(ROOT/"apple-touch-icon.png",optimize=True)
print("Generated 192/512/maskable/Apple touch PNG icons")
