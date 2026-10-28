const KEY = 'jump.onboarding.skipped';
const INTERESTS_KEY = 'jump.interests.skipped';

/** "Skip for now" on the interests question: not asked again this visit. */
export function skipInterests() {
  try { sessionStorage.setItem(INTERESTS_KEY, '1'); } catch { /* asked again next time, which is fine */ }
}

export function interestsWereSkipped() {
  try { return sessionStorage.getItem(INTERESTS_KEY) === '1'; } catch { return false; }
}

/** Accounts created from when sign-up started asking what brought them here. */
export const INTERESTS_REQUIRED_SINCE = Date.UTC(2026, 9, 29);

/** Set when there was nothing free to join, so the welcome page lets the runner through for this visit. */
export function skipOnboarding() {
  try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode: they'll see the page again, which is fine */ }
}

export function onboardingSkipped() {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
