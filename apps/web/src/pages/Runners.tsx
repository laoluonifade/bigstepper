import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FormEvent, useState } from 'react';
import { ArrowRightIcon } from '../components/icons';
import { FollowButton } from '../components/Profile';
import { Avatar, EmptyState, ErrorNotice, Field, PageHeader, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import type { RunnerSearchResult } from '../lib/types';

export function RunnersPage() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const searchTerm = text.trim().replace(/^@/, '');
  const runners = useQuery({
    queryKey: ['runner-search', query],
    queryFn: () => api<RunnerSearchResult[]>(`/users/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });

  function search(event: FormEvent) {
    event.preventDefault();
    setQuery(searchTerm);
  }

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Community" title="Find runners" description="Search by username or name, open a profile, and follow people you know." />
      <form onSubmit={search} className="mb-8 max-w-xl">
        <Field label="Runner name or @username">
          {(props) => <div className="flex gap-2"><input {...props} className="field" value={text} onChange={(event) => setText(event.target.value)} placeholder="Search runners" /><button className="btn-dark shrink-0" disabled={searchTerm.length < 2} aria-label="Search runners"><ArrowRightIcon size={18} /></button></div>}
        </Field>
      </form>
      <ErrorNotice error={runners.error} onRetry={() => void runners.refetch()} />
      {runners.isLoading ? <Skeleton className="h-36" /> : query.length < 2 ? (
        <EmptyState title="Find your people">Enter at least two letters to search.</EmptyState>
      ) : !runners.data?.length ? (
        <EmptyState title="No runners found">Try a different name or username.</EmptyState>
      ) : (
        <ul className="stagger divide-y divide-line border-y border-line">
          {runners.data.map((runner) => (
            <li key={runner.username} className="flex items-center gap-2 px-2 py-3">
              <Link to="/runners/$username" params={{ username: runner.username }} search={{}} className="flex min-w-0 flex-1 items-center gap-3 hover:underline hover:underline-offset-4" aria-label={`View ${runner.displayName}'s profile`}>
                <Avatar name={runner.displayName} src={runner.avatarUrl} size={42} />
                <span className="min-w-0 flex-1"><span className="block truncate font-bold">{runner.displayName}</span><span className="block truncate text-[12px] text-ink-2">@{runner.username}{runner.bio ? ` · ${runner.bio}` : ''}</span></span>
              </Link>
              {!runner.isMe && <FollowButton username={runner.username} following={runner.followedByMe} size="sm" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
