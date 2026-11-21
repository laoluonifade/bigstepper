import { formatCountdown, formatMoney } from './format';
import { activityLabel, formatScore, hasScored, headline, winsLabel } from './scoring';
import type { CompetitionTable, SeriesCadence, StandingRow, Unit } from './types';

export type CompetitionPhase = 'pending' | 'upcoming' | 'open' | 'entry-closed' | 'scoring-closed' | 'final';

export function competitionPhase(table: CompetitionTable, now = Date.now()): CompetitionPhase {
  if (table.status === 'SETTLED') return 'final';
  if (table.status === 'PENDING_APPROVAL' || table.status === 'PENDING_FUNDING') return 'pending';
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
  const starts = t(table.startsAt);
  const entryCloses = t(table.entryClosesAt);
  const scoringCloses = t(table.scoringClosesAt);
  if (scoringCloses !== null && now >= scoringCloses) return 'scoring-closed';
  if ((entryCloses !== null && now >= entryCloses) || (table.status !== 'OPEN_FOR_ENTRY' && table.status !== 'ACTIVE')) {
    return 'entry-closed';
  }
  if (starts !== null && now < starts) return 'upcoming';
  return 'open';
}

export function canEnter(table: CompetitionTable, now = Date.now()) {
  const phase = competitionPhase(table, now);
  return table.status === 'OPEN_FOR_ENTRY' && (phase === 'open' || phase === 'upcoming');
}

/** One short line describing where the competition is in its lifecycle. */
export function phaseLine(table: CompetitionTable, now = Date.now()): string {
  switch (competitionPhase(table, now)) {
    case 'pending':
      return table.status === 'PENDING_FUNDING' ? 'Prize funding needed' : 'Awaiting approval';
    case 'upcoming':
      return `Starts in ${formatCountdown(table.startsAt!, now)}`;
    case 'open':
      return table.entryClosesAt && table.entryClosesAt !== table.scoringClosesAt
        ? `Entry closes in ${formatCountdown(table.entryClosesAt, now)}`
        : table.scoringClosesAt
          ? `Ends in ${formatCountdown(table.scoringClosesAt, now)}`
          : 'Open';
    case 'entry-closed':
      return table.scoringClosesAt ? `Entry closed · ends in ${formatCountdown(table.scoringClosesAt, now)}` : 'Entry closed';
    case 'scoring-closed':
      // Free competitions are done when they close; prize ones wait for Jump to settle the result.
      return table.type === 'free' ? 'Ended' : 'Scoring closed · result pending';
    case 'final':
      return 'Final result';
  }
}

/** The one big thing about a challenge, from its real settings. */
export function challengeHeadline(table: CompetitionTable, unit: Unit): { big: string; small: string } {
  const prizePot = table.type === 'sponsored' ? (table.fundedPrizeKobo || table.guaranteedPrizeKobo) : table.guaranteedPrizeKobo;
  if (prizePot) {
    const amount = prizeSplit(prizePot, table.platformFeeBps, table.creatorCommissionBps).winnerKobo;
    if (table.fundingDestination === 'CHARITY') return { big: formatMoney(amount).replace(/\.00$/, ''), small: `for ${table.charityName ?? 'charity'} · held for verification` };
    return { big: formatMoney(amount).replace(/\.00$/, ''), small: table.prizeSplitBps?.length > 1 ? `across top ${table.prizeSplitBps.length}` : 'to the winner' };
  }
  return headline(table, unit);
}

