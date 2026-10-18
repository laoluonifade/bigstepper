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
