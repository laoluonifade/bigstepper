import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppLink, navigate, useLocation } from '../router';
import { SearchIcon } from '../icons';
import { Avatar, cx, EmptyState, ErrorNotice, PageHeader, Skeleton, VerifiedTick } from '../ui';
import { VerifyToggle } from '../VerifyToggle';
import { api, appUrl } from '../api';
import { flag } from '../countries';
import { formatRelative } from '@jump/shared/format';

export type PeopleView = 'all' | 'active-today' | 'moved-today' | 'new-today';

interface Person {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  email: string;
  emailVerified: boolean;
  role: string;
  createdAt: string;
  lastSeenAt: string | null;
  lastActivityAt: string | null;
  activities: number;
  strava: boolean;
  verified: boolean;
}

type Stats = { users: number; activeToday: number; movedToday: number; newToday: number };

const VIEWS: Array<{ value: PeopleView; label: string; count: keyof Stats }> = [
  { value: 'all', label: 'Everyone', count: 'users' },
  { value: 'active-today', label: 'Active today', count: 'activeToday' },
  { value: 'moved-today', label: 'Recorded today', count: 'movedToday' },
  { value: 'new-today', label: 'New today', count: 'newToday' },
];

const EMPTY: Record<PeopleView, string> = {
  all: 'Nobody matches that search.',
  'active-today': 'Nobody has opened Jump yet today.',
  'moved-today': 'Nobody has recorded an activity yet today.',
  'new-today': 'Nobody has joined yet today.',
};

/** Admins only: everyone on Jump, filtered the same way as the numbers on the admin card. */
export function AdminPeoplePage() {
  const { search } = useLocation();
  const view = (['active-today', 'moved-today', 'new-today'].includes(search.get('view') ?? '') ? search.get('view') : 'all') as PeopleView;
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  // Search as you type, a beat after the last key.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(term.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<Stats>('/admin/stats'), staleTime: 60_000 });
  const people = useInfiniteQuery({
    queryKey: ['admin', 'people', view, query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<{ total: number; people: Person[] }>(`/admin/people?${new URLSearchParams({ view, q: query, offset: String(pageParam) })}`),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.people.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const rows = people.data?.pages.flatMap((page) => page.people) ?? [];
  const total = people.data?.pages[0]?.total ?? 0;

  return <div className="mx-auto max-w-2xl">
    <PageHeader eyebrow="People" title="People on Jump" />

    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Who to show">
      {VIEWS.map((option) => {
        const selected = view === option.value;
        const count = stats.data?.[option.count];
        return <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={selected}
          onClick={() => navigate(option.value === 'all' ? '/people' : `/people?view=${option.value}`, { replace: true })}
          className={cx('flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors', selected ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink-2 hover:text-ink')}
        >
          {option.label}
          {count !== undefined && <span className={cx('num', selected ? 'text-paper/70' : 'text-ink-3')}>{count.toLocaleString('en-GB')}</span>}
        </button>;
      })}
    </div>

    <label className="mt-4 flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-card px-3">
      <SearchIcon size={16} className="shrink-0 text-ink-3" />
      <input className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" placeholder="Search name, username or email" value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Search people" />
    </label>

    <p className="num mt-4 text-[13px] text-ink-3">{people.isLoading ? 'Loading…' : `${total.toLocaleString('en-GB')} ${total === 1 ? 'person' : 'people'}`}</p>

    <ErrorNotice error={people.error} onRetry={() => void people.refetch()} className="mt-3" />
    {people.isLoading ? <Skeleton className="mt-3 h-64 rounded-2xl" />
      : !rows.length ? <EmptyState title="No one here">{query ? `Nobody matches “${query}”.` : EMPTY[view]}</EmptyState>
        : <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card">
          {rows.map((person) => <li key={person.id}><PersonRow person={person} /></li>)}
        </ul>}

    {people.hasNextPage && <button type="button" className="btn-quiet mt-3 w-full" disabled={people.isFetchingNextPage} onClick={() => void people.fetchNextPage()}>
      {people.isFetchingNextPage ? 'Loading…' : `Show more (${(total - rows.length).toLocaleString('en-GB')} left)`}
    </button>}
  </div>;
}

function PersonRow({ person }: { person: Person }) {
  const details = [
    person.lastSeenAt ? `Seen ${formatRelative(person.lastSeenAt)}` : 'Not seen yet',
    `joined ${formatRelative(person.createdAt)}`,
    `${person.activities} ${person.activities === 1 ? 'activity' : 'activities'}`,
  ];
  const body = <div className="flex items-center gap-3 px-4 py-3">
    <span className="relative shrink-0">
      <Avatar name={person.displayName} src={person.avatarUrl} size={40} className="rounded-full" />
      {person.countryCode && <span className="absolute -bottom-0.5 -right-1 text-[13px] leading-none">{flag(person.countryCode)}</span>}
    </span>
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight">
        {person.username ? <AppLink href={appUrl(`/runners/${person.username}`)} className="truncate hover:underline">{person.displayName}</AppLink> : <span className="truncate">{person.displayName}</span>}
        {person.verified && <VerifiedTick />}
        {person.username && <span className="truncate font-normal text-ink-3">@{person.username}</span>}
      </p>
      <p className="mt-0.5 truncate text-[12px] text-ink-2">{details.join(' · ')}</p>
      <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
        <span className="truncate">{person.email}</span>
        {!person.emailVerified && <span className="shrink-0 rounded bg-warn-wash px-1 text-[10px] font-bold uppercase text-warn">Unverified</span>}
        {person.strava && <span className="shrink-0 rounded bg-[#FC4C02]/10 px-1 text-[10px] font-bold uppercase text-[#FC4C02]">Strava</span>}
        {person.role !== 'runner' && <span className="shrink-0 rounded bg-ink px-1 text-[10px] font-bold uppercase text-paper">{person.role}</span>}
      </p>
    </div>
    <VerifyToggle kind="person" id={person.id} verified={person.verified} emailVerified={person.emailVerified} />
  </div>;
  return body;
}
