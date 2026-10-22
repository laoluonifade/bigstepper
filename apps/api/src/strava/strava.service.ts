import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { ACTIVITY_VERIFICATION_QUEUE } from '../jobs/jobs.module';
import { Activity } from '../running/activity.entity';
import { GpsSample } from '../running/gps-sample.entity';
import { RunningSession } from '../running/running-session.entity';
import { StravaAccount } from './strava-account.entity';
import { stravaStepTotals } from './strava-steps';

const STRAVA = 'https://www.strava.com';
/** Strava wants the token refreshed when it has less than an hour left. */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;
/** The first sync takes the most recent activities however old; later syncs pick up from the last one. */
const MAX_PER_SYNC = 30;
/** Strava filters by start time, so look back past the last sync for activities uploaded late; imports are deduped by id. */
const SYNC_OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNUP_TOKEN_PURPOSE = 'strava-signup';

/** Strava sport types Jump can verify. Treadmill, virtual and e-bike activities have no honest GPS track. */
const SPORT_TYPES: Record<string, 'walk' | 'run' | 'cycle'> = {
  Run: 'run',
  TrailRun: 'run',
  Walk: 'walk',
  Hike: 'walk',
  Ride: 'cycle',
  MountainBikeRide: 'cycle',
  GravelRide: 'cycle',
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string; profile?: string };
}

interface StravaActivity {
  id: number;
  sport_type: string;
  manual: boolean;
  trainer: boolean;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  start_latlng: [number, number] | [];
}

interface Streams {
  latlng?: { data: [number, number][] };
  time?: { data: number[] };
  cadence?: { data: number[] };
  distance?: { data: number[] };
}

export type SyncResult = { imported: number; skipped: number };

