import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Avatar, cx, EmptyState, ErrorNotice, PageHeader, Skeleton } from '../components/ui';
import { api, patch } from '../lib/api';
import { formatDate } from '../lib/format';

interface AdminUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  username: string | null;
  displayName: string | null;
  isCreator: boolean | null;
  adultVerified: boolean;
  paidCompetitionEligible: boolean;
  countryCode: string;
}

/** Staff approve runners for paid challenges and payouts. Active creators are approved automatically. */
export function AdminEligibilityPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const term = search.trim();
  const users = useQuery({
    queryKey: ['admin-users', term],
    queryFn: () => api<AdminUser[]>(`/admin/users${term ? `?search=${encodeURIComponent(term)}` : ''}`),
  });
  const update = useMutation({
    mutationFn: ({ user, approve }: { user: AdminUser; approve: boolean }) =>
      patch(`/admin/users/${user.id}/eligibility`, { adultVerified: approve, paidCompetitionEligible: approve, countryCode: user.countryCode || 'NG' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Staff"
        title="Paid eligibility"
        description="Approve runners to enter paid challenges and receive payouts. Active creators are approved automatically."
      />
      <input
        className="field mb-5"
        placeholder="Search email, @username or name"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        autoCapitalize="none"
        spellCheck={false}
      />
      <ErrorNotice error={users.error ?? update.error} onRetry={() => void users.refetch()} className="mb-4" />
      {users.isLoading ? (
        <Skeleton className="h-64" />
      ) : !users.data?.length ? (
        <EmptyState title="No one matches" />
      ) : (
        <ul className="stagger divide-y divide-line rounded-md border-[1.5px] border-ink bg-card">
          {users.data.map((user) => {
            const approved = user.adultVerified && user.paidCompetitionEligible;
            const busy = update.isPending && update.variables?.user.id === user.id;
            return (
              <li key={user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={user.displayName ?? user.email} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">
                    {user.displayName ?? user.email}
                    {user.isCreator && <span className="tag ml-2 border-ink bg-volt">Creator</span>}
                  </p>
                  <p className="truncate text-[12px] text-ink-2">
                    {user.username ? `@${user.username} · ` : ''}
                    {user.email} · {user.emailVerified ? 'email verified' : 'email not verified'} · joined {formatDate(user.createdAt)}
                  </p>
                </div>
                <span className={cx('tag', approved ? 'border-ok/60 bg-ok-wash text-ok' : 'border-line bg-paper text-ink-2')}>
                  {approved ? 'Approved' : 'Not approved'}
                </span>
                <button
                  type="button"
                  className={cx('btn btn-sm border-[1.5px] border-ink', approved ? 'bg-card' : 'bg-ink text-paper')}
                  disabled={busy}
                  onClick={() => update.mutate({ user, approve: !approved })}
                >
                  {busy ? 'Saving…' : approved ? 'Revoke' : 'Approve'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
