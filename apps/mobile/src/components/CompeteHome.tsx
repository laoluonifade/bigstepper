import { phaseLine, prizeLabel } from '@jump/shared/competition';
import { formatCountdown, formatDistance, ordinal } from '@jump/shared/format';
import { formatGap, hasScored, towardLeader } from '@jump/shared/scoring';
import { TEMPLATES } from '@jump/shared/templates';
import type { AvatarStyle, ChallengeType, CompetitionTable, ScoringMethod, StandingRow, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { api, post } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { keys, useDiscover, useStandings } from '@/lib/queries';
import { brand, colors, fontFamily, radius, scheme } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { ChallengeMark, CompetitionPreviewCard, openCompetition } from './competition';
import { ChevronRightIcon, LadderIcon, PlusIcon, SearchIcon, UsersIcon } from './icons';
import { Avatar, ErrorNotice, haptic, HardShadow, Skeleton, Txt } from './ui';

export type MyCompetition = {
  id: string; code: string; title: string; type: string; challengeType: ChallengeType; scoringMethod: ScoringMethod; targetDistanceMetres: number | null;
  status: string; startsAt: string | null; scoringClosesAt: string | null; visibility: string; hosting: boolean; joined: boolean;
  entrants: number; myRank: number | null; myScore: number | null; leaderScore: number | null;
  /** The runners either side of you on the board. */
  aheadScore: number | null; aheadName: string | null; behindScore: number | null; behindName: string | null;
};

export function useMyCompetitions() {
  return useQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<MyCompetition[]>('/tables/mine'), refetchInterval: 60_000 });
}

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const LIVE_STATUSES = ['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'];

/** The web's small-shadow card: ink outline, a 2px hard shadow. */
function HomeCard({ children }: { children: ReactNode }) {
  return <HardShadow offset={2} radius={radius.xl}>
    <View style={styles.card}>{children}</View>
  </HardShadow>;
}

/** Section heading: quiet title on the left, one small action on the right. */
export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return <View style={styles.sectionHead}>
    <Txt size={15} weight="bold" accessibilityRole="header">{title}</Txt>
    {action}
  </View>;
}

