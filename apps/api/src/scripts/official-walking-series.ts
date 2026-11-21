import dataSource from '../database/data-source';
import type { ChallengeTemplate, SeriesCadence } from '../tables/club-challenges';
import type { ScoringMethod } from '../tables/competition-rules';
import type { PersonalRule } from '../tables/personal-targets';

const ZONE = 'Africa/Lagos';
const DAY_MS = 86_400_000;

type Plan = {
  title: string;
  description: string;
  cadence: SeriesCadence;
  intervalDays?: number;
  fillsPeriod: boolean;
  durationDays?: number;
  start: 'today' | 'monday' | 'weekend' | 'month';
  leadDays: number;
  scoringMethod: ScoringMethod;
  targetSteps?: number;
  dailyTarget?: number;
  medalRule: 'podium' | 'completion';
  hourFrom?: number;
  hourTo?: number;
  personal?: PersonalRule;
};

const HEALTH = 'Steps come from Apple Health, so keep it connected and open Jump now and then so your steps sync.';
const MEDALS = 'Gold, silver and bronze for the top three.';
const DONE = 'Everyone who makes it gets a completion medal on their profile.';
const AGAIN = 'You’re entered into the next one automatically. Leave whenever you like.';
const YOURS = 'Your target is set from your own recent Apple Health steps when it starts, so it’s as hard for a beginner as for a regular. New to Jump? You start from 4,000 a day.';

