import { hideEnds } from './activities.service';
import { haversineMetres } from './haversine';

// A straight line north, one point roughly every 50 m.
const line = (count: number) => Array.from({ length: count }, (_, index) => ({ lat: 6.5 + (index * 50) / 111_320, lon: 3.3 }));

describe('hideEnds', () => {
  it('leaves the first and last 200 m off someone else’s map', () => {
    const route = line(21); // about 1 km
    const kept = hideEnds(route, 200);
    const from = (point: { lat: number; lon: number }, end: { lat: number; lon: number }) => haversineMetres(point.lat, point.lon, end.lat, end.lon);
    expect(kept.length).toBeGreaterThan(8);
    expect(kept.every((point) => from(point, route[0]) >= 200 && from(point, route[route.length - 1]) >= 200)).toBe(true);
  });

  it('shows nothing of a route too short to hide both ends', () => {
    expect(hideEnds(line(7), 200)).toEqual([]);
  });
});