function SeeAll({ label = 'See all', onPress = () => router.navigate('/competitions') }: { label?: string; onPress?: () => void }) {
  return <Pressable onPress={onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityRole="link">
    <Txt size={13} weight="semibold" color="ink2">{label}</Txt>
    <ChevronRightIcon size={14} color={colors.ink2} />
  </Pressable>;
}

const CHIPS: Array<{ label: string; activity: 'all' | ChallengeType }> = [
  { label: 'All', activity: 'all' },
  { label: 'Run', activity: 'RUN' },
  { label: 'Walk', activity: 'WALK' },
  { label: 'Ride', activity: 'CYCLING' },
  { label: 'Steps', activity: 'STEP' },
  { label: 'Timed', activity: 'TIMED' },
];

/** Search competitions, or paste an invite code to go straight to one. */
export function CompetitionSearch() {
  const [term, setTerm] = useState('');
  function submit() {
    const value = term.trim();
    if (/^[0-9A-F]{8}$/i.test(value)) openCompetition(value.toUpperCase());
    else router.navigate({ pathname: '/competitions', params: value ? { q: value } : {} });
  }
  return <View>
    <View style={styles.search}>
      <SearchIcon size={17} color={colors.ink3} />
      <TextInput value={term} onChangeText={setTerm} onSubmitEditing={submit} returnKeyType="search" placeholder="Search competitions or enter a code" placeholderTextColor={colors.ink3}
        style={styles.searchInput} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search competitions or enter an invite code" />
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {CHIPS.map((chip) => <Pressable key={chip.label} onPress={() => router.navigate({ pathname: '/competitions', params: chip.activity === 'all' ? {} : { activity: chip.activity } })}
        style={({ pressed }) => [styles.chip, pressed && { borderColor: colors.edge }]}>
        <Txt size={13} weight="semibold" color="ink2">{chip.label}</Txt>
      </Pressable>)}
    </View>
  </View>;
}

const scoreOf = (value: number | null) => (value === null ? null : Number(value));

/**
 * The race for the home banner: of your live ones, one you've actually moved in, then the one you're
 * closest to leading (first place counts as all the way), then whichever ends soonest.
 */
function heroRace(live: MyCompetition[]) {
  const scored = (table: MyCompetition) => hasScored(table.scoringMethod, scoreOf(table.myScore));
  const along = (table: MyCompetition) => (table.myRank === 1 ? 1 : towardLeader(table.scoringMethod, scoreOf(table.myScore), scoreOf(table.leaderScore)));
  const ends = (table: MyCompetition) => (table.scoringClosesAt ? new Date(table.scoringClosesAt).getTime() : Infinity);
  return live.filter((table) => table.joined).sort((a, b) => Number(scored(b)) - Number(scored(a)) || along(b) - along(a) || ends(a) - ends(b))[0];
}

/** Where you stand, in a few words: leading, behind by how much, or not started. */
function standingLine(table: MyCompetition, unit: Unit) {
  const mine = table.myScore === null ? null : Number(table.myScore);
  const leader = table.leaderScore === null ? null : Number(table.leaderScore);
  if (!table.joined) return 'Hosting';
  if (!hasScored(table.scoringMethod, mine)) return 'No score yet';
  if (table.myRank === 1) return table.entrants > 1 ? 'Leading' : 'On top';
  if (leader === null) return '';
  if (leader === mine) return 'Level with the leader';
  return `${formatGap(table, mine!, leader, unit)} behind`;
}

/** Your live competitions after the hero: two at most, each one line of where you stand. */
export function MyCompetitions({ unit, now }: { unit: Unit; now: number }) {
  const mine = useMyCompetitions();
  const live = (mine.data ?? []).filter((table) => LIVE_STATUSES.includes(table.status) && (!table.scoringClosesAt || new Date(table.scoringClosesAt).getTime() > now));

  if (mine.isLoading) return null;
  if (!live.some((table) => table.joined)) return <RecommendedJoin unit={unit} now={now} />;
  const heroId = heroRace(live)?.id;
  const others = live.filter((table) => table.id !== heroId);
  if (!others.length) return null;
  return <View>
    <SectionHead title="Your other races" action={others.length > 2 ? <SeeAll label={`All ${others.length}`} /> : undefined} />
    <View style={{ gap: 8 }}>
      {others.slice(0, 2).map((table) => {
        const leading = table.joined && table.myRank === 1 && Number(table.myScore ?? 0) > 0;
        const ends = table.startsAt && new Date(table.startsAt).getTime() > now ? `Starts in ${formatCountdown(table.startsAt, now)}` : table.scoringClosesAt ? `${formatCountdown(table.scoringClosesAt, now)} left` : 'Open-ended';
        const along = towardLeader(table.scoringMethod, table.myScore === null ? null : Number(table.myScore), table.leaderScore === null ? null : Number(table.leaderScore));
        return <Pressable key={table.id} onPress={() => openCompetition(table.code)} style={({ pressed }) => [styles.raceRow, pressed && { backgroundColor: colors.inkWash }]}>
          <ChallengeMark type={table.challengeType} code={table.code} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={15} weight="semibold" numberOfLines={1}>{table.title}</Txt>
            <Txt size={12} color="ink3" num numberOfLines={1} style={{ marginTop: 2 }}>{`${ends} · ${standingLine(table, unit)}`}</Txt>
            {table.joined && <View style={styles.rowTrack}><View style={{ height: '100%', borderRadius: 2, width: `${Math.max(3, (leading ? 1 : along) * 100)}%`, backgroundColor: leading ? colors.ok : colors.track }} /></View>}
          </View>
          {table.joined && table.myRank !== null && <Text style={[styles.rowRank, leading && { color: colors.ok }]}>{ordinal(table.myRank)}</Text>}
        </Pressable>;
      })}
    </View>
  </View>;
}

/** One competition as a single tidy row, shared by the home lists. */
function CompactRow({ table, unit, now, trailing, first }: { table: CompetitionTable; unit: Unit; now: number; trailing?: ReactNode; first?: boolean }) {
  const prize = prizeLabel(table, unit);
  return <View style={[styles.compact, !first && styles.rowLine]}>
    <ChallengeMark type={table.challengeType} code={table.code} size={36} />
    <Pressable onPress={() => openCompetition(table.code)} style={{ flex: 1, minWidth: 0 }} accessibilityRole="link">
      <Txt size={14} weight="semibold" numberOfLines={1}>{table.title}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <UsersIcon size={12} color={colors.ink3} />
        <Txt size={12} color="ink3" num numberOfLines={1} style={{ flexShrink: 1 }}>{`${table.entrantCount ?? 0} · ${phaseLine(table, now).replace(/^Ends in /, '')} left · `}</Txt>
        <Txt size={12} weight="semibold" color={prize.prize ? 'ok' : 'ink2'}>{prize.text}</Txt>
      </View>
    </Pressable>
    {trailing}
  </View>;
}

/** The most-joined open competitions: two cards with their boards. */
export function TrendingCompetitions({ unit, now }: { unit: Unit; now: number }) {
  const trending = useDiscover('trending');
  const list = (trending.data?.pages.flatMap((page) => page.items) ?? []).slice(0, 2);
  if (!trending.isLoading && !list.length) return null;
  return <View>
    <SectionHead title="Popular right now" action={<SeeAll />} />
    {trending.isLoading ? <Skeleton style={{ height: 176, borderRadius: radius['2xl'] }} /> : <View style={{ gap: 12 }}>
      {list.map((table) => <CompetitionPreviewCard key={table.id} table={table} unit={unit} now={now} />)}
    </View>}
  </View>;
}

export function CreateCompetitionCta() {
  return <Pressable onPress={() => router.push('/competitions/new')} accessibilityRole="button">
    {({ pressed }) => <HardShadow offset={2} radius={radius.xl} pressed={pressed}>
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 }]}>
        <View style={styles.plus}><PlusIcon size={19} color={colors.paper} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={15} weight="bold">Start a competition</Txt>
          <Txt size={13} color="ink3">Set the rules and bring your people.</Txt>
        </View>
        <ChevronRightIcon size={18} color={colors.ink3} />
      </View>
    </HardShadow>}
  </Pressable>;
}

