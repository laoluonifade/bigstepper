import { countryName, flag } from '@jump/shared/countries';
import { formatDistance } from '@jump/shared/format';
import type { AvatarStyle, Unit } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { api } from '@/lib/api';
// Share pictures look the same whoever posts them, so they use the brand palette, not the theme's.
import { brand as colors, colors as themed, fontFamily } from '@/lib/theme';
import { JumpLogo, ShareIcon } from './icons';
import { Sheet } from './Sheet';
import { Sticker } from './Stickers';
import { Avatar, Button, haptic, Txt } from './ui';

type Row = { rank: number; userId: string; metres: number; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; countryCode: string | null; isMe: boolean };
type Board = { rows: Row[]; me: Row | null };
type Scope = 'global' | 'country';

/** The card's base size in points; it's captured at 1080×1350, the web's picture size. */
const W = 360;
const H = 450;
const PAD = 22;
const firstName = (row: Row) => (row.isMe ? 'You' : row.displayName.split(' ')[0]);

/** Where each of the top three sits, in points: x, y, width, height, tilt. First is raised in the middle. */
type Spot = [number, number, number, number, number];
const PODIUM: Array<{ place: string; spot: Spot; bg: string }> = [
  { place: '1st', spot: [127, 108, 106, 128, 2], bg: colors.volt },
  { place: '2nd', spot: [22, 124, 100, 114, -4], bg: colors.card },
  { place: '3rd', spot: [238, 128, 100, 110, 4], bg: colors.track },
];

/** One of the top three as a sticker: place, face, name and distance. */
function PodiumSticker({ row, place, spot, bg, unit, showFlags }: { row: Row; place: string; spot: Spot; bg: string; unit: Unit; showFlags: boolean }) {
  const [x, y, w, h, tilt] = spot;
  const big = row.rank === 1;
  const face = big ? 38 : 32;
  return <Sticker p={colors} bg={bg} tilt={tilt} padded={false} width={w + 4} style={{ position: 'absolute', left: x, top: y }}>
    <View style={{ height: h - 3, alignItems: 'center', paddingTop: 8 }}>
      <Text style={[styles.place, { fontSize: big ? 10 : 9 }]}>{place}</Text>
      <View style={{ marginTop: 2 }}>
        <View style={{ borderRadius: face, borderWidth: 1.2, borderColor: colors.ink }}><Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={face} round /></View>
        {showFlags && row.countryCode ? <Text style={styles.flag}>{flag(row.countryCode)}</Text> : null}
      </View>
      <Text style={[styles.podiumName, { fontSize: big ? 11.5 : 10.5 }]} numberOfLines={1}>{firstName(row)}</Text>
      <Text style={[styles.podiumDistance, { fontSize: big ? 22 : 18 }]} numberOfLines={1} adjustsFontSizeToFit>{formatDistance(row.metres, unit)}</Text>
    </View>
  </Sticker>;
}

