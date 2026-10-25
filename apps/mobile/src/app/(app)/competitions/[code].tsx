import { canEnter, challengeHeadline, competitionPhase, prizeSplit } from '@jump/shared/competition';
import { joinConflictCopy } from '@jump/shared/copy';
import { countryName } from '@jump/shared/countries';
import { formatCountdown, formatDate, formatDateTime, formatDistance, formatMoney, formatNairaInput, fromLocalInput, nairaInputToKobo, ordinal, toLocalInput } from '@jump/shared/format';
import { activityLabel, formatGap, formatScore, hasScored, metricOf, rulesLines, scoreHeader, winsLabel } from '@jump/shared/scoring';
import type { CheckoutResponse, CompetitionTable, StandingRow, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { PrizeTerms } from '@/components/ClubPrizes';
import { PrizeAds } from '@/components/PrizeAd';
import { ChallengeMark, PhaseTag, TypeTag, cardTheme } from '@/components/competition';
import { ActionMenu, type MenuAction } from '@/components/ActionMenu';
import { DateTimePicker } from '@/components/DateTimePicker';
import { ChevronRightIcon, EditIcon, LockIcon, ShareIcon } from '@/components/icons';
import { Leaderboard, type LeaderboardRow } from '@/components/Leaderboard';
import { ShareCompetitionSheet } from '@/components/ShareCompetition';
import { Sheet } from '@/components/Sheet';
import { Avatar, Button, Card, EmptyState, ErrorNotice, Eyebrow, Footer, haptic, HardShadow, LiveTag, Loading, Notice, Score, Screen, SectionTitle, Skeleton, Tag, TextField, Txt, useNow } from '@/components/ui';
import { api, isApiError, patch, post, WEB_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmCheckout, openCheckout } from '@/lib/checkout';
import { OPEN_PAYMENT_STATUSES, savePayment, useSavedPayments } from '@/lib/payments';
import { keys, useFinalResult, useStandings, useUnit, useWallet } from '@/lib/queries';
import { brand, colors, display, fontFamily, mono, radius, scheme, score, wideLabel } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { pickPhoto, uploadPhoto } from '@/lib/upload';
import { confirm } from '@/lib/dialog';
import { AccentSurface } from '@/lib/surface';

/** Whatever the board isn't ranked on: km for a steps race, steps for a distance one, both otherwise. */
function otherMetrics(row: { creditedDistanceMetres: number; creditedSteps: number }, table: Pick<CompetitionTable, 'challengeType' | 'scoringMethod'>, unit: Unit) {
  const shown = metricOf(table.scoringMethod).display;
  const km = shown !== 'distance' && row.creditedDistanceMetres > 0 ? formatDistance(row.creditedDistanceMetres, unit) : null;
  const steps = shown !== 'steps' && table.challengeType !== 'CYCLING' && row.creditedSteps > 0 ? `${row.creditedSteps.toLocaleString('en-GB')} steps` : null;
  return [km, steps].filter(Boolean).join(' · ') || null;
}

/** Settled boards from before scores were stored: the old per-method totals. */
function legacyScore(row: { creditedDistanceMetres: number; creditedSteps: number; completionTimeSeconds: number | null }, table: CompetitionTable) {
  const shown = metricOf(table.scoringMethod).display;
  return shown === 'steps' ? row.creditedSteps : shown === 'duration' ? row.completionTimeSeconds : row.creditedDistanceMetres;
}

const CLOSED_STATUSES = ['PENDING_FUNDING', 'PENDING_APPROVAL', 'CANCELLED', 'DRAFT', 'SCHEDULED'];

export default function CompetitionDetailScreen() {
  const { code, created } = useLocalSearchParams<{ code: string; created?: string }>();
  const { user } = useAuth();
  const unit = useUnit();
  const now = useNow(30_000);
  const table = useQuery({
    queryKey: keys.table(code),
    queryFn: () => api<CompetitionTable>(`/tables/${encodeURIComponent(code)}`),
    refetchInterval: (query) => (['PENDING_APPROVAL', 'PENDING_FUNDING'].includes(query.state.data?.status ?? '') ? 5_000 : false),
  });
  const result = useFinalResult(table.data?.id);
  const live = table.data ? ['open', 'upcoming', 'entry-closed'].includes(competitionPhase(table.data, now)) : false;
  const standings = useStandings(table.data?.id, live ? 30_000 : false);
  const registration = useQuery({
    queryKey: ['table-registration', table.data?.id, user?.id],
    queryFn: () => api<{ joined: boolean }>(`/tables/${table.data!.id}/registration`),
    enabled: Boolean(table.data?.id && user),
  });
  const me = standings.data?.find((row) => row.userId === user?.id);
  const queryClient = useQueryClient();
  const leave = useMutation({
    mutationFn: () => post(`/tables/${table.data!.id}/leave`),
    async onSuccess() {
      toast({ tone: 'ok', message: `You left ${table.data!.title}.` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.standings(table.data!.id) }),
        queryClient.invalidateQueries({ queryKey: ['table-registration', table.data!.id, user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['tables', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: keys.table(table.data!.code) }),
      ]);
    },
    onError: (error) => toast({ tone: 'bad', message: error.message }),
  });
  const [showAll, setShowAll] = useState(false);

  const rows: LeaderboardRow[] = useMemo(() => {
    const byUser = new Map(standings.data?.map((row) => [row.userId, row]));
    if (result.data && table.data) {
      return result.data.standings.map((row) => ({
        rank: row.rank,
        userId: row.userId,
        name: byUser.get(row.userId)?.displayName ?? (row.userId === user?.id ? user.displayName ?? 'You' : 'Runner'),
        avatarUrl: byUser.get(row.userId)?.avatarUrl,
        avatarStyle: byUser.get(row.userId)?.avatarStyle,
        username: byUser.get(row.userId)?.username,
        metres: row.creditedDistanceMetres,
        score: row.score ?? legacyScore(row, table.data!),
        host: row.userId === table.data?.creatorId,
        detail: otherMetrics(row, table.data!, unit),
      }));
    }
    return (standings.data ?? []).map((row) => ({
      rank: row.rank,
      userId: row.userId,
      name: row.displayName,
      avatarUrl: row.avatarUrl,
      avatarStyle: row.avatarStyle,
      verified: row.verified,
      username: row.username,
      metres: row.creditedDistanceMetres,
      score: row.score,
      host: row.userId === table.data?.creatorId,
      detail: [otherMetrics(row, table.data!, unit), row.qualified === false ? 'Not yet qualified' : null].filter(Boolean).join(' · ') || null,
    }));
  }, [result.data, standings.data, table.data, unit, user]);

  const refresh = () => { void table.refetch(); void standings.refetch(); void registration.refetch(); };

  if (table.isLoading) return <Screen><Stack.Screen options={{ title: '' }} /><Loading /></Screen>;
  if (table.error || !table.data) {
    return <Screen>
      <Stack.Screen options={{ title: 'Not found' }} />
      {isApiError(table.error, 404)
        ? <EmptyState title={`No competition with code ${code.toUpperCase()}`}>Check the invite code and try again. Codes are 8 letters and numbers.</EmptyState>
        : <ErrorNotice error={table.error} onRetry={() => void table.refetch()} />}
    </Screen>;
  }

  const t = table.data;
  const isFinal = Boolean(result.data);
  const isHost = user?.id === t.creatorId;
  const manages = isHost || Boolean(t.canManage);
  const unpublished = t.status === 'DRAFT' || t.status === 'SCHEDULED';
  const hostName = t.creator?.displayName ?? 'A Jump runner';
  const entrants = Math.max(standings.data?.length ?? 0, t.entrantCount ?? 0);
  const canLeave = Boolean(registration.data?.joined) && t.type !== 'paid' && t.status !== 'SETTLED' && (!t.scoringClosesAt || new Date(t.scoringClosesAt).getTime() > now);
  const menu: MenuAction[] = [
    ...(canLeave ? [{
      label: 'Leave competition', danger: true,
      run: () => void confirm({ title: 'Leave this competition?', message: 'Your place and score here are removed. You can rejoin while entry is open.', cancelLabel: 'Stay in', confirmLabel: 'Leave', destructive: true })
        .then((ok) => { if (ok) leave.mutate(); }),
    }] : []),
  ];

  // While you're in and it's live, where you stand stays pinned at the bottom, however long the board.
  const racing = Boolean(registration.data?.joined) && ['open', 'entry-closed'].includes(competitionPhase(t, now));
  return <Screen refreshing={table.isRefetching} onRefresh={refresh}
    footer={racing ? <Footer style={{ borderTopWidth: 0, paddingTop: 8 }}><YourRace table={t} rows={standings.data ?? []} viewerId={user?.id} unit={unit} now={now} /></Footer> : undefined}>
    {/* The page has its own big title; the header stays clear (the code lives on the share card). */}
    <Stack.Screen options={{ title: '' }} />
    {created === '1' && <Notice tone="ok" title="Competition created" style={{ marginBottom: 24 }}>
      {`${t.status === 'PENDING_APPROVAL' ? 'Your draft is waiting for Jump approval. ' : t.status === 'PENDING_FUNDING' ? 'Fund the prize to open entry. ' : t.status === 'DRAFT' ? 'Saved as a draft. Only your club’s managers can see it. ' : t.status === 'SCHEDULED' ? `It opens ${t.publishAt ? formatDateTime(t.publishAt) : 'soon'}. ` : 'Your competition is open. '}${t.status === 'PENDING_FUNDING' ? 'This draft is saved to your account. You can leave and return to fund it.' : 'Share the link so friends can join.'}`}
    </Notice>}
    {t.archivedAt && <Notice tone="neutral" title="Archived" style={{ marginBottom: 24 }}>
      {isHost ? 'Off every list, including yours. Anyone with the link can still see it. Unarchive it below to bring it back.' : 'The host archived this competition. Its final board stays here.'}
    </Notice>}
    {manages && unpublished && <DraftPanel table={t} />}
    {isHost && t.status === 'PENDING_FUNDING' && created !== '1' && <Notice tone="warn" title="Funding draft" style={{ marginBottom: 24 }}>
      This competition is saved but not live. Only you can fund the fixed amount; entry opens after Jump verifies the Paystack payment.
    </Notice>}

    <ChallengeCover table={t} unit={unit} now={now} />
    {t.visibility === 'private' && <View style={styles.private}><LockIcon size={12} color={colors.paper} /><Text style={[wideLabel(11, 0.08), { color: colors.paper }]}>Private · invite only</Text></View>}
    <Text style={[display(32), { marginTop: t.visibility === 'private' ? 12 : 20 }]}>{t.title}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
      <Pressable disabled={!t.creator?.username} onPress={() => router.push(`/runners/${t.creator!.username}`)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={hostName} src={t.creator?.avatarUrl} avatarStyle={t.creator?.avatarStyle} size={40} round />
        <View style={{ flex: 1 }}>
          <Txt size={14} leading={1.35}><Txt size={14} weight="bold">{hostName}</Txt>{isHost ? ' · you’re hosting' : me ? ' is hosting' : ' invited you to join'}</Txt>
          <Txt size={12} color="ink3">Created {formatDate(t.createdAt, { year: 'numeric' })}</Txt>
        </View>
      </Pressable>
      {menu.length > 0 && <ActionMenu label="Competition options" actions={menu} />}
    </View>
    {t.description ? <Txt size={15} leading={1.55} style={{ marginTop: 16 }}>{t.description}</Txt> : null}
    {t.club && <Pressable onPress={() => router.push(`/clubs/${t.club!.slug}`)} style={({ pressed }) => [styles.club, pressed && { opacity: 0.8 }]} accessibilityRole="link">
      {t.club.logoUrl ? <Image source={{ uri: t.club.logoUrl }} style={styles.clubLogo} /> : <View style={[styles.clubLogo, { backgroundColor: t.club.accentColor, alignItems: 'center', justifyContent: 'center' }]}><Txt size={13} weight="extrabold">{t.club.name.charAt(0)}</Txt></View>}
      <Txt size={13} numberOfLines={1} style={{ flexShrink: 1 }}><Txt size={13} weight="bold">{t.club.name}</Txt>{t.club.seriesTitle && t.edition ? ` · ${t.club.seriesCadence === 'monthly' ? 'Monthly' : 'Weekly'} series, edition ${t.edition}` : ` · ${t.club.followerCount} ${t.club.followerCount === 1 ? 'follower' : 'followers'}`}</Txt>
    </Pressable>}

    {!unpublished && <View style={{ marginTop: 24 }}><EntryPanel table={t} joined={registration.data?.joined} joinedRank={me?.rank} entrants={entrants} faces={rows} now={now} /></View>}
    {/* What's up for grabs, in one slim line like the Compete page's Strava note. */}
    {t.productPrizes?.prizes.length ? <View style={{ marginTop: 16 }}><PrizeAds terms={t.productPrizes} clubName={t.club?.name} website={t.club?.website} /></View> : null}

    <View style={{ gap: 40, marginTop: 32 }}>
      <View>
        <SectionTitle aside={isFinal ? <Tag background={colors.volt} border={colors.edge}>Final</Tag> : t.status === 'PENDING_FUNDING' ? <Tag border={colors.line} color={colors.ink2}>Draft</Tag>
          // Only a race that's actually on pulses; one that has ended (or not started) says so instead.
          : ['scoring-closed', 'final'].includes(competitionPhase(t, now)) ? <Tag border={colors.line} color={colors.ink2}>Ended</Tag>
            : competitionPhase(t, now) === 'upcoming' ? <Tag border={colors.line} color={colors.ink2}>Starts soon</Tag> : <LiveTag />}>Leaderboard</SectionTitle>
        {standings.isLoading ? <Skeleton style={{ height: 192 }} />
          : standings.error ? <ErrorNotice error={standings.error} onRetry={() => void standings.refetch()} />
            : <Leaderboard rows={rows} currentUserId={user?.id} unit={unit} limit={showAll ? 200 : 10} metricLabel={scoreHeader(t)}
              formatScore={metricOf(t.scoringMethod).display === 'distance' ? undefined : (row) => <Text style={score(20)}>{hasScored(t.scoringMethod, row.score) ? formatScore(t, row.score, unit, { short: true }) : '-'}</Text>}
              empty={<EmptyState title="Nobody’s on the board yet">{`Join now and your first verified ${({ RUN: 'run', WALK: 'walk', CYCLING: 'ride', DISTANCE: 'run, walk or ride' } as Record<string, string>)[t.challengeType] ?? 'activity'} puts you on top.`}</EmptyState>} />}
        {rows.length > 10 && <Button full variant="quiet" style={{ marginTop: 12 }} title={showAll ? 'Show top 10' : `See all ${rows.length} runners`} onPress={() => setShowAll((value) => !value)} />}
      </View>
      {!CLOSED_STATUSES.includes(t.status) && <ShareBox table={t} rows={standings.data ?? []} viewerId={user?.id} unit={unit} />}
      {t.productPrizes && <PrizeTerms terms={t.productPrizes} clubName={t.club?.name} />}
      {!me && !isHost && <HowItWorks table={t} unit={unit} />}
      <KeyDates table={t} now={now} />
      {manages && !CLOSED_STATUSES.includes(t.status) && <HostTools table={t} now={now} />}
      <Rules table={t} unit={unit} />
      {isHost && t.status === 'OPEN_FOR_ENTRY' && <InvitationsPanel table={t} />}
    </View>
  </Screen>;
}

/**
 * Under the board, for runners in it while it's live: where you stand against the person just ahead
 * (or how far you lead), how long is left, and Go to record straight away.
 */
function YourRace({ table, rows, viewerId, unit, now }: { table: CompetitionTable; rows: StandingRow[]; viewerId?: string; unit: Unit; now: number }) {
  const method = table.scoringMethod;
  const valueOf = (row?: StandingRow) => (row && hasScored(method, row.score) ? Number(row.score) : null);
  const me = rows.find((row) => row.userId === viewerId);
  const mine = valueOf(me);
  const ahead = me && me.rank > 1 ? rows.find((row) => row.rank === me.rank - 1) : undefined;
  const behind = me ? rows.find((row) => row.rank === me.rank + 1) : undefined;
  const first = (name?: string) => (name ?? 'them').split(' ')[0];
  const ends = table.scoringClosesAt ? `${formatCountdown(table.scoringClosesAt, now)} to go` : 'no end date';
  const noun = ({ RUN: 'run', WALK: 'walk', CYCLING: 'ride' } as Record<string, string>)[table.challengeType] ?? 'activity';
  const bold = (text: string) => <Txt size={14} weight="bold" style={{ color: brand.paper }}>{text}</Txt>;
  const line = !me || mine === null
    ? <>Your first {noun} puts you on the board, {ends}.</>
    : me.rank === 1
      // A tie reads as level, never "by 0 days".
      ? valueOf(behind) === mine ? <>Level with {first(behind!.displayName)}, {ends}. One more {noun} takes it.</>
        : valueOf(behind) !== null ? <>Leading {first(behind!.displayName)} by {bold(formatGap(table, valueOf(behind)!, mine, unit) ?? '')}, {ends}. Keep the gap.</> : <>Out in front, {ends}. Keep it that way.</>
      : ahead && valueOf(ahead) === mine ? <>Level with {first(ahead.displayName)}, {ends}. One {noun} breaks the tie.</>
        : ahead && valueOf(ahead) !== null ? <>{bold(formatGap(table, mine, valueOf(ahead)!, unit) ?? '')} behind {first(ahead.displayName)} for {ordinal(ahead.rank)}, {ends}.</>
        : <>{ends}. Every {noun} counts.</>;
  // Always dark, like the home board; a hairline edge keeps it from melting into a dark page.
  return <View style={[styles.race, scheme === 'dark' && { borderWidth: 1, borderColor: colors.line }]}>
    <View style={{ alignItems: 'center', minWidth: 52 }}>
      <Text style={[score(30), { color: brand.paper, lineHeight: 32 }]}>{me && mine !== null ? ordinal(me.rank) : '–'}</Text>
      <Txt size={11} style={{ color: brand.onInkMuted }}>{`of ${rows.length}`}</Txt>
    </View>
    <Txt size={14} leading={1.4} style={{ flex: 1, color: brand.onInkMuted }}>{line}</Txt>
    <Pressable onPress={() => { haptic('medium'); router.navigate('/run'); }} accessibilityRole="button" accessibilityLabel={`Record a ${noun}`} hitSlop={6}
      style={({ pressed }) => [styles.raceGo, pressed && { transform: [{ scale: 0.94 }], opacity: 0.9 }]}>
      <Text style={[wideLabel(13, 0.06), { color: brand.ink, fontFamily: fontFamily('extrabold', 'wide') }]}>Go</Text>
    </Pressable>
  </View>;
}

/** A club competition that isn't public yet: open it now, or manage it from the club dashboard. */
function DraftPanel({ table }: { table: CompetitionTable }) {
  const queryClient = useQueryClient();
  const publish = useMutation({
    mutationFn: () => post(`/tables/${table.id}/publish`, {}),
    async onSuccess() {
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.table(table.code) }), queryClient.invalidateQueries({ queryKey: ['club'] })]);
      haptic('success');
      toast({ tone: 'ok', message: 'Published. Your followers have been told.' });
    },
  });
  return <Notice tone="warn" style={{ marginBottom: 24 }} title={table.status === 'SCHEDULED' ? `Scheduled to open ${table.publishAt ? formatDateTime(table.publishAt) : ''}` : 'Draft · not public yet'}
    action={<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Button size="sm" title={publish.isPending ? 'Publishing…' : 'Publish now'} loading={publish.isPending} onPress={() => publish.mutate()} />
      {table.club && <Button size="sm" variant="secondary" title="Edit in dashboard" onPress={() => router.push(`/clubs/${table.club!.slug}/dashboard`)} />}
    </View>}>
    <Txt size={14} color="ink2" leading={1.5}>{`Only your club’s managers can see it. ${table.status === 'SCHEDULED' ? 'It opens on its own at that time, and your followers are told.' : 'Change its theme, dates and prizes from the club dashboard, then publish it.'}`}</Txt>
    <ErrorNotice error={publish.error} />
  </Notice>;
}

