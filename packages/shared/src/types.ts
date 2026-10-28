export type Unit = 'km' | 'mi';
export type Gender = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';
export type AvatarStyle = 'masculine' | 'feminine' | 'neutral';

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
  /** Set when a Jump admin gave this runner a blue tick. */
  verifiedAt?: string | null;
  username: string;
  /** False while it's still the generated sign-up username. */
  usernameChosen?: boolean;
  displayName: string;
  preferredUnit: Unit;
  /** What Explore shows: everything, or just events or competitions. */
  exploreLens?: 'all' | 'events' | 'competitions';
  /** What they said brought them to Jump at sign-up: run, walk, cycle, compete, events, fitness, steps, friends. */
  interests?: string[];
  countryCode: string;
  /** Private; only returned for your own profile. */
  gender: Gender | null;
  avatarUrl: string | null;
  bio: string | null;
  /** null until the runner picks one. */
  weeklyGoalMetres: number | null;
  /** Private optional setting; never included in public profiles. */
  weightKg: number | null;
  emailActivityEnabled: boolean;
  /** Who can start a DM: anyone, or only runners this person follows. */
  messagesFrom?: 'everyone' | 'following';
  emailDigestEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** Private; only on your own profile. */
  whatsappNumber?: string | null;
}

export interface PublicStats {
  totalMetres: number;
  activities: number;
  runs: number;
  walks: number;
  cycles: number;
  runMetres: number;
  walkMetres: number;
  cycleMetres: number;
  longestMetres: number;
  movingSeconds: number;
  monthMetres: number;
}

export interface Connection {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarStyle?: AvatarStyle;
  /** Blue tick from a Jump admin. */
  verified?: boolean;
  bio: string | null;
  followedByMe: boolean;
  isMe: boolean;
}

export interface PublicProfile {
  username: string;
  displayName: string;
  countryCode: string;
  /** Public avatar appearance, without disclosing gender. */
  avatarStyle?: AvatarStyle;
  /** Blue tick from a Jump admin. */
  verified?: boolean;
  avatarUrl: string | null;
  bio: string | null;
  memberSince: string;
  /** Whether the viewer may see dated activities. Aggregate stats are always public. */
  runsVisible: boolean;
  /** The viewer is this runner. */
  isMe: boolean;
  followers: number;
  following: number;
  followedByMe: boolean;
  /** You blocked them: their Rants and messages are hidden from you and they can’t message you. */
  blockedByMe?: boolean;
  followsMe: boolean;
  stats: PublicStats;
  recent?: Array<{ id?: string; activityType: 'walk' | 'run' | 'cycle'; startedAt: string; metres: number; movingSeconds: number }>;
}

export type RunStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'FLAGGED' | 'REJECTED';

export interface RunSession {
  id: string;
  userId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  distanceMetres: number;
  activityType: 'walk' | 'run' | 'cycle';
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
  activityType: 'walk' | 'run' | 'cycle';
  recordedDistanceMetres: number;
  validatedDistanceMetres: number;
  recordedSteps: number;
  validatedSteps: number;
  /** Distance from counted steps — used where GPS couldn't measure (indoors). */
  stepDistanceMetres?: number;
  elapsedSeconds: number;
  movingSeconds: number;
  gpsConfidence: number;
  verificationReasons: string[];
  algorithmVersion: string;
  /** Recorded in Jump, or imported from Strava. */
  source?: 'jump' | 'strava';
  startedAt: string;
  finishedAt: string;
  createdAt: string;
  /** From the activity page: false when it's someone else's (read-only), with who did it. */
  mine?: boolean;
  owner?: { username: string; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; verified?: boolean } | null;
}

