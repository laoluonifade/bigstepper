"""
App Store screenshots from the iPhone screenshots in store/raw (1..8.PNG, 1179x2556, taken on an iPhone):
  out/6.9in-1320x2868/screenshot-1..8.png   the size App Store Connect requires for iPhone
  out/6.3in-1206x2622/screenshot-1..8.png   optional smaller size

Same look as the Google Play set (make-android.py): headline on Jump's dark-to-orange backdrop, the
screen in an iPhone frame below. The "◂ TestFlight" back link iOS adds under the clock is painted out.

Run from apps/mobile/store:  python3 make-ios.py
"""
import importlib.util
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('make_android', HERE / 'make-android.py')
android = importlib.util.module_from_spec(spec)
spec.loader.exec_module(android)

PAPER, VOLT, TRACK, WIDE = android.PAPER, android.VOLT, android.TRACK, android.WIDE

SHOTS = [
    ('EVERY STEP COUNTS.', 'RACE YOUR FRIENDS.', VOLT),
    ('WALK, RUN OR RIDE.', 'EVERY VERIFIED KM COUNTS.', TRACK),
    ('BUILT FOR', 'MID-STRIDE GLANCES.', VOLT),
    ('FIND A RACE TO JOIN,', 'OR START YOUR OWN.', TRACK),
    ('CLIMB THE BOARD,', 'ONE VERIFIED KM AT A TIME.', VOLT),
    ('RUN WITH YOUR CLUB.', 'WIN ITS PRIZES.', TRACK),
    ('SHOW THE WORLD', 'WHERE YOU STAND.', VOLT),
    ('RANT WITH EVERYONE', 'WHO MOVES.', TRACK),
]

TESTFLIGHT_LABEL = {1, 4, 5, 6, 7, 8}

SIZES = {'6.9in-1320x2868': (1320, 2868), '6.3in-1206x2622': (1206, 2622)}


def without_testflight(shot):
    """iOS shows "◂ TestFlight" under the clock in TestFlight builds; cover it with the bar's own colour."""
    shot = shot.copy()
    scale = shot.width / 1179
    top, bottom, right = round(96 * scale), round(128 * scale), round(360 * scale)
    band = ImageDraw.Draw(shot)
    for x in range(0, right, 4):
        colour = shot.getpixel((min(shot.width - 1, right + 40), round(112 * scale)))
        band.rectangle([x, top, x + 4, bottom], fill=colour)
    return shot


def iphone(screen, screen_width, visible_height):
    """Rounded titanium-style frame, thin black bezel, Dynamic Island hidden by the real status bar."""
    scale = screen_width / screen.width
    screen = screen.resize((screen_width, round(screen.height * scale)), Image.LANCZOS)
    bezel, rim = round(screen_width * 0.022), round(screen_width * 0.012)
    radius = round(screen_width * 0.1)
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


def screenshot(index, top, bottom, accent, folder, size):
    W, H = size
    page = android.backdrop(W, H).convert('RGBA')
    draw = ImageDraw.Draw(page)
    unit = W / 1206
    width = W - round(150 * unit)
    font = ImageFont.truetype(WIDE, min(android.fit_font(line, WIDE, width, round(84 * unit)).size for shot in SHOTS for line in shot[:2]))
    y = round(180 * unit)
    draw.text(((W - font.getlength(top)) / 2, y), top, font=font, fill=PAPER)
    draw.text(((W - font.getlength(bottom)) / 2, y + font.size * 1.12), bottom, font=font, fill=accent)
    raw = Image.open(HERE / 'raw' / f'{index}.PNG').convert('RGB')
    top_y = round(450 * unit)
    phone = iphone(without_testflight(raw) if index in TESTFLIGHT_LABEL else raw, round(W * 0.78), H - top_y)
    glow, pad = android.shadow(phone, blur=round(44 * unit), opacity=160)
    x = (W - phone.width) // 2
    page.alpha_composite(glow, (x - pad, top_y - pad))
    page.alpha_composite(phone, (x, top_y))
    out = HERE / 'out' / folder
    out.mkdir(parents=True, exist_ok=True)
    page.convert('RGB').save(out / f'screenshot-{index}.png', optimize=True)


if __name__ == '__main__':
    for folder, size in SIZES.items():
        for number, (top, bottom, accent) in enumerate(SHOTS, start=1):
            screenshot(number, top, bottom, accent, folder, size)
        print('Saved to', HERE / 'out' / folder)
