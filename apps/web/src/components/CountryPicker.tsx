import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES, countryName, dialCode, flag } from '../lib/countries';
import { CheckIcon, ChevronDownIcon, SearchIcon } from './icons';
import { cx } from './ui';

/** Countries most Jump runners pick, shown first. */
const PINNED = ['NG', 'GH', 'KE', 'ZA', 'GB', 'US'];

/** Searchable country list with flags, used by the picker and the phone field's dial-code button. */
function CountryList({ value, onPick, showDial }: { value: string; onPick: (code: string) => void; showDial?: boolean }) {
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement | null>(null);
  const options = useMemo(() => {
    const query = term.trim().toLowerCase().replace(/^\+/, '');
    if (!query) {
      const pinned = PINNED.map((code) => [code, countryName(code)] as [string, string]);
      return [...pinned, ...COUNTRIES.filter(([code]) => !PINNED.includes(code))];
    }
    return COUNTRIES.filter(([code, name]) => name.toLowerCase().includes(query) || code.toLowerCase() === query || dialCode(code).startsWith(query));
  }, [term]);
  useEffect(() => setActive(0), [term]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter' && options[active]) {
      event.preventDefault();
      onPick(options[active][0]);
    }
  }

  return <div>
    <label className="flex items-center gap-2 border-b-[1.5px] border-ink px-3">
      <SearchIcon size={16} className="text-ink-3" />
      <input autoFocus className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" placeholder={showDial ? 'Search country or code' : 'Search countries'} value={term} onChange={(event) => setTerm(event.target.value)} onKeyDown={keyDown} aria-label="Search countries" />
    </label>
    <ul ref={list} role="listbox" className="max-h-64 overflow-y-auto overscroll-contain py-1">
      {options.map(([code, name], index) => <li key={code} role="option" aria-selected={code === value} data-index={index}>
        <button type="button" className={cx('flex w-full items-center gap-3 px-3 py-2 text-left text-[15px]', index === active ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.04]', !term && index === PINNED.length - 1 && 'border-b border-line')} onMouseEnter={() => setActive(index)} onClick={() => onPick(code)}>
          <span className="text-[20px] leading-none">{flag(code)}</span>
          <span className="min-w-0 flex-1 truncate">{name}</span>
          {showDial && <span className="num shrink-0 text-[13px] text-ink-3">+{dialCode(code)}</span>}
          {code === value && <CheckIcon size={15} className="shrink-0 text-track" />}
        </button>
      </li>)}
      {!options.length && <li className="px-3 py-6 text-center text-[13px] text-ink-3">No country matches “{term}”.</li>}
    </ul>
  </div>;
}

/** Closes on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open, close]);
  return root;
}

const PANEL = 'absolute left-0 z-40 mt-1.5 w-full min-w-[280px] animate-pop overflow-hidden rounded-md border-[1.5px] border-ink bg-card shadow-hard';

/** A custom country dropdown with flags and search. Pass `name` to submit it with a form. */
export function CountryPicker({ value, onChange, name, id, required, placeholder = 'Choose your country' }: {
  value: string; onChange: (code: string) => void; name?: string; id?: string; required?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useDismiss(open, () => setOpen(false));
  return <div ref={root} className="relative">
    {name && <input type="hidden" name={name} value={value} />}
    {/* Keeps native "required" validation working for the hidden value. */}
    {required && <input tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0" value={value} required onChange={() => undefined} />}
    <button id={id} type="button" className="field flex items-center gap-2.5 text-left" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
      {value ? <><span className="text-[20px] leading-none">{flag(value)}</span><span className="min-w-0 flex-1 truncate">{countryName(value)}</span></> : <span className="flex-1 text-ink-3">{placeholder}</span>}
      <ChevronDownIcon size={16} className={cx('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
    </button>
    {open && <div className={PANEL}><CountryList value={value} onPick={(code) => { onChange(code); setOpen(false); }} /></div>}
  </div>;
}

function splitNumber(value: string, fallback: string) {
  if (!value.startsWith('+')) return { country: fallback, local: value };
  const digits = value.slice(1);
  const matches = COUNTRIES.map(([code]) => code).filter((code) => dialCode(code) && digits.startsWith(dialCode(code)));
  const best = matches.sort((a, b) => dialCode(b).length - dialCode(a).length || Number(b === fallback) - Number(a === fallback))[0];
  return best ? { country: best, local: digits.slice(dialCode(best).length) } : { country: fallback, local: digits };
}

/**
 * WhatsApp/phone number with a flag + dial-code button. Calls `onChange` with the full international
 * number ("+2348012345678"), or "" while empty. The dial code follows `defaultCountry` until picked.
 */
export function PhoneField({ value, onChange, defaultCountry, id, name, required }: {
  value: string; onChange: (e164: string) => void; defaultCountry?: string; id?: string; name?: string; required?: boolean;
}) {
  // A saved number keeps its own country: the longest matching dial code, preferring the default country.
  const [initial] = useState(() => splitNumber(value, defaultCountry || 'NG'));
  const [country, setCountry] = useState(initial.country);
  const [picked, setPicked] = useState(Boolean(value));
  const [local, setLocal] = useState(initial.local);
  const [open, setOpen] = useState(false);
  const root = useDismiss(open, () => setOpen(false));
  useEffect(() => { if (!picked && defaultCountry) setCountry(defaultCountry); }, [defaultCountry, picked]);

  const digits = local.replace(/\D/g, '').replace(/^0+/, ''); // "0803…" → "803…", the usual local-format habit
  const full = digits ? `+${dialCode(country)}${digits}` : '';
  useEffect(() => { if (full !== value) onChange(full); }, [full, value, onChange]);

  return <div ref={root} className="relative">
    {name && <input type="hidden" name={name} value={full} />}
    <div className="field flex items-stretch gap-0 !p-0 focus-within:border-ink">
      <button type="button" className="flex shrink-0 items-center gap-1.5 border-r-[1.5px] border-line px-3" onClick={() => setOpen((current) => !current)} aria-label={`Country code ${countryName(country)} +${dialCode(country)}`} aria-expanded={open}>
        <span className="text-[19px] leading-none">{flag(country)}</span>
        <span className="num text-[15px] font-semibold">+{dialCode(country)}</span>
        <ChevronDownIcon size={14} className="text-ink-3" />
      </button>
      <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" required={required} className="min-w-0 flex-1 bg-transparent px-3 text-[16px] outline-none placeholder:text-ink-3" placeholder="801 234 5678" value={local} onChange={(event) => setLocal(event.target.value.replace(/[^\d\s-]/g, ''))} />
    </div>
    {open && <div className={PANEL}><CountryList showDial value={country} onPick={(code) => { setCountry(code); setPicked(true); setOpen(false); }} /></div>}
  </div>;
}
