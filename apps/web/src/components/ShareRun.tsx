import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { activityName, formatDistanceNumber, formatDuration, formatPace } from '../lib/format';
import type { Activity, Unit } from '../lib/types';
import { CloseIcon, ShareIcon } from './icons';
import { cx, Segmented } from './ui';

type Format = 'story' | 'square';

const SIZES: Record<Format, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

const INK = '#121212';
const PAPER = '#F2EFE8';
const TRACK = '#FF4D12';
const VOLT = '#E4FF3A';
const FONT = 'Archivo, system-ui, sans-serif';

interface ShareData {
  activity: Activity;
  unit: Unit;
  route: Array<[number, number]> | null;
  format: Format;
}

function distanceOf(activity: Activity) {
  if (activity.verificationStatus !== 'VERIFIED') return activity.recordedDistanceMetres;
  return Math.max(activity.validatedDistanceMetres, activity.stepDistanceMetres ?? 0);
}

/** Projects lat/lon to flat metres (fine at run scale), then fits the route into a box keeping its shape. */
function fitRoute(route: Array<[number, number]>, box: { x: number; y: number; w: number; h: number }) {
  const lat0 = route[0][0];
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const flat = route.map(([lat, lon]) => [lon * 111_320 * cos, -lat * 110_540]);
  const xs = flat.map((p) => p[0]);
  const ys = flat.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const offX = box.x + (box.w - spanX * scale) / 2;
  const offY = box.y + (box.h - spanY * scale) / 2;
  return flat.map(([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale] as const);
}

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const u = size / 32;
  ctx.fillStyle = INK;
  ctx.strokeStyle = 'rgba(242,239,232,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 5 * u);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = TRACK;
  ctx.fillRect(x + 6 * u, y + 18 * u, 6 * u, 8 * u);
  ctx.fillRect(x + 13 * u, y + 12 * u, 6 * u, 14 * u);
  ctx.fillStyle = VOLT;
  ctx.fillRect(x + 20 * u, y + 6 * u, 6 * u, 20 * u);
}

