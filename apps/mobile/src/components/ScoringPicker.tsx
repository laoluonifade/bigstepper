import { ACTIVITY_RULES, dailyMeasure, METRICS, scoringOption, type ActivityType, type ChallengeType, type ScoringMethod } from '@jump/shared/competition-rules';
import { draftFor, type ScoringDraft } from '@jump/shared/scoring-draft';
import type { Unit } from '@jump/shared/types';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { ChallengeMark } from './competition';
import { ChevronDownIcon } from './icons';
import { SelectField } from './pickers';
import { haptic, Hint, TextField, Txt } from './ui';

const KIND_LABELS: Record<ActivityType, string> = { run: 'Runs', walk: 'Walks', cycle: 'Rides' };

/**
 * Activity and how to win as two pickers, then only the settings that way of winning needs. Ways that
 * can't carry cash are disabled when the competition has a prize.
 */
export function ScoringPicker({ draft, onChange, unit, prizes, error }: { draft: ScoringDraft; onChange: (next: ScoringDraft) => void; unit: Unit; prizes: boolean; error?: string | null }) {
  const activity = ACTIVITY_RULES[draft.challengeType];
  const metric = METRICS[draft.scoringMethod];
  const daily = dailyMeasure(draft.challengeType, draft.scoringMethod);
  const allowed = (method: ScoringMethod) => !prizes || (METRICS[method].prizes && draft.challengeType !== 'CYCLING');
  const set = (patch: Partial<ScoringDraft>) => onChange({ ...draft, ...patch });
  const distanceUnit = unit === 'km' ? 'km' : 'mi';
  const [qualifying, setQualifying] = useState(Boolean(draft.minActivityDistance || draft.minActivityMinutes || (draft.minSessions && draft.scoringMethod !== 'PACE_CONSISTENCY')));

  return <View style={{ gap: 20 }}>
    <SelectField label="Activity" value={draft.challengeType} leading={<ChallengeMark type={draft.challengeType} code={draft.challengeType} size={24} />}
      options={(Object.keys(ACTIVITY_RULES) as ChallengeType[]).map((type) => ({ value: type, label: ACTIVITY_RULES[type].label, detail: `${ACTIVITY_RULES[type].options.length} ways to win`, icon: <ChallengeMark type={type} code={type} size={28} /> }))}
      onChange={(next) => {
        const first = ACTIVITY_RULES[next].options.find((option) => allowed(option.method)) ?? ACTIVITY_RULES[next].options[0];
        onChange(draftFor(next, first.method));
      }} />
    <SelectField label="How to win" value={draft.scoringMethod} hint={allowed(draft.scoringMethod) ? scoringOption(draft.challengeType, draft.scoringMethod)?.summary : undefined}
      options={activity.options.map((option) => ({ value: option.method, label: option.label, detail: allowed(option.method) ? option.summary : 'Free competitions only for now', disabled: !allowed(option.method) }))}
      onChange={(method) => set(draftFor(draft.challengeType, method, draft))} />

    {metric.target && <TextField keyboardType="decimal-pad" value={draft.target} onChangeText={(target) => set({ target })}
      label={{ distance: metric.aggregate === 'fastest' ? `Race distance (${distanceUnit})` : metric.aggregate === 'firstTo' ? `Target distance (${distanceUnit})` : `Count ${activity.sessions} of at least (${distanceUnit})`, steps: 'Step target', time: 'Target time (hours)', sessions: `Number of ${activity.sessions}` }[metric.target]}
      hint={metric.aggregate === 'fastest' ? 'Each person’s fastest stretch of this distance, inside any one activity.' : metric.aggregate === 'firstTo' ? 'Added up across the competition. First to reach it wins.' : undefined} />}
    {daily && <TextField keyboardType="decimal-pad" value={draft.daily} onChangeText={(next) => set({ daily: next })} optional={metric.daily === 'optional'}
      label={`${metric.daily === 'optional' ? 'Count a day from' : metric.aggregate === 'dailyVariation' ? 'Minimum daily average' : 'Daily target'} (${daily === 'distance' ? distanceUnit : daily === 'steps' ? 'steps' : 'minutes'})`}
      hint={metric.daily === 'optional' ? `Leave empty and any day with a ${activity.sessions.replace(/s$/, '')} counts.` : metric.aggregate === 'streak' ? 'Every day in a row has to reach this.' : undefined} />}

    {draft.challengeType === 'TIMED' && <View>
      <Txt size={13} weight="semibold" style={{ marginBottom: 6 }}>What counts</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {activity.kinds.map((kind) => {
          const on = draft.kinds.includes(kind);
          return <Pressable key={kind} onPress={() => { haptic(); set({ kinds: on ? draft.kinds.filter((value) => value !== kind) : [...draft.kinds, kind] }); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            style={[styles.toggle, on && { backgroundColor: colors.ink }]}>
            <Txt size={12} weight="bold" upper tracking={0.04} color={on ? 'paper' : 'ink'}>{KIND_LABELS[kind]}</Txt>
          </Pressable>;
        })}
      </View>
    </View>}

    <View style={styles.qualifying}>
      <Pressable onPress={() => setQualifying((open) => !open)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} accessibilityRole="button" accessibilityState={{ expanded: qualifying }}>
        <Txt size={14} weight="semibold">Qualifying rules <Txt size={14} color="ink3">· optional</Txt></Txt>
        <View style={{ transform: [{ rotate: qualifying ? '180deg' : '0deg' }] }}><ChevronDownIcon size={16} color={colors.ink3} /></View>
      </Pressable>
      {qualifying && <View style={{ gap: 16, marginTop: 16 }}>
        <TextField label={`Shortest ${activity.sessions.replace(/s$/, '')} (${distanceUnit})`} optional keyboardType="decimal-pad" value={draft.minActivityDistance} onChangeText={(minActivityDistance) => set({ minActivityDistance })} />
        <TextField label="Shortest time (min)" optional keyboardType="number-pad" value={draft.minActivityMinutes} onChangeText={(minActivityMinutes) => set({ minActivityMinutes })} />
        <TextField label={`Minimum ${activity.sessions}`} optional={draft.scoringMethod !== 'PACE_CONSISTENCY'} keyboardType="number-pad" value={draft.minSessions} onChangeText={(minSessions) => set({ minSessions })} />
        <Txt size={12} color="ink3">Shorter activities don’t count at all. Anyone under the minimum number ranks after everyone who reached it.</Txt>
      </View>}
    </View>
    {error ? <Hint error>{error}</Hint> : null}
  </View>;
}

const styles = StyleSheet.create({
  toggle: { height: 36, justifyContent: 'center', borderRadius: radius.base, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, paddingHorizontal: 12 },
  qualifying: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 12 },
});
