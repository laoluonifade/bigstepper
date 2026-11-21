"""
App Store screenshots for the 13-inch iPad from the iPad Pro 13-inch simulator shots in store/raw-ipad
(1..8.png, 2064x2752; on the simulator, ⌘S or `xcrun simctl io booted screenshot`):
  out/ipad-13in-2064x2752/screenshot-1..8.png   the size App Store Connect requires for iPad

Same headlines and look as the iPhone set (make-ios.py), with the screen in an iPad frame. Missing raw
shots are skipped, so the set can be made a few at a time.

Run from apps/mobile/store:  python3 make-ipad.py
"""
import importlib.util
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('make_ios', HERE / 'make-ios.py')
ios = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ios)
android = ios.android

SIZE = (2064, 2752)
FOLDER = 'ipad-13in-2064x2752'


def ipad(screen, screen_width, visible_height):
    """Slim dark frame with even bezels and softly rounded corners, cut off at the bottom of the page."""
    scale = screen_width / screen.width
    screen = screen.resize((screen_width, round(screen.height * scale)), Image.LANCZOS)
    bezel, rim = round(screen_width * 0.028), round(screen_width * 0.008)
    radius = round(screen_width * 0.035)
    screen = screen.crop((0, 0, screen.width, min(screen.height, visible_height - bezel - rim)))
    w, h = screen.width + (bezel + rim) * 2, visible_height
    frame = Image.new('RGBA', (w, h + radius), (0, 0, 0, 0))
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle([0, 0, w - 1, h + radius - 1], radius=radius + bezel + rim, fill=(58, 58, 62))
    draw.rounded_rectangle([rim, rim, w - 1 - rim, h + radius - 1 - rim], radius=radius + bezel, fill=(10, 10, 12))
    mask = Image.new('L', (screen.width, screen.height + radius), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, screen.width - 1, screen.height + radius - 1], radius=radius, fill=255)
    tall = Image.new('RGB', (screen.width, screen.height + radius), screen.getpixel((screen.width // 2, screen.height - 1)))
    tall.paste(screen, (0, 0))
    frame.paste(tall, (bezel + rim, bezel + rim), mask)
    return frame.crop((0, 0, w, h))


def screenshot(index, top, bottom, accent):
    W, H = SIZE
    page = android.backdrop(W, H).convert('RGBA')
    draw = ImageDraw.Draw(page)
    unit = W / 1206
    width = W - round(260 * unit)
    font = ImageFont.truetype(ios.WIDE, min(android.fit_font(line, ios.WIDE, width, round(76 * unit)).size for shot in ios.SHOTS for line in shot[:2]))
    y = round(150 * unit)
    draw.text(((W - font.getlength(top)) / 2, y), top, font=font, fill=ios.PAPER)
    draw.text(((W - font.getlength(bottom)) / 2, y + font.size * 1.12), bottom, font=font, fill=accent)
    raw = Image.open(HERE / 'raw-ipad' / f'{index}.png').convert('RGB')
    top_y = round(400 * unit)
    tablet = ipad(raw, round(W * 0.8), H - top_y)
    glow, pad = android.shadow(tablet, blur=round(44 * unit), opacity=160)
    x = (W - tablet.width) // 2
    page.alpha_composite(glow, (x - pad, top_y - pad))
    page.alpha_composite(tablet, (x, top_y))
    out = HERE / 'out' / FOLDER
    out.mkdir(parents=True, exist_ok=True)
    page.convert('RGB').save(out / f'screenshot-{index}.png', optimize=True)


if __name__ == '__main__':
    made, missing = [], []
    for number, (top, bottom, accent) in enumerate(ios.SHOTS, start=1):
        if (HERE / 'raw-ipad' / f'{number}.png').exists():
            screenshot(number, top, bottom, accent)
            made.append(number)
        else:
            missing.append(number)
    print('Saved', made, 'to', HERE / 'out' / FOLDER)
    if missing:
        print('Still need raw-ipad shots:', missing)
