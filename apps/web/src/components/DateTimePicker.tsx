import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, CloseIcon } from './icons';
import { Modal } from './Modal';
import { cx } from './ui';

/**
 * Date + time as two halves of one field. The date opens a month calendar with a few quick days; the
 * time opens hour / minute / am-pm wheels with a few quick times. Bottom sheet on phones, dialog on
 * desktop. Values use the `YYYY-MM-DDTHH:mm` local-time format, so `toLocalInput` / `fromLocalInput`
 * keep working.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const local = (date: Date) => `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const fromYmd = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dayLabel(date: string) {
  const day = fromYmd(date);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (day.toDateString() === today.toDateString()) return 'Today';
  if (day.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function timeLabel(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
}

/** Quick starts people actually pick, skipping any already in the past. */
function presets(min?: string) {
  const now = new Date();
  const soon = new Date(Math.ceil(now.getTime() / (5 * 60_000)) * 5 * 60_000);
  const at = (days: number, hour: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, 0);
  const saturday = (6 - now.getDay() + 7) % 7 || 7;
  return [
    { label: 'Now', value: local(soon) },
    { label: 'Tonight 6pm', value: local(at(0, 18)) },
    { label: 'Tomorrow 6am', value: local(at(1, 6)) },
    { label: 'Sat 7am', value: local(at(saturday, 7)) },
  ].filter((preset) => preset.value >= (min ?? local(now)).slice(0, 16));
}

