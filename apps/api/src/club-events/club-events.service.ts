import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClubEventsRepository, EventActivity, EventClub, EventInput, EventRow } from './club-events.repository';

const MAX_PER_CLUB = 20;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NOUN: Record<EventActivity, string> = { run: 'run', walk: 'walk', cycle: 'ride', any: 'meet-up' };

export function clockLabel(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
}

export function whenLabel(event: Pick<EventInput, 'weekday' | 'startTime'>) {
  return `${DAYS[event.weekday]}s at ${clockLabel(event.startTime)}`;
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
  constructor(private readonly repo: ClubEventsRepository) {}

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

  private clean(input: EventInput): EventInput {
    if (!validZone(input.timeZone)) throw new BadRequestException('Invalid time zone');
    return {
      ...input,
      title: input.title.trim(),
      venue: input.venue.trim(),
      notes: input.notes?.trim() || null,
      address: input.address?.trim() || null,
      distanceMetres: input.distanceMetres ?? null,
    };
  }

  async forClub(ref: string, viewerId: string | null) {
    const club = await this.club(ref, viewerId);
    if (club.privacy === 'invite' && !club.role) return [];
    return this.repo.forClub(club.id, viewerId);
  }

  async discover(viewerId: string, latitude: number | null, longitude: number | null, km: number) {
    const [nearby, going] = await Promise.all([
      latitude === null || longitude === null ? Promise.resolve([] as EventRow[]) : this.repo.nearby(viewerId, latitude, longitude, km),
      this.repo.going(viewerId),
    ]);
    return { nearby, going };
  }

  get(eventId: string, viewerId: string | null, latitude?: number | null, longitude?: number | null) {
    return this.event(eventId, viewerId, latitude, longitude);
  }

  async create(actorId: string, ref: string, input: EventInput) {
    const club = await this.club(ref, actorId);
    this.assertManager(club);
    if (club.suspended) throw new ForbiddenException('This club can’t post events right now');
    if (await this.repo.count(club.id) >= MAX_PER_CLUB) throw new ConflictException(`A club can have up to ${MAX_PER_CLUB} weekly events`);
    const event = this.clean(input);
    const eventId = await this.repo.dataSource.transaction(async (db) => {
      const created = await this.repo.insert(db, club.id, actorId, event);
      await this.repo.announce(db, club.id, actorId, `New weekly ${NOUN[event.activity]} from ${club.name}`,
        `${event.title}: ${whenLabel(event)} at ${event.venue}. Tap to join and get a reminder each week.`, `/events/${created}`);
      return created;
    });
    await this.repo.join(eventId, club.id, actorId);
    return this.event(eventId, actorId);
  }

  async update(actorId: string, eventId: string, input: EventInput) {
    const event = await this.event(eventId, actorId);
    if (!event.canManage) throw new ForbiddenException('Only the club owner or a manager can do that');
    await this.repo.update(event.id, this.clean(input));
    return this.event(eventId, actorId);
  }

  async remove(actorId: string, eventId: string) {
    const event = await this.event(eventId, actorId);
    if (!event.canManage) throw new ForbiddenException('Only the club owner or a manager can do that');
    await this.repo.remove(event.id);
    return { removed: true };
  }

  async join(userId: string, eventId: string) {
    const event = await this.event(eventId, userId);
    await this.repo.join(event.id, event.clubId, userId);
    return this.event(eventId, userId);
  }

  async leave(userId: string, eventId: string) {
    const event = await this.event(eventId, userId);
    await this.repo.leave(event.id, userId);
    return this.event(eventId, userId);
  }
}
