import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPedometer } from './pedometer';

type Listener = (event: unknown) => void;

/** Feeds 60 Hz synthetic accelerometer data through the real step counter. */
function simulate(seconds: number, signal: (t: number) => number) {
  const listeners: Listener[] = [];
  vi.stubGlobal('window', {
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: () => undefined,
  });
  let seed = 1;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5;
  let steps = 0;
  const pedometer = startPedometer((added) => (steps += added));
  for (let i = 0; i < seconds * 60; i += 1) {
    const t = i / 60;
    const z = 9.81 + signal(t) + rand() * 0.4;
    for (const fn of listeners) fn({ timeStamp: t * 1000, accelerationIncludingGravity: { x: rand() * 0.3, y: rand() * 0.3, z } });
  }
  pedometer.stop();
  return steps;
}

const footfalls = (rate: number, strength: number) => (t: number) => strength * Math.max(0, Math.sin(2 * Math.PI * rate * t)) ** 2 - strength / 3;

describe('startPedometer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('counts a normal walk (1.8 steps/s)', () => {
    expect(simulate(60, footfalls(1.8, 4))).toBeGreaterThanOrEqual(100);
    expect(simulate(60, footfalls(1.8, 4))).toBeLessThanOrEqual(110);
  });

  it('counts a run (2.8 steps/s)', () => {
    const steps = simulate(60, footfalls(2.8, 6));
    expect(steps).toBeGreaterThanOrEqual(158);
    expect(steps).toBeLessThanOrEqual(170);
  });

  it('counts nothing for a phone lying still', () => {
    expect(simulate(60, () => 0)).toBe(0);
  });

  it('counts nothing for slow sway (phone in a pocket while sitting)', () => {
    expect(simulate(60, (t) => 0.4 * Math.sin(2 * Math.PI * 0.3 * t))).toBe(0);
  });

  it('never counts faster than 4 steps a second, whatever the input', () => {
    expect(simulate(60, (t) => 6 * Math.sin(2 * Math.PI * 8 * t))).toBeLessThanOrEqual(240);
  });
});
