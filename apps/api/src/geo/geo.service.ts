import { Injectable, Logger } from '@nestjs/common';

type Address = Record<string, string | undefined>;
type Found = { name?: string; display_name?: string; lat?: string; lon?: string };
export type Place = { name: string; address: string; latitude: number; longitude: number };

const PRECISION = 3;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 5_000;

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly cache = new Map<string, { name: string | null; at: number }>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;

  async placeName(latitude: number, longitude: number): Promise<{ name: string | null }> {
    const key = `${latitude.toFixed(PRECISION)},${longitude.toFixed(PRECISION)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { name: hit.name };

    const name = await this.throttled(() => this.lookup(latitude, longitude));
    if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, { name, at: Date.now() });
    return { name };
  }

  async search(query: string, near?: { latitude: number; longitude: number }): Promise<Place[]> {
    const params = new URLSearchParams({ format: 'jsonv2', limit: '6', 'accept-language': 'en', q: query });
    if (near) {
      const { latitude: lat, longitude: lon } = near;
      params.set('viewbox', [lon - 0.6, lat + 0.6, lon + 0.6, lat - 0.6].map((value) => value.toFixed(4)).join(','));
    }
    return this.throttled(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'User-Agent': 'Jump/1.0 (+https://startajump.com)' }, signal: AbortSignal.timeout(6_000) });
        if (!response.ok) return [];
        const found = (await response.json()) as Found[];
        return found.filter((place) => place.lat && place.lon && place.display_name).map((place) => {
          const parts = place.display_name!.split(', ');
          return { name: place.name || parts[0], address: parts.slice(1, 4).join(', '), latitude: Number(place.lat), longitude: Number(place.lon) };
        });
      } catch (error) {
        this.logger.warn(`Place search failed: ${String(error)}`);
        return [];
      }
    });
  }

  private throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastCall + 1_000 - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastCall = Date.now();
      return task();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async lookup(latitude: number, longitude: number): Promise<string | null> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`;
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Jump/1.0 (+https://startajump.com)' }, signal: AbortSignal.timeout(6_000) });
      if (!response.ok) return null;
      const { address } = (await response.json()) as { address?: Address };
      if (!address) return null;
      const area = address.suburb ?? address.neighbourhood ?? address.quarter ?? address.village ?? address.city_district ?? address.town;
      const city = address.city ?? address.town ?? address.state?.replace(/ State$/, '');
      return [area, city].filter((part, index, all) => part && all.indexOf(part) === index).join(', ') || null;
    } catch (error) {
      this.logger.warn(`Place lookup failed: ${String(error)}`);
      return null;
    }
  }
}