/** The poster at the top of an invite: the competition's colour, its one big number and its mark. */
function ChallengeCover({ table, unit, now }: { table: CompetitionTable; unit: Unit; now: number }) {
  // The host's banner fills the card; the same details sit on top of it, over a dark fade so they
  // read on any photo.
  const banner = table.bannerUrl;
  const theme = banner ? { band: brand.ink, text: brand.paper } : cardTheme(table);
  const hero = challengeHeadline(table, unit);
  return <View style={[styles.cover, { backgroundColor: theme.band }, banner && styles.bannerCover]}>
    {banner ? <>
      <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityLabel={`${table.title} banner`} />
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 10 10" preserveAspectRatio="none">
        <Defs><LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000" stopOpacity="0.35" />
          <Stop offset="0.4" stopColor="#000" stopOpacity="0.05" />
          <Stop offset="1" stopColor="#000" stopOpacity="0.75" />
        </LinearGradient></Defs>
        <Rect width="10" height="10" fill="url(#fade)" />
      </Svg>
    </> : <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 200" preserveAspectRatio="none" opacity={0.13}>
      {[0, 1, 2, 3, 4, 5].map((lane) => <Path key={lane} d={`M-20 ${200 - lane * 26}C120 ${180 - lane * 30} 240 ${120 - lane * 22} 420 ${60 - lane * 18}`} fill="none" stroke={theme.text} strokeWidth="3" />)}
    </Svg>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      <TypeTag table={table} />
      <Tag background={colors.paper}>{activityLabel(table.challengeType)}</Tag>
      <PhaseTag table={table} now={now} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: banner ? 16 : 40 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[score(64), { color: theme.text, textTransform: 'uppercase', lineHeight: 60 }, banner && styles.onPhoto]}>{hero.big}</Text>
        <Text style={[wideLabel(12, 0.14), { color: theme.text, opacity: banner ? 0.9 : 0.75, marginTop: 8, fontFamily: 'Archivo-Bold' }, banner && styles.onPhoto]}>{hero.small}</Text>
      </View>
      <ChallengeMark type={table.challengeType} code={table.code} size={64} />
    </View>
  </View>;
}

