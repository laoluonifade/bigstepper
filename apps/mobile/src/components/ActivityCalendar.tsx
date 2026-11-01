import { formatDistance, formatDistanceNumber } from '@jump/shared/format';
import type { Unit } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { colors, fontFamily, radius, wideLabel } from '@/lib/theme';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { Card, ErrorNotice, Eyebrow, haptic, HardShadow, Segmented, Skeleton, Txt } from './ui';

type DayTotal = { day: string; activities: number; steps: number; distanceMetres: string; healthSteps?: number };

const HEALTH_PINK = '#FF2D55';
type Metric = 'steps' | 'distance';

const compact = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}K` : String(value));

/** A month of days: orange where you recorded an activity, pink where Apple Health counted steps, with that day's distance or steps. */
export function ActivityCalendar({ unit }: { unit: Unit }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [metric, setMetric] = useState<Metric>('distance');
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const totals = useQuery({
    queryKey: ['activity-calendar', monthKey, timeZone],
    queryFn: () => api<DayTotal[]>(`/activities/calendar?month=${monthKey}&tz=${encodeURIComponent(timeZone)}`),
  });
  const days = new Map(totals.data?.map((day) => [day.day, day]));
  const firstWeekday = (month.getDay() + 6) % 7;
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthSteps = totals.data?.reduce((sum, day) => sum + day.steps, 0) ?? 0;
  const monthMetres = totals.data?.reduce((sum, day) => sum + Number(day.distanceMetres), 0) ?? 0;
  const healthDays = totals.data?.some((day) => !day.activities && (day.healthSteps ?? 0) > 0) ?? false;
  const cells = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const changeMonth = (amount: number) => { haptic(); setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1)); };

  return <Card variant="strong" style={{ padding: 16, marginBottom: 32 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={wideLabel(16, 0)}>Every day counts</Text>
        <View style={styles.legend}>
          <View style={[styles.swatch, { backgroundColor: colors.track }]} /><Txt size={12} color="ink2">Activity</Txt>
          {healthDays && <><View style={[styles.swatch, { backgroundColor: HEALTH_PINK, marginLeft: 8 }]} /><Txt size={12} color="ink2">Apple Health steps</Txt></>}
        </View>
      </View>
      <Segmented<Metric> size="sm" label="Calendar measure" value={metric} onChange={setMetric} options={[{ value: 'distance', label: unit === 'km' ? 'Km' : 'Mi' }, { value: 'steps', label: 'Steps' }]} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
      <MonthButton onPress={() => changeMonth(-1)} label="Previous month"><ChevronLeftIcon size={18} /></MonthButton>
      <View style={{ alignItems: 'center' }}>
        <Txt size={16} weight="bold">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Txt>
        <Txt size={12} color="ink2" num>{`${metric === 'steps' ? `${monthSteps.toLocaleString('en-GB')} steps` : formatDistance(monthMetres, unit)} · ${totals.data?.length ?? 0} active ${totals.data?.length === 1 ? 'day' : 'days'}`}</Txt>
      </View>
      <MonthButton onPress={() => changeMonth(1)} label="Next month"><ChevronRightIcon size={18} /></MonthButton>
    </View>
    <ErrorNotice error={totals.error} onRetry={() => void totals.refetch()} />
    {totals.isLoading ? <Skeleton style={{ height: 224, marginTop: 16 }} /> : <View style={{ marginTop: 16 }}>
      <View style={styles.week}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <View key={index} style={styles.cell}><Eyebrow color="ink3">{label}</Eyebrow></View>)}</View>
      <View style={styles.week}>
        {cells.map((dayNumber, index) => {
          if (dayNumber === null) return <View key={`blank-${index}`} style={styles.cell} />;
          const date = `${monthKey}-${String(dayNumber).padStart(2, '0')}`;
          const day = days.get(date);
          const recorded = (day?.activities ?? 0) > 0;
          const health = !recorded && (day?.healthSteps ?? 0) > 0;
          const moved = recorded || health;
          const value = metric === 'steps' ? (day?.steps ?? 0) : Number(day?.distanceMetres ?? 0);
          const what = recorded ? `${day!.activities} ${day!.activities === 1 ? 'activity' : 'activities'}` : 'steps from Apple Health';
          return <View key={date} style={styles.cell}>
            <View style={[styles.day, recorded ? { backgroundColor: colors.track } : health ? { backgroundColor: HEALTH_PINK } : { backgroundColor: 'rgba(18,18,18,0.035)' }, date === todayKey && { borderWidth: 2, borderColor: colors.edge }]}
              accessibilityLabel={moved ? `${date}: ${what}, ${metric === 'steps' ? `${value} steps` : formatDistance(value, unit)}` : `${date}: rest day`}>
              <Text style={[styles.dayNumber, recorded ? { color: colors.paper } : health ? { color: '#FFFFFF' } : { color: colors.ink3, fontFamily: fontFamily('medium') }]}>{dayNumber}</Text>
              {moved && <Text numberOfLines={1} style={[styles.dayValue, health && { color: '#FFFFFF' }]}>{value > 0 ? (metric === 'steps' ? compact(value) : formatDistanceNumber(value, unit)) : '•'}</Text>}
            </View>
          </View>;
        })}
      </View>
    </View>}
  </Card>;
}

function MonthButton({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    {({ pressed }) => <HardShadow offset={2} radius={radius.md} pressed={pressed}>
      <View style={styles.monthButton}>{children}</View>
    </HardShadow>}
  </Pressable>;
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, padding: 3, alignItems: 'center' },
  day: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 1 },
  dayNumber: { fontFamily: fontFamily('bold'), fontSize: 12, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  swatch: { width: 9, height: 9, borderRadius: 3 },
  dayValue: { fontFamily: fontFamily('semibold'), fontSize: 9.5, color: colors.paper, opacity: 0.9, fontVariant: ['tabular-nums'] },
  monthButton: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
});
