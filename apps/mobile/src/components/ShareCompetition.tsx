import { competitionCardData, type CardFormat, type CompetitionCardData } from '@jump/shared/competition';
import { hasScored } from '@jump/shared/scoring';
import type { CompetitionTable, StandingRow, Unit } from '@jump/shared/types';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { ComponentRef, useMemo, useRef, useState } from 'react';
import { Linking, PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { WEB_URL, post } from '@/lib/api';
// Share pictures look the same whoever posts them, so they use the brand palette, not the theme's.
import { brand as colors, colors as theme, fontFamily, mono, radius } from '@/lib/theme';
import { CopyIcon, JumpLogo, LinkIcon, ShareIcon } from './icons';
import { Sheet } from './Sheet';
import { Sticker } from './Stickers';
import { Avatar, Button, haptic, Txt } from './ui';

/** The card's base size in points; it's captured at 1080 px wide, like the leaderboard picture. */
export const BASE = { story: { w: 360, h: 640 }, post: { w: 360, h: 450 } } as const;
export const PAD = 22;

type Person = CompetitionCardData['podium'][number];
type Faces = Map<string, { name: string; url: string | null; style?: StandingRow['avatarStyle'] }>;

/** Where each of the top three sits on the podium: left, top, width, height, tilt. First is raised in the middle. */
const PODIUM = {
  story: [[106, 0, 104, 146, 2], [0, 18, 98, 128, -4], [218, 22, 98, 124, 4]],
  post: [[106, 0, 104, 110, 2], [0, 12, 98, 98, -4], [218, 16, 98, 94, 4]],
} as const;
const PLACES = [{ place: '1st', bg: colors.volt }, { place: '2nd', bg: colors.card }, { place: '3rd', bg: colors.track }];

/** One of the top three as a sticker: place, face, name and score, as on the leaderboard picture. */
function PodiumSticker({ person, index, story, mine, faces }: { person: Person; index: number; story: boolean; mine: boolean; faces: Faces }) {
  const [x, y, w, h, tilt] = PODIUM[story ? 'story' : 'post'][index];
  const first = index === 0;
  const size = story ? (first ? 40 : 34) : (first ? 32 : 28);
  const face = faces.get(person.userId);
  return <Sticker p={colors} bg={PLACES[index].bg} tilt={tilt} padded={false} width={w} style={{ position: 'absolute', left: x, top: y }}>
    <View style={{ height: h - 3, alignItems: 'center', paddingTop: story ? 10 : 7 }}>
      <Text style={[shareStyles.place, { fontSize: first ? 10 : 9 }]}>{PLACES[index].place}</Text>
      <View style={{ marginTop: 2, borderRadius: size, borderWidth: 1.2, borderColor: colors.ink }}><Avatar name={face?.name ?? person.name} src={face?.url} avatarStyle={face?.style} size={size} round /></View>
      <Text style={[shareStyles.podiumName, { fontSize: first ? 11.5 : 10.5 }]} numberOfLines={1}>{mine ? 'You' : person.name.split(' ')[0]}</Text>
      <Text style={[shareStyles.podiumScore, { fontSize: story ? (first ? 22 : 18) : (first ? 18 : 15) }]} numberOfLines={1} adjustsFontSizeToFit>{person.score}</Text>
    </View>
  </Sticker>;
}

/**
 * The competition as a picture to post, in the leaderboard picture's sticker style: what it is, what wins,
 * who's on the podium, and the join code big enough to type from a story.
 */
function CompetitionCard({ data, format, faces }: { data: CompetitionCardData; format: CardFormat; faces: Faces }) {
  const { w: W, h: H } = BASE[format];
  const story = format === 'story';
  const podium = data.podium.slice(0, 3);
  const callout = data.me ? (data.me.scored && data.me.rank ? `I’m #${data.me.rank} · beat me` : 'I’m in · join me') : 'Join me';
  const meBelow = story && data.me?.scored && !podium.some((row) => row.userId === data.me!.userId) ? data.me : null;
  const cash = data.stakes.startsWith('₦');
  const chips = [data.stakes, `${data.entrants} in`, data.timing].filter(Boolean);
  return <View style={{ width: W, height: H, backgroundColor: colors.paper, overflow: 'hidden', paddingHorizontal: PAD, paddingTop: PAD }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <JumpLogo height={14} color={colors.ink} />
      <View style={shareStyles.tag}><Text style={shareStyles.tagText} numberOfLines={1}>{callout}</Text></View>
    </View>
    <Text style={[shareStyles.title, { marginTop: story ? 24 : 12, fontSize: story ? 30 : 21, lineHeight: story ? 32 : 22, height: story ? 64 : 44 }]} numberOfLines={2} adjustsFontSizeToFit>{data.title}</Text>
    <View style={[shareStyles.tag, { alignSelf: 'flex-start', marginTop: story ? 10 : 8 }]}><Text style={shareStyles.tagText} numberOfLines={1}>{data.kind}</Text></View>

    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: story ? 22 : 12 }}>
      <Sticker p={colors} bg={data.accent} tilt={-2} style={{ flex: 1.35, zIndex: 1, marginTop: 4 }}>
        <Text style={[shareStyles.big, { fontSize: story ? 58 : 44, lineHeight: story ? 60 : 46 }]} numberOfLines={1} adjustsFontSizeToFit>{data.big}</Text>
        <Text style={shareStyles.label} numberOfLines={1}>{data.small}</Text>
      </Sticker>
      <View style={{ flex: 1, marginLeft: -4, zIndex: 2 }}>
        {chips.map((text, index) => <Sticker key={index} p={colors} bg={index === 0 && cash ? colors.ink : colors.card} tilt={[3, -2, 2][index]} padded={false} style={{ marginTop: index ? -3 : 0, marginLeft: index === 1 ? -8 : 0 }}>
          <Text style={[shareStyles.chip, { paddingVertical: story ? 9 : 6 }, index === 0 && cash && { color: colors.volt }]} numberOfLines={1} adjustsFontSizeToFit>{text}</Text>
        </Sticker>)}
      </View>
    </View>

    <View style={{ height: story ? 150 : 112, marginTop: story ? 24 : 12 }}>
      {podium.length ? [1, 2, 0].map((index) => podium[index] ? <PodiumSticker key={index} person={podium[index]} index={index} story={story} mine={podium[index].userId === data.me?.userId} faces={faces} /> : null)
        : <Sticker p={colors} bg={colors.card} tilt={-1} style={{ marginTop: story ? 40 : 26 }}>
          <Text style={shareStyles.empty}>Nobody’s scored yet.</Text>
          <Text style={shareStyles.label}>First run takes it</Text>
        </Sticker>}
    </View>
    {meBelow && <Sticker p={colors} bg={colors.volt} tilt={1} padded={false} style={{ marginTop: 14 }}>
      <View style={shareStyles.meLine}>
        <Text style={shareStyles.meRank}>{meBelow.rank}</Text>
        <Text style={shareStyles.meName}>You</Text>
        <Text style={shareStyles.meScore}>{meBelow.score}</Text>
      </View>
    </Sticker>}

    <View style={{ position: 'absolute', left: PAD, right: PAD, bottom: story ? 44 : 38 }}>
      <Sticker p={colors} bg={colors.ink} tilt={-1.5} padded={false}>
        <View style={[shareStyles.code, { height: story ? 76 : 60 }]}>
          <View style={{ flex: 1 }}>
            <Text style={shareStyles.codeLabel}>Join with code</Text>
            <Text style={[shareStyles.codeText, { fontSize: story ? 38 : 30 }]} numberOfLines={1} adjustsFontSizeToFit>{data.code}</Text>
          </View>
          <View style={[shareStyles.arrow, { width: story ? 44 : 38, height: story ? 44 : 38 }]}>
            <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M4 20 20 4M9 4h11v11" fill="none" stroke={colors.ink} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </View>
        </View>
      </Sticker>
    </View>
    <View style={{ position: 'absolute', left: PAD, right: PAD, bottom: PAD - 6, flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[shareStyles.footer, { flexShrink: 1, marginRight: 8 }]} numberOfLines={1}>{data.link}</Text>
      <Text style={[shareStyles.footer, { color: colors.track }]}>MOVE. COMPETE. WIN.</Text>
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
  // Counted for the host's numbers (views and shares on the club dashboard). Fire and forget.
  const track = (channel: string) => void post(`/tables/${table.id}/shared`, { channel }).catch(() => undefined);
  const data = useMemo(() => competitionCardData(table, rows, viewerId, unit, Date.now(), `${WEB_URL.replace(/^https?:\/\//, '')}/competitions/${table.code}`), [table, rows, viewerId, unit]);
  const faces = useMemo(() => new Map(rows.map((row) => [row.userId, { name: row.displayName, url: row.avatarUrl ?? null, style: row.avatarStyle }])), [rows]);
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
      // iOS reads the size in points and renders at the screen's scale; Android reads pixels. Either way: 1080 px wide.
      const across = Platform.OS === 'ios' ? 1080 / PixelRatio.get() : 1080;
      const uri = await captureRef(card, { format: 'png', quality: 1, width: across, height: (across * h) / w, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) { track('card'); await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: table.title, UTI: 'public.png' }); }
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
        accessibilityRole="tab" accessibilityState={{ selected: format === value }} style={[shareStyles.format, format === value && { backgroundColor: theme.ink }]}>
        <Txt size={14} weight="bold" style={{ color: format === value ? theme.paper : theme.ink }}>{label}</Txt>
        <Txt size={11} style={{ color: format === value ? theme.paper : theme.ink3, opacity: format === value ? 0.7 : 1 }}>{hint}</Txt>
      </Pressable>)}
    </View>
    {/* The preview is the card itself, scaled down; the capture renders it full size. */}
    <View style={{ alignItems: 'center', marginTop: 16 }}>
      <View style={[shareStyles.preview, { width: w * preview, height: h * preview }]}>
        <View style={{ transform: [{ scale: preview }], transformOrigin: 'top left' }}>
          <CompetitionCard data={data} format={format} faces={faces} />
        </View>
      </View>
    </View>
    {/* What's captured: the same card at full size, off screen (capturing the shrunk preview saved a zoomed-in corner). */}
    <View style={shareStyles.offscreen} pointerEvents="none">
      <View ref={card} collapsable={false}><CompetitionCard data={data} format={format} faces={faces} /></View>
    </View>
    <Button full title={busy ? 'Making your card…' : 'Share card'} icon={<ShareIcon size={16} color={theme.onAccent} />} loading={busy} style={{ marginTop: 16 }} onPress={() => void share()} />
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <Button variant="secondary" size="sm" full style={{ flex: 1 }} title="WhatsApp" onPress={() => { track('whatsapp'); void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${caption} ${url}`)}`); }} />
      <Button variant="secondary" size="sm" full style={{ flex: 1 }} title="X" onPress={() => { track('x'); void Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(url)}`); }} />
    </View>
    {/* The link itself, on show, with a big Copy: what an Instagram link sticker or a group chat needs. */}
    <View style={shareStyles.linkBox}>
      <LinkIcon size={16} color={theme.ink2} />
      <Text numberOfLines={1} style={shareStyles.linkText}>{url.replace(/^https?:\/\//, '')}</Text>
      <Pressable onPress={() => void Clipboard.setStringAsync(url).then(() => { track('link'); haptic('success'); setStatus('Link copied. Paste it in a link sticker or a chat.'); })}
        style={({ pressed }) => [shareStyles.copyLink, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]} accessibilityRole="button" accessibilityLabel="Copy link">
        <CopyIcon size={14} color={colors.ink} /><Text style={shareStyles.copyLinkText}>COPY LINK</Text>
      </Pressable>
    </View>
    <Pressable onPress={() => void Clipboard.setStringAsync(`${caption} ${url}`).then(() => { track('link'); haptic('success'); setStatus('Caption and link copied.'); })} hitSlop={8} style={{ alignSelf: 'center', marginTop: 10 }} accessibilityRole="button">
      <Txt size={13} weight="semibold" color="ink2" style={{ textDecorationLine: 'underline' }}>Copy with a caption instead</Txt>
    </Pressable>
    <Txt size={status ? 13 : 12} color={status ? 'ink2' : 'ink3'} align="center" style={{ marginTop: 8 }}>{status ?? 'On Instagram, add a link sticker to your story so people can tap straight in.'}</Txt>
  </Sheet>;
}

export const shareStyles = StyleSheet.create({
  // On the sheet, so in the runner's theme; the Copy button is volt in both.
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, borderRadius: radius.lg, borderWidth: 1.5, borderColor: theme.edge, backgroundColor: theme.card, paddingLeft: 14, paddingRight: 6, height: 52 },
  linkText: { flex: 1, fontFamily: mono, fontSize: 13, color: theme.ink },
  copyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: radius.md, backgroundColor: colors.volt, paddingHorizontal: 12 },
  copyLinkText: { fontFamily: fontFamily('bold', 'wide'), fontSize: 11, letterSpacing: 0.6, color: colors.ink },
  format: { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: theme.ink, backgroundColor: theme.card, paddingHorizontal: 12, paddingVertical: 8 },
  preview: { borderRadius: 12, backgroundColor: colors.paper, overflow: 'hidden' },
  offscreen: { position: 'absolute', left: -10_000, top: 0 },
  tag: { borderRadius: 9, backgroundColor: colors.ink, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 316 },
  tagText: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 8.5, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.volt },
  title: { fontFamily: fontFamily('black', 'wide'), textTransform: 'uppercase', color: colors.ink },
  big: { fontFamily: fontFamily('extrabold', 'narrow'), letterSpacing: -1, textTransform: 'uppercase', color: colors.onAccent },
  label: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.ink, marginTop: 2 },
  chip: { fontFamily: fontFamily('extrabold', 'wide'), fontSize: 9, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.ink, textAlign: 'center', paddingHorizontal: 8 },
  place: { alignSelf: 'flex-start', marginLeft: 11, fontFamily: fontFamily('black', 'wide'), textTransform: 'uppercase', color: colors.ink },
  podiumName: { fontFamily: fontFamily('bold'), color: colors.ink, marginTop: 5, maxWidth: '88%' },
  podiumScore: { fontFamily: fontFamily('extrabold', 'narrow'), color: colors.ink, letterSpacing: -0.3, maxWidth: '90%' },
  empty: { fontFamily: fontFamily('extrabold'), fontSize: 16, color: colors.ink },
  meLine: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 34, paddingHorizontal: 14 },
  meRank: { width: 22, fontFamily: fontFamily('extrabold', 'narrow'), fontSize: 15, color: colors.ink },
  meName: { flex: 1, fontFamily: fontFamily('extrabold'), fontSize: 13, color: colors.ink },
  meScore: { fontFamily: fontFamily('extrabold', 'narrow'), fontSize: 16, color: colors.ink },
  code: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  codeLabel: { fontFamily: fontFamily('black', 'wide'), fontSize: 9.5, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.volt },
  codeText: { fontFamily: mono.replace('Regular', 'SemiBold'), color: colors.paper, marginTop: 2 },
  arrow: { borderRadius: 40, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center' },
  footer: { fontFamily: fontFamily('bold', 'wide'), fontSize: 7.5, textTransform: 'uppercase', color: colors.ink2 },
});
