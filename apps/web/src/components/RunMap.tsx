import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { cx } from './ui';

/** OpenFreeMap's light style: free, no key, quiet enough that the route stands out. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
/** Where the map opens before we know where you are. */
const FALLBACK_CENTRE: [number, number] = [3.3792, 6.5244]; // Lagos

const TRACK = '#FF4D12';

export type LatLng = [number, number];
export type LivePosition = { latitude: number; longitude: number; accuracy: number | null };

const toLngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat];

function routeData(route: LatLng[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: route.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.map(toLngLat) } }] : [],
  };
}

function startData(route: LatLng[]): FeatureCollection {
  return { type: 'FeatureCollection', features: route.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: toLngLat(route[0]) } }] : [] };
}

/**
 * Positron's labels are pale and small. Make place and street names readable, Apple Maps-style:
 * darker text on a crisp white halo, places a touch larger.
 */
function strengthenLabels(map: MapLibreMap) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const place = layer.id.startsWith('label_');
    const street = layer.id.startsWith('highway-name');
    if (!place && !street && !layer.id.includes('water_name')) continue;
    try {
      map.setPaintProperty(layer.id, 'text-color', place ? '#1d1d1f' : street ? '#4a4a4f' : '#4f7ea8');
      map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(255,255,255,0.95)');
      map.setPaintProperty(layer.id, 'text-halo-width', 1.6);
    } catch {
      // A style change upstream shouldn't stop the map from drawing.
    }
  }
}

/** Gives the WebGL context back straight away; browsers only allow a handful at once. */
function release(map: MapLibreMap) {
  const canvas = map.getCanvas();
  map.remove();
  const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
}

/** Adds the route (white casing under an orange line) and the start dot. */
function addRouteLayers(map: MapLibreMap, route: LatLng[], width = 5) {
  map.addSource('route', { type: 'geojson', data: routeData(route) });
  map.addSource('start', { type: 'geojson', data: startData(route) });
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': width + 4 } });
  map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': TRACK, 'line-width': width } });
  map.addLayer({ id: 'start-dot', type: 'circle', source: 'start', paint: { 'circle-radius': width + 1, 'circle-color': '#121212', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
}

/**
 * Live map for recording: draws the route as it grows and a pulsing dot where you are. It follows you
 * until you pan away, then offers a button to re-centre.
 */
export function RunMap({ route, position, follow = true, className, zoom = 15, bottomInset = 0 }: {
  route: LatLng[];
  position: LivePosition | null;
  follow?: boolean;
  className?: string;
  zoom?: number;
  /** Pixels covered by a sheet at the bottom, so "centre" means the visible part of the map. */
  bottomInset?: number;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(follow);
  const [failed, setFailed] = useState(false);
  const centred = useRef(false);

  useEffect(() => {
    if (!container.current) return;
    let instance: MapLibreMap;
    try {
      instance = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      center: position ? [position.longitude, position.latitude] : FALLBACK_CENTRE,
      zoom: position ? zoom : 11,
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragRotate: false,
      });
    } catch {
      // No WebGL (graphics off, or the browser's context limit): fall back to the plain route drawing.
      setFailed(true);
      return;
    }
    instance.touchZoomRotate.disableRotation();
    instance.on('webglcontextlost', () => setFailed(true));
    instance.on('load', () => {
      strengthenLabels(instance);
      addRouteLayers(instance, route);
      setReady(true);
      // Start the credit collapsed to its (i) button; it opens on tap.
      container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    });
    // A drag means "let me look around": stop following until they tap re-centre.
    instance.on('dragstart', () => setFollowing(false));
    map.current = instance;
    return () => {
      release(instance);
      map.current = null;
      marker.current = null;
    };
    // The map is created once; route and position updates are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    (instance.getSource('route') as GeoJSONSource | undefined)?.setData(routeData(route));
    (instance.getSource('start') as GeoJSONSource | undefined)?.setData(startData(route));
  }, [ready, route]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !position) return;
    const lngLat: [number, number] = [position.longitude, position.latitude];
    if (!marker.current) {
      const dot = document.createElement('div');
      dot.className = 'run-map-dot';
      marker.current = new maplibregl.Marker({ element: dot }).setLngLat(lngLat).addTo(instance);
    } else {
      marker.current.setLngLat(lngLat);
    }
    if (!following) return;
    const padding = { top: 0, bottom: bottomInset, left: 0, right: 0 };
    if (!centred.current) {
      centred.current = true;
      instance.jumpTo({ center: lngLat, zoom, padding });
    } else {
      instance.easeTo({ center: lngLat, duration: 800, padding });
    }
  }, [position, following, zoom, bottomInset]);

  // Callers may position it themselves (absolute/fixed); only fall back to relative when they don't,
  // since Tailwind's `relative` would otherwise override their `absolute` and collapse the map.
  const positioned = /(^|\s)(absolute|fixed|sticky)(\s|$)/.test(className ?? '');
  if (failed) return <FallbackMap route={route} position={position} className={cx(!positioned && 'relative', className)} />;
  return <div className={cx('overflow-hidden bg-[#e8e6e1]', !positioned && 'relative', className)}>
    {/* Inline, because MapLibre's own CSS (loaded after ours) sets `.maplibregl-map { position: relative }`,
        which would beat a utility class and leave the map with no height. */}
    <div ref={container} style={{ position: 'absolute', inset: 0 }} />
    {!following && position && <button
      type="button"
      className="absolute right-4 top-[calc(max(env(safe-area-inset-top),0.875rem)+3.5rem)] z-10 flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-card/80 text-[#0A84FF] shadow-hard-sm backdrop-blur-md transition-transform active:scale-90"
      onClick={() => setFollowing(true)}
      aria-label="Centre on my location"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3 3 10.5l7.2 2.3L12.5 20z" /></svg>
    </button>}
  </div>;
}

