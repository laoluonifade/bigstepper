export const CLUB_PLANS = {
  free: { label: 'Free', liveChallenges: 10, activeSeries: 3, promotion: false, advancedAnalytics: false },
  pro: { label: 'Pro', liveChallenges: 100, activeSeries: 50, promotion: true, advancedAnalytics: true },
} as const;

export type ClubPlan = keyof typeof CLUB_PLANS;

export function planOf(plan: string | null | undefined, renewsAt?: Date | string | null) {
  const active = plan && plan in CLUB_PLANS && (!renewsAt || new Date(renewsAt) > new Date()) ? plan as ClubPlan : 'free';
  return { plan: active, ...CLUB_PLANS[active] };
}
