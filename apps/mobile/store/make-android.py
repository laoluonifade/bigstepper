"""
Google Play artwork from the Android screenshots in store/raw-android (1..8.jpeg, taken on an Android phone):
  out/android/screenshot-1..8.png   1080x1920 (9:16), Samsung-style frame, Android status bar
  out/android/feature-graphic.png   1024x500

Run from apps/mobile/store:  python3 make-android.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
FONTS = HERE.parent / 'assets' / 'fonts'
OUT = HERE / 'out' / 'android'
OUT.mkdir(parents=True, exist_ok=True)

INK, PAPER, VOLT, TRACK = (18, 18, 18), (242, 239, 232), (228, 255, 58), (255, 77, 18)
WIDE = str(FONTS / 'ArchivoWide-Black.ttf')
UI = str(FONTS / 'Archivo-SemiBold.ttf')

SHOTS = [
    ('RACE YOUR FRIENDS,', 'EVERY SINGLE WEEK.', VOLT),
    ('FIND A RACE TO JOIN,', 'OR START YOUR OWN.', TRACK),
    ('CLIMB THE BOARD,', 'ONE VERIFIED KM AT A TIME.', VOLT),
    ('WALK, RUN OR RIDE.', 'EVERY VERIFIED KM COUNTS.', TRACK),
    ('BUILT FOR', 'MID-STRIDE GLANCES.', VOLT),
    ('SHOW THE WORLD', 'WHERE YOU STAND.', TRACK),
    ('RANT WITH EVERYONE', 'WHO MOVES.', VOLT),
    ('RUN WITH YOUR CLUB.', 'WIN ITS PRIZES.', TRACK),
]



def backdrop(width, height):
    """Jump's store background: near-black to burnt orange, with faint diagonal lanes."""
    base = Image.new('RGB', (width, height))
    pixels = base.load()
    for y in range(height):
        for x in range(width):
            t = min(1, max(0, (x / width) * 0.75 + (1 - y / height) * 0.45 - 0.1))
            pixels[x, y] = tuple(int(a + (b - a) * t) for a, b in zip((22, 20, 18), (96, 38, 18)))
    lanes = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(lanes)
    for k in range(-6, 18):
        x0 = width * 0.35 + k * 70
        draw.line([(x0, height), (x0 + height * 0.9, 0)], fill=16, width=3)
    return Image.composite(Image.new('RGB', (width, height), (255, 140, 90)), base, lanes)


def fit_font(text, path, max_width, start):
    size = start
    while size > 20:
        font = ImageFont.truetype(path, size)
        if font.getlength(text) <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(path, size)


