import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { eventCancelledEmail, eventChangedEmail, eventGuestWelcomeEmail, eventReminderEmail, eventTicketEmail, type EventEmail } from '../mail/templates';
import { ClubEventsRepository, ContactRow, EventInput, EventRow, PassRow } from './club-events.repository';
import { passCode, whenLabel } from './club-events.service';
import qrcode = require('qrcode-generator');

export interface PassRequest {
  firstName?: string;
  email?: string;
  phone?: string;
  countryCode?: string;
  marketing?: boolean;
  ticketTypeId?: string;
}

const WATCHED: Array<[keyof EventInput, string]> = [
  ['startsOn', 'the date'], ['startTime', 'the time'], ['repeat', 'the schedule'], ['weekdays', 'the schedule'], ['venue', 'the meeting point'], ['address', 'the meeting point'],
];

export function eventChanges(before: Partial<EventInput>, after: Partial<EventInput>) {
  const changed = WATCHED.filter(([key]) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)).map(([, label]) => label);
  return [...new Set(changed)];
}

export function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
}

@Injectable()
export class EventPassesService {
  private readonly logger = new Logger(EventPassesService.name);

  constructor(
    private readonly repo: ClubEventsRepository,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private web(path: string) {
    return `${this.config.getOrThrow<string>('WEB_ORIGIN').split(',')[0].trim().replace(/\/+$/, '')}${path}`;
  }

  private api(path: string) {
    return `${(this.config.get<string>('API_PUBLIC_URL') || 'https://api.startajump.com/v1').replace(/\/+$/, '')}${path}`;
  }

  private passUrl(token: string) { return this.web(`/passes/${token}`); }

  private details(event: EventRow): EventEmail {
    let when = whenLabel(event);
    if (event.nextAt) {
      try {
        when = new Date(event.nextAt).toLocaleString('en-GB', { timeZone: event.timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
          + (event.repeat === 'once' ? '' : ` · ${whenLabel(event)}`);
      } catch {
        when = whenLabel(event);
      }
    }
    return {
      title: event.title,
      club: event.club.name,
      when,
      venue: event.venue ?? 'Meeting point to be confirmed',
      address: event.address,
      accent: /^#[0-9a-f]{6}$/i.test(event.club.accentColor) ? event.club.accentColor : '#FF5A1F',
      coverUrl: event.coverUrl,
      directionsUrl: event.latitude != null && event.longitude != null ? `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}` : null,
    };
  }

  private async openEvent(ref: string) {
    const event = await this.repo.one(ref, null);
    if (!event) throw new NotFoundException('Event not found');
    if (event.draft) throw new ConflictException('This event isn’t published yet');
    if (!event.nextAt) throw new ConflictException('This event has finished');
    return event;
  }

  private async issue(event: EventRow, userId: string, input: Omit<Parameters<ClubEventsRepository['register']>[0], 'eventId' | 'clubId' | 'userId' | 'passCode'>) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { return await this.repo.register({ ...input, eventId: event.id, clubId: event.clubId, userId, passCode: passCode() }); }
      catch (error) { if ((error as { code?: string }).code !== '23505') throw error; }
    }
    throw new ConflictException('Couldn’t issue a pass. Try again.');
  }

  async register(viewerId: string | null, ref: string, input: PassRequest, from: 'app' | 'web' = 'web') {
    const event = await this.openEvent(ref);
    const ticket = input.ticketTypeId ? event.tickets.find((option) => option.id === input.ticketTypeId) : event.tickets[0];
    if (input.ticketTypeId && !ticket) throw new NotFoundException('That ticket isn’t available for this event');
    if (ticket && ticket.priceMinor > 0) throw new ConflictException('Paid tickets aren’t on sale yet');
    if (ticket?.remaining === 0) throw new ConflictException(`${ticket.name} is sold out`);
    const name = input.firstName?.trim().slice(0, 80) || null;
    const email = input.email?.trim().toLowerCase() || null;
    let userId = viewerId;
    let created = false;
    if (!userId) {
      if (!name || !email) throw new BadRequestException('Add your first name and email to get a pass');
      const account = await this.auth.accountForGuest({ email, name, phone: input.phone ?? null, countryCode: input.countryCode ?? 'NG', marketing: Boolean(input.marketing) });
      userId = account.userId;
      created = account.created;
    }
    if (userId === (await this.hostOf(event.id))) throw new ConflictException('You’re hosting this one, so you don’t need a pass');
    if (input.marketing && !created) await this.dataSource.query(`UPDATE "profiles" SET "emailDigestEnabled" = true WHERE "userId" = $1`, [userId]);
    if (input.phone) await this.dataSource.query(`UPDATE "profiles" SET "whatsappNumber" = $2 WHERE "userId" = $1 AND "whatsappNumber" IS NULL`, [userId, input.phone]);

    const issued = await this.issue(event, userId, {
      name: viewerId ? null : name, email: viewerId ? null : email, phone: input.phone ?? null,
      source: viewerId ? from : 'guest', ticketTypeId: ticket?.id ?? null, newAccount: created, marketing: Boolean(input.marketing),
    });
    const pass = await this.repo.passFor(event.id, userId);
    if (!pass) throw new ConflictException('Couldn’t issue a pass. Try again.');
    await this.sendTicket(event, pass);
    if (created) this.welcome(event, pass, Boolean(input.marketing));
    const sentTo = maskEmail(pass.sentTo);
    if (!issued) return { status: 'existing' as const, sentTo };
    return {
      status: 'issued' as const,
      sentTo,
      holder: pass.name,
      ticketType: pass.ticketType,
      pass: { code: pass.passCode, checkedIn: false },
      event: await this.repo.one(event.id, viewerId),
    };
  }

  private async hostOf(eventId: string) {
    const [row] = await this.dataSource.query(`SELECT "createdBy" FROM "club_events" WHERE "id" = $1`, [eventId]) as Array<{ createdBy: string | null }>;
    return row?.createdBy ?? null;
  }

  async resend(ref: string, email: string) {
    const event = await this.repo.one(ref, null);
    if (!event) throw new NotFoundException('Event not found');
    const pass = await this.repo.passByEmail(event.id, email.trim().toLowerCase());
    if (pass) await this.sendTicket(event, pass);
    return { sent: true };
  }

  async byToken(token: string) {
    const pass = await this.repo.passByToken(token);
    if (!pass) throw new NotFoundException('This pass link doesn’t work any more');
    const event = await this.repo.one(pass.eventId, pass.userId);
    if (!event) throw new NotFoundException('This event isn’t on any more');
    if (pass.sentTo.toLowerCase() === pass.accountEmail.toLowerCase()) await this.auth.markEmailVerified(pass.userId);
    return {
      holder: pass.name,
      ticketType: pass.ticketType,
      cancelled: !event.pass,
      event: { ...event, canManage: false, isHost: false, pass: event.pass ?? { code: pass.passCode, checkedIn: false } },
    };
  }

  async qr(token: string) {
    const pass = await this.repo.passByToken(token);
    if (!pass) throw new NotFoundException('Pass not found');
    const code = qrcode(0, 'M');
    code.addData(pass.passCode);
    code.make();
    return Buffer.from(code.createDataURL(8, 4).split(',')[1], 'base64');
  }

  private async sendTicket(event: EventRow, pass: PassRow) {
    if (pass.sentTo.endsWith('.invalid')) return;
    try {
      await this.mail.send(eventTicketEmail({ address: pass.sentTo, name: pass.name ?? undefined }, this.details(event), {
        code: pass.passCode, ticketType: pass.ticketType, url: this.passUrl(pass.ticketToken), qrUrl: this.api(`/passes/${pass.ticketToken}/qr.gif`),
      }));
      await this.repo.ticketSent(pass.attendeeId);
    } catch (error) {
      this.logger.error(`Ticket email for ${pass.attendeeId} failed`, error instanceof Error ? error.message : String(error));
    }
  }

  private welcome(event: EventRow, pass: PassRow, marketing: boolean) {
    void this.auth.setPasswordLink(pass.userId).then((setPassword) => this.mail.send(eventGuestWelcomeEmail(
      { address: pass.sentTo, name: pass.name ?? undefined },
      { title: event.title, club: event.club.name },
      { setPassword, app: this.web('/'), unsubscribe: marketing ? this.unsubscribeUrl(pass.userId) : null },
    ))).catch((error: unknown) => this.logger.error(`Welcome email for ${pass.userId} failed`, error instanceof Error ? error.message : String(error)));
  }

  private signature(userId: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET')).update(`unsubscribe:${userId}`).digest('base64url');
  }

  unsubscribeUrl(userId: string) {
    return this.api(`/email/unsubscribe?u=${userId}&t=${this.signature(userId)}`);
  }

  async unsubscribe(userId: string, token: string) {
    const expected = Buffer.from(this.signature(userId));
    const given = Buffer.from(token);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    await this.dataSource.query(`UPDATE "profiles" SET "emailDigestEnabled" = false WHERE "userId" = $1`, [userId]);
    await this.dataSource.query(`UPDATE "club_event_attendees" SET "marketingConsent" = false WHERE "userId" = $1`, [userId]);
    return true;
  }

  private async each(contacts: ContactRow[], send: (contact: ContactRow) => Promise<unknown>) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(5, contacts.length) }, async () => {
      while (next < contacts.length) {
        const contact = contacts[next++];
        if (contact.email.endsWith('.invalid')) continue;
        try { await send(contact); }
        catch (error) { this.logger.error(`Event email to ${contact.userId} failed`, error instanceof Error ? error.message : String(error)); }
      }
    }));
  }

  async remindByEmail(eventId: string, heading: string) {
    const event = await this.repo.one(eventId, null);
    if (!event) return;
    const details = this.details(event);
    await this.each(await this.repo.contacts(eventId), (contact) =>
      this.mail.send(eventReminderEmail({ address: contact.email, name: contact.name ?? undefined }, details, heading, this.passUrl(contact.ticketToken))));
  }

  async changed(eventId: string, changes: string[]) {
    const event = await this.repo.one(eventId, null);
    if (!event || event.draft || !changes.length) return;
    const details = this.details(event);
    await this.each(await this.repo.contacts(eventId), (contact) =>
      this.mail.send(eventChangedEmail({ address: contact.email, name: contact.name ?? undefined }, details, changes, this.passUrl(contact.ticketToken))));
  }

  async cancelled(event: EventRow, contacts: ContactRow[]) {
    const details = this.details(event);
    await this.each(contacts, (contact) =>
      this.mail.send(eventCancelledEmail({ address: contact.email, name: contact.name ?? undefined }, details, this.web('/competitions?tab=events'))));
  }
}
