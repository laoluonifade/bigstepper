import { formatDate, ordinal } from '@jump/shared/format';
import { useQuery } from '@tanstack/react-query';
import { router, usePathname, type Href } from 'expo-router';
import { useEffect, useId, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { api, WEB_URL } from '@/lib/api';
import { Storage } from '@/lib/kv';
import { useRecorder } from '@/lib/recorder';
// The celebration is always dark, like the finish screen; the shelf follows the theme.
import { brand, colors, display, fontFamily, score, wideLabel } from '@/lib/theme';
import { Burst } from './FinishCelebration';
import { METALS } from './Milestones';
import { haptic, SectionTitle, Txt } from './ui';

export interface Trophy {
  tableId: string; code: string; title: string; challengeType: string; scoringMethod: string; bannerUrl: string | null;
  endedAt: string; rank: number; entrants: number; score: number | null;
  /** A won duel: tableId is the duel's id and there's no code. */
  kind?: 'competition' | 'duel';
}

/** Where a trophy opens: the competition's final board, or the duel. */
const trophyPath = (trophy: Trophy): Href => (trophy.kind === 'duel' ? `/duels/${trophy.tableId}` : `/competitions/${trophy.code}`);
export type TrophyCabinetData = { wins: number; podiums: number; trophies: Trophy[] };

const METAL_FOR = { 1: METALS.gold, 2: METALS.silver, 3: METALS.bronze } as const;

/** Yours, or someone else's by handle. */
export function useTrophies(username?: string) {
  return useQuery({
    queryKey: ['trophies', username ?? 'me'],
    queryFn: () => api<TrophyCabinetData>(username ? `/users/${encodeURIComponent(username)}/trophies` : '/me/trophies'),
    staleTime: 60_000,
  });
}

/** A 3D podium medal on a ribbon, the same make as the milestone medals: gold, silver or bronze. */
export function TrophyMedal({ rank, size = 64 }: { rank: number; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const metal = METAL_FOR[Math.min(3, Math.max(1, rank)) as 1 | 2 | 3];
  return <Svg viewBox="0 0 72 84" width={size} height={size * (84 / 72)} accessibilityElementsHidden>
    <Defs>
      <LinearGradient id={`rim-${uid}`} x1="0" y1="0" x2="0.4" y2="1"><Stop offset="0" stopColor={metal.rim[0]} /><Stop offset="1" stopColor={metal.rim[1]} /></LinearGradient>
      <RadialGradient id={`face-${uid}`} cx="0.35" cy="0.3" r="0.85"><Stop offset="0" stopColor={metal.face[0]} /><Stop offset="1" stopColor={metal.face[1]} /></RadialGradient>
      <LinearGradient id={`gloss-${uid}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#fff" stopOpacity="0.75" /><Stop offset="1" stopColor="#fff" stopOpacity="0" /></LinearGradient>
      <ClipPath id={`clip-${uid}`}><Circle cx="36" cy="46" r="22" /></ClipPath>
    </Defs>
    {/* The ribbon: two tails in Jump's orange and volt, behind the coin. */}
    <Path d="M22 2h12l8 26H30z" fill={brand.track} />
    <Path d="M50 2H38l-8 26h12z" fill={brand.volt} />
    <Path d="M22 2h12l8 26H30z M50 2H38l-8 26h12z" fill="none" stroke={brand.ink} strokeWidth="1.4" strokeLinejoin="round" />
    {/* Ground shadow, the coin's thickness, then the rim and face. */}
    <Ellipse cx="36" cy="80" rx="20" ry="3.2" fill="#121212" opacity={0.22} />
    <Circle cx="36" cy="50" r="29" fill={metal.edge} />
    <Circle cx="36" cy="46" r="29" fill={`url(#rim-${uid})`} />
    <Circle cx="36" cy="46" r="22.5" fill={metal.edge} opacity="0.55" />
    <Circle cx="36" cy="46.8" r="22" fill={`url(#face-${uid})`} />
    <Circle cx="36" cy="46" r="25.5" fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth="0.8" strokeDasharray="1.2 2.2" />
    {/* The place, embossed: a light offset under the dark numeral reads as raised metal. */}
    <SvgText x="36.8" y="56.6" textAnchor="middle" fontSize="28" fontFamily="ArchivoNarrow-Bold" fill="#fff" fillOpacity={0.6}>{rank}</SvgText>
    <SvgText x="36" y="55.6" textAnchor="middle" fontSize="28" fontFamily="ArchivoNarrow-Bold" fill={metal.ink} fillOpacity={0.9}>{rank}</SvgText>
    <G clipPath={`url(#clip-${uid})`}>
      <Ellipse cx="29" cy="32" rx="20" ry="11" fill={`url(#gloss-${uid})`} transform="rotate(-20 29 32)" />
    </G>
  </Svg>;
}

/**
 * The trophy cabinet: a shelf of medals, one per podium finish, each engraved with the competition and
 * when it ended. Tap one for its final board. Shown on your profile and on anyone's public profile.
 */
export function TrophyCabinet({ username, own = false }: { username?: string; own?: boolean }) {
  const cabinet = useTrophies(username);
  const data = cabinet.data;
  if (!data || (!data.trophies.length && !own)) return null;
  return <View>
    <SectionTitle aside={data.podiums ? `${data.wins} ${data.wins === 1 ? 'win' : 'wins'} · ${data.podiums} ${data.podiums === 1 ? 'podium' : 'podiums'}` : undefined}>Trophy cabinet</SectionTitle>
    {!data.trophies.length
      ? <View style={styles.empty}>
        <View style={{ opacity: 0.35 }}><TrophyMedal rank={1} size={44} /></View>
        <Txt size={13} color="ink2" leading={1.45} style={{ flex: 1 }}>Finish in the top three of a competition and your medal lands here.</Txt>
      </View>
      : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
        {data.trophies.map((trophy) => <Pressable key={trophy.tableId} onPress={() => { haptic(); router.push(trophyPath(trophy)); }}
          accessibilityRole="button" accessibilityLabel={`${ordinal(trophy.rank)} in ${trophy.title}`} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}>
          <TrophyMedal rank={trophy.rank} size={58} />
          <Txt size={13} weight="bold" numberOfLines={2} align="center" style={{ marginTop: 6 }}>{trophy.title}</Txt>
          <Txt size={11} color="ink3" align="center" style={{ marginTop: 2 }}>{`${ordinal(trophy.rank)} of ${trophy.entrants} · ${formatDate(trophy.endedAt)}`}</Txt>
        </Pressable>)}
      </ScrollView>}
  </View>;
}

const SEEN_KEY = 'jump_trophies_seen';
/** Only recent wins get the celebration; older ones are already on the shelf. */
const FRESH_MS = 5 * 86_400_000;
/** Not over a run in progress, the run screen, or a chat. */
const QUIET = [/^\/run/, /^\/messages\/.+/, /\/chat$/, /^\/welcome/];

function readSeen(): Set<string> | null {
  try {
    const raw = Storage.getItemSync(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch { return null; }
}
function writeSeen(ids: Set<string>) {
  try { Storage.setItemSync(SEEN_KEY, JSON.stringify([...ids].slice(-300))); } catch { /* fine */ }
}

/**
 * "You won": the first time the app sees a new podium finish, a full-screen moment: the medal drops in
 * with confetti and a thud, then share it or see the final board. Once per trophy.
 */
export function TrophyCelebration() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const recorder = useRecorder();
  const cabinet = useTrophies();
  const [shown, setShown] = useState<Trophy | null>(null);

  useEffect(() => {
    const trophies = cabinet.data?.trophies;
    if (!trophies || shown) return;
    if (QUIET.some((pattern) => pattern.test(pathname)) || recorder.phase === 'recording' || recorder.phase === 'paused') return;
    let seen = readSeen();
    // First time on this phone: everything already won counts as seen, except the last few days'.
    if (!seen) {
      seen = new Set(trophies.filter((trophy) => Date.now() - new Date(trophy.endedAt).getTime() > FRESH_MS).map((trophy) => trophy.tableId));
      writeSeen(seen);
    }
    const next = trophies.find((trophy) => !seen.has(trophy.tableId) && Date.now() - new Date(trophy.endedAt).getTime() <= FRESH_MS);
    if (!next) return;
    seen.add(next.tableId);
    writeSeen(seen);
    setShown(next);
  }, [cabinet.data, pathname, recorder.phase, shown]);

  useEffect(() => {
    if (!shown) return;
    haptic('heavy');
    const timer = setTimeout(() => haptic('success'), 420);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  const close = () => setShown(null);
  const headline = shown.rank === 1 ? 'You won.' : `${ordinal(shown.rank)} place.`;
  const share = () => {
    haptic('medium');
    void Share.share({ message: `${shown.rank === 1 ? '🥇 I won' : shown.rank === 2 ? '🥈 I came 2nd in' : '🥉 I came 3rd in'} ${shown.title} on Jump. ${WEB_URL}${String(trophyPath(shown))}` });
  };
  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <View style={[styles.screen, { paddingTop: insets.top + 40, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
      <View style={styles.glow} pointerEvents="none" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Burst />
          <Animated.View entering={ZoomIn.springify().damping(9).stiffness(140)}>
            <TrophyMedal rank={shown.rank} size={150} />
          </Animated.View>
        </View>
        <Animated.Text entering={FadeInDown.delay(300).duration(420)} style={[display(48), styles.headline]}>{headline}</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(420).duration(420)} style={styles.title} numberOfLines={2}>{shown.title}</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(520).duration(420)} style={styles.sub}>{`${ordinal(shown.rank)} of ${shown.entrants} · ${formatDate(shown.endedAt, { year: 'numeric' })}`}</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(620).duration(420)} style={[wideLabel(11, 0.12), styles.kicker]}>In your trophy cabinet now</Animated.Text>
      </View>
      <Animated.View entering={FadeInDown.delay(760)} style={{ alignSelf: 'stretch', gap: 10 }}>
        <Pressable onPress={share} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.primaryText}>Share it</Text></Pressable>
        <Pressable onPress={() => { haptic(); close(); router.push(trophyPath(shown)); }} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.secondaryText}>{shown.kind === 'duel' ? 'See the duel' : 'See the final board'}</Text>
        </Pressable>
        <Pressable onPress={close} hitSlop={8} style={{ alignSelf: 'center', padding: 8 }} accessibilityRole="button"><Text style={styles.close}>Close</Text></Pressable>
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, padding: 14 },
  tile: { width: 120, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingVertical: 12, paddingHorizontal: 8 },
  screen: { flex: 1, backgroundColor: brand.ink, paddingHorizontal: 24, alignItems: 'center' },
  glow: { position: 'absolute', top: -160, width: 560, height: 560, borderRadius: 280, backgroundColor: brand.volt, opacity: 0.1 },
  headline: { color: brand.volt, marginTop: 28, textAlign: 'center' },
  title: { fontFamily: fontFamily('bold'), fontSize: 20, color: brand.paper, marginTop: 10, textAlign: 'center' },
  sub: { ...score(18), color: 'rgba(242,239,232,0.6)', marginTop: 6 },
  kicker: { color: 'rgba(242,239,232,0.45)', marginTop: 18, fontFamily: fontFamily('bold', 'wide') },
  primary: { height: 58, borderRadius: 29, backgroundColor: brand.volt, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fontFamily('bold'), fontSize: 17, color: brand.ink },
  secondary: { height: 54, borderRadius: 27, backgroundColor: 'rgba(242,239,232,0.12)', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fontFamily('semibold'), fontSize: 16, color: brand.paper },
  close: { fontFamily: fontFamily('semibold'), fontSize: 14, color: 'rgba(242,239,232,0.55)' },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
});
