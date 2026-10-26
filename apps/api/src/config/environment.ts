type Environment = Record<string, string | undefined>;

function integer(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function paymentMode(value: string | undefined): 'off' | 'test' | 'live' {
  const mode = (value?.trim() || 'off').toLowerCase();
  if (mode !== 'off' && mode !== 'test' && mode !== 'live') {
    throw new Error(`PAYMENTS_MODE must be off, test or live (received "${value}")`);
  }
  return mode;
}

function required(env: Environment, name: string, fallback?: string): string {
  const value = env[name] ?? fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function connectionUrl(value: string, name: string, protocols: string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid connection URL`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${protocols.join(' or ')}`);
  }
  return value;
}

export function validateEnvironment(env: Environment) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const jwtSecret = required(
    env,
    'JWT_SECRET',
    nodeEnv === 'development' ? 'development-only-secret-change-me' : undefined,
  );
  if (nodeEnv === 'production' && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters in production');
  }

  const databaseUrl = required(
    env,
    'DATABASE_URL',
    nodeEnv === 'development' ? 'postgresql://jump:jump@localhost:5432/jump' : undefined,
  );
  const redisUrl = required(
    env,
    'REDIS_URL',
    nodeEnv === 'development' ? 'redis://localhost:6379' : undefined,
  );
  const paystackSecretKey = env.PAYSTACK_SECRET_KEY?.trim() || '';
  const paymentsMode = paymentMode(env.PAYMENTS_MODE);
  if (paymentsMode === 'test') {
    if (nodeEnv === 'production') throw new Error('PAYMENTS_MODE=test cannot run in production. Use live or off');
    if (!paystackSecretKey.startsWith('sk_test_')) throw new Error('PAYMENTS_MODE=test requires a Paystack test key (sk_test_…)');
  }
  if (paymentsMode === 'live') {
    if (nodeEnv !== 'production') throw new Error('PAYMENTS_MODE=live only runs in production');
    if (!paystackSecretKey.startsWith('sk_live_')) throw new Error('PAYMENTS_MODE=live requires a live Paystack key (sk_live_…)');
  }
  // One switch drives every money gate. `live` is the operator's confirmation that legal and
  // Paystack approvals are in place; `test` is sandbox-only and never confirms them.
  const moneyEnabled = paymentsMode !== 'off';
  const live = paymentsMode === 'live';
  return {
    ...env,
    NODE_ENV: nodeEnv,
    PORT: integer(env.PORT, 3000, 'PORT'),
    WEB_ORIGIN: required(env, 'WEB_ORIGIN', 'http://localhost:5177'),
    /** Every runner joins this club once (the Jump community club), so Jump can host competitions for everyone. */
    COMMUNITY_CLUB_SLUG: env.COMMUNITY_CLUB_SLUG?.trim().toLowerCase() || 'jump-community-club',
    /** The admin console (admin.startajump.com), served separately from the runner app. */
    ADMIN_ORIGIN: env.ADMIN_ORIGIN || (nodeEnv === 'production' ? 'https://admin.startajump.com' : 'http://localhost:5178'),
    DATABASE_URL: connectionUrl(databaseUrl, 'DATABASE_URL', ['postgres:', 'postgresql:']),
    REDIS_URL: connectionUrl(redisUrl, 'REDIS_URL', ['redis:', 'rediss:']),
    JWT_SECRET: jwtSecret,
    PAYMENTS_MODE: paymentsMode,
    PAID_CONTESTS_ENABLED: moneyEnabled,
    PRIZE_PAYOUTS_ENABLED: moneyEnabled,
    PAYSTACK_LIVE_ENABLED: live,
    LEGAL_APPROVAL_CONFIRMED: live,
    PAYSTACK_APPROVAL_CONFIRMED: live,
    PAYSTACK_SECRET_KEY: paystackSecretKey,
    // Salt for BVN and account-number hashes, so duplicates can be matched without storing them.
    KYC_HASH_SECRET: env.KYC_HASH_SECRET?.trim() || `kyc:${jwtSecret}`,
    // Sandbox only: verify KYC straight away instead of waiting for Paystack's identity webhook.
    KYC_SANDBOX_AUTOVERIFY: paymentsMode === 'test' && env.KYC_SANDBOX_AUTOVERIFY?.trim().toLowerCase() === 'true',
    ZEPTOMAIL_API_KEY: env.ZEPTOMAIL_API_KEY?.trim() || '',
    ZEPTOMAIL_API_URL: env.ZEPTOMAIL_API_URL?.trim() || 'https://api.zeptomail.com/v1.1/email',
    ZEPTOMAIL_FROM_ADDRESS: env.ZEPTOMAIL_FROM_ADDRESS?.trim() || '',
    ZEPTOMAIL_FROM_NAME: env.ZEPTOMAIL_FROM_NAME?.trim() || 'Jump',
    CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME?.trim() || '',
    CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY?.trim() || '',
    CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET?.trim() || '',
    // "Continue with Google" stays off until the web client id is set. All three are public OAuth client ids;
    // a Google ID token must be issued to one of them.
    GOOGLE_WEB_CLIENT_ID: env.GOOGLE_WEB_CLIENT_ID?.trim() || '',
    GOOGLE_IOS_CLIENT_ID: env.GOOGLE_IOS_CLIENT_ID?.trim() || '',
    GOOGLE_ANDROID_CLIENT_ID: env.GOOGLE_ANDROID_CLIENT_ID?.trim() || '',
    // Sign in with Apple: tokens are checked against the app's bundle id. The key (Team ID, Key ID and the
    // .p8 contents, newlines as \n) is only for revoking access when an account is deleted.
    APPLE_BUNDLE_ID: env.APPLE_BUNDLE_ID?.trim() || 'com.startajump.app',
    APPLE_TEAM_ID: env.APPLE_TEAM_ID?.trim() || '',
    APPLE_KEY_ID: env.APPLE_KEY_ID?.trim() || '',
    APPLE_PRIVATE_KEY: env.APPLE_PRIVATE_KEY?.trim() || '',
    // Strava sign-in and activity sync stay off until the client id and secret are set.
    STRAVA_CLIENT_ID: env.STRAVA_CLIENT_ID?.trim() || '',
    STRAVA_CLIENT_SECRET: env.STRAVA_CLIENT_SECRET?.trim() || '',
    STRAVA_WEBHOOK_VERIFY_TOKEN: env.STRAVA_WEBHOOK_VERIFY_TOKEN?.trim() || '',
    // e.g. https://api.startajump.com/v1/strava/webhook; with the verify token set, the API registers it on start-up.
    STRAVA_WEBHOOK_CALLBACK_URL: env.STRAVA_WEBHOOK_CALLBACK_URL?.trim() || '',
    // Off until Strava raises the app's athlete limit: hides Strava sign-in and connect for everyone new.
    STRAVA_PUBLIC: env.STRAVA_PUBLIC?.trim().toLowerCase() === 'true',
  };
}
