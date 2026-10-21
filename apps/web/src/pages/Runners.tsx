import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, SearchIcon } from '../components/icons';
import { Avatar, ErrorNotice, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import type { RunnerSearchResult } from '../lib/types';

export function RunnersPage() {
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(text.trim().replace(/^@/, '')), 180);
    return () => window.clearTimeout(timer);
  }, [text]);
  const runners = useQuery({
    queryKey: ['runner-search', term],
    queryFn: () => api<RunnerSearchResult[]>(`/users/search?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
  });

  return <div className="mx-auto max-w-[680px] min-h-[calc(100dvh-8rem)] bg-paper">
    <div className="sticky top-14 z-20 flex items-center gap-2 border-b border-line bg-paper px-3 py-3 sm:px-4 md:top-0 md:rounded-t-2xl">
      <Link to="/feed" className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full hover:bg-card" aria-label="Back to Rant"><ArrowLeftIcon size={21} /></Link>
      <div className="relative min-w-0 flex-1 rounded-xl bg-white">
        <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input ref={input} type="search" enterKeyHint="search" aria-label="Search runners" autoComplete="off" className="h-11 w-full rounded-xl border-0 bg-transparent pl-10 pr-4 text-[16px] text-ink outline-none placeholder:text-ink-3 focus-visible:!outline-none" value={text} onChange={(event) => setText(event.target.value)} placeholder="Name or @username" />
      </div>
    </div>
    <div className="px-4 pb-8">
      <ErrorNotice error={runners.error} onRetry={() => void runners.refetch()} className="mt-4" />
      {term.length < 2 ? null : runners.isLoading ? <div className="space-y-3 py-4"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : !runners.data?.length ? <p className="py-12 text-center text-[14px] text-ink-3">No runners found.</p> : <ul className="divide-y divide-line">
        {runners.data.map((runner) => <li key={runner.username}><Link to="/runners/$username" params={{ username: runner.username }} search={{}} className="flex min-w-0 items-center gap-3 py-3.5 hover:bg-card" aria-label={`View ${runner.displayName}'s profile`}>
          <Avatar name={runner.displayName} src={runner.avatarUrl} size={44} className="rounded-full" />
          <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-bold">{runner.displayName}</span><span className="block truncate text-[13px] text-ink-2">@{runner.username}{runner.bio ? ` · ${runner.bio}` : ''}</span></span>
        </Link></li>)}
      </ul>}
    </div>
  </div>;
}
