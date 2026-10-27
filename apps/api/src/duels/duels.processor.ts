import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { DUELS_QUEUE } from '../jobs/jobs.module';
import { winnerOf } from './duel-progress';
import { DuelRow, DuelsRepository } from './duels.repository';
import { duelLine, DuelsService } from './duels.service';

@Injectable()
@Processor(DUELS_QUEUE)
export class DuelsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(DuelsProcessor.name);

  constructor(
    private readonly repo: DuelsRepository,
    private readonly duels: DuelsService,
    @InjectQueue(DUELS_QUEUE) private readonly queue: Queue,
  ) { super(); }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('settle-duels', { every: 20_000 }, { name: 'settle' });
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'settle') return;
    await this.repo.expire();
    for (const duel of await this.repo.live()) {
      try { await this.settle(duel); }
      catch (error) { this.logger.error(`Duel ${duel.id} could not be settled`, error instanceof Error ? error.stack : String(error)); }
    }
  }

  private async settle(duel: DuelRow) {
    const progress = await this.duels.liveProgress(duel, true);
    if (!this.duels.dueToSettle(duel, progress)) return;
    const winnerId = winnerOf({ userId: duel.challengerId, ...progress.challenger }, { userId: duel.opponentId, ...progress.opponent });
    const done = await this.repo.finish(duel.id, {
      challengerMetres: progress.challenger.metres, opponentMetres: progress.opponent.metres,
      challengerReachedAt: progress.challenger.reachedAt, opponentReachedAt: progress.opponent.reachedAt, winnerId,
    });
    if (!done) return;
    const [challengerName, opponentName] = await Promise.all([this.repo.displayName(duel.challengerId), this.repo.displayName(duel.opponentId)]);
    const link = `/duels/${duel.id}`;
    const line = duelLine(duel);
    const title = (me: string, them: string) => winnerId === null ? `Your duel with ${them} was a draw` : winnerId === me ? `You won your duel against ${them}` : `${them} won your duel`;
    await this.repo.notify(this.repo.dataSource, [
      { userId: duel.challengerId, type: 'DUEL_RESULT', title: title(duel.challengerId, opponentName), body: `${line}. See how it finished.`, link, email: true },
      { userId: duel.opponentId, type: 'DUEL_RESULT', title: title(duel.opponentId, challengerName), body: `${line}. See how it finished.`, link, email: true },
    ]);
  }
}