@Injectable()
export class StravaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StravaService.name);
  /** One sync per runner at a time; a second request joins the one already running. */
  private readonly inFlight = new Map<string, Promise<SyncResult>>();

  constructor(
    @InjectRepository(StravaAccount) private readonly accounts: Repository<StravaAccount>,
    private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectQueue(ACTIVITY_VERIFICATION_QUEUE) private readonly verificationQueue: Queue,
  ) {}

  publicConfig() {
    return { clientId: this.config.get<string>('STRAVA_CLIENT_ID') || null, public: this.config.get<boolean>('STRAVA_PUBLIC') === true };
  }

  /** "Continue with Strava": signs in a linked athlete, or starts a sign-up that still needs an email. */
  async login(code: string, scope: string) {
    const token = await this.exchange(code);
    const account = await this.saveTokens(token, scope, null);
    if (account.userId) {
      this.syncInBackground(account.userId);
      return { status: 'signed-in' as const, ...(await this.auth.signInAs(account.userId)) };
    }
    const signupToken = await this.jwt.signAsync({ sub: account.id, purpose: SIGNUP_TOKEN_PURPOSE }, { expiresIn: '30m' });
    return {
      status: 'needs-signup' as const,
      signupToken,
      athlete: { name: account.athleteName, avatarUrl: account.avatarUrl },
    };
  }

  async completeSignup(signupToken: string, email: string, countryCode: string, whatsappNumber?: string) {
    let accountId: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; purpose: string }>(signupToken);
      if (payload.purpose !== SIGNUP_TOKEN_PURPOSE) throw new Error('wrong purpose');
      accountId = payload.sub;
    } catch {
      throw new UnauthorizedException('This Strava sign-up has expired. Continue with Strava again.');
    }
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) throw new UnauthorizedException('This Strava sign-up has expired. Continue with Strava again.');
    if (account.userId) throw new ConflictException('This Strava account already has a Jump account. Log in with Strava.');

    const response = await this.auth.createAccount({
      email,
      countryCode,
      whatsappNumber,
      displayName: account.athleteName ?? undefined,
      afterCreate: async (manager, user) => {
        await manager.update(StravaAccount, { id: account.id }, { userId: user.id });
      },
    });
    this.syncInBackground(response.user.id);
    return response;
  }

  /** Links Strava to the signed-in runner from settings. */
  async connect(userId: string, code: string, scope: string) {
    const token = await this.exchange(code);
    const existing = await this.accounts.findOne({ where: { athleteId: String(token.athlete?.id) } });
    if (existing?.userId && existing.userId !== userId) {
      throw new ConflictException('That Strava account is linked to another Jump account.');
    }
    // A runner has one Strava account; reconnecting a different one replaces it.
    await this.accounts.delete({ userId });
    await this.saveTokens(token, scope, userId);
    this.syncInBackground(userId);
    return this.status(userId);
  }

  async status(userId: string) {
    const account = await this.accounts.findOne({ where: { userId } });
    if (!account) return { connected: false as const };
    return {
      connected: true as const,
      athleteName: account.athleteName,
      avatarUrl: account.avatarUrl,
      lastSyncedAt: account.lastSyncedAt,
      syncing: this.inFlight.has(userId),
      canReadActivities: /activity:read/.test(account.scope),
    };
  }

  async disconnect(userId: string) {
    const account = await this.withTokens({ userId });
    if (!account) return { connected: false };
    // Revoke on Strava's side too; if that fails the link is still removed here.
    await fetch(`${STRAVA}/oauth/deauthorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: account.accessToken }),
    }).catch(() => undefined);
    await this.accounts.delete({ id: account.id });
    return { connected: false };
  }

  /** Imports new GPS activities since the last sync. Each one goes through the same verification as a Jump run. */
  sync(userId: string): Promise<SyncResult> {
    const running = this.inFlight.get(userId);
    if (running) return running;
    const next = this.runSync(userId).finally(() => this.inFlight.delete(userId));
    this.inFlight.set(userId, next);
    return next;
  }

  private async runSync(userId: string): Promise<SyncResult> {
    const account = await this.withTokens({ userId });
    if (!account) throw new NotFoundException('Connect Strava first');
    if (!/activity:read/.test(account.scope)) {
      throw new BadRequestException('Jump wasn’t given access to your activities. Reconnect Strava and keep “View data about your activities” ticked.');
    }
    const startedSync = new Date();
    const after = account.lastSyncedAt ? `&after=${Math.floor((account.lastSyncedAt.getTime() - SYNC_OVERLAP_MS) / 1000)}` : '';
    const list = await this.request<StravaActivity[]>(account, `/athlete/activities?per_page=${MAX_PER_SYNC}${after}`);

    let imported = 0;
    let skipped = 0;
    for (const summary of list) {
      if (await this.importActivity(account, userId, summary)) imported += 1;
      else skipped += 1;
    }
    await this.accounts.update({ id: account.id }, { lastSyncedAt: startedSync });
    return { imported, skipped };
  }

  /** Webhook: a new activity was uploaded, or the athlete revoked access. */
  async handleEvent(event: { object_type: string; object_id: number; aspect_type: string; owner_id: number; updates?: Record<string, string> }) {
    const account = await this.withTokens({ athleteId: String(event.owner_id) });
    if (!account?.userId) return;
    if (event.object_type === 'athlete' && event.updates?.authorized === 'false') {
      await this.accounts.delete({ id: account.id });
      return;
    }
    if (event.object_type === 'activity' && event.aspect_type === 'create') {
      const summary = await this.request<StravaActivity>(account, `/activities/${event.object_id}`);
      await this.importActivity(account, account.userId, summary);
    }
  }

  /**
   * Strava only pushes new uploads to a registered webhook. Register ours on start-up when it isn't yet
   * (needs STRAVA_WEBHOOK_VERIFY_TOKEN and STRAVA_WEBHOOK_CALLBACK_URL); otherwise imports wait for a sync.
   */
  async onApplicationBootstrap() {
    const callbackUrl = this.config.get<string>('STRAVA_WEBHOOK_CALLBACK_URL');
    const verifyToken = this.config.get<string>('STRAVA_WEBHOOK_VERIFY_TOKEN');
    const clientId = this.config.get<string>('STRAVA_CLIENT_ID');
    const clientSecret = this.config.get<string>('STRAVA_CLIENT_SECRET');
    if (!callbackUrl || !verifyToken || !clientId || !clientSecret) return;
    // After start-up, so the verification GET Strava sends back can be answered.
    setTimeout(() => void this.ensureWebhook(callbackUrl, verifyToken, clientId, clientSecret), 5_000).unref();
  }

  private async ensureWebhook(callbackUrl: string, verifyToken: string, clientId: string, clientSecret: string) {
    try {
      const query = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
      const listed = await fetch(`${STRAVA}/api/v3/push_subscriptions?${query}`);
      const subscriptions = listed.ok ? await listed.json() as Array<{ id: number; callback_url: string }> : [];
      if (subscriptions.some((subscription) => subscription.callback_url === callbackUrl)) return;
      // Strava allows one subscription per app; replace one pointing somewhere else.
      for (const old of subscriptions) await fetch(`${STRAVA}/api/v3/push_subscriptions/${old.id}?${query}`, { method: 'DELETE' });
      const created = await fetch(`${STRAVA}/api/v3/push_subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, callback_url: callbackUrl, verify_token: verifyToken }),
      });
      if (created.ok) this.logger.log('Strava webhook registered');
      else this.logger.warn(`Strava webhook registration failed with ${created.status}`);
    } catch (error) {
      this.logger.warn(`Strava webhook check failed: ${String(error)}`);
    }
  }

  verifyWebhook(mode: string, token: string, challenge: string) {
    const expected = this.config.get<string>('STRAVA_WEBHOOK_VERIFY_TOKEN');
    if (mode !== 'subscribe' || !expected || token !== expected) throw new UnauthorizedException();
    return { 'hub.challenge': challenge };
  }

  private syncInBackground(userId: string) {
    void this.sync(userId).catch((error: unknown) => this.logger.warn(`Strava sync for ${userId} failed: ${String(error)}`));
  }

  private async importActivity(account: StravaAccount, userId: string, summary: StravaActivity): Promise<boolean> {
    const activityType = SPORT_TYPES[summary.sport_type];
    if (!activityType || summary.manual || summary.trainer || summary.start_latlng.length === 0) return false;
    const externalId = `strava:${summary.id}`;
    if (await this.dataSource.getRepository(Activity).exist({ where: { externalId } })) return false;

    const startedAt = new Date(summary.start_date);
    const finishedAt = new Date(startedAt.getTime() + summary.elapsed_time * 1000);
    // Recording the same outing in Jump and Strava must not count twice: the Jump recording wins.
    const [{ overlapping }] = await this.dataSource.query(
      `SELECT EXISTS (SELECT 1 FROM "activities" WHERE "userId" = $1 AND "startedAt" < $3 AND "finishedAt" > $2) AS overlapping`,
      [userId, startedAt, finishedAt],
    );
    if (overlapping) return false;

    const streams = await this.request<Streams>(account, `/activities/${summary.id}/streams?keys=latlng,time,cadence,distance&key_by_type=true`);
    const points = streams.latlng?.data ?? [];
    const offsets = streams.time?.data ?? [];
    if (points.length < 2 || offsets.length !== points.length) return false;
    const stepTotals = stravaStepTotals(activityType, offsets, points, streams.cadence?.data, streams.distance?.data);

    const activity = await this.dataSource.transaction(async (manager) => {
      const session = await manager.save(
        RunningSession,
        manager.create(RunningSession, {
          userId,
          activityType,
          status: 'PENDING_VERIFICATION',
          startedAt,
          finishedAt,
          distanceMetres: Math.round(summary.distance),
          pausedSeconds: Math.max(0, summary.elapsed_time - summary.moving_time),
          pausedAt: null,
        }),
      );
      const samples = points.map(([latitude, longitude], index) => ({
        sessionId: session.id,
        sequence: index,
        latitude,
        longitude,
        // Strava streams carry no accuracy (verification treats it as usable) and no step count, so the
        // running total is rebuilt from cadence or distance and checked like a phone's.
        stepCount: stepTotals?.[index] ?? null,
        recordedAt: new Date(startedAt.getTime() + offsets[index] * 1000),
      }));
      for (let start = 0; start < samples.length; start += 1000) {
        await manager.createQueryBuilder().insert().into(GpsSample).values(samples.slice(start, start + 1000)).execute();
      }
      return manager.save(
        Activity,
        manager.create(Activity, {
          runningSessionId: session.id,
          userId,
          activityType,
          source: 'strava',
          externalId,
          recordedDistanceMetres: Math.round(summary.distance),
          recordedSteps: stepTotals?.at(-1) ?? 0,
          verificationStatus: 'PENDING_VERIFICATION',
          elapsedSeconds: summary.elapsed_time,
          movingSeconds: summary.moving_time,
          startedAt,
          finishedAt,
        }),
      );
    });

    await this.verificationQueue.add(
      'verify-activity',
      { activityId: activity.id },
      { jobId: `activity-${activity.id}`, attempts: 5, backoff: { type: 'exponential', delay: 1_000 } },
    );
    return true;
  }

  private async exchange(code: string): Promise<TokenResponse> {
    const token = await this.oauth({ grant_type: 'authorization_code', code });
    if (!token.athlete) throw new BadRequestException('Strava didn’t say who you are. Try again.');
    return token;
  }

  private async oauth(params: Record<string, string>): Promise<TokenResponse> {
    const clientId = this.config.get<string>('STRAVA_CLIENT_ID');
    const clientSecret = this.config.get<string>('STRAVA_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new ServiceUnavailableException('Strava isn’t set up yet');
    const response = await fetch(`${STRAVA}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    });
    if (!response.ok) {
      this.logger.warn(`Strava token request failed with ${response.status}`);
      throw new BadRequestException('Strava didn’t accept that sign-in. Try again.');
    }
    return response.json() as Promise<TokenResponse>;
  }

  private async saveTokens(token: TokenResponse, scope: string, userId: string | null) {
    const athlete = token.athlete!;
    const name = [athlete.firstname, athlete.lastname].filter(Boolean).join(' ').trim() || null;
    const avatarUrl = athlete.profile?.startsWith('http') ? athlete.profile : null;
    const existing = await this.accounts.findOne({ where: { athleteId: String(athlete.id) } });
    return this.accounts.save({
      ...(existing ?? {}),
      athleteId: String(athlete.id),
      userId: userId ?? existing?.userId ?? null,
      athleteName: name,
      avatarUrl,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(token.expires_at * 1000),
      scope,
    } as StravaAccount);
  }

  /** Loads the account with its tokens, refreshing the access token when it is about to expire. */
  private async withTokens(where: { userId: string } | { athleteId: string }) {
    const account = await this.accounts
      .createQueryBuilder('account')
      .addSelect(['account.accessToken', 'account.refreshToken'])
      .where(where)
      .getOne();
    if (!account || account.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) return account;
    const token = await this.oauth({ grant_type: 'refresh_token', refresh_token: account.refreshToken });
    account.accessToken = token.access_token;
    account.refreshToken = token.refresh_token;
    account.expiresAt = new Date(token.expires_at * 1000);
    await this.accounts.update(
      { id: account.id },
      { accessToken: account.accessToken, refreshToken: account.refreshToken, expiresAt: account.expiresAt },
    );
    return account;
  }

  private async request<T>(account: StravaAccount, path: string): Promise<T> {
    const response = await fetch(`${STRAVA}/api/v3${path}`, { headers: { Authorization: `Bearer ${account.accessToken}` } });
    if (response.status === 401) throw new BadRequestException('Strava access was revoked. Reconnect Strava.');
    if (response.status === 429) throw new ServiceUnavailableException('Strava is busy right now. Try syncing again in 15 minutes.');
    if (!response.ok) throw new BadRequestException(`Strava returned an error (${response.status}).`);
    return response.json() as Promise<T>;
  }
}
