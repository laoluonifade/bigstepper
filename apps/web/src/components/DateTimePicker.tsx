import { CSSProperties, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './icons';
import { cx } from './ui';

/**
 * Date + time picker that replaces `<input type="datetime-local">`, whose native UI differs on every
 * browser and is awkward on phones. Values use the same `YYYY-MM-DDTHH:mm` local-time format, so
 * `toLocalInput` / `fromLocalInput` keep working. Popover on wider screens, bottom sheet on phones.
 */

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);
const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 470;
const GUTTER = 8;
const DESKTOP_QUERY = '(min-width: 640px)';

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

function parse(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match.map(Number);
  return { year: y, month: m - 1, day: d, hour: hh, minute: mm, date: value.slice(0, 10) };
}

function label(value: string) {
  const parts = parse(value);
  if (!parts) return '';
  const date = new Date(parts.year, parts.month, parts.day, parts.hour, parts.minute);
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return `${day} · ${pad(parts.hour)}:${pad(parts.minute)}`;
}

function todayKey() {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

export function DateTimePicker({
  id,
  value,
  onChange,
  min,
  placeholder = 'Pick a date and time',
  clearable = false,
  defaultTime = '07:00',
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
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const selected = parse(value);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'date' | 'time'>('date');
  const [view, setView] = useState(() => {
    const base = selected ?? parse(min ?? '') ?? parse(`${todayKey()}T00:00`)!;
    return { year: base.year, month: base.month };
  });
  /** Fixed-position coordinates for the desktop popover; `null` means the phone bottom sheet. */
  const [anchor, setAnchor] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const minDate = min?.slice(0, 10);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  function openPicker() {
    const base = selected ?? parse(min ?? '') ?? parse(`${todayKey()}T00:00`)!;
    setView({ year: base.year, month: base.month });
    setTab('date');
    setAnchor(measure());
    setOpen(true);
  }

  /** Rendered in a portal (transformed ancestors break `position: fixed`), so place it from the trigger's rect. */
  function measure(): CSSProperties | null {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || !window.matchMedia(DESKTOP_QUERY).matches) return null;
    const below = window.innerHeight - rect.bottom;
    const up = below < PANEL_HEIGHT + GUTTER && rect.top > below;
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 16));
    return up ? { left, bottom: window.innerHeight - rect.top + GUTTER } : { left, top: rect.bottom + GUTTER };
  }

  // Outside click (popover) and Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) close(false);
    };
    const reposition = () => setAnchor(measure());
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [close, open]);

  // The bottom sheet is modal on phones: stop the page scrolling behind it.
  useEffect(() => {
    if (!open || anchor) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [anchor, open]);

  // Move focus into the panel: the chosen day, today, or the first enabled day.
  useLayoutEffect(() => {
    if (!open || tab !== 'date') return;
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLButtonElement>('[data-day][aria-pressed="true"]:not(:disabled)') ??
      panel?.querySelector<HTMLButtonElement>('[data-day][data-today]:not(:disabled)') ??
      panel?.querySelector<HTMLButtonElement>('[data-day][data-in-month]:not(:disabled)');
    target?.focus({ preventScroll: true });
  }, [open, tab, view]);

  const cells = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(view.year, view.month, 1 - offset + index);
      return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), inMonth: date.getMonth() === view.month };
    });
  }, [view]);

  const today = todayKey();
  const viewTitle = new Date(view.year, view.month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const canGoBack = !minDate || `${view.year}-${pad(view.month + 1)}` > minDate.slice(0, 7);

  function shiftMonth(delta: number) {
    setView(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function pickDay(key: string) {
    const time = selected ? `${pad(selected.hour)}:${pad(selected.minute)}` : defaultTime;
    let next = `${key}T${time}`;
    if (min && next < min) next = min;
    onChange(next);
    setTab('time');
  }

  function pickTime(hour: number, minute: number) {
    const date = selected?.date ?? (minDate && minDate > today ? minDate : today);
    onChange(`${date}T${pad(hour)}:${pad(minute)}`);
  }

  function timeDisabled(hour: number, minute: number) {
    const date = selected?.date;
    return Boolean(min && date && `${date}T${pad(hour)}:${pad(minute)}` < min);
  }

  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = (document.activeElement as HTMLElement | null)?.dataset.day;
    if (!current) return;
    const [y, m, d] = current.split('-').map(Number);
    const next = new Date(y, m - 1, d + step);
    const key = dateKey(next.getFullYear(), next.getMonth(), next.getDate());
    if (next.getMonth() !== view.month || next.getFullYear() !== view.year) {
      setView({ year: next.getFullYear(), month: next.getMonth() });
    }
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>(`[data-day="${key}"]`)?.focus());
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={cx('field num flex items-center justify-between gap-3 text-left', !value && 'text-ink-3')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : openPicker())}
        {...aria}
      >
        <span className="truncate">{value ? label(value) : placeholder}</span>
        <CalendarIcon size={18} className="shrink-0 text-ink-2" />
      </button>
      {clearable && value && !open && (
        <button
          type="button"
          className="absolute right-11 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-3 hover:bg-ink/[0.06] hover:text-ink"
          aria-label="Clear date"
          onClick={() => onChange('')}
        >
          <CloseIcon size={16} />
        </button>
      )}

      {open &&
        createPortal(
        <>
          {/* Phone backdrop. On wider screens the panel is a plain popover. */}
          {!anchor && <div className="fixed inset-0 z-50 bg-ink/40" aria-hidden="true" />}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal={!anchor}
            aria-label="Choose date and time"
            style={anchor ?? undefined}
            className={cx(
              'fixed z-50 bg-card',
              anchor
                ? 'w-[340px] rounded-md border-2 border-ink px-4 pb-4 pt-3 shadow-hard'
                : 'safe-bottom inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-xl border-t-2 border-ink px-4 pt-3',
            )}
          >
            {!anchor && <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden="true" />}

            <div className="mb-3 grid grid-cols-2 rounded border-[1.5px] border-ink p-0.5" role="tablist">
              {(['date', 'time'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cx(
                    'wide flex min-h-10 flex-col items-center justify-center rounded-sm text-[11px] font-bold uppercase tracking-[0.04em]',
                    tab === key ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  {key === 'date' ? 'Date' : 'Time'}
                  <span className={cx('num text-[12px] normal-case tracking-normal', tab === key ? 'text-volt' : 'text-ink-3')} style={{ fontStretch: '100%' }}>
                    {key === 'date'
                      ? selected
                        ? new Date(selected.year, selected.month, selected.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                        : '—'
                      : selected
                        ? `${pad(selected.hour)}:${pad(selected.minute)}`
                        : '—'}
                  </span>
                </button>
              ))}
            </div>

            {tab === 'date' ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    className="rounded p-2.5 hover:bg-ink/[0.06] disabled:opacity-30"
                    onClick={() => shiftMonth(-1)}
                    disabled={!canGoBack}
                    aria-label="Previous month"
                  >
                    <ChevronLeftIcon size={18} />
                  </button>
                  <p className="wide text-[14px] font-extrabold uppercase" aria-live="polite">
                    {viewTitle}
                  </p>
                  <button type="button" className="rounded p-2.5 hover:bg-ink/[0.06]" onClick={() => shiftMonth(1)} aria-label="Next month">
                    <ChevronRightIcon size={18} />
                  </button>
                </div>
                <div className="grid grid-cols-7 text-center" aria-hidden="true">
                  {WEEKDAYS.map((day) => (
                    <span key={day} className="eyebrow py-1 text-[10px] text-ink-3">
                      {day}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKey}>
                  {cells.map((cell) => {
                    const key = dateKey(cell.year, cell.month, cell.day);
                    const isSelected = selected?.date === key;
                    const disabled = Boolean(minDate && key < minDate);
                    return (
                      <button
                        key={key}
                        type="button"
                        data-day={key}
                        data-in-month={cell.inMonth || undefined}
                        data-today={key === today || undefined}
                        aria-pressed={isSelected}
                        aria-label={new Date(cell.year, cell.month, cell.day).toLocaleDateString('en-GB', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                        tabIndex={isSelected || (!selected && key === today) ? 0 : -1}
                        disabled={disabled}
                        onClick={() => {
                          if (!cell.inMonth) setView({ year: cell.year, month: cell.month });
                          pickDay(key);
                        }}
                        className={cx(
                          'num flex h-11 items-center justify-center rounded text-[14px] font-semibold disabled:pointer-events-none disabled:opacity-25 sm:h-10',
                          isSelected
                            ? 'bg-ink text-volt'
                            : cx('hover:bg-ink/[0.07]', key === today && 'ring-[1.5px] ring-inset ring-ink', !cell.inMonth && 'text-ink-3'),
                        )}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="eyebrow mb-2 text-ink-3">Hour</p>
                  <div className="grid grid-cols-6 gap-1">
                    {HOURS.map((hour) => {
                      const minute = selected?.minute ?? 0;
                      return (
                        <TimeChip
                          key={hour}
                          active={selected?.hour === hour}
                          disabled={timeDisabled(hour, 55)}
                          onClick={() => pickTime(hour, timeDisabled(hour, minute) ? MINUTES.find((m) => !timeDisabled(hour, m)) ?? minute : minute)}
                        >
                          {pad(hour)}
                        </TimeChip>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="eyebrow mb-2 text-ink-3">Minute</p>
                  <div className="grid grid-cols-6 gap-1">
                    {MINUTES.map((minute) => (
                      <TimeChip
                        key={minute}
                        active={selected?.minute === minute}
                        disabled={timeDisabled(selected?.hour ?? 0, minute)}
                        onClick={() => pickTime(selected?.hour ?? Number(defaultTime.slice(0, 2)), minute)}
                      >
                        {`:${pad(minute)}`}
                      </TimeChip>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {clearable && (
                <button
                  type="button"
                  className="btn-quiet flex-1"
                  onClick={() => {
                    onChange('');
                    close();
                  }}
                >
                  Clear
                </button>
              )}
              <button type="button" className="btn-dark flex-1" onClick={() => close()}>
                Done
              </button>
            </div>
          </div>
        </>,
          document.body,
        )}
    </div>
  );
}

function TimeChip({ active, disabled, onClick, children }: { active: boolean; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'num flex h-11 items-center justify-center rounded border-[1.5px] text-[14px] font-semibold disabled:pointer-events-none disabled:opacity-25 sm:h-9',
        active ? 'border-ink bg-ink text-volt' : 'border-line bg-white hover:border-ink',
      )}
    >
      {children}
    </button>
  );
}