/** For people arriving from an invite who have never heard of a Jump competition. */
function HowItWorks({ table, unit }: { table: CompetitionTable; unit: Unit }) {
  const cycling = table.challengeType === 'CYCLING';
  const distance = table.challengeType === 'DISTANCE';
  const counts = table.challengeType === 'RUN' ? 'run' : table.challengeType === 'WALK' ? 'walk' : cycling ? 'ride' : 'walk and run';
  const ends = table.scoringClosesAt ? formatDate(table.scoringClosesAt) : null;
  const prizePot = table.type === 'sponsored' ? (table.fundedPrizeKobo || table.guaranteedPrizeKobo) : table.guaranteedPrizeKobo;
  const prize = table.fundingDestination === 'CHARITY'
    ? `${prizePot ? formatMoney(prizeSplit(prizePot, table.platformFeeBps, 0).winnerKobo).replace(/\.00$/, '') : '85% of verified funding'} is reserved for ${table.charityName ?? 'charity'}, pending admin verification. No cash prize is paid to runners.`
    : prizePot ? `${formatMoney(prizeSplit(prizePot, table.platformFeeBps, table.creatorCommissionBps).winnerKobo).replace(/\.00$/, '')} goes to ${table.prizeSplitBps?.length > 1 ? `the top ${table.prizeSplitBps.length}` : 'the winner'}, paid out by Jump.`
      : table.type === 'sponsored' ? 'Anyone can contribute to the prize pool before scoring closes.' : 'The top spot takes the bragging rights.';
  const steps = [
    { title: table.type === 'paid' ? `Join for ${formatMoney(table.entryFeeKobo).replace(/\.00$/, '')}` : 'Join for free', body: table.type === 'paid' ? 'Pay securely with Paystack. Entry fees build the prize pot.' : 'One tap and you’re on the board. No fee, no catch.' },
    {
      title: distance ? 'Run, walk or cycle with Jump' : cycling ? 'Cycle with Jump' : `${counts === 'walk and run' ? 'Walk or run' : counts === 'run' ? 'Run' : 'Walk'} with Jump`,
      body: distance ? 'Record a run, walk or ride in Jump, or sync from Strava. Every verified distance in the competition window counts.' : cycling ? 'Choose Cycle when you start. Every GPS-verified ride in the competition window counts.' : `Hit Run in the app whenever you head out, or sync from Strava. Every verified ${counts} in the competition window counts.`,
    },
    { title: 'Climb the board', body: `${winsLabel(table, unit)}.${ends ? ` It ends ${ends}.` : ''} ${prize}` },
  ];
  return <View>
    <SectionTitle>How it works</SectionTitle>
    <Txt size={15} color="ink2" leading={1.55} style={{ marginBottom: 20 }}>
      {cycling ? 'Record rides with Jump. GPS-verified cycling distance updates the leaderboard; rides do not score in running leagues or foot-activity competitions. Cycling is free to enter and has no cash prize.' : distance ? 'Verified runs, walks and rides all add to your distance. Record them in Jump or sync from Strava, and the leaderboard updates when verification finishes.' : 'A Jump competition brings your people together. Everyone records their walks and runs with Jump, GPS and steps are checked, and the leaderboard updates live. It’s the easiest way to stay consistent with your people.'}
    </Txt>
    <View style={{ gap: 12 }}>
      {steps.map((step, index) => <View key={step.title} style={styles.step}>
        <View style={styles.stepNumber}><Text style={[score(18), { color: colors.volt }]}>{index + 1}</Text></View>
        <Text style={[wideLabel(14, 0), { marginTop: 12, lineHeight: 16 }]}>{step.title}</Text>
        <Txt size={13} color="ink2" leading={1.5} style={{ marginTop: 6 }}>{step.body}</Txt>
      </View>)}
    </View>
  </View>;
}

