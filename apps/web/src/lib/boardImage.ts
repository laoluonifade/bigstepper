import { defaultAvatarUrl } from './avatars';
import { flag } from './countries';
import { formatDistance } from './format';
import type { Unit } from './types';

export interface BoardImageRow {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  countryCode: string | null;
  metres: number;
  isMe: boolean;
}

export interface BoardImageData {
  /** "🌍 Global" or "🇳🇬 Nigeria". */
  scope: string;
  /** "On foot · This week". */
  filter: string;
  rows: BoardImageRow[];
  me: BoardImageRow | null;
  unit: Unit;
  showFlags: boolean;
}

const W = 1080;
const H = 1350;
const INK = '#121212';
const PAPER = '#F2EFE8';
const VOLT = '#E4FF3A';
const TRACK = '#FF5A1F';
const FONT = 'Archivo, system-ui, -apple-system, sans-serif';

function loadImage(src: string, cors: boolean) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    if (cors) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Everyone's picture, ready to draw: their photo when the host allows it on a canvas, else their default
 * picture. Generated pictures are data URLs, so they never block exporting.
 */
export async function loadAvatars(rows: BoardImageRow[], photos = true) {
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(rows.map(async (row) => {
    const photo = photos && row.avatarUrl ? await loadImage(row.avatarUrl, true) : null;
    const image = photo ?? await loadImage(defaultAvatarUrl(row.displayName), false);
    if (image) images.set(row.userId, image);
  }));
  return images;
}

function circleImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement | undefined, x: number, y: number, size: number, ring: string, ringWidth: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#2A2A2E';
  ctx.fill();
  ctx.clip();
  if (image) {
    // Cover-fit: fill the circle without stretching.
    const scale = Math.max(size / image.width, size / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, x + (size - w) / 2, y + (size - h) / 2, w, h);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.lineWidth = ringWidth;
  ctx.strokeStyle = ring;
  ctx.stroke();
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const firstName = (row: BoardImageRow) => (row.isMe ? 'You' : row.displayName.split(' ')[0]);

/** The board as a 1080×1350 picture for sharing: podium, the next places, and you if you're further back. */
export function drawBoardImage(canvas: HTMLCanvasElement, data: BoardImageData, avatars: Map<string, HTMLImageElement>) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const pad = 72;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.88, 80, 0, W * 0.88, 80, W * 0.85);
  glow.addColorStop(0, 'rgba(255,90,31,0.32)');
  glow.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(242,239,232,0.05)';
  ctx.lineWidth = 2;
  for (let x = pad; x < W; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }

  // Header: the brand, what board this is, and which slice of it.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TRACK;
  ctx.font = `900 italic 44px ${FONT}`;
  ctx.fillText('JUMP', pad, 112);
  ctx.fillStyle = PAPER;
  ctx.font = `800 72px ${FONT}`;
  ctx.fillText('Leaderboard', pad, 196);
  ctx.font = `600 34px ${FONT}`;
  ctx.fillStyle = 'rgba(242,239,232,0.7)';
  ctx.fillText(fit(ctx, `${data.scope} · ${data.filter}`, W - pad * 2), pad, 248);

  // Podium: second, first, third.
  const top = data.rows.slice(0, 3);
  const columns = [top[1], top[0], top[2]];
  const colW = (W - pad * 2) / 3;
  const baseY = 730;
  const blocks = [96, 140, 64];
  columns.forEach((row, index) => {
    if (!row) return;
    const first = row.rank === 1;
    const cx = pad + colW * index + colW / 2;
    const size = first ? 160 : 120;
    const blockTop = baseY - blocks[index];
    const avatarY = blockTop - 124 - size;
    circleImage(ctx, avatars.get(row.userId), cx - size / 2, avatarY, size, first || row.isMe ? VOLT : 'rgba(242,239,232,0.3)', first ? 8 : 5);
    if (data.showFlags && row.countryCode) {
      ctx.font = `${first ? 44 : 36}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(flag(row.countryCode), cx + size * 0.36, avatarY + size + 6);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = row.isMe ? VOLT : PAPER;
    ctx.font = `700 ${first ? 38 : 32}px ${FONT}`;
    ctx.fillText(fit(ctx, firstName(row), colW - 20), cx, blockTop - 66);
    ctx.fillStyle = first ? VOLT : 'rgba(242,239,232,0.8)';
    ctx.font = `800 ${first ? 40 : 32}px ${FONT}`;
    ctx.fillText(formatDistance(row.metres, data.unit), cx, blockTop - 20);
    ctx.fillStyle = first ? VOLT : 'rgba(242,239,232,0.1)';
    roundRect(ctx, cx - colW / 2 + 10, blockTop, colW - 20, blocks[index] + 20, 22);
    ctx.fill();
    ctx.fillStyle = first ? INK : 'rgba(242,239,232,0.75)';
    ctx.font = `900 ${first ? 64 : 48}px ${FONT}`;
    ctx.fillText(String(row.rank), cx, blockTop + (first ? 72 : 54));
    ctx.textAlign = 'left';
  });

  // The next places, on a paper card.
  const meBelow = data.me && !data.rows.slice(0, 10).some((row) => row.isMe) ? data.me : null;
  const list = data.rows.slice(3, meBelow ? 9 : 10);
  const rowH = 70;
  const cardY = baseY + 40;
  const cardH = Math.max(1, list.length + (meBelow ? 1 : 0)) * rowH + 20;
  if (list.length || meBelow) {
    ctx.fillStyle = PAPER;
    roundRect(ctx, pad, cardY, W - pad * 2, cardH, 28);
    ctx.fill();
    // Rows stay inside the card's rounded corners (your highlighted row included).
    ctx.save();
    roundRect(ctx, pad, cardY, W - pad * 2, cardH, 28);
    ctx.clip();
    const leader = data.rows[0]?.metres ?? 0;
    const drawRow = (row: BoardImageRow, y: number) => {
      if (row.isMe) {
        ctx.fillStyle = 'rgba(228,255,58,0.55)';
        ctx.fillRect(pad, y, W - pad * 2, rowH);
      }
      ctx.fillStyle = 'rgba(18,18,18,0.5)';
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(String(row.rank), pad + 28, y + 46);
      circleImage(ctx, avatars.get(row.userId), pad + 92, y + 10, 50, INK, 3);
      const nameX = pad + 160;
      ctx.fillStyle = INK;
      ctx.font = `700 29px ${FONT}`;
      const flagText = data.showFlags && row.countryCode ? ` ${flag(row.countryCode)}` : '';
      ctx.fillText(fit(ctx, `${row.isMe ? 'You' : row.displayName}${flagText}`, W - pad * 2 - 160 - 200), nameX, y + 38);
      // How far off the top, as a thin bar.
      const barW = W - pad * 2 - 160 - 220;
      ctx.fillStyle = 'rgba(18,18,18,0.08)';
      roundRect(ctx, nameX, y + 50, barW, 7, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(18,18,18,0.7)';
      roundRect(ctx, nameX, y + 50, Math.max(8, barW * (leader ? row.metres / leader : 0)), 7, 4);
      ctx.fill();
      ctx.textAlign = 'right';
      ctx.fillStyle = INK;
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(formatDistance(row.metres, data.unit), W - pad - 28, y + 46);
      ctx.textAlign = 'left';
    };
    list.forEach((row, index) => {
      const y = cardY + 10 + index * rowH;
      if (index > 0) { ctx.fillStyle = 'rgba(18,18,18,0.08)'; ctx.fillRect(pad + 24, y, W - pad * 2 - 48, 2); }
      drawRow(row, y);
    });
    if (meBelow) {
      const y = cardY + 10 + list.length * rowH;
      ctx.strokeStyle = 'rgba(18,18,18,0.3)';
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(pad + 24, y); ctx.lineTo(W - pad - 24, y); ctx.stroke();
      ctx.setLineDash([]);
      drawRow(meBelow, y);
    }
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(242,239,232,0.55)';
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText('Verified distance · startajump.com', pad, H - 34);
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), W - pad, H - 34);
  ctx.textAlign = 'left';
}
