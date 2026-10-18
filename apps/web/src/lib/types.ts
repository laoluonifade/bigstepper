export type Unit = 'km' | 'mi';
export type Visibility = 'private' | 'followers' | 'public';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
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
  recordedDistanceMetres: number;
  validatedDistanceMetres: number;
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
  creatorId: string;
  creator?: { id: string; displayName: string | null };
  createdAt: string;
}

export interface StandingRow {
  rank: number;
  userId: string;
  displayName: string;
  creditedDistanceMetres: number;
}

export interface FinalResult {
  id: string;
  tableId: string;
  version: number;
  winnerUserId: string | null;
  createdAt?: string;
  algorithmVersion: string;
  standings: Array<{ userId: string; creditedDistanceMetres: number; joinedAt: string; rank: number }>;
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
