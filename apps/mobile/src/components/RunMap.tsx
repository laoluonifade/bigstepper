import type { CameraRef, StyleSpecification } from '@maplibre/maplibre-react-native';
import type { FeatureCollection } from 'geojson';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, TurboModuleRegistry, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/lib/theme';
import { haptic } from './ui';

/**
 * MapLibre is a native module Expo Go doesn't include, so it's only loaded in a real build. In Expo Go the
 * maps fall back to the route drawn on a grid (RouteSketch), and everything else works the same.
 */
const MapLibre: typeof import('@maplibre/maplibre-react-native') | null = TurboModuleRegistry.get('MLRNCameraModule')
  ? require('@maplibre/maplibre-react-native')
  : null;

/** OpenFreeMap's light style: free, no key, quiet enough that the route stands out. Same as the web. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
/** Where the map opens before we know where you are. */
const FALLBACK_CENTRE: [number, number] = [3.3792, 6.5244]; // Lagos
const HERE = '#0A84FF';

export type LatLng = [number, number];
export type LivePosition = { latitude: number; longitude: number; accuracy: number | null };

const toLngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat];

function routeData(route: LatLng[]): FeatureCollection {
  return { type: 'FeatureCollection', features: route.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.map(toLngLat) } }] : [] };
}

function startData(route: LatLng[]): FeatureCollection {
  return { type: 'FeatureCollection', features: route.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: toLngLat(route[0]) } }] : [] };
}

let patchedStyle: Promise<StyleSpecification | null> | null = null;

/**
 * Positron's labels are pale and small. As on the web, make place and street names readable: darker text
 * on a crisp white halo. Fetched once and patched before the map draws; the plain URL is used meanwhile.
 */
function useMapStyle(): string | StyleSpecification {
  const [style, setStyle] = useState<string | StyleSpecification>(MAP_STYLE);
  useEffect(() => {
    patchedStyle ??= fetch(MAP_STYLE).then((response) => response.json() as Promise<StyleSpecification>).then((spec) => {
      for (const layer of spec.layers) {
        if (layer.type !== 'symbol') continue;
        const place = layer.id.startsWith('label_');
        const street = layer.id.startsWith('highway-name');
        if (!place && !street && !layer.id.includes('water_name')) continue;
        layer.paint = { ...layer.paint, 'text-color': place ? '#1d1d1f' : street ? '#4a4a4f' : '#4f7ea8', 'text-halo-color': 'rgba(255,255,255,0.95)', 'text-halo-width': 1.6 };
      }
      return spec;
    }).catch(() => {
      patchedStyle = null;
      return null;
    });
    let cancelled = false;
    void patchedStyle.then((spec) => { if (spec && !cancelled) setStyle(spec); });
    return () => { cancelled = true; };
  }, []);
  return style;
}

/** The route as a white casing under the orange line, with a dark dot where it started. */
function RouteLayers({ route, width = 5 }: { route: LatLng[]; width?: number }) {
  const { GeoJSONSource, Layer } = MapLibre!;
  return <>
    <GeoJSONSource id="route" data={routeData(route)}>
      <Layer id="route-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#ffffff', 'line-width': width + 4 }} />
      <Layer id="route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': colors.track, 'line-width': width }} />
    </GeoJSONSource>
    <GeoJSONSource id="start" data={startData(route)}>
      <Layer id="start-dot" type="circle" paint={{ 'circle-radius': width + 1, 'circle-color': colors.ink, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 }} />
    </GeoJSONSource>
  </>;
}

/** The live "you are here" dot: Apple-style blue with a breathing halo. */
function HereDot() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1);
  }, [pulse]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 1.4 }] }));
  return <View style={styles.hereWrap} pointerEvents="none">
    <Animated.View style={[styles.halo, halo]} />
    <View style={styles.here} />
  </View>;
}

/**
 * Live map for recording: draws the route as it grows and a pulsing dot where you are. It follows you
 * until you pan away, then offers a button to re-centre.
 */
export function RunMap({ route, position, follow = true, style, zoom = 15, bottomInset = 0, topInset = 0 }: {
  route: LatLng[];
  position: LivePosition | null;
  follow?: boolean;
  style?: StyleProp<ViewStyle>;
  zoom?: number;
  /** Points covered by a sheet at the bottom, so "centre" means the visible part of the map. */
  bottomInset?: number;
  /** Where the re-centre button sits, below any floating status at the top. */
  topInset?: number;
}) {
  // Decided once per install (Expo Go or a real build), so the hooks below always run in the same order.
  if (!MapLibre) return <RouteSketch route={route} position={position} style={style} />;
  return <LiveMap route={route} position={position} follow={follow} style={style} zoom={zoom} bottomInset={bottomInset} topInset={topInset} />;
}

