import { BadRequestException, Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { AdminOnlyGuard } from '../admin/admin-only.guard';
import { EngagementService } from './engagement.service';
import { CATEGORIES, DEFAULT_PREFERENCES, Preferences, Settings, validZone } from './engagement-policy';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Expected an object');
  return value as Record<string, unknown>;
}
export function validatePreferences(input: unknown): Preferences {
  const value = object(input);
  if (Object.keys(value).some((k) => !['timeZone', 'quietStart', 'quietEnd', 'categories'].includes(k)))
    throw new BadRequestException('Unknown preference');
  if (!validZone(value.timeZone)) throw new BadRequestException('Use an IANA time zone');
  for (const key of ['quietStart', 'quietEnd'])
    if (!Number.isInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) > 23)
      throw new BadRequestException('Quiet hours must be between 0 and 23');
  const categories = object(value.categories ?? {});
  for (const [key, channels] of Object.entries(categories)) {
    if (!CATEGORIES.includes(key as (typeof CATEGORIES)[number])) throw new BadRequestException('Unknown category');
    for (const [channel, on] of Object.entries(object(channels)))
      if (!['push', 'email', 'inapp'].includes(channel) || typeof on !== 'boolean')
        throw new BadRequestException('Invalid channel preference');
  }
  return { ...value, categories } as unknown as Preferences;
}
export function validateSettings(input: unknown, current: Settings): Settings {
  const value = object(input);
  if (Object.keys(value).some((k) => !Object.keys(current).includes(k)))
    throw new BadRequestException('Unknown setting');
  const merged = { ...current, ...value };
  for (const key of ['deliveryEnabled', 'newTriggersEnabled'] as const)
    if (typeof merged[key] !== 'boolean') throw new BadRequestException('Expected a boolean');
  for (const [key, max] of [
    ['pushDaily', 10],
    ['emailWeekly', 10],
    ['holdoutPercent', 100],
    ['rolloutPercent', 100],
  ] as const)
    if (!Number.isInteger(merged[key]) || merged[key] < 0 || merged[key] > max)
      throw new BadRequestException('Invalid limit');
  const triggers = object(value.triggers ?? current.triggers);
  for (const [key, on] of Object.entries(triggers))
    if (!Object.prototype.hasOwnProperty.call(current.triggers, key) || typeof on !== 'boolean')
      throw new BadRequestException('Invalid trigger');
  if (triggers.proximity)
    throw new BadRequestException('Proximity is unavailable until synchronization freshness is reliable');
  return { ...merged, triggers: { ...current.triggers, ...triggers } } as Settings;
}
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class EngagementController {
  constructor(
    private readonly policy: EngagementService,
    private readonly db: DataSource,
  ) {}
  @Get('preferences') preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.policy.preferences(user.id);
  }
  @Patch('preferences') async update(@CurrentUser() user: AuthenticatedUser, @Body() input: unknown) {
    const value = validatePreferences(input);
    await this.db.transaction(async (m) => {
      const [old] = await m.query(`SELECT value FROM notification_preferences WHERE "userId"=$1 FOR UPDATE`, [user.id]);
      const optedOut = Object.entries(value.categories).some(([category, channels]) =>
        Object.entries(channels).some(
          ([channel, on]) => on === false && old?.value?.categories?.[category]?.[channel] !== false,
        ),
      );
      await m.query(
        `INSERT INTO notification_preferences("userId",value) VALUES($1,$2) ON CONFLICT("userId") DO UPDATE SET value=EXCLUDED.value,"updatedAt"=now()`,
        [user.id, JSON.stringify(value)],
      );
      await m.query(`INSERT INTO notification_events("userId",kind) VALUES($1,$2)`, [
        user.id,
        optedOut ? 'preference_opt_out' : 'preferences_changed',
      ]);
    });
    return value;
  }
  @Post('context') async context(@CurrentUser() user: AuthenticatedUser, @Body() input: unknown) {
    const body = object(input);
    if (!validZone(body.timeZone)) throw new BadRequestException('Invalid time zone');
    // Calendar zone only, never a location or an activity synchronization claim.
    await this.db.query(
      `INSERT INTO notification_preferences("userId",value) VALUES($1,$2)
      ON CONFLICT("userId") DO UPDATE SET value=jsonb_set(notification_preferences.value,'{timeZone}',EXCLUDED.value->'timeZone'),"updatedAt"=now() WHERE notification_preferences.value->>'timeZone' IS NULL`,
      [user.id, JSON.stringify({ ...DEFAULT_PREFERENCES, timeZone: body.timeZone })],
    );
    await this.policy.event(user.id, 'return', `return:${new Date().toISOString().slice(0, 13)}`);
    return { recorded: true };
  }
  @Post('engagement') async track(@CurrentUser() user: AuthenticatedUser, @Body() input: unknown) {
    const body = object(input);
    if (!['return', 'activity', 'participation'].includes(String(body.kind)))
      throw new BadRequestException('Invalid event');
    // Only a client-observed return is accepted. Activity/participation are derived from persisted domain data in reports.
    if (body.kind !== 'return') throw new BadRequestException('Domain events are measured server-side');
    await this.policy.event(user.id, 'return', `return:${new Date().toISOString().slice(0, 13)}`);
    return { recorded: true };
  }
}
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class EngagementAdminController {
  constructor(
    private readonly policy: EngagementService,
    private readonly db: DataSource,
  ) {}
  @Get('settings') settings() {
    return this.policy.settings();
  }
  @Patch('settings') async update(@CurrentUser() user: AuthenticatedUser, @Body() input: unknown) {
    const value = validateSettings(input, await this.policy.settings());
    await this.db.transaction(async (m) => {
      await m.query(`UPDATE notification_settings SET value=$1,"updatedBy"=$2,"updatedAt"=now() WHERE id=true`, [
        JSON.stringify(value),
        user.id,
      ]);
      await m.query(`INSERT INTO notification_settings_audit("actorId",value) VALUES($1,$2)`, [
        user.id,
        JSON.stringify(value),
      ]);
    });
    return value;
  }
  @Get('performance') async performance() {
    const [delivery, events, retention] = await Promise.all([
      this.db.query(
        `SELECT type,channel,status,reason,count(*)::int AS count FROM notification_deliveries WHERE "createdAt">now()-interval '30 days' GROUP BY type,channel,status,reason ORDER BY count DESC LIMIT 200`,
      ),
      this.db.query(
        `SELECT kind,count(*)::int AS count FROM notification_events WHERE "createdAt">now()-interval '30 days' GROUP BY kind`,
      ),
      this.db.query(`WITH exposure AS (
        SELECT DISTINCT ON ("userId") "userId",cohort,"createdAt" AS at FROM notification_deliveries
        WHERE type IN ('WEEKLY_RECAP','WEEKLY_GOAL','COMPETITION_STARTING','COMPETITION_ENDING')
          AND (status<>'suppressed' OR reason='holdout') ORDER BY "userId","createdAt"
      ), windows AS (SELECT e.*,d.day FROM exposure e CROSS JOIN (VALUES(1),(7),(30)) d(day))
      SELECT cohort,day,count(*) FILTER(WHERE at + (day+1)*interval '1 day' <= now())::int AS matured,
        count(*) FILTER(WHERE at + (day+1)*interval '1 day' <= now() AND EXISTS(SELECT 1 FROM notification_events n WHERE n."userId"=windows."userId" AND n.kind='return' AND n."createdAt">=at+day*interval '1 day' AND n."createdAt"<at+(day+1)*interval '1 day'))::int AS returned,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM activities a WHERE a."userId"=windows."userId" AND a."verificationStatus"='VERIFIED' AND a."startedAt">at AND a."startedAt"<at+interval '7 days' AND EXISTS(SELECT 1 FROM notification_events ret WHERE ret."userId"=windows."userId" AND ret.kind='return' AND ret."createdAt">at AND ret."createdAt"<=a."startedAt")))::int AS activeWithin7d,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM table_registrations r WHERE r."userId"=windows."userId" AND r."joinedAt">at AND r."joinedAt"<at+interval '7 days' AND EXISTS(SELECT 1 FROM notification_events ret WHERE ret."userId"=windows."userId" AND ret.kind='return' AND ret."createdAt">at AND ret."createdAt"<=r."joinedAt")))::int AS joinedWithin7d
      FROM windows GROUP BY cohort,day ORDER BY cohort,day`),
    ]);
    return {
      delivery,
      events,
      retention,
      limitations: [
        'Expo receipts indicate APNs/FCM handoff, not confirmed display. Email acceptance is not confirmed inbox delivery.',
        'Retention compares eligible assigned cohorts, including unsuccessful delivery attempts. Returns use instrumented clients; old clients undercount them.',
        'DeviceNotRegistered is a token invalidation signal, not a confirmed uninstall.',
        'Holdout assignment is stable while holdoutPercent remains unchanged. Freeze it for each experiment.',
      ],
    };
  }
}
