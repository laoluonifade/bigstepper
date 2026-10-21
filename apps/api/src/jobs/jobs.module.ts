import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export const ACTIVITY_VERIFICATION_QUEUE = 'activity-verification';
export const LEAGUE_SEASONS_QUEUE = 'league-seasons';
export const CHALLENGE_REMINDERS_QUEUE = 'challenge-reminders';

@Module({
  imports: [BullModule.registerQueue({ name: ACTIVITY_VERIFICATION_QUEUE })],
  exports: [BullModule],
})
export class JobsModule {}