/** For the host: edit, change dates (free competitions), end it now, and archive it once it's over. */
function HostTools({ table, now }: { table: CompetitionTable; now: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const phase = competitionPhase(table, now);
  const over = phase === 'scoring-closed' || phase === 'final';
  const free = table.type === 'free';
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.table(table.code) }),
    queryClient.invalidateQueries({ queryKey: ['tables'] }),
    queryClient.invalidateQueries({ queryKey: keys.standings(table.id) }),
  ]);
  const endNow = useMutation({
    mutationFn: () => patch(`/tables/${table.id}`, { endNow: true }),
    async onSuccess() { await refresh(); toast({ tone: 'ok', message: 'Ended. The board is final for a free competition.' }); },
  });
  // Free competitions can always go; others only while no money is attached (the API decides).
  const deletion = useQuery({ queryKey: ['table-deletion', table.id], queryFn: () => api<{ canDelete: boolean; reason: string | null }>(`/tables/${table.id}/deletion`) });
  const remove = useMutation({
    mutationFn: () => api(`/tables/${table.id}`, { method: 'DELETE' }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast({ tone: 'ok', message: 'Competition deleted.' });
      router.replace('/competitions');
    },
  });
  const others = Math.max(0, (table.entrantCount ?? 0) - 1);
  const banner = useMutation({
    mutationFn: async (action: 'set' | 'remove') => {
      if (action === 'remove') return api(`/tables/${table.id}/banner`, { method: 'DELETE' });
      const photo = await pickPhoto({ maxSide: 1600 });
      return photo ? uploadPhoto(`/tables/${table.id}/banner`, photo, { name: 'banner.jpg' }) : null;
    },
    async onSuccess(result, action) {
      if (action === 'set' && !result) return;
      await refresh();
      toast({ tone: 'ok', message: action === 'remove' ? 'Banner removed.' : 'Banner updated.' });
    },
  });
  const archive = useMutation({
    mutationFn: (archived: boolean) => post(`/tables/${table.id}/archive`, { archived }),
    async onSuccess(_, archived) { await refresh(); toast({ tone: 'ok', message: archived ? 'Archived. It’s off your lists; the link still works.' : 'Back on your lists.' }); },
  });
  const askEndNow = () => void confirm({ title: 'End it now?', message: 'Scoring closes immediately and the board as it stands is the final result. This can’t be undone.', confirmLabel: 'End now', destructive: true })
    .then((ok) => { if (ok) endNow.mutate(); });
  const askArchive = () => void confirm({ title: 'Archive this competition?', message: 'It comes off every list, yours included (find it under Compete → Mine → Archived). The page and its final board stay at the same link.', confirmLabel: 'Archive' })
    .then((ok) => { if (ok) archive.mutate(true); });
  const askDelete = () => void confirm({ title: 'Delete this competition?', message: `It disappears for everyone, its board and link included. ${others ? `The ${others === 1 ? 'person' : `${others} people`} in it will be told. ` : ''}This can’t be undone.`, cancelLabel: 'Keep it', confirmLabel: 'Delete', destructive: true })
    .then((ok) => { if (ok) remove.mutate(); });
  const rows = [
    !over && { label: 'Edit details', hint: free ? 'Name, description and dates' : 'Name and description. Prize competitions keep their dates.', run: () => setEditing(true) },
    !over && { label: banner.isPending ? 'Uploading banner…' : table.bannerUrl ? 'Change banner' : 'Add banner', hint: 'Replaces the coloured card at the top. Wide images (2:1) work best.', run: () => banner.mutate('set'), busy: banner.isPending },
    !over && table.bannerUrl && { label: 'Remove banner', hint: 'Back to the coloured card', run: () => banner.mutate('remove'), busy: banner.isPending },
    !over && free && { label: 'End now', hint: 'Close scoring now. The board becomes final.', run: askEndNow, busy: endNow.isPending },
    table.archivedAt
      ? { label: 'Unarchive', hint: 'Put it back on your lists', run: () => archive.mutate(false), busy: archive.isPending }
      : (over || (table.entrantCount ?? 0) <= 1) && { label: 'Archive', hint: 'Off every list. The link keeps working.', run: askArchive, busy: archive.isPending },
    deletion.data?.canDelete && { label: remove.isPending ? 'Deleting…' : 'Delete competition', hint: 'Gone for everyone, link included', run: askDelete, busy: remove.isPending, danger: true },
  ].filter(Boolean) as Array<{ label: string; hint: string; run: () => void; busy?: boolean; danger?: boolean }>;

  return <View>
    <SectionTitle>Host tools</SectionTitle>
    <Card padded={false}>
      {rows.map((row, index) => <Pressable key={row.label} onPress={() => { haptic(); row.run(); }} disabled={row.busy} accessibilityRole="button"
        style={({ pressed }) => [styles.hostRow, index > 0 && styles.hostRowLine, pressed && { backgroundColor: colors.inkWash }, row.busy && { opacity: 0.5 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={15} weight="semibold" color={row.danger ? 'bad' : 'ink'}>{row.label}</Txt>
          <Txt size={12} color="ink3" style={{ marginTop: 2 }}>{row.hint}</Txt>
        </View>
        <ChevronRightIcon size={16} color={row.danger ? colors.bad : colors.ink3} />
      </Pressable>)}
    </Card>
    {over && <Txt size={12} color="ink3" leading={1.5} style={{ marginTop: 8 }}>It’s over. Archive it to tidy it off your lists.</Txt>}
    <ErrorNotice error={endNow.error ?? archive.error ?? banner.error ?? remove.error} />
    <EditCompetitionSheet open={editing} onOpenChange={setEditing} table={table} now={now} onSaved={refresh} />
  </View>;
}

function EditCompetitionSheet({ open, onOpenChange, table, now, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; table: CompetitionTable; now: number; onSaved: () => Promise<unknown> }) {
  const [title, setTitle] = useState(table.title);
  const [description, setDescription] = useState(table.description ?? '');
  const started = !table.startsAt || new Date(table.startsAt).getTime() <= now;
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date(table.startsAt ?? Date.now())));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(table.scoringClosesAt ?? Date.now() + 7 * 86_400_000)));
  const [openEnded, setOpenEnded] = useState(!table.scoringClosesAt);
  const free = table.type === 'free';
  const save = useMutation({
    mutationFn: () => patch(`/tables/${table.id}`, {
      title: title.trim(),
      description: description.trim() || null,
      ...(free && !started ? { startsAt: fromLocalInput(startsAt) } : {}),
      ...(free ? { scoringClosesAt: openEnded ? null : fromLocalInput(endsAt) } : {}),
    }),
    async onSuccess() { await onSaved(); toast({ tone: 'ok', message: 'Saved.' }); onOpenChange(false); },
  });
  return <Sheet open={open} onOpenChange={onOpenChange} title="Edit competition"
    footer={<Button full title={save.isPending ? 'Saving…' : 'Save changes'} loading={save.isPending} disabled={title.trim().length < 3} onPress={() => save.mutate()} />}>
    <View style={{ gap: 16 }}>
      <TextField label="Name" maxLength={120} value={title} onChangeText={setTitle} />
      <TextField label="What’s it about?" optional hint={`${280 - description.length} characters left`} multiline maxLength={280} value={description} onChangeText={setDescription} style={{ minHeight: 76 }} />
      {free && !started && <DateTimePicker label="Starts" value={startsAt} min={toLocalInput(new Date())} onChange={setStartsAt} />}
      {free && <>
        {!openEnded && <DateTimePicker label="Ends" hint="Move it later to give everyone more time, or sooner to finish early." value={endsAt} min={toLocalInput(new Date())} onChange={setEndsAt} />}
        <View style={styles.switchRow}><Txt size={14} weight="semibold">No end date</Txt><Switch value={openEnded} onValueChange={setOpenEnded} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} /></View>
      </>}
      {!free && <Txt size={12} color="ink3">Prize competitions keep the dates they were funded or approved with.</Txt>}
      <ErrorNotice error={save.error} />
    </View>
  </Sheet>;
}

