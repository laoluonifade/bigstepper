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

const HEALTH = 'Counts your Apple Health steps.';
const MEDALS = 'Gold, silver and bronze for the top three.';
const DONE = 'Hit it for a completion medal.';
const AGAIN = 'You stay in for the next one; leave any time.';
const YOURS = 'Your target comes from your own recent steps, or 4,000 a day if you’re new.';

export const PLANS: Plan[] = [
  { title: 'The 10K Club', description: `Reach 10,000 steps in a day. ${DONE} A new day starts every midnight. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'TARGET_DAYS', dailyTarget: 10_000, medalRule: 'completion' },
  { title: 'Last Step Standing', description: `Most steps in a day wins. ${MEDALS} A new day starts every midnight. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'MOST_STEPS', medalRule: 'podium' },
  { title: 'Just 5K', description: `Reach 5,000 steps in a day. ${DONE} A new day starts every midnight. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'TARGET_DAYS', dailyTarget: 5_000, medalRule: 'completion' },
  { title: 'The 15K Challenge', description: `Reach 15,000 steps in a day. ${DONE} A new day starts every midnight. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'TARGET_DAYS', dailyTarget: 15_000, medalRule: 'completion' },
  { title: 'The Midnight Race', description: `Most steps between 6 PM and midnight wins. ${MEDALS} Only steps in that window count. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'MOST_STEPS', medalRule: 'podium', hourFrom: 18, hourTo: 24 },
  { title: 'Early Birds', description: `Most steps between 5 AM and 9 AM wins. ${MEDALS} Only steps in that window count. ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'MOST_STEPS', medalRule: 'podium', hourFrom: 5, hourTo: 9 },
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
  { title: 'Lunch Break Legs', description: `Beat your usual steps between 12 and 2 PM. Your target is your usual for that window last week. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', hourFrom: 12, hourTo: 14, personal: { baseline: 'window_average', factor: 1, add: 1, min: 200 } },
  { title: 'After Work Walkers', description: `Beat your usual steps between 5 and 8 PM. Your target is your usual for that window last week. ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', hourFrom: 17, hourTo: 20, personal: { baseline: 'window_average', factor: 1, add: 1, min: 300 } },
  { title: 'Double Up', description: `Walk twice your normal day (one and a half times if you already average 10,000+). ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 2, highActive: { above: 10_000, factor: 1.5 } } },
  { title: 'The Consistency Cup', description: `A point for each day you hit your own daily target. Most points wins. ${YOURS} ${MEDALS} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_DAYS', medalRule: 'podium', personal: { baseline: 'daily_average', factor: 1, min: 2000 } },
  { title: 'The 3-Day Streak', description: `Hit a daily target 10% above your average three days running. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'custom', intervalDays: 3, fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_DAYS', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 1.1, min: 2000 } },
  { title: 'The Big Step Day', description: `Beat your best day of the last 30. An ambitious one. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'daily', fillsPeriod: true, start: 'today', leadDays: 0, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'best_day', factor: 1, add: 1, min: 8000 } },
  { title: 'The Step Ladder', description: `Seven daily targets climbing 5% a day from just under your average. Hit all seven. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'weekly', fillsPeriod: true, start: 'monday', leadDays: 2, scoringMethod: 'PERSONAL_DAYS', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 0.9, ladder: 0.05, min: 2000 } },
  { title: 'The 1% Better Challenge', description: `Average 1% more steps a day this month than the week before. ${YOURS} ${DONE} ${AGAIN} ${HEALTH}`, cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'PERSONAL_TARGET', medalRule: 'completion', personal: { baseline: 'daily_average', factor: 1.01, perDay: true } },
  { title: 'The Monthly Step King', description: `Most steps in the calendar month wins. ${MEDALS} ${AGAIN} ${HEALTH}`, cadence: 'monthly', fillsPeriod: true, start: 'month', leadDays: 10, scoringMethod: 'MOST_STEPS', medalRule: 'podium' },
];
