import { EntityManager } from 'typeorm';
import type { EntrantScore, ScoredActivity } from './scoring-engine';

export interface PersonalRule {
  baseline: 'daily_average' | 'last_period_total' | 'best_day' | 'window_average';
  factor: number;
  add?: number;
  min?: number;
  max?: number;
  perDay?: boolean;
  ladder?: number;
  highActive?: { above: number; factor: number };
}

export const BEGINNER_DAILY_STEPS = 4000;
const MIN_HISTORY_DAYS = 4;
const MIN_WINDOW_DAYS = 3;
const WINDOW_STEPS_PER_HOUR = 250;
const DAY_MS = 86_400_000;

export function defaultBaseline(rule: PersonalRule, windowDays: number, hours = 0) {
  switch (rule.baseline) {
    case 'daily_average': return BEGINNER_DAILY_STEPS;
    case 'last_period_total': return BEGINNER_DAILY_STEPS * windowDays;
    case 'best_day': return BEGINNER_DAILY_STEPS * 2;
    case 'window_average': return Math.max(1, hours) * WINDOW_STEPS_PER_HOUR;
  }
}

export function targetFor(rule: PersonalRule, baseline: number, windowDays: number) {
  const factor = rule.highActive && baseline >= rule.highActive.above ? rule.highActive.factor : rule.factor;
  let daily = baseline * factor + (rule.add ?? 0);
  if (rule.min !== undefined) daily = Math.max(rule.min, daily);
  if (rule.max !== undefined) daily = Math.min(rule.max, daily);
  const rounded = Math.max(1, Math.ceil(daily / 10) * 10);
  return rule.perDay ? rounded * windowDays : rounded;
}

export async function assignPersonalTargets(manager: EntityManager, tableId: string) {
  const [table] = await manager.query(
    `SELECT t."personal", t."timeZone", t."hourFrom", t."hourTo",
            to_char((t."startsAt" AT TIME ZONE t."timeZone")::date, 'YYYY-MM-DD') AS "startDay",
            ((t."scoringClosesAt" - interval '1 millisecond') AT TIME ZONE t."timeZone")::date - (t."startsAt" AT TIME ZONE t."timeZone")::date + 1 AS "windowDays"
     FROM "competition_tables" t
     WHERE t."id" = $1 AND t."personal" IS NOT NULL AND t."startsAt" <= now() AND t."scoringClosesAt" IS NOT NULL AND t."resultsFinalizedAt" IS NULL`,
    [tableId],
  ) as Array<{ personal: PersonalRule; timeZone: string; hourFrom: number | null; hourTo: number | null; startDay: string; windowDays: number }>;
  if (!table) return 0;
  const rule = table.personal;
  const lookBack = rule.baseline === 'best_day' ? 30 : rule.baseline === 'last_period_total' ? table.windowDays : 7;
  const history = rule.baseline === 'window_average'
    ? await manager.query(
      `SELECT r."id", count(DISTINCT x.day)::integer AS "days", COALESCE(sum(x.steps), 0)::integer AS "total", COALESCE(max(x.steps), 0)::integer AS "best"
       FROM "table_registrations" r
       LEFT JOIN LATERAL (
         SELECT (h."hour" AT TIME ZONE z.zone)::date AS day, sum(h."steps") AS steps
         FROM "hourly_steps" h
         CROSS JOIN LATERAL (SELECT COALESCE((SELECT l."timeZone" FROM "apple_health_links" l WHERE l."userId" = r."userId"), $2) AS zone) z
         WHERE h."userId" = r."userId" AND h."hour" >= ($3::date - $4::integer)::timestamp AT TIME ZONE z.zone AND h."hour" < $3::date::timestamp AT TIME ZONE z.zone
           AND extract(hour FROM h."hour" AT TIME ZONE z.zone) >= $5 AND extract(hour FROM h."hour" AT TIME ZONE z.zone) < $6
         GROUP BY 1
       ) x ON true
       WHERE r."tableId" = $1 AND r."personalTarget" IS NULL GROUP BY r."id"`,
      [tableId, table.timeZone, table.startDay, lookBack, table.hourFrom ?? 0, table.hourTo ?? 24],
    )
    : await manager.query(
      `SELECT r."id", count(d."day") FILTER (WHERE d."steps" > 0)::integer AS "days", COALESCE(sum(d."steps"), 0)::integer AS "total", COALESCE(max(d."steps"), 0)::integer AS "best"
       FROM "table_registrations" r
       LEFT JOIN "daily_steps" d ON d."userId" = r."userId" AND d."day" >= $2::date - $3::integer AND d."day" < $2::date
       WHERE r."tableId" = $1 AND r."personalTarget" IS NULL GROUP BY r."id"`,
      [tableId, table.startDay, lookBack],
    ) as Array<{ id: string; days: number; total: number; best: number }>;
  if (!history.length) return 0;
  const hours = (table.hourTo ?? 0) - (table.hourFrom ?? 0);
  const values = (history as Array<{ id: string; days: number; total: number; best: number }>).map((row) => {
    const enough = row.days >= (rule.baseline === 'window_average' ? MIN_WINDOW_DAYS : MIN_HISTORY_DAYS);
    const measured = rule.baseline === 'best_day' ? row.best : rule.baseline === 'last_period_total' ? row.total : Math.round(row.total / Math.max(1, row.days));
    const baseline = enough ? measured : defaultBaseline(rule, table.windowDays, hours);
    return { id: row.id, baseline, target: targetFor(rule, baseline, table.windowDays) };
  });
  await manager.query(
    `UPDATE "table_registrations" r SET "baselineSteps" = v."baseline", "personalTarget" = v."target"
     FROM jsonb_to_recordset($1::jsonb) AS v("id" uuid, "baseline" integer, "target" integer)
     WHERE r."id" = v."id" AND r."personalTarget" IS NULL`,
    [JSON.stringify(values)],
  );
  return values.length;
}