function KeyDates({ table, now }: { table: CompetitionTable; now: number }) {
  const merged = !table.entryClosesAt || table.entryClosesAt === table.scoringClosesAt;
  const items = [{ label: 'Starts', at: table.startsAt }, ...(merged ? [] : [{ label: 'Entry closes', at: table.entryClosesAt }]), { label: 'Ends', at: table.scoringClosesAt }];
  return <View>
    <SectionTitle>Key dates</SectionTitle>
    <View style={styles.dates}>
      {items.map((item, index) => {
        const past = item.at ? new Date(item.at).getTime() <= now : false;
        return <View key={item.label} style={[styles.date, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.dot, { backgroundColor: past ? colors.ink : colors.card }]} />
            <Txt size={14} weight="semibold">{item.label}</Txt>
          </View>
          <Txt size={14} color="ink2" num align="right">{item.at ? formatDateTime(item.at) : 'No end date'}</Txt>
        </View>;
      })}
    </View>
  </View>;
}

/** Post it: a designed card for stories and posts, or a quick link to WhatsApp and X. */
function ShareBox({ table, rows, viewerId, unit }: { table: CompetitionTable; rows: StandingRow[]; viewerId?: string; unit: Unit }) {
  const [open, setOpen] = useState(false);
  const url = `${WEB_URL}/competitions/${table.code}`;
  const text = `Join my Jump competition "${table.title}"`;
  return <Card style={{ padding: 16 }}>
    <Txt size={14} weight="bold">Competitions are better with friends</Txt>
    <Txt size={13} color="ink2" style={{ marginTop: 2 }}>Post the card to your story. Anyone who sees it can join with the code.</Txt>
    <Button full title="Share card" icon={<ShareIcon size={16} />} style={{ marginTop: 12 }} onPress={() => setOpen(true)} />
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <Button size="sm" variant="secondary" full style={{ flex: 1 }} title="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`)} />
      <Button size="sm" variant="secondary" full style={{ flex: 1 }} title="X" onPress={() => void Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)} />
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
      <Txt size={12} color="ink3">Invite code</Txt>
      <Text selectable style={{ fontFamily: mono, fontSize: 12, letterSpacing: 2, color: colors.ink }}>{table.code}</Text>
    </View>
    <ShareCompetitionSheet open={open} onOpenChange={setOpen} table={table} rows={rows} viewerId={viewerId} unit={unit} />
  </Card>;
}