function setFont(ctx: CanvasRenderingContext2D, spec: string, stretch: 'normal' | 'condensed' | 'expanded' = 'normal') {
  ctx.font = `${spec} ${FONT}`;
  try {
    (ctx as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = stretch;
  } catch {
    // Older browsers ignore font stretch; the layout still fits.
  }
}

/** Draws the share image. Everything on it comes from the activity itself. */
export function drawShareImage(canvas: HTMLCanvasElement, { activity, unit, route, format }: ShareData) {
  const { w, h } = SIZES[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const pad = 84;
  const story = format === 'story';

  // Background with a warm glow, and a faint grid like a track.
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.85, h * 0.12, 0, w * 0.85, h * 0.12, w * 0.9);
  glow.addColorStop(0, 'rgba(255,77,18,0.35)');
  glow.addColorStop(1, 'rgba(255,77,18,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(242,239,232,0.05)';
  ctx.lineWidth = 2;
  for (let gx = pad; gx < w; gx += 120) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }

  // Header: mark + wordmark, date.
  drawMark(ctx, pad, pad, 64);
  ctx.fillStyle = PAPER;
  setFont(ctx, 'italic 900 44px', 'expanded');
  ctx.textBaseline = 'middle';
  ctx.fillText('JUMP', pad + 84, pad + 34);
  setFont(ctx, '600 30px');
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,239,232,0.6)';
  ctx.fillText(new Date(activity.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), w - pad, pad + 34);
  ctx.textAlign = 'left';

  // Route (or the Jump steps when hidden/unavailable).
  const routeBox = story ? { x: pad + 20, y: 260, w: w - pad * 2 - 40, h: 760 } : { x: pad + 20, y: 190, w: w - pad * 2 - 40, h: 290 };
  if (route && route.length >= 2) {
    const pts = fitRoute(route, routeBox);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(228,255,58,0.55)';
    ctx.shadowBlur = 36;
    ctx.strokeStyle = VOLT;
    ctx.lineWidth = story ? 16 : 12;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.shadowBlur = 0;
    const [sx, sy] = pts[0];
    const [ex, ey] = pts[pts.length - 1];
    ctx.fillStyle = TRACK;
    ctx.beginPath();
    ctx.arc(sx, sy, story ? 18 : 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(ex, ey, story ? 18 : 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const barW = story ? 120 : 80;
    const gap = barW * 0.35;
    const baseY = routeBox.y + routeBox.h * 0.85;
    const maxH = routeBox.h * 0.7;
    const startX = w / 2 - (barW * 3 + gap * 2) / 2;
    [0.45, 0.72, 1].forEach((ratio, i) => {
      ctx.fillStyle = i === 2 ? VOLT : TRACK;
      ctx.fillRect(startX + i * (barW + gap), baseY - maxH * ratio, barW, maxH * ratio);
    });
  }

  // Name + verified badge.
  const statsTop = story ? 1110 : 560;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(242,239,232,0.6)';
  setFont(ctx, '700 30px', 'expanded');
  ctx.fillText(activityName(activity.startedAt, activity.activityType).toUpperCase(), pad, statsTop);
  if (activity.verificationStatus === 'VERIFIED') {
    setFont(ctx, '800 26px', 'expanded');
    const label = '✓ VERIFIED';
    const bw = ctx.measureText(label).width + 40;
    ctx.fillStyle = VOLT;
    ctx.beginPath();
    ctx.roundRect(w - pad - bw, statsTop - 38, bw, 52, 6);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(label, w - pad - bw + 20, statsTop - 2);
  }

  // Distance, huge.
  const metres = distanceOf(activity);
  ctx.fillStyle = VOLT;
  setFont(ctx, `900 ${story ? 300 : 190}px`, 'condensed');
  const distance = formatDistanceNumber(metres, unit);
  const distY = statsTop + (story ? 290 : 172);
  ctx.fillText(distance, pad - 8, distY);
  const dw = ctx.measureText(distance).width;
  ctx.fillStyle = PAPER;
  setFont(ctx, `800 ${story ? 64 : 46}px`, 'expanded');
  ctx.fillText(unit.toUpperCase(), pad + dw + 16, distY);

  // Time and pace.
  const seconds = activity.movingSeconds || activity.elapsedSeconds;
  const cells = [
    ['TIME', formatDuration(seconds)],
    [`PACE /${unit.toUpperCase()}`, formatPace(metres, seconds, unit) ?? '–:––'],
  ];
  const rowY = distY + (story ? 140 : 96);
  ctx.strokeStyle = 'rgba(242,239,232,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, rowY - (story ? 70 : 50));
  ctx.lineTo(w - pad, rowY - (story ? 70 : 50));
  ctx.stroke();
  cells.forEach(([label, value], i) => {
    const x = pad + i * ((w - pad * 2) / 2);
    ctx.fillStyle = 'rgba(242,239,232,0.55)';
    setFont(ctx, '700 26px', 'expanded');
    ctx.fillText(label, x, rowY);
    ctx.fillStyle = PAPER;
    setFont(ctx, `900 ${story ? 96 : 68}px`, 'condensed');
    ctx.fillText(value, x, rowY + (story ? 100 : 72));
  });

  // Footer.
  ctx.fillStyle = 'rgba(242,239,232,0.5)';
  setFont(ctx, '700 28px', 'expanded');
  ctx.fillText('STARTAJUMP.COM', pad, h - pad + 4);
  ctx.textAlign = 'right';
  ctx.fillStyle = TRACK;
  ctx.fillText('EVERY STEP COUNTS.', w - pad, h - pad + 4);
  ctx.textAlign = 'left';
}

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`900 100px ${FONT}`),
      document.fonts.load(`italic 900 44px ${FONT}`),
      document.fonts.load(`700 30px ${FONT}`),
    ]);
  } catch {
    // Falls back to system fonts.
  }
}

