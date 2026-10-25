import { activityName } from '@jump/shared/format';
import type { Activity, Unit } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { ComponentRef, ReactNode, useMemo, useRef, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { api } from '@/lib/api';
// Share pictures look the same whoever posts them, so they use the brand palette, not the theme's.
import { brand as colors, fontFamily } from '@/lib/theme';
import { ShareIcon, JumpLogo } from './icons';
import { Sticker, stickerNumbers } from './Stickers';
import { Sheet } from './Sheet';
import { Button, haptic, Segmented, Txt } from './ui';

type Format = 'story' | 'square';
/** Base size in points; captured at 3× for a 1080 px wide image. */
const BASE: Record<Format, { w: number; h: number }> = { story: { w: 360, h: 640 }, square: { w: 360, h: 360 } };
const PAPER = colors.paper;

/** Projects lat/lon to flat metres (fine at run scale), then fits the route into a box keeping its shape. */
function fitRoute(route: Array<[number, number]>, box: { x: number; y: number; w: number; h: number }) {
  const lat0 = route[0][0];
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const flat = route.map(([lat, lon]) => [lon * 111_320 * cos, -lat * 110_540]);
  const xs = flat.map((p) => p[0]);
  const ys = flat.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const offX = box.x + (box.w - spanX * scale) / 2;
  const offY = box.y + (box.h - spanY * scale) / 2;
  return flat.map(([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale] as const);
}

/** Where each sticker sits on the image, in points: x, y, width, height, tilt, and the number's size. Nothing overlaps the map, so the whole route shows. */
type Spot = [number, number, number, number, number, number?];
const LAYOUT: Record<Format, Record<'route' | 'plain', { map?: Spot; distance: Spot; time: Spot; pace: Spot; steps: Spot }>> = {
  story: {
    route: { map: [24, 148, 312, 226, -2], distance: [20, 394, 196, 116, -4, 74], time: [228, 398, 112, 76, 5, 38], pace: [198, 484, 132, 76, -3, 38], steps: [46, 524, 124, 62, 3, 30] },
    plain: { distance: [26, 160, 304, 190, -3, 140], time: [30, 376, 140, 90, 4, 46], pace: [186, 388, 146, 90, -3, 46], steps: [110, 488, 140, 72, 2, 34] },
  },
  square: {
    route: { map: [20, 78, 172, 176, -3], distance: [206, 80, 132, 100, 4, 56], time: [206, 194, 64, 58, -4, 24], pace: [274, 202, 64, 58, 4, 24], steps: [218, 270, 104, 46, -2, 22] },
    plain: { distance: [24, 82, 312, 128, -2, 92], time: [26, 228, 96, 66, 4, 30], pace: [132, 234, 100, 66, -3, 30], steps: [240, 226, 96, 66, 3, 30] },
  },
};

/** One sticker pinned to its spot on the image. */
function Placed({ spot, bg, children }: { spot: Spot; bg: string; children: ReactNode }) {
  const [x, y, w, h, tilt] = spot;
  return <Sticker p={colors} bg={bg} tilt={tilt} padded={false} width={w + 4} style={{ position: 'absolute', left: x, top: y }}>
    <View style={{ height: h - 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>{children}</View>
  </Sticker>;
}

/** A number and its label, sized for the sticker it's on. */
function Figure({ spot, value, label, color, labelColor = color, struck }: { spot: Spot; value: string; label: string; color: string; labelColor?: string; struck?: boolean }) {
  const size = spot[5] ?? 32;
  return <>
    <Text style={[styles.figure, { fontSize: size, lineHeight: size * 1.04, color }, struck && { textDecorationLine: 'line-through' }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={[styles.figureLabel, { fontSize: spot[2] >= 150 ? 10 : spot[2] >= 100 ? 8.5 : 7, color: labelColor }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
  </>;
}

/** The share image: the activity page's stickers on plain paper. Everything on it comes from the activity. */
function RunCard({ activity, unit, route, format }: { activity: Activity; unit: Unit; route: Array<[number, number]> | null; format: Format }) {
  const { w: W, h: H } = BASE[format];
  const story = format === 'story';
  const pad = story ? 24 : 20;
  const n = stickerNumbers(activity, unit);
  const spots = LAYOUT[format][route && route.length >= 2 ? 'route' : 'plain'];
  // The map inside its sticker: less the outline and a little paper margin.
  const map = spots.map;
  const mapW = map ? map[2] - 17 : 0;
  const mapH = map ? map[3] - 17 : 0;
  const points = map && route ? fitRoute(route, { x: 18, y: 18, w: mapW - 36, h: mapH - 36 }) : null;
  const path = points?.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const started = new Date(activity.startedAt);
  const date = `${started.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')} · ${started.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return <View style={{ width: W, height: H, backgroundColor: PAPER, overflow: 'hidden' }}>
    <View style={{ position: 'absolute', left: pad, right: pad, top: pad, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <JumpLogo height={story ? 16 : 14} color={colors.ink} />
      <Text style={styles.date}>{date.toUpperCase()}</Text>
    </View>
    <Text style={[styles.name, { position: 'absolute', left: pad, right: pad, top: story ? 58 : 46, fontSize: story ? 30 : 17, lineHeight: story ? 31 : 19 }]} numberOfLines={story ? 2 : 1} adjustsFontSizeToFit>
      {activityName(activity.startedAt, activity.activityType)}
    </Text>
    {map && path && points ? <Placed spot={map} bg={colors.card}>
      <View style={{ width: mapW, height: mapH, borderRadius: 8, backgroundColor: '#ECE9E2', overflow: 'hidden' }}>
        <Svg width={mapW} height={mapH}>
          {Array.from({ length: Math.ceil(mapW / 44) }, (_, index) => <Line key={`x${index}`} x1={44 + index * 44} y1={0} x2={38 + index * 44} y2={mapH} stroke="#DCD7CC" strokeWidth={1.5} />)}
          {Array.from({ length: Math.ceil(mapH / 44) }, (_, index) => <Line key={`y${index}`} x1={0} y1={24 + index * 44} x2={mapW} y2={30 + index * 44} stroke="#DCD7CC" strokeWidth={1.5} />)}
          <Path d={path} fill="none" stroke="#FFFFFF" strokeWidth={story ? 6.5 : 5.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={path} fill="none" stroke={colors.track} strokeWidth={story ? 3.5 : 3} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={points[0][0]} cy={points[0][1]} r={4.5} fill={colors.ink} stroke="#FFFFFF" strokeWidth={1.5} />
          <Circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={4.5} fill={colors.volt} stroke={colors.ink} strokeWidth={1.2} />
        </Svg>
      </View>
    </Placed> : null}
    {n.steps && <Placed spot={spots.steps} bg={colors.card}><Figure spot={spots.steps} value={n.steps} label="steps" color={colors.ink} labelColor={colors.ink2} /></Placed>}
    <Placed spot={spots.distance} bg={n.struck ? colors.card : colors.volt}><Figure spot={spots.distance} value={n.distance} label={n.distanceLabel} color={n.struck ? colors.ink3 : colors.ink} struck={n.struck} /></Placed>
    <Placed spot={spots.time} bg="#121212"><Figure spot={spots.time} value={n.time} label="time" color={PAPER} labelColor={colors.volt} /></Placed>
    <Placed spot={spots.pace} bg={colors.track}><Figure spot={spots.pace} value={n.pace} label={n.paceLabel} color={colors.ink} /></Placed>
    <View style={{ position: 'absolute', left: pad, right: pad, bottom: pad - 6, flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={styles.footer}>STARTAJUMP.COM</Text>
      <Text style={[styles.footer, { color: colors.track }]}>MOVE. COMPETE. WIN.</Text>
    </View>
  </View>;
}

/** "Share" sheet with a designed image of the activity, for stories and posts. */
export function ShareRunSheet({ open, onOpenChange, activity, unit }: { open: boolean; onOpenChange: (open: boolean) => void; activity: Activity; unit: Unit }) {
  const [format, setFormat] = useState<Format>('story');
  const [showRoute, setShowRoute] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const card = useRef<ComponentRef<typeof View>>(null);
  const track = useQuery({ queryKey: ['activity-track', activity.id], queryFn: () => api<{ points: Array<[number, number]> }>(`/activities/${activity.id}/track`), enabled: open, staleTime: Infinity });
  const hasRoute = (track.data?.points.length ?? 0) >= 2;
  const route = useMemo(() => (showRoute && hasRoute ? track.data!.points : null), [showRoute, hasRoute, track.data]);
  const { w, h } = BASE[format];
  const preview = format === 'story' ? 0.6 : 0.82;

  async function share() {
    setBusy(true);
    setStatus(null);
    try {
      // iOS reads the size in points and renders at the screen's scale; Android reads pixels. Either way: 1080 px wide.
      const across = Platform.OS === 'ios' ? 1080 / PixelRatio.get() : 1080;
      const uri = await captureRef(card, { format: 'png', quality: 1, width: across, height: (across * h) / w, result: 'tmpfile' });
      haptic('success');
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'My Jump activity', UTI: 'public.png' });
      else setStatus('Sharing isn’t available on this phone.');
    } catch {
      setStatus('Couldn’t make the image. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <Sheet open={open} onOpenChange={onOpenChange} title={`Share your ${activity.activityType === 'cycle' ? 'ride' : activity.activityType}`}
    footer={<Button full title={busy ? 'Making your image…' : 'Share'} icon={<ShareIcon size={16} />} loading={busy} disabled={track.isLoading} onPress={() => void share()} />}>
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.preview, { width: w * preview, height: h * preview }]}>
        <View style={{ transform: [{ scale: preview }], transformOrigin: 'top left' }}>
          <RunCard activity={activity} unit={unit} route={route} format={format} />
        </View>
      </View>
    </View>
    {/* What's captured: the same card at full size, off screen. Capturing the shrunk, clipped preview
        saved a zoomed-in corner of it. */}
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={card} collapsable={false}><RunCard activity={activity} unit={unit} route={route} format={format} /></View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
      <Segmented<Format> label="Image size" value={format} onChange={setFormat} options={[{ value: 'story', label: 'Story' }, { value: 'square', label: 'Square' }]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: hasRoute ? 1 : 0.5 }}>
        <Txt size={13} weight="semibold">Show route</Txt>
        <Switch value={showRoute && hasRoute} disabled={!hasRoute} onValueChange={setShowRoute} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} />
      </View>
    </View>
    <Txt size={12} color="ink3" style={{ marginTop: 8 }}>{hasRoute ? 'Your route can show where you live. Hide it before sharing an activity from home.' : track.isLoading ? 'Loading your route…' : 'No route to draw for this activity.'}</Txt>
    {status ? <Txt size={13} color="ink2" style={{ marginTop: 12 }}>{status}</Txt> : null}
  </Sheet>;
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10_000, top: 0 },
  preview: { borderRadius: 6, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: PAPER, overflow: 'hidden' },
  date: { fontFamily: fontFamily('bold'), fontSize: 9.5, letterSpacing: 0.8, color: colors.ink2 },
  name: { fontFamily: fontFamily('extrabold', 'wide'), textTransform: 'uppercase', color: colors.ink },
  figure: { fontFamily: fontFamily('extrabold', 'narrow'), letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  figureLabel: { fontFamily: fontFamily('extrabold', 'wide'), letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 },
  footer: { fontFamily: fontFamily('bold', 'wide'), fontSize: 8.5, color: colors.ink2 },
});