/** The board as a picture, in the run card's sticker style: the top three as stickers, the next places on a card. */
function BoardCard({ board, scopeLabel, filter, unit, showFlags }: { board: Board; scopeLabel: string; filter: string; unit: Unit; showFlags: boolean }) {
  const meBelow = board.me && !board.rows.slice(0, 9).some((row) => row.isMe) ? board.me : null;
  const list = board.rows.slice(3, meBelow ? 8 : 9);
  const leader = board.rows[0]?.metres ?? 0;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();

  return <View style={{ width: W, height: H, backgroundColor: colors.paper, overflow: 'hidden' }}>
    <View style={{ position: 'absolute', left: PAD, right: PAD, top: PAD, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <JumpLogo height={14} color={colors.ink} />
      <Text style={styles.date}>{date}</Text>
    </View>
    <Text style={[styles.title, { position: 'absolute', left: PAD, right: PAD, top: 44 }]} numberOfLines={1} adjustsFontSizeToFit>Leaderboard</Text>
    <View style={[styles.tag, { position: 'absolute', left: PAD, top: 80 }]}><Text style={styles.tagText} numberOfLines={1}>{`${scopeLabel} · ${filter}`}</Text></View>

    {/* Second and third first, so first's sticker sits on top of them. */}
    {[1, 2, 0].map((index) => board.rows[index] ? <PodiumSticker key={index} row={board.rows[index]} {...PODIUM[index]} unit={unit} showFlags={showFlags} /> : null)}

    {(list.length > 0 || meBelow) && <Sticker p={colors} bg={colors.card} padded={false} width={W - PAD * 2} style={{ position: 'absolute', left: PAD, top: 262 }}>
      <View style={{ paddingVertical: 4, paddingHorizontal: 5 }}>
        {list.map((row, index) => <BoardLine key={row.userId} row={row} unit={unit} leader={leader} showFlags={showFlags} divider={index > 0} />)}
        {meBelow && <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 2 }}><BoardLine row={meBelow} unit={unit} leader={leader} showFlags={showFlags} /></View>}
      </View>
    </Sticker>}

    <View style={{ position: 'absolute', left: PAD, right: PAD, bottom: PAD - 6, flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={styles.footer}>VERIFIED DISTANCE · STARTAJUMP.COM</Text>
      <Text style={[styles.footer, { color: colors.track }]}>MOVE. COMPETE. WIN.</Text>
    </View>
  </View>;
}

function BoardLine({ row, unit, leader, showFlags, divider }: { row: Row; unit: Unit; leader: number; showFlags: boolean; divider?: boolean }) {
  return <View style={[styles.line, divider && !row.isMe && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, row.isMe && { backgroundColor: colors.volt, borderRadius: 6 }]}>
    <Text style={[styles.lineRank, row.isMe && { color: colors.ink }]}>{row.rank}</Text>
    <View style={{ borderRadius: 20, borderWidth: 0.8, borderColor: colors.ink }}><Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={15} round /></View>
    <Text style={styles.lineName} numberOfLines={1}>{`${row.isMe ? 'You' : row.displayName}${showFlags && row.countryCode ? ` ${flag(row.countryCode)}` : ''}`}</Text>
    <View style={styles.gap}><View style={{ height: '100%', borderRadius: 2, backgroundColor: colors.ink, width: `${leader ? Math.max(3, (row.metres / leader) * 100) : 0}%` }} /></View>
    <Text style={styles.lineDistance}>{formatDistance(row.metres, unit)}</Text>
  </View>;
}

/** Export the board as a picture: Global or your country, for the activity and period on screen. */
export function ShareBoardSheet({ open, onOpenChange, activity, period, filter, initialScope, country, unit }: {
  open: boolean; onOpenChange: (open: boolean) => void; activity: string; period: string; filter: string; initialScope: Scope; country: string | null; unit: Unit;
}) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const card = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => { if (open) { setScope(initialScope); setStatus(null); } }, [open, initialScope]);
  const board = useQuery({
    queryKey: ['leaderboard', activity, period, scope, 50],
    queryFn: () => api<Board>(`/leaderboard?activity=${activity}&period=${period}&scope=${scope}&limit=50`),
    enabled: open,
    staleTime: 60_000,
  });
  const scopeLabel = scope === 'global' ? '🌍 Global' : country ? `${flag(country)} ${countryName(country)}` : 'My country';
  const preview = 0.82;

  async function share() {
    setBusy(true);
    setStatus(null);
    try {
      // iOS reads the size in points and renders at the screen's scale; Android reads pixels. Either way: 1080 px wide.
      const across = Platform.OS === 'ios' ? 1080 / PixelRatio.get() : 1080;
      const uri = await captureRef(card, { format: 'png', quality: 1, width: across, height: (across * H) / W, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Jump leaderboard', UTI: 'public.png' });
      else setStatus('Sharing isn’t available on this phone.');
    } catch {
      setStatus('Couldn’t make the picture. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <Sheet open={open} onOpenChange={onOpenChange} title="Share the leaderboard">
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
      {([['global', '🌍', 'Global'], ['country', country ? flag(country) : '🏳️', country ? countryName(country) : 'My country']] as const).map(([value, icon, label]) => {
        const active = scope === value;
        return <Pressable key={value} disabled={value === 'country' && !country} onPress={() => { haptic('select'); setScope(value); }} accessibilityRole="tab" accessibilityState={{ selected: active }}
          style={[styles.scope, active && { backgroundColor: themed.ink }, value === 'country' && !country && { opacity: 0.4 }]}>
          <Text style={{ fontSize: 16 }}>{icon}</Text>
          <Txt size={13} weight="bold" numberOfLines={1} style={{ flexShrink: 1, color: active ? themed.paper : themed.ink2 }}>{label}</Txt>
        </Pressable>;
      })}
    </View>
    {/* The preview is the card itself, scaled down; the capture renders it full size. */}
    <View style={{ alignItems: 'center', marginTop: 16 }}>
      <View style={[styles.preview, { width: W * preview, height: H * preview }]}>
        {board.data ? <View style={{ transform: [{ scale: preview }], transformOrigin: 'top left' }}>
          <BoardCard board={board.data} scopeLabel={scopeLabel} filter={filter} unit={unit} showFlags={scope === 'global'} />
        </View> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Txt size={13} style={{ color: colors.ink2 }}>{board.error ? 'Couldn’t load the board.' : 'Making the picture…'}</Txt></View>}
      </View>
    </View>
    {/* What's captured: the same card at full size, off screen (capturing the shrunk preview saved a zoomed-in corner). */}
    {board.data && <View style={styles.offscreen} pointerEvents="none">
      <View ref={card} collapsable={false}><BoardCard board={board.data} scopeLabel={scopeLabel} filter={filter} unit={unit} showFlags={scope === 'global'} /></View>
    </View>}
    <Button full title={busy ? 'Making your picture…' : 'Share image'} icon={<ShareIcon size={16} color={themed.onAccent} />} loading={busy} disabled={!board.data} style={{ marginTop: 16 }} onPress={() => void share()} />
    <Txt size={12} color="ink3" align="center" style={{ marginTop: 10 }}>{status ?? 'Post it to your story, a chat, or save it to your photos.'}</Txt>
  </Sheet>;
}

const styles = StyleSheet.create({
  date: { fontFamily: fontFamily('bold'), fontSize: 9.5, letterSpacing: 0.6, color: colors.ink2 },
  title: { fontFamily: fontFamily('black', 'wide'), fontSize: 26, textTransform: 'uppercase', color: colors.ink },
  tag: { borderRadius: 9, backgroundColor: colors.ink, paddingHorizontal: 9, paddingVertical: 4, maxWidth: W - PAD * 2 },
  tagText: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 8.5, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.volt },
  place: { alignSelf: 'flex-start', marginLeft: 11, fontFamily: fontFamily('black', 'wide'), textTransform: 'uppercase', color: colors.ink },
  flag: { position: 'absolute', right: -6, bottom: -4, fontSize: 12 },
  podiumName: { fontFamily: fontFamily('bold'), color: colors.ink, marginTop: 5, maxWidth: '88%' },
  podiumDistance: { fontFamily: fontFamily('extrabold', 'narrow'), color: colors.ink, letterSpacing: -0.3, maxWidth: '90%' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 22, paddingHorizontal: 8 },
  lineRank: { width: 18, fontFamily: fontFamily('extrabold', 'narrow'), fontSize: 11, color: colors.ink3 },
  lineName: { flex: 1, fontFamily: fontFamily('bold'), fontSize: 10.5, color: colors.ink },
  gap: { width: 84, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(18,18,18,0.08)', overflow: 'hidden' },
  lineDistance: { width: 58, textAlign: 'right', fontFamily: fontFamily('extrabold', 'narrow'), fontSize: 12, color: colors.ink },
  footer: { fontFamily: fontFamily('bold', 'wide'), fontSize: 7.5, color: colors.ink2 },
  scope: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: themed.ink, backgroundColor: themed.card, paddingHorizontal: 8 },
  offscreen: { position: 'absolute', left: -10_000, top: 0 },
  preview: { borderRadius: 12, backgroundColor: colors.paper, overflow: 'hidden' },
});
