import { describe, it, expect } from 'vitest';
import { productScreen } from '@jump/shared/product-analytics';
describe('safe product screen labels', () => {
  it.each([
    ['/dashboard', 'home'],
    ['/events/public-run', 'event_detail'],
    ['/clubs/runners', 'club_detail'],
    ['/competitions/ABC12345', 'competition_detail'],
    ['/activities', 'activity'],
    ['/learn/phone-walking-competitions', 'guides'],
  ])('classifies %s without sending the identifier', (path, screen) =>
    expect(productScreen(path)).toBe(screen),
  );
  it.each([
    '/messages/private-person',
    '/passes/private-token',
    '/payments/return',
    '/settings/profile',
    '/auth/strava',
    '/events/edit',
    '/events/guests',
    '/events/scan',
    '/competitions/new',
    '/clubs/secret/chat',
    '/activities/private-id',
    '/events/run?email=private',
    '/events/run#token',
  ])('excludes sensitive or administrative path %s', (path) =>
    expect(productScreen(path)).toBeNull(),
  );
});
