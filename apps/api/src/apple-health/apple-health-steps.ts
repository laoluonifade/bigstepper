import { haversineMetres } from '../running/haversine';

export function spreadSteps(points: Array<[number, number]>, total: number): number[] {
  const legs = [0];
  for (let index = 1; index < points.length; index += 1) {
    legs.push(legs[index - 1] + haversineMetres(points[index - 1][0], points[index - 1][1], points[index][0], points[index][1]));
  }
  const distance = legs.at(-1) ?? 0;
  return legs.map((metres, index) => Math.round(distance > 0 ? (metres / distance) * total : (index / Math.max(1, points.length - 1)) * total));
}