function Rules({ table, unit }: { table: CompetitionTable; unit: Unit }) {
  const items = [
    ...rulesLines(table, unit),
    ...(table.challengeType === 'CYCLING' ? ['Cycling uses GPS distance only. It does not add steps or running-league distance, and there are no cash prizes.'] : []),
    ...(table.eligibleCountries?.length ? [`Open to people whose Jump profile country is ${table.eligibleCountries.map(countryName).join(', ')}.`] : []),
    ...(table.reminderTime ? [`Joined runners may receive a daily email reminder at ${table.reminderTime.slice(0, 5)} (${table.reminderTimeZone}). No reminder is sent after they record an activity that day.`] : []),
    ...(table.type === 'paid' && table.minimumEntrants > 1 ? [`Needs at least ${table.minimumEntrants} entrants to go ahead.`] : []),
    ...(table.type !== 'free' && table.fundingDestination !== 'CHARITY' ? [`Prizes go to the top ${table.prizeSplitBps?.length ?? 1} eligible ${table.prizeSplitBps?.length === 1 ? 'runner' : 'runners'}. If fewer finish, their listed shares are proportionally redistributed. A very small funded pool may pay fewer places.`] : []),
    ...(['paid', 'sponsored'].includes(table.type) && table.fundingDestination !== 'CHARITY' ? ['The host is on the board but cannot receive a cash prize from their own competition.'] : []),
    ...(table.type === 'sponsored' && table.fundingDestination === 'CHARITY' ? [`Only the host funds this fixed amount. Jump retains ${table.platformFeeBps / 100}%; the remaining ${(10000 - table.platformFeeBps) / 100}% is held for ${table.charityName ?? 'the charity'} until an admin verifies the recipient. No runner cash prize is paid.`] : []),
    ...(table.type === 'sponsored' && table.fundingDestination !== 'CHARITY' ? [`${table.guaranteedPrizeKobo ? 'The host funds the fixed prize before entry opens' : 'The competition opens without creator funding. Anyone may contribute from ₦1 before scoring closes and still be eligible to win'}. Eligible winners split ${(10000 - table.platformFeeBps) / 100}% of verified contributions according to the creator’s percentages; Jump retains ${table.platformFeeBps / 100}%.`] : []),
  ];
  return <Card style={{ padding: 20 }}>
    <Eyebrow style={{ marginBottom: 12 }}>How it’s scored</Eyebrow>
    <View style={{ gap: 10 }}>
      {items.map((item) => <View key={item} style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ width: 6, height: 6, backgroundColor: colors.track, marginTop: 7 }} />
        <Txt size={13} leading={1.55} style={{ flex: 1 }}>{item}</Txt>
      </View>)}
    </View>
  </Card>;
}

function InvitationsPanel({ table }: { table: CompetitionTable }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const invite = useMutation({
    mutationFn: () => post(`/tables/${table.id}/invitations`, { username: username.trim().replace(/^@/, '') }),
    onSuccess: async () => { setUsername(''); haptic('success'); await queryClient.invalidateQueries({ queryKey: ['table', table.id, 'invitations'] }); },
  });
  const invitations = useQuery({
    queryKey: ['table', table.id, 'invitations'],
    queryFn: () => api<Array<{ id: string; email: string | null; phone: string | null; username: string | null }>>(`/tables/${table.id}/invitations`),
  });
  const link = `${WEB_URL}/competitions/${table.code}`;
  return <Card style={{ padding: 20 }}>
    <SectionTitle>Invitations</SectionTitle>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <TextField containerStyle={{ flex: 1 }} placeholder="Invite by username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Runner username" returnKeyType="send" onSubmitEditing={() => username.trim() && invite.mutate()} />
      <Button size="sm" variant="secondary" title="Invite" loading={invite.isPending} disabled={!username.trim()} onPress={() => invite.mutate()} />
    </View>
    <Txt size={12} color="ink3" style={{ marginTop: 8 }}>They’ll get an in-app message, notification and email.</Txt>
    <ErrorNotice error={invite.error} />
    <ErrorNotice error={invitations.error} onRetry={() => void invitations.refetch()} />
    {invitations.data?.map((item) => <View key={item.id} style={styles.invite}>
      <Txt size={13} numberOfLines={1} style={{ flex: 1 }}>{item.username ? `@${item.username}` : item.email ?? item.phone}</Txt>
      {item.phone
        ? <Button size="sm" variant="quiet" title="Send text" onPress={() => void Linking.openURL(`sms:${item.phone}?body=${encodeURIComponent(`Join ${table.title} on Jump: ${link}`)}`)} />
        : <Txt size={13} color="ink3">{item.username ? 'Sent' : 'Email invite'}</Txt>}
    </View>)}
  </Card>;
}

