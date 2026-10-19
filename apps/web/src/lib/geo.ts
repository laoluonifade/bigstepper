const EARTH_RADIUS_METRES = 6_371_000;

/** Same great-circle formula the API uses, so the live estimate tracks the server closely. */
export function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function getCurrentPosition(timeout = 15_000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout });
  });
}

export function describeGeoError(error: unknown): string {
  if (error instanceof Error && error.message === 'unsupported') {
    return 'This browser can’t share your location, so runs can’t be recorded here.';
  }
  const code = (error as GeolocationPositionError | undefined)?.code;
  if (code === 1) return 'Location access is blocked. Allow location for this site in your browser settings, then try again.';
  if (code === 3) return 'Still searching for a GPS signal. Step outside or away from tall buildings and try again.';
  return 'Couldn’t get your location. Check that location services are on and try again.';
}

/** Same thresholds the server uses to verify a track (apps/api/src/running/track.ts). */
export const MAX_USABLE_ACCURACY_METRES = 50;
const MAX_FOOT_SPEED_MPS = 9;
const MIN_STEP_METRES = 4;

export interface TrackAnchor {
  lat: number;
  lon: number;
  accuracy: number;
  at: number;
}

/**
 * One step of the shared track rule, for the live screen. Returns the metres to add (0 for wobble,
 * spikes, too-fast travel or unusable fixes) and the anchor to measure the next fix from.
 */
export function advanceTrack(
  anchor: TrackAnchor | null,
  fix: TrackAnchor,
  fastInARow: number,
): { metres: number; anchor: TrackAnchor | null; fastInARow: number } {
  if (fix.accuracy > MAX_USABLE_ACCURACY_METRES) return { metres: 0, anchor, fastInARow };
  if (!anchor) return { metres: 0, anchor: fix, fastInARow: 0 };
  const seconds = (fix.at - anchor.at) / 1000;
  if (seconds <= 0) return { metres: 0, anchor, fastInARow };
  const metres = haversineMetres(anchor.lat, anchor.lon, fix.lat, fix.lon);
  if (metres < Math.max(MIN_STEP_METRES, (anchor.accuracy + fix.accuracy) / 2)) return { metres: 0, anchor, fastInARow };
  if (metres / seconds > MAX_FOOT_SPEED_MPS) {
    // One fast fix is a spike (ignore it); two in a row is real non-foot travel (follow it, don't count it).
    return fastInARow + 1 >= 2 ? { metres: 0, anchor: fix, fastInARow: fastInARow + 1 } : { metres: 0, anchor, fastInARow: fastInARow + 1 };
  }
  return { metres, anchor: fix, fastInARow: 0 };
}
