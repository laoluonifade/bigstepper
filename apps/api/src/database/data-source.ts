import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { GpsSample } from '../running/gps-sample.entity';
import { RunningSession } from '../running/running-session.entity';
import { CompetitionTable } from '../tables/competition-table.entity';
import { TableRegistration } from '../tables/table-registration.entity';
import { User } from '../users/user.entity';
import { AuthSession } from '../auth/auth-session.entity';
import { AuthActionToken } from '../auth/auth-action-token.entity';
import { Profile } from '../profiles/profile.entity';
import { Activity } from '../running/activity.entity';
import { ActivityVerificationReview } from '../running/activity-verification-review.entity';
import { TableActivityCredit } from '../tables/table-activity-credit.entity';
import { Club } from '../clubs/club.entity';
import { ClubMembership } from '../clubs/club-membership.entity';
import { LeagueDivision } from '../leagues/league-division.entity';
import { LeagueSeason } from '../leagues/league-season.entity';
import { LeagueMembership } from '../leagues/league-membership.entity';
import { Notification } from '../notifications/notification.entity';
import { PaymentIntent } from '../payments/payment-intent.entity';
import { ProviderWebhook } from '../payments/provider-webhook.entity';
import { CreatorProfile } from '../creators/creator-profile.entity';
import { Wallet } from '../wallets/wallet.entity';

config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgresql://jump:jump@localhost:5432/jump',
  entities: [
    User,
    AuthSession,
    AuthActionToken,
    Profile,
    RunningSession,
    GpsSample,
    Activity,
    ActivityVerificationReview,
    CompetitionTable,
    TableRegistration,
    TableActivityCredit,
    Club,
    ClubMembership,
    LeagueDivision,
    LeagueSeason,
    LeagueMembership,
    Notification,
    PaymentIntent,
    ProviderWebhook,
    CreatorProfile,
    Wallet,
  ],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  synchronize: false,
});
