export type EventActivity = 'run' | 'walk' | 'cycle' | 'any';
export type EventRepeat = 'once' | 'daily' | 'weekly' | 'monthly';
import { countryName, flag } from './countries';

export type ClubEvent = {
  id: string;
  /** The short name in its link: startajump.com/events/calorie-burn-run. */
  slug?: string;
  clubId: string;
  title: string;
  activity: EventActivity;
  notes: string | null;
  repeat: EventRepeat;
  /** Every how many days, weeks or months it repeats. */
  repeatEvery: number;
  /** Weekly events: the days it's on, 0 being Sunday. */
  weekdays: number[];
  /** Monthly events: on the same date each month, or the same weekday of the same week ("second Saturday"). */
  monthMode: 'date' | 'weekday' | null;
  /** Monthly by weekday: which week of the month, 1 to 4, or 5 for the last. */
  monthWeek: number | null;
  /** `YYYY-MM-DD`: the date of the first (or only) session. */
  startsOn: string;
  /** `YYYY-MM-DD`: no sessions after this, or null to repeat forever. */
  endsOn: string | null;
  /** The day of the week it falls on, 0 being Sunday. */
  weekday: number;
  /** `HH:mm`, in the venue's time zone. */
  startTime: string;
  timeZone: string;
  durationMinutes: number;
  distanceMetres: number | null;
  /** Null only on a draft that hasn't been given a meeting point yet. */
  venue: string | null;
  address: string | null;
  /** Where the meeting point is, as a two-letter code; null until Jump has looked it up. */
  countryCode?: string | null;
  coverUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  /** The next time it starts, or the current one's while it's still going; null once a one-off is over. */
  nextAt: string | null;
  club: { id: string; slug: string; name: string; logoUrl: string | null; accentColor: string; verified: boolean; privacy: 'open' | 'invite' };
  attendeeCount: number;
  going: boolean;
  canManage: boolean;
  faces: Array<{ displayName: string | null; avatarUrl: string | null; avatarStyle: 'masculine' | 'feminine' | 'neutral' }>;
  distanceKm: number | null;
  /** The viewer's pass, once they've joined. */
  pass: { code: string; checkedIn: boolean } | null;
  /** What you can register for. Every event has a free pass; prices and limits come with paid tickets. */
  tickets?: TicketType[];
  /** Saved but not posted: only the club's managers can see it, and nobody's been told. */
  draft: boolean;
  /** The viewer created it: hosts don't need a pass to their own event. */
  isHost: boolean;
};
export type TicketType = { id: string; name: string; description: string | null; priceMinor: number; currency: string; capacity: number | null; remaining: number | null };

/** What registering gives back: the pass to show straight away, or a note that one was already sent. */
export type Registration =
  | { status: 'issued'; sentTo: string; holder: string | null; ticketType: string; pass: { code: string; checkedIn: boolean }; event: ClubEvent }
  | { status: 'existing'; sentTo: string };

