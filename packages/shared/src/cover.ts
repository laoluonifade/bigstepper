import type { CompetitionTable } from './types';

export type Covered = Pick<CompetitionTable, 'challengeType' | 'scoringMethod' | 'code'> & Partial<Pick<CompetitionTable, 'seriesId' | 'hourFrom' | 'hourTo'>>;
export type CoverPattern = 'rings' | 'clock' | 'days' | 'steps' | 'lanes';

/** Deep gradients for competition covers, all dark enough for white type. */
const COVERS = [
  { from: '#FF5A1F', to: '#4A0B00', glow: '#FFB08A', accent: '#FFD9C7' },
  { from: '#6B3BFF', to: '#12052F', glow: '#B6A0FF', accent: '#E4FF3A' },
  { from: '#00A99D', to: '#032A31', glow: '#7CF5E6', accent: '#E4FF3A' },
  { from: '#FF2E7E', to: '#36041D', glow: '#FF9CC4', accent: '#FFE1EC' },
  { from: '#2F6BFF', to: '#061536', glow: '#9CC0FF', accent: '#E4FF3A' },
  { from: '#455800', to: '#0A0D00', glow: '#E4FF3A', accent: '#E4FF3A' },
];

const DAY_METHODS = ['TARGET_DAYS', 'MOST_ACTIVE_DAYS', 'LONGEST_STREAK', 'DAILY_CONSISTENCY', 'WEEKLY_CONSISTENCY', 'PERSONAL_DAYS'];
const STEP_METHODS = ['MOST_STEPS', 'FIRST_TO_STEPS', 'MOST_STEPS_ONE_DAY', 'AVERAGE_DAILY_STEPS'];

const seedOf = (table: Covered) => [...(table.seriesId ?? table.code)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);

/** A competition's cover colours. Every edition of a series shares one, so a series is recognisable at a glance. */
export function coverTheme(table: Covered) {
  return { ...COVERS[seedOf(table) % COVERS.length], text: '#FFFFFF' };
}

/** What the cover's pattern shows: how the competition is won. */
export function coverPattern(table: Covered): CoverPattern {
  if (table.hourFrom != null && table.hourTo != null) return 'clock';
  if (table.scoringMethod === 'PERSONAL_TARGET') return 'rings';
  if (DAY_METHODS.includes(table.scoringMethod)) return 'days';
  if (STEP_METHODS.includes(table.scoringMethod)) return 'steps';
  return 'lanes';
}

export const COVER_CLOCK = { cx: 290, cy: 95, r: 95 };
export const COVER_RINGS = { cx: 330, cy: 140, radii: [28, 56, 84, 112, 140, 168] };

/** A point on the cover clock, for an hour of the day (0 at the top, clockwise). */
export function clockPoint(hour: number, r: number) {
  const angle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
  return { x: COVER_CLOCK.cx + r * Math.cos(angle), y: COVER_CLOCK.cy + r * Math.sin(angle) };
}

/**
 * Everything a cover draws, in a 400×200 box anchored bottom-right (xMaxYMax slice): the glow and the
 * pieces of each pattern. Both apps render it, and animate it on the competition page.
 */
export function coverArt(table: Covered) {
  const seed = seedOf(table);
  const at = (hour: number, r: number) => { const p = clockPoint(hour, r); return `${p.x} ${p.y}`; };
  const from = table.hourFrom ?? 0;
  const to = table.hourTo ?? 0;
  return {
    theme: coverTheme(table),
    pattern: coverPattern(table),
    glow: { cx: 300 + (seed % 60), cy: 10 + (seed % 40), r: 170 },
    ticks: Array.from({ length: 24 }, (_, hour) => `M${at(hour, hour % 6 ? 87 : 79)}L${at(hour, COVER_CLOCK.r)}`),
    arc: `M${at(from, COVER_CLOCK.r)}A${COVER_CLOCK.r} ${COVER_CLOCK.r} 0 ${to - from > 12 ? 1 : 0} 1 ${at(to, COVER_CLOCK.r)}`,
    days: Array.from({ length: 7 }, (_, day) => {
      const height = 30 + ((seed >> day) % 5) * 14;
      return { x: 214 + day * 24, y: 200 - height, width: 14, height: height + 12, hit: (seed >> (day + 3)) % 3 !== 0 };
    }),
    steps: Array.from({ length: 10 }, (_, step) => ({ x: 30 + step * 40, y: 196 - step * 19 + (step % 2 ? -9 : 9), opacity: 0.06 + step * 0.016 })),
    lanes: [0, 1, 2, 3, 4, 5].map((lane) => `M-20 ${200 - lane * 26}C120 ${180 - lane * 30} 240 ${120 - lane * 22} 420 ${60 - lane * 18}`),
  };
}

/** 0–1: how lit a piece at `place` (0–1 along the pattern) is as a wave passes at `t` (0–1). */
export function coverWave(t: number, place: number) {
  'worklet';
  const distance = Math.abs(t - place);
  return Math.max(0, 1 - Math.min(distance, 1 - distance) * 6);
}
