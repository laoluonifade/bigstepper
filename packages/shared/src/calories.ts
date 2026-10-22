import type { Activity } from './types';

/**
 * Approximate gross energy expenditure for verified activity only.
 * The 2024 Adult Compendium lists 4.0 MET for self-selected walking and 10.5 MET for
 * self-selected running, and 6.8 MET for self-selected cycling to/from work;
 * 1 MET is approximately 1 kcal/kg/hour.
 * https://pacompendium.com/walking/ https://pacompendium.com/running/ https://pacompendium.com/bicycling/
 */
export function estimatedCalories(activity: Activity, weightKg: number | null | undefined): number | null {
  if (activity.verificationStatus !== 'VERIFIED' || !weightKg || weightKg < 20 || weightKg > 300 ||
      activity.movingSeconds <= 0 || (activity.validatedDistanceMetres <= 0 && activity.validatedSteps <= 0)) return null;
  const met = activity.activityType === 'walk' ? 4.0 : activity.activityType === 'cycle' ? 6.8 : 10.5;
  return Math.round(met * weightKg * activity.movingSeconds / 3600);
}