export interface CompetitionTable {
  id: string;
  title: string;
  /** Private competitions are hidden from browsing and invite-only. */
  visibility?: 'public' | 'private';
  /** Host's short pitch, up to 280 characters. */
  description: string | null;
  code: string;
  type: 'free' | 'paid' | 'sponsored';
  status: string;
  entryFeeKobo: number;
  guaranteedPrizeKobo: number | null;
  fundingDestination?: 'WINNERS' | 'CHARITY';
  charityName?: string | null;
  fundedPrizeKobo?: number;
  prizeSplitBps: number[];
  fundedAt: string | null;
  minimumEntrants: number;
  startsAt: string | null;
  entryClosesAt: string | null;
  scoringClosesAt: string | null;
  capacity: number | null;
  distanceCapMetres: number | null;
  challengeType: ChallengeType;
  scoringMethod: ScoringMethod;
  targetDistanceMetres: number | null;
  targetSteps?: number | null;
  targetSeconds?: number | null;
  targetSessions?: number | null;
  /** Daily bar or minimum daily average, in metres, steps or seconds (see dailyMeasure in competition-rules). */
  dailyTarget?: number | null;
  minSessions?: number | null;
  minActivityMetres?: number | null;
  minActivitySeconds?: number | null;
  eligibleActivities?: ActivityType[] | null;
  format?: CompetitionFormat;
  /** Days and streaks are counted on this zone's calendar. */
  timeZone?: string;
  /** 1: scored the way competitions were before the rules engine. 2: the engine's rules. */
  rulesVersion?: number;
  reminderTime: string | null;
  reminderTimeZone: string | null;
  communityId: string | null;
  platformFeeBps: number;
  creatorCommissionBps: number;
  /** The host's own banner image, shown instead of the generated card. */
  bannerUrl?: string | null;
  creatorId: string;
  creator?: { id: string; displayName: string | null; username?: string | null; avatarUrl?: string | null; avatarStyle?: AvatarStyle; verified?: boolean } | null;
  /** Runners who have joined (list and detail responses). */
  /** Discovery cards only: the top three who have scored, and a few faces of who's in. */
  leaders?: Array<{ rank: number; displayName: string; username: string | null; avatarUrl: string | null; avatarStyle?: AvatarStyle; verified?: boolean; score: number }>;
  faces?: Array<{ displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle }>;
  /** Discovery cards only: your rank here when you've joined, else null. */
  myRank?: number | null;
  entrantCount?: number;
  /** Set when the host archived it: off every list, still at its link. */
  archivedAt?: string | null;
  /** Only people whose profile country is listed can join (empty: anyone). */
  eligibleCountries?: string[];
  /** DRAFT and SCHEDULED challenges open later; SCHEDULED ones at this time. */
  publishAt?: string | null;
  seriesId?: string | null;
  edition?: number | null;
  prizeSelection?: 'top' | 'draw';
  /** Detail page only: the club's prizes and terms, when it has them. */
  productPrizes?: ClubPrizeTerms | null;
  /** Detail page only: the hosting club. */
  club?: { name: string; slug: string; logoUrl: string | null; accentColor: string; website?: string | null; verified: boolean; followerCount: number; seriesTitle: string | null; seriesCadence: 'weekly' | 'monthly' | null } | null;
  /** Detail page only: the viewer is the host or one of the club's managers. */
  canManage?: boolean;
  /** Club page lists only. */
  hasPrizes?: boolean;
  topPrize?: string | null;
  podium?: Array<{ rank: number; displayName: string; username: string | null; avatarUrl: string | null }> | null;
  createdAt: string;
}

export type PrizeKind = 'product' | 'discount' | 'experience';

/** One prize tier: `quantity` winners each get it, in finishing (or draw) order. */
export interface ClubPrize {
  position: number;
  kind: PrizeKind;
  productName: string;
  description?: string | null;
  imageUrl?: string | null;
  quantity: number;
  estimatedValue?: number | null;
  currency?: string;
  /** Shown only to a winner once they've claimed (a code, where to collect). Set when creating. */
  redeemInstructions?: string | null;
}

export interface ClubPrizeTerms {
  prizes: ClubPrize[];
  winners: Array<{ position: number; displayName: string; username: string | null; productName: string }>;
  selection: 'top' | 'draw';
  deliveryCountries: string[];
  fulfilment: 'club' | 'jump';
  shipping: 'club' | 'jump' | 'other';
  shippingNote: string | null;
  eligibilityNote: string | null;
  claimDays: number;
}

