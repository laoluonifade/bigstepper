import { countryName, flag } from '@jump/shared/countries';
import { formatDistance } from '@jump/shared/format';
import type { AvatarStyle, Unit } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { api } from '@/lib/api';
// Share pictures look the same whoever posts them, so they use the brand palette, not the theme's.
import { brand as colors, colors as themed, fontFamily } from '@/lib/theme';
import { ShareIcon } from './icons';
import { Sheet } from './Sheet';
import { Avatar, Button, haptic, Txt } from './ui';

type Row = { rank: number; userId: string; metres: number; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; countryCode: string | null; isMe: boolean };
type Board = { rows: Row[]; me: Row | null };
type Scope = 'global' | 'country';

/** The card's base size in points; it's captured at 3× for the web's 1080×1350 picture. */
const W = 360;
const H = 450;
const PAD = 24;
const firstName = (row: Row) => (row.isMe ? 'You' : row.displayName.split(' ')[0]);

/** The board as a picture: the podium, the next places on a paper card, and you if you're further back. */
function BoardCard({ board, scopeLabel, filter, unit, showFlags }: { board: Board; scopeLabel: string; filter: string; unit: Unit; showFlags: boolean }) {
  const top = board.rows.slice(0, 3);
  const columns = [top[1], top[0], top[2]];
  const blocks = [32, 47, 21];
  const meBelow = board.me && !board.rows.slice(0, 9).some((row) => row.isMe) ? board.me : null;
  const list = board.rows.slice(3, meBelow ? 8 : 9);
  const leader = board.rows[0]?.metres ?? 0;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return <View style={{ width: W, height: H, backgroundColor: colors.ink, overflow: 'hidden' }}>
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="glow" cx={W * 0.88} cy={27} rx={W * 0.85} ry={W * 0.85} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FF5A1F" stopOpacity="0.32" /><Stop offset="1" stopColor="#FF5A1F" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#glow)" />
    </Svg>
    <View style={{ flex: 1, paddingHorizontal: PAD, paddingTop: 22 }}>
      <Text style={styles.brand}>JUMP</Text>
      <Text style={styles.title}>Leaderboard</Text>
      <Text style={styles.filter} numberOfLines={1}>{`${scopeLabel} · ${filter}`}</Text>

      {/* Podium: second, first, third. */}
      <View style={styles.podium}>
        {columns.map((row, index) => {
          if (!row) return <View key={index} style={{ flex: 1 }} />;
          const first = row.rank === 1;
          const size = first ? 52 : 40;
          return <View key={row.userId} style={{ flex: 1, alignItems: 'center' }}>
            <View>
              <View style={{ borderRadius: size, borderWidth: first ? 2.5 : 1.7, borderColor: first || row.isMe ? colors.volt : 'rgba(242,239,232,0.3)' }}>
                <Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={size} round />
              </View>
              {showFlags && row.countryCode ? <Text style={[styles.flag, { fontSize: first ? 14 : 12 }]}>{flag(row.countryCode)}</Text> : null}
            </View>
            <Text style={[styles.podiumName, { fontSize: first ? 12.5 : 10.5, color: row.isMe ? colors.volt : colors.paper }]} numberOfLines={1}>{firstName(row)}</Text>
            <Text style={[styles.podiumDistance, { fontSize: first ? 13 : 10.5, color: first ? colors.volt : 'rgba(242,239,232,0.8)' }]} numberOfLines={1}>{formatDistance(row.metres, unit)}</Text>
            <View style={[styles.block, { height: blocks[index] + 7, backgroundColor: first ? colors.volt : 'rgba(242,239,232,0.1)' }]}>
              <Text style={[styles.blockRank, { fontSize: first ? 21 : 16, color: first ? colors.ink : 'rgba(242,239,232,0.75)' }]}>{row.rank}</Text>
            </View>
          </View>;
        })}
      </View>

      {/* The next places, on a paper card. */}
      {(list.length > 0 || meBelow) && <View style={styles.list}>
        {list.map((row, index) => <BoardLine key={row.userId} row={row} unit={unit} leader={leader} showFlags={showFlags} divider={index > 0} />)}
        {meBelow && <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(18,18,18,0.3)', borderStyle: 'dashed' }}><BoardLine row={meBelow} unit={unit} leader={leader} showFlags={showFlags} /></View>}
      </View>}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Verified distance · startajump.com</Text>
        <Text style={styles.footerText}>{date}</Text>
      </View>
    </View>
  </View>;
}

function BoardLine({ row, unit, leader, showFlags, divider }: { row: Row; unit: Unit; leader: number; showFlags: boolean; divider?: boolean }) {
  return <View style={[styles.line, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(18,18,18,0.12)' }, row.isMe && { backgroundColor: 'rgba(228,255,58,0.55)' }]}>
    <Text style={styles.lineRank}>{row.rank}</Text>
    <View style={{ borderRadius: 20, borderWidth: 1, borderColor: colors.ink }}><Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={17} round /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.lineName} numberOfLines={1}>{`${row.isMe ? 'You' : row.displayName}${showFlags && row.countryCode ? ` ${flag(row.countryCode)}` : ''}`}</Text>
      <View style={styles.gap}><View style={{ height: '100%', borderRadius: 2, backgroundColor: 'rgba(18,18,18,0.7)', width: `${leader ? Math.max(3, (row.metres / leader) * 100) : 0}%` }} /></View>
    </View>
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
      const uri = await captureRef(card, { format: 'png', quality: 1, width: 1080, height: 1350, result: 'tmpfile' });
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
          <View ref={card} collapsable={false}><BoardCard board={board.data} scopeLabel={scopeLabel} filter={filter} unit={unit} showFlags={scope === 'global'} /></View>
        </View> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Txt size={13} style={{ color: 'rgba(242,239,232,0.6)' }}>{board.error ? 'Couldn’t load the board.' : 'Making the picture…'}</Txt></View>}
      </View>
    </View>
    <Button full title={busy ? 'Making your picture…' : 'Share image'} icon={<ShareIcon size={16} color={themed.onAccent} />} loading={busy} disabled={!board.data} style={{ marginTop: 16 }} onPress={() => void share()} />
    <Txt size={12} color="ink3" align="center" style={{ marginTop: 10 }}>{status ?? 'Post it to your story, a chat, or save it to your photos.'}</Txt>
  </Sheet>;
}

const styles = StyleSheet.create({
  brand: { fontFamily: fontFamily('black'), fontStyle: 'italic', fontSize: 15, color: '#FF5A1F' },
  title: { fontFamily: fontFamily('extrabold'), fontSize: 24, color: colors.paper, marginTop: 2 },
  filter: { fontFamily: fontFamily('semibold'), fontSize: 11.5, color: 'rgba(242,239,232,0.7)', marginTop: 2 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 16 },
  flag: { position: 'absolute', right: -6, bottom: -4 },
  podiumName: { fontFamily: fontFamily('bold'), marginTop: 6, maxWidth: '92%' },
  podiumDistance: { fontFamily: fontFamily('extrabold'), marginTop: 1 },
  block: { alignSelf: 'stretch', marginHorizontal: 3, marginTop: 6, borderTopLeftRadius: 7, borderTopRightRadius: 7, alignItems: 'center', paddingTop: 5 },
  blockRank: { fontFamily: fontFamily('black') },
  list: { marginTop: 12, borderRadius: 10, backgroundColor: colors.paper, overflow: 'hidden', paddingVertical: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 22, paddingHorizontal: 9 },
  lineRank: { width: 16, fontFamily: fontFamily('extrabold'), fontSize: 10, color: 'rgba(18,18,18,0.5)' },
  lineName: { fontFamily: fontFamily('bold'), fontSize: 9.5, color: colors.ink },
  gap: { height: 2.5, borderRadius: 2, backgroundColor: 'rgba(18,18,18,0.08)', marginTop: 2, overflow: 'hidden' },
  lineDistance: { fontFamily: fontFamily('extrabold'), fontSize: 10, color: colors.ink },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto', marginBottom: 12 },
  footerText: { fontFamily: fontFamily('semibold'), fontSize: 9.5, color: 'rgba(242,239,232,0.55)' },
  scope: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: themed.ink, backgroundColor: themed.card, paddingHorizontal: 8 },
  preview: { borderRadius: 12, backgroundColor: colors.ink, overflow: 'hidden' },
});
