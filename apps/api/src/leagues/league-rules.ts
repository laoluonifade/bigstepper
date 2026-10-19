/** Share of each division that moves up / down when a season ends. */
export const PROMOTE_SHARE = 0.2;
export const RELEGATE_SHARE = 0.2;

export type SeasonOutcome = 'PROMOTED' | 'RELEGATED' | 'STAYED';

export interface StandingInput {
  membershipId: string;
  divisionLevel: number;
  creditedDistanceMetres: number;
}

export interface StandingResult {
  membershipId: string;
  finalRank: number;
  outcome: SeasonOutcome;
  nextLevel: number;
}

/**
 * End-of-season movement, decided per division:
 * - the top 20% (rounded up) move up, if they logged any verified distance;
 * - the bottom 20% (rounded down) move down, and so does anyone with no verified distance;
 * - nobody moves above the top division or below the bottom one.
 * Ties on distance keep the input order, so callers pass rows sorted by distance, then by a stable key.
 */
export function decideOutcomes(rows: StandingInput[], minLevel: number, maxLevel: number): StandingResult[] {
  const byLevel = new Map<number, StandingInput[]>();
  for (const row of rows) byLevel.set(row.divisionLevel, [...(byLevel.get(row.divisionLevel) ?? []), row]);

  const results: StandingResult[] = [];
  for (const [level, division] of byLevel) {
    const ranked = [...division].sort((a, b) => b.creditedDistanceMetres - a.creditedDistanceMetres);
    const size = ranked.length;
    const promoteCount = Math.ceil(size * PROMOTE_SHARE);
    const relegateCount = Math.floor(size * RELEGATE_SHARE);
    ranked.forEach((row, index) => {
      const rank = index + 1;
      let outcome: SeasonOutcome = 'STAYED';
      if (level < maxLevel && row.creditedDistanceMetres > 0 && rank <= promoteCount) outcome = 'PROMOTED';
      else if (level > minLevel && (row.creditedDistanceMetres === 0 || rank > size - relegateCount)) outcome = 'RELEGATED';
      results.push({
        membershipId: row.membershipId,
        finalRank: rank,
        outcome,
        nextLevel: outcome === 'PROMOTED' ? level + 1 : outcome === 'RELEGATED' ? level - 1 : level,
      });
    });
  }
  return results;
}