/** "Share" button + sheet that renders a shareable image of the run. */
export function ShareRun({ activity, unit, className, autoOpen = false }: { activity: Activity; unit: Unit; className?: string; autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const autoOpened = useRef(false);
  const [format, setFormat] = useState<Format>('story');
  const [showRoute, setShowRoute] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const track = useQuery({
    queryKey: ['activity-track', activity.id],
    queryFn: () => api<{ points: Array<[number, number]> }>(`/activities/${activity.id}/track`),
    enabled: open,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!open || track.isLoading) return;
    let cancelled = false;
    void (async () => {
      await fontsReady();
      if (cancelled) return;
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;
      drawShareImage(canvas, { activity, unit, format, route: showRoute ? track.data?.points ?? null : null });
      canvas.toBlob((blob) => {
        if (cancelled || !blob) return;
        blobRef.current = blob;
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      }, 'image/png');
    })();
    return () => {
      cancelled = true;
    };
  }, [activity, format, open, showRoute, track.data, track.isLoading, unit]);

  // Open once, the first time it's asked to (e.g. when a just-finished run comes back verified).
  useEffect(() => {
    if (autoOpen && !autoOpened.current) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [autoOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const filename = `jump-${activity.activityType}-${activity.startedAt.slice(0, 10)}.png`;

  async function share() {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], filename, { type: 'image/png' });
    const distance = `${formatDistanceNumber(distanceOf(activity), unit)} ${unit}`;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My Jump run', text: `${distance} on Jump — startajump.com` });
        setStatus(null);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('Sharing didn’t work here — save the image instead.');
      }
    } else {
      save();
      setStatus('Saved. Your browser can’t share files directly, so post it from your photos.');
    }
  }

  function save() {
    if (!preview) return;
    const link = document.createElement('a');
    link.href = preview;
    link.download = filename;
    link.click();
  }

  const hasRoute = (track.data?.points.length ?? 0) >= 2;

  return (
    <>
      <button type="button" className={cx('btn-secondary', className)} onClick={() => setOpen(true)}>
        <ShareIcon size={16} /> Share
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Share your activity">
            <div className="absolute inset-0 animate-fade bg-ink/60" onClick={() => setOpen(false)} />
            <div className="safe-bottom relative max-h-[94vh] w-full max-w-md animate-sheet-up overflow-y-auto rounded-t-xl border-t-2 border-ink bg-card px-4 pt-4 sm:animate-pop sm:rounded-xl sm:border-2 sm:pb-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="wide text-[15px] font-extrabold uppercase">Share your {activity.activityType}</p>
                <button type="button" className="rounded p-1.5 hover:bg-ink/[0.06]" aria-label="Close" onClick={() => setOpen(false)}>
                  <CloseIcon size={18} />
                </button>
              </div>

              <div className={cx('mx-auto overflow-hidden rounded-md border-[1.5px] border-ink bg-ink', format === 'story' ? 'aspect-[9/16] max-h-[52vh]' : 'aspect-square max-h-[52vh]')}>
                {preview ? (
                  <img key={preview} src={preview} alt="Preview of your share image" className="h-full w-full animate-fade object-contain" />
                ) : (
                  <div className="h-full w-full animate-shimmer bg-[linear-gradient(90deg,#1c1c1c_0%,#2a2a2a_50%,#1c1c1c_100%)] bg-[length:200%_100%]" />
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Segmented<Format>
                  label="Image size"
                  value={format}
                  onChange={setFormat}
                  options={[
                    { value: 'story', label: 'Story' },
                    { value: 'square', label: 'Square' },
                  ]}
                />
                <label className={cx('flex items-center gap-2 text-[13px] font-semibold', !hasRoute && 'opacity-50')}>
                  <input type="checkbox" className="h-4 w-4 accent-ink" checked={showRoute && hasRoute} disabled={!hasRoute} onChange={(event) => setShowRoute(event.target.checked)} />
                  Show route
                </label>
              </div>
              <p className="mt-2 text-[12px] text-ink-3">
                {hasRoute ? 'Your route can show where you live — hide it before sharing a run from home.' : 'No route to draw for this activity.'}
              </p>

              {status && <p className="mt-3 text-[13px] text-ink-2">{status}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" className="btn-primary" disabled={!preview} onClick={() => void share()}>
                  <ShareIcon size={16} /> Share
                </button>
                <button type="button" className="btn-secondary" disabled={!preview} onClick={save}>
                  Save image
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