/**
 * When the real map can't run: a quiet grid with the route and your position drawn in SVG, so the
 * screen still works and still shows where you've been.
 */
function FallbackMap({ route, position, className }: { route: LatLng[]; position: LivePosition | null; className?: string }) {
  const points = position ? [...route, [position.latitude, position.longitude] as LatLng] : route;
  let path = '';
  let here: [number, number] | null = null;
  if (points.length) {
    const lat0 = points[0][0];
    const cos = Math.cos((lat0 * Math.PI) / 180);
    const flat = points.map(([lat, lng]) => [lng * 111_320 * cos, -lat * 110_540]);
    const xs = flat.map((p) => p[0]);
    const ys = flat.map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 200);
    const scale = 70 / span;
    const cx0 = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy0 = (Math.max(...ys) + Math.min(...ys)) / 2;
    const project = ([x, y]: number[]) => [50 + (x - cx0) * scale, 50 + (y - cy0) * scale] as [number, number];
    const projected = flat.map(project);
    path = projected.slice(0, route.length).map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    if (position) here = projected[projected.length - 1];
  }
  return <div className={cx('overflow-hidden bg-[#ece9e2]', className)} style={{ backgroundImage: 'linear-gradient(#0000000d 1px, transparent 1px), linear-gradient(90deg, #0000000d 1px, transparent 1px)', backgroundSize: '32px 32px' }}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" aria-hidden="true">
      {path && <><path d={path} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 9 }} />
        <path d={path} fill="none" stroke={TRACK} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 5 }} /></>}
      {here && <circle cx={here[0]} cy={here[1]} r="1.6" fill="#0A84FF" stroke="#fff" strokeWidth="0.8" />}
    </svg>
    <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border-[1.5px] border-ink bg-card/90 px-3 py-1 text-[12px] font-semibold text-ink-2">Map unavailable here · route still recording</p>
  </div>;
}

/**
 * Renders the route on the map off screen and returns it as an image, for the share card.
 * Resolves null if the map can't load (offline, blocked tiles) so the card falls back to the plain route.
 */
export function renderRouteMap(route: LatLng[], width: number, height: number): Promise<HTMLCanvasElement | null> {
  if (route.length < 2) return Promise.resolve(null);
  return new Promise((resolve) => {
    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
    document.body.appendChild(holder);
    const lngs = route.map(([, lng]) => lng);
    const lats = route.map(([lat]) => lat);
    let instance: MapLibreMap;
    try {
      instance = new maplibregl.Map({
      container: holder,
      style: MAP_STYLE,
      bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      fitBoundsOptions: { padding: Math.round(Math.min(width, height) * 0.14) },
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: 1,
      // Keeps the frame readable after drawing, so the share image can be copied off the canvas.
      canvasContextAttributes: { preserveDrawingBuffer: true },
      });
    } catch {
      holder.remove();
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (canvas: HTMLCanvasElement | null) => {
      if (settled) return;
      settled = true;
      release(instance);
      holder.remove();
      resolve(canvas);
    };
    const timer = window.setTimeout(() => finish(null), 12_000);
    instance.on('error', () => undefined);
    instance.on('load', () => {
      strengthenLabels(instance);
      addRouteLayers(instance, route, Math.round(width / 90));
      instance.once('idle', () => {
        window.clearTimeout(timer);
        const copy = document.createElement('canvas');
        copy.width = width;
        copy.height = height;
        try {
          copy.getContext('2d')!.drawImage(instance.getCanvas(), 0, 0, width, height);
          finish(copy);
        } catch {
          finish(null);
        }
      });
    });
  });
}
