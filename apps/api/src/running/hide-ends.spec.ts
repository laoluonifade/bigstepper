import { hideEnds, shapeOnly } from './activities.service';
import { haversineMetres } from './haversine';

const line = (count: number) => Array.from({ length: count }, (_, index) => ({ lat: 6.5 + (index * 50) / 111_320, lon: 3.3 }));

describe('hideEnds', () => {
  it('leaves the first and last 200 m off someone else’s map', () => {
    const route = line(21);
    const kept = hideEnds(route, 200);
    const from = (point: { lat: number; lon: number }, end: { lat: number; lon: number }) => haversineMetres(point.lat, point.lon, end.lat, end.lon);
    expect(kept.length).toBeGreaterThan(8);
    expect(kept.every((point) => from(point, route[0]) >= 200 && from(point, route[route.length - 1]) >= 200)).toBe(true);
  });

  it('shows nothing of a route too short to hide both ends', () => {
    expect(hideEnds(line(7), 200)).toEqual([]);
  });
});

describe('shapeOnly', () => {
  const lagos = [{ lat: 6.5244, lon: 3.3792 }, { lat: 6.5284, lon: 3.3792 }, { lat: 6.5284, lon: 3.3842 }];

  it('moves the route off its real place', () => {
    const shape = shapeOnly(lagos);
    expect(shape.every((point) => Math.abs(point.lat) < 0.01 && Math.abs(point.lon) < 0.01)).toBe(true);
  });

  it('keeps the shape and size of the route', () => {
    const shape = shapeOnly(lagos);
    const leg = (points: Array<{ lat: number; lon: number }>, a: number, b: number) => haversineMetres(points[a].lat, points[a].lon, points[b].lat, points[b].lon);
    expect(leg(shape, 0, 1)).toBeCloseTo(leg(lagos, 0, 1), -1);
    expect(leg(shape, 1, 2)).toBeCloseTo(leg(lagos, 1, 2), -1);
  });
});
