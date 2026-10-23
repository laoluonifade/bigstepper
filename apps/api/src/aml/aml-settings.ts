/**
 * Every anti-money-laundering threshold, editable in the admin console. Amounts are in kobo. These
 * defaults are a starting point for a young platform and should be confirmed with legal counsel.
 */
export interface AmlSettings {
  /** KYC Level 2 (BVN + own bank account) before paid challenges, creator features or payouts. */
  kycRequired: boolean;

  // Challenge limits
  maxPaidChallengesPerDay: number;
  maxEntryFeeKobo: number;
  maxPotKobo: number;
  /** A pot at or above potKobo needs at least minEntrants to start or pay out. */
  participantTiers: Array<{ potKobo: number; minEntrants: number }>;
  maxWalletFundingPerDayKobo: number;

  // Payout controls
  /** Payouts at or above this are held for review with a written decision. */
  payoutReviewThresholdKobo: number;
  /** Payouts from accounts younger than this are held for review. */
  newAccountDays: number;
  withdrawalLimits: Record<RiskLevel, { dailyKobo: number; monthlyKobo: number }>;

  // Risk scoring
  riskMediumScore: number;
  riskHighScore: number;
  /** Put a payout hold on accounts that reach high risk. */
  autoHoldHighRisk: boolean;
  /** Confirmed flags before the account is escalated for investigation. */
  repeatViolationCount: number;

  // Monitoring rules
  windowDays: number;
  /** Paid challenges a pair shares in the window before it's flagged. */
  pairRepeatCount: number;
  /** Times one person beats the same person in paid challenges in the window. */
  sameWinnerCount: number;
  /** Shared paid challenges before a pair trading wins is checked for rotation. */
  rotationSharedCount: number;
  /** Paid challenges shorter than this from creation to close. */
  fastChallengeMinutes: number;
  /** Last 7 days against the weekly average of the 8 weeks before. */
  spikeMultiplier: number;
  spikeMinKobo: number;
  /** Paid entries with no activity in the window before it looks like money moving, not racing. */
  noShowEntries: number;
  /** A payout requested this soon after funding the wallet. */
  cycleHours: number;
  cycleMinKobo: number;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export const AML_DEFAULTS: AmlSettings = {
  kycRequired: true,
  maxPaidChallengesPerDay: 3,
  maxEntryFeeKobo: 5_000_000,
  maxPotKobo: 100_000_000,
  participantTiers: [
    { potKobo: 0, minEntrants: 2 },
    { potKobo: 10_000_000, minEntrants: 5 },
    { potKobo: 50_000_000, minEntrants: 10 },
  ],
  maxWalletFundingPerDayKobo: 50_000_000,
  payoutReviewThresholdKobo: 5_000_000,
  newAccountDays: 7,
  withdrawalLimits: {
    LOW: { dailyKobo: 50_000_000, monthlyKobo: 500_000_000 },
    MEDIUM: { dailyKobo: 10_000_000, monthlyKobo: 50_000_000 },
    HIGH: { dailyKobo: 0, monthlyKobo: 0 },
  },
  riskMediumScore: 30,
  riskHighScore: 60,
  autoHoldHighRisk: true,
  repeatViolationCount: 2,
  windowDays: 30,
  pairRepeatCount: 4,
  sameWinnerCount: 3,
  rotationSharedCount: 4,
  fastChallengeMinutes: 60,
  spikeMultiplier: 5,
  spikeMinKobo: 5_000_000,
  noShowEntries: 3,
  cycleHours: 72,
  cycleMinKobo: 2_000_000,
};

/** Saved values over the defaults, so settings added later still have a value. */
export function mergeSettings(saved: Partial<AmlSettings> | null | undefined): AmlSettings {
  const values = { ...AML_DEFAULTS, ...(saved ?? {}) };
  values.withdrawalLimits = { ...AML_DEFAULTS.withdrawalLimits, ...(saved?.withdrawalLimits ?? {}) };
  values.participantTiers = [...values.participantTiers].sort((a, b) => a.potKobo - b.potKobo);
  return values;
}

/** The fewest entrants a pot of this size needs. */
export function minEntrantsFor(settings: AmlSettings, potKobo: number) {
  return settings.participantTiers.reduce((min, tier) => potKobo >= tier.potKobo ? Math.max(min, tier.minEntrants) : min, 2);
}

/** Points each open or upheld flag adds to the 0–100 score, by severity. */
export const SEVERITY_POINTS: Record<number, number> = { 1: 10, 2: 25, 3: 45 };
