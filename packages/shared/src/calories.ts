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

/**
 * Energy spent walking a day's steps, over and above resting. ACSM's walking equation puts the cost of
 * walking on the flat at 0.1 mL O₂ per kg per metre, about 0.5 kcal per kg per km at 5 kcal per litre.
 * Uses the phone's walking distance when it has one, else the steps at an average stride.
 */
export function stepCalories(steps: number, distanceMetres: number | null | undefined, weightKg: number | null | undefined): number | null {
  if (!weightKg || weightKg < 20 || weightKg > 300 || steps <= 0) return null;
  const metres = distanceMetres && distanceMetres > 0 ? distanceMetres : steps * 0.72;
  return Math.round(0.5 * weightKg * metres / 1000);
}
