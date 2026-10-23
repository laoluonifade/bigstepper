/**
 * What each club plan includes. Every club is on free today and free covers everything a club needs to
 * run challenges on its own; pro is the hook for paid subscriptions, promotion and deeper analytics.
 * Changing a club's plan (admin now, self-serve checkout later) is all it takes to unlock more.
 */
export const CLUB_PLANS = {
  free: { label: 'Free', liveChallenges: 10, activeSeries: 3, promotion: false, advancedAnalytics: false },
  pro: { label: 'Pro', liveChallenges: 100, activeSeries: 50, promotion: true, advancedAnalytics: true },
} as const;

export type ClubPlan = keyof typeof CLUB_PLANS;

export function planOf(plan: string | null | undefined, renewsAt?: Date | string | null) {
  // A lapsed paid plan falls back to free.
  const active = plan && plan in CLUB_PLANS && (!renewsAt || new Date(renewsAt) > new Date()) ? plan as ClubPlan : 'free';
  return { plan: active, ...CLUB_PLANS[active] };
}
