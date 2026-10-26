export interface AmlSettings {
  kycRequired: boolean;

  maxPaidChallengesPerDay: number;
  maxEntryFeeKobo: number;
  maxPotKobo: number;
  participantTiers: Array<{ potKobo: number; minEntrants: number }>;
  maxWalletFundingPerDayKobo: number;

  payoutReviewThresholdKobo: number;
  newAccountDays: number;
  withdrawalLimits: Record<RiskLevel, { dailyKobo: number; monthlyKobo: number }>;

  riskMediumScore: number;
  riskHighScore: number;
  autoHoldHighRisk: boolean;
  repeatViolationCount: number;

  windowDays: number;
  pairRepeatCount: number;
  sameWinnerCount: number;
  rotationSharedCount: number;
  fastChallengeMinutes: number;
  spikeMultiplier: number;
  spikeMinKobo: number;
  noShowEntries: number;
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

export function mergeSettings(saved: Partial<AmlSettings> | null | undefined): AmlSettings {
  const values = { ...AML_DEFAULTS, ...(saved ?? {}) };
  values.withdrawalLimits = { ...AML_DEFAULTS.withdrawalLimits, ...(saved?.withdrawalLimits ?? {}) };
  values.participantTiers = [...values.participantTiers].sort((a, b) => a.potKobo - b.potKobo);
  return values;
}

export function minEntrantsFor(settings: AmlSettings, potKobo: number) {
  return settings.participantTiers.reduce((min, tier) => potKobo >= tier.potKobo ? Math.max(min, tier.minEntrants) : min, 2);
}

export const SEVERITY_POINTS: Record<number, number> = { 1: 10, 2: 25, 3: 45 };
