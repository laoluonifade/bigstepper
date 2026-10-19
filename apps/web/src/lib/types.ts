export type Unit = 'km' | 'mi';
export type Visibility = 'private' | 'followers' | 'public';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified?: boolean;
}

export interface AuthResponse {
  access_token: string;
  user: User;
  /** Only present when the API runs with NODE_ENV=development. */
  developmentVerificationToken?: string;
}

export interface Profile {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  preferredUnit: Unit;
  activityVisibility: Visibility;
  countryCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfile {
  username: string;
  displayName: string;
  countryCode: string;
}

export type RunStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'FLAGGED' | 'REJECTED';

export interface RunSession {
  id: string;
  userId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  distanceMetres: number;
  activityType: 'walk' | 'run';
  stepCount: number;
  pausedAt: string | null;
  pausedSeconds: number;
  createdAt: string;
}

export interface SampleUploadResult {
  distanceMetres: number;
  sampleCount: number;
}

export type VerificationStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'FLAGGED' | 'REJECTED';

export interface Activity {
  id: string;
  runningSessionId: string;
  userId: string;
  verificationStatus: VerificationStatus;
  activityType: 'walk' | 'run';
  recordedDistanceMetres: number;
  validatedDistanceMetres: number;
  recordedSteps: number;
  validatedSteps: number;
  elapsedSeconds: number;
  movingSeconds: number;
  gpsConfidence: number;
  verificationReasons: string[];
  algorithmVersion: string;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
}

export interface CompetitionTable {
  id: string;
  title: string;
  code: string;
  type: 'free' | 'paid' | 'sponsored';
  status: string;
  entryFeeKobo: number;
  guaranteedPrizeKobo: number | null;
  minimumEntrants: number;
  startsAt: string | null;
  entryClosesAt: string | null;
  scoringClosesAt: string | null;
  capacity: number | null;
  distanceCapMetres: number | null;
  challengeType: ChallengeType;
  scoringMethod: ScoringMethod;
  targetDistanceMetres: number | null;
  communityId: string | null;
  platformFeeBps: number;
  creatorCommissionBps: number;
  creatorId: string;
  creator?: { id: string; displayName: string | null };
  createdAt: string;
}

export interface StandingRow {
  rank: number;
  userId: string;
  displayName: string;
  creditedDistanceMetres: number;
  creditedSteps: number;
  completionTimeSeconds: number | null;
}

export interface FinalResult {
  id: string;
  tableId: string;
  version: number;
  winnerUserId: string | null;
  createdAt?: string;
  algorithmVersion: string;
  standings: Array<{
    userId: string;
    creditedDistanceMetres: number;
    creditedSteps: number;
    completionTimeSeconds: number | null;
    joinedAt: string;
    rank: number;
  }>;
}

export interface CheckoutResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export type PaymentStatusValue =
  | 'INITIATED'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REFUND_PENDING'
  | 'RECONCILIATION_REQUIRED';

export interface PaymentStatus {
  reference: string;
  status: PaymentStatusValue | string;
  amountKobo: number;
  currency: string;
}

export interface PrizeAward {
  id: string;
  tableId: string;
  /** Postgres bigint — may arrive as a string. */
  amountKobo: number | string;
  grossPrizeKobo: number | string;
  platformFeeKobo: number | string;
  creatorCommissionKobo: number | string;
  currency: string;
  status: string;
  createdAt: string;
}

export interface PayoutRecipient {
  id: string;
  accountName: string;
  bankCode: string;
  accountLast4: string;
  currency: string;
  availableForPayoutAt: string;
}

export type ChallengeType = 'WALK' | 'RUN' | 'DISTANCE' | 'STEP' | 'TIMED';
export type ScoringMethod = 'MOST_STEPS' | 'FARTHEST_DISTANCE' | 'FASTEST_FIXED_DISTANCE' | 'FASTEST_TIME';

export interface Wallet {
  id: string;
  balanceKobo: number | string;
  currency: string;
  withdrawable: false;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  type: 'FUNDING' | 'CHALLENGE_ENTRY' | 'REFUND';
  amountKobo: number | string;
  balanceAfterKobo: number | string;
  reference: string;
  description: string;
  createdAt: string;
}

export interface CreatorProfile {
  id: string;
  userId: string;
  creatorType: 'influencer' | 'community_manager' | 'run_club' | 'other';
  displayName: string;
  socialUrl: string | null;
  bio: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  commissionBps: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorEarning {
  id: string;
  tableId: string;
  grossPrizeKobo: number | string;
  amountKobo: number | string;
  currency: string;
  status: string;
  createdAt: string;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: string;
  memberCount?: number;
}

export interface ClubMember {
  id: string;
  clubId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  username: string | null;
  displayName: string | null;
}

export interface LeagueSeason {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'FINALIZED';
}

export interface LeagueDivision {
  id: string;
  name: string;
  level: number;
}

export interface LeagueMembership {
  id: string;
  seasonId: string;
  divisionId: string;
  userId: string;
  creditedDistanceMetres: number;
  /** Set once the season closes. */
  finalRank: number | null;
  outcome: 'PROMOTED' | 'RELEGATED' | 'STAYED' | null;
  /** Present on standings rows. */
  displayName?: string | null;
  username?: string | null;
}

export interface LeagueRules {
  promotePercent: number;
  relegatePercent: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface VerificationReview {
  id: string;
  activityId: string;
  requestedByUserId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  createdAt: string;
  activity: Activity;
}
