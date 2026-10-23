import {
  ACTIVITY_RULES,
  dailyMeasure,
  METRICS,
  scoringOption,
  scoringProblem,
  type ActivityType,
  type ChallengeType,
  type ScoringMethod,
} from '@jump/shared/competition-rules';
import { toMetres } from '../lib/format';
import type { Unit } from '../lib/types';
import { ChallengeMark } from './competition';
import { Dropdown } from './Dropdown';
import { cx, Field } from './ui';

/** The scoring part of the create form, as typed: amounts are in the units shown next to each field. */
export interface ScoringDraft {
  challengeType: ChallengeType;
  scoringMethod: ScoringMethod;
  /** km/mi, steps, hours or sessions, depending on the method's target. */
  target: string;
  /** km/mi, steps or minutes, depending on the daily measure. */
  daily: string;
  minSessions: string;
  minActivityDistance: string;
  minActivityMinutes: string;
  /** Timed competitions only: which activities count. */
  kinds: ActivityType[];
}

const TARGET_DEFAULTS = { distance: '5', steps: '100000', time: '10', sessions: '10' } as const;
const DAILY_DEFAULTS = { distance: '3', steps: '8000', time: '30' } as const;

export function draftFor(challengeType: ChallengeType, scoringMethod: ScoringMethod, previous?: ScoringDraft): ScoringDraft {
  const metric = METRICS[scoringMethod];
  const daily = dailyMeasure(challengeType, scoringMethod);
  const sameTarget = previous && METRICS[previous.scoringMethod]?.target === metric.target;
  const sameDaily = previous && dailyMeasure(previous.challengeType, previous.scoringMethod) === daily;
  return {
    challengeType,
    scoringMethod,
    target: metric.target ? (sameTarget && previous.target ? previous.target : TARGET_DEFAULTS[metric.target]) : '',
    daily: daily && metric.daily === 'required' ? (sameDaily && previous.daily ? previous.daily : DAILY_DEFAULTS[daily]) : sameDaily ? previous?.daily ?? '' : '',
    minSessions: scoringMethod === 'PACE_CONSISTENCY' ? previous?.minSessions || '3' : previous?.minSessions ?? '',
    minActivityDistance: previous?.minActivityDistance ?? '',
    minActivityMinutes: previous?.minActivityMinutes ?? '',
    kinds: previous?.challengeType === challengeType ? previous.kinds : ACTIVITY_RULES[challengeType].kinds,
  };
}

const number = (value: string) => (value.trim() === '' ? undefined : Number(value));

/** The API fields for a draft, and the first thing wrong with it (same checks the API runs). */
export function scoringPayload(draft: ScoringDraft, unit: Unit, prizes: boolean) {
  const metric = METRICS[draft.scoringMethod];
  const daily = dailyMeasure(draft.challengeType, draft.scoringMethod);
  const target = number(draft.target);
  const dailyValue = number(draft.daily);
  const round = (value: number | undefined) => (value === undefined || Number.isNaN(value) ? undefined : Math.round(value));
  const payload = {
    challengeType: draft.challengeType,
    scoringMethod: draft.scoringMethod,
    targetDistanceMetres: metric.target === 'distance' ? round(target === undefined ? undefined : toMetres(target, unit)) : undefined,
    targetSteps: metric.target === 'steps' ? round(target) : undefined,
    targetSeconds: metric.target === 'time' ? round(target === undefined ? undefined : target * 3600) : undefined,
    targetSessions: metric.target === 'sessions' ? round(target) : undefined,
    dailyTarget: !daily || dailyValue === undefined ? undefined
      : round(daily === 'distance' ? toMetres(dailyValue, unit) : daily === 'time' ? dailyValue * 60 : dailyValue),
    minSessions: round(number(draft.minSessions)),
    minActivityMetres: round(number(draft.minActivityDistance) === undefined ? undefined : toMetres(Number(draft.minActivityDistance), unit)),
    minActivitySeconds: round(number(draft.minActivityMinutes) === undefined ? undefined : Number(draft.minActivityMinutes) * 60),
    eligibleActivities: draft.challengeType === 'TIMED' ? draft.kinds : undefined,
  };
  const problem = scoringProblem({ ...payload, prizes })
    ?? (payload.minActivityMetres !== undefined && (payload.minActivityMetres < 100 || payload.minActivityMetres > 100_000) ? 'Minimum activity distance is out of range' : null)
    ?? (payload.minActivitySeconds !== undefined && (payload.minActivitySeconds < 60 || payload.minActivitySeconds > 36_000) ? 'Minimum activity time must be 1 to 600 minutes' : null);
  // Leave out what isn't set so the API stores nothing for it.
  const fields = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  return { fields, problem };
}

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
