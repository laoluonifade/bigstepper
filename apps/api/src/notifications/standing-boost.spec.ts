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
  it('tells a chaser how far behind the next runner they are', () => {
    expect(boostMessage(row({}))).toEqual({
      userId: 'u1', link: '/competitions/ABC12345', title: 'You’re 2nd in Move with Tee', body: '1.49 km behind Ada for 1st. One run could change that.',
    });
  });

  it('says level, never "by 0 days", when scores are tied', () => {
    expect(boostMessage(row({ scoringMethod: 'MOST_ACTIVE_DAYS', rank: 1, score: 1, behindScore: 1, behindName: 'walebakre' })).body)
      .toBe('Level with walebakre. One more run takes it.');
  });

  it('tells a leader their margin, and a runner yet to score how to get on the board', () => {
    expect(boostMessage(row({ rank: 1, score: 5210, behindScore: 3720 })).body).toBe('1.49 km ahead of Tunde. Keep the gap today.');
    expect(boostMessage(row({ score: 0, challengeType: 'WALK' })).body).toBe('Your first walk puts you on the board. 4 others are already racing.');
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
    expect(await processor.queueStandingBoosts(new Date('2026-10-25T08:00:00Z'))).toBe(0); // 9am Lagos
    expect(query).not.toHaveBeenCalled();
    expect(await processor.queueStandingBoosts(new Date('2026-10-25T16:30:00Z'))).toBe(1); // 5:30pm Lagos
    const insert = query.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO "notifications"'));
    expect(String(insert?.[0])).toContain('"emailProcessedAt"');
  });
});