/**
 * Competitions picked for you, with one tap to join. Free ones join instantly; paid ones are left to pay
 * for on their page (never charged without the runner's say).
 */
export function RecommendedJoin({ unit, now, limit = 2, onDone, title = 'Picked for you', freeOnly = false, empty = null }: {
  unit: Unit; now: number; limit?: number; onDone?: () => void; title?: string; freeOnly?: boolean; empty?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const feed = useDiscover('for-you', freeOnly ? 'free' : 'all');
  const all = (feed.data?.pages.flatMap((page) => page.items) ?? []).filter((table) => table.myRank === null || table.myRank === undefined);
  const picks = all.slice(0, limit);
  const free = picks.filter((table) => table.type !== 'paid');
  const join = useMutation({
    mutationFn: (ids: string[]) => post<{ joined: string[]; needsPayment: string[] }>('/tables/join-many', { ids }),
    async onSuccess(result) {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['tables'] }), queryClient.invalidateQueries({ queryKey: keys.tables })]);
      if (result.joined.length) {
        haptic('success');
        toast({ tone: 'ok', title: `You’re in ${result.joined.length === 1 ? 'a competition' : `${result.joined.length} competitions`}`, message: 'Every run you record now counts toward your rank.' });
      }
      const paid = picks.find((table) => result.needsPayment.includes(table.id));
      if (paid) openCompetition(paid.code);
      onDone?.();
    },
  });

  if (feed.isLoading) return <View><SectionHead title={title} /><Skeleton style={{ height: 144, borderRadius: radius.xl }} /></View>;
  if (!picks.length) return <>{empty}</>;
  return <View>
    <SectionHead title={title} action={all.length > limit ? <SeeAll /> : undefined} />
    <HomeCard>
      {picks.map((table, index) => <CompactRow key={table.id} first={index === 0} table={table} unit={unit} now={now} trailing={
        <Pressable disabled={join.isPending} onPress={() => (table.type === 'paid' ? openCompetition(table.code) : join.mutate([table.id]))}
          style={({ pressed }) => [styles.smallButton, (pressed || join.isPending) && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={`${table.type === 'paid' ? 'View' : 'Join'} ${table.title}`}>
          <Txt size={13} weight="bold">{table.type === 'paid' ? 'View' : 'Join'}</Txt>
        </Pressable>
      } />)}
      {free.length > 1 && <View style={{ borderTopWidth: 1.5, borderTopColor: colors.ink, padding: 12 }}>
        <Pressable disabled={join.isPending} onPress={() => join.mutate(free.map((table) => table.id))} style={({ pressed }) => [styles.darkButton, (pressed || join.isPending) && { opacity: 0.7 }]} accessibilityRole="button">
          <Txt size={14} weight="bold" color="paper">{join.isPending ? 'Joining…' : `Join ${free.length === 2 ? 'both' : `all ${free.length}`}`}</Txt>
        </Pressable>
      </View>}
    </HomeCard>
    <ErrorNotice error={join.error} />
  </View>;
}

const laneScore = (row: StandingRow) => (row.score === null || row.score === undefined ? null : Number(row.score));

/** 0–1 along the track: how close to the leader, whichever way the score runs. */
function lanePosition(method: string, row: StandingRow, leader: StandingRow | undefined) {
  if (!hasScored(method, row.score) || !leader) return 0;
  return towardLeader(method, laneScore(row), laneScore(leader));
}

const firstName = (name: string) => name.split(' ')[0];

/**
 * The home summary's colours. On a dark page: dark cards with volt, as Apple Fitness does. On a light
 * page: light cards in ink, since volt can't be read on white. `good` is a lead or a target hit.
 */
const dark = scheme === 'dark';
export const SUMMARY = dark
  ? { card: brand.ink, edge: colors.line, text: brand.paper, muted: brand.onInkMuted, wash: brand.onInkWash, accent: brand.volt, good: brand.volt }
  : { card: colors.card, edge: colors.line, text: colors.ink, muted: colors.ink3, wash: colors.inkWash, accent: colors.ink, good: colors.ok };

/** Small ring for a race row: how close you are to the leader. */
export function MiniRing({ progress, size = 30, color = SUMMARY.accent }: { progress: number; size?: number; color?: string }) {
  const stroke = size * 0.17;
  const r = (size - stroke) / 2;
  const around = 2 * Math.PI * r;
  return <Svg width={size} height={size}>
    <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={SUMMARY.wash} strokeWidth={stroke} />
    <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={[Math.max(0.001, progress) * around, around]} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
  </Svg>;
}

/** You and the runners either side of you on one line, the volt fill showing how far toward the lead you are. */
function RaceLine({ progress, marks }: { progress: number; marks: Array<{ key: string; at: number; me: boolean; avatar: ReactNode }> }) {
  const [width, setWidth] = useState(0);
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(progress, { duration: 1200, easing: EASE });
  }, [fill, progress]);
  const filled = useAnimatedStyle(() => ({ width: fill.value * width }));
  const AV = 26;
  return <View style={{ height: AV + 4, justifyContent: 'center', marginTop: 20 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.lineTrack}><Animated.View style={[styles.lineFill, filled]} /></View>
    {width > 0 && marks.map((mark) => <View key={mark.key} style={{ position: 'absolute', left: Math.min(width - AV, Math.max(0, mark.at * width - AV / 2)), zIndex: mark.me ? 2 : 1 }}>
      <View style={[styles.mark, mark.me && { borderColor: dark ? brand.volt : colors.track }]}>{mark.avatar}</View>
    </View>)}
  </View>;
}