function EntryPanel({ table, joined, joinedRank, entrants, faces, now }: { table: CompetitionTable; joined?: boolean; joinedRank?: number; entrants: number; faces: LeaderboardRow[]; now: number }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const payments = useSavedPayments();
  const pendingPayment = payments.find((payment) => payment.tableId === table.id && OPEN_PAYMENT_STATUSES.includes(payment.lastStatus));
  const pendingEntryPayment = payments.find((payment) => payment.tableId === table.id && payment.purpose !== 'SPONSOR_FUNDING' && OPEN_PAYMENT_STATUSES.includes(payment.lastStatus));
  const open = canEnter(table, now);
  const full = table.capacity !== null && entrants >= table.capacity;
  const [fundingAmount, setFundingAmount] = useState('1,000');
  const fundingKobo = table.guaranteedPrizeKobo ?? nairaInputToKobo(fundingAmount);
  const canFund = table.type === 'sponsored' && (table.guaranteedPrizeKobo ? table.status === 'PENDING_FUNDING' && user?.id === table.creatorId : ['OPEN_FOR_ENTRY', 'ACTIVE', 'ENTRY_CLOSED'].includes(table.status)) && (!table.scoringClosesAt || new Date(table.scoringClosesAt).getTime() > now) && (table.fundingDestination !== 'CHARITY' || user?.id === table.creatorId);
  const refreshEntry = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.standings(table.id) }),
    queryClient.invalidateQueries({ queryKey: ['table-registration', table.id, user?.id] }),
    queryClient.invalidateQueries({ queryKey: ['tables', 'mine'] }),
    queryClient.invalidateQueries({ queryKey: keys.table(table.code) }),
  ]);

  const join = useMutation({
    mutationFn: () => post(`/tables/${table.id}/register-free`),
    async onSuccess() { haptic('success'); await refreshEntry(); },
  });
  const checkout = useMutation({
    mutationFn: () => post<CheckoutResponse>(`/tables/${table.id}/checkout`),
    async onSuccess(response) {
      // Save the reference before leaving, so the payment can be recovered on return.
      savePayment({ reference: response.reference, tableId: table.id, tableCode: table.code, tableTitle: table.title, amountKobo: table.entryFeeKobo, createdAt: new Date().toISOString() });
      await openCheckout(response.authorizationUrl);
    },
  });
  const enterWallet = useMutation({
    mutationFn: () => post(`/challenges/${table.id}/enter-wallet`),
    async onSuccess() {
      haptic('success');
      await Promise.all([refreshEntry(), queryClient.invalidateQueries({ queryKey: keys.wallet }), queryClient.invalidateQueries({ queryKey: keys.walletTransactions })]);
    },
  });
  const fundPrize = useMutation({
    mutationFn: (amountKobo: number) => post<CheckoutResponse>(`/tables/${table.id}/fund-prize`, { amountKobo }),
    async onSuccess(response, amountKobo) {
      savePayment({ reference: response.reference, purpose: 'SPONSOR_FUNDING', tableId: table.id, tableCode: table.code, tableTitle: table.title, amountKobo, createdAt: new Date().toISOString() });
      await openCheckout(response.authorizationUrl);
    },
  });

  const fundingControl = canFund && user ? <View style={styles.funding}>
    <Eyebrow style={{ marginBottom: 8 }}>{table.fundingDestination === 'CHARITY' ? 'Fund the charity allocation' : 'Fund the prize'}</Eyebrow>
    {table.guaranteedPrizeKobo !== null && table.guaranteedPrizeKobo < 1_000_000 && <Notice tone="warn">This older fixed draft is below the new ₦10,000 minimum and can’t be funded. Create a new competition with at least ₦10,000.</Notice>}
    {!table.guaranteedPrizeKobo && <TextField label="Your contribution · NGN" hint="Optional, any amount from ₦1. Jump keeps 15%; eligible winners share the rest." keyboardType="decimal-pad" value={fundingAmount} onChangeText={(text) => setFundingAmount(formatNairaInput(text))} />}
    {pendingPayment?.purpose === 'SPONSOR_FUNDING'
      ? <Button full variant="secondary" style={{ marginTop: 12 }} title="Check prize payment" onPress={() => router.push('/payments/return')} />
      : <Button full variant="secondary" style={{ marginTop: 12 }} loading={fundPrize.isPending} title={fundPrize.isPending ? 'Opening Paystack…' : `Fund ${formatMoney(fundingKobo || 0)}`}
        disabled={!Number.isSafeInteger(fundingKobo) || fundingKobo < (table.guaranteedPrizeKobo ? 1_000_000 : 100) || fundingKobo > (table.guaranteedPrizeKobo ? 1_000_000_000 : 100_000_000)} onPress={() => void confirmCheckout({ amountKobo: fundingKobo, purpose: `Adding to the prize for ${table.title}` }).then((ok) => { if (ok) fundPrize.mutate(fundingKobo); })} />}
    <Txt size={12} color="ink3" style={{ marginTop: 8 }}>{table.guaranteedPrizeKobo ? 'Only the host can fund this fixed amount; the host cannot win its cash prize.' : user?.id === table.creatorId ? 'You may contribute, but as host you cannot win this competition’s cash prize.' : 'Contributing is optional and does not affect your prize eligibility. Join the competition separately to compete.'}</Txt>
    <ErrorNotice error={fundPrize.error} />
  </View> : null;

  // Already in (or hosting): your place is on the leaderboard below and Leave is in the ⋯ menu by the
  // host, so only what still needs doing shows here: funding a draft, or chipping into the prize.
  if (joined || joinedRank !== undefined || user?.id === table.creatorId) {
    if (table.status === 'PENDING_FUNDING') return <HardShadow radius={radius.xl}>
      <View style={[styles.entry, { backgroundColor: colors.volt }]}><AccentSurface.Provider value>
        <Txt size={12} weight="bold" upper tracking={0.12}>Draft · funding needed</Txt>
        <Txt size={13} style={{ marginTop: 12 }}>Only you can fund this fixed amount. It will not go live until Paystack confirms the payment.</Txt>
        {fundingControl}
      </AccentSurface.Provider></View>
    </HardShadow>;
    return fundingControl ? <Card style={{ padding: 20 }}>{fundingControl}</Card> : null;
  }

  const isPaid = table.type === 'paid';
  const participantCount = isPaid ? Math.max(0, entrants - 1) : entrants;
  const conflict = isApiError(join.error, 409) ? joinConflictCopy(join.error.message) : null;
  return <HardShadow radius={radius.xl}>
    <View style={styles.entry}>
      <Stakes table={table} />
      <TimeLeft table={table} now={now} />
      <Faces faces={faces} count={participantCount} capacity={table.capacity} />
      <View style={{ marginTop: 20 }}>
        {!open ? <Notice tone="neutral">{table.status === 'PENDING_APPROVAL' ? 'Waiting for Jump to approve this competition.' : table.status === 'PENDING_FUNDING' ? 'This is a funding draft. Only the host can fund it; entry opens after Paystack confirms payment.' : 'Entry is closed for this competition.'}</Notice>
          : full ? <Notice tone="neutral">This competition is full.</Notice>
            : isPaid && pendingEntryPayment ? <Button full variant="secondary" title="Payment in progress: check status" onPress={() => router.push('/payments/return')} />
              : isPaid ? <>
                <Button full loading={checkout.isPending} title={checkout.isPending ? 'Opening Paystack…' : `Pay ${formatMoney(table.entryFeeKobo)} & enter`}
                  onPress={() => void confirmCheckout({ amountKobo: table.entryFeeKobo, purpose: `Entry to ${table.title}` }).then((ok) => { if (ok) checkout.mutate(); })} />
                {Number(wallet.data?.balanceKobo ?? 0) >= table.entryFeeKobo && <Button full variant="secondary" style={{ marginTop: 8 }} loading={enterWallet.isPending} title={enterWallet.isPending ? 'Entering…' : `Use entry credit · ${formatMoney(wallet.data?.balanceKobo ?? 0)} available`} onPress={() => enterWallet.mutate()} />}
                <Txt size={12} color="ink3" style={{ marginTop: 8 }}>You’ll pay securely on Paystack. Your seat is confirmed once we verify the payment.</Txt>
                {checkout.error && <View style={{ marginTop: 16 }}>
                  {isApiError(checkout.error, 503) ? <Notice tone="warn" title="Paid entry is switched off">Paid competitions are temporarily unavailable. Nothing has been charged.</Notice>
                    : isApiError(checkout.error, 403) ? <Notice tone="warn" title="Paid entry unavailable">{checkout.error.message}</Notice>
                      : <ErrorNotice error={checkout.error} />}
                </View>}
                <ErrorNotice error={enterWallet.error} />
              </>
                : <>
                  <Button full loading={join.isPending} title={join.isPending ? 'Joining…' : 'Join competition'} onPress={() => join.mutate()} />
                  {conflict ? <Notice tone="neutral" style={{ marginTop: 16 }}>{conflict}</Notice> : <ErrorNotice error={join.error} />}
                </>}
      </View>
      {fundingControl}
    </View>
  </HardShadow>;
}