const PLANS: Plan[] = [
  { title: 'The 10K Club', description: `Reach 10,000 steps in a day. ${DONE} A new day starts every midnight. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'TARGET_DAYS', dailyTarget: 10_000, medalRule: 'completion' },
  { title: 'Last Step Standing', description: `Most steps in a day wins. ${MEDALS} A new day starts every midnight. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'MOST_STEPS', medalRule: 'podium' },
  { title: 'Just 5K', description: `Reach 5,000 steps in a day. ${DONE} A new day starts every midnight. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'TARGET_DAYS', dailyTarget: 5_000, medalRule: 'completion' },
  { title: 'The 15K Challenge', description: `Reach 15,000 steps in a day. ${DONE} A new day starts every midnight. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'TARGET_DAYS', dailyTarget: 15_000, medalRule: 'completion' },
  { title: 'The Midnight Race', description: `Most steps between 6 PM and midnight wins. ${MEDALS} Only steps in that window count, hour by hour from Apple Health. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'MOST_STEPS', medalRule: 'podium', hourFrom: 18, hourTo: 24 },
  { title: 'Early Birds', description: `Most steps between 5 AM and 9 AM wins. ${MEDALS} Only steps in that window count, hour by hour from Apple Health. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'MOST_STEPS', medalRule: 'podium', hourFrom: 5, hourTo: 9 },
  { title: 'The 50K Club', description: `Walk 50,000 steps between Monday and Sunday. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'FIRST_TO_STEPS', targetSteps: 50_000, medalRule: 'completion' },
  { title: 'The 100K Club', description: `Walk 100,000 steps between Monday and Sunday. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'FIRST_TO_STEPS', targetSteps: 100_000, medalRule: 'completion' },
  { title: 'No Zero Days', description: `At least 3,000 steps every day, Monday to Sunday. Miss a day and the medal’s gone for the week. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'TARGET_DAYS', dailyTarget: 3_000, medalRule: 'completion' },
  { title: 'Walk Every Day', description: `7,000 steps every day, Monday to Sunday. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'TARGET_DAYS', dailyTarget: 7_000, medalRule: 'completion' },
  { title: 'The Weekend Warriors', description: `Most steps across Saturday and Sunday wins. ${MEDALS} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: false, durationDays: 2, start: 'weekend', leadDays: 2, scoringMethod: 'MOST_STEPS', medalRule: 'podium' },
  { title: 'The Weekly Step Champion', description: `Most steps from Monday to Sunday wins. ${MEDALS} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'MOST_STEPS', medalRule: 'podium' },
  { title: 'The 200K Club', description: `Walk 200,000 steps in the month. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'FIRST_TO_STEPS', targetSteps: 200_000, medalRule: 'completion' },
  { title: 'Walk to a Million', description: `A million steps in 90 days. About 11,000 a day. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'custom', intervalDays: 90, fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'FIRST_TO_STEPS', targetSteps: 1_000_000, medalRule: 'completion' },
  { title: 'The 30-Day Streak', description: `5,000 steps every single day of the month. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'TARGET_DAYS', dailyTarget: 5_000, medalRule: 'completion' },
  { title: 'The 300K Challenge', description: `Walk 300,000 steps in the month. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'FIRST_TO_STEPS', targetSteps: 300_000, medalRule: 'completion' },
  { title: 'Beat Yourself', description: `Walk 20% more than your daily average from the week before. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 1.2, perDay: true } },
  { title: 'The Comeback Kid', description: `Beat last week’s step total. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'last_period_total', factor: 1, add: 1 } },
  { title: 'The Perfect Week', description: `Hit your own daily target all seven days, Monday to Sunday. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_DAYS', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 1, min: 2000 } },
  { title: 'The 2K Sprint', description: `A short daily target sized to you, from 2,000 steps up. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 0.3, min: 2000, max: 5000 } },
  { title: 'The 5K Sprint', description: `A bigger daily milestone sized to you, from 5,000 steps up. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 0.6, min: 5000, max: 12000 } },
  { title: 'Lunch Break Legs', description: `Beat your usual steps between 12 and 2 PM. Your target is your average for that window over the last week. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', hourFrom: 12, hourTo: 14, personal: { baseline: 'window_average', factor: 1, add: 1, min: 200 } },
  { title: 'After Work Walkers', description: `Beat your usual steps between 5 and 8 PM. Your target is your average for that window over the last week. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', hourFrom: 17, hourTo: 20, personal: { baseline: 'window_average', factor: 1, add: 1, min: 300 } },
  { title: 'Double Up', description: `Walk twice your normal day (one and a half times if you already average 10,000+). ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 2, highActive: { above: 10_000, factor: 1.5 } } },
  { title: 'The Consistency Cup', description: `A point for every day you hit your own daily target, Monday to Sunday. Most points wins. ${YOURS} ${MEDALS} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_DAYS', medalRule: 'podium', personal: { baseline: 'daily_average', factor: 1, min: 2000 } },
  { title: 'The 3-Day Streak', description: `Hit a daily target 10% above your average three days running. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'custom', intervalDays: 3, fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_DAYS', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 1.1, min: 2000 } },
  { title: 'The Big Step Day', description: `Beat your best day of the last 30. An ambitious one. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'best_day', factor: 1, add: 1, min: 8000 } },
  { title: 'The Step Ladder', description: `Seven daily targets that climb 5% a day, starting just under your average. Hit all seven. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_DAYS', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 0.9, ladder: 0.05, min: 2000 } },
  { title: 'The 1% Better Challenge', description: `Average at least 1% more steps a day this month than in the week before it started. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 1.01, perDay: true } },
  { title: 'The Monthly Step King', description: `Most steps in the calendar month wins. ${MEDALS} ${AGAIN} ${HEALTH}`, cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'MOST_STEPS', medalRule: 'podium' },
];

function lagosMidnight(offsetDays: number, from = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(from);
  return new Date(Date.parse(`${day}T00:00:00+01:00`) + offsetDays * DAY_MS);
}

function firstStart(start: Plan['start']) {
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, weekday: 'short' }).format(new Date()));
  if (start === 'today') return lagosMidnight(0);
  if (start === 'monday') return lagosMidnight(((8 - weekday) % 7) || 7);
  if (start === 'weekend') return weekday === 6 ? lagosMidnight(0) : weekday === 0 ? lagosMidnight(-1) : lagosMidnight(6 - weekday);
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  return new Date(Date.parse(`${next}-01T00:00:00+01:00`));
}

function template(plan: Plan): ChallengeTemplate {
  const durationMs = (plan.durationDays ?? (plan.cadence === 'daily' ? 1 : plan.cadence === 'weekly' ? 7 : plan.intervalDays ?? 30)) * DAY_MS;
  return {
    title: plan.title, description: plan.description, venue: null, address: null, latitude: null, longitude: null,
    type: 'free', challengeType: 'STEP', scoringMethod: plan.scoringMethod,
    targetDistanceMetres: null, targetSteps: plan.targetSteps ?? null, targetSeconds: null, targetSessions: null, dailyTarget: plan.dailyTarget ?? null,
    minSessions: null, minActivityMetres: null, minActivitySeconds: null, eligibleActivities: ['run', 'walk'], format: 'open', timeZone: ZONE, rulesVersion: 2,
    reminderTime: null, reminderTimeZone: null, capacity: null, distanceCapMetres: null, visibility: 'public', eligibleCountries: [],
    platformFeeBps: 0, creatorCommissionBps: 0, prizeSplitBps: [10000], minimumEntrants: 1, fundingDestination: 'WINNERS',
    prizeDeliveryCountries: [], prizeFulfilment: null, prizeShipping: null, prizeShippingNote: null, prizeEligibilityNote: null, prizeClaimDays: 14, prizeSelection: 'top',
    autoEnrolClub: false, enrolAudience: 'all', medalRule: plan.medalRule, hourFrom: plan.hourFrom ?? null, hourTo: plan.hourTo ?? null, personal: plan.personal ?? null,
    durationMs, entryOffsetMs: durationMs, prizes: [],
  };
}

async function main() {
  const slug = process.env.COMMUNITY_CLUB_SLUG ?? 'jump-community-club';
  const announce = process.argv.includes('--announce');
  const dryRun = process.argv.includes('--dry-run');
  await dataSource.initialize();
  try {
    const [club] = await dataSource.query(`SELECT "id", "name", "slug" FROM "clubs" WHERE "slug" = $1`, [slug]) as Array<{ id: string; name: string; slug: string }>;
    if (!club) throw new Error(`No club with the slug ${slug}`);
    const existing = new Set((await dataSource.query(`SELECT "title" FROM "challenge_series" WHERE "clubId" = $1`, [club.id]) as Array<{ title: string }>).map((row) => row.title));
    const added: Array<{ title: string; cadence: string; firstStart: string }> = [];
    await dataSource.transaction(async (manager) => {
      for (const plan of PLANS) {
        if (existing.has(plan.title)) continue;
        const startsAt = firstStart(plan.start);
        added.push({ title: plan.title, cadence: plan.cadence, firstStart: startsAt.toISOString() });
        if (dryRun) continue;
        await manager.query(
          `INSERT INTO "challenge_series" ("clubId","title","cadence","intervalDays","template","autoPublish","leadDays","nextStartsAt","lastEdition","fillsPeriod","carryOver","hostJoins")
           VALUES ($1,$2,$3,$4,$5,true,$6,$7,0,$8,true,false)`,
          [club.id, plan.title, plan.cadence, plan.intervalDays ?? null, JSON.stringify(template(plan)), plan.leadDays, startsAt, plan.fillsPeriod],
        );
      }
      if (announce && added.length && !dryRun) {
        await manager.query(
          `INSERT INTO "notifications" ("userId","type","title","body","link")
           SELECT u."id", 'CLUB_CHALLENGE', $1, $2, $3 FROM "users" u WHERE u."deletedAt" IS NULL`,
          [`${club.name}: ${added.length} walking competitions are live`,
            'Daily, weekly and monthly. Win gold, silver and bronze, or earn a medal for hitting the target. Join one and you’re in every edition.',
            `/clubs/${club.slug}`],
        );
      }
    });
    console.table(added);
    console.log(dryRun ? `Dry run: ${added.length} series would be added to ${club.name}.`
      : `Added ${added.length} series to ${club.name}. Their first editions open within 5 minutes of their start (or lead) time.`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
