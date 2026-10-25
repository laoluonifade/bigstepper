import { judgeActivity } from './activity-verification.processor';

const START = new Date('2026-10-25T07:00:00Z').getTime();
/** Step totals every 5 s, rising by `perTick` each time. */
const samples = (ticks: number, perTick: number) =>
  Array.from({ length: ticks + 1 }, (_, index) => ({ stepCount: index * perTick, recordedAt: new Date(START + index * 5000) }));
const track = (distanceMetres: number, usableCount = 40) => ({ distanceMetres, confidence: 0.9, usableCount, reasons: new Set<string>() });

describe('judgeActivity', () => {
  it('flags a phone shaken while standing still: steps at a human rate, no GPS movement', () => {
    // 10 minutes at 2.5 steps/s, the pace a shaken phone reports.
    const verdict = judgeActivity(track(0), samples(120, 12), 'walk');
    expect(verdict.status).toBe('FLAGGED');
    expect(verdict.validatedSteps).toBe(0);
    expect(verdict.reasons.has('NO_GPS_MOVEMENT')).toBe(true);
    expect(verdict.reasons.has('STEPS_WITHOUT_MOVEMENT')).toBe(true);
  });

  it('verifies a real walk and keeps its steps', () => {
    // 1 km in 12 minutes, about 1,400 steps.
    const verdict = judgeActivity(track(1000), samples(144, 10), 'walk');
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.validatedSteps).toBe(1440);
  });

  it('flags a short walk padded with thousands of shaken steps', () => {
    const verdict = judgeActivity(track(50), samples(120, 12), 'walk');
    expect(verdict.status).toBe('FLAGGED');
    expect(verdict.reasons.has('STEPS_WITHOUT_MOVEMENT')).toBe(true);
    expect(verdict.validatedSteps).toBe(Math.ceil(50 / 0.45));
  });

  it('caps steps a little over what the route allows without flagging', () => {
    // GPS under-measures a twisty 100 m; 300 steps is within the allowance.
    const verdict = judgeActivity(track(100), samples(30, 10), 'walk');
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.validatedSteps).toBe(Math.ceil(100 / 0.45));
  });

  it('never counts steps on a ride', () => {
    const verdict = judgeActivity(track(8000), samples(60, 5), 'cycle');
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.validatedSteps).toBe(0);
  });
});
