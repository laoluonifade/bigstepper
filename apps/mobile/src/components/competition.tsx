import { canEnter, challengeHeadline, competitionPhase, phaseLine, prizeLabel, windowProgress } from '@jump/shared/competition';
import { formatCountdown, formatDateTime, formatDistance, formatMoney } from '@jump/shared/format';
import { activityLabel, formatScore, metricOf, towardLeader, winsLabel } from '@jump/shared/scoring';
import type { AvatarStyle, ChallengeType, CompetitionTable, Unit } from '@jump/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ReactNode, useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { brand, colors, fontFamily, mono, radius, score, wideLabel } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { ArrowRightIcon, ChevronRightIcon, LockIcon, UsersIcon } from './icons';
import { METALS } from './Milestones';
import { Avatar, haptic, HardShadow, LiveDot, Tag, Txt } from './ui';

export const openCompetition = (code: string) => router.push(`/competitions/${code}`);

const SYMBOLS: Record<ChallengeType, ReactNode> = {
  RUN: <><Circle cx="26" cy="9" r="3" /><Path d="m24 15-7 6 7 3 3 8m-3-17 8 4-3 6m-12-4-7 3m17 8 9 1" /></>,
  CYCLING: <><Circle cx="9" cy="29" r="6" /><Circle cx="31" cy="29" r="6" /><Path d="m9 29 7-15 7 15H9l9-10h5l8 10m-13-15h5m-9-4h5" /></>,
  WALK: <><Path d="M13 7c-2 7-3 14-3 20m8-18c1 7 2 13 5 19M8 32c4-2 7-1 9 3m6-2c4-2 7-1 9 2" /><Circle cx="12" cy="5" r="1" /><Circle cx="18" cy="6" r="1" /></>,
  DISTANCE: <><Circle cx="9" cy="29" r="3" /><Circle cx="31" cy="11" r="3" /><Path d="M12 28c13 2 4-15 16-16M18 20l4 2m-9 9 2-5" /></>,
  STEP: <><Path d="M5 29h8v-7h8v-7h8V8h7" /><Path d="M6 34h29" /><Circle cx="8" cy="12" r="2" /></>,
  TIMED: <><Circle cx="20" cy="22" r="12" /><Path d="M20 22V13m0 9 7 4M16 5h8M20 5v5" /></>,
};

/**
 * A 3D tile for the competition type, in the same metals as the milestone medals. The metal is picked
 * from the code, so each competition keeps its colour.
 */
