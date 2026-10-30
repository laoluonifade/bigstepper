import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';

type Preview = { title: string; description: string; image: string | null; path: string };

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

@Injectable()
export class PagesService {
  private shell: { html: string; path: string; mtime: number } | null = null;

  constructor(private readonly dataSource: DataSource, private readonly config: ConfigService) {}

  async event(ref: string) {
    const [row] = await this.dataSource.query(
      `SELECT e."title", e."slug", e."venue", e."coverUrl", e."timeZone", c."name" AS "club", c."logoUrl",
              club_event_next(e."repeat", e."repeatEvery", e."weekdays", e."monthMode", e."monthWeek", e."startsOn", e."endsOn", e."startTime", e."timeZone", e."durationMinutes", now()) AS "nextAt"
       FROM "club_events" e JOIN "clubs" c ON c."id" = e."clubId"
       WHERE (e."id"::text = $1 OR e."slug" = $1) AND e."publishedAt" IS NOT NULL AND e."deletedAt" IS NULL AND c."suspendedAt" IS NULL`,
      [ref.toLowerCase()],
    ).catch(() => []) as Array<{ title: string; slug: string; venue: string | null; coverUrl: string | null; timeZone: string; club: string; logoUrl: string | null; nextAt: Date | null }>;
    if (!row) return this.page(null);
    const when = row.nextAt ? this.when(new Date(row.nextAt), row.timeZone) : null;
    return this.page({
      title: `${row.title} · ${row.club}`,
      description: [when, row.venue ? `at ${row.venue}` : null].filter(Boolean).join(' ') + `. Get your free pass on Jump.`,
      image: row.coverUrl ?? row.logoUrl,
      path: `/events/${row.slug}`,
    });
  }

  async competition(code: string) {
    const [row] = await this.dataSource.query(
      `SELECT t."title", t."description", t."bannerUrl", t."code", c."name" AS "club"
       FROM "competition_tables" t LEFT JOIN "clubs" c ON c."id" = t."communityId"
       WHERE t."code" = $1 AND t."deletedAt" IS NULL AND t."status" NOT IN ('DRAFT', 'SCHEDULED')`,
      [code.toUpperCase()],
    ).catch(() => []) as Array<{ title: string; description: string | null; bannerUrl: string | null; code: string; club: string | null }>;
    if (!row) return this.page(null);
    return this.page({
      title: row.club ? `${row.title} · ${row.club}` : row.title,
      description: row.description?.trim() || 'A competition on Jump. Record your walks, runs and rides and climb the board.',
      image: row.bannerUrl,
      path: `/competitions/${row.code}`,
    });
  }

  private when(at: Date, timeZone: string) {
    try {
      const day = at.toLocaleDateString('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' });
      const time = at.toLocaleTimeString('en-GB', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ');
      return `${day} · ${time}`;
    } catch {
      return null;
    }
  }

  private page(preview: Preview | null) {
    const html = this.index();
    if (!preview) return html;
    const origin = this.config.getOrThrow<string>('WEB_ORIGIN').replace(/\/+$/, '');
    const image = preview.image ?? `${origin}/icon-512.png`;
    const tags = [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Jump" />`,
      `<meta property="og:title" content="${escape(preview.title)}" />`,
      `<meta property="og:description" content="${escape(preview.description)}" />`,
      `<meta property="og:url" content="${escape(origin + preview.path)}" />`,
      `<meta property="og:image" content="${escape(image)}" />`,
      `<meta name="twitter:card" content="${preview.image ? 'summary_large_image' : 'summary'}" />`,
      `<meta name="twitter:title" content="${escape(preview.title)}" />`,
      `<meta name="twitter:description" content="${escape(preview.description)}" />`,
      `<meta name="twitter:image" content="${escape(image)}" />`,
    ].join('\n    ');
    return html
      .replace(/<title>[^<]*<\/title>/, `<title>${escape(preview.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escape(preview.description)}" />`)
      .replace('</head>', `    ${tags}\n  </head>`);
  }

  private index() {
    const candidates = [
      this.config.get<string>('WEB_INDEX_PATH'),
      resolve(__dirname, '../../../web/dist/index.html'),
      resolve(__dirname, '../../../../web/dist/index.html'),
      resolve(process.cwd(), '../web/dist/index.html'),
      resolve(process.cwd(), 'apps/web/dist/index.html'),
    ].filter((path): path is string => Boolean(path));
    const path = candidates.find((candidate) => existsSync(candidate));
    if (!path) return '<!doctype html><html><head><meta charset="UTF-8" /><title>Jump</title></head><body><a href="/">Open Jump</a></body></html>';
    const mtime = statSync(path).mtimeMs;
    if (!this.shell || this.shell.path !== path || this.shell.mtime !== mtime) this.shell = { html: readFileSync(path, 'utf8'), path, mtime };
    return this.shell.html;
  }
}
