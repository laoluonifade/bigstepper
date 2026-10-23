import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, appUrl, patch, post } from '../api';
import { SearchIcon } from '../icons';
import { AppLink } from '../router';
import { cx, EmptyState, ErrorNotice, PageHeader, Skeleton, VerifiedTick } from '../ui';
import { VerifyToggle } from '../VerifyToggle';

interface AdminClub {
  id: string; slug: string; name: string; logoUrl: string | null; accentColor: string; location: string | null;
  privacy: 'open' | 'invite'; createdAt: string; verified: boolean; memberCount: number; ownerName: string; ownerEmail: string;
  followerCount: number; challengeCount: number; plan: 'free' | 'pro'; planRenewsAt: string | null; suspendedAt: string | null; suspendedReason: string | null;
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
    <PageHeader eyebrow="Clubs" title="Clubs" description="Run clubs and brands. A blue tick marks clubs Jump has checked. Suspend a club to stop it running challenges, or change its plan." />
    <ChallengeModeration />
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
            <p className="mt-0.5 truncate text-[12px] text-ink-2">{[`${club.followerCount} followers`, `${club.memberCount} members`, `${club.challengeCount} challenges`, club.location].filter(Boolean).join(' · ')}</p>
            <p className="mt-0.5 truncate text-[12px] text-ink-3">Owner: {club.ownerName} · {club.ownerEmail}</p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              <span className={cx('rounded px-1.5 text-[10px] font-bold uppercase', club.plan === 'pro' ? 'bg-ink text-paper' : 'bg-ink/[0.06] text-ink-2')}>{club.plan}</span>
              {club.suspendedAt && <span className="rounded bg-bad-wash px-1.5 text-[10px] font-bold uppercase text-bad">Suspended</span>}
            </p>
            <ClubModeration club={club} />
          </div>
          <VerifyToggle kind="club" id={club.id} verified={club.verified} />
        </li>)}
      </ul>}
    {clubs.hasNextPage && <button type="button" className="btn-quiet mt-3 w-full" disabled={clubs.isFetchingNextPage} onClick={() => void clubs.fetchNextPage()}>{clubs.isFetchingNextPage ? 'Loading…' : `Show more (${(total - rows.length).toLocaleString('en-GB')} left)`}</button>}
  </>;
}

/** Suspend or restore a club, and set its plan. Both are audited and the club's managers are told. */
function ClubModeration({ club }: { club: AdminClub }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch(`/admin/clubs/${club.id}`, body),
    onSuccess: () => { setReason(''); void queryClient.invalidateQueries({ queryKey: ['admin', 'clubs'] }); },
  });
  if (!open) return <button type="button" className="mt-1.5 text-[12px] font-semibold text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => setOpen(true)}>Moderate</button>;
  return <div className="mt-2 space-y-2 rounded-lg bg-ink/[0.04] p-3">
    {club.suspendedAt && <p className="text-[12px] text-bad">Suspended: {club.suspendedReason}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-semibold">Plan</span>
      {(['free', 'pro'] as const).map((plan) => <button key={plan} type="button" disabled={save.isPending} onClick={() => save.mutate({ plan, planRenewsAt: null })}
        className={cx('h-8 rounded-md border-[1.5px] px-3 text-[12px] font-bold uppercase', club.plan === plan ? 'border-ink bg-ink text-paper' : 'border-line bg-card')}>{plan}</button>)}
    </div>
    {club.suspendedAt
      ? <button type="button" className="btn-secondary btn-sm" disabled={save.isPending} onClick={() => save.mutate({ suspended: false })}>Lift suspension</button>
      : <div className="flex flex-wrap gap-2">
        <input className="field min-h-9 flex-1 text-[13px]" value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Why it's suspended (its managers see this)" />
        <button type="button" className="btn-danger btn-sm" disabled={save.isPending || reason.trim().length < 5} onClick={() => save.mutate({ suspended: true, reason: reason.trim() })}>Suspend</button>
      </div>}
    {save.error && <p className="text-[12px] font-semibold text-bad">{save.error.message}</p>}
    <button type="button" className="text-[12px] font-semibold text-ink-3" onClick={() => setOpen(false)}>Close</button>
  </div>;
}

/** Any challenge, by its code: take it down (with a reason the host sees) or promote it in discovery. */
function ChallengeModeration() {
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('7');
  const [done, setDone] = useState<string | null>(null);
  const find = async () => api<{ id: string; title: string }>(`/tables/${encodeURIComponent(code.trim().toUpperCase())}`);
  const takeDown = useMutation({
    mutationFn: async () => { const table = await find(); await post(`/admin/tables/${table.id}/take-down`, { reason: reason.trim() }); return table.title; },
    onSuccess: (title) => { setDone(`${title} was taken down.`); setReason(''); },
  });
  const promote = useMutation({
    mutationFn: async (on: boolean) => { const table = await find(); await post(`/admin/tables/${table.id}/promote`, { until: on ? new Date(Date.now() + Number(days) * 86_400_000).toISOString() : null }); return { title: table.title, on }; },
    onSuccess: ({ title, on }) => setDone(on ? `${title} is promoted for ${days} days.` : `${title} is no longer promoted.`),
  });
  const ready = /^[0-9A-F]{8}$/i.test(code.trim());
  return <details className="mb-5 rounded-xl border border-line bg-card p-4">
    <summary className="cursor-pointer text-[14px] font-bold">Moderate or promote a competition</summary>
    <div className="mt-3 space-y-3">
      <input className="field max-w-48 font-mono uppercase" value={code} maxLength={8} onChange={(event) => { setCode(event.target.value); setDone(null); }} placeholder="Code, e.g. 4F2A9C1B" />
      <div className="flex flex-wrap gap-2">
        <input className="field min-h-9 flex-1 text-[13px]" value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Why it breaks the rules (the host sees this)" />
        <button type="button" className="btn-danger btn-sm" disabled={!ready || reason.trim().length < 5 || takeDown.isPending} onClick={() => takeDown.mutate()}>Take down</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="field num min-h-9 w-20 text-[13px]" type="number" min={1} max={90} value={days} onChange={(event) => setDays(event.target.value)} aria-label="Days to promote" />
        <span className="text-[12px] text-ink-2">days</span>
        <button type="button" className="btn-secondary btn-sm" disabled={!ready || promote.isPending || Number(days) < 1} onClick={() => promote.mutate(true)}>Promote</button>
        <button type="button" className="btn-quiet btn-sm" disabled={!ready || promote.isPending} onClick={() => promote.mutate(false)}>Stop promoting</button>
      </div>
      {done && <p className="text-[13px] font-semibold text-ok">{done}</p>}
      {(takeDown.error ?? promote.error) && <p className="text-[13px] font-semibold text-bad">{(takeDown.error ?? promote.error)?.message}</p>}
      <p className="text-[12px] text-ink-3">Taking down cancels a free competition, hides it and voids prizes nobody has claimed yet. Cash competitions are handled through payouts instead.</p>
    </div>
  </details>;
}
