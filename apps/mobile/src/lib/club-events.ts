import { Linking, Platform } from 'react-native';

export type EventActivity = 'run' | 'walk' | 'cycle' | 'any';
export type ClubEvent = {
  id: string;
  clubId: string;
  title: string;
  activity: EventActivity;
  notes: string | null;
  /** 0 is Sunday, as in JavaScript's getDay. */
  weekday: number;
  /** `HH:mm`, in the venue's time zone. */
  startTime: string;
  timeZone: string;
  durationMinutes: number;
  distanceMetres: number | null;
  venue: string;
  address: string | null;
  latitude: number;
  longitude: number;
  /** The next time it starts, or this week's while it's still going. */
  nextAt: string;
  club: { id: string; slug: string; name: string; logoUrl: string | null; accentColor: string; verified: boolean; privacy: 'open' | 'invite' };
  attendeeCount: number;
  going: boolean;
  canManage: boolean;
  faces: Array<{ displayName: string | null; avatarUrl: string | null; avatarStyle: 'masculine' | 'feminine' | 'neutral' }>;
  distanceKm: number | null;
};
export type EventInput = Pick<ClubEvent, 'title' | 'activity' | 'notes' | 'weekday' | 'startTime' | 'timeZone' | 'durationMinutes' | 'distanceMetres' | 'venue' | 'address' | 'latitude' | 'longitude'>;
export type Place = { name: string; address: string; latitude: number; longitude: number };

export const eventKey = (id: string) => ['club-event', id] as const;
export const clubEventsKey = (club: string) => ['club', club, 'events'] as const;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday first, the way a club thinks about its week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const EVENT_NOUN: Record<EventActivity, string> = { run: 'Run', walk: 'Walk', cycle: 'Ride', any: 'Meet-up' };
export const ACTIVITY_OPTIONS: Array<{ value: EventActivity; label: string; detail: string }> = [
  { value: 'run', label: 'Group run', detail: 'Runners of every pace' },
  { value: 'walk', label: 'Group walk', detail: 'A walking group or hike' },
  { value: 'cycle', label: 'Group ride', detail: 'Cyclists riding together' },
  { value: 'any', label: 'Open to everyone', detail: 'Runners, walkers and riders all welcome' },
];
export const DAY_OPTIONS = WEEK_ORDER.map((day) => ({ value: String(day), label: `Every ${WEEKDAYS[day]}` }));
export const MIN_DURATION = 15;
export const MAX_DURATION = 24 * 60;

/** "7:00 am" from "07:00". */
export function clockLabel(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
}

/** "Every Saturday · 7:00 am" */
export const everyLabel = (event: Pick<ClubEvent, 'weekday' | 'startTime'>) => `Every ${WEEKDAYS[event.weekday]} · ${clockLabel(event.startTime)}`;

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

const dayStamp = (at: Date, timeZone: string) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); }
  catch { return at.toDateString(); }
};

/** Where this week's session stands: on now, today, tomorrow, or a date. */
export function nextLabel(event: Pick<ClubEvent, 'nextAt' | 'timeZone' | 'durationMinutes'>, now = Date.now()) {
  const at = new Date(event.nextAt);
  if (now >= at.getTime() && now < at.getTime() + event.durationMinutes * 60_000) return { live: true, label: 'Happening now' };
  const today = dayStamp(new Date(now), event.timeZone);
  const day = dayStamp(at, event.timeZone);
  if (day === today) return { live: false, label: 'Today' };
  if (day === dayStamp(new Date(now + 86_400_000), event.timeZone)) return { live: false, label: 'Tomorrow' };
  let label: string;
  try { label = at.toLocaleDateString('en-GB', { timeZone: event.timeZone, weekday: 'short', day: 'numeric', month: 'short' }); }
  catch { label = at.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
  return { live: false, label };
}

export function distanceAway(km: number | null) {
  if (km === null) return null;
  return km < 1 ? `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m away` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}

export const deviceTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

/** Opens the phone's maps app with directions to the meeting point. */
export function openDirections(event: Pick<ClubEvent, 'latitude' | 'longitude' | 'venue'>) {
  const at = `${event.latitude},${event.longitude}`;
  const label = encodeURIComponent(event.venue);
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${at}&q=${label}` : `geo:${at}?q=${at}(${label})`;
  void Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${at}`));
}
