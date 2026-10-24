/** Set when there was nothing free to join, so the welcome screen lets the runner through until the app restarts. */
let skipped = false;

export function skipOnboarding() {
  skipped = true;
}

export function onboardingSkipped() {
  return skipped;
}

/** Accounts created from this release on; older runners aren't pushed through onboarding again. */
export const ONBOARDING_REQUIRED_SINCE = Date.UTC(2026, 9, 22);
