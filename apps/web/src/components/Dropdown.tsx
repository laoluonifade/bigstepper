import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon } from './icons';
import { cx } from './ui';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** A quieter line under the label. */
  hint?: string;
  /** Shown before the label, in the list and on the button. */
  icon?: ReactNode;
  /** Listed but not pickable; the hint says why. */
  disabled?: boolean;
}

/**
 * A custom select: the field shows the choice, the panel lists every option with its hint and scrolls on
 * its own, so a long list never pushes the page. Arrow keys, Enter and Escape work as in a native select.
 */
export function Dropdown<T extends string>({ id, value, options, onChange, label }: {
  id?: string;
  value: T;
  options: Array<DropdownOption<T>>;
  onChange: (value: T) => void;
  /** Accessible name when there's no visible <label for>. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
    // Only when it opens: the highlight starts on the current choice.
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(option: DropdownOption<T> | undefined) {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  }

  function move(step: number) {
    setActive((index) => {
      for (let next = index + step; next >= 0 && next < options.length; next += step) if (!options[next].disabled) return next;
      return index;
    });
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      else move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return <div ref={root} className="relative">
    <button
      id={id}
      type="button"
      className="field flex items-center gap-2.5 text-left"
      onClick={() => setOpen((current) => !current)}
      onKeyDown={keyDown}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={label}
    >
      {selected?.icon}
      <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
      <ChevronDownIcon size={16} className={cx('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
    </button>
    {open && <div className="absolute left-0 z-40 mt-1.5 w-full min-w-[260px] animate-pop overflow-hidden rounded-md border-[1.5px] border-ink bg-card shadow-hard">
      <ul ref={list} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto overscroll-contain py-1">
        {options.map((option, index) => {
          const chosen = option.value === value;
          return <li key={option.value} role="option" aria-selected={chosen} aria-disabled={option.disabled} data-index={index}>
            <button
              type="button"
              tabIndex={-1}
              disabled={option.disabled}
              className={cx(
                'flex w-full items-start gap-2.5 px-3 py-2 text-left',
                option.disabled ? 'cursor-not-allowed opacity-45' : index === active ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.04]',
              )}
              onMouseEnter={() => !option.disabled && setActive(index)}
              onClick={() => pick(option)}
            >
              {option.icon && <span className="mt-0.5 shrink-0">{option.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className={cx('block text-[14px] leading-snug', chosen ? 'font-bold' : 'font-semibold')}>{option.label}</span>
                {option.hint && <span className="block text-[12px] leading-snug text-ink-2">{option.hint}</span>}
              </span>
              {chosen && <CheckIcon size={15} className="mt-0.5 shrink-0 text-track" />}
            </button>
          </li>;
        })}
      </ul>
    </div>}
  </div>;
}
