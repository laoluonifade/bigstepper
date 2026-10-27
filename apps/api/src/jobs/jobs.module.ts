import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export const ACTIVITY_VERIFICATION_QUEUE = 'activity-verification';
export const LEAGUE_SEASONS_QUEUE = 'league-seasons';
export const CHALLENGE_REMINDERS_QUEUE = 'challenge-reminders';
export const EMAIL_UPDATES_QUEUE = 'email-updates';
export const PUSH_NOTIFICATIONS_QUEUE = 'push-notifications';
export const PRODUCT_PRIZES_QUEUE = 'product-prizes';
export const AML_MONITOR_QUEUE = 'aml-monitor';
export const CLUB_CHALLENGES_QUEUE = 'club-challenges';
export const DUELS_QUEUE = 'duels';

@Module({
  imports: [BullModule.registerQueue({ name: ACTIVITY_VERIFICATION_QUEUE })],
  exports: [BullModule],
})
export class JobsModule {}
