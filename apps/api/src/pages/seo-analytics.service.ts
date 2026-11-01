import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PagesService } from './pages.service';
type Attribution = {
  session: string;
  source: string;
  landing: string;
  expires: number;
};
const SOURCES = ['google', 'bing', 'duckduckgo', 'yahoo'];
@Injectable()
export class SeoAnalyticsService {
  private lastCleanup = 0;
  private readonly logger = new Logger(SeoAnalyticsService.name);
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly pages: PagesService,
  ) {}
  private enabled() {
    return this.config.get<boolean>('SEO_ANALYTICS_ENABLED') === true;
  }
  private sign(body: string) {
    return createHmac(
      'sha256',
      'jump-organic-v1:' + this.config.getOrThrow<string>('JWT_SECRET'),
    )
      .update(body)
      .digest('base64url');
  }
  private verify(token: unknown): Attribution | null {
    if (!this.enabled() || typeof token !== 'string' || token.length > 1200)
      return null;
    try {
      const [body, signature, ...extra] = token.split('.');
      if (extra.length || !signature) return null;
      const expected = Buffer.from(this.sign(body));
      const actual = Buffer.from(signature);
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      )
        return null;
      const value = JSON.parse(
        Buffer.from(body, 'base64url').toString(),
      ) as Attribution;
      return value.expires > Date.now() &&
        SOURCES.includes(value.source) &&
        /^[0-9a-f-]{36}$/i.test(value.session)
        ? value
        : null;
    } catch {
      return null;
    }
  }
  async landing(session: string, source: string, landing: string) {
    if (!this.enabled()) return { enabled: false };
    if (
      !SOURCES.includes(source) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        session,
      ) ||
      landing.length > 240
    )
      return { enabled: false };
    if (Date.now() - this.lastCleanup > 86400000) {
      this.lastCleanup = Date.now();
      void this.db
        .query(
          `DELETE FROM organic_acquisition_events WHERE "createdAt"<now()-interval '90 days'`,
        )
        .catch(() => undefined);
    }
    const page = await this.pages.resolve(landing);
    if (page.status !== 200 || !page.indexable) return { enabled: false };
    const value: Attribution = {
      session,
      source,
      landing: page.path,
      expires: Date.now() + 24 * 3600_000,
    };
    const body = Buffer.from(JSON.stringify(value)).toString('base64url');
    await this.record(value, 'landing', `landing:${session}`);
    return { enabled: true, token: body + '.' + this.sign(body) };
  }
  async clientEvent(token: string, kind: string) {
    const value = this.verify(token);
    if (value && ['cta_click', 'business_contact_click'].includes(kind))
      await this.record(value, kind, kind + ':' + value.session);
    return { recorded: !!value };
  }
  // Called only after successful domain work, never inside the registration/payment/membership transaction.
  async conversion(
    token: unknown,
    kind: 'event_registration' | 'club_join',
    resource: string,
  ) {
    const value = this.verify(token);
    if (value)
      await this.record(value, kind, `${kind}:${resource}:${value.session}`);
  }
  private async record(value: Attribution, kind: string, key: string) {
    try {
      await this.db.query(
        `INSERT INTO organic_acquisition_events(session,source,landing,kind,"dedupeKey") VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [value.session, value.source, value.landing, kind, key],
      );
    } catch (error) {
      this.logger.warn('Organic acquisition event was not recorded');
    }
  }
}
