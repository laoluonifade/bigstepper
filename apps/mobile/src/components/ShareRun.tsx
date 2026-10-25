import { activityName, formatDistanceNumber, formatDuration, formatPace, formatSpeed } from '@jump/shared/format';
import { shownMetres } from '@jump/shared/progress';
import type { Activity, Unit } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { ComponentRef, useMemo, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { api } from '@/lib/api';
// Share pictures look the same whoever posts them, so they use the brand palette, not the theme's.
import { brand as colors, fontFamily } from '@/lib/theme';
import { ShareIcon, StepMark, JumpLogo } from './icons';
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

/** The share image, drawn with views: the web canvas card's layout. Everything on it comes from the activity. */
function RunCard({ activity, unit, route, format }: { activity: Activity; unit: Unit; route: Array<[number, number]> | null; format: Format }) {
  const { w: W, h: H } = BASE[format];
  const story = format === 'story';
  const pad = 28;
  const box = story ? { x: pad + 7, y: 87, w: W - pad * 2 - 14, h: 253 } : { x: pad + 7, y: 63, w: W - pad * 2 - 14, h: 97 };
  const points = route && route.length >= 2 ? fitRoute(route, box) : null;
  const path = points?.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const metres = shownMetres(activity);
  const seconds = activity.movingSeconds || activity.elapsedSeconds;
  const statsTop = story ? 370 : 187;
  const cells = [
    ['TIME', formatDuration(seconds)],
    activity.activityType === 'cycle' ? ['AVG SPEED', formatSpeed(metres, seconds, unit) ?? '–'] : [`PACE /${unit.toUpperCase()}`, formatPace(metres, seconds, unit) ?? '–:––'],
  ];
  return <View style={{ width: W, height: H, backgroundColor: colors.ink, overflow: 'hidden' }}>
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="glow" cx={W * 0.85} cy={H * 0.12} rx={W * 0.9} ry={W * 0.9} gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor={colors.track} stopOpacity="0.35" /><Stop offset="1" stopColor={colors.track} stopOpacity="0" /></RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#glow)" />
      {Array.from({ length: Math.ceil((W - pad) / 40) }, (_, index) => <Line key={index} x1={pad + index * 40} y1={0} x2={pad + index * 40} y2={H} stroke="rgba(242,239,232,0.05)" strokeWidth={0.7} />)}
      {path && points ? <>
        <Path d={path} fill="none" stroke={colors.volt} strokeOpacity={0.25} strokeWidth={story ? 14 : 10} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={path} fill="none" stroke={colors.volt} strokeWidth={story ? 5.3 : 4} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={points[0][0]} cy={points[0][1]} r={story ? 6 : 4.7} fill={colors.track} />
        <Circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r={story ? 6 : 4.7} fill={colors.ink} stroke={PAPER} strokeWidth={2} />
      </> : null}
    </Svg>
    <View style={{ position: 'absolute', left: pad, right: pad, top: pad, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <JumpLogo height={19} color={PAPER} />
      <Text style={styles.date}>{new Date(activity.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
    </View>
    {!path && <View style={{ position: 'absolute', left: 0, right: 0, top: box.y, height: box.h, alignItems: 'center', justifyContent: 'center' }}><StepMark size={Math.min(box.w, box.h) * 0.7} /></View>}
    <View style={{ position: 'absolute', left: pad, right: pad, top: statsTop - 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.name} numberOfLines={1}>{activityName(activity.startedAt, activity.activityType).toUpperCase()}</Text>
        {activity.verificationStatus === 'VERIFIED' && <View style={styles.verified}><Text style={styles.verifiedText}>✓ VERIFIED</Text></View>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: story ? 6 : 2 }}>
        <Text style={[styles.distance, { fontSize: story ? 100 : 63, lineHeight: story ? 100 : 64 }]} numberOfLines={1}>{formatDistanceNumber(metres, unit)}</Text>
        <Text style={[styles.unit, { fontSize: story ? 21 : 15 }]}>{unit.toUpperCase()}</Text>
      </View>
      <View style={[styles.rule, { marginTop: story ? 10 : 4 }]} />
      <View style={{ flexDirection: 'row', marginTop: story ? 14 : 8 }}>
        {cells.map(([label, value]) => <View key={label} style={{ flex: 1 }}>
          <Text style={styles.cellLabel}>{label}</Text>
          <Text style={[styles.cellValue, { fontSize: story ? 32 : 23 }]} numberOfLines={1}>{value}</Text>
        </View>)}
      </View>
    </View>
    <View style={{ position: 'absolute', left: pad, right: pad, bottom: pad - 2, flexDirection: 'row', justifyContent: 'space-between' }}>
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
      const uri = await captureRef(card, { format: 'png', quality: 1, width: 1080, height: Math.round((1080 * h) / w), result: 'tmpfile' });
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
          <View ref={card} collapsable={false}><RunCard activity={activity} unit={unit} route={route} format={format} /></View>
        </View>
      </View>
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
  preview: { borderRadius: 6, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.ink, overflow: 'hidden' },
  date: { fontFamily: fontFamily('semibold'), fontSize: 10, color: 'rgba(242,239,232,0.6)' },
  name: { flex: 1, fontFamily: fontFamily('bold', 'wide'), fontSize: 10, color: 'rgba(242,239,232,0.6)' },
  verified: { borderRadius: 2, backgroundColor: colors.volt, paddingHorizontal: 7, paddingVertical: 4 },
  verifiedText: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 8.5, color: colors.ink },
  distance: { fontFamily: fontFamily('extrabold', 'narrow'), color: colors.volt, letterSpacing: -2, marginLeft: -3 },
  unit: { fontFamily: fontFamily('extrabold', 'wide'), color: PAPER },
  rule: { height: 0.7, backgroundColor: 'rgba(242,239,232,0.18)' },
  cellLabel: { fontFamily: fontFamily('bold', 'wide'), fontSize: 8.5, color: 'rgba(242,239,232,0.55)' },
  cellValue: { fontFamily: fontFamily('extrabold', 'narrow'), color: PAPER, marginTop: 2 },
  footer: { fontFamily: fontFamily('bold', 'wide'), fontSize: 9.5, color: 'rgba(242,239,232,0.5)' },
});
