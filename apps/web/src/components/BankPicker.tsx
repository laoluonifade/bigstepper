import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckIcon } from './icons';
import { cx } from './ui';

export interface Bank {
  code: string;
  name: string;
}

/** Type-to-search bank picker (Paystack lists ~290 Nigerian banks — too many for a plain dropdown). */
export function BankPicker({
  id,
  banks,
  value,
  onChange,
  loading,
  ...aria
}: {
  id?: string;
  banks: Bank[];
  value: string;
  onChange: (code: string) => void;
  loading?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const selected = banks.find((bank) => bank.code === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banks;
    // Starts-with matches first ("gt" → GTBank before "Agribank Gtd…").
    const starts = banks.filter((bank) => bank.name.toLowerCase().startsWith(q));
    const contains = banks.filter((bank) => !bank.name.toLowerCase().startsWith(q) && bank.name.toLowerCase().includes(q));
    return [...starts, ...contains];
  }, [banks, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(bank: Bank) {
    onChange(bank.code);
    setQuery('');
    setOpen(false);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(matches.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' && open && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        className="field"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={loading ? 'Loading banks…' : selected ? selected.name : 'Search for your bank'}
        disabled={loading}
        value={open ? query : selected?.name ?? query}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActive(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKey}
        {...aria}
      />
      {open && !loading && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-1 max-h-72 animate-rise overflow-y-auto rounded-md border-[1.5px] border-ink bg-card py-1 shadow-hard"
        >
          {matches.length === 0 ? (
            <li className="px-3.5 py-3 text-[14px] text-ink-2">No bank matches “{query}”.</li>
          ) : (
            matches.map((bank, index) => (
              <li
                key={bank.code}
                data-index={index}
                role="option"
                aria-selected={bank.code === value}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(bank)}
                onMouseEnter={() => setActive(index)}
                className={cx(
                  'flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-[14px]',
                  index === active && 'bg-ink/[0.06]',
                  bank.code === value && 'font-semibold',
                )}
              >
                {bank.name}
                {bank.code === value && <CheckIcon size={16} className="shrink-0" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
