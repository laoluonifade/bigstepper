import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const production = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-secure-production-secret-that-is-long-enough',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/jump',
    REDIS_URL: 'redis://localhost:6379',
    WEB_ORIGIN: 'https://jump.example',
  };

  it('fails closed for a weak production JWT secret', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET must contain at least 32 characters in production',
    );
  });

  it('keeps every paid feature disabled by default', () => {
    const config = validateEnvironment({});
    expect(config.PAYMENTS_MODE).toBe('off');
    expect(config.PAID_CONTESTS_ENABLED).toBe(false);
    expect(config.PAYSTACK_LIVE_ENABLED).toBe(false);
    expect(config.PRIZE_PAYOUTS_ENABLED).toBe(false);
    expect(config.LEGAL_APPROVAL_CONFIRMED).toBe(false);
  });

  it('validates database and Redis URL protocols', () => {
    expect(() => validateEnvironment({ DATABASE_URL: 'mysql://localhost/app' })).toThrow(
      'DATABASE_URL must use postgres: or postgresql:',
    );
    expect(() => validateEnvironment({ REDIS_URL: 'http://localhost:6379' })).toThrow(
      'REDIS_URL must use redis: or rediss:',
    );
  });

  it('rejects unknown payment modes', () => {
    expect(() => validateEnvironment({ PAYMENTS_MODE: 'yes' })).toThrow('PAYMENTS_MODE must be off, test or live');
  });

  it('test mode needs a test key and stays out of production', () => {
    expect(() => validateEnvironment({ PAYMENTS_MODE: 'test', PAYSTACK_SECRET_KEY: 'sk_live_wrong_mode' })).toThrow(
      'PAYMENTS_MODE=test requires a Paystack test key',
    );
    expect(() => validateEnvironment({ ...production, PAYMENTS_MODE: 'test', PAYSTACK_SECRET_KEY: 'sk_test_x' })).toThrow(
      'PAYMENTS_MODE=test cannot run in production',
    );
    const config = validateEnvironment({ PAYMENTS_MODE: 'test', PAYSTACK_SECRET_KEY: 'sk_test_x' });
    expect(config.PAID_CONTESTS_ENABLED).toBe(true);
    expect(config.PAYSTACK_LIVE_ENABLED).toBe(false);
    expect(config.LEGAL_APPROVAL_CONFIRMED).toBe(false);
  });

  it('live mode needs production and a live key', () => {
    expect(() => validateEnvironment({ PAYMENTS_MODE: 'live', PAYSTACK_SECRET_KEY: 'sk_live_x' })).toThrow(
      'PAYMENTS_MODE=live only runs in production',
    );
    expect(() => validateEnvironment({ ...production, PAYMENTS_MODE: 'live', PAYSTACK_SECRET_KEY: 'sk_test_x' })).toThrow(
      'PAYMENTS_MODE=live requires a live Paystack key',
    );
    const config = validateEnvironment({ ...production, PAYMENTS_MODE: 'live', PAYSTACK_SECRET_KEY: 'sk_live_x' });
    expect(config.PAYSTACK_LIVE_ENABLED).toBe(true);
    expect(config.PRIZE_PAYOUTS_ENABLED).toBe(true);
    expect(config.PAYSTACK_APPROVAL_CONFIRMED).toBe(true);
  });
});