/**
 * The home hero: your most urgent race at a glance. Your place, how far you are from the lead (or ahead
 * of second), and a line with you between your neighbours. With no race of your own, it shows the
 * hottest open one with a button to join.
 */
export function RaceHero({ unit, now }: { unit: Unit; now: number }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const mine = useMyCompetitions();
  const trending = useDiscover('trending');
  const live = (mine.data ?? []).filter((table) => table.joined && LIVE_STATUSES.includes(table.status) && (!table.scoringClosesAt || new Date(table.scoringClosesAt).getTime() > now));
  const hot = trending.data?.pages[0]?.items[0];
  const featured = heroRace(live);
  const race = featured ?? (hot && { id: hot.id, code: hot.code, title: hot.title, challengeType: hot.challengeType, scoringMethod: hot.scoringMethod, scoringClosesAt: hot.scoringClosesAt, startsAt: hot.startsAt, entrants: hot.entrantCount ?? 0, type: hot.type });
  const joined = Boolean(featured);
  const standings = useStandings(race?.id, 60_000);
  const join = useMutation({
    mutationFn: () => post('/tables/join-many', { ids: [race!.id] }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      haptic('success');
      toast({ tone: 'ok', message: `You’re in ${race!.title}. Your next run counts.` });
    },
  });

  if (mine.isLoading || (!live.length && trending.isLoading)) return <Skeleton style={{ height: 176, borderRadius: 24 }} />;
  if (!race) return null;

  const rows = standings.data ?? [];
  const me = rows.find((row) => row.userId === user.id);
  const leader = rows[0];
  const method = race.scoringMethod;
  const ends = race.startsAt && new Date(race.startsAt).getTime() > now ? `Starts in ${formatCountdown(race.startsAt, now)}` : race.scoringClosesAt ? `${formatCountdown(race.scoringClosesAt, now)} left` : 'Open-ended';
  const myScore = me && hasScored(method, me.score) ? laneScore(me) : null;
  const second = rows[1] && hasScored(method, rows[1].score) ? laneScore(rows[1]) : null;
  const leaderScore = leader ? laneScore(leader) : null;

  // The number on the right: the gap that matters, in orange when you're chasing and volt when leading.
  let gap: { value: string; label: string; color: string } | null = null;
  if (joined && me) {
    if (myScore === null) gap = { value: '–', label: 'No score yet', color: SUMMARY.text };
    else if (me.rank === 1) gap = second === null ? { value: 'Lead', label: 'Out in front', color: SUMMARY.good }
      : second === myScore ? { value: 'Level', label: `with ${firstName(rows[1].displayName)}`, color: SUMMARY.text }
        : { value: formatGap(race, second, myScore, unit) ?? '–', label: `ahead of ${firstName(rows[1].displayName)}`, color: SUMMARY.good };
    else if (leaderScore === myScore) gap = { value: 'Level', label: `with ${firstName(leader.displayName)}`, color: SUMMARY.text };
    else if (leaderScore !== null) gap = { value: formatGap(race, myScore, leaderScore, unit) ?? '–', label: `behind ${firstName(leader.displayName)}`, color: colors.track };
  }

  // You and whoever's either side of you, placed by how close each is to the leader.
  const neighbours = me ? [rows[me.rank - 2], me, rows[me.rank]].filter((row): row is StandingRow => Boolean(row)) : [];
  const marks = neighbours.map((row) => ({
    key: row.userId, me: row.userId === user.id, at: hasScored(method, row.score) ? (row.rank === 1 ? 1 : lanePosition(method, row, leader)) : 0,
    avatar: <Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={22} round />,
  }));
  const progress = !joined || !me || myScore === null ? 0 : me.rank === 1 ? 1 : lanePosition(method, me, leader);

  // Always dark, in either theme: drawn in the brand palette, with a hairline edge on a dark page.
  return <Pressable onPress={() => openCompetition(race.code)} accessibilityRole="button" accessibilityLabel={`${race.title}, ${joined && me ? `${ordinal(me.rank)} of ${rows.length}` : `${race.entrants} in`}`}>
    {({ pressed }) => <View style={[styles.hero, pressed && { opacity: 0.92 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
        <Txt size={17} weight="bold" numberOfLines={1} style={{ flex: 1, color: SUMMARY.text }}>{race.title}</Txt>
        <Txt size={13} weight="semibold" num style={{ color: SUMMARY.muted }}>{ends}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rank}>{joined && me ? ordinal(me.rank) : race.entrants}</Text>
          <Txt size={13} weight="medium" style={{ color: SUMMARY.muted }}>{joined && me ? `of ${rows.length} ${rows.length === 1 ? 'runner' : 'runners'}` : race.entrants === 1 ? 'runner in' : 'runners in'}</Txt>
        </View>
        {gap && <View style={{ alignItems: 'flex-end', paddingBottom: 2 }}>
          <Text style={[styles.gap, { color: gap.color }]} numberOfLines={1}>{gap.value}</Text>
          <Txt size={13} weight="medium" numberOfLines={1} style={{ color: SUMMARY.muted }}>{gap.label}</Txt>
        </View>}
      </View>
      {joined && marks.length > 0 && <RaceLine progress={progress} marks={marks} />}
      {!joined && <Pressable onPress={() => { haptic(); if (race.type === 'paid') openCompetition(race.code); else join.mutate(); }} disabled={join.isPending}
        style={({ pressed: down }) => [styles.heroButton, (down || join.isPending) && { opacity: 0.8 }]} accessibilityRole="button">
        <Txt size={15} weight="bold" style={{ color: dark ? brand.ink : brand.paper }}>{race.type === 'paid' ? 'See entry' : join.isPending ? 'Joining…' : 'Join the race'}</Txt>
      </Pressable>}
      <ErrorNotice error={join.error} />
    </View>}
  </Pressable>;
}

type BoardRow = { rank: number; userId: string; metres: number; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; isMe: boolean };

/**
 * Under Go on Home: where you stand on this week's global board, the top three's faces, and the gap to
 * the runner just above you. Tapping opens the full leaderboard.
 */
export function LeaderboardPeek({ unit }: { unit: Unit }) {
  const board = useQuery({ queryKey: ['leaderboard', 'foot', 'week', 'global', 50], queryFn: () => api<{ rows: BoardRow[]; me: BoardRow | null }>('/leaderboard?activity=foot&period=week&scope=global&limit=50'), staleTime: 60_000 });
  const rows = board.data?.rows ?? [];
  const me = board.data?.me ?? null;
  const above = me ? rows.find((row) => row.rank === me.rank - 1) ?? null : null;
  const line = !board.data ? ' '
    : !me || !me.metres ? 'Walk or run this week to get on the board.'
      : me.rank === 1 ? 'You’re top of the world this week.'
        : above ? `${formatDistance(Math.max(0, above.metres - me.metres) + 10, unit)} to pass ${above.displayName.split(' ')[0]}`
          : 'Keep moving to climb.';
  return <Pressable onPress={() => { haptic(); router.push('/leaderboard'); }} accessibilityRole="link" accessibilityLabel="Open the leaderboard"
    style={({ pressed }) => [styles.peek, pressed && { opacity: 0.85 }]}>
    <View style={styles.peekRank}>
      {me && me.metres ? <Text style={styles.peekNumber} numberOfLines={1} adjustsFontSizeToFit>{`#${me.rank}`}</Text> : <LadderIcon size={22} color={brand.ink} />}
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt size={11} weight="bold" upper tracking={0.08} color="ink3">Leaderboard · this week</Txt>
      <Txt size={14} weight="semibold" numberOfLines={1} style={{ marginTop: 2 }}>{line}</Txt>
    </View>
    <View style={{ flexDirection: 'row' }}>
      {rows.slice(0, 3).map((row, index) => <View key={row.userId} style={{ marginLeft: index ? -10 : 0, borderRadius: 16, borderWidth: 2, borderColor: colors.card }}>
        <Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={28} round />
      </View>)}
    </View>
    <ChevronRightIcon size={16} color={colors.ink3} />
  </Pressable>;
}

const WHO_ICONS: Record<string, ReactNode> = {
  coworkers: <><Rect x="3" y="7" width="18" height="13" rx="2" /><Path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>,
  partner: <Path d="M12 20s-7-4.4-8.6-8.8C2.3 8 4.2 5 7.4 5c1.9 0 3.3 1.1 4.6 2.8C13.3 6.1 14.7 5 16.6 5c3.2 0 5.1 3 4 6.2C19 15.6 12 20 12 20Z" />,
  squad: <><Circle cx="9" cy="8" r="3" /><Circle cx="17" cy="9" r="2.5" /><Path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5.5" /></>,
  family: <><Path d="M4 11 12 4l8 7" /><Path d="M6 10v10h12V10" /><Path d="M10 20v-5h4v5" /></>,
};

/** Pick who you want to race and the competition is set up for you; all that's left is inviting them. */
export function ChallengeSomeone() {
  const options = [...TEMPLATES.map((template) => ({ id: template.id, who: template.who.replace(/^Your /, '').replace(/^./, (c) => c.toUpperCase()), short: template.short })), { id: 'custom', who: 'Custom', short: 'Your rules' }];
  return <View>
    <SectionHead title="Challenge someone" />
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {options.map((option) => <Pressable key={option.id} onPress={() => { haptic(); router.push(option.id === 'custom' ? '/competitions/new' : { pathname: '/competitions/new', params: { template: option.id } }); }}
        style={{ alignItems: 'center', flex: 1 }} accessibilityRole="button" accessibilityLabel={`Challenge ${option.who}: ${option.short}`}>
        {({ pressed }) => <>
          <View style={[styles.who, option.id === 'custom' && { borderStyle: 'dashed', borderColor: 'rgba(18,18,18,0.5)' }, pressed && { backgroundColor: colors.ink, transform: [{ scale: 0.95 }] }]}>
            {option.id === 'custom'
              ? <PlusIcon size={20} color={pressed ? colors.paper : colors.ink2} />
              : <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={pressed ? colors.paper : colors.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{WHO_ICONS[option.id]}</Svg>}
          </View>
          <Txt size={13} weight="bold" align="center" style={{ marginTop: 8 }}>{option.who}</Txt>
          <Txt size={11} color="ink3" align="center">{option.short}</Txt>
        </>}
      </Pressable>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, overflow: 'hidden' },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
  chip: { height: 32, justifyContent: 'center', borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14 },
  raceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 12 },
  rowTrack: { marginTop: 8, height: 4, borderRadius: 2, backgroundColor: colors.inkWash, overflow: 'hidden' },
  rowRank: { fontFamily: fontFamily('bold'), fontSize: 20, color: colors.ink },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  smallButton: { height: 32, justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.edge, paddingHorizontal: 12 },
  darkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.base, backgroundColor: colors.ink },
  plus: { width: 40, height: 40, borderRadius: radius.lg, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 24, borderWidth: 1, borderColor: SUMMARY.edge, backgroundColor: SUMMARY.card, padding: 20, overflow: 'hidden' },
  rank: { fontFamily: fontFamily('bold'), fontSize: 48, lineHeight: 52, letterSpacing: -1, color: SUMMARY.text },
  gap: { fontFamily: fontFamily('bold'), fontSize: 24, lineHeight: 28, letterSpacing: -0.3 },
  lineTrack: { height: 6, borderRadius: 3, backgroundColor: SUMMARY.wash, overflow: 'hidden' },
  lineFill: { height: 6, borderRadius: 3, backgroundColor: SUMMARY.accent },
  mark: { borderRadius: 15, borderWidth: 2, borderColor: SUMMARY.card },
  heroButton: { marginTop: 20, height: 48, borderRadius: radius.full, backgroundColor: dark ? brand.volt : brand.ink, alignItems: 'center', justifyContent: 'center' },
  peek: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingVertical: 12, paddingLeft: 12, paddingRight: 12 },
  peekRank: { width: 48, height: 48, borderRadius: 14, backgroundColor: brand.volt, borderWidth: 2, borderColor: brand.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  peekNumber: { fontFamily: fontFamily('black', 'narrow'), fontSize: 22, color: brand.ink },
  who: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
});
