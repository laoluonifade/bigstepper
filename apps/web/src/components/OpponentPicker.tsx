import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { RunnerSearchResult } from '../lib/types';
import { CheckIcon, SearchIcon } from './icons';
import { Sheet } from './Sheet';
import { Avatar, cx, Skeleton, VerifiedTick } from './ui';

/** The one person a head-to-head is against: someone on Jump, or an email or phone to invite. */
export type Opponent =
  | { kind: 'runner'; username: string; displayName: string; avatarUrl: string | null }
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+[1-9]\d{7,14}$/;

export function opponentLabel(opponent: Opponent) {
  return opponent.kind === 'runner' ? `${opponent.displayName} (@${opponent.username})` : opponent.value;
}

/** Search Jump by name or @username, or type an email or phone number. Picking one closes the sheet. */
export function OpponentPicker({ open, onOpenChange, value, onChange }: { open: boolean; onOpenChange: (open: boolean) => void; value: Opponent | null; onChange: (opponent: Opponent | null) => void }) {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setQuery(term.trim().replace(/^@/, '')), 250); return () => window.clearTimeout(timer); }, [term]);
  const typed = term.trim();
  const phone = typed.replace(/[\s()-]/g, '');
  const asEmail = EMAIL.test(typed) ? typed.toLowerCase() : null;
  const asPhone = PHONE.test(phone) ? phone : null;
  const results = useQuery({
    queryKey: ['users', 'search', query],
    queryFn: () => api<RunnerSearchResult[]>(`/users/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2 && !asEmail && !asPhone,
    staleTime: 30_000,
  });
  const people = (results.data ?? []).filter((person) => !person.isMe);
  const pick = (opponent: Opponent) => { onChange(opponent); setTerm(''); onOpenChange(false); };

  return <Sheet open={open} onOpenChange={onOpenChange} title="Your opponent" description="Head-to-head is you and one other person."
    footer={value ? <button type="button" className="btn-secondary w-full" onClick={() => { onChange(null); onOpenChange(false); }}>Remove {value.kind === 'runner' ? value.displayName : 'invite'}</button> : undefined}>
    <label className="flex h-12 items-center gap-2.5 rounded-xl border-[1.5px] border-ink bg-white px-3.5">
      <SearchIcon size={17} className="shrink-0 text-ink-3" />
      <input className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3" value={term} onChange={(event) => setTerm(event.target.value)}
        placeholder="Name, @username, email or phone" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Find your opponent" />
    </label>
    <p className="mt-2 text-[12px] text-ink-3">Phone numbers need the country code, like +2348012345678.</p>

    <div className="mt-4 min-h-[260px]">
      {value && !typed && <div className="flex items-center gap-3 rounded-xl border-[1.5px] border-ink bg-volt/40 p-3">
        {value.kind === 'runner' ? <Avatar name={value.displayName} src={value.avatarUrl} size={40} className="rounded-full" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-[16px] text-paper">{value.kind === 'email' ? '@' : '#'}</span>}
        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-bold">{value.kind === 'runner' ? value.displayName : value.value}</span><span className="block text-[12px] text-ink-2">{value.kind === 'runner' ? `@${value.username} · invited when you create it` : 'Invite sent when you create it'}</span></span>
        <CheckIcon size={18} />
      </div>}

      {asEmail && <Choice title={`Invite ${asEmail}`} body="They get an email with the link. New to Jump? They sign up and land straight in it." onClick={() => pick({ kind: 'email', value: asEmail })} mark="@" />}
      {asPhone && <Choice title={`Invite ${asPhone}`} body="You’ll get a link to text them once it’s created." onClick={() => pick({ kind: 'phone', value: asPhone })} mark="#" />}

      {!asEmail && !asPhone && query.length >= 2 && (results.isLoading ? <div className="space-y-2">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-14 rounded-xl" />)}</div>
        : people.length ? <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {people.map((person) => <li key={person.username}>
            <button type="button" className={cx('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-ink/[0.03]', value?.kind === 'runner' && value.username === person.username && 'bg-volt/30')}
              onClick={() => pick({ kind: 'runner', username: person.username, displayName: person.displayName, avatarUrl: person.avatarUrl })}>
              <Avatar name={person.displayName} src={person.avatarUrl} avatarStyle={person.avatarStyle} size={40} className="rounded-full" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 truncate text-[15px] font-semibold">{person.displayName}{person.verified && <VerifiedTick />}</span>
                <span className="block truncate text-[12px] text-ink-3">@{person.username}</span>
              </span>
            </button>
          </li>)}
        </ul>
          : <p className="py-6 text-center text-[14px] text-ink-2">Nobody on Jump matches “{query}”. Type their email or phone number to invite them.</p>)}

      {!typed && !value && <p className="py-6 text-center text-[14px] text-ink-2">Search for a runner, or type an email or phone number.</p>}
    </div>
  </Sheet>;
}

function Choice({ title, body, onClick, mark }: { title: string; body: string; onClick: () => void; mark: string }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border-[1.5px] border-ink bg-card p-3 text-left hover:shadow-hard-sm">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-[16px] text-paper">{mark}</span>
    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-bold">{title}</span><span className="block text-[12px] leading-snug text-ink-2">{body}</span></span>
  </button>;
}
