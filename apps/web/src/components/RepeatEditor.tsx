import { clockLabel, nth, repeatRule, WEEK_ORDER, WEEKDAYS, weekdayInMonth, weekOfMonth, type Schedule } from '../lib/club-events';
import { cx, Segmented } from './ui';

const UNITS = [{ value: 'daily', label: 'Day' }, { value: 'weekly', label: 'Week' }, { value: 'monthly', label: 'Month' }] as const;
type Unit = (typeof UNITS)[number]['value'];
const UNIT_WORD: Record<Unit, string> = { daily: 'day', weekly: 'week', monthly: 'month' };

/** The weekday a `YYYY-MM-DD` date falls on, 0 being Sunday. */
const weekdayOf = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

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
    const has = value.weekdays.includes(day);
    if (has && value.weekdays.length === 1) return;
    set({ weekdays: has ? value.weekdays.filter((item) => item !== day) : [...value.weekdays, day] });
  };
  const stepper = 'flex h-7 w-7 items-center justify-center rounded-full bg-ink/[0.06] text-[18px] font-bold leading-none disabled:opacity-35';

  return <div className="rounded-2xl border-[1.5px] border-line bg-card p-3.5">
    <label className="flex cursor-pointer items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">Repeats</span>
        <span className="block text-[12.5px] text-ink-3">{on ? 'Same time, on a schedule you set' : 'Just this once'}</span>
      </span>
      <input type="checkbox" className="h-5 w-5 accent-ink" checked={on} onChange={(e) => onChange(scheduleFor(e.target.checked ? 'weekly' : 'once', startsOn, value))} />
    </label>

    {on && <div className="mt-4 space-y-4">
      <div>
        <p className="label">Every</p>
        <div className="flex items-center gap-3">
          <div className="flex h-10 items-center gap-1.5 rounded-md border-[1.5px] border-ink px-1.5">
            <button type="button" className={stepper} disabled={every <= 1} aria-label="Fewer" onClick={() => set({ repeatEvery: Math.max(1, every - 1) })}>−</button>
            <span className="score num min-w-7 text-center text-[22px]">{every}</span>
            <button type="button" className={stepper} disabled={every >= 12} aria-label="More" onClick={() => set({ repeatEvery: Math.min(12, every + 1) })}>+</button>
          </div>
          <span className="text-[15px] font-bold">{UNIT_WORD[unit]}{every > 1 ? 's' : ''}</span>
        </div>
        <div className="mt-2.5">
          <Segmented<Unit> label="Repeat unit" value={unit} onChange={(next) => onChange(scheduleFor(next, startsOn, value))} options={[...UNITS]} />
        </div>
      </div>

      {unit === 'weekly' && <div>
        <p className="label">On</p>
        <div className="flex justify-between gap-1.5">
          {WEEK_ORDER.map((day) => {
            const picked = value.weekdays.includes(day);
            return <button key={day} type="button" role="checkbox" aria-checked={picked} aria-label={WEEKDAYS[day]} onClick={() => toggleDay(day)}
              className={cx('flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-bold transition-colors', picked ? 'border-2 border-ink bg-volt text-ink' : 'border-[1.5px] border-line hover:border-ink')}>
              {WEEKDAYS[day].slice(0, 1)}
            </button>;
          })}
        </div>
      </div>}

      {unit === 'monthly' && <div>
        <p className="label">On</p>
        <Segmented<'date' | 'weekday'> label="Monthly on" value={value.monthMode ?? 'date'}
          onChange={(mode) => set({ monthMode: mode, monthWeek: mode === 'weekday' ? weekOfMonth(startsOn) : null })}
          options={[{ value: 'date', label: `The ${nth(Number(startsOn.split('-')[2]))}` }, { value: 'weekday', label: `The ${weekdayInMonth(startsOn)}` }]} />
      </div>}

      <div>
        <p className="label">Ends</p>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<'never' | 'date'> label="Ends" value={value.endsOn ? 'date' : 'never'}
            onChange={(mode) => set({ endsOn: mode === 'never' ? null : value.endsOn ?? addDays(startsOn, 56) })}
            options={[{ value: 'never', label: 'Never' }, { value: 'date', label: 'On a date' }]} />
          {value.endsOn && <input type="date" className="field w-auto" aria-label="Last date" min={startsOn} value={value.endsOn} onChange={(e) => e.target.value && set({ endsOn: e.target.value })} />}
        </div>
      </div>
    </div>}

    <div className="mt-3.5 rounded-lg bg-volt/35 px-3 py-2.5">
      <p className="wide text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-2">{on ? 'Your schedule' : 'One-off'}</p>
      <p className="mt-0.5 text-[14px] font-bold">{repeatRule({ ...value, startsOn })} at {clockLabel(startTime)}</p>
    </div>
  </div>;
}
