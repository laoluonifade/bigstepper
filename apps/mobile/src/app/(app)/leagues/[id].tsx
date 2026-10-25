import { rulesLine } from '@jump/shared/league';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { DivisionBadge } from '@/components/league';
import { Leaderboard } from '@/components/Leaderboard';
import { EmptyState, ErrorNotice, haptic, PageHeader, Screen, Skeleton, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLeagues, useLeagueStandings, useUnit } from '@/lib/queries';
import { brand, colors, GUTTER, radius } from '@/lib/theme';

export default function LeagueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const unit = useUnit();
  const leagues = useLeagues();
  const standings = useLeagueStandings(id);
  const season = leagues.data?.seasons.find((item) => item.id === id);
  const divisions = [...(leagues.data?.divisions ?? [])].sort((a, b) => b.level - a.level);
  const myDivisionId = standings.data?.find((row) => row.userId === user?.id)?.divisionId;
  const [picked, setPicked] = useState<string | null>(null);
  const divisionId = picked ?? myDivisionId ?? divisions[divisions.length - 1]?.id;
  const rows = useMemo(() => (standings.data ?? []).filter((row) => row.divisionId === divisionId).map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    name: row.displayName ?? (row.username ? `@${row.username}` : row.userId === user?.id ? 'You' : 'Runner'),
    avatarUrl: row.avatarUrl,
    avatarStyle: row.avatarStyle,
    username: row.username,
    metres: row.creditedDistanceMetres,
  })), [divisionId, standings.data, user]);

  return <Screen refreshing={standings.isRefetching} onRefresh={() => void standings.refetch()}>
    <Stack.Screen options={{ title: season?.name ?? 'Season' }} />
    <PageHeader eyebrow="League standings" title={season?.name ?? 'Season'} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER, marginBottom: 20, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER }} accessibilityRole="tablist">
      {divisions.map((division) => {
        const active = division.id === divisionId;
        return <Pressable key={division.id} onPress={() => { haptic(); setPicked(division.id); }} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.division, active && { borderColor: brand.ink, backgroundColor: brand.ink }]}>
          <DivisionBadge division={division} />
          <Txt size={13} weight="bold" style={active ? { color: brand.paper } : undefined}>{division.name}</Txt>
          {division.id === myDivisionId ? <Txt size={10} weight="bold" upper tracking={0.1} color="volt" style={!active ? { color: colors.trackDeep } : undefined}>You</Txt> : null}
        </Pressable>;
      })}
    </ScrollView>
    <ErrorNotice error={standings.error} onRetry={() => void standings.refetch()} />
    {standings.isLoading || leagues.isLoading ? <Skeleton style={{ height: 256 }} /> : <View>
      <Txt size={12} color="ink2" style={{ marginBottom: 8 }}>{season?.status === 'FINALIZED' ? 'Final standings. Verified distance only.' : `Verified distance only. ${rulesLine(leagues.data?.rules)}`}</Txt>
      <Leaderboard rows={rows} currentUserId={user?.id} unit={unit} limit={100} empty={<EmptyState title="Nobody in this division yet" />} />
    </View>}
  </Screen>;
}

const styles = StyleSheet.create({
  division: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.base, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingVertical: 6, paddingLeft: 6, paddingRight: 12 },
});
