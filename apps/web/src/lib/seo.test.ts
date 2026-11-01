import { describe, it, expect } from 'vitest';
import { isSeoPath } from '@jump/shared/seo';
import { organicSource } from './organic';
describe('public metadata routing', () => {
  it.each([
    '/',
    '/business',
    '/events',
    '/events/public-event',
    '/clubs/public-club',
    '/competitions/ABCD1234',
    '/running-clubs/in/lagos',
  ])('recognizes public path %s', (path) => expect(isSeoPath(path)).toBe(true));
  it.each([
    '/login',
    '/register',
    '/settings/profile',
    '/passes/private-token',
    '/payments/return',
    '/clubs/example/dashboard',
    '/events/example/guests',
    '/runners/private-name',
    '/competitions/new',
  ])('excludes sensitive path %s', (path) =>
    expect(isSeoPath(path)).toBe(false),
  );
  it('tracks only search engine referrer categories without query strings', () => {
    expect(organicSource('https://www.google.com/search?q=private')).toBe(
      'google',
    );
    expect(organicSource('https://www.bing.com/search?q=private')).toBe('bing');
    expect(organicSource('https://bing.com.evil.test')).toBeNull();
    expect(organicSource('')).toBeNull();
  });
});