export type AwardStatus = 'AWAITING_DETAILS' | 'DETAILS_SUBMITTED' | 'READY_FOR_DISPATCH' | 'SHIPPED' | 'DELIVERED' | 'FORFEITED' | 'ISSUE';

/** A prize you won, from GET /prizes/mine. */
export interface MyPrize {
  id: string;
  position: number;
  status: AwardStatus;
  detailsDueAt: string;
  kind: PrizeKind;
  productName: string;
  description: string | null;
  imageUrl: string | null;
  redeemInstructions: string | null;
  fullName: string | null; phone: string | null; address: string | null; city: string | null; region: string | null; country: string | null; deliveryNotes: string | null;
  trackingNote: string | null;
  forfeitReason: string | null;
  submittedAt: string | null; shippedAt: string | null; deliveredAt: string | null; createdAt: string;
  code: string; title: string;
  deliveryCountries: string[];
  shipping: 'club' | 'jump' | 'other' | null;
  shippingNote: string | null;
  fulfilment: 'club' | 'jump';
  clubName: string; clubSlug: string; clubLogoUrl: string | null;
}

/** A winner's claim as the club sees it on its dashboard: only what the prize needs, until delivered. */
export interface ClubClaim {
  id: string;
  status: AwardStatus;
  position: number;
  detailsDueAt: string;
  submittedAt: string | null; shippedAt: string | null; deliveredAt: string | null;
  trackingNote: string | null; issueNote: string | null; createdAt: string;
  productName: string; kind: PrizeKind; code: string; title: string; fulfilment: 'club' | 'jump';
  winnerName: string; winnerUsername: string | null;
  claim: { fullName: string; phone?: string | null; address?: string | null; city?: string | null; region?: string | null; country?: string | null; deliveryNotes?: string | null } | null;
}

export interface ClubSeries {
  id: string; title: string; cadence: 'weekly' | 'monthly'; autoPublish: boolean; leadDays: number;
  nextStartsAt: string; lastEdition: number; active: boolean; createdAt: string;
}

export interface ClubDashboard {
  club: { slug: string; name: string; suspendedAt: string | null; suspendedReason: string | null; plan: 'free' | 'pro'; label: string; liveChallenges: number; activeSeries: number; promotion: boolean; advancedAnalytics: boolean };
  totals: { followers: number; members: number; newFollowers30d: number; participants: number; repeatParticipants: number; entries: number; completions: number; challenges: number };
  /** Last 30 days: views of the club page and its competitions, shares, joins and members' activity. */
  reach?: {
    views: number; uniqueViewers: number; linkVisits: number; competitionViews: number; shares: number;
    sharesByChannel: Record<string, number>; joins: number; memberKm: number; activeMembers7d: number;
    /** Views per day, oldest first, for the last 14 days. */
    dailyViews: number[];
  };
  challenges: Array<{
    id: string; code: string; title: string; status: string; type: string; challengeType: ChallengeType; publishAt: string | null; startsAt: string | null; scoringClosesAt: string | null;
    capacity: number | null; seriesId: string | null; edition: number | null; hasPrizes: boolean; prizesFinalizedAt: string | null; archivedAt: string | null; promotedUntil: string | null;
    phase: 'draft' | 'scheduled' | 'upcoming' | 'live' | 'finished'; entrants: number; completed: number;
  }>;
  winners: Array<{ id: string; code: string; title: string; scoringClosesAt: string; podium: Array<{ rank: number; displayName: string; username: string | null }> | null }>;
  series: ClubSeries[];
  monthly: Array<{ month: string; challenges: number; entries: number; participants: number; completions: number; newFollowers: number }>;
  claims: ClubClaim[];
}

