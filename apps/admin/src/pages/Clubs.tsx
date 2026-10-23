import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, appUrl } from '../api';
import { SearchIcon } from '../icons';
import { AppLink } from '../router';
import { cx, EmptyState, ErrorNotice, PageHeader, Skeleton, VerifiedTick } from '../ui';
import { VerifyToggle } from '../VerifyToggle';

interface AdminClub {
  id: string; slug: string; name: string; logoUrl: string | null; accentColor: string; location: string | null;
  privacy: 'open' | 'invite'; createdAt: string; verified: boolean; memberCount: number; ownerName: string; ownerEmail: string;
}

/** Every club, biggest first, with the blue tick to give or take away. */
export function ClubsPage() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [onlyVerified, setOnlyVerified] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(term.trim()), 250); return () => window.clearTimeout(timer); }, [term]);
  const clubs = useInfiniteQuery({
    queryKey: ['admin', 'clubs', query, onlyVerified],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<{ total: number; clubs: AdminClub[] }>(`/admin/clubs?${new URLSearchParams({ q: query, verified: String(onlyVerified), offset: String(pageParam) })}`),
    getNextPageParam: (last, pages) => { const loaded = pages.reduce((sum, page) => sum + page.clubs.length, 0); return loaded < last.total ? loaded : undefined; },
  });
  const rows = clubs.data?.pages.flatMap((page) => page.clubs) ?? [];
  const total = clubs.data?.pages[0]?.total ?? 0;
  return <>
    <PageHeader eyebrow="Clubs" title="Clubs" description="A blue tick marks clubs Jump has checked. Clubs without one work exactly the same." />
    <div className="flex flex-wrap gap-2">
      <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-card px-3">
        <SearchIcon size={16} className="shrink-0 text-ink-3" />
        <input className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" placeholder="Search clubs" value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Search clubs" />
      </label>
      <button type="button" aria-pressed={onlyVerified} onClick={() => setOnlyVerified((value) => !value)} className={cx('inline-flex h-11 items-center gap-1.5 rounded-xl border-[1.5px] px-3.5 text-[13px] font-bold', onlyVerified ? 'border-ink bg-ink text-paper' : 'border-ink bg-card')}>
        <VerifiedTick size={14} /> Verified only
      </button>
    </div>
    <p className="num mt-4 text-[13px] text-ink-3">{clubs.isLoading ? 'Loading…' : `${total.toLocaleString('en-GB')} ${total === 1 ? 'club' : 'clubs'}`}</p>
    <ErrorNotice error={clubs.error} onRetry={() => void clubs.refetch()} />
    {clubs.isLoading ? <Skeleton className="mt-3 h-64 rounded-2xl" /> : !rows.length ? <EmptyState title="No clubs here">{query ? `Nothing matches “${query}”.` : 'No clubs yet.'}</EmptyState>
      : <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card">
        {rows.map((club) => <li key={club.id} className="flex items-center gap-3 px-4 py-3">
          <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: club.accentColor }} aria-hidden="true" />
          {club.logoUrl ? <img src={club.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink/[0.07] text-[14px] font-extrabold">{club.name.charAt(0).toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight">
              <AppLink href={appUrl(`/clubs/${club.slug}`)} className="truncate hover:underline">{club.name}</AppLink>
              {club.verified && <VerifiedTick />}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-ink-2">{[`${club.memberCount} ${club.memberCount === 1 ? 'member' : 'members'}`, club.location, club.privacy === 'invite' ? 'Invite-only' : 'Open'].filter(Boolean).join(' · ')}</p>
            <p className="mt-0.5 truncate text-[12px] text-ink-3">Owner: {club.ownerName} · {club.ownerEmail}</p>
          </div>
          <VerifyToggle kind="club" id={club.id} verified={club.verified} />
        </li>)}
      </ul>}
    {clubs.hasNextPage && <button type="button" className="btn-quiet mt-3 w-full" disabled={clubs.isFetchingNextPage} onClick={() => void clubs.fetchNextPage()}>{clubs.isFetchingNextPage ? 'Loading…' : `Show more (${(total - rows.length).toLocaleString('en-GB')} left)`}</button>}
  </>;
}