export function ChallengeMark({ type, code, size = 46, tone }: { type: ChallengeType; code: string; size?: number; tone?: keyof typeof METALS }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const metals = [METALS.flame, METALS.volt, METALS.bronze, METALS.silver, METALS.gold];
  const metal = tone ? METALS[tone] : metals[[...code].reduce((sum, char) => sum + char.charCodeAt(0), 0) % metals.length];
  const symbol = SYMBOLS[type];
  return <Svg viewBox="0 0 64 64" width={size} height={size} accessibilityLabel={`${type.toLowerCase()} competition`}>
    <Defs>
      <LinearGradient id={`trim-${uid}`} x1="0" y1="0" x2="0.35" y2="1"><Stop offset="0" stopColor={metal.rim[0]} /><Stop offset="1" stopColor={metal.rim[1]} /></LinearGradient>
      <RadialGradient id={`tface-${uid}`} cx="0.3" cy="0.25" r="0.9"><Stop offset="0" stopColor={metal.face[0]} /><Stop offset="1" stopColor={metal.face[1]} /></RadialGradient>
      <LinearGradient id={`tgloss-${uid}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#fff" stopOpacity="0.7" /><Stop offset="1" stopColor="#fff" stopOpacity="0" /></LinearGradient>
      <ClipPath id={`tclip-${uid}`}><Rect x="9" y="7" width="46" height="46" rx="11" /></ClipPath>
    </Defs>
    <Rect x="4" y="6" width="58" height="58" rx="15" fill={colors.ink} />
    <Rect x="2" y="2" width="58" height="58" rx="15" fill={colors.ink} />
    <Rect x="4" y="4" width="54" height="54" rx="13" fill={metal.edge} />
    <Rect x="4" y="2.5" width="54" height="52" rx="13" fill={`url(#trim-${uid})`} />
    <Rect x="9" y="7" width="46" height="46" rx="11" fill={metal.edge} opacity="0.5" />
    <Rect x="9" y="7.8" width="46" height="45.2" rx="11" fill={`url(#tface-${uid})`} />
    <G transform="translate(14 13) scale(0.9)" fill="none" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter">
      <G stroke="#fff" strokeOpacity="0.55" transform="translate(0.8 1)">{symbol}</G>
      <G stroke={metal.ink}>{symbol}</G>
    </G>
    <G clipPath={`url(#tclip-${uid})`}>
      <Ellipse cx="24" cy="12" rx="26" ry="10" fill={`url(#tgloss-${uid})`} transform="rotate(-18 24 12)" />
    </G>
  </Svg>;
}

export function TypeTag({ table }: { table: CompetitionTable }) {
  if (table.type === 'paid') return <Tag color={colors.paper} background={colors.ink} border={colors.edge}>{`Paid · ${formatMoney(table.entryFeeKobo)}`}</Tag>;
  if (table.type === 'sponsored') return <Tag background={colors.volt} border={colors.edge}>Free · funded prize</Tag>;
  return <Tag border={colors.edge}>Free</Tag>;
}

export function PhaseTag({ table, now }: { table: CompetitionTable; now?: number }) {
  const phase = competitionPhase(table, now);
  const live = phase === 'open' || phase === 'upcoming';
  const look = live
    ? { color: colors.ok, background: colors.okWash, border: 'rgba(18,128,92,0.6)' }
    : phase === 'entry-closed'
      ? { color: colors.warn, background: colors.warnWash, border: 'rgba(154,98,0,0.6)' }
      : phase === 'final'
        ? { color: colors.onAccent, background: colors.volt, border: colors.edge }
        : { color: colors.ink2, background: colors.card, border: colors.line };
  const label = phase === 'upcoming' ? 'Upcoming' : phase === 'open' ? 'Open' : phase === 'entry-closed' ? 'Entry closed' : phase === 'scoring-closed' ? (table.type === 'free' ? 'Ended' : 'Closed') : phase === 'final' ? 'Final' : 'Pending';
  return <Tag {...look}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {live ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: look.color }} /> : null}
      <Text style={[styles.tagText, { color: look.color }]}>{label}</Text>
    </View>
  </Tag>;
}

/** The card's colour comes from the activity: runs orange, walks/steps volt, anything else ink. */
/** A competition's colours: brand artwork, so the same in light and dark mode (dark text on orange and volt). */
export function cardTheme(table: Pick<CompetitionTable, 'challengeType'>) {
  if (table.challengeType === 'RUN') return { band: brand.track, text: brand.ink, accent: brand.ink };
  if (table.challengeType === 'WALK' || table.challengeType === 'STEP') return { band: brand.volt, text: brand.ink, accent: brand.ink };
  return { band: brand.ink, text: brand.paper, accent: brand.volt };
}

