const KEY = 'jump.onboarding.skipped';

/** Set when there was nothing free to join, so the welcome page lets the runner through for this visit. */
export function skipOnboarding() {
  try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode: they'll see the page again, which is fine */ }
}

export function onboardingSkipped() {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
