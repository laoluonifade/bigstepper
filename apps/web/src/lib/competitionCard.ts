import { JUMP_LOGO } from '../components/icons';
import { circleImage } from './boardImage';

import type { CardFormat, CompetitionCardData } from '@jump/shared/competition';

export type { CardFormat, CardPerson, CompetitionCardData } from '@jump/shared/competition';

const SIZES: Record<CardFormat, { w: number; h: number }> = { story: { w: 1080, h: 1920 }, post: { w: 1080, h: 1350 } };
const INK = '#121212';
const PAPER = '#F2EFE8';
const VOLT = '#E4FF3A';
const FONT = 'Archivo, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

function setFont(ctx: CanvasRenderingContext2D, spec: string, stretch: 'normal' | 'condensed' | 'expanded' = 'normal', family = FONT) {
  ctx.font = `${spec} ${family}`;
  try { (ctx as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = stretch; } catch { /* older browsers */ }
}

/** Largest size (≤ max) at which text fits the width, with the font set to it. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, weight: string, max: number, width: number, stretch: 'normal' | 'condensed' | 'expanded' = 'normal') {
  let size = max;
  for (; size > 24; size -= 6) {
    setFont(ctx, `${weight} ${size}px`, stretch);
    if (ctx.measureText(text).width <= width) break;
  }
  return size;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, colour: string) {
  const scale = height / JUMP_LOGO.height;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = colour;
  ctx.fill(new Path2D(JUMP_LOGO.letters), 'evenodd');
  ctx.fill(new Path2D(JUMP_LOGO.arrow));
  ctx.restore();
}

/** A rounded pill, text centred; returns its width. */
function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, h: number, fill: string, colour: string, font: string, alignRight = false) {
  setFont(ctx, font, 'expanded');
  const w = ctx.measureText(text).width + h * 0.9;
  const left = alignRight ? x - w : x;
  ctx.fillStyle = fill;
  roundRect(ctx, left, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, left + w / 2, y + h / 2 + 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return w;
}

/**
 * A competition as a picture to post: what it is, what's at stake, who's winning, and how to get in.
 * Built to be stopped on in a story feed: one huge word, the track lanes, and the join code at
 * billboard size.
 */
export function drawCompetitionCard(canvas: HTMLCanvasElement, data: CompetitionCardData, format: CardFormat, avatars: Map<string, HTMLImageElement>) {
  const { w: W, h: H } = SIZES[format];
  const story = format === 'story';
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const pad = 84;

  // Stage: ink, an orange glow up top, a volt glow low down, and the track lanes sweeping through.
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const glowTop = ctx.createRadialGradient(W, 0, 0, W, 0, W * 1.05);
  glowTop.addColorStop(0, 'rgba(255,90,31,0.42)');
  glowTop.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = glowTop;
  ctx.fillRect(0, 0, W, H);
  const glowLow = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.95);
  glowLow.addColorStop(0, 'rgba(228,255,58,0.22)');
  glowLow.addColorStop(1, 'rgba(228,255,58,0)');
  ctx.fillStyle = glowLow;
  ctx.fillRect(0, 0, W, H);
  for (let lane = 0; lane < 8; lane += 1) {
    const lift = lane * (story ? 92 : 70);
    ctx.beginPath();
    ctx.moveTo(-120, H * 0.98 - lift);
    ctx.bezierCurveTo(W * 0.35, H * 0.82 - lift, W * 0.62, H * 0.42 - lift * 0.8, W + 120, H * 0.3 - lift * 0.7);
    ctx.strokeStyle = 'rgba(242,239,232,0.06)';
    ctx.lineWidth = 22;
    ctx.stroke();
  }
  // One bold lane in the activity's colour, low enough to run behind the board, never through the words.
  ctx.beginPath();
  ctx.moveTo(-120, H * 0.9);
  ctx.bezierCurveTo(W * 0.3, H * 0.86, W * 0.7, H * 0.7, W + 120, H * (story ? 0.56 : 0.6));
  ctx.strokeStyle = data.accent;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 14;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Header: the wordmark, and what you're saying.
  const top = story ? 104 : 76;
  wordmark(ctx, pad, top, story ? 66 : 56, PAPER);
  const callout = data.me ? (data.me.scored && data.me.rank ? `I’M #${data.me.rank} · BEAT ME` : 'I’M IN · JOIN ME') : 'JOIN ME';
  pill(ctx, callout, W - pad, top - 6, story ? 76 : 66, VOLT, INK, `900 ${story ? 30 : 26}px`, true);

  // The big word, the line under it, then the competition's own name.
  let y = story ? 330 : 214;
  setFont(ctx, `800 ${story ? 32 : 28}px`, 'expanded');
  ctx.fillStyle = 'rgba(242,239,232,0.65)';
  ctx.fillText(data.kind.toUpperCase(), pad, y);
  const bigSize = fitSize(ctx, data.big.toUpperCase(), '900', story ? 330 : 210, W - pad * 2, 'condensed');
  y += bigSize * 0.86;
  ctx.fillStyle = data.accent;
  ctx.fillText(data.big.toUpperCase(), pad - 6, y);
  y += story ? 64 : 46;
  setFont(ctx, `800 ${story ? 40 : 32}px`, 'expanded');
  ctx.fillStyle = PAPER;
  ctx.fillText(data.small.toUpperCase(), pad, y);
  y += story ? 104 : 70;
  setFont(ctx, `800 ${story ? 70 : 52}px`);
  ctx.fillStyle = PAPER;
  for (const line of wrap(ctx, data.title, W - pad * 2, story ? 2 : 1)) {
    ctx.fillText(line, pad, y);
    y += story ? 80 : 58;
  }

  // Stakes, how many are in, time left.
  y += story ? 4 : 0;
  let x = pad;
  const chipH = story ? 66 : 58;
  for (const [text, fill, colour] of [
    [data.stakes, data.stakes.startsWith('₦') ? VOLT : 'rgba(242,239,232,0.12)', data.stakes.startsWith('₦') ? INK : PAPER],
    [`${data.entrants} IN`, 'rgba(242,239,232,0.12)', PAPER],
    [data.timing, 'rgba(242,239,232,0.12)', PAPER],
  ] as const) {
    if (!text) continue;
    x += pill(ctx, text.toUpperCase(), x, y, chipH, fill, colour, `800 ${story ? 26 : 23}px`) + 14;
  }
  y += chipH + (story ? 56 : 30);

  // Who's winning: the top three (and you, if you're further back).
  const rows = [...data.podium.slice(0, 3)];
  if (data.me?.scored && !rows.some((row) => row.userId === data.me!.userId)) rows.push(data.me);
  const rowH = story ? 104 : 74;
  const cardH = Math.max(1, rows.length) * rowH + (story ? 100 : 76);
  ctx.fillStyle = PAPER;
  roundRect(ctx, pad, y, W - pad * 2, cardH, 36);
  ctx.fill();
  setFont(ctx, `800 ${story ? 26 : 22}px`, 'expanded');
  ctx.fillStyle = 'rgba(18,18,18,0.5)';
  ctx.fillText('LIVE LEADERBOARD', pad + 40, y + (story ? 60 : 46));
  let rowY = y + (story ? 84 : 62);
  if (!rows.length) {
    setFont(ctx, `700 ${story ? 40 : 34}px`);
    ctx.fillStyle = INK;
    ctx.fillText('Nobody’s scored yet. First run takes it.', pad + 40, rowY + rowH * 0.6);
  }
  for (const row of rows) {
    const mine = row.userId === data.me?.userId;
    if (mine) {
      ctx.fillStyle = 'rgba(228,255,58,0.85)';
      roundRect(ctx, pad + 16, rowY + 4, W - pad * 2 - 32, rowH - 8, 22);
      ctx.fill();
    }
    const medal = row.rank === 1 ? '#FFD34E' : row.rank === 2 ? '#C9CFD6' : row.rank === 3 ? '#E0A06A' : 'rgba(18,18,18,0.08)';
    ctx.fillStyle = medal;
    ctx.beginPath();
    ctx.arc(pad + 76, rowY + rowH / 2, story ? 30 : 25, 0, Math.PI * 2);
    ctx.fill();
    setFont(ctx, `900 ${story ? 32 : 27}px`);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(row.rank), pad + 76, rowY + rowH / 2 + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const avatar = story ? 70 : 54;
    circleImage(ctx, avatars.get(row.userId), pad + 124, rowY + (rowH - avatar) / 2, avatar, INK, 3);
    setFont(ctx, `800 ${story ? 36 : 30}px`);
    ctx.fillStyle = INK;
    const nameX = pad + 124 + avatar + 22;
    ctx.textAlign = 'right';
    ctx.fillText(row.score, W - pad - 40, rowY + rowH / 2 + 12);
    const scoreW = ctx.measureText(row.score).width;
    ctx.textAlign = 'left';
    let name = mine ? 'You' : row.name.split(' ')[0];
    while (name.length > 1 && ctx.measureText(name).width > W - pad - 40 - scoreW - 30 - nameX) name = name.slice(0, -1);
    ctx.fillText(name, nameX, rowY + rowH / 2 + 12);
    rowY += rowH;
  }
  y += cardH + (story ? 48 : 28);

  // The ask: the join code, huge, on volt.
  const ctaH = story ? 250 : 196;
  ctx.fillStyle = VOLT;
  roundRect(ctx, pad, y, W - pad * 2, ctaH, 40);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  setFont(ctx, `900 ${story ? 32 : 28}px`, 'expanded');
  ctx.fillStyle = INK;
  ctx.fillText('JOIN WITH CODE', pad + 48, y + (story ? 76 : 62));
  const codeSize = fitSize(ctx, data.code, '800', story ? 120 : 92, W - pad * 2 - 230);
  setFont(ctx, `800 ${codeSize}px`, 'normal', MONO);
  ctx.fillText(data.code, pad + 44, y + ctaH - (story ? 58 : 38));
  // An arrow in a circle: tap me.
  const cx = W - pad - 100;
  const cy = y + ctaH / 2;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, cy, story ? 66 : 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = VOLT;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy + 24);
  ctx.lineTo(cx + 22, cy - 22);
  ctx.moveTo(cx - 8, cy - 24);
  ctx.lineTo(cx + 24, cy - 24);
  ctx.lineTo(cx + 24, cy + 8);
  ctx.stroke();
  ctx.lineCap = 'butt';

  setFont(ctx, `700 ${story ? 32 : 26}px`);
  ctx.fillStyle = 'rgba(242,239,232,0.7)';
  ctx.textAlign = 'center';
  ctx.fillText(data.link, W / 2, story ? H - 70 : Math.min(H - 24, y + ctaH + 48));
  ctx.textAlign = 'left';
}
