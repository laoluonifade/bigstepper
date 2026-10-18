import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('fails closed for a weak production JWT secret', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET must contain at least 32 characters in production',
    );
  });

  it('keeps every paid feature disabled by default', () => {
    const config = validateEnvironment({});
    expect(config.PAID_CONTESTS_ENABLED).toBe(false);
    expect(config.PAYSTACK_LIVE_ENABLED).toBe(false);
    expect(config.PRIZE_PAYOUTS_ENABLED).toBe(false);
    expect(config.VARIABLE_PRIZE_POOLS_ENABLED).toBe(false);
  });

  it('validates database and Redis URL protocols', () => {
    expect(() => validateEnvironment({ DATABASE_URL: 'mysql://localhost/app' })).toThrow(
      'DATABASE_URL must use postgres: or postgresql:',
    );
    expect(() => validateEnvironment({ REDIS_URL: 'http://localhost:6379' })).toThrow(
      'REDIS_URL must use redis: or rediss:',
    );
  });

  it('rejects live Paystack mode outside production', () => {
    expect(() => validateEnvironment({ PAYSTACK_LIVE_ENABLED: 'true' })).toThrow(
      'PAYSTACK_LIVE_ENABLED can only be true in production',
    );
  });

  it('requires a test key when non-production payments are enabled', () => {
    expect(() => validateEnvironment({ PAID_CONTESTS_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_live_wrong_mode' })).toThrow(
      'Non-production financial features require a Paystack test key',
    );
  });

  it('requires explicit live mode and a live key for production payments', () => {
    const base = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a-secure-production-secret-that-is-long-enough',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/jump',
      REDIS_URL: 'redis://localhost:6379',
      WEB_ORIGIN: 'https://jump.example',
      PAID_CONTESTS_ENABLED: 'true',
      LEGAL_APPROVAL_CONFIRMED: 'true',
      PAYSTACK_APPROVAL_CONFIRMED: 'true',
    };
    expect(() => validateEnvironment({ ...base, PAYSTACK_SECRET_KEY: 'sk_test_wrong_mode' })).toThrow(
      'Production financial features require PAYSTACK_LIVE_ENABLED=true and a live Paystack key',
    );
  });
});