/** One row in a competition list: tile, title, what wins, who's in, time left, prize. */
export function CompetitionRow({ table, unit, now, last }: { table: CompetitionTable; unit: Unit; now: number; last?: boolean }) {
  const hero = challengeHeadline(table, unit);
  const prize = prizeLabel(table, unit);
  const wins = `${activityLabel(table)} · ${winsLabel(table, unit)}${hero.big.startsWith('₦') ? ` · ${hero.small.replace(/^to the winner$/, 'winner takes it')}` : ''}`;
  return <Pressable onPress={() => openCompetition(table.code)} accessibilityRole="button" accessibilityLabel={table.title}
    style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { backgroundColor: colors.inkWash }]}>
    <ChallengeMark type={table.challengeType} code={table.code} size={40} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt size={14} weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{table.title}</Txt>
        {table.visibility === 'private' ? <LockIcon size={12} color={colors.ink3} /> : null}
      </View>
      <Txt size={12} color="ink2" numberOfLines={1} style={{ marginTop: 2 }}>{wins}</Txt>
      <View style={styles.meta}>
        <UsersIcon size={12} color={colors.ink3} />
        <Txt size={12} color="ink3" num numberOfLines={1} style={{ flexShrink: 1 }}>{`${table.entrantCount ?? 0}${table.capacity ? `/${table.capacity}` : ''} · ${phaseLine(table, now)}`}</Txt>
      </View>
    </View>
    <View style={{ alignItems: 'flex-end', gap: 4 }}>
      <View style={[styles.prize, { backgroundColor: prize.prize ? colors.okWash : table.type === 'paid' ? colors.ink : colors.inkWash }]}>
        <Txt size={12} weight="bold" num style={{ color: prize.prize ? colors.ok : table.type === 'paid' ? colors.paper : colors.ink2 }}>{prize.text}</Txt>
      </View>
      <ChevronRightIcon size={15} color={colors.ink3} />
    </View>
  </Pressable>;
}

function boardScore(table: CompetitionTable, value: number, unit: Unit) {
  return formatScore(table, value, unit, { short: metricOf(table.scoringMethod).display === 'steps' }) ?? '';
}

function Face({ face, size = 28, ring = colors.card }: { face: { displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle }; size?: number; ring?: string }) {
  return <View style={{ borderRadius: size, borderWidth: 2, borderColor: ring }}>
    <Avatar name={face.displayName} src={face.avatarUrl} avatarStyle={face.avatarStyle} size={size} round />
  </View>;
}

/**
 * A competition card built to make you want in: what's at stake, the race itself (runners placed along a
 * track by score), who's in, how long is left, and one tap to join a free one.
 */
