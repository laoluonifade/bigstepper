import { dailyMeasure } from '../tables/competition-rules';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { DataSource } from 'typeorm';
import { SEO_STATIC, SEO_HUBS } from './seo-config';
import {
  CLUB_PUBLIC,
  CLUB_SELECT,
  COMPETITION_PUBLIC,
  COMPETITION_SELECT,
  EVENT_PUBLIC,
  EVENT_SELECT,
  NEXT,
  PublicClub,
  PublicCompetition,
  PublicEvent,
} from './public-catalog';
import {
  breadcrumbs,
  documentHtml,
  esc,
  heading,
  link,
  locationSlug,
  safeImage,
  SeoPage,
} from './seo-render';

const validSlug = (s: string) => /^[a-z0-9][a-z0-9_-]{0,119}$/i.test(s);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
const SHARD = 1000;
@Injectable()
export class PagesService {
  private shell: { html: string; path: string; mtime: number } | null = null;
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}
  origin() {
    return this.config.getOrThrow<string>('WEB_ORIGIN').replace(/\/+$/, '');
  }
  private result(
    path: string,
    title: string,
    description: string,
    body: string,
    indexable = true,
    status = 200,
    jsonLd: Record<string, unknown>[] = [],
    image?: string | null,
  ): SeoPage {
    return { path, title, description, body, indexable, status, jsonLd, image };
  }
  private missing(path: string, status = 404) {
    return this.result(
      path,
      status === 410
        ? 'Page no longer available | Jump'
        : 'Page not found | Jump',
      'Find public events, clubs and movement competitions on Jump.',
      heading(
        status === 410 ? 'This page is no longer available' : 'Page not found',
        'Explore current public events and communities on Jump.',
      ) + link('/events', 'Discover events'),
      false,
      status,
    );
  }
  private trail(label: string, path: string) {
    return breadcrumbs(this.origin(), [
      { name: 'Jump', path: '/' },
      { name: label, path },
    ]);
  }
  async resolve(path: string): Promise<SeoPage> {
    if (path !== '/' && path.endsWith('/')) {
      const normalized = await this.resolve(path.replace(/\/+$/, ''));
      if (normalized.status === 200)
        return { ...normalized, status: 308, redirect: normalized.path };
      return normalized;
    }
    if (path.length > 240 || /[?#\\]/.test(path))
      return this.missing('/not-found');
    if (
      path === '/workplace-step-challenges' ||
      path === '/corporate-wellness-competitions'
    )
      return {
        ...this.missing('/business'),
        status: 308,
        redirect: '/business',
      };
    if (path in SEO_STATIC)
      return this.staticPage(path as keyof typeof SEO_STATIC);
    if (path in SEO_HUBS) return this.hub(path as keyof typeof SEO_HUBS);
    const city = path.match(/^\/running-(clubs|events)\/in\/([a-z0-9-]+)$/);
    if (city)
      return this.hub(
        city[1] === 'clubs' ? '/running-clubs' : '/running-events',
        city[2],
      );
    const detail = path.match(/^\/(events|clubs|competitions)\/([^/]+)$/);
    if (detail && validSlug(detail[2]) && detail[2] !== 'new') {
      if (detail[1] === 'events') return this.eventModel(detail[2]);
      if (detail[1] === 'clubs') return this.clubModel(detail[2]);
      return this.competitionModel(detail[2]);
    }
    return this.missing(path);
  }
  async html(path: string) {
    const page = await this.resolve(path);
    return { ...page, html: documentHtml(this.index(), page, this.origin()) };
  }
  async event(ref: string) {
    return (await this.html('/events/' + ref)).html;
  }
  async competition(code: string) {
    return (await this.html('/competitions/' + code)).html;
  }
  private staticPage(path: keyof typeof SEO_STATIC) {
    const meta = SEO_STATIC[path];
    let body = '';
    const artifact = resolve(dirname(this.indexPath()), 'seo-static.json');
    if (existsSync(artifact)) {
      const pages = JSON.parse(readFileSync(artifact, 'utf8')) as Record<
        string,
        string
      >;
      body = pages[path] ?? '';
    }
    // Meaningful development fallback. Production builds generate the actual marketing components.
    if (!body)
      body =
        heading(
          path === '/'
            ? 'Move. Compete. Win.'
            : path === '/business'
              ? 'Workplace step challenges'
              : 'Jump for brands',
          meta.description,
        ) +
        link(
          path === '/business'
            ? '/register?redirect=%2Fclubs'
            : path === '/brands'
              ? 'mailto:start@startajump.com?subject=Jump%20partnership'
              : '/events',
          path === '/business'
            ? 'Create your workplace club'
            : path === '/brands'
              ? 'Talk to our team'
              : 'Discover events',
        );
    const discovery =
      '<nav aria-label="Explore Jump" class="mt-10 flex flex-wrap gap-4"><a href="/running-events">Running events</a><a href="/running-clubs">Running clubs</a><a href="/step-challenges">Walking and step challenges</a><a href="/virtual-fitness-challenges">Virtual fitness challenges</a><a href="/business">Workplace challenges</a></nav>';
    const schema: Record<string, unknown>[] = [
      this.trail(
        path === '/'
          ? 'Home'
          : path === '/business'
            ? 'For businesses'
            : 'For brands',
        path,
      ),
    ];
    if (path === '/')
      schema.push(
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          '@id': this.origin() + '/#organization',
          name: 'Jump',
          url: this.origin() + '/',
          logo: this.origin() + '/icon-512.png',
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          '@id': this.origin() + '/#website',
          name: 'Jump',
          url: this.origin() + '/',
          publisher: { '@id': this.origin() + '/#organization' },
        },
      );
    return this.result(
      path,
      meta.title,
      meta.description,
      body + discovery,
      true,
      200,
      schema,
    );
  }
  async eventModel(ref: string): Promise<SeoPage> {
    const [e] = (await this.dataSource.query(
      `${EVENT_SELECT} WHERE (e.slug=$1 OR e.id::text=$1) AND e."publishedAt" IS NOT NULL AND c."suspendedAt" IS NULL`,
      [ref.toLowerCase()],
    )) as PublicEvent[];
    if (!e) return this.missing('/events/' + ref);
    const path = '/events/' + e.slug;
    if (e.deletedAt) return this.missing(path, 410);
    if (ref !== e.slug)
      return { ...this.missing(path), status: 308, redirect: path };
    const next = e.nextAt ? new Date(e.nextAt) : null;
    const when = next
      ? this.when(next, e.timeZone)
      : 'No upcoming date is currently scheduled.';
    const tickets = (await this.dataSource.query(
      `SELECT t.name,t."priceMinor",t.currency,t.capacity,CASE WHEN t.capacity IS NULL THEN NULL ELSE greatest(t.capacity-(SELECT count(*) FROM club_event_attendees a WHERE a."ticketTypeId"=t.id AND a."cancelledAt" IS NULL),0) END AS remaining FROM event_ticket_types t WHERE t."eventId"=$1 ORDER BY t."sortOrder",t."createdAt" LIMIT 30`,
      [e.id],
    )) as Array<{
      name: string;
      priceMinor: number;
      currency: string;
      remaining: number | null;
    }>;
    const registration = tickets
      .map(
        (t) =>
          `${t.name}: ${this.price(t.priceMinor, t.currency)}${t.priceMinor > 0 ? ' (not currently on sale)' : t.remaining === 0 ? ' (sold out)' : ''}`,
      )
      .join(' · ');
    const description = [e.title + ' with ' + e.clubName, when, e.venue]
      .filter(Boolean)
      .join('. ')
      .slice(0, 300);
    const image = safeImage(e.coverUrl);
    const body =
      heading(
        e.title,
        e.notes?.trim() ||
          `Join ${e.clubName} for this ${e.activity === 'any' ? 'movement' : e.activity} event.`,
      ) +
      (image
        ? `<img class="mt-6 aspect-video w-full rounded-2xl object-cover" src="${esc(image)}" alt="${esc(e.title)}" width="1600" height="900" fetchpriority="high" decoding="async">`
        : '') +
      `<dl class="mt-6 space-y-3"><div><dt class="font-bold">Date and time</dt><dd>${esc(when)}${next ? ' (' + esc(e.timeZone) + ')' : ''}</dd></div><div><dt class="font-bold">Venue</dt><dd>${esc(e.venue || 'Meeting point not yet supplied')}${e.address ? '<br>' + esc(e.address) : ''}</dd></div><div><dt class="font-bold">Organizer</dt><dd>${e.privacy === 'open' ? '<a href="/clubs/' + esc(e.clubSlug) + '">' + esc(e.clubName) + '</a>' : esc(e.clubName)}</dd></div><div><dt class="font-bold">Registration</dt><dd>${esc(registration || 'See the event page for pass availability.')}</dd></div></dl>` +
      (next ? link(path + '?getPass=1', 'Get Pass') : '') +
      link('/events', 'Explore more events');
    const indexable = !!next && !!e.venue?.trim() && !!e.address?.trim();
    const schema: Record<string, unknown>[] = [this.trail(e.title, path)];
    // Competition challenges are never physical Event objects. Only published scheduled venue-based events qualify.
    if (
      indexable &&
      next &&
      e.latitude !== null &&
      e.longitude !== null &&
      Number.isFinite(e.latitude) &&
      Number.isFinite(e.longitude) &&
      Math.abs(e.latitude) <= 90 &&
      Math.abs(e.longitude) <= 180
    ) {
      const offers = tickets
        .filter((t) => /^[A-Z]{3}$/.test(t.currency) && t.priceMinor === 0)
        .map((t) => ({
          '@type': 'Offer',
          name: t.name,
          url: this.origin() + path + '?getPass=1',
          price: this.amount(t.priceMinor, t.currency),
          priceCurrency: t.currency,
          availability:
            t.remaining === 0
              ? 'https://schema.org/SoldOut'
              : 'https://schema.org/InStock',
        }));
      schema.push({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: e.title,
        url: this.origin() + path,
        description:
          e.notes?.trim() ||
          `A ${e.activity === 'any' ? 'movement' : e.activity} event hosted by ${e.clubName}.`,
        startDate: next.toISOString(),
        endDate: new Date(
          next.getTime() + e.durationMinutes * 60_000,
        ).toISOString(),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: e.venue,
          address: {
            '@type': 'PostalAddress',
            streetAddress: e.address,
            ...(e.countryCode ? { addressCountry: e.countryCode } : {}),
          },
        },
        organizer: {
          '@type': 'Organization',
          name: e.clubName,
          ...(e.privacy === 'open'
            ? { url: this.origin() + '/clubs/' + e.clubSlug }
            : {}),
        },
        ...(image ? { image: [image] } : {}),
        ...(offers.length ? { offers } : {}),
      });
    }
    return this.result(
      path,
      `${e.title} | ${e.clubName} | Jump`,
      description,
      body,
      indexable,
      200,
      schema,
      image,
    );
  }
  async clubModel(ref: string): Promise<SeoPage> {
    const [c] = (await this.dataSource.query(
      `${CLUB_SELECT} WHERE (c.slug=$1 OR c.id::text=$1) AND ${CLUB_PUBLIC}`,
      [ref.toLowerCase()],
    )) as PublicClub[];
    if (!c) return this.missing('/clubs/' + ref);
    const path = '/clubs/' + c.slug;
    if (ref !== c.slug)
      return { ...this.missing(path), status: 308, redirect: path };
    const events = (await this.dataSource.query(
      `${EVENT_SELECT} WHERE ${EVENT_PUBLIC} AND c.id=$1 AND ${NEXT} IS NOT NULL ORDER BY "nextAt",e.id LIMIT 12`,
      [c.id],
    )) as PublicEvent[];
    const description =
      c.description?.trim() ||
      `Explore ${c.name}${c.location ? ' in ' + c.location : ''} on Jump.`;
    const body =
      heading(c.name, description) +
      (c.location ? `<p class="mt-3">Location: ${esc(c.location)}</p>` : '') +
      link(path + '?join=true', 'Join this club') +
      `<section class="mt-8"><h2 class="wide text-2xl font-bold">Upcoming runs and events</h2>${events.length ? this.cards(events.map((e) => ({ title: e.title, path: '/events/' + e.slug, description: this.when(new Date(e.nextAt!), e.timeZone) + (e.venue ? ' · ' + e.venue : '') }))) : '<p class="mt-3">No upcoming public events are listed.</p>'}</section>` +
      link('/running-clubs', 'Discover running clubs');
    return this.result(
      path,
      `${c.name}${c.location ? ' in ' + c.location : ''} | Jump`,
      description.slice(0, 300),
      body,
      (c.description?.trim().length ?? 0) >= 40,
      200,
      [
        this.trail(c.name, path),
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: c.name,
          url: this.origin() + path,
          ...(c.location ? { address: c.location } : {}),
          ...(safeImage(c.logoUrl) ? { logo: c.logoUrl } : {}),
        },
      ],
      safeImage(c.logoUrl),
    );
  }
  async competitionModel(ref: string): Promise<SeoPage> {
    const [t] = (await this.dataSource.query(
      `${COMPETITION_SELECT} WHERE t.code=$1 AND ${COMPETITION_PUBLIC}`,
      [ref.toUpperCase()],
    )) as PublicCompetition[];
    const path = '/competitions/' + ref.toUpperCase();
    if (!t) {
      const deleted = await this.dataSource.query(
        `SELECT 1 FROM competition_tables t LEFT JOIN clubs c ON c.id=t."communityId" WHERE t.code=$1 AND t.visibility='public' AND t."deletedAt" IS NOT NULL AND (t."communityId" IS NULL OR (c.privacy='open' AND c."suspendedAt" IS NULL))`,
        [ref.toUpperCase()],
      );
      return this.missing(path, deleted.length ? 410 : 404);
    }
    if (ref !== t.code)
      return { ...this.missing(path), status: 308, redirect: path };
    const description =
      t.description?.trim() ||
      `A ${titleCase(t.challengeType)} competition on Jump. Review the rules and eligible activities before joining.`;
    const items = [
      ['Eligible activities', t.eligibleActivities.join(', ')],
      ['Scoring', titleCase(t.scoringMethod)],
      [
        'Starts',
        t.startsAt
          ? this.when(new Date(t.startsAt), t.timeZone)
          : 'See competition rules',
      ],
      [
        'Scoring closes',
        t.scoringClosesAt
          ? this.when(new Date(t.scoringClosesAt), t.timeZone)
          : 'No closing date specified',
      ],
      [
        'Entry closes',
        t.entryClosesAt
          ? this.when(new Date(t.entryClosesAt), t.timeZone)
          : 'See entry availability',
      ],
      [
        'Entry',
        t.type === 'free'
          ? 'Free'
          : t.entryFeeKobo
            ? this.price(t.entryFeeKobo, 'NGN')
            : 'See competition entry details',
      ],
    ];
    if (t.targetSteps)
      items.push(['Goal', t.targetSteps.toLocaleString('en-GB') + ' steps']);
    if (t.targetDistanceMetres)
      items.push(['Distance goal', t.targetDistanceMetres / 1000 + ' km']);
    if (t.targetSeconds)
      items.push(['Time goal', t.targetSeconds + ' seconds']);
    if (t.targetSessions)
      items.push(['Session goal', t.targetSessions + ' sessions']);
    if (t.minSessions) items.push(['Minimum sessions', String(t.minSessions)]);
    const measure = dailyMeasure(t.challengeType, t.scoringMethod);
    if (t.dailyTarget && measure)
      items.push([
        'Daily goal',
        t.dailyTarget +
          ' ' +
          (measure === 'steps'
            ? 'steps'
            : measure === 'time'
              ? 'seconds'
              : 'metres'),
      ]);
    if (t.format) items.push(['Participation format', titleCase(t.format)]);
    if (t.minActivityMetres)
      items.push([
        'Minimum activity distance',
        t.minActivityMetres + ' metres',
      ]);
    if (t.minActivitySeconds)
      items.push([
        'Minimum activity duration',
        t.minActivitySeconds + ' seconds',
      ]);
    const body =
      heading(t.title, description) +
      `<h2 class="wide mt-8 text-2xl font-bold">Rules and participation</h2><dl class="mt-4 grid gap-4 sm:grid-cols-2">${items.map(([label, value]) => `<div><dt class="font-bold">${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` +
      (t.clubSlug
        ? `<p class="mt-4">Hosted by <a href="/clubs/${esc(t.clubSlug)}">${esc(t.clubName)}</a></p>`
        : '') +
      link(path + '?join=true', 'View competition and join') +
      link('/virtual-fitness-challenges', 'Explore challenges');
    return this.result(
      path,
      `${t.title} | ${titleCase(t.challengeType)} competition | Jump`,
      description.slice(0, 300),
      body,
      (t.description?.trim().length ?? 0) >= 30 && t.status !== 'SETTLED',
      200,
      [
        this.trail(t.title, path),
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: t.title,
          url: this.origin() + path,
          description,
        },
      ],
      safeImage(t.bannerUrl),
    );
  }
  private async inventory() {
    const [events, clubs, competitions] = await Promise.all([
      this.dataSource.query(
        `${EVENT_SELECT} WHERE ${EVENT_PUBLIC} AND ${NEXT} IS NOT NULL ORDER BY "nextAt",e.id LIMIT 200`,
      ) as Promise<PublicEvent[]>,
      this.dataSource.query(
        `${CLUB_SELECT} WHERE ${CLUB_PUBLIC} AND (EXISTS(SELECT 1 FROM club_events e WHERE e."clubId"=c.id AND e."publishedAt" IS NOT NULL AND e."deletedAt" IS NULL AND e.activity='run') OR EXISTS(SELECT 1 FROM competition_tables t WHERE t."communityId"=c.id AND t.visibility='public' AND t."deletedAt" IS NULL AND t."challengeType"='RUN' AND t.status NOT IN ('DRAFT','SCHEDULED'))) ORDER BY c.name,c.id LIMIT 200`,
      ) as Promise<PublicClub[]>,
      this.dataSource.query(
        `${COMPETITION_SELECT} WHERE ${COMPETITION_PUBLIC} AND t.status IN ('OPEN_FOR_ENTRY','ENTRY_CLOSED','ACTIVE') AND (t."scoringClosesAt" IS NULL OR t."scoringClosesAt">now()) ORDER BY t."createdAt" DESC,t.id LIMIT 200`,
      ) as Promise<PublicCompetition[]>,
    ]);
    return { events, clubs, competitions };
  }
  private cards(
    items: Array<{ title: string; path: string; description: string }>,
  ) {
    return (
      '<ul class="mt-6 grid gap-4 sm:grid-cols-2">' +
      items
        .map(
          (item) =>
            `<li class="rounded-2xl border border-line bg-card p-5"><h2 class="wide text-xl font-bold"><a href="${esc(item.path)}">${esc(item.title)}</a></h2><p class="mt-2 text-ink-2">${esc(item.description)}</p></li>`,
        )
        .join('') +
      '</ul>'
    );
  }
  async hub(base: keyof typeof SEO_HUBS, location?: string): Promise<SeoPage> {
    const config = SEO_HUBS[base];
    const data = await this.inventory();
    let items: Array<{
      title: string;
      path: string;
      description: string;
      location: string | null;
    }> = [];
    if (config.kind === 'clubs')
      items = data.clubs.map((c) => ({
        title: c.name,
        path: '/clubs/' + c.slug,
        description:
          c.description ?? c.location ?? 'Explore this public running club.',
        location: c.location,
      }));
    else if (config.kind === 'events' || config.kind === 'runs')
      items = data.events
        .filter((e) => config.kind !== 'runs' || e.activity === 'run')
        .map((e) => ({
          title: e.title,
          path: '/events/' + e.slug,
          description:
            this.when(new Date(e.nextAt!), e.timeZone) +
            ' · ' +
            (e.venue ?? e.clubName),
          location: null,
        }));
    else
      items = data.competitions
        .filter(
          (t) =>
            config.kind !== 'steps' ||
            ['STEP', 'WALK'].includes(t.challengeType),
        )
        .map((t) => ({
          title: t.title,
          path: '/competitions/' + t.code,
          description:
            t.description ??
            `${titleCase(t.challengeType)} · ${titleCase(t.scoringMethod)}`,
          location: null,
        }));
    if (location)
      items = items.filter(
        (item) => item.location && locationSlug(item.location) === location,
      );
    const path = location ? base + '/in/' + location : base;
    if (location && !items.length) return this.missing(path);
    const label = location ? items[0].location : null;
    const title = config.title + (label ? ' in ' + label : '');
    const groups = new Map<string, { label: string; count: number }>();
    for (const item of items)
      if (item.location && locationSlug(item.location)) {
        const key = locationSlug(item.location);
        const group = groups.get(key);
        groups.set(key, {
          label: item.location,
          count: (group?.count ?? 0) + 1,
        });
      }
    const places =
      !location && (base === '/running-clubs' || base === '/running-events')
        ? [...groups].filter(([, g]) => g.count >= 2).slice(0, 30)
        : [];
    const indexable = location ? items.length >= 2 : items.length > 0;
    const body =
      heading(title, config.description) +
      (items.length
        ? this.cards(items.slice(0, 60))
        : '<p class="mt-6">No matching public listings are available right now. Explore other movement events and challenges below.</p>') +
      (places.length
        ? `<h2 class="wide mt-8 text-2xl font-bold">Explore by location</h2><ul class="mt-4 flex flex-wrap gap-4">${places.map(([slug, g]) => `<li><a href="${base}/in/${slug}">${esc(g.label)} (${g.count})</a></li>`).join('')}</ul>`
        : '') +
      `<nav aria-label="Related discovery" class="mt-8 flex flex-wrap gap-4">${Object.entries(
        SEO_HUBS,
      )
        .filter(([p]) => p !== base)
        .map(([p, c]) => `<a href="${p}">${esc(c.title)}</a>`)
        .join('')}<a href="/business">Workplace step challenges</a></nav>` +
      link(
        '/register?redirect=%2Fclubs',
        config.kind === 'clubs' ? 'Create your club' : 'Join Jump',
      );
    return this.result(
      path,
      title + ' | Jump',
      config.description,
      body,
      indexable,
      200,
      [this.trail(title, path)],
    );
  }
  async sitemapIndex() {
    const origin = this.origin();
    const counts = await this.sitemapCounts();
    const urls = [
      '/sitemaps/static.xml',
      ...(['events', 'clubs', 'competitions'] as const).flatMap((kind) =>
        Array.from(
          { length: Math.ceil(counts[kind] / SHARD) },
          (_, i) => `/sitemaps/${kind}-${i + 1}.xml`,
        ),
      ),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((p) => `<sitemap><loc>${esc(origin + p)}</loc></sitemap>`).join('')}</sitemapindex>`;
  }
  async sitemapCounts() {
    const [events, clubs, competitions] = await Promise.all([
      this.dataSource.query(
        `SELECT count(*)::int AS count FROM club_events e JOIN clubs c ON c.id=e."clubId" WHERE ${EVENT_PUBLIC} AND length(trim(COALESCE(e.venue,'')))>0 AND length(trim(COALESCE(e.address,'')))>0 AND ${NEXT} IS NOT NULL`,
      ),
      this.dataSource.query(
        `SELECT count(*)::int AS count FROM clubs c WHERE ${CLUB_PUBLIC} AND length(trim(COALESCE(c.description,'')))>=40`,
      ),
      this.dataSource.query(
        `SELECT count(*)::int AS count FROM competition_tables t LEFT JOIN clubs c ON c.id=t."communityId" WHERE ${COMPETITION_PUBLIC} AND t.status<>'SETTLED' AND length(trim(COALESCE(t.description,'')))>=30`,
      ),
    ]);
    return {
      events: events[0].count as number,
      clubs: clubs[0].count as number,
      competitions: competitions[0].count as number,
    };
  }
  async sitemapShard(name: string): Promise<string | null> {
    let rows: Array<{ path: string; updated?: Date }> = [];
    if (name === 'static.xml') {
      rows = Object.keys(SEO_STATIC).map((path) => ({ path }));
      for (const path of Object.keys(SEO_HUBS) as Array<
        keyof typeof SEO_HUBS
      >) {
        const page = await this.hub(path);
        if (page.indexable) rows.push({ path });
      }
      for (const base of ['/running-clubs', '/running-events'] as const) {
        const data = await this.inventory();
        const values =
          base === '/running-clubs'
            ? data.clubs.map((c) => c.location)
            : ([] as Array<string | null>);
        const counts = new Map<string, number>();
        for (const value of values)
          if (value && locationSlug(value))
            counts.set(
              locationSlug(value),
              (counts.get(locationSlug(value)) ?? 0) + 1,
            );
        for (const [slug, count] of counts)
          if (count >= 2) rows.push({ path: base + '/in/' + slug });
      }
    } else {
      const match = name.match(
        /^(events|clubs|competitions)-([1-9][0-9]{0,5})\.xml$/,
      );
      if (!match) return null;
      const offset = (Number(match[2]) - 1) * SHARD;
      if (match[1] === 'events')
        rows = (
          await this.dataSource.query(
            `SELECT e.slug,e."updatedAt" FROM club_events e JOIN clubs c ON c.id=e."clubId" WHERE ${EVENT_PUBLIC} AND length(trim(COALESCE(e.venue,'')))>0 AND length(trim(COALESCE(e.address,'')))>0 AND ${NEXT} IS NOT NULL ORDER BY e.id LIMIT $1 OFFSET $2`,
            [SHARD, offset],
          )
        ).map((e: { slug: string; updatedAt: Date }) => ({
          path: '/events/' + e.slug,
          updated: e.updatedAt,
        }));
      if (match[1] === 'clubs')
        rows = (
          await this.dataSource.query(
            `SELECT c.slug,c."updatedAt" FROM clubs c WHERE ${CLUB_PUBLIC} AND length(trim(COALESCE(c.description,'')))>=40 ORDER BY c.id LIMIT $1 OFFSET $2`,
            [SHARD, offset],
          )
        ).map((c: { slug: string; updatedAt: Date }) => ({
          path: '/clubs/' + c.slug,
          updated: c.updatedAt,
        }));
      if (match[1] === 'competitions')
        rows = (
          await this.dataSource.query(
            `SELECT t.code FROM competition_tables t LEFT JOIN clubs c ON c.id=t."communityId" WHERE ${COMPETITION_PUBLIC} AND t.status<>'SETTLED' AND length(trim(COALESCE(t.description,'')))>=30 ORDER BY t.id LIMIT $1 OFFSET $2`,
            [SHARD, offset],
          )
        ).map((t: { code: string }) => ({ path: '/competitions/' + t.code }));
      if (!rows.length) return null;
    }
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows
      .filter(
        (r) => r.path.split('/').slice(1).every(validSlug) || r.path === '/',
      )
      .map(
        (row) =>
          `<url><loc>${esc(this.origin() + row.path)}</loc>${row.updated ? '<lastmod>' + new Date(row.updated).toISOString() + '</lastmod>' : ''}</url>`,
      )
      .join('')}</urlset>`;
  }
  robots() {
    return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /assets/*.map
Sitemap: ${this.origin()}/sitemap.xml
`;
  }
  private amount(minor: number, currency: string) {
    try {
      const digits =
        new Intl.NumberFormat('en', {
          style: 'currency',
          currency,
        }).resolvedOptions().maximumFractionDigits ?? 2;
      return minor / 10 ** digits;
    } catch {
      return minor / 100;
    }
  }
  private price(minor: number, currency: string) {
    if (minor === 0) return 'Free';
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency,
      }).format(this.amount(minor, currency));
    } catch {
      return 'See registration details';
    }
  }
  private when(at: Date, zone: string) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(at);
  }
  private indexPath() {
    const paths = [
      this.config.get<string>('WEB_INDEX_PATH'),
      resolve(__dirname, '../../../web/dist/index.html'),
      resolve(__dirname, '../../../../web/dist/index.html'),
      resolve(process.cwd(), '../web/dist/index.html'),
      resolve(process.cwd(), 'apps/web/dist/index.html'),
    ].filter((p): p is string => !!p);
    return paths.find(existsSync) ?? '';
  }
  private index() {
    const path = this.indexPath();
    if (!path)
      return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jump</title></head><body><div id="root"></div></body></html>';
    const mtime = statSync(path).mtimeMs;
    if (!this.shell || this.shell.path !== path || this.shell.mtime !== mtime)
      this.shell = { path, mtime, html: readFileSync(path, 'utf8') };
    return this.shell.html;
  }
}