/** The headline of the join box: what's at stake. */
function Stakes({ table }: { table: CompetitionTable }) {
  const money = (kobo: number) => formatMoney(kobo).replace(/\.00$/, '');
  const prizePot = table.type === 'sponsored' ? (table.fundedPrizeKobo || table.guaranteedPrizeKobo) : table.guaranteedPrizeKobo;
  const [big, small] = prizePot
    ? [money(prizeSplit(prizePot, table.platformFeeBps, table.creatorCommissionBps).winnerKobo), `prize ${table.prizeSplitBps?.length > 1 ? `shared by the top ${table.prizeSplitBps.length}` : 'for the winner'} · ${table.type === 'paid' ? `${money(table.entryFeeKobo)} to enter` : 'free to enter'}`]
    : table.type === 'sponsored' ? ['Funded free', 'free to enter · contribute to the prize']
      : table.type === 'paid' ? [money(table.entryFeeKobo), 'to enter · entry fees build the prize pot']
        : ['Free', `to join · ${table.challengeType === 'CYCLING' ? 'record a GPS ride' : table.challengeType === 'DISTANCE' ? 'run, walk or ride' : 'just walk or run'}`];
  return <View>
    <Score size={44}>{big}</Score>
    <Txt size={13} color="ink2" style={{ marginTop: 6 }}>{small}</Txt>
  </View>;
}

function TimeLeft({ table, now }: { table: CompetitionTable; now: number }) {
  const phase = competitionPhase(table, now);
  const start = new Date(table.startsAt ?? table.createdAt).getTime();
  const end = table.scoringClosesAt ? new Date(table.scoringClosesAt).getTime() : null;
  const done = end && end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : null;
  const daysLeft = end ? Math.ceil((end - now) / 86_400_000) : null;
  const label = phase === 'upcoming' ? `Starts in ${formatCountdown(table.startsAt!, now)}`
    : phase === 'final' || phase === 'scoring-closed' ? 'Competition ended'
      : daysLeft !== null && daysLeft > 1 ? `${daysLeft} days left`
        : end ? `Ends in ${formatCountdown(table.scoringClosesAt!, now)}` : 'No end date';
  return <View style={{ marginTop: 20 }}>
    {done !== null && <View style={styles.timeBar}><View style={{ height: '100%', borderRadius: 4, backgroundColor: colors.track, width: `${Math.max(3, done * 100)}%` }} /></View>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
      <Txt size={13} weight="bold">{label}</Txt>
      {end ? <Txt size={13} color="ink3">Ends {formatDate(table.scoringClosesAt)}</Txt> : null}
    </View>
  </View>;
}

function Faces({ faces, count, capacity }: { faces: LeaderboardRow[]; count: number; capacity: number | null }) {
  const shown = faces.slice(0, 5);
  const first = shown.map((face) => face.name.split(' ')[0]);
  const line = count === 0 ? 'Be the first to join'
    : count === 1 ? `${first[0] ?? 'One runner'} is in`
      : count === 2 && first.length === 2 ? `${first[0]} and ${first[1]} are in`
        : `${first[0] ?? 'Runners'}${first[1] ? `, ${first[1]}` : ''} and ${count - Math.min(2, first.length)} others are in`;
  return <View style={styles.faces}>
    {shown.length > 0 && <View style={{ flexDirection: 'row' }}>
      {shown.map((face, index) => <View key={face.userId} style={{ marginLeft: index ? -8 : 0, borderRadius: 17, borderWidth: 2, borderColor: colors.card }}><Avatar name={face.name} src={face.avatarUrl} avatarStyle={face.avatarStyle} size={30} round /></View>)}
    </View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt size={13} weight="semibold" leading={1.35}>{line}</Txt>
      {capacity ? <Txt size={12} color="ink3">{`${Math.max(0, capacity - count)} of ${capacity} spots left`}</Txt> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  private: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 20, borderRadius: radius.full, backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 4 },
  club: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', maxWidth: '100%', marginTop: 16, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingVertical: 6, paddingLeft: 6, paddingRight: 16 },
  clubLogo: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white },
  // At least the banner's own 2:1 shape, so the picture isn't cropped to a strip.
  race: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, backgroundColor: brand.ink, paddingVertical: 14, paddingLeft: 16, paddingRight: 12 },
  raceGo: { width: 56, height: 56, borderRadius: 28, backgroundColor: brand.volt, alignItems: 'center', justifyContent: 'center' },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 60 },
  hostRowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  bannerCover: { aspectRatio: 2, justifyContent: 'space-between' },
  onPhoto: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  cover: { borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.edge, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, overflow: 'hidden' },
  step: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 16 },
  stepNumber: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dates: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  date: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.edge },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingVertical: 8 },
  entry: { borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, padding: 20 },
  funding: { marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 16 },
  timeBar: { height: 8, borderRadius: 4, backgroundColor: colors.inkFaint, overflow: 'hidden' },
  faces: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 16 },
});