/** How far through its window a competition is, 0–1, or null when it has no end. */
export function windowProgress(table: CompetitionTable, now: number) {
  if (!table.scoringClosesAt) return null;
  const start = new Date(table.startsAt ?? table.createdAt).getTime();
  const end = new Date(table.scoringClosesAt).getTime();
  if (end <= start) return null;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** Prize or entry in a few characters: "₦50,000", "Free", "₦1,000 entry". */
export function prizeLabel(table: CompetitionTable, unit: Unit) {
  const hero = challengeHeadline(table, unit);
  if (hero.big.startsWith('₦')) return { text: hero.big, prize: true };
  if (table.type === 'paid') return { text: `${formatMoney(table.entryFeeKobo).replace(/\.00$/, '')} entry`, prize: false };
  return { text: table.type === 'sponsored' ? 'Funded' : 'Free', prize: false };
}

/**
 * How a funded prize pot is paid out at settlement (mirrors the API's calculatePrizeBreakdown):
 * Jump's fee comes off the pot; paid creators also receive a commission from that fee.
 */
export function prizeSplit(potKobo: number, platformFeeBps: number, creatorCommissionBps: number) {
  const feeKobo = Math.floor((potKobo * platformFeeBps) / 10_000);
  const creatorKobo = Math.floor((potKobo * creatorCommissionBps) / 10_000);
  return { winnerKobo: potKobo - feeKobo, creatorKobo, jumpKobo: feeKobo - creatorKobo };
}

/* ───────────────────────── Share cards ───────────────────────── */

export type CardFormat = 'story' | 'post';

export interface CardPerson {
  userId: string;
  name: string;
  /** Already formatted: "12.4 km", "56:09", "8,120 steps". */
  score: string;
  rank: number;
}

export interface CompetitionCardData {
  title: string;
  /** "Run · Farthest distance" */
  kind: string;
  /** The one big thing: "10K", "STEPS", "STREAK". */
  big: string;
  /** Under it: "fastest time wins". */
  small: string;
  /** "₦50,000 to the winner", "Free to join". */
  stakes: string;
  entrants: number;
  /** "5 days left", "Starts in 2 days", "No end date". */
  timing: string;
  code: string;
  /** Without the scheme, e.g. "startajump.com/competitions/58D59271". */
  link: string;
  podium: CardPerson[];
  /** You, when you're in: your place and score. */
  me: (CardPerson & { scored: boolean }) | null;
  /** The activity's colour for the big word and lane. */
  accent: string;
}

/** Everything the card says, from the competition and its live board. */
export function competitionCardData(table: CompetitionTable, rows: StandingRow[], viewerId: string | undefined, unit: Unit, now: number, link: string): CompetitionCardData {
  const hero = challengeHeadline(table, unit);
  const cash = hero.big.startsWith('₦');
  const phase = competitionPhase(table, now);
  const scored = rows.filter((row) => hasScored(table.scoringMethod, row.score));
  const person = (row: StandingRow) => ({ userId: row.userId, name: row.displayName, rank: row.rank, score: formatScore(table, row.score, unit) ?? '' });
  const mine = rows.find((row) => row.userId === viewerId);
  // When the cover's headline is the prize, the card leads with how it's won instead.
  const big = cash ? (winsLabel(table, unit).match(/\d+(\.\d+)?\s?(km|mi|K)/i)?.[0]?.replace(/\s?km$/i, 'K') ?? activityLabel(table)) : hero.big;
  return {
    title: table.title,
    kind: `${activityLabel(table)} · ${winsLabel(table, unit)}`,
    big,
    small: cash ? winsLabel(table, unit) : hero.small,
    stakes: cash ? `${hero.big} ${hero.small}` : table.type === 'paid' ? 'Cash prize' : 'Free to join',
    entrants: table.entrantCount ?? rows.length,
    timing: phase === 'upcoming' && table.startsAt ? `Starts in ${formatCountdown(table.startsAt, now)}`
      : phase === 'scoring-closed' || phase === 'final' ? 'Final results'
        : table.scoringClosesAt ? `${formatCountdown(table.scoringClosesAt, now)} left` : 'No end date',
    code: table.code,
    link,
    podium: scored.slice(0, 3).map(person),
    me: mine ? { ...person(mine), scored: hasScored(table.scoringMethod, mine.score) } : null,
    accent: table.challengeType === 'WALK' || table.challengeType === 'STEP' ? '#E4FF3A' : '#FF5A1F',
  };
}

/** "Daily", "Weekly", "Monthly", "Every 90 days": how often a recurring competition starts again. */
export function cadenceLabel(cadence: SeriesCadence | null | undefined, intervalDays?: number | null) {
  if (cadence === 'daily') return 'Daily';
  if (cadence === 'monthly') return 'Monthly';
  if (cadence === 'custom') return intervalDays ? `Every ${intervalDays} days` : 'Repeating';
  return 'Weekly';
}

/** An edition's own name, without the series in front: "Weekly Step Champion · 23–29 Nov" → "23–29 Nov". */
export function editionName(title: string, seriesTitle?: string | null) {
  if (seriesTitle && title.startsWith(`${seriesTitle} · `)) return title.slice(seriesTitle.length + 3);
  const dot = title.lastIndexOf(' · ');
  return dot > 0 ? title.slice(dot + 3) : title;
}

/** Results stay open this long after the end, so late Apple Health syncs still count, then they're final. */
export const RESULTS_GRACE_HOURS = 12;

/** Ended, but the board isn't final yet: late syncs can still move it until this time. */
export function resultsPendingUntil(table: Pick<CompetitionTable, 'type' | 'scoringClosesAt' | 'resultsFinalizedAt' | 'status'>, now = Date.now()) {
  if (table.type !== 'free' || table.resultsFinalizedAt || !table.scoringClosesAt || table.status === 'CANCELLED') return null;
  const end = new Date(table.scoringClosesAt).getTime();
  if (end > now) return null;
  return new Date(end + RESULTS_GRACE_HOURS * 3_600_000);
}

/** "Your target: 42,000 steps this week, from your average of 5,000 a day." Null when it isn't a personal competition. */
export function personalTargetLine(table: Pick<CompetitionTable, 'scoringMethod' | 'personal' | 'startsAt' | 'hourFrom' | 'hourTo'>, row: Pick<StandingRow, 'personalTarget' | 'baselineSteps'> | null | undefined, now = Date.now()) {
  if (!table.personal || !table.scoringMethod.startsWith('PERSONAL_')) return null;
  if (!row?.personalTarget) {
    return table.startsAt && new Date(table.startsAt).getTime() > now
      ? 'Your own target is set from your recent steps when it starts.'
      : 'Your own target is being worked out from your recent steps. Check back in a few minutes.';
  }
  const steps = (value: number) => value.toLocaleString('en-GB');
  const window = table.hourFrom != null && table.hourTo != null ? ` between ${hourLabel(table.hourFrom)} and ${hourLabel(table.hourTo)}` : '';
  const from = row.baselineSteps == null ? ''
    : table.personal.baseline === 'last_period_total' ? `, to beat last time’s ${steps(row.baselineSteps)}`
      : table.personal.baseline === 'best_day' ? `, to beat your best day of ${steps(row.baselineSteps)}`
        : table.personal.baseline === 'window_average' ? `, from your usual ${steps(row.baselineSteps)}`
          : `, from your average of ${steps(row.baselineSteps)} a day`;
  if (table.scoringMethod === 'PERSONAL_DAYS') {
    return table.personal.ladder
      ? `Your target starts at ${steps(row.personalTarget)} steps a day and climbs ${Math.round(table.personal.ladder * 100)}% each day${from}.`
      : `Your target: ${steps(row.personalTarget)} steps a day${from}.`;
  }
  return `Your target: ${steps(row.personalTarget)} steps${window}${from}.`;
}

function hourLabel(hour: number) {
  if (hour === 0 || hour === 24) return 'midnight';
  if (hour === 12) return 'noon';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}
