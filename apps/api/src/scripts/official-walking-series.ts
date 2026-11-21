import dataSource from '../database/data-source';
import type { ChallengeTemplate } from '../tables/club-challenges';
import { DESCRIPTION_MAX, Plan, PLANS } from '../tables/official-series';

const ZONE = 'Africa/Lagos';
const DAY_MS = 86_400_000;

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
  const overlong = PLANS.filter((plan) => plan.description.length > DESCRIPTION_MAX);
  if (overlong.length) throw new Error(`Descriptions over ${DESCRIPTION_MAX} characters: ${overlong.map((plan) => plan.title).join(', ')}`);
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
