import {
  ACTIVITY_RULES,
  dailyMeasure,
  METRICS,
  scoringOption,
  type ActivityType,
  type ChallengeType,
  type ScoringMethod,
} from '@jump/shared/competition-rules';
import { draftFor, type ScoringDraft } from '@jump/shared/scoring-draft';
import type { Unit } from '../lib/types';
import { ChallengeMark } from './competition';
import { Dropdown } from './Dropdown';
import { cx, Field } from './ui';

export { draftFor, scoringPayload, type ScoringDraft } from '@jump/shared/scoring-draft';

const KIND_LABELS: Record<ActivityType, string> = { run: 'Runs', walk: 'Walks', cycle: 'Rides' };

/**
 * Activity and how to win as two dropdowns, then only the settings that way of winning needs. Ways that
 * can't carry cash are disabled when the competition has a prize.
 */
export function ScoringPicker({ draft, onChange, unit, prizes, error }: {
  draft: ScoringDraft;
  onChange: (next: ScoringDraft) => void;
  unit: Unit;
  prizes: boolean;
  error?: string | null;
}) {
  const activity = ACTIVITY_RULES[draft.challengeType];
  const metric = METRICS[draft.scoringMethod];
  const daily = dailyMeasure(draft.challengeType, draft.scoringMethod);
  const allowed = (method: ScoringMethod) => !prizes || (METRICS[method].prizes && draft.challengeType !== 'CYCLING');
  const set = (patch: Partial<ScoringDraft>) => onChange({ ...draft, ...patch });
  const distanceUnit = unit === 'km' ? 'km' : 'mi';

  return <div className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Activity">
        {(props) => <Dropdown
          id={props.id}
          value={draft.challengeType}
          options={(Object.keys(ACTIVITY_RULES) as ChallengeType[]).map((type) => ({
            value: type,
            label: ACTIVITY_RULES[type].label,
            hint: `${ACTIVITY_RULES[type].options.length} ways to win`,
            icon: <ChallengeMark type={type} code={type} size={24} />,
          }))}
          onChange={(next) => {
            const first = ACTIVITY_RULES[next].options.find((option) => allowed(option.method)) ?? ACTIVITY_RULES[next].options[0];
            onChange(draftFor(next, first.method));
          }}
        />}
      </Field>
      <Field label="How to win" hint={allowed(draft.scoringMethod) ? scoringOption(draft.challengeType, draft.scoringMethod)?.summary : undefined}>
        {(props) => <Dropdown
          id={props.id}
          value={draft.scoringMethod}
          options={activity.options.map((option) => ({
            value: option.method,
            label: option.label,
            hint: allowed(option.method) ? option.summary : 'Free competitions only for now',
            disabled: !allowed(option.method),
          }))}
          onChange={(method) => set(draftFor(draft.challengeType, method, draft))}
        />}
      </Field>
    </div>

    {(metric.target || daily) && <div className="grid gap-5 sm:grid-cols-2">
      {metric.target && <Field
        label={{ distance: metric.aggregate === 'fastest' ? `Race distance (${distanceUnit})` : metric.aggregate === 'firstTo' ? `Target distance (${distanceUnit})` : `Count ${activity.sessions} of at least (${distanceUnit})`, steps: 'Step target', time: 'Target time (hours)', sessions: `Number of ${activity.sessions}` }[metric.target]}
        hint={metric.aggregate === 'fastest' ? 'Each person’s fastest stretch of this distance, inside any one activity.' : metric.aggregate === 'firstTo' ? 'Added up across the competition. First to reach it wins.' : undefined}
      >
        {(props) => <input {...props} className="field num" type="number" inputMode="decimal" min="0" step={metric.target === 'distance' ? '0.1' : '1'} value={draft.target} onChange={(event) => set({ target: event.target.value })} required />}
      </Field>}
      {daily && <Field
        label={`${metric.daily === 'optional' ? 'Count a day from' : metric.aggregate === 'dailyVariation' ? 'Minimum daily average' : 'Daily target'} (${daily === 'distance' ? distanceUnit : daily === 'steps' ? 'steps' : 'minutes'})`}
        optional={metric.daily === 'optional'}
        hint={metric.daily === 'optional' ? `Leave empty and any day with a ${activity.sessions.replace(/s$/, '')} counts.` : metric.aggregate === 'streak' ? 'Every day in a row has to reach this.' : undefined}
      >
        {(props) => <input {...props} className="field num" type="number" inputMode="decimal" min="0" step={daily === 'distance' ? '0.1' : '1'} value={draft.daily} onChange={(event) => set({ daily: event.target.value })} required={metric.daily === 'required'} />}
      </Field>}
    </div>}

    {draft.challengeType === 'TIMED' && <fieldset>
      <legend className="label">What counts</legend>
      <div className="flex flex-wrap gap-2">
        {activity.kinds.map((kind) => {
          const on = draft.kinds.includes(kind);
          return <button key={kind} type="button" aria-pressed={on} className={cx('btn btn-sm border-[1.5px] border-ink', on ? 'bg-ink text-paper' : 'bg-card hover:bg-white')}
            onClick={() => set({ kinds: on ? draft.kinds.filter((value) => value !== kind) : [...draft.kinds, kind] })}>
            {KIND_LABELS[kind]}
          </button>;
        })}
      </div>
    </fieldset>}

    <details className="rounded-md border-[1.5px] border-line bg-card px-4 py-3">
      <summary className="cursor-pointer list-none text-[14px] font-semibold">
        Qualifying rules <span className="font-normal text-ink-3">· optional</span>
      </summary>
      <div className="mt-4 grid gap-5 sm:grid-cols-3">
        <Field label={`Shortest ${activity.sessions.replace(/s$/, '')} (${distanceUnit})`} optional>
          {(props) => <input {...props} className="field num" type="number" inputMode="decimal" min="0" step="0.1" value={draft.minActivityDistance} onChange={(event) => set({ minActivityDistance: event.target.value })} />}
        </Field>
        <Field label="Shortest time (min)" optional>
          {(props) => <input {...props} className="field num" type="number" inputMode="numeric" min="0" value={draft.minActivityMinutes} onChange={(event) => set({ minActivityMinutes: event.target.value })} />}
        </Field>
        <Field label={`Minimum ${activity.sessions}`} optional={draft.scoringMethod !== 'PACE_CONSISTENCY'}>
          {(props) => <input {...props} className="field num" type="number" inputMode="numeric" min="1" value={draft.minSessions} onChange={(event) => set({ minSessions: event.target.value })} />}
        </Field>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">Shorter activities don’t count at all. Anyone under the minimum number ranks after everyone who reached it.</p>
    </details>

    {error && <p className="hint font-semibold text-bad">{error}</p>}
  </div>;
}