const result = (score: number | null, rankScore: number | null, scoredAt: Date | null): EntrantScore => ({ score, rankScore, targetReachedAt: null, scoredAt, qualified: true });

export function scorePersonal(
  aggregate: 'personalTotal' | 'personalDays',
  rule: PersonalRule,
  startDay: string,
  targets: Map<string, number | null>,
  days: ScoredActivity[],
) {
  const byEntrant = new Map<string, ScoredActivity[]>([...targets.keys()].map((id) => [id, []]));
  for (const day of days) byEntrant.get(day.registrationId)?.push(day);
  const start = Date.parse(`${startDay}T00:00:00Z`);
  const scores = new Map<string, EntrantScore>();
  for (const [id, own] of byEntrant) {
    const target = targets.get(id) ?? null;
    if (!target) { scores.set(id, result(null, null, null)); continue; }
    const sorted = [...own].sort((a, b) => a.day.localeCompare(b.day));
    const total = sorted.reduce((sum, day) => sum + day.steps, 0);
    const last = sorted.filter((day) => day.steps > 0).at(-1)?.finishedAt ?? null;
    if (aggregate === 'personalTotal') {
      const percent = Math.round((total / target) * 1000) / 10;
      scores.set(id, result(percent, percent, last));
      continue;
    }
    let hits = 0;
    let goals = 0;
    let lastHit: Date | null = null;
    for (const day of sorted) {
      const index = Math.max(0, Math.round((Date.parse(`${day.day}T00:00:00Z`) - start) / DAY_MS));
      const goal = Math.round(target * (1 + (rule.ladder ?? 0) * index));
      goals += goal;
      if (day.steps >= goal) { hits += 1; lastHit = day.finishedAt; }
    }
    const beyond = goals ? Math.min(0.99, total / goals / 10) : 0;
    scores.set(id, result(hits, Math.round((hits + beyond) * 1000) / 1000, lastHit ?? last));
  }
  return scores;
}

export function dailyGoals(rule: PersonalRule, target: number, days: number) {
  return Array.from({ length: days }, (_, index) => Math.round(target * (1 + (rule.ladder ?? 0) * index)));
}
