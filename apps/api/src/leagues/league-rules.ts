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
