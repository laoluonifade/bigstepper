/** Set when there was nothing free to join, so the welcome screen lets the runner through until the app restarts. */
let skipped = false;

export function skipOnboarding() {
  skipped = true;
}

export function onboardingSkipped() {
  return skipped;
}

let interestsSkipped = false;

/** "Skip for now" on the interests question: not asked again until the app restarts. */
export function skipInterests() {
  interestsSkipped = true;
}

export function interestsWereSkipped() {
  return interestsSkipped;
}

/** Accounts created from when sign-up started asking what brought them here. */
export const INTERESTS_REQUIRED_SINCE = Date.UTC(2026, 9, 29);

/** Accounts created from this release on; older runners aren't pushed through onboarding again. */
export const ONBOARDING_REQUIRED_SINCE = Date.UTC(2026, 9, 22);
