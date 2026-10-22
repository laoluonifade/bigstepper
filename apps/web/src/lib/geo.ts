export { haversineMetres } from '@jump/shared/geo';

export function getCurrentPosition(timeout = 15_000, options: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000 }): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unsupported'));
      return;
    }
    // Some browsers never call back (the option's timeout only starts after permission is settled),
    // so give up ourselves a little after it.
    const deadline = window.setTimeout(() => reject({ code: 3 }), timeout + 5_000);
    navigator.geolocation.getCurrentPosition(
      (position) => { window.clearTimeout(deadline); resolve(position); },
      (error) => { window.clearTimeout(deadline); reject(error); },
      { ...options, timeout },
    );
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