def android_screen(raw, clock):
    """The app screen with the iPhone's status bar and home bar replaced by Android's."""
    shot = raw.convert('RGB').copy()
    if shot.width != 1179:
        shot = shot.resize((1179, round(shot.height * 1179 / shot.width)), Image.LANCZOS)
    w, h = shot.size
    IOS_STATUS, IOS_HOME = 150, 46
    band = shot.crop((0, IOS_STATUS + 4, w, IOS_STATUS + 5)).resize((w, IOS_STATUS + 4))
    busy = max(band.convert('L').getextrema()) - min(band.convert('L').getextrema()) > 40
    if busy:
        source = shot.crop((0, IOS_STATUS + 4, w, IOS_STATUS * 2 + 8)).transpose(Image.FLIP_TOP_BOTTOM)
        band = source.resize((w, IOS_STATUS + 4)).filter(ImageFilter.GaussianBlur(14))
        band = Image.blend(band, Image.new('RGB', band.size, (255, 255, 255)), 0.35)
    shot.paste(band, (0, 0))
    floor = shot.crop((0, h - IOS_HOME - 2, w, h - IOS_HOME - 1)).resize((w, IOS_HOME + 2))
    shot.paste(floor, (0, h - IOS_HOME - 2))
    sample = shot.getpixel((w // 2, 60))
    light = sum(sample) / 3 > 140
    ink = (24, 24, 24) if light else (245, 245, 245)
    draw = ImageDraw.Draw(shot)
    font = ImageFont.truetype(UI, 46)
    draw.text((64, 52), clock, font=font, fill=ink)
    right = w - 64
    draw.rounded_rectangle([right - 52, 62, right - 6, 92], radius=7, outline=ink, width=4)
    draw.rectangle([right - 46, 68, right - 18, 86], fill=ink)
    draw.rectangle([right - 5, 71, right, 83], fill=ink)
    pct = ImageFont.truetype(UI, 34)
    text_x = right - 64 - pct.getlength('82%')
    draw.text((text_x, 58), '82%', font=pct, fill=ink)
    sx = text_x - 22 - 47
    for i in range(4):
        draw.rectangle([sx + i * 13, 90 - (i + 1) * 7, sx + i * 13 + 8, 92], fill=ink)
    wx, wy = sx - 34, 92
    for r in (34, 24, 14):
        draw.pieslice([wx - r, wy - r, wx + r, wy + r], 225, 315, fill=ink)
        if r != 14:
            draw.pieslice([wx - r + 6, wy - r + 6, wx + r - 6, wy + r - 6], 225, 315, fill=sample)
    draw.rounded_rectangle([w // 2 - 120, h - 30, w // 2 + 120, h - 20], radius=5, fill=(ink[0], ink[1], ink[2]))
    return shot


def samsung(screen, screen_width):
    """Flat-edged body, thin even bezel, small radius, centred punch-hole camera, right-side keys."""
    scale = screen_width / screen.width
    screen = screen.resize((screen_width, round(screen.height * scale)), Image.LANCZOS)
    bezel, radius = 14, 46
    w, h = screen.width + bezel * 2, screen.height + bezel * 2
    canvas = Image.new('RGBA', (w + 12, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([w - 2, h * 0.17, w + 6, h * 0.27], radius=4, fill=(52, 52, 56))
    draw.rounded_rectangle([w - 2, h * 0.31, w + 6, h * 0.37], radius=4, fill=(52, 52, 56))
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius + bezel, fill=(16, 16, 18))
    draw.rounded_rectangle([1, 1, w - 2, h - 2], radius=radius + bezel, outline=(70, 70, 76), width=2)
    mask = Image.new('L', screen.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, screen.width - 1, screen.height - 1], radius=radius, fill=255)
    canvas.paste(screen, (bezel, bezel), mask)
    cx, cy, r = w // 2, bezel + 26, 13
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(8, 8, 10))
    draw.ellipse([cx - 4, cy - 5, cx + 1, cy], fill=(40, 44, 60))
    return canvas


def shadow(item, blur=40, opacity=150):
    alpha = item.split()[-1].point(lambda a: opacity if a else 0)
    pad = blur * 2
    layer = Image.new('RGBA', (item.width + pad * 2, item.height + pad * 2), (0, 0, 0, 0))
    layer.paste(Image.new('RGBA', item.size, (0, 0, 0, 255)), (pad, pad + 24), alpha)
    return layer.filter(ImageFilter.GaussianBlur(blur)), pad


def screenshot(index, top, bottom, accent):
    W, H = 1080, 1920
    page = backdrop(W, H).convert('RGBA')
    draw = ImageDraw.Draw(page)
    f1 = fit_font(top, WIDE, W - 140, 74)
    f2 = fit_font(bottom, WIDE, W - 140, 74)
    size = min(f1.size, f2.size)
    f1, f2 = ImageFont.truetype(WIDE, size), ImageFont.truetype(WIDE, size)
    y = 120
    draw.text(((W - f1.getlength(top)) / 2, y), top, font=f1, fill=PAPER)
    draw.text(((W - f2.getlength(bottom)) / 2, y + size * 1.12), bottom, font=f2, fill=accent)
    phone = samsung(Image.open(HERE / 'raw-android' / f'{index}.jpeg').convert('RGB'), 690)
    glow, pad = shadow(phone)
    top_y = 360
    x = (W - phone.width) // 2 + 6
    page.alpha_composite(glow, (x - pad, top_y - pad))
    page.alpha_composite(phone, (x, top_y))
    page.convert('RGB').save(OUT / f'screenshot-{index}.png', optimize=True)


def feature_graphic():
    W, H = 1024, 500
    page = backdrop(W, H).convert('RGBA')
    draw = ImageDraw.Draw(page)
    logo = Image.open(HERE.parent / 'assets' / 'images' / 'live-logo.png').convert('RGBA')
    logo = logo.resize((round(logo.width * 52 / logo.height), 52), Image.LANCZOS)
    page.alpha_composite(logo, (64, 48))
    font = ImageFont.truetype(WIDE, 66)
    y = 126
    for text, color in [('MOVE.', PAPER), ('COMPETE.', PAPER), ('WIN.', INK)]:
        if text == 'WIN.':
            draw.rectangle([58, y + 8, 64 + font.getlength(text) + 10, y + 76], fill=VOLT)
        draw.text((64, y), text, font=font, fill=color)
        y += 78
    draw.text((64, y + 22), 'Walks, runs and rides become races.', font=ImageFont.truetype(UI, 26), fill=(230, 225, 215))
    phone = samsung(Image.open(HERE / 'raw-android' / '1.jpeg').convert('RGB'), 300)
    phone = phone.rotate(-8, resample=Image.BICUBIC, expand=True)
    glow, pad = shadow(phone, blur=26, opacity=170)
    x, y = W - phone.width + 20, 34
    page.alpha_composite(glow, (x - pad, y - pad))
    page.alpha_composite(phone, (x, y))
    page.convert('RGB').save(OUT / 'feature-graphic.png', optimize=True)


if __name__ == '__main__':
    for number, (top, bottom, accent) in enumerate(SHOTS, start=1):
        screenshot(number, top, bottom, accent)
    feature_graphic()
    print('Saved to', OUT)
