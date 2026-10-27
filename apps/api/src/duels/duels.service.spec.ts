import { DuelRow, DuelsRepository } from './duels.repository';
import { duelLine, DuelsService } from './duels.service';

const duel = (startsAt: string, endsAt: string): DuelRow => ({
  id: 'd1', challengerId: 'a', opponentId: 'b', activity: 'run', targetMetres: 5_000, minutes: 30, status: 'LIVE',
  challengerReadyAt: null, opponentReadyAt: null, startsAt, endsAt, expiresAt: endsAt,
});

describe('DuelsService', () => {
  const service = new DuelsService({} as DuelsRepository);
  const live = duel('2026-10-27T07:00:00Z', '2026-10-27T07:30:00Z');
  const none = { metres: 0, reachedAt: null };

  it('waits out the grace period after the clock runs out', () => {
    expect(service.dueToSettle(live, { challenger: none, opponent: none }, Date.parse('2026-10-27T07:31:00Z'))).toBe(false);
    expect(service.dueToSettle(live, { challenger: none, opponent: none }, Date.parse('2026-10-27T07:32:00Z'))).toBe(true);
  });

  it('settles early once someone has reached the target', () => {
    const reached = { metres: 5_000, reachedAt: new Date('2026-10-27T07:20:00Z') };
    expect(service.dueToSettle(live, { challenger: reached, opponent: none }, Date.parse('2026-10-27T07:21:00Z'))).toBe(false);
    expect(service.dueToSettle(live, { challenger: reached, opponent: none }, Date.parse('2026-10-27T07:22:30Z'))).toBe(true);
  });

  it('describes the duel in a line', () => {
    expect(duelLine({ activity: 'run', targetMetres: 5_000, minutes: 30 })).toBe('Run 5 km in 30 min');
    expect(duelLine({ activity: 'cycle', targetMetres: 12_500, minutes: 45 })).toBe('Ride 12.5 km in 45 min');
  });
});
