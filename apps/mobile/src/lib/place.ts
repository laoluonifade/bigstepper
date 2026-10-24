import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { haversineMetres } from '@jump/shared/geo';

type Spot = { latitude: number; longitude: number };

/**
 * "Yaba, Lagos" for where you are, via Jump's API (which asks OpenStreetMap and caches). Looked up once,
 * then again only after you've moved 500 m.
 */
export function usePlaceName(position: Spot | null) {
  const [name, setName] = useState<string | null>(null);
  const last = useRef<Spot | null>(null);

  useEffect(() => {
    if (!position) return;
    if (last.current && haversineMetres(last.current.latitude, last.current.longitude, position.latitude, position.longitude) < 500) return;
    last.current = position;
    const controller = new AbortController();
    api<{ name: string | null }>(`/geo/place?lat=${position.latitude.toFixed(5)}&lon=${position.longitude.toFixed(5)}`, { signal: controller.signal })
      .then((place) => setName(place.name))
      .catch(() => undefined);
    return () => controller.abort();
  }, [position]);

  return name;
}
