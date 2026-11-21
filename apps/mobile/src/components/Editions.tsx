import { editionName, resultsPendingUntil } from '@jump/shared/competition';
import { formatDate, formatDateTime, ordinal } from '@jump/shared/format';
import { formatScore } from '@jump/shared/scoring';
import type { CompetitionEdition, CompetitionTable, MedalKind, Unit } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { api } from '@/lib/api';
import { colors, radius } from '@/lib/theme';
import { ChevronRightIcon } from './icons';
import { Avatar, Button, ErrorNotice, haptic, Notice, SectionTitle, Skeleton, Txt } from './ui';

export const MEDAL_EMOJI: Record<MedalKind, string> = { gold: '🥇', silver: '🥈', bronze: '🥉', completion: '🏅' };

/** Under a board that has ended but isn't final: late Apple Health syncs still count until results lock. */
export function ResultsPending({ table, now, style }: { table: CompetitionTable; now: number; style?: StyleProp<ViewStyle> }) {
  const until = resultsPendingUntil(table, now);
  if (!until) return null;
  return <Notice tone="info" title="Checking the final results" style={style}>
    {`Steps that sync late from Apple Health still count until ${formatDateTime(until.toISOString())}. Then the board locks and medals go out.`}
  </Notice>;
}

/**
 * Every edition of a recurring competition, newest first: when it ran, how many took part, who took the
 * medals and how you did. Tap one for its final board.
 */
export function EditionHistory({ table, seriesTitle, unit }: { table: CompetitionTable; seriesTitle?: string | null; unit: Unit }) {
  const [all, setAll] = useState(false);
  const editions = useQuery({
    queryKey: ['table-editions', table.id],
    queryFn: () => api<CompetitionEdition[]>(`/tables/${table.id}/editions`),
    enabled: Boolean(table.seriesId),
    staleTime: 60_000,
  });
  if (!table.seriesId) return null;
  const others = (editions.data ?? []).filter((edition) => edition.id !== table.id);
  if (editions.isSuccess && !others.length) return null;
  const shown = all ? others : others.slice(0, 6);
  return <View>
    <SectionTitle aside={others.length ? `${others.length} ${others.length === 1 ? 'edition' : 'editions'}` : undefined}>Past and upcoming</SectionTitle>
    {editions.isLoading ? <Skeleton style={{ height: 160 }} />
      : editions.error ? <ErrorNotice error={editions.error} onRetry={() => void editions.refetch()} />
        : <View style={styles.list}>
          {shown.map((edition, index) => <EditionRow key={edition.id} edition={edition} table={table} seriesTitle={seriesTitle} unit={unit} last={index === shown.length - 1} />)}
        </View>}
    {others.length > 6 && <Button full variant="quiet" style={{ marginTop: 12 }} title={all ? 'Show fewer' : `See all ${others.length}`} onPress={() => setAll((value) => !value)} />}
  </View>;
}

function EditionRow({ edition, table, seriesTitle, unit, last }: { edition: CompetitionEdition; table: CompetitionTable; seriesTitle?: string | null; unit: Unit; last: boolean }) {
  const ended = edition.scoringClosesAt ? new Date(edition.scoringClosesAt).getTime() <= Date.now() : false;
  const upcoming = edition.startsAt ? new Date(edition.startsAt).getTime() > Date.now() : false;
  const completion = table.medalRule === 'completion';
  const status = edition.resultsFinalizedAt
    ? `${edition.entrants} took part${completion ? ` · ${edition.completed} finished` : ''}`
    : ended ? 'Checking results' : upcoming ? `Starts ${formatDate(edition.startsAt!)}` : `Live · ${edition.entrants} in`;
  const mine = edition.mine;
  return <Pressable onPress={() => { haptic(); router.push(`/competitions/${edition.code}`); }} accessibilityRole="link"
    accessibilityLabel={`${editionName(edition.title, seriesTitle)}, ${status}${mine ? `, you finished ${ordinal(mine.rank)}` : ''}`}
    style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { opacity: 0.8 }]}>
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Txt size={15} weight="bold" numberOfLines={1}>{editionName(edition.title, seriesTitle)}</Txt>
      <Txt size={12} color="ink2" numberOfLines={1}>{status}</Txt>
      {edition.podium.length > 0 && <View style={styles.podium}>
        {edition.podium.map((winner) => <View key={`${winner.rank}-${winner.username ?? winner.displayName}`} style={styles.winner}>
          <Avatar name={winner.displayName} src={winner.avatarUrl} avatarStyle={winner.avatarStyle} size={20} round />
          <Txt size={12} weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{`${winner.medal ? MEDAL_EMOJI[winner.medal] : ''} ${winner.displayName}`}</Txt>
        </View>)}
      </View>}
      {mine && <Txt size={12} weight="bold" color="ink" numberOfLines={1}>
        {mine.medal === 'completion' ? '🏅 You finished it' : mine.medal ? `${MEDAL_EMOJI[mine.medal]} You came ${ordinal(mine.rank)}` : `You came ${ordinal(mine.rank)}`}
        {mine.score != null && mine.medal !== 'completion' ? ` · ${formatScore(table, mine.score, unit) ?? ''}` : ''}
      </Txt>}
    </View>
    <ChevronRightIcon size={18} color={colors.ink3} />
  </Pressable>;
}

const styles = StyleSheet.create({
  list: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  podium: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  winner: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '48%' },
});