export function DateTimePicker({
  id,
  value,
  onChange,
  min,
  placeholder = 'Pick a date',
  clearable = false,
  defaultTime = '07:00',
  quickPicks = false,
  ...aria
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable moment, in the same `YYYY-MM-DDTHH:mm` format. */
  min?: string;
  placeholder?: string;
  clearable?: boolean;
  /** Time used when a day is picked before any time is set. */
  defaultTime?: string;
  /** Show "Now / Tonight / Tomorrow / Sat" shortcuts under the field. */
  quickPicks?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [open, setOpen] = useState<'date' | 'time' | null>(null);
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);

  /** Never earlier than `min`: a past time on the minimum day snaps forward to it. */
  function commit(nextDate: string, nextTime: string) {
    if (!nextDate) return;
    const next = `${nextDate}T${nextTime || defaultTime}`;
    onChange(min && next < min.slice(0, 16) ? min.slice(0, 16) : next);
  }

  const half = 'flex min-w-0 items-center gap-2 px-3 py-3 text-left text-[16px] transition-colors hover:bg-ink/[0.025]';
  return <div>
    <div className={cx('field flex items-stretch overflow-hidden !p-0', aria['aria-invalid'] && 'border-bad')}>
      <button id={id} type="button" className={cx(half, 'flex-[1.4] border-r-[1.5px] border-line')} onClick={() => setOpen('date')} aria-describedby={aria['aria-describedby']} aria-invalid={aria['aria-invalid']} aria-haspopup="dialog">
        <CalendarIcon size={17} className="shrink-0 text-ink-3" />
        <span className={cx('min-w-0 flex-1 truncate', !date && 'text-ink-3')}>{date ? dayLabel(date) : placeholder}</span>
      </button>
      <button type="button" className={cx(half, 'flex-1 disabled:cursor-not-allowed')} onClick={() => setOpen('time')} disabled={!date} aria-haspopup="dialog" aria-label={time ? `Time, ${timeLabel(time)}` : 'Pick a time'}>
        <ClockIcon size={17} className="shrink-0 text-ink-3" />
        <span className={cx('min-w-0 flex-1 truncate', !time && 'text-ink-3')}>{time ? timeLabel(time) : 'Time'}</span>
      </button>
      {clearable && value && <button type="button" className="shrink-0 px-2 text-ink-3 hover:text-ink" onClick={() => onChange('')} aria-label="Clear"><CloseIcon size={15} /></button>}
    </div>
    {quickPicks && <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
      {presets(min).map((preset) => <button key={preset.label} type="button" onClick={() => onChange(preset.value)} className={cx('shrink-0 rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold transition-colors', value === preset.value ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-ink-2 hover:border-ink hover:text-ink')}>{preset.label}</button>)}
    </div>}

    {open === 'date' && <Modal title="Date" onClose={() => setOpen(null)}>
      <CalendarSheet value={date} min={min?.slice(0, 10)} onPick={(next) => { commit(next, time); setOpen(null); }} />
    </Modal>}
    {open === 'time' && <Modal title="Time" onClose={() => setOpen(null)}>
      <TimeSheet value={time || defaultTime} onDone={(next) => { commit(date, next); setOpen(null); }} />
    </Modal>}
  </div>;
}

/** Month grid with a row of quick days. Picking a day is the whole interaction. */
function CalendarSheet({ value, min, onPick }: { value: string; min?: string; onPick: (date: string) => void }) {
  const today = new Date();
  const start = value ? fromYmd(value) : min ? fromYmd(min) : today;
  const [view, setView] = useState({ year: start.getFullYear(), month: start.getMonth() });
  const first = new Date(view.year, view.month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const todayKey = ymd(today);
  const minMonth = min ? fromYmd(min) : null;
  const canGoBack = !minMonth || view.year > minMonth.getFullYear() || (view.year === minMonth.getFullYear() && view.month > minMonth.getMonth());
  const saturday = (6 - today.getDay() + 7) % 7 || 7;
  const monday = (8 - today.getDay()) % 7 || 7;
  const quick = [
    { label: 'Today', date: ymd(today) },
    { label: 'Tomorrow', date: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) },
    { label: 'Sat', date: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + saturday)) },
    { label: 'Next Mon', date: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + monday)) },
  ].filter((option) => !min || option.date >= min);

  function shift(by: number) {
    setView((current) => { const next = new Date(current.year, current.month + by, 1); return { year: next.getFullYear(), month: next.getMonth() }; });
  }

  return <div>
    <div className="grid grid-cols-4 gap-1.5">
      {quick.map((option) => <button key={option.label} type="button" onClick={() => onPick(option.date)} className={cx('h-9 rounded-lg border-[1.5px] text-[13px] font-semibold transition-colors', value === option.date ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink')}>{option.label}</button>)}
    </div>

    <div className="mt-4 flex items-center justify-between">
      <p className="text-[16px] font-bold tracking-tight">{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
      <div className="flex gap-1">
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-ink/[0.06] disabled:opacity-25" onClick={() => shift(-1)} disabled={!canGoBack} aria-label="Previous month"><ChevronLeftIcon size={18} /></button>
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-ink/[0.06]" onClick={() => shift(1)} aria-label="Next month"><ChevronRightIcon size={18} /></button>
      </div>
    </div>

    <div className="mt-2 grid grid-cols-7 text-center">
      {WEEKDAYS.map((day, index) => <span key={index} className="pb-1.5 text-[11px] font-semibold text-ink-3">{day}</span>)}
      {Array.from({ length: lead }, (_, index) => <span key={`lead-${index}`} />)}
      {Array.from({ length: days }, (_, index) => {
        const key = ymd(new Date(view.year, view.month, index + 1));
        const disabled = Boolean(min && key < min);
        const selected = key === value;
        return <div key={key} className="flex justify-center py-0.5">
          <button type="button" disabled={disabled} onClick={() => onPick(key)} aria-pressed={selected} aria-label={fromYmd(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            className={cx('num flex h-10 w-10 items-center justify-center rounded-full text-[15px] transition-colors',
              selected ? 'bg-ink font-bold text-paper' : key === todayKey ? 'border-[1.5px] border-ink font-semibold' : 'hover:bg-ink/[0.06]',
              disabled && 'pointer-events-none text-ink/20')}>
            {index + 1}
          </button>
        </div>;
      })}
    </div>
  </div>;
}

const ROW = 40;
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

/** A scroll wheel: items snap to the centre band; tapping one scrolls it there. */
function Wheel<T extends string | number>({ items, value, onChange, format, label }: { items: T[]; value: T; onChange: (value: T) => void; format: (value: T) => string; label: string }) {
  const list = useRef<HTMLDivElement | null>(null);
  const settle = useRef<number | null>(null);
  useLayoutEffect(() => {
    const index = items.indexOf(value);
    if (list.current && index >= 0) list.current.scrollTop = index * ROW;
    // Only on mount and when the value is set from outside (quick times); scrolling sets it from inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => () => { if (settle.current !== null) window.clearTimeout(settle.current); }, []);

  function onScroll() {
    if (settle.current !== null) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const index = Math.max(0, Math.min(items.length - 1, Math.round((list.current?.scrollTop ?? 0) / ROW)));
      if (items[index] !== value) onChange(items[index]);
    }, 90);
  }

  return <div
    ref={list}
    onScroll={onScroll}
    role="listbox"
    aria-label={label}
    className="no-scrollbar relative h-[200px] flex-1 snap-y snap-mandatory overflow-y-scroll overscroll-contain"
    style={{ paddingBlock: (200 - ROW) / 2, maskImage: 'linear-gradient(transparent, #000 35%, #000 65%, transparent)', WebkitMaskImage: 'linear-gradient(transparent, #000 35%, #000 65%, transparent)' }}
  >
    {items.map((item) => <button
      key={String(item)}
      type="button"
      role="option"
      aria-selected={item === value}
      onClick={(event) => event.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
      className={cx('num flex w-full snap-center items-center justify-center text-[22px] transition-colors', item === value ? 'font-bold text-ink' : 'text-ink-3')}
      style={{ height: ROW }}
    >{format(item)}</button>)}
  </div>;
}

/** Hour, minute and am/pm wheels, a few common times, and Done. */
function TimeSheet({ value, onDone }: { value: string; onDone: (time: string) => void }) {
  const [h, m] = value.split(':').map(Number);
  const [hour, setHour] = useState(h % 12 || 12);
  const [minute, setMinute] = useState(Math.round(m / 5) * 5 % 60);
  const [half, setHalf] = useState<'am' | 'pm'>(h < 12 ? 'am' : 'pm');
  const as24 = (hour % 12) + (half === 'pm' ? 12 : 0);
  const quick = [{ label: '6:00 am', h: 6 }, { label: '7:00 am', h: 7 }, { label: 'Noon', h: 12 }, { label: '6:00 pm', h: 18 }];

  return <div>
    <div className="grid grid-cols-4 gap-1.5">
      {quick.map((option) => <button key={option.label} type="button" onClick={() => onDone(`${pad(option.h)}:00`)} className="h-9 rounded-lg border-[1.5px] border-line text-[13px] font-semibold transition-colors hover:border-ink">{option.label}</button>)}
    </div>
    <div className="relative mt-4 flex items-stretch rounded-xl border-[1.5px] border-ink bg-paper px-2">
      {/* The selection band the wheels snap into. */}
      <div className="pointer-events-none absolute inset-x-2 top-1/2 h-10 -translate-y-1/2 rounded-lg border-[1.5px] border-ink bg-card" aria-hidden="true" />
      <div className="relative flex flex-1">
        <Wheel label="Hour" items={HOURS} value={hour} onChange={setHour} format={(value) => String(value)} />
        <span className="flex items-center text-[22px] font-bold" aria-hidden="true">:</span>
        <Wheel label="Minute" items={MINUTES} value={minute} onChange={setMinute} format={(value) => pad(value)} />
        <Wheel label="Morning or evening" items={['am', 'pm'] as Array<'am' | 'pm'>} value={half} onChange={setHalf} format={(value) => value} />
      </div>
    </div>
    <button type="button" className="btn-dark mt-4 w-full" onClick={() => onDone(`${pad(as24)}:${pad(minute)}`)}>Set {timeLabel(`${pad(as24)}:${pad(minute)}`)}</button>
  </div>;
}
