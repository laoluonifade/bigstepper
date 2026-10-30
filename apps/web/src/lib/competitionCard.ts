import { JUMP_LOGO } from '../components/icons';
import { circleImage } from './boardImage';

import type { CardFormat, CompetitionCardData } from '@jump/shared/competition';

export type { CardFormat, CardPerson, CompetitionCardData } from '@jump/shared/competition';

export const SIZES: Record<CardFormat, { w: number; h: number }> = { story: { w: 1080, h: 1920 }, post: { w: 1080, h: 1350 } };
export const INK = '#121212';
export const PAPER = '#F2EFE8';
export const VOLT = '#E4FF3A';
export const FONT = 'Archivo, system-ui, sans-serif';
export const MONO = '"JetBrains Mono", ui-monospace, monospace';

export function setFont(ctx: CanvasRenderingContext2D, spec: string, stretch: 'normal' | 'condensed' | 'expanded' = 'normal', family = FONT) {
  ctx.font = `${spec} ${family}`;
  try { (ctx as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = stretch; } catch { /* older browsers */ }
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else { lines.push(line); line = word; }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, colour: string) {
  const scale = height / JUMP_LOGO.height;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = colour;
  ctx.fill(new Path2D(JUMP_LOGO.letters), 'evenodd');
  ctx.fill(new Path2D(JUMP_LOGO.arrow));
  ctx.restore();
}

/** Base size in points; drawn at 3x, so a story is 1080 x 1920 and a post 1080 x 1350. Same layout as the app's card. */
export const K = 3;
export const PAD = 22;
export const CARD = '#FBFAF6';
export const TRACK = '#FF5A1F';
export const INK2 = '#55524B';

/** A sticker: rounded, outlined, a hard ink shadow, slightly tilted about its centre. `draw` paints inside it. */
export function sticker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, tilt: number, draw?: () => void) {
  const r = 14;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((tilt * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = INK;
  roundRect(ctx, 4, 4, w, h, r);
  ctx.fill();
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (draw) {
    ctx.save();
    roundRect(ctx, 0, 0, w, h, r);
    ctx.clip();
    draw();
    ctx.restore();
  }
  ctx.restore();
}

/** Text shrunk (down to `min`) until it fits `width`; returns the size used. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, min: number, width: number, stretch: 'normal' | 'condensed' | 'expanded', family = FONT) {
  let at = size;
  for (; at > min; at -= 0.5) {
    setFont(ctx, `${weight} ${at}px`, stretch, family);
    if (ctx.measureText(text).width <= width) break;
  }
  return at;
}

/** The ink tag with volt capitals, as at the top of the card. Returns its width. */
export function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, alignRight = false) {
  setFont(ctx, '800 8.5px', 'expanded');
  const label = text.toUpperCase();
  const w = Math.min(316, ctx.measureText(label).width + 18);
  const left = alignRight ? x - w : x;
  ctx.fillStyle = INK;
  roundRect(ctx, left, y, w, 19, 9);
  ctx.fill();
  ctx.fillStyle = VOLT;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + 9, y + 10, w - 18);
  ctx.textBaseline = 'alphabetic';
  return w;
}

const PODIUM = {
  story: [[106, 0, 104, 146, 2], [0, 18, 98, 128, -4], [218, 22, 98, 124, 4]],
  post: [[106, 0, 104, 110, 2], [0, 12, 98, 98, -4], [218, 16, 98, 94, 4]],
} as const;
const PLACES = [{ place: '1ST', bg: VOLT }, { place: '2ND', bg: CARD }, { place: '3RD', bg: TRACK }];

/**
 * A competition as a picture to post, in the same sticker style as the app: what it is, what wins, who's
 * on the podium, and the join code big enough to type from a story.
 */