export function CompetitionPreviewCard({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [joined, setJoined] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const hero = challengeHeadline(table, unit);
  const cash = hero.big.startsWith('₦');
  const rules = `${activityLabel(table)} · ${winsLabel(table, unit)}${cash ? ` · ${hero.small.replace(/^to the winner$/, 'winner takes it')}` : ''}`;
  const leaders = table.leaders ?? [];
  const faces = table.faces ?? [];
  const leader = leaders[0];
  const entrants = table.entrantCount ?? 0;
  const myRank = table.myRank ?? null;
  const inIt = joined || myRank !== null;
  const phase = competitionPhase(table, now);
  const endsMs = table.scoringClosesAt ? new Date(table.scoringClosesAt).getTime() - now : null;
  const urgent = phase === 'open' && endsMs !== null && endsMs < 24 * 3_600_000;
  const when = phase === 'upcoming' ? `Starts in ${formatCountdown(table.startsAt!, now)}` : endsMs === null ? 'No end date' : `${formatCountdown(table.scoringClosesAt!, now)} left`;
  const canJoin = Boolean(user) && !inIt && table.type !== 'paid' && canEnter(table, now) && (!table.capacity || entrants < table.capacity);
  const join = useMutation({
    mutationFn: () => post(`/tables/${table.id}/register-free`),
    onSuccess() {
      setJoined(true);
      haptic('success');
      toast({ tone: 'ok', message: `You’re in ${table.title}. Your next run counts.` });
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (error) => toast({ tone: 'bad', message: error.message }),
  });

  return <Pressable onPress={() => openCompetition(table.code)} accessibilityRole="button" accessibilityLabel={`Open ${table.title}`}
    style={({ pressed }) => [styles.preview, pressed && { opacity: 0.85 }]}>
    {/* The host's banner, when there is one: a slim strip across the top; the card below is unchanged. */}
    {table.bannerUrl ? <Image source={{ uri: table.bannerUrl }} style={styles.previewBanner} contentFit="cover" transition={150} accessible={false} /> : null}
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <ChallengeMark type={table.challengeType} code={table.code} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt size={16} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{table.title}</Txt>
          {table.visibility === 'private' ? <LockIcon size={13} color={colors.ink3} /> : null}
        </View>
        <Txt size={13} color="ink3" numberOfLines={1} style={{ marginTop: 2 }}>{rules}</Txt>
      </View>
      {cash ? <Txt size={17} weight="extrabold" num>{hero.big}</Txt>
        : table.type === 'paid' ? <Txt size={14} weight="bold" num>{formatMoney(table.entryFeeKobo).replace(/\.00$/, '')}</Txt>
          : <Txt size={13} weight="semibold" color="ink3">Free</Txt>}
    </View>

    {/* The race: everyone who's scored, placed along the track against the leader. */}
    <View style={styles.track} onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}>
      <View style={styles.trackLine} />
      <View style={[styles.finish, { right: '6%' }]} />
      {leaders.length && trackWidth
        ? [...leaders].reverse().map((runner) => {
          const along = 0.06 + (leader ? towardLeader(table.scoringMethod, runner.score, leader.score) : 0) * 0.88;
          return <View key={runner.rank} style={{ position: 'absolute', top: 2, left: along * trackWidth - 15 }}>
            <Face face={runner} size={26} ring={myRank === runner.rank ? colors.volt : colors.card} />
          </View>;
        })
        : <View style={{ flexDirection: 'row', position: 'absolute', left: 0, top: 3 }}>{faces.slice(0, 4).map((face, index) => <View key={index} style={{ marginLeft: index ? -8 : 0 }}><Face face={face} size={24} /></View>)}</View>}
    </View>

    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={13} color="ink2" numberOfLines={1}>
          {leader ? <><Txt size={13} weight="semibold">{leader.displayName.split(' ')[0]}</Txt>{' leads · '}<Txt size={13} weight="semibold" num>{boardScore(table, leader.score, unit)}</Txt></>
            : entrants ? 'On the start line. First run leads.' : 'Nobody’s in yet. Be first.'}
        </Txt>
        <View style={styles.meta}>
          <UsersIcon size={12} color={colors.ink3} />
          <Txt size={12} color="ink3" num>{`${entrants}${table.capacity ? `/${table.capacity}` : ''} · `}</Txt>
          <Txt size={12} num weight={urgent ? 'semibold' : 'regular'} color={urgent ? 'bad' : 'ink3'} numberOfLines={1} style={{ flexShrink: 1 }}>{when}</Txt>
        </View>
      </View>
      {inIt
        ? <View style={styles.inPill}><Txt size={12} weight="bold">{myRank ? `You’re #${myRank}` : 'You’re in'}</Txt></View>
        : canJoin
          ? <Pressable onPress={() => join.mutate()} disabled={join.isPending} accessibilityRole="button" accessibilityLabel={`Join ${table.title}`} hitSlop={6}
            style={({ pressed }) => [styles.joinPill, (pressed || join.isPending) && { opacity: 0.7, transform: [{ scale: 0.96 }] }]}>
            <Txt size={13} weight="bold" color="paper">{join.isPending ? 'Joining…' : 'Join'}</Txt>
          </Pressable>
          : <View style={{ flexDirection: 'row', alignItems: 'center' }}><Txt size={13} weight="bold">{table.type === 'paid' ? 'Enter' : 'View'}</Txt><ChevronRightIcon size={15} /></View>}
    </View>
  </Pressable>;
}

/** A card for horizontal rails. */
export function TrendingCard({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  const theme = cardTheme(table);
  const hero = challengeHeadline(table, unit);
  return <Pressable onPress={() => openCompetition(table.code)} accessibilityRole="button" accessibilityLabel={table.title}>
    {({ pressed }) => <HardShadow pressed={pressed} radius={radius.md}>
      <View style={[styles.trending]}>
        <View style={[styles.band, { backgroundColor: theme.band }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[score(30), { color: theme.text, textTransform: 'uppercase', lineHeight: 30 }]}>{hero.big}</Text>
            <Text numberOfLines={1} style={[styles.bandSmall, { color: theme.text }]}>{hero.small}</Text>
          </View>
          <ChallengeMark type={table.challengeType} code={table.code} size={38} />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text numberOfLines={2} style={[wideLabel(13, 0), { lineHeight: 15 }]}>{table.title}</Text>
          <View style={{ marginTop: 'auto', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <View style={styles.meta}><UsersIcon size={13} color={colors.ink2} /><Txt size={12} weight="semibold" color="ink2" num>{`${table.entrantCount ?? 0} in`}</Txt></View>
            <Txt size={12} weight="semibold" color="ink2" numberOfLines={1} style={{ flexShrink: 1 }}>{phaseLine(table, now).replace(/^Ends in /, '')}</Txt>
          </View>
        </View>
      </View>
    </HardShadow>}
  </Pressable>;
}

export function CompetitionCard({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  const theme = cardTheme(table);
  const hero = challengeHeadline(table, unit);
  const phase = competitionPhase(table, now);
  const done = windowProgress(table, now);
  const joined = table.entrantCount ?? null;
  return <Pressable onPress={() => openCompetition(table.code)} accessibilityRole="button" accessibilityLabel={table.title}>
    {({ pressed }) => <HardShadow pressed={pressed} radius={radius.md}>
      <View style={styles.card}>
        <View style={{ backgroundColor: theme.band, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}><TypeTag table={table} /><Tag background={colors.paper}>{activityLabel(table)}</Tag></View>
            <PhaseTag table={table} now={now} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[score(46), { color: theme.text, textTransform: 'uppercase', lineHeight: 44 }]}>{hero.big}</Text>
              <Text style={[styles.bandSmall, { color: theme.text, marginTop: 6 }]}>{hero.small}</Text>
            </View>
            <ChallengeMark type={table.challengeType} code={table.code} />
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <Text numberOfLines={2} style={[wideLabel(17, 0), { lineHeight: 18 }]}>{table.title}</Text>
          <Txt size={13} color="ink2" numberOfLines={1} style={{ marginTop: 4 }}>
            {`${table.creator?.displayName ? `Hosted by ${table.creator.displayName}` : 'Community competition'}${table.distanceCapMetres ? ` · cap ${formatDistance(table.distanceCapMetres, unit)}/activity` : ''}`}
          </Txt>
          {done !== null && <View style={styles.progress}>
            <View style={{ width: `${done * 100}%`, height: '100%', borderRadius: 3, backgroundColor: colors.ink }} />
            {phase !== 'scoring-closed' && phase !== 'final' && <View style={{ position: 'absolute', left: `${done * 100}%`, top: -3, marginLeft: -6 }}><LiveDot live={phase === 'open'} color={colors.ink} size={12} /></View>}
          </View>}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Txt size={12} weight="semibold">{phaseLine(table, now)}</Txt>
            <View style={styles.meta}><UsersIcon size={14} color={colors.ink2} /><Txt size={12} weight="semibold" color="ink2">{`${joined !== null ? `${joined} joined` : ''}${table.capacity ? `${joined !== null ? ' / ' : ''}${table.capacity} max` : ''}`}</Txt></View>
          </View>
        </View>
        <View style={styles.cardFoot}>
          <Text style={{ fontFamily: mono, fontSize: 12, letterSpacing: 1.4, color: colors.ink2 }}>{table.code}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Txt size={11} weight="bold" upper tracking={0.1} color="ink2">{canEnter(table, now) ? 'Join' : 'View'}</Txt><ArrowRightIcon size={16} color={colors.ink2} /></View>
        </View>
      </View>
    </HardShadow>}
  </Pressable>;
}

/** Start → entry closes → scoring ends, with the present marked on the track. */
export function Timeline({ table, now }: { table: CompetitionTable; now: number }) {
  const merged = !table.entryClosesAt || table.entryClosesAt === table.scoringClosesAt;
  const stops = [
    { label: 'Starts', at: table.startsAt },
    ...(merged ? [] : [{ label: 'Entry closes', at: table.entryClosesAt }]),
    { label: merged ? 'Entry & scoring close' : 'Scoring ends', at: table.scoringClosesAt },
  ];
  const times = stops.map((stop) => (stop.at ? new Date(stop.at).getTime() : null));
  const first = times[0];
  const last = times[times.length - 1];
  const progress = first !== null && last !== null && last > first ? Math.min(1, Math.max(0, (now - first) / (last - first))) : now >= (last ?? Infinity) ? 1 : 0;
  return <View>
    <View style={{ height: 24, marginHorizontal: 8, justifyContent: 'center' }}>
      <View style={{ height: 3, backgroundColor: colors.inkFaint }} />
      <View style={{ position: 'absolute', left: 0, height: 3, width: `${progress * 100}%`, backgroundColor: colors.ink }} />
      {stops.map((stop, index) => {
        const reached = times[index] !== null && now >= times[index]!;
        return <View key={stop.label} style={[styles.stop, { left: `${stops.length === 1 ? 0 : (index / (stops.length - 1)) * 100}%`, backgroundColor: reached ? colors.ink : colors.card }]} />;
      })}
      {progress > 0 && progress < 1 && <View style={[styles.now, { left: `${progress * 100}%` }]} />}
    </View>
    <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
      {stops.map((stop, index) => <View key={stop.label} style={{ flex: 1, alignItems: index === stops.length - 1 ? 'flex-end' : index === 1 && stops.length === 3 ? 'center' : 'flex-start' }}>
        <Txt size={11} weight="bold" upper tracking={0.06} color="ink2" align={index === stops.length - 1 ? 'right' : index === 1 && stops.length === 3 ? 'center' : 'left'}>{stop.label}</Txt>
        <Txt size={12} weight="semibold" num style={{ marginTop: 2 }}>{formatDateTime(stop.at)}</Txt>
      </View>)}
    </View>
  </View>;
}

export function LockedNotice({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <LockIcon size={14} color={colors.ink2} />
    {typeof children === 'string' ? <Txt size={13} color="ink2" style={{ flex: 1 }}>{children}</Txt> : children}
  </View>;
}

const styles = StyleSheet.create({
  tagText: { fontFamily: fontFamily('bold'), fontSize: 10.5, letterSpacing: 0.84, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  prize: { borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 2 },
  preview: { borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, overflow: 'hidden' },
  previewBanner: { marginHorizontal: -16, marginTop: -16, marginBottom: 14, aspectRatio: 3, backgroundColor: colors.inkWash },
  track: { height: 32, marginTop: 12, justifyContent: 'center' },
  trackLine: { height: 2, borderRadius: 1, backgroundColor: 'rgba(18,18,18,0.07)' },
  finish: { position: 'absolute', top: 6, bottom: 6, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(18,18,18,0.25)' },
  inPill: { borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.edge, paddingHorizontal: 12, paddingVertical: 4 },
  joinPill: { height: 36, borderRadius: radius.full, backgroundColor: colors.ink, paddingHorizontal: 20, justifyContent: 'center' },
  trending: { width: 230, minHeight: 150, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, overflow: 'hidden' },
  band: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10 },
  bandSmall: { fontFamily: fontFamily('bold'), fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.75, marginTop: 4 },
  card: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, overflow: 'hidden' },
  progress: { height: 6, borderRadius: 3, backgroundColor: colors.inkFaint, marginTop: 16 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingHorizontal: 16, paddingVertical: 10 },
  stop: { position: 'absolute', width: 14, height: 14, marginLeft: -7, borderWidth: 2, borderColor: colors.edge },
  now: { position: 'absolute', width: 20, height: 20, marginLeft: -10, borderRadius: 10, borderWidth: 2, borderColor: colors.edge, backgroundColor: colors.track },
});
