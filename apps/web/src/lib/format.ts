import type { Unit } from './types';

const METRES_PER_MILE = 1609.344;
const nairaNumber = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Money is integer kobo. `100000` → `₦1,000.00`. */
export function formatMoney(kobo: number | string | null | undefined): string {
  const value = Number(kobo ?? 0);
  if (!Number.isFinite(value)) return '₦0.00';
  const naira = Math.abs(value) / 100;
  return `${value < 0 ? '−' : ''}₦${nairaNumber.format(naira)}`;
}

/** Keep a naira input readable while preserving an unfinished decimal (for example, `1,000.`). */
export function formatNairaInput(value: string): string {
  const clean = value.replace(/[^\d.]/g, '');
  const [whole, ...fraction] = clean.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction.length ? `${grouped}.${fraction.join('').slice(0, 2)}` : grouped;
}

export function nairaInputToKobo(value: string): number {
  return Math.round(Number(value.replace(/,/g, '') || 0) * 100);
}

export function distanceValue(metres: number, unit: Unit = 'km'): number {
  return unit === 'mi' ? metres / METRES_PER_MILE : metres / 1000;
}

/** Number part only, e.g. `12.45`. */
export function formatDistanceNumber(metres: number, unit: Unit = 'km'): string {
  const value = distanceValue(Math.max(0, metres), unit);
  const digits = value >= 1000 ? 0 : value >= 100 ? 1 : 2;
  return value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatDistance(metres: number, unit: Unit = 'km'): string {
  return `${formatDistanceNumber(metres, unit)} ${unit}`;
}

/** Convert a user-entered distance in their unit back to whole metres. */
export function toMetres(value: number, unit: Unit = 'km'): number {
  return Math.round(unit === 'mi' ? value * METRES_PER_MILE : value * 1000);
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Minutes per km/mi, e.g. `5:32`. Returns null when there is too little distance to be meaningful. */
export function formatPace(metres: number, seconds: number, unit: Unit = 'km'): string | null {
  if (metres < 50 || seconds <= 0) return null;
  const perUnit = seconds / distanceValue(metres, unit);
  if (!Number.isFinite(perUnit) || perUnit > 60 * 60) return null;
  const m = Math.floor(perUnit / 60);
  const s = Math.round(perUnit % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Average speed for cycling; GPS distance divided by moving time. */
export function formatSpeed(metres: number, seconds: number, unit: Unit = 'km'): string | null {
  if (metres < 50 || seconds <= 0) return null;
  return `${(distanceValue(metres, unit) * 3600 / seconds).toFixed(1)} ${unit}/h`;
}

export function formatDate(iso: string | null | undefined, options: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...options });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '-';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return diff >= 0 ? 'in a moment' : 'just now';
  if (abs < hour) return relative.format(Math.round(diff / minute), 'minute');
  if (abs < day) return relative.format(Math.round(diff / hour), 'hour');
  if (abs < 14 * day) return relative.format(Math.round(diff / day), 'day');
  return formatDate(iso, { year: new Date(iso).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
}

/** Compact countdown such as `2d 4h`, `3h 12m` or `45m`. */
export function formatCountdown(iso: string, now = Date.now()): string {
  const diff = Math.max(0, new Date(iso).getTime() - now);
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

/** `YYYY-MM-DDTHH:mm` in the user’s local timezone — the value format `DateTimePicker` uses. */
export function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** "Monday evening run", from when it started. */
export function activityName(iso: string, type: 'walk' | 'run' | 'cycle') {
  const date = new Date(iso);
  const hour = date.getHours();
  const part = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  return `${date.toLocaleDateString('en-GB', { weekday: 'long' })} ${part} ${type === 'cycle' ? 'ride' : type}`;
}
