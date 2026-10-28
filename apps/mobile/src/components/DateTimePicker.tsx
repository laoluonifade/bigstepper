import RNDateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radius, scheme } from '@/lib/theme';
import { CalendarIcon, ClockIcon } from './icons';
import { Sheet } from './Sheet';
import { Button, FieldLabel, haptic, Hint } from './ui';

/**
 * Date + time as two halves of one field, like the web's DateTimePicker. iOS opens the system calendar
 * or time wheel in a sheet; Android opens its own date and time dialogs. Values use the
 * `YYYY-MM-DDTHH:mm` local-time format, so `toLocalInput` / `fromLocalInput` keep working.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const local = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const parse = (value: string) => {
  const [day, time = '00:00'] = value.split('T');
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
};

function dayLabel(date: Date) {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const timeLabel = (date: Date) => `${date.getHours() % 12 || 12}:${pad(date.getMinutes())} ${date.getHours() < 12 ? 'am' : 'pm'}`;

export function DateTimePicker({ label, hint, value, min, onChange, timeOnly, dateOnly }: { label?: string; hint?: string; value: string; min?: string; onChange: (value: string) => void; timeOnly?: boolean; dateOnly?: boolean }) {
  const current = value ? parse(value) : new Date();
  const minimum = min ? parse(min) : undefined;
  const [editing, setEditing] = useState<'date' | 'time' | null>(null);
  const [draft, setDraft] = useState(current);

  // Picking a day keeps the time; never go before `min`.
  const commit = (next: Date) => onChange(local(minimum && next < minimum ? minimum : next));

  function open(mode: 'date' | 'time') {
    haptic();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode,
        is24Hour: false,
        ...(mode === 'date' && minimum ? { minimumDate: minimum } : {}),
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type !== 'set' || !picked) return;
          const next = new Date(current);
          if (mode === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
          else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
          commit(next);
        },
      });
      return;
    }
    setDraft(current);
    setEditing(mode);
  }

  return <View>
    {label ? <FieldLabel label={label} /> : null}
    <View style={[styles.field, timeOnly && { alignSelf: 'flex-start', minWidth: 160 }]}>
      {!timeOnly && <><Pressable onPress={() => open('date')} style={({ pressed }) => [styles.half, pressed && { backgroundColor: colors.inkWash }]} accessibilityRole="button" accessibilityLabel={`${label ?? 'Date'}: ${dayLabel(current)}`}>
        <CalendarIcon size={16} color={colors.ink3} />
        <Text style={styles.value} numberOfLines={1}>{value ? dayLabel(current) : 'Pick a day'}</Text>
      </Pressable>
      {!dateOnly && <View style={styles.divider} />}</>}
      {!dateOnly && <Pressable onPress={() => open('time')} style={({ pressed }) => [styles.half, { flex: timeOnly ? 1 : 0.8 }, pressed && { backgroundColor: colors.inkWash }]} accessibilityRole="button" accessibilityLabel={`Time: ${timeLabel(current)}`}>
        <ClockIcon size={16} color={colors.ink3} />
        <Text style={styles.value} numberOfLines={1}>{value ? timeLabel(current) : 'Time'}</Text>
      </Pressable>}
    </View>
    {hint ? <Hint>{hint}</Hint> : null}
    {Platform.OS === 'ios' && <Sheet open={editing !== null} onOpenChange={(next) => !next && setEditing(null)} title={editing === 'time' ? 'Time' : 'Day'}
      footer={<Button full title="Done" variant="dark" onPress={() => { commit(draft); setEditing(null); }} />}>
      <View style={{ alignItems: 'center' }}>
        <RNDateTimePicker value={draft} mode={editing ?? 'date'} display={editing === 'time' ? 'spinner' : 'inline'} minuteInterval={5}
          minimumDate={editing === 'date' ? minimum : undefined} accentColor={colors.track} textColor={colors.ink} themeVariant={scheme}
          onChange={(_, picked) => picked && setDraft(picked)} style={{ alignSelf: 'stretch' }} />
      </View>
    </Sheet>}
  </View>;
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'stretch', height: 50, borderRadius: radius.base, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, overflow: 'hidden' },
  half: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  divider: { width: 1.5, backgroundColor: colors.line },
  value: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
});
