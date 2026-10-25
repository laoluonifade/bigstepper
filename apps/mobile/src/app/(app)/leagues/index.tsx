import { formatCountdown, formatDate, formatDistance, ordinal } from '@jump/shared/format';
import { divisionRank, leagueZone, OUTCOME_LABEL, rulesLine } from '@jump/shared/league';
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRightIcon } from '@/components/icons';
import { DivisionBadge, ZoneTag } from '@/components/league';
import { Button, Card, EmptyState, ErrorNotice, Eyebrow, Notice, PageHeader, Score, Screen, SectionTitle, Skeleton, TextLink, Txt, useNow } from '@/components/ui';
import { useLeagues, useLeagueStandings, useMyLeagues, useUnit } from '@/lib/queries';
import { brand, colors, display, radius, wideLabel } from '@/lib/theme';

export default function LeaguesScreen() {
  const leagues = useLeagues();
  const unit = useUnit();
  const now = useNow(60_000);
  const seasons = leagues.data?.seasons ?? [];
  const divisions = [...(leagues.data?.divisions ?? [])].sort((a, b) => b.level - a.level);
  const active = seasons.find((season) => season.status === 'ACTIVE');
  const others = seasons.filter((season) => season.id !== active?.id);

  return <Screen refreshing={leagues.isRefetching} onRefresh={() => void leagues.refetch()}>
    <Stack.Screen options={{ title: 'My league' }} />
    <PageHeader eyebrow="You" title="My league" description="Your monthly ranking. Verified walk and run distance places you in your division. Only signed-in runners can see it." />
    <LastSeasonResult />
    <ErrorNotice error={leagues.error} onRetry={() => void leagues.refetch()} />
    {leagues.isLoading ? <Skeleton style={{ height: 256 }} />
      : !active ? <EmptyState title="No active season">The next season hasn’t started yet.</EmptyState>
        : <Card variant="strong" padded={false}>
          <View style={styles.season}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow style={{ color: brand.onInkMuted }}>Current season</Eyebrow>
              <Text style={[display(26), { color: brand.paper, marginTop: 4 }]}>{active.name}</Text>
              <Txt size={13} num style={{ marginTop: 4, color: brand.onInkMuted }}>{`${formatDate(active.startsAt)} – ${formatDate(active.endsAt, { year: 'numeric' })}`}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Eyebrow style={{ color: brand.onInkMuted }}>Ends in</Eyebrow>
              <Score size={30} color="volt" style={{ marginTop: 4 }}>{formatCountdown(active.endsAt, now)}</Score>
            </View>
          </View>
          <MyDivision seasonId={active.id} unit={unit} />
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, padding: 16 }}>
            <Button variant="secondary" title="Full standings" iconRight={<ArrowRightIcon size={16} />} onPress={() => router.push(`/leagues/${active.id}`)} />
          </View>
        </Card>}

    {active && <View style={{ marginTop: 32 }}>
      <SectionTitle>Divisions</SectionTitle>
      <View style={{ gap: 8 }}>
        {divisions.map((division) => <View key={division.id} style={styles.division}>
          <DivisionBadge division={division} />
          <Text style={[wideLabel(14, 0), { flex: 1 }]}>{division.name}</Text>
          <Txt size={12} color="ink3" num>Level {division.level}</Txt>
        </View>)}
      </View>
      <Txt size={12} color="ink2" leading={1.5} style={{ marginTop: 12 }}>{`${rulesLine(leagues.data?.rules)} Everyone starts in ${divisions[divisions.length - 1]?.name ?? 'the bottom division'}.`}</Txt>
    </View>}

    {others.length > 0 && <View style={{ marginTop: 40 }}>
      <SectionTitle>Other seasons</SectionTitle>
      {others.map((season, index) => <Pressable key={season.id} onPress={() => router.push(`/leagues/${season.id}`)} style={({ pressed }) => [styles.other, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, pressed && { opacity: 0.6 }]}>
        <Txt size={15} weight="semibold">{season.name}</Txt>
        <Txt size={13} color="ink2" num>{`${formatDate(season.startsAt)} – ${formatDate(season.endsAt, { year: 'numeric' })}`}</Txt>
      </Pressable>)}
    </View>}
  </Screen>;
}

function MyDivision({ seasonId, unit }: { seasonId: string; unit: 'km' | 'mi' }) {
  const leagues = useLeagues();
  const mine = useMyLeagues();
  const membership = mine.data?.find((item) => item.seasonId === seasonId);
  const standings = useLeagueStandings(membership ? seasonId : undefined);
  const division = leagues.data?.divisions.find((item) => item.id === membership?.divisionId);
  const position = membership && standings.data ? divisionRank(standings.data, membership) : null;
  const zone = membership && position?.rank ? leagueZone(position.rank, position.size, membership.creditedDistanceMetres, division, leagues.data?.divisions ?? [], leagues.data?.rules) : null;
  if (mine.isLoading) return <Skeleton style={{ height: 80, margin: 20 }} />;
  if (!membership) return <Txt size={14} color="ink2" style={{ padding: 20 }}>You haven’t been placed in this season yet.</Txt>;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 }}>
    <DivisionBadge division={division} size="lg" />
    <View style={{ flex: 1 }}>
      <Eyebrow>Your division</Eyebrow>
      <Text style={[wideLabel(22, 0), { fontFamily: 'ArchivoWide-Black', marginTop: 4 }]}>{division?.name ?? 'Division'}</Text>
      {zone ? <View style={{ marginTop: 8 }}><ZoneTag zone={zone} /></View> : null}
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Score size={40}>{position?.rank ? ordinal(position.rank) : '–'}</Score>
      <Txt size={12} color="ink2" num>{`of ${position?.size ?? '–'} · ${formatDistance(membership.creditedDistanceMetres, unit)}`}</Txt>
    </View>
  </View>;
}

/** The runner's result from the most recent finished season, if they took part. */
function LastSeasonResult() {
  const leagues = useLeagues();
  const mine = useMyLeagues();
  const unit = useUnit();
  const seasons = leagues.data?.seasons ?? [];
  const last = mine.data?.filter((item) => item.outcome)
    .map((item) => ({ item, season: seasons.find((season) => season.id === item.seasonId) }))
    .filter((entry) => entry.season?.status === 'FINALIZED')
    .sort((a, b) => new Date(b.season!.endsAt).getTime() - new Date(a.season!.endsAt).getTime())[0];
  if (!last || !last.item.outcome) return null;
  const division = leagues.data?.divisions.find((item) => item.id === last.item.divisionId);
  return <Notice tone={last.item.outcome === 'PROMOTED' ? 'ok' : last.item.outcome === 'RELEGATED' ? 'warn' : 'info'} title={`${last.season!.name}: ${OUTCOME_LABEL[last.item.outcome]}`} style={{ marginBottom: 24 }}
    action={<TextLink title="Final standings" onPress={() => router.push(`/leagues/${last.item.seasonId}`)} />}>
    {`You finished ${last.item.finalRank ? ordinal(last.item.finalRank) : '-'} in ${division?.name ?? 'your division'} with ${formatDistance(last.item.creditedDistanceMetres, unit)}.`}
  </Notice>;
}

const styles = StyleSheet.create({
  // Always dark, in either theme (theme ink turns cream in dark mode, and the volt countdown vanished on it).
  season: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, backgroundColor: brand.ink, padding: 20 },
  division: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 10 },
  other: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
});
