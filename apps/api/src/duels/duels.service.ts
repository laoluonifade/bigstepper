import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DuelActivity, Progress, progressFor } from './duel-progress';
import { DuelRow, DuelsRepository } from './duels.repository';

const READY_MINUTES = 10;
const SETTLE_GRACE_MS = 2 * 60_000;
const LIVE_CACHE_MS = 5_000;
const VERB: Record<DuelActivity, string> = { run: 'Run', walk: 'Walk', cycle: 'Ride', any: 'Move' };

export function duelLine(duel: Pick<DuelRow, 'activity' | 'targetMetres' | 'minutes'>) {
  const km = duel.targetMetres / 1000;
  return `${VERB[duel.activity]} ${Number.isInteger(km) ? km : km.toFixed(1)} km in ${duel.minutes} min`;
}

export function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

@Injectable()
export class DuelsService {
  private readonly cache = new Map<string, { at: number; value: { challenger: Progress; opponent: Progress } }>();

  constructor(private readonly repo: DuelsRepository) {}

  async create(userId: string, input: { username: string; activity: DuelActivity; targetMetres: number; minutes: number }) {
    const runner = await this.repo.runner(input.username);
    if (!runner) throw new NotFoundException('Runner not found');
    if (runner.userId === userId) throw new BadRequestException('You can’t duel yourself');
    const access = await this.repo.canDuel(userId, runner.userId);
    if (access?.blocked) throw new ForbiddenException('You can’t duel this runner.');
    if (access?.closed) throw new ForbiddenException(`@${runner.username} only gets messages from runners they follow.`);
    const name = await this.repo.displayName(userId);
    try {
      return await this.repo.dataSource.transaction(async (db) => {
        const duel = (await this.repo.insert(db, { challengerId: userId, opponentId: runner.userId, ...input }))!;
        await this.repo.postToChat(db, duel);
        await this.repo.notify(db, [{
          userId: runner.userId, type: 'DUEL_INVITE', title: `${name} challenged you to a duel`,
          body: `${duelLine(duel)}. Open Jump and hold Accept to take it on.`, link: `/duels/${duel.id}`, email: true,
        }]);
        return { id: duel.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`You already have a duel going with @${runner.username}. Finish that one first.`);
      throw error;
    }
  }

  async get(viewerId: string, duelId: string) {
    const duel = await this.repo.summary(viewerId, duelId);
    if (!duel) throw new NotFoundException('Duel not found');
    const live = duel.status === 'LIVE' && duel.startsAt && new Date(String(duel.startsAt)).getTime() <= Date.now()
      ? await this.liveProgress(duel as unknown as DuelRow) : null;
    return { ...duel, live: live && { challengerMetres: live.challenger.metres, opponentMetres: live.opponent.metres, challengerReachedAt: live.challenger.reachedAt, opponentReachedAt: live.opponent.reachedAt }, now: new Date().toISOString() };
  }

  async respond(userId: string, duelId: string, decision: 'accept' | 'decline') {
    return this.repo.dataSource.transaction(async (db) => {
      const duel = await this.repo.lock(db, duelId);
      if (!duel || duel.opponentId !== userId) throw new NotFoundException('Duel not found');
      if (duel.status !== 'PENDING' || new Date(duel.expiresAt).getTime() <= Date.now()) throw new ConflictException('This duel can’t be answered any more.');
      const name = await this.repo.displayName(userId);
      if (decision === 'accept') {
        await this.repo.setStatus(db, duelId, 'ACCEPTED', `,"acceptedAt"=now(),"expiresAt"=now() + interval '24 hours'`);
        await this.repo.notify(db, [{ userId: duel.challengerId, type: 'DUEL_ACCEPTED', title: `${name} accepted your duel`, body: `${duelLine(duel)}. Tap I’m ready when you’re set to go.`, link: `/duels/${duelId}`, email: false }]);
      } else {
        await this.repo.setStatus(db, duelId, 'DECLINED');
        await this.repo.notify(db, [{ userId: duel.challengerId, type: 'DUEL_DECLINED', title: `${name} declined your duel`, body: duelLine(duel), link: `/duels/${duelId}`, email: false }]);
      }
      return { status: decision === 'accept' ? 'ACCEPTED' : 'DECLINED' };
    });
  }

  async cancel(userId: string, duelId: string) {
    return this.repo.dataSource.transaction(async (db) => {
      const duel = await this.repo.lock(db, duelId);
      if (!duel || (duel.challengerId !== userId && duel.opponentId !== userId)) throw new NotFoundException('Duel not found');
      if (duel.status === 'PENDING' && duel.challengerId !== userId) throw new ConflictException('Decline it instead.');
      if (duel.status !== 'PENDING' && duel.status !== 'ACCEPTED') throw new ConflictException('This duel has already started or ended.');
      await this.repo.setStatus(db, duelId, 'CANCELLED');
      return { status: 'CANCELLED' };
    });
  }

  async ready(userId: string, duelId: string) {
    return this.repo.dataSource.transaction(async (db) => {
      const duel = await this.repo.lock(db, duelId);
      if (!duel || (duel.challengerId !== userId && duel.opponentId !== userId)) throw new NotFoundException('Duel not found');
      if (duel.status === 'LIVE') return { status: 'LIVE' };
      if (duel.status !== 'ACCEPTED' || new Date(duel.expiresAt).getTime() <= Date.now()) throw new ConflictException('This duel can’t start any more.');
      const fresh = (at: Date | string | null) => at !== null && Date.now() - new Date(at).getTime() < READY_MINUTES * 60_000;
      const mine = duel.challengerId === userId ? duel.challengerReadyAt : duel.opponentReadyAt;
      const theirs = duel.challengerId === userId ? duel.opponentReadyAt : duel.challengerReadyAt;
      const otherId = duel.challengerId === userId ? duel.opponentId : duel.challengerId;
      await this.repo.markReady(db, duelId, userId);
      const link = `/duels/${duelId}`;
      if (fresh(theirs)) {
        const started = (await this.repo.start(db, duelId))!;
        await this.repo.postToFeed(db, started);
        const body = `${duelLine(started)}. Start recording now — the clock is running.`;
        await this.repo.notify(db, [duel.challengerId, duel.opponentId].map((id) => ({ userId: id, type: 'DUEL_STARTED', title: 'Your duel is live 🔥', body, link, email: false })));
        return { status: 'LIVE' };
      }
      if (!fresh(mine)) {
        const name = await this.repo.displayName(userId);
        await this.repo.notify(db, [{ userId: otherId, type: 'DUEL_READY', title: `${name} is ready to duel`, body: `Tap I’m ready in the next ${READY_MINUTES} minutes to start.`, link, email: false }]);
      }
      return { status: 'ACCEPTED' };
    });
  }

  async liveProgress(duel: DuelRow, fresh = false) {
    const cached = this.cache.get(duel.id);
    if (!fresh && cached && Date.now() - cached.at < LIVE_CACHE_MS) return cached.value;
    const from = new Date(duel.startsAt!);
    const until = new Date(Math.min(Date.now(), new Date(duel.endsAt!).getTime()));
    const [challenger, opponent] = await Promise.all([duel.challengerId, duel.opponentId].map(async (id) =>
      progressFor(await this.repo.tracks(id, duel.activity, from, until), duel.targetMetres, from, until)));
    const value = { challenger, opponent };
    this.cache.set(duel.id, { at: Date.now(), value });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  dueToSettle(duel: DuelRow, progress: { challenger: Progress; opponent: Progress }, now = Date.now()) {
    if (now >= new Date(duel.endsAt!).getTime() + SETTLE_GRACE_MS) return true;
    const reached = [progress.challenger.reachedAt, progress.opponent.reachedAt].filter((at): at is Date => at !== null).map((at) => at.getTime());
    return reached.length > 0 && now >= Math.min(...reached) + SETTLE_GRACE_MS;
  }
}
