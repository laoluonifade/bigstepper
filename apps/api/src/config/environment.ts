type Environment = Record<string, string | undefined>;

function integer(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function boolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (value !== 'true' && value !== 'false') {
    throw new Error(`Expected a boolean value but received "${value}"`);
  }
  return value === 'true';
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
  const paidContestsEnabled = boolean(env.PAID_CONTESTS_ENABLED);
  const prizePayoutsEnabled = boolean(env.PRIZE_PAYOUTS_ENABLED);
  const paystackLiveEnabled = boolean(env.PAYSTACK_LIVE_ENABLED);
  const paystackSecretKey = env.PAYSTACK_SECRET_KEY?.trim() || '';
  if ((paidContestsEnabled || prizePayoutsEnabled) && !paystackSecretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is required when financial features are enabled');
  }
  if (
    nodeEnv === 'production' &&
    (paidContestsEnabled || prizePayoutsEnabled) &&
    (!boolean(env.LEGAL_APPROVAL_CONFIRMED) || !boolean(env.PAYSTACK_APPROVAL_CONFIRMED))
  ) {
    throw new Error('Production financial features require legal and Paystack approval confirmations');
  }
  if (nodeEnv === 'production' && (paidContestsEnabled || prizePayoutsEnabled)) {
    if (!paystackLiveEnabled || !paystackSecretKey.startsWith('sk_live_')) {
      throw new Error('Production financial features require PAYSTACK_LIVE_ENABLED=true and a live Paystack key');
    }
  }
  if (nodeEnv !== 'production' && paystackLiveEnabled) {
    throw new Error('PAYSTACK_LIVE_ENABLED can only be true in production');
  }
  if (nodeEnv !== 'production' && (paidContestsEnabled || prizePayoutsEnabled) && !paystackSecretKey.startsWith('sk_test_')) {
    throw new Error('Non-production financial features require a Paystack test key');
  }
  return {
    ...env,
    NODE_ENV: nodeEnv,
    PORT: integer(env.PORT, 3000, 'PORT'),
    WEB_ORIGIN: required(env, 'WEB_ORIGIN', 'http://localhost:5173'),
    DATABASE_URL: connectionUrl(databaseUrl, 'DATABASE_URL', ['postgres:', 'postgresql:']),
    REDIS_URL: connectionUrl(redisUrl, 'REDIS_URL', ['redis:', 'rediss:']),
    JWT_SECRET: jwtSecret,
    PAID_CONTESTS_ENABLED: paidContestsEnabled,
    PAYSTACK_LIVE_ENABLED: paystackLiveEnabled,
    PRIZE_PAYOUTS_ENABLED: prizePayoutsEnabled,
    VARIABLE_PRIZE_POOLS_ENABLED: boolean(env.VARIABLE_PRIZE_POOLS_ENABLED),
    PAYSTACK_SECRET_KEY: paystackSecretKey,
    LEGAL_APPROVAL_CONFIRMED: boolean(env.LEGAL_APPROVAL_CONFIRMED),
    PAYSTACK_APPROVAL_CONFIRMED: boolean(env.PAYSTACK_APPROVAL_CONFIRMED),
  };
}