export interface StandingRow {
  rank: number;
  userId: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  avatarStyle?: AvatarStyle;
  /** Blue tick from a Jump admin. */
  verified?: boolean;
  creditedDistanceMetres: number;
  creditedSteps: number;
  completionTimeSeconds: number | null;
  /** The ranked score in the metric's own unit (see METRICS[scoringMethod].display); null until there is one. */
  score: number | null;
  /** Reached the target, for first-to formats. */
  targetReachedAt?: string | null;
  /** Met the minimum activity requirement; unqualified entrants rank after everyone who did. */
  qualified?: boolean;
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
    score?: number | null;
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
  place: number;
  /** Postgres bigint — may arrive as a string. */
  amountKobo: number | string;
  grossPrizeKobo: number | string;
  platformFeeKobo: number | string;
  creatorCommissionKobo: number | string;
  currency: string;
  status: string;
  createdAt: string;
  /** The competition it was won in. */
  tableTitle?: string | null;
  tableCode?: string | null;
  /** A payout has been requested and is waiting for Jump to send it. */
  payoutRequested?: boolean;
}

export interface PayoutRecipient {
  id: string;
  accountName: string;
  bankCode: string;
  accountLast4: string;
  currency: string;
  availableForPayoutAt: string;
}

import type { ActivityType, ChallengeType, CompetitionFormat, ScoringMethod } from './competition-rules';
export type { ChallengeType, ScoringMethod } from './competition-rules';

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
  /** PENDING until a Jump admin approves; only ACTIVE creators can host paid challenges. */
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
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

/** owner: created it. admin: a manager the owner appointed. member: everyone else. */
export type ClubRole = 'owner' | 'admin' | 'member';

export interface Club {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: string;
  description?: string | null;
  logoUrl?: string | null;
  accentColor?: string;
  location?: string | null;
  website?: string | null;
  instagram?: string | null;
  /** open: anyone can join from the page. invite: only with the invite link. */
  privacy?: 'open' | 'invite';
  memberCount?: number;
  followerCount?: number;
  /** Whether the viewer follows the club (members follow automatically). */
  following?: boolean;
  liveCompetitions?: number;
  upcomingCompetitions?: number;
  /** Jump suspended the club: it can't run challenges. Managers also see why. */
  suspended?: boolean;
  suspendedReason?: string | null;
  /** Managers only: what the club's plan includes. */
  plan?: { plan: 'free' | 'pro'; label: string; liveChallenges: number; activeSeries: number; promotion: boolean; advancedAnalytics: boolean };
  faces?: Array<{ displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle }>;
  owner?: { displayName: string; username: string | null; verified?: boolean } | null;
  /** Blue tick from a Jump admin: a badge only, unverified clubs work the same. */
  verified?: boolean;
  /** Only the owner and managers can send in the club chat. */
  chatLocked?: boolean;
  /** Your role here, or null when you're not a member (or not signed in). */
  myRole?: ClubRole | null;
  /** Jump's own community club, which Jump staff manage. */
  official?: boolean;
  /** Whether the ?invite= code in the link is this club's. */
  inviteValid?: boolean;
  /** Members only (to share the club); managers can reset it. */
  inviteCode?: string;
}

export interface ClubMember {
  id: string;
  clubId?: string;
  userId: string;
  role: ClubRole;
  joinedAt: string;
  username: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  avatarStyle?: AvatarStyle;
  /** Blue tick from a Jump admin. */
  verified?: boolean;
  countryCode?: string | null;
}

export interface ClubStanding {
  rank: number;
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  avatarStyle?: AvatarStyle;
  /** Blue tick from a Jump admin. */
  verified?: boolean;
  monthMetres: number;
}

export interface RunnerSearchResult {
  username: string;
  displayName: string;
  avatarStyle?: AvatarStyle;
  /** Blue tick from a Jump admin. */
  verified?: boolean;
  avatarUrl: string | null;
  bio: string | null;
  isMe: boolean;
  followedByMe: boolean;
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
  avatarUrl?: string | null;
  avatarStyle?: AvatarStyle;
  /** Blue tick from a Jump admin. */
  verified?: boolean;
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
  /** In-app path to open, e.g. `/feed/<id>`. */
  link: string | null;
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

export type StravaStatus =
  | { connected: false }
  | { connected: true; athleteName: string | null; avatarUrl: string | null; lastSyncedAt: string | null; syncing: boolean; canReadActivities: boolean };

export type StravaLoginResponse =
  | (AuthResponse & { status: 'signed-in' })
  | { status: 'needs-signup'; signupToken: string; athlete: { name: string | null; avatarUrl: string | null } };
