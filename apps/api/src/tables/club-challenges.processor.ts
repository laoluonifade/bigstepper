import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { CLUB_CHALLENGES_QUEUE } from '../jobs/jobs.module';
import { ChallengeStudioService } from './challenge-studio.service';

@Injectable()
@Processor(CLUB_CHALLENGES_QUEUE)
export class ClubChallengesProcessor extends WorkerHost implements OnModuleInit {
  constructor(private readonly studio: ChallengeStudioService, @InjectQueue(CLUB_CHALLENGES_QUEUE) private readonly queue: Queue) { super(); }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('club-competitions', { every: 5 * 60_000 }, { name: 'club-competitions' });
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'club-competitions') return;
    await this.studio.publishDue();
    await this.studio.generateDue();
  }
}