export function drawCompetitionCard(canvas: HTMLCanvasElement, data: CompetitionCardData, format: CardFormat, avatars: Map<string, HTMLImageElement>) {
  const { w: PW, h: PH } = SIZES[format];
  const story = format === 'story';
  canvas.width = PW;
  canvas.height = PH;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(K, K);
  const W = PW / K;
  const H = PH / K;
  const inner = W - PAD * 2;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // Top: the wordmark and a callout.
  wordmark(ctx, PAD, PAD, 14, INK);
  const callout = data.me ? (data.me.scored && data.me.rank ? `I’m #${data.me.rank} · beat me` : 'I’m in · join me') : 'Join me';
  tag(ctx, callout, W - PAD, PAD - 2, true);

  // The name, up to two lines, then what kind of competition it is.
  const titleTop = PAD + 14 + (story ? 24 : 12);
  const titleBox = story ? 64 : 44;
  let size = story ? 30 : 21;
  let lines: string[] = [];
  for (; size > 12; size -= 0.5) {
    setFont(ctx, `900 ${size}px`, 'expanded');
    lines = wrap(ctx, data.title.toUpperCase(), inner, 2);
    if (lines.length * size * 1.07 <= titleBox && lines.every((line) => ctx.measureText(line).width <= inner)) break;
  }
  ctx.fillStyle = INK;
  ctx.textBaseline = 'top';
  lines.forEach((line, index) => ctx.fillText(line, PAD, titleTop + index * size * 1.07));
  ctx.textBaseline = 'alphabetic';
  const kindTop = titleTop + titleBox + (story ? 10 : 8);
  tag(ctx, data.kind, PAD, kindTop);

  // The headline sticker in the activity's colour, with the stakes, headcount and time left beside it.
  const rowTop = kindTop + 19 + (story ? 22 : 12);
  const bigW = (inner + 4) * (1.35 / 2.35);
  const bigSize = story ? 58 : 44;
  const bigH = 12 + bigSize + 4 + 11 + 12;
  sticker(ctx, PAD, rowTop + 4, bigW, bigH, data.accent, -2, () => {
    const fitted = fitText(ctx, data.big.toUpperCase(), 800, bigSize, 20, bigW - 28, 'condensed');
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(data.big.toUpperCase(), bigW / 2, 12 + (bigSize - fitted) / 2);
    setFont(ctx, '800 9px', 'expanded');
    ctx.fillText(data.small.toUpperCase(), bigW / 2, 12 + bigSize + 4, bigW - 20);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });
  const cash = data.stakes.startsWith('₦');
  const chips = [data.stakes, `${data.entrants} in`, data.timing].filter(Boolean);
  const chipX = PAD + bigW - 4;
  const chipW = inner - bigW + 4;
  const chipH = (story ? 9 : 6) * 2 + 12;
  let chipY = rowTop;
  chips.forEach((text, index) => {
    const dark = index === 0 && cash;
    sticker(ctx, chipX + (index === 1 ? -8 : 0), chipY, chipW, chipH, dark ? INK : CARD, [3, -2, 2][index], () => {
      fitText(ctx, text.toUpperCase(), 800, 9, 6, chipW - 16, 'expanded');
      ctx.fillStyle = dark ? VOLT : INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.toUpperCase(), chipW / 2, chipH / 2 + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    });
    chipY += chipH - 3;
  });

  // The podium: second and third either side, first raised in the middle. Or an empty sticker.
  const podiumTop = rowTop + Math.max(4 + bigH, chipY - rowTop + 3) + (story ? 24 : 12);
  const podium = data.podium.slice(0, 3);
  if (podium.length) {
    for (const index of [1, 2, 0]) {
      const person = podium[index];
      if (!person) continue;
      const [x, y, w, h, tilt] = PODIUM[story ? 'story' : 'post'][index];
      const first = index === 0;
      const face = story ? (first ? 40 : 34) : (first ? 32 : 28);
      sticker(ctx, PAD + x, podiumTop + y, w, h - 3, PLACES[index].bg, tilt, () => {
        ctx.fillStyle = INK;
        ctx.textBaseline = 'top';
        setFont(ctx, `900 ${first ? 10 : 9}px`, 'expanded');
        ctx.fillText(PLACES[index].place, 11, story ? 10 : 7);
        const faceTop = (story ? 10 : 7) + (first ? 10 : 9) + 4;
        circleImage(ctx, avatars.get(person.userId), (w - face) / 2, faceTop, face, INK, 1.2);
        ctx.textAlign = 'center';
        setFont(ctx, `700 ${first ? 11.5 : 10.5}px`);
        const name = person.userId === data.me?.userId ? 'You' : person.name.split(' ')[0];
        ctx.fillText(name, w / 2, faceTop + face + 5, w * 0.88);
        const scoreSize = story ? (first ? 22 : 18) : (first ? 18 : 15);
        fitText(ctx, person.score, 800, scoreSize, 9, w * 0.9, 'condensed');
        ctx.fillText(person.score, w / 2, faceTop + face + 5 + (first ? 11.5 : 10.5) + 4);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      });
    }
  } else {
    sticker(ctx, PAD, podiumTop + (story ? 40 : 26), inner, 62, CARD, -1, () => {
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      setFont(ctx, '800 16px');
      ctx.fillText('Nobody’s scored yet.', inner / 2, 14);
      setFont(ctx, '800 9px', 'expanded');
      ctx.fillText('FIRST RUN TAKES IT', inner / 2, 38);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    });
  }

  // You, under the podium, when you've scored but aren't on it (story only).
  const me = data.me;
  if (story && me?.scored && !podium.some((row) => row.userId === me.userId)) {
    sticker(ctx, PAD, podiumTop + 150 + 14, inner, 34, VOLT, 1, () => {
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      setFont(ctx, '800 15px', 'condensed');
      ctx.fillText(String(me.rank ?? ''), 14, 17);
      setFont(ctx, '800 13px');
      ctx.fillText('You', 46, 17);
      setFont(ctx, '800 16px', 'condensed');
      ctx.textAlign = 'right';
      ctx.fillText(me.score, inner - 14, 17);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    });
  }

  // The join code, big enough to type from a story, with an arrow in.
  const codeH = story ? 76 : 60;
  const codeTop = H - (story ? 44 : 38) - codeH;
  sticker(ctx, PAD, codeTop, inner, codeH, INK, -1.5, () => {
    const arrow = story ? 44 : 38;
    ctx.textBaseline = 'top';
    ctx.fillStyle = VOLT;
    setFont(ctx, '900 9.5px', 'expanded');
    const codeSize = story ? 38 : 30;
    const blockTop = (codeH - (11 + 2 + codeSize)) / 2;
    ctx.fillText('JOIN WITH CODE', 16, blockTop);
    ctx.fillStyle = PAPER;
    fitText(ctx, data.code, 600, codeSize, 14, inner - 32 - arrow - 10, 'normal', MONO);
    ctx.fillText(data.code, 16, blockTop + 13);
    ctx.textBaseline = 'alphabetic';
    const cx = inner - 16 - arrow / 2;
    const cy = codeH / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, arrow / 2, 0, Math.PI * 2);
    ctx.fillStyle = VOLT;
    ctx.fill();
    ctx.save();
    ctx.translate(cx - 9, cy - 9);
    ctx.scale(18 / 24, 18 / 24);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D('M4 20 20 4M9 4h11v11'));
    ctx.restore();
  });

  // Footer: the link, and the line.
  setFont(ctx, '700 7.5px', 'expanded');
  ctx.textBaseline = 'alphabetic';
  const motto = 'MOVE. COMPETE. WIN.';
  const mottoW = ctx.measureText(motto).width;
  ctx.fillStyle = INK2;
  ctx.fillText(data.link.toUpperCase(), PAD, H - (PAD - 6) - 2, inner - mottoW - 8);
  ctx.fillStyle = TRACK;
  ctx.textAlign = 'right';
  ctx.fillText(motto, W - PAD, H - (PAD - 6) - 2);
  ctx.textAlign = 'left';
}