export type Guest = { userId: string; username: string | null; displayName: string | null; avatarUrl: string | null; avatarStyle: 'masculine' | 'feminine' | 'neutral'; passCode: string; checkedIn: boolean; joinedAt: string };
export const ACTIVITY_WORD: Record<EventActivity, string> = { run: 'Running', walk: 'Walking', cycle: 'Cycling', any: 'Run, walk or ride' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ORDINAL = ['', 'First', 'Second', 'Third', 'Fourth', 'Last'];

/** "Sat 14 Nov" from "2026-11-14". */
export function dateLabel(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()].slice(0, 3)} ${day} ${MONTHS[month - 1]}`;
}

/** "Sat, 7:00 AM", or "Sat 14 Nov, 7:00 AM" when it's a one-off or more than a week away: the next session, as on a poster. */
export function posterTime(event: Pick<ClubEvent, 'nextAt' | 'timeZone' | 'startTime' | 'repeat' | 'weekday'>, now = Date.now()) {
  if (!event.nextAt) return 'Finished';
  const at = new Date(event.nextAt);
  const day = at.getTime() - now > 6 * 86_400_000 || event.repeat === 'once' ? dateLabel(dayStamp(at, event.timeZone)) : WEEKDAYS[event.weekday].slice(0, 3);
  return `${day}, ${clockLabel(event.startTime).toUpperCase()}`;
}

export type Schedule = Pick<ClubEvent, 'repeat' | 'repeatEvery' | 'weekdays' | 'monthMode' | 'monthWeek' | 'endsOn'>;

const weekdayOf = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

/** "22nd" from 22. */
export function nth(day: number) {
  const tens = day % 100;
  return `${day}${tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`;
}

/** Which week of its month a date falls in, as monthWeek counts it: 1 to 4, or 5 when it's the last one. */
export function weekOfMonth(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const inMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day + 7 > inMonth ? 5 : Math.ceil(day / 7);
}

/** "second Saturday" for a monthly-by-weekday event starting on `isoDate`. */
export const weekdayInMonth = (isoDate: string, week = weekOfMonth(isoDate)) => `${ORDINAL[week].toLowerCase()} ${WEEKDAYS[weekdayOf(isoDate)]}`;

const listed = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? '');

/** The rule on its own: "Every Tue and Thu", "Every other week on Sat", "Monthly on the 22nd", "Every 3 days", or the one date. */
export function repeatRule(event: Schedule & Pick<ClubEvent, 'startsOn'>) {
  const every = event.repeatEvery || 1;
  const until = event.endsOn && event.repeat !== 'once' ? `, until ${dateLabel(event.endsOn).slice(4)}` : '';
  if (event.repeat === 'once') return dateLabel(event.startsOn);
  if (event.repeat === 'daily') return `${every === 1 ? 'Every day' : `Every ${every} days`}${until}`;
  if (event.repeat === 'weekly') {
    const picked = [...(event.weekdays.length ? event.weekdays : [weekdayOf(event.startsOn)])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const days = listed(picked.map((day) => (picked.length > 1 ? WEEKDAYS[day].slice(0, 3) : WEEKDAYS[day])));
    return `${every === 1 ? `Every ${days}` : `${every === 2 ? 'Every other week' : `Every ${every} weeks`} on ${days}`}${until}`;
  }
  const on = event.monthMode === 'weekday' ? `the ${weekdayInMonth(event.startsOn, event.monthWeek ?? weekOfMonth(event.startsOn))}` : `the ${nth(Number(event.startsOn.split('-')[2]))}`;
  return `${every === 1 ? 'Monthly' : `Every ${every} months`} on ${on}${until}`;
}

/** "Every Tue and Thu · 6:30 am": when it happens, for cards and pages. */
export const scheduleLabel = (event: Schedule & Pick<ClubEvent, 'startsOn' | 'startTime'>) => `${repeatRule(event)} · ${clockLabel(event.startTime)}`;

/** Today's date where you are, as `YYYY-MM-DD`. */
export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export type EventInput = Pick<ClubEvent, 'title' | 'activity' | 'notes' | 'repeat' | 'repeatEvery' | 'weekdays' | 'monthMode' | 'monthWeek' | 'startsOn' | 'endsOn' | 'startTime' | 'timeZone' | 'durationMinutes' | 'distanceMetres' | 'venue' | 'address' | 'latitude' | 'longitude'>;
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
export const MIN_DURATION = 15;
export const MAX_DURATION = 24 * 60;

/** "7:00 am" from "07:00". */
export function clockLabel(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
}


export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

const dayStamp = (at: Date, timeZone: string) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); }
  catch { return at.toDateString(); }
};

/** Where the next session stands: on now, today, tomorrow, a date, or finished. */
export function nextLabel(event: Pick<ClubEvent, 'nextAt' | 'timeZone' | 'durationMinutes'>, now = Date.now()) {
  if (!event.nextAt) return { live: false, label: 'Finished' };
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

/** Directions to the meeting point, in Google Maps. */
export function directionsUrl(event: Pick<ClubEvent, 'latitude' | 'longitude'>) {
  return `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`;
}

/** A calendar file for the next session, so the pass lands in the phone's calendar. */
export function calendarFile(event: Pick<ClubEvent, 'title' | 'nextAt' | 'durationMinutes' | 'venue' | 'address' | 'slug' | 'id' | 'club'>, origin = window.location.origin) {
  if (!event.nextAt) return null;
  const start = new Date(event.nextAt);
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);
  const stamp = (at: Date) => at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const clean = (text: string) => text.replace(/[\\;,]/g, (char) => `\\${char}`).replace(/\n/g, '\\n');
  const link = `${origin}/events/${event.slug ?? event.id}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jump//Events//EN', 'BEGIN:VEVENT',
    `UID:${event.id}-${stamp(start)}@startajump.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${clean(event.title)}`, `LOCATION:${clean([event.venue, event.address].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${clean(`With ${event.club.name}. Your pass: ${link}`)}`, `URL:${link}`, 'END:VEVENT', 'END:VCALENDAR',
  ];
  return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
}

const SAVED_PASSES = 'jump_event_passes';

/** Passes got on this browser without signing in, so coming back to the event still shows yours. */
export function savedPass(eventId: string): { code: string; holder: string } | null {
  try { return (JSON.parse(localStorage.getItem(SAVED_PASSES) ?? '{}') as Record<string, { code: string; holder: string }>)[eventId] ?? null; } catch { return null; }
}

export function savePass(eventId: string, pass: { code: string; holder: string }) {
  try {
    const all = JSON.parse(localStorage.getItem(SAVED_PASSES) ?? '{}') as Record<string, { code: string; holder: string }>;
    localStorage.setItem(SAVED_PASSES, JSON.stringify({ ...all, [eventId]: pass }));
  } catch { /* private mode: the pass is still in their email */ }
}

/** The meeting point with its country's flag in front, so a visitor can tell which country it's in. */
export function placeLabel(event: Pick<ClubEvent, 'venue' | 'countryCode'>) {
  return event.countryCode ? `${flag(event.countryCode)} ${event.venue ?? ''}`.trim() : event.venue ?? '';
}

export const countryLabel = (code: string) => `${flag(code)} ${countryName(code)}`;

/** Most people going first; ties go to whichever starts sooner. */
export const byPopularity = (a: ClubEvent, b: ClubEvent) => b.attendeeCount - a.attendeeCount || new Date(a.nextAt ?? 0).getTime() - new Date(b.nextAt ?? 0).getTime();
