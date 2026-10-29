import { judgeActivity } from './activity-verification.processor';

const START = new Date('2026-10-25T07:00:00Z').getTime();
const samples = (ticks: number, perTick: number) =>
  Array.from({ length: ticks + 1 }, (_, index) => ({ stepCount: index * perTick, recordedAt: new Date(START + index * 5000) }));
const track = (distanceMetres: number, usableCount = 40) => ({ distanceMetres, confidence: 0.9, usableCount, reasons: new Set<string>() });

describe('judgeActivity', () => {
  it('leaves a phone shaken while standing still for an admin: no GPS movement, steps not counted', () => {
    const verdict = judgeActivity(track(0), samples(120, 12), 'walk');
    expect(verdict.status).toBe('FLAGGED');
    expect(verdict.validatedSteps).toBe(0);
    expect(verdict.reasons.has('NO_GPS_MOVEMENT')).toBe(true);
    expect(verdict.reasons.has('STEPS_WITHOUT_MOVEMENT')).toBe(true);
  });

  it('verifies a real walk and keeps its steps', () => {
    const verdict = judgeActivity(track(1000), samples(144, 10), 'walk');
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.validatedSteps).toBe(1440);
  });

  it('caps a short walk padded with thousands of shaken steps, without flagging the real walk', () => {
    const verdict = judgeActivity(track(150), samples(120, 12), 'walk');
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.reasons.has('STEPS_WITHOUT_MOVEMENT')).toBe(true);
    expect(verdict.validatedSteps).toBe(Math.ceil(150 / 0.45));
  });

  it('does not flag steps the phone held back while the screen was locked', () => {
    const held = [
      ...Array.from({ length: 61 }, (_, i) => ({ stepCount: 200, recordedAt: new Date(START + i * 5000) })),
      { stepCount: 800, recordedAt: new Date(START + 301_000) },
    ];
    const verdict = judgeActivity(track(450), [{ stepCount: 0, recordedAt: new Date(START - 120_000) }, ...held], 'walk');
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.reasons.has('IMPLAUSIBLE_STEP_RATE')).toBe(false);
    expect(verdict.validatedSteps).toBe(800);
  });

  it('carries on after the step counter restarts (pause, app restart)', () => {
    const before = samples(30, 10);
    const after = samples(30, 10).map((sample) => ({ ...sample, recordedAt: new Date(sample.recordedAt.getTime() + 160_000) }));
    const verdict = judgeActivity(track(800), [...before, ...after], 'walk');
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.reasons.has('NON_MONOTONIC_STEPS')).toBe(false);
    expect(verdict.validatedSteps).toBe(600);
  });

  it('caps steps a little over what the route allows without flagging', () => {
    const verdict = judgeActivity(track(100), samples(30, 10), 'walk');
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.validatedSteps).toBe(Math.ceil(100 / 0.45));
  });

  it('only flags what a person should look at, never everyday GPS noise', () => {
    const noisy = { ...track(3000), reasons: new Set(['GPS_GAP', 'LOW_GPS_ACCURACY', 'IMPLAUSIBLE_SPEED']) };
    expect(judgeActivity(noisy, samples(60, 10), 'walk').status).toBe('VERIFIED');
    expect(judgeActivity(track(0), samples(10, 1), 'run').status).toBe('FLAGGED');
  });

  it('never counts steps on a ride', () => {
    const verdict = judgeActivity(track(8000), samples(60, 5), 'cycle');
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.validatedSteps).toBe(0);
  });

  it('verifies any distance GPS measured, never flagging it: weak GPS, a car-fast stretch or a short one', () => {
    const weak = { distanceMetres: 940, confidence: 0.2, usableCount: 30, reasons: new Set(['LOW_GPS_ACCURACY', 'IMPLAUSIBLE_SPEED']) };
    expect(judgeActivity(weak, [], 'cycle').status).toBe('VERIFIED');
    expect(judgeActivity(track(40), samples(10, 1), 'run').status).toBe('VERIFIED');
  });
});