function LiveMap({ route, position, follow, style, zoom, bottomInset, topInset }: { route: LatLng[]; position: LivePosition | null; follow: boolean; style?: StyleProp<ViewStyle>; zoom: number; bottomInset: number; topInset: number }) {
  const { Camera, Map, Marker } = MapLibre!;
  const camera = useRef<CameraRef>(null);
  const mapStyle = useMapStyle();
  const [following, setFollowing] = useState(follow);
  const centred = useRef(false);

  useEffect(() => {
    if (!position || !following) return;
    const center: [number, number] = [position.longitude, position.latitude];
    const padding = { top: 0, bottom: bottomInset, left: 0, right: 0 };
    if (!centred.current) {
      centred.current = true;
      camera.current?.jumpTo({ center, zoom, padding });
    } else {
      camera.current?.easeTo({ center, duration: 800, padding });
    }
  }, [position, following, zoom, bottomInset]);

  return <View style={[styles.frame, style]}>
    <Map style={StyleSheet.absoluteFill} mapStyle={mapStyle} touchRotate={false} touchPitch={false} logo={false} attribution attributionPosition={{ bottom: bottomInset + 8, right: 8 }}
      // A drag means "let me look around": stop following until they tap re-centre.
      onRegionWillChange={(event) => { if (event.nativeEvent.userInteraction) setFollowing(false); }}>
      <Camera ref={camera} initialViewState={{ center: position ? [position.longitude, position.latitude] : FALLBACK_CENTRE, zoom: position ? zoom : 11 }} />
      <RouteLayers route={route} />
      {position && <Marker id="here" lngLat={[position.longitude, position.latitude]} anchor="center"><HereDot /></Marker>}
    </Map>
    {!following && position && <Pressable onPress={() => { haptic(); centred.current = false; setFollowing(true); }} accessibilityRole="button" accessibilityLabel="Centre on my location"
      style={({ pressed }) => [styles.recentre, { top: topInset + 8 }, pressed && { transform: [{ scale: 0.9 }] }]}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill={HERE}><Path d="M21 3 3 10.5l7.2 2.3L12.5 20z" /></Svg>
    </Pressable>}
  </View>;
}

/** A finished route on a real map, fitted to its bounds. Not interactive, so it scrolls with the page. */
export function RouteMap({ route, style, interactive = false }: { route: LatLng[]; style?: StyleProp<ViewStyle>; interactive?: boolean }) {
  if (!MapLibre || route.length < 2) return <RouteSketch route={route} style={style} />;
  return <FittedMap route={route} style={style} interactive={interactive} />;
}

function FittedMap({ route, style, interactive }: { route: LatLng[]; style?: StyleProp<ViewStyle>; interactive: boolean }) {
  const { Camera, GeoJSONSource, Layer, Map } = MapLibre!;
  const mapStyle = useMapStyle();
  const lats = route.map(([lat]) => lat);
  const lngs = route.map(([, lng]) => lng);
  const bounds: [number, number, number, number] = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  return <View style={[styles.frame, style]} pointerEvents={interactive ? 'auto' : 'none'}>
    <Map style={StyleSheet.absoluteFill} mapStyle={mapStyle} dragPan={interactive} touchZoom={interactive} doubleTapZoom={interactive} touchRotate={false} touchPitch={false} logo={false} attribution={false}>
      <Camera initialViewState={{ bounds, padding: { top: 32, right: 32, bottom: 32, left: 32 } }} />
      <RouteLayers route={route} width={4} />
      <GeoJSONSource id="finish" data={{ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: toLngLat(route[route.length - 1]) } }] }}>
        <Layer id="finish-dot" type="circle" paint={{ 'circle-radius': 5, 'circle-color': colors.track, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 }} />
      </GeoJSONSource>
    </Map>
  </View>;
}

/**
 * The route drawn on a quiet grid, without map tiles: for share cards, list rows and anywhere a live
 * map would be too heavy. Same projection as the web's fallback map.
 */
export function RouteSketch({ route, position, style, stroke = colors.track }: { route: LatLng[]; position?: LivePosition | null; style?: StyleProp<ViewStyle>; stroke?: string }) {
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
    const projected = flat.map(([x, y]) => [50 + (x - cx0) * scale, 50 + (y - cy0) * scale] as [number, number]);
    path = projected.slice(0, route.length).map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    if (position) here = projected[projected.length - 1];
  }
  return <View style={[styles.sketch, style]}>
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
      {path ? <>
        <Path d={path} fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={path} fill="none" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </> : null}
      {here ? <Circle cx={here[0]} cy={here[1]} r={2.6} fill={HERE} stroke="#fff" strokeWidth={1.2} /> : null}
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#e8e6e1' },
  hereWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: HERE },
  here: { width: 20, height: 20, borderRadius: 10, backgroundColor: HERE, borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  recentre: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: 'rgba(251,250,246,0.9)', alignItems: 'center', justifyContent: 'center' },
  sketch: { overflow: 'hidden', backgroundColor: '#ece9e2' },
});
