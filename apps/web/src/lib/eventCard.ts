import { CARD, fitText, INK, INK2, K, MONO, PAD, PAPER, setFont, SIZES, sticker, tag, TRACK, VOLT, wordmark, wrap, type CardFormat } from './competitionCard';
import { EVENT_NOUN, type ClubEvent } from './club-events';
import { formatDistance } from './format';
import type { Unit } from './types';

export type EventCardData = {
  title: string;
  /** "OTA Runners · Run" */
  kind: string;
  accent: string;
  /** "SAT 31 OCT" */
  day: string;
  /** "7:00 AM · WEEKLY" */
  time: string;
  /** Where to meet, on its own sticker so a long name has room. */
  venue: string;
  chips: string[];
  slug: string;
  /** Without the scheme: "startajump.com/events/calorie-burn-run". */
  link: string;
};

export function eventCardData(event: ClubEvent, unit: Unit, host: string): EventCardData {
  const at = event.nextAt ? new Date(event.nextAt) : null;
  const zone = (options: Intl.DateTimeFormatOptions) => {
    if (!at) return '';
    try { return at.toLocaleString('en-GB', { timeZone: event.timeZone, ...options }); } catch { return at.toLocaleString('en-GB', options); }
  };
  const repeat = event.repeat === 'once' ? '' : ` · ${event.repeat === 'weekly' ? 'weekly' : event.repeat === 'monthly' ? 'monthly' : 'repeats'}`;
  return {
    title: event.title,
    kind: `${event.club.name} · ${EVENT_NOUN[event.activity]}`,
    accent: event.club.accentColor || TRACK,
    day: at ? zone({ weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '') : 'Finished',
    time: at ? `${zone({ hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ')}${repeat}` : '',
    venue: [event.venue, event.address].filter(Boolean).join(', ') || 'Meeting point to be confirmed',
    chips: [event.distanceMetres ? formatDistance(event.distanceMetres, unit) : EVENT_NOUN[event.activity], event.attendeeCount ? `${event.attendeeCount} going` : 'Free pass']
      .filter((chip): chip is string => Boolean(chip)),
    slug: event.slug ?? event.id.slice(0, 8),
    link: `${host}/events/${event.slug ?? event.id}`,
  };
}

/** Load the cover so it can be drawn; null when it can't be (no cover, or the host blocks it). */
export function loadCover(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * An event as a picture to post, in the same sticker style as the competition card: what and when, where,
 * the cover photo, and the link to get a pass.
 */
export function drawEventCard(canvas: HTMLCanvasElement, data: EventCardData, format: CardFormat, cover: HTMLImageElement | null) {
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

  wordmark(ctx, PAD, PAD, 14, INK);

  // The name, up to two lines, then who's hosting and what kind of session it is.
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

  // When, big on the club's colour, with where, how far and who's going beside it.
  const rowTop = kindTop + 19 + (story ? 22 : 12);
  const bigW = (inner + 4) * (1.35 / 2.35);
  const bigSize = story ? 40 : 32;
  const bigH = 12 + bigSize + 6 + 11 + 12;
  sticker(ctx, PAD, rowTop + 4, bigW, bigH, data.accent, -2, () => {
    fitText(ctx, data.day.toUpperCase(), 800, bigSize, 14, bigW - 24, 'condensed');
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(data.day.toUpperCase(), bigW / 2, 12);
    fitText(ctx, data.time.toUpperCase(), 800, 10, 6, bigW - 20, 'expanded');
    ctx.fillText(data.time.toUpperCase(), bigW / 2, 12 + bigSize + 6);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });
  const chipX = PAD + bigW - 4;
  const chipW = inner - bigW + 4;
  const chipH = (story ? 9 : 6) * 2 + 12;
  let chipY = rowTop;
  data.chips.slice(0, 2).forEach((text, index) => {
    sticker(ctx, chipX + (index === 1 ? -8 : 0), chipY, chipW, chipH, CARD, [3, -2, 2][index], () => {
      fitText(ctx, text.toUpperCase(), 800, 9, 6, chipW - 16, 'expanded');
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.toUpperCase(), chipW / 2, chipH / 2 + 0.5, chipW - 16);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    });
    chipY += chipH + (story ? 6 : 3);
  });

  // Where: its own sticker with a pin, wrapping to two lines (and shrinking) for a long place name.
  const venueTop = rowTop + Math.max(4 + bigH, chipY - rowTop) + (story ? 14 : 8);
  let venueSize = story ? 13 : 11.5;
  let venueLines: string[] = [];
  for (; venueSize > 8; venueSize -= 0.5) {
    setFont(ctx, `700 ${venueSize}px`);
    venueLines = wrap(ctx, data.venue, inner - 52, 2);
    if (venueLines.every((line) => ctx.measureText(line).width <= inner - 52) && !venueLines[venueLines.length - 1].endsWith('…')) break;
  }
  const venueH = 20 + venueLines.length * venueSize * 1.25;
  sticker(ctx, PAD, venueTop, inner, venueH, CARD, -1, () => {
    const cy = venueH / 2;
    ctx.fillStyle = data.accent;
    ctx.beginPath();
    ctx.arc(22, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.save();
    ctx.translate(22 - 6, cy - 7);
    ctx.scale(12 / 24, 12 / 24);
    ctx.lineWidth = 3;
    ctx.stroke(new Path2D('M12 22s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12Z'));
    ctx.beginPath();
    ctx.arc(12, 10, 2.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.textBaseline = 'top';
    setFont(ctx, `700 ${venueSize}px`);
    venueLines.forEach((line, index) => ctx.fillText(line, 42, 10 + index * venueSize * 1.25));
    ctx.textBaseline = 'alphabetic';
  });

  // The cover photo as a big sticker, or a sticker that says what a pass gets you.
  const codeH = story ? 76 : 60;
  const codeTop = H - (story ? 44 : 38) - codeH;
  const photoTop = venueTop + venueH + (story ? 18 : 10);
  const photoH = codeTop - photoTop - (story ? 22 : 14);
  if (cover && photoH >= 60) {
    sticker(ctx, PAD, photoTop, inner, photoH, INK, 1.5, () => {
      const scale = Math.max(inner / cover.width, photoH / cover.height);
      const w = cover.width * scale;
      const h = cover.height * scale;
      ctx.drawImage(cover, (inner - w) / 2, (photoH - h) / 2, w, h);
    });
  } else if (photoH >= 50) {
    sticker(ctx, PAD, photoTop + (story ? 18 : 6), inner, 62, CARD, -1, () => {
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      setFont(ctx, '800 16px');
      ctx.fillText('Free to come along.', inner / 2, 14);
      setFont(ctx, '800 9px', 'expanded');
      ctx.fillText('GET A PASS · WE’LL REMIND YOU', inner / 2, 38);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    });
  }

  // How to get in: the event's short link, with an arrow.
  sticker(ctx, PAD, codeTop, inner, codeH, INK, -1.5, () => {
    const arrow = story ? 44 : 38;
    const linkSize = story ? 24 : 20;
    const blockTop = (codeH - (11 + 4 + linkSize)) / 2;
    ctx.textBaseline = 'top';
    ctx.fillStyle = VOLT;
    setFont(ctx, '900 9.5px', 'expanded');
    ctx.fillText('GET YOUR FREE PASS', 16, blockTop);
    ctx.fillStyle = PAPER;
    fitText(ctx, data.slug, 600, linkSize, 10, inner - 32 - arrow - 10, 'normal', MONO);
    ctx.fillText(data.slug, 16, blockTop + 15);
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

  setFont(ctx, '700 7.5px', 'expanded');
  ctx.fillStyle = INK2;
  ctx.fillText(data.link.toUpperCase(), PAD, H - (PAD - 6) - 2, inner);
}
