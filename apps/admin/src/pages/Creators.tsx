import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLink } from '../router';
import { appUrl } from '../api';
import { useState } from 'react';
import { CheckIcon, ShieldIcon } from '../icons';
import { Avatar, cx, EmptyState, ErrorNotice, PageHeader, Segmented, Skeleton } from '../ui';
import { api, patch } from '../api';
import { formatDate, formatRelative } from '@jump/shared/format';

interface CreatorApplication {
  id: string;
  userId: string;
  displayName: string;
  creatorType: 'influencer' | 'community_manager' | 'run_club' | 'other';
  socialUrl: string | null;
  bio: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  reviewedAt: string | null;
  email: string;
  emailVerified: boolean;
  username: string | null;
  avatarUrl: string | null;
  reviewedBy: string | null;
  paidChallenges: number;
}

type View = 'pending' | 'active' | 'suspended';

const TYPE_LABEL: Record<CreatorApplication['creatorType'], string> = {
  influencer: 'Influencer',
  community_manager: 'Community manager',
  run_club: 'Run club',
  other: 'Other',
};

/** Creators apply from You → Creator; only the ones approved here can host paid challenges. */
export function AdminCreatorsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('pending');
  const creators = useQuery({
    queryKey: ['admin-creators', view],
    queryFn: () => api<CreatorApplication[]>(`/admin/creators?view=${view}`),
    refetchInterval: view === 'pending' ? 30_000 : false,
  });
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) => patch(`/admin/creators/${id}`, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-creators'] }),
  });
  const list = creators.data ?? [];

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Staff"
        title="Creator approvals"
        description="People apply to become creators from their You page. Only creators you approve can host paid competitions. Runners never need approval."
      />
      <div className="mb-5">
        <Segmented<View>
          label="Creators"
          value={view}
          onChange={setView}
          options={[
            { value: 'pending', label: 'Waiting for you' },
            { value: 'active', label: 'Approved' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
      </div>

      <ErrorNotice error={creators.error ?? review.error} onRetry={() => void creators.refetch()} className="mb-4" />
      {creators.isLoading ? (
        <Skeleton className="h-48" />
      ) : list.length === 0 ? (
        <EmptyState mark={<ShieldIcon size={40} className="mx-auto" />} title={view === 'pending' ? 'No applications waiting' : view === 'active' ? 'No approved creators yet' : 'No suspended creators'}>
          {view === 'pending' ? 'New creator applications show up here.' : null}
        </EmptyState>
      ) : (
        <ul className="stagger space-y-3">
          {list.map((creator) => {
            const busy = review.isPending && review.variables?.id === creator.id;
            return (
              <li key={creator.id} className={cx('rounded-md border-[1.5px] bg-card', creator.status === 'PENDING' ? 'border-ink shadow-hard-sm' : 'border-line')}>
                <div className="flex flex-wrap items-start gap-4 p-4">
                  <Avatar name={creator.displayName} src={creator.avatarUrl} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-bold">
                      {creator.displayName}
                      <span className="tag ml-2 h-5 border-ink bg-paper px-1.5 align-middle text-[9.5px]">{TYPE_LABEL[creator.creatorType]}</span>
                    </p>
                    <p className="truncate text-[12px] text-ink-2">
                      {creator.username && (
                        <AppLink href={appUrl(`/runners/${creator.username}`)} className="font-semibold text-ink hover:underline hover:underline-offset-4">
                          @{creator.username}
                        </AppLink>
                      )}
                      {creator.username && ' · '}
                      {creator.email} · {creator.emailVerified ? 'email verified' : 'email not verified'}
                    </p>
                    {creator.socialUrl && (
                      <a href={creator.socialUrl} target="_blank" rel="noreferrer noopener" className="mt-1 block truncate text-[13px] font-semibold underline underline-offset-4">
                        {creator.socialUrl.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    {creator.bio && <p className="mt-2 text-[14px] leading-relaxed">{creator.bio}</p>}
                    <p className="mt-2 text-[12px] text-ink-3">
                      Applied {formatRelative(creator.createdAt)}
                      {creator.paidChallenges > 0 && ` · ${creator.paidChallenges} paid ${creator.paidChallenges === 1 ? 'competition' : 'competitions'}`}
                      {creator.reviewedAt && ` · ${creator.status === 'SUSPENDED' ? 'suspended' : 'approved'}${creator.reviewedBy ? ` by ${creator.reviewedBy}` : ''} on ${formatDate(creator.reviewedAt, { year: 'numeric' })}`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                  {creator.status !== 'ACTIVE' && (
                    <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => review.mutate({ id: creator.id, status: 'ACTIVE' })}>
                      <CheckIcon size={15} /> {busy ? 'Saving…' : creator.status === 'SUSPENDED' ? 'Reinstate' : 'Approve'}
                    </button>
                  )}
                  {creator.status !== 'SUSPENDED' && (
                    <button type="button" className={creator.status === 'PENDING' ? 'btn-quiet btn-sm' : 'btn-danger btn-sm'} disabled={busy} onClick={() => review.mutate({ id: creator.id, status: 'SUSPENDED' })}>
                      {creator.status === 'PENDING' ? 'Decline' : 'Suspend'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
