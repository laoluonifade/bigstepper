import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { DateTimePicker } from '@/components/DateTimePicker';
import { clockLabel, nth, repeatRule, WEEK_ORDER, WEEKDAYS, weekdayInMonth, weekOfMonth, type Schedule } from '@/lib/club-events';
import { brand, colors, fontFamily, radius, score, voltWash, wideLabel } from '@/lib/theme';
import { FieldLabel, haptic, Segmented, Txt } from './ui';

const UNITS = [{ value: 'daily', label: 'Day' }, { value: 'weekly', label: 'Week' }, { value: 'monthly', label: 'Month' }] as const;
type Unit = (typeof UNITS)[number]['value'];
const UNIT_WORD: Record<Unit, string> = { daily: 'day', weekly: 'week', monthly: 'month' };

/** The weekday a `YYYY-MM-DD` date falls on, 0 being Sunday. */
const weekdayOf = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

/** A fresh schedule for `unit`, starting from the first date: its weekday, its date, its week of the month. */
export function scheduleFor(unit: Schedule['repeat'], startsOn: string, keep?: Schedule): Schedule {
  return {
    repeat: unit,
    repeatEvery: unit === 'once' ? 1 : keep?.repeatEvery ?? 1,
    weekdays: unit === 'weekly' ? (keep?.weekdays.length ? keep.weekdays : [weekdayOf(startsOn)]) : [],
    monthMode: unit === 'monthly' ? keep?.monthMode ?? 'date' : null,
    monthWeek: unit === 'monthly' && keep?.monthMode === 'weekday' ? weekOfMonth(startsOn) : null,
    endsOn: unit === 'once' ? null : keep?.endsOn ?? null,
  };
}

/**
 * Repeats, the way a calendar does it: off for a one-off, or every N days, weeks or months, on whichever
 * weekdays, on the date or the "second Saturday", until a date or forever. A sentence underneath says
 * exactly what you've made, so nothing is decided for you behind the scenes.
 */
export function RepeatEditor({ value, startsOn, startTime, onChange }: { value: Schedule; startsOn: string; startTime: string; onChange: (next: Schedule) => void }) {
  const on = value.repeat !== 'once';
  const unit: Unit = value.repeat === 'once' ? 'weekly' : value.repeat;
  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch });
  const every = value.repeatEvery || 1;
  const toggleDay = (day: number) => {
    haptic('select');
    const has = value.weekdays.includes(day);
    if (has && value.weekdays.length === 1) return;
    set({ weekdays: has ? value.weekdays.filter((item) => item !== day) : [...value.weekdays, day] });
  };

  return <View style={styles.box}>
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Txt size={15} weight="bold">Repeats</Txt>
        <Txt size={12.5} color="ink3">{on ? 'Same time, on a schedule you set' : 'Just this once'}</Txt>
      </View>
      <Switch value={on} onValueChange={(next) => { haptic('select'); onChange(scheduleFor(next ? 'weekly' : 'once', startsOn, value)); }} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} accessibilityLabel="Repeats" />
    </View>

    {on && <View style={{ gap: 16, marginTop: 16 }}>
      <View>
        <FieldLabel label="Every" />
        <View style={styles.row}>
          <View style={styles.stepper}>
            <Pressable onPress={() => { haptic('select'); set({ repeatEvery: Math.max(1, every - 1) }); }} disabled={every <= 1} hitSlop={6} style={[styles.step, every <= 1 && { opacity: 0.35 }]} accessibilityRole="button" accessibilityLabel="Fewer">
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Text style={[score(22), { minWidth: 28, textAlign: 'center' }]} accessibilityLabel={`Every ${every}`}>{every}</Text>
            <Pressable onPress={() => { haptic('select'); set({ repeatEvery: Math.min(12, every + 1) }); }} disabled={every >= 12} hitSlop={6} style={[styles.step, every >= 12 && { opacity: 0.35 }]} accessibilityRole="button" accessibilityLabel="More">
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
          <Txt size={15} weight="bold">{`${UNIT_WORD[unit]}${every > 1 ? 's' : ''}`}</Txt>
        </View>
        <View style={{ marginTop: 10 }}>
          <Segmented<Unit> stretch label="Repeat unit" value={unit} onChange={(next) => onChange(scheduleFor(next, startsOn, value))} options={[...UNITS]} />
        </View>
      </View>

      {unit === 'weekly' && <View>
        <FieldLabel label="On" />
        <View style={styles.days} accessibilityRole="none">
          {WEEK_ORDER.map((day) => {
            const picked = value.weekdays.includes(day);
            return <Pressable key={day} onPress={() => toggleDay(day)} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} accessibilityLabel={WEEKDAYS[day]}
              style={[styles.day, picked && styles.dayOn]}>
              <Text style={[styles.dayText, picked && { color: brand.ink }]}>{WEEKDAYS[day].slice(0, 1)}</Text>
            </Pressable>;
          })}
        </View>
      </View>}

      {unit === 'monthly' && <View>
        <FieldLabel label="On" />
        <Segmented<'date' | 'weekday'> stretch label="Monthly on" value={value.monthMode ?? 'date'}
          onChange={(mode) => set({ monthMode: mode, monthWeek: mode === 'weekday' ? weekOfMonth(startsOn) : null })}
          options={[{ value: 'date', label: `The ${nth(Number(startsOn.split('-')[2]))}` }, { value: 'weekday', label: `The ${weekdayInMonth(startsOn)}` }]} />
      </View>}

      <View>
        <FieldLabel label="Ends" />
        <Segmented<'never' | 'date'> stretch label="Ends" value={value.endsOn ? 'date' : 'never'}
          onChange={(mode) => set({ endsOn: mode === 'never' ? null : value.endsOn ?? addDays(startsOn, 56) })}
          options={[{ value: 'never', label: 'Never' }, { value: 'date', label: 'On a date' }]} />
        {value.endsOn ? <View style={{ marginTop: 10 }}>
          <DateTimePicker dateOnly value={`${value.endsOn}T00:00`} min={`${startsOn}T00:00`} onChange={(next) => set({ endsOn: next.slice(0, 10) })} />
        </View> : null}
      </View>
    </View>}

    <View style={styles.summary}>
      <Text style={[wideLabel(10), { color: colors.ink2 }]}>{on ? 'Your schedule' : 'One-off'}</Text>
      <Txt size={14} weight="bold" style={{ marginTop: 2 }}>{`${repeatRule({ ...value, startsOn })} at ${clockLabel(startTime)}`}</Txt>
    </View>
  </View>;
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  box: { borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, paddingHorizontal: 6, height: 40 },
  step: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inkWash },
  stepText: { fontFamily: fontFamily('bold'), fontSize: 18, lineHeight: 20, color: colors.ink },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: brand.volt, borderColor: brand.ink, borderWidth: 2 },
  dayText: { fontFamily: fontFamily('bold'), fontSize: 14, color: colors.ink },
  summary: { marginTop: 14, borderRadius: radius.lg, backgroundColor: voltWash(0.35), paddingHorizontal: 12, paddingVertical: 10 },
});
