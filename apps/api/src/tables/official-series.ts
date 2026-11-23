import type { SeriesCadence } from './club-challenges';
import type { ScoringMethod } from './competition-rules';
import type { PersonalRule } from './personal-targets';

export const DESCRIPTION_MAX = 280;

export type Plan = {
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

export const PLANS: Plan[] = [
  { title: 'The 10K Club', description: 'Ten thousand steps, every day, starting at midnight.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'TARGET_DAYS', dailyTarget: 10_000, medalRule: 'completion' },
  { title: 'Last Step Standing', description: 'One day, one board: out-walk everyone before midnight.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'MOST_STEPS', medalRule: 'podium' },
  { title: 'Just 5K', description: 'Five thousand steps a day keeps the couch away.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'TARGET_DAYS', dailyTarget: 5_000, medalRule: 'completion' },
  { title: 'The 15K Challenge', description: 'Fifteen thousand steps in a day, for the ones who don’t sit still.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'TARGET_DAYS', dailyTarget: 15_000, medalRule: 'completion' },
  { title: 'The Midnight Race', description: 'Own the evening: the most steps from 6 PM to midnight wins.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'MOST_STEPS', medalRule: 'podium', hourFrom: 18, hourTo: 24 },
  { title: 'Early Birds', description: 'The city’s still asleep; your steps from 5 to 9 AM aren’t.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'MOST_STEPS', medalRule: 'podium', hourFrom: 5, hourTo: 9 },
  { title: 'The 50K Club', description: 'Fifty thousand steps by Sunday night, at your own pace.', cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'FIRST_TO_STEPS', targetSteps: 50_000, medalRule: 'completion' },
  { title: 'The 100K Club', description: 'A hundred thousand steps in one week. Big week energy.', cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'FIRST_TO_STEPS', targetSteps: 100_000, medalRule: 'completion' },
  { title: 'No Zero Days', description: 'Three thousand steps every day this week, no days off.', cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'TARGET_DAYS', dailyTarget: 3_000, medalRule: 'completion' },
  { title: 'Walk Every Day', description: 'Seven thousand steps a day, seven days straight.', cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'TARGET_DAYS', dailyTarget: 7_000, medalRule: 'completion' },
  { title: 'The Weekend Warriors', description: 'Saturday and Sunday are for walking: most steps wins.', cadence: 'weekly', fillsPeriod: false, durationDays: 2, start: 'weekend', leadDays: 2, scoringMethod: 'MOST_STEPS', medalRule: 'podium' },
  { title: 'The Weekly Step Champion', description: 'Monday to Sunday, most steps takes the crown.', cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'MOST_STEPS', medalRule: 'podium' },
  { title: 'The 200K Club', description: 'Two hundred thousand steps this month, one walk at a time.', cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'FIRST_TO_STEPS', targetSteps: 200_000, medalRule: 'completion' },
  { title: 'Walk to a Million', description: 'A million steps in 90 days. Yes, a million.', cadence: 'custom', intervalDays: 90, fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'FIRST_TO_STEPS', targetSteps: 1_000_000, medalRule: 'completion' },
  { title: 'The 30-Day Streak', description: 'Five thousand steps every single day of the month.', cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'TARGET_DAYS', dailyTarget: 5_000, medalRule: 'completion' },
  { title: 'The 300K Challenge', description: 'Three hundred thousand steps in a month, for the truly restless.', cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'FIRST_TO_STEPS', targetSteps: 300_000, medalRule: 'completion' },
  { title: 'Beat Yourself', description: 'This week, walk 20% more than last week’s you.', cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 1.2, perDay: true } },
  { title: 'The Comeback Kid', description: 'Beat last week’s step total, even by one step.', cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'last_period_total', factor: 1, add: 1 } },
  { title: 'The Perfect Week', description: 'Hit your own target all seven days. Flawless.', cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_DAYS', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 1, min: 2000 } },
  { title: 'The 2K Sprint', description: 'A small daily target, made for you. Just get moving.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 0.3, min: 2000, max: 5000 } },
  { title: 'The 5K Sprint', description: 'A bigger daily milestone, sized to your legs.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 0.6, min: 5000, max: 12000 } },
  { title: 'Lunch Break Legs', description: 'Turn your lunch break into steps: beat your usual noon to 2 PM.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', hourFrom: 12, hourTo: 14, personal: { baseline: 'window_average', factor: 1, add: 1, min: 200 } },
  { title: 'After Work Walkers', description: 'Clock out, walk out: beat your usual 5 to 8 PM.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', hourFrom: 17, hourTo: 20, personal: { baseline: 'window_average', factor: 1, add: 1, min: 300 } },
  { title: 'Double Up', description: 'Walk twice your normal day. Go on, double it.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 2, highActive: { above: 10_000, factor: 1.5 } } },
  { title: 'The Consistency Cup', description: 'Hit your own target the most days this week to lift the cup.', cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_DAYS', medalRule: 'podium', personal: { baseline: 'daily_average', factor: 1, min: 2000 } },
  { title: 'The 3-Day Streak', description: 'Three days running, a little above your usual.', cadence: 'custom', intervalDays: 3, fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_DAYS', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 1.1, min: 2000 } },
  { title: 'The Big Step Day', description: 'Today, beat your best day of the last month.', cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'best_day', factor: 1, add: 1, min: 8000 } },
  { title: 'The Step Ladder', description: 'Seven days, each one a step higher than the last.', cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_DAYS', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 0.9, ladder: 0.05, min: 2000 } },
  { title: 'The 1% Better Challenge', description: 'Just 1% more a day than last week. Small wins stack.', cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 1.01, perDay: true } },
  { title: 'The Monthly Step King', description: 'Most steps this month takes the crown.', cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'MOST_STEPS', medalRule: 'podium' },
];
