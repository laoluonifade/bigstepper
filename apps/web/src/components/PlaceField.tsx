import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Place } from '../lib/club-events';
import { getCurrentPosition } from '../lib/geo';
import { CloseIcon, PinIcon, SearchIcon } from './icons';

/**
 * Where something happens: search a park, street or landmark as you type, or drop the pin where you're
 * standing. Once picked, the spot can be named ("Main gate") and changed. Used by events and competitions.
 */
export function PlaceField({ label, optional, place, venue, onPlace, onVenue, hint, venuePlaceholder = 'e.g. Main gate, Muri Okunola Park' }: {
  label: string;
  optional?: boolean;
  place: Place | null;
  venue: string;
  onPlace: (place: Place | null) => void;
  onVenue: (venue: string) => void;
  hint: string;
  venuePlaceholder?: string;
}) {
  const [search, setSearch] = useState('');
  // Once a place is picked, the search and "I'm there now" step aside until Change is clicked.
  const [changing, setChanging] = useState(false);
  const [results, setResults] = useState<Place[] | null>(null);
  const [finding, setFinding] = useState<'search' | 'here' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Places load as you type: a short pause after the last key, and only the newest search counts.
  useEffect(() => {
    const query = search.trim();
    if (query.length < 3) { setResults(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setFinding('search'); setError(null);
      api<Place[]>(`/geo/search?q=${encodeURIComponent(query)}${place ? `&lat=${place.latitude}&lon=${place.longitude}` : ''}`, { signal: controller.signal })
        .then((found) => {
          setResults(found);
          if (!found.length) setError('Nothing found yet. Try the park, street or landmark name with the town.');
        })
        .catch(() => { if (!controller.signal.aborted) setError('Couldn’t search right now. Keep typing, or use where you are.'); })
        .finally(() => { if (!controller.signal.aborted) setFinding(null); });
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // The pin only biases results; moving it shouldn't search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function choose(next: Place) {
    setChanging(false);
    onPlace(next);
    if (next.name) onVenue(next.name);
    setResults(null);
    setSearch('');
  }

  async function pinHere() {
    setFinding('here'); setError(null);
    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      const named = await api<{ name: string | null }>(`/geo/place?lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`).catch(() => ({ name: null }));
      choose({ name: venue, address: named.name ?? '', latitude, longitude });
    } catch { setError('Couldn’t get your location. Allow location in the browser, or search instead.'); }
    finally { setFinding(null); }
  }

  return <div>
    <p className="label">{label}{optional && <span className="font-normal text-ink-3"> Optional</span>}</p>
    {place && <div className="mb-3 flex items-start gap-3 rounded-2xl border-2 border-ink bg-card p-3">
      <span className="mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-volt text-ink"><PinIcon size={18} /></span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <input className="field" aria-label={`${label} name`} maxLength={120} value={venue} onChange={(e) => onVenue(e.target.value)} placeholder={venuePlaceholder} />
        {place.address && <p className="text-[12.5px] text-ink-2">{place.address}</p>}
        {!changing && <div className="flex gap-4">
          <button type="button" className="text-[13px] font-bold underline underline-offset-2" onClick={() => setChanging(true)}>Change</button>
          {optional && <button type="button" className="text-[13px] font-semibold text-ink-3 hover:text-ink" onClick={() => { onPlace(null); onVenue(''); }}>Remove</button>}
        </div>}
      </div>
    </div>}
    {(!place || changing) && <>
      <div className="relative">
        <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input className="field pl-9 pr-10" aria-label={`Search for the ${label.toLowerCase()}`} autoComplete="off" value={search} onChange={(e) => { setSearch(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} autoFocus={changing} placeholder={place ? 'Search a different place' : 'Search a park, street or landmark'} />
        {finding === 'search'
          ? <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-ink-3 border-t-transparent" aria-label="Searching" />
          : search && <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink" aria-label="Clear search" onClick={() => setSearch('')}><CloseIcon size={14} /></button>}
      </div>
      {error && <p className="hint font-semibold text-bad">{error}</p>}
      {results && results.length > 0 && <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border-[1.5px] border-line bg-card">
        {results.map((result) => <li key={`${result.latitude},${result.longitude}`}>
          <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-ink/[0.04]" onClick={() => choose(result)}>
            <PinIcon size={16} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{result.name}</span><span className="block truncate text-[12px] text-ink-3">{result.address}</span></span>
          </button>
        </li>)}
      </ul>}
      <button type="button" className="btn-secondary btn-sm mt-3" disabled={finding === 'here'} onClick={() => void pinHere()}><PinIcon size={14} />{finding === 'here' ? 'Locating…' : 'I’m there now: use my location'}</button>
      {changing
        ? <button type="button" className="mt-2 block text-[13px] font-semibold text-ink-3 hover:text-ink" onClick={() => { setChanging(false); setSearch(''); }}>Keep {venue || 'this place'}</button>
        : <p className="hint">{hint}</p>}
    </>}
  </div>;
}
