import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '../database/sql';
import { CloudinaryService } from '../profiles/cloudinary.service';
import { AVATAR_TYPES } from '../profiles/profiles.service';
import { ClubEventsRepository, EventActivity, EventClub, EventInput, EventRow } from './club-events.repository';

const MAX_PER_CLUB = 20;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NOUN: Record<EventActivity, string> = { run: 'run', walk: 'walk', cycle: 'ride', any: 'meet-up' };

export function clockLabel(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
}

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'last'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PASS_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CHECK_IN_OPENS_MS = 12 * 60 * 60_000;

export function weekdayOf(startsOn: string) {
  const [year, month, day] = startsOn.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function nth(day: number) {
  const tens = day % 100;
  return `${day}${tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`;
}

const listed = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? '');
const shortDate = (iso: string) => { const [, month, date] = iso.split('-').map(Number); return `${date} ${MONTHS[month - 1]}`; };

export function whenLabel(event: Pick<EventInput, 'repeat' | 'repeatEvery' | 'weekdays' | 'monthMode' | 'monthWeek' | 'startsOn' | 'endsOn' | 'startTime'>) {
  const weekday = weekdayOf(event.startsOn);
  const every = event.repeatEvery ?? 1;
  const at = `at ${clockLabel(event.startTime)}`;
  const until = event.endsOn && event.repeat !== 'once' ? `, until ${shortDate(event.endsOn)}` : '';
  if (event.repeat === 'once') return `${DAYS[weekday]} ${shortDate(event.startsOn)} ${at}`;
  if (event.repeat === 'daily') return `${every === 1 ? 'every day' : `every ${every} days`} ${at}${until}`;
  if (event.repeat === 'weekly') {
    const days = [...(event.weekdays?.length ? event.weekdays : [weekday])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((day) => DAYS[day]);
    const rule = every === 1 ? listed(days.map((day) => `${day}s`)) : `${every === 2 ? 'every other week' : `every ${every} weeks`} on ${listed(days)}`;
    return `${rule} ${at}${until}`;
  }
  const date = Number(event.startsOn.split('-')[2]);
  const which = event.monthMode === 'weekday' ? `the ${ORDINAL[event.monthWeek ?? 1]} ${DAYS[weekday]}` : `the ${nth(date)}`;
  return `${which} of ${every === 1 ? 'every month' : `every ${every} months`} ${at}${until}`;
}

export function passCode(random: () => number = Math.random) {
  return `JMP-${Array.from({ length: 6 }, () => PASS_LETTERS[Math.floor(random() * PASS_LETTERS.length)]).join('')}`;
}

export function localDay(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function localClock(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  return clockLabel(`${parts.find((part) => part.type === 'hour')?.value}:${parts.find((part) => part.type === 'minute')?.value}`);
}

function validZone(timeZone: string) {
  try { new Intl.DateTimeFormat('en', { timeZone }); return true; } catch { return false; }
}

@Injectable()
export class ClubEventsService {
  constructor(private readonly repo: ClubEventsRepository, private readonly cloudinary: CloudinaryService) {}

  private async club(ref: string, viewerId: string | null) {
    const club = await this.repo.club(ref, viewerId);
    if (!club) throw new NotFoundException('Club not found');
    return club;
  }

  private assertManager(club: EventClub) {
    if (club.role !== 'owner' && club.role !== 'admin') throw new ForbiddenException('Only the club owner or a manager can do that');
  }

  private async event(eventId: string, viewerId: string | null, latitude?: number | null, longitude?: number | null) {
    const event = await this.repo.one(eventId, viewerId, latitude ?? null, longitude ?? null);
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private assertPlace(input: Pick<EventInput, 'venue' | 'latitude' | 'longitude'>) {
    if (!input.venue?.trim() || input.latitude == null || input.longitude == null) throw new BadRequestException('Set the meeting point first');
  }

  private clean(input: EventInput): EventInput {
    if (!validZone(input.timeZone)) throw new BadRequestException('Invalid time zone');
    if (Number.isNaN(Date.parse(`${input.startsOn}T00:00:00Z`))) throw new BadRequestException('Pick a valid date');
    if (input.repeat === 'weekly' && !input.weekdays?.length) throw new BadRequestException('Pick at least one day of the week');
    if (input.repeat === 'monthly' && input.monthMode === 'weekday' && !input.monthWeek) throw new BadRequestException('Pick which week of the month');
    if (input.endsOn && input.endsOn < input.startsOn) throw new BadRequestException('The end date is before the first one');
    return {
      ...input,
      title: input.title.trim(),
      venue: input.venue?.trim() || null,
      notes: input.notes?.trim() || null,
      address: input.address?.trim() || null,
      distanceMetres: input.distanceMetres ?? null,
      repeatEvery: input.repeat === 'once' ? 1 : input.repeatEvery ?? 1,
      weekdays: input.repeat === 'weekly' ? [...new Set(input.weekdays)].sort() : [],
      monthMode: input.repeat === 'monthly' ? input.monthMode ?? 'date' : null,
      monthWeek: input.repeat === 'monthly' && input.monthMode === 'weekday' ? input.monthWeek ?? null : null,
      endsOn: input.repeat === 'once' ? null : input.endsOn || null,
    };
  }

  async forClub(ref: string, viewerId: string | null) {
    const club = await this.club(ref, viewerId);
    return this.repo.forClub(club.id, viewerId);
  }

  async discover(viewerId: string | null, latitude: number | null, longitude: number | null, km: number) {
    if (!viewerId) return { nearby: await this.repo.upcoming(), going: [], clubs: [] };
    const [nearby, going, clubs] = await Promise.all([
      latitude === null || longitude === null ? Promise.resolve([] as EventRow[]) : this.repo.nearby(viewerId, latitude, longitude, km),
      this.repo.going(viewerId),
      this.repo.fromClubs(viewerId),
    ]);
    return { nearby, going, clubs };
  }

  get(eventId: string, viewerId: string | null, latitude?: number | null, longitude?: number | null) {
    return this.event(eventId, viewerId, latitude, longitude);
  }

  async create(actorId: string, ref: string, input: EventInput, draft = false) {
    const club = await this.club(ref, actorId);
    this.assertManager(club);
    if (club.suspended) throw new ForbiddenException('This club can’t post events right now');
    if (await this.repo.count(club.id) >= MAX_PER_CLUB) throw new ConflictException(`A club can have up to ${MAX_PER_CLUB} events`);
    const event = this.clean(input);
    if (!draft) this.assertPlace(event);
    const eventId = await this.repo.dataSource.transaction(async (db) => {
      const created = await this.repo.insert(db, club.id, actorId, event, draft);
      if (!draft) await this.announce(db, club, actorId, event, created);
      return created;
    });
    return this.event(eventId, actorId);
  }

  private announce(db: Db, club: EventClub, actorId: string, event: Pick<EventInput, 'activity' | 'title' | 'venue'> & Parameters<typeof whenLabel>[0], eventId: string) {
    return this.repo.announce(db, club.id, actorId, `New ${NOUN[event.activity]} from ${club.name}`,
      `${event.title}: ${whenLabel(event)} at ${event.venue}. Tap to get your pass and a reminder before it starts.`, `/events/${eventId}`);
  }

  drafts(actorId: string) {
    return this.repo.drafts(actorId);
  }

  async publish(actorId: string, eventId: string) {
    const event = await this.event(eventId, actorId);
    if (!event.canManage) throw new ForbiddenException('Only the club owner or a manager can do that');
    if (!event.draft) throw new ConflictException('It’s already published');
    this.assertPlace(event);
    const club = await this.club(event.clubId, actorId);
    if (club.suspended) throw new ForbiddenException('This club can’t post events right now');
    if (!(await this.repo.publish(event.id))) throw new ConflictException('It’s already published');
    await this.announce(this.repo.dataSource, club, actorId, event, event.id);
    return this.event(eventId, actorId);
  }

  async update(actorId: string, eventId: string, input: EventInput) {
    const event = await this.event(eventId, actorId);
    if (!event.canManage) throw new ForbiddenException('Only the club owner or a manager can do that');
    const next = this.clean(input);
    if (!event.draft) this.assertPlace(next);
    await this.repo.update(event.id, next);
    return this.event(eventId, actorId);
  }

  async remove(actorId: string, eventId: string) {
    const event = await this.event(eventId, actorId);
    if (!event.canManage) throw new ForbiddenException('Only the club owner or a manager can do that');
    await this.repo.remove(event.id);
    return { removed: true };
  }

  async setCover(actorId: string, eventId: string, file: { buffer: Buffer; mimetype: string } | undefined) {
    const event = await this.event(eventId, actorId);
    if (!event.canManage) throw new ForbiddenException('Only the club owner or a manager can do that');
    if (!file) throw new BadRequestException('Choose an image to upload');
    if (!AVATAR_TYPES.includes(file.mimetype)) throw new BadRequestException('Use a JPG, PNG, WebP or HEIC image');
    await this.repo.setCover(event.id, await this.cloudinary.uploadEventCover(event.id, file));
    return this.event(eventId, actorId);
  }

  async removeCover(actorId: string, eventId: string) {
    const event = await this.event(eventId, actorId);
    if (!event.canManage) throw new ForbiddenException('Only the club owner or a manager can do that');
    if (event.coverUrl) await this.cloudinary.removeEventCover(event.id).catch(() => undefined);
    await this.repo.setCover(event.id, null);
    return this.event(eventId, actorId);
  }

  private async attend(eventId: string, clubId: string, userId: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { return await this.repo.join(eventId, clubId, userId, passCode()); }
      catch (error) { if ((error as { code?: string }).code !== '23505') throw error; }
    }
    throw new ConflictException('Couldn’t issue a pass. Try again.');
  }

  async join(userId: string, eventId: string) {
    const event = await this.event(eventId, userId);
    if (event.draft) throw new ConflictException('This event isn’t published yet');
    if (event.isHost) throw new ConflictException('You’re hosting this one, so you don’t need a pass');
    if (!event.nextAt) throw new ConflictException('This event has finished');
    await this.attend(event.id, event.clubId, userId);
    return this.event(eventId, userId);
  }

  async guests(actorId: string, eventId: string) {
    const event = await this.event(eventId, actorId);
    if (!event.canManage) throw new ForbiddenException('Only the club owner or a manager can see the guest list');
    return { nextAt: event.nextAt, guests: await this.repo.guests(event.id) };
  }

  async checkIn(actorId: string, eventId: string, match: { code?: string; userId?: string }, on: boolean, now = Date.now()) {
    const event = await this.event(eventId, actorId);
    if (!event.canManage) throw new ForbiddenException('Only the club owner or a manager can check people in');
    if (on && (!event.nextAt || new Date(event.nextAt).getTime() - now > CHECK_IN_OPENS_MS)) throw new ConflictException('Check-in opens 12 hours before it starts');
    const userId = await this.repo.checkIn(event.id, { code: match.code?.trim(), userId: match.userId }, on);
    if (!userId) throw new NotFoundException(match.code ? 'No pass with that code for this event' : 'They aren’t on the guest list');
    return { userId, checkedIn: on };
  }

  async leave(userId: string, eventId: string) {
    const event = await this.event(eventId, userId);
    await this.repo.leave(event.id, userId);
    return this.event(eventId, userId);
  }
}
