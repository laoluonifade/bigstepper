import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { PushNotificationsProcessor } from './push-notifications.processor';
import { boostMessage, pickBoosts, StandingRow } from './standing-boost';

const row = (over: Partial<StandingRow>): StandingRow => ({
  userId: 'u1', tableId: 't1', code: 'ABC12345', title: 'Move with Tee', scoringMethod: 'FARTHEST_DISTANCE', challengeType: 'RUN',
  rank: 2, entrants: 5, score: 3720, aheadScore: 5210, aheadName: 'Ada Obi', behindScore: 1000, behindName: 'Tunde', ...over,
});

describe('standing boost', () => {
  it('tells a chaser, cheekily, how far behind the next runner they are', () => {
    const boost = boostMessage(row({}), '2026-10-25');
    expect(boost).toMatchObject({ userId: 'u1', link: '/competitions/ABC12345', title: 'You’re 2nd in Move with Tee' });
    expect(boost.body).toContain('1.49 km');
    expect(boost.body).toContain('Ada');
    expect(boost.body).not.toMatch(/\{\w+\}/);
  });

  it('says level, never "by 0 days", when scores are tied', () => {
    const body = boostMessage(row({ scoringMethod: 'MOST_ACTIVE_DAYS', rank: 1, score: 1, behindScore: 1, behindName: 'walebakre' }), '2026-10-25').body;
    expect(body).toMatch(/level|tied/i);
    expect(body).toContain('walebakre');
    expect(body).not.toContain('0 days');
  });

  it('tells a leader their margin, and nudges a runner yet to score', () => {
    const lead = boostMessage(row({ rank: 1, score: 5210, behindScore: 3720 }), '2026-10-25');
    expect(lead.title).toBe('You’re leading Move with Tee');
    expect(lead.body).toContain('1.49 km');
    expect(lead.body).toContain('Tunde');
    const fresh = boostMessage(row({ score: 0, challengeType: 'WALK' }), '2026-10-25');
    expect(fresh.title).toBe('Move with Tee is on');
    expect(fresh.body).not.toMatch(/\{\w+\}/);
  });

  it('keeps one line all day and changes it across days', () => {
    const days = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];
    expect(boostMessage(row({}), '2026-10-25').body).toBe(boostMessage(row({}), '2026-10-25').body);
    expect(new Set(days.map((day) => boostMessage(row({}), day).body)).size).toBeGreaterThan(1);
  });

  it('picks one competition per runner: the tightest race they are chasing', () => {
    const picked = pickBoosts([
      row({ tableId: 'far', aheadScore: 20000 }),
      row({ tableId: 'close', aheadScore: 3800 }),
      row({ tableId: 'leading', rank: 1, score: 9000, behindScore: 8900 }),
      row({ userId: 'u2', tableId: 'other' }),
    ]);
    expect(picked.map((p) => [p.userId, p.tableId])).toEqual([['u1', 'close'], ['u2', 'other']]);
  });

  it('only queues between 5pm and 9pm Lagos time, as push-only notifications', async () => {
    const query = jest.fn(async (sql: string) => (sql.includes('WITH live') ? [row({})] : []));
    const processor = new PushNotificationsProcessor({ query } as unknown as DataSource, {} as ConfigService, {} as Queue);
    expect(await processor.queueStandingBoosts(new Date('2026-10-25T08:00:00Z'))).toBe(0);
    expect(query).not.toHaveBeenCalled();
    expect(await processor.queueStandingBoosts(new Date('2026-10-25T16:30:00Z'))).toBe(1);
    const insert = query.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO "notifications"'));
    expect(String(insert?.[0])).toContain('"emailProcessedAt"');
  });
});
