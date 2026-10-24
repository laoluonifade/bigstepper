import { competitionCardData, type CardFormat, type CompetitionCardData } from '@jump/shared/competition';
import { hasScored } from '@jump/shared/scoring';
import type { CompetitionTable, StandingRow, Unit } from '@jump/shared/types';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { ComponentRef, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { WEB_URL } from '@/lib/api';
import { colors, fontFamily, mono } from '@/lib/theme';
import { CopyIcon, JumpLogo, ShareIcon } from './icons';
import { Sheet } from './Sheet';
import { Avatar, Button, haptic, Txt } from './ui';

/** The card's base size in points; it's captured at 3× for a 1080 px wide image. */
const BASE = { story: { w: 360, h: 640 }, post: { w: 360, h: 450 } } as const;
const PAPER = colors.paper;

/**
 * The competition as a picture to post: what it is, what's at stake, who's winning, and the join code at
 * billboard size. The same layout as the web's canvas card, drawn with views.
 */
function CompetitionCard({ data, format, avatars }: { data: CompetitionCardData; format: CardFormat; avatars: Map<string, { name: string; url: string | null; style?: StandingRow['avatarStyle'] }> }) {
  const { w: W, h: H } = BASE[format];
  const story = format === 'story';
  const k = story ? 1 : 0.8;
  const rows = [...data.podium.slice(0, 3)];
  if (data.me?.scored && !rows.some((row) => row.userId === data.me!.userId)) rows.push(data.me);
  const callout = data.me ? (data.me.scored && data.me.rank ? `I’M #${data.me.rank} · BEAT ME` : 'I’M IN · JOIN ME') : 'JOIN ME';
  const lanes = Array.from({ length: 8 }, (_, lane) => {
    const lift = lane * (story ? 31 : 23);
    return `M-40 ${H * 0.98 - lift}C${W * 0.35} ${H * 0.82 - lift} ${W * 0.62} ${H * 0.42 - lift * 0.8} ${W + 40} ${H * 0.3 - lift * 0.7}`;
  });
  return <View style={{ width: W, height: H, backgroundColor: colors.ink, overflow: 'hidden' }}>
    <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="glowTop" cx={W} cy={0} rx={W * 1.05} ry={W * 1.05} gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor="#FF5A1F" stopOpacity="0.42" /><Stop offset="1" stopColor="#FF5A1F" stopOpacity="0" /></RadialGradient>
        <RadialGradient id="glowLow" cx={0} cy={H} rx={W * 0.95} ry={W * 0.95} gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor={colors.volt} stopOpacity="0.22" /><Stop offset="1" stopColor={colors.volt} stopOpacity="0" /></RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#glowTop)" />
      <Rect width={W} height={H} fill="url(#glowLow)" />
      {lanes.map((d, index) => <Path key={index} d={d} fill="none" stroke="rgba(242,239,232,0.06)" strokeWidth={7} />)}
      <Path d={`M-40 ${H * 0.9}C${W * 0.3} ${H * 0.86} ${W * 0.7} ${H * 0.7} ${W + 40} ${H * (story ? 0.56 : 0.6)}`} fill="none" stroke={data.accent} strokeOpacity={0.85} strokeWidth={5} />
    </Svg>
    <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: story ? 34 : 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <JumpLogo height={22 * k} color={PAPER} />
        <View style={[styles.callout, { height: 25 * k + 2 }]}><Text style={[styles.calloutText, { fontSize: 10 * k + 0.5 }]}>{callout}</Text></View>
      </View>
      <Text style={[styles.kind, { marginTop: story ? 38 : 22, fontSize: 10.5 * k }]} numberOfLines={1}>{data.kind.toUpperCase()}</Text>
      <Text style={[styles.big, { color: data.accent, fontSize: story ? 110 : 70, lineHeight: story ? 104 : 68 }]} numberOfLines={1} adjustsFontSizeToFit>{data.big.toUpperCase()}</Text>
      <Text style={[styles.small, { fontSize: 13 * k + 0.5 }]} numberOfLines={1}>{data.small.toUpperCase()}</Text>
      <Text style={[styles.title, { fontSize: story ? 23 : 17, lineHeight: story ? 27 : 20, marginTop: story ? 20 : 12 }]} numberOfLines={story ? 2 : 1}>{data.title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: story ? 14 : 10 }}>
        {[data.stakes, `${data.entrants} IN`, data.timing].filter(Boolean).map((text, index) => <View key={index} style={[styles.chip, index === 0 && data.stakes.startsWith('₦') && { backgroundColor: colors.volt }]}>
          <Text style={[styles.chipText, { fontSize: 8.5 * k + 0.5 }, index === 0 && data.stakes.startsWith('₦') && { color: colors.ink }]}>{text.toUpperCase()}</Text>
        </View>)}
      </View>
      <View style={[styles.board, { marginTop: story ? 18 : 10, paddingVertical: story ? 14 : 10 }]}>
        <Text style={[styles.boardTitle, { fontSize: 8.5 * k + 0.5 }]}>LIVE LEADERBOARD</Text>
        {!rows.length && <Text style={[styles.boardEmpty, { fontSize: 13 * k }]}>Nobody’s scored yet. First run takes it.</Text>}
        {rows.map((row) => {
          const mine = row.userId === data.me?.userId;
          const person = avatars.get(row.userId);
          return <View key={row.userId} style={[styles.boardRow, { height: story ? 35 : 26 }, mine && { backgroundColor: 'rgba(228,255,58,0.85)' }]}>
            <View style={[styles.medal, { width: 20 * k, height: 20 * k, backgroundColor: row.rank === 1 ? '#FFD34E' : row.rank === 2 ? '#C9CFD6' : row.rank === 3 ? '#E0A06A' : 'rgba(18,18,18,0.08)' }]}>
              <Text style={{ fontFamily: fontFamily('black'), fontSize: 10.5 * k, color: colors.ink }}>{row.rank}</Text>
            </View>
            <View style={{ borderRadius: 30, borderWidth: 1, borderColor: colors.ink }}><Avatar name={person?.name ?? row.name} src={person?.url} avatarStyle={person?.style} size={story ? 23 : 18} round /></View>
            <Text style={[styles.boardName, { fontSize: 12 * k }]} numberOfLines={1}>{mine ? 'You' : row.name.split(' ')[0]}</Text>
            <Text style={[styles.boardName, { fontSize: 12 * k, flex: 0 }]}>{row.score}</Text>
          </View>;
        })}
      </View>
      <View style={[styles.cta, { marginTop: story ? 16 : 10, height: story ? 83 : 64 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.ctaLabel, { fontSize: 10.5 * k }]}>JOIN WITH CODE</Text>
          <Text style={[styles.code, { fontSize: story ? 38 : 30 }]} numberOfLines={1} adjustsFontSizeToFit>{data.code}</Text>
        </View>
        <View style={[styles.arrow, { width: 44 * k, height: 44 * k }]}>
          <Svg width={20 * k} height={20 * k} viewBox="0 0 24 24"><Path d="M4 20 20 4M9 4h11v11" fill="none" stroke={colors.volt} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </View>
      </View>
      <Text style={[styles.link, { marginTop: 'auto', marginBottom: story ? 20 : 10, fontSize: 10.5 * k }]}>{data.link}</Text>
    </View>
  </View>;
}

/** A designed card of the competition to post, plus one-tap links for WhatsApp and X. */
export function ShareCompetitionSheet({ open, onOpenChange, table, rows, viewerId, unit }: { open: boolean; onOpenChange: (open: boolean) => void; table: CompetitionTable; rows: StandingRow[]; viewerId?: string; unit: Unit }) {
  const [format, setFormat] = useState<CardFormat>('story');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const card = useRef<ComponentRef<typeof View>>(null);
  const url = `${WEB_URL}/competitions/${table.code}`;
  const data = useMemo(() => competitionCardData(table, rows, viewerId, unit, Date.now(), `${WEB_URL.replace(/^https?:\/\//, '')}/competitions/${table.code}`), [table, rows, viewerId, unit]);
  const avatars = useMemo(() => new Map(rows.map((row) => [row.userId, { name: row.displayName, url: row.avatarUrl ?? null, style: row.avatarStyle }])), [rows]);
  const mine = rows.find((row) => row.userId === viewerId);
  const caption = mine && hasScored(table.scoringMethod, mine.score)
    ? `I’m #${mine.rank} in “${table.title}” on Jump. Think you can beat me? Join with code ${table.code}`
    : `I’m in “${table.title}” on Jump. Join me with code ${table.code}`;
  const { w, h } = BASE[format];
  const preview = format === 'story' ? 0.62 : 0.82;

  async function share() {
    setBusy(true);
    setStatus(null);
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, width: 1080, height: Math.round((1080 * h) / w), result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: table.title, UTI: 'public.png' });
      else setStatus('Sharing isn’t available on this phone.');
    } catch {
      setStatus('Couldn’t make the card. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <Sheet open={open} onOpenChange={onOpenChange} title="Share this competition">
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
      {([['story', 'Story', 'Instagram · WhatsApp status'], ['post', 'Post', 'X · chats · feed']] as const).map(([value, label, hint]) => <Pressable key={value} onPress={() => { haptic(); setFormat(value); }}
        accessibilityRole="tab" accessibilityState={{ selected: format === value }} style={[styles.format, format === value && { backgroundColor: colors.ink }]}>
        <Txt size={14} weight="bold" color={format === value ? 'paper' : 'ink'}>{label}</Txt>
        <Txt size={11} style={{ color: format === value ? 'rgba(242,239,232,0.7)' : colors.ink3 }}>{hint}</Txt>
      </Pressable>)}
    </View>
    {/* The preview is the card itself, scaled down; the capture renders it full size. */}
    <View style={{ alignItems: 'center', marginTop: 16 }}>
      <View style={[styles.preview, { width: w * preview, height: h * preview }]}>
        <View style={{ transform: [{ scale: preview }], transformOrigin: 'top left' }}>
          <View ref={card} collapsable={false}><CompetitionCard data={data} format={format} avatars={avatars} /></View>
        </View>
      </View>
    </View>
    <Button full title={busy ? 'Making your card…' : 'Share card'} icon={<ShareIcon size={16} />} loading={busy} style={{ marginTop: 16 }} onPress={() => void share()} />
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <Button variant="secondary" size="sm" full style={{ flex: 1 }} title="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${caption} ${url}`)}`)} />
      <Button variant="secondary" size="sm" full style={{ flex: 1 }} title="X" onPress={() => void Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(url)}`)} />
    </View>
    <Pressable onPress={() => void Clipboard.setStringAsync(`${caption} ${url}`).then(() => { haptic('success'); setStatus('Caption and link copied.'); })} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 }} accessibilityRole="button">
      <CopyIcon size={14} color={colors.ink2} /><Txt size={13} weight="semibold" color="ink2">Copy caption and link</Txt>
    </Pressable>
    <Txt size={status ? 13 : 12} color={status ? 'ink2' : 'ink3'} align="center" style={{ marginTop: 8 }}>{status ?? 'On Instagram, add a link sticker to your story so people can tap straight in.'}</Txt>
  </Sheet>;
}

const styles = StyleSheet.create({
  format: { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 8 },
  preview: { borderRadius: 12, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.ink, overflow: 'hidden' },
  callout: { borderRadius: 999, backgroundColor: colors.volt, paddingHorizontal: 11, justifyContent: 'center' },
  calloutText: { fontFamily: fontFamily('black', 'wide'), color: colors.ink },
  kind: { fontFamily: fontFamily('extrabold', 'wide'), color: 'rgba(242,239,232,0.65)' },
  big: { fontFamily: fontFamily('extrabold', 'narrow'), letterSpacing: -2, marginLeft: -2, marginTop: 4 },
  small: { fontFamily: fontFamily('extrabold', 'wide'), color: PAPER, marginTop: 4 },
  title: { fontFamily: fontFamily('extrabold'), color: PAPER },
  chip: { borderRadius: 999, backgroundColor: 'rgba(242,239,232,0.12)', paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: fontFamily('extrabold', 'wide'), color: PAPER },
  board: { borderRadius: 12, backgroundColor: PAPER, paddingHorizontal: 6 },
  boardTitle: { fontFamily: fontFamily('extrabold', 'wide'), color: 'rgba(18,18,18,0.5)', marginLeft: 8, marginBottom: 4 },
  boardEmpty: { fontFamily: fontFamily('bold'), color: colors.ink, marginLeft: 8, paddingVertical: 8 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 8 },
  medal: { borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  boardName: { flex: 1, fontFamily: fontFamily('extrabold'), color: colors.ink },
  cta: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.volt, paddingHorizontal: 16 },
  ctaLabel: { fontFamily: fontFamily('black', 'wide'), color: colors.ink },
  code: { fontFamily: mono.replace('Regular', 'SemiBold'), color: colors.ink, marginTop: 2 },
  arrow: { borderRadius: 40, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  link: { fontFamily: fontFamily('bold'), color: 'rgba(242,239,232,0.7)', textAlign: 'center' },
});
