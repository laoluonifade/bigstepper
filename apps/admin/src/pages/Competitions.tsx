import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLink } from '../router';
import { appUrl } from '../api';
import { useState } from 'react';
import { CheckIcon, ShieldIcon } from '../icons';
import { EmptyState, ErrorNotice, PageHeader, Segmented, Skeleton } from '../ui';
import { api, post } from '../api';
import { formatDateTime, formatMoney } from '@jump/shared/format';

interface PaidChallenge {
  id: string;
  code: string;
  title: string;
  status: string;
  hostName: string;
  hostUsername: string | null;
  entryFeeKobo: number;
  guaranteedPrizeKobo: number;
  prizeSplitBps: number[];
  startsAt: string;
  scoringClosesAt: string;
}

export function AdminChallengesPage() {
  const [view, setView] = useState<'pending' | 'approved'>('pending');
  const challenges = useQuery({
    queryKey: ['admin-paid-challenges', view],
    queryFn: () => api<PaidChallenge[]>(`/admin/tables/paid-drafts?view=${view}`),
    refetchInterval: view === 'pending' ? 30_000 : false,
  });

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Staff" title="Paid competitions" description="Review the rules and confirm the guaranteed prize is funded before opening paid entry." />
      <div className="mb-5"><Segmented label="Paid competitions" value={view} onChange={setView} options={[{ value: 'pending', label: 'Waiting for you' }, { value: 'approved', label: 'Approved' }]} /></div>
      <ErrorNotice error={challenges.error} onRetry={() => void challenges.refetch()} className="mb-4" />
      {challenges.isLoading ? <Skeleton className="h-48" /> : !challenges.data?.length ? (
        <EmptyState mark={<ShieldIcon size={40} className="mx-auto" />} title={view === 'pending' ? 'No competitions waiting' : 'No open paid competitions'}>
          {view === 'pending' ? 'New paid competitions appear here for review.' : null}
        </EmptyState>
      ) : <ul className="stagger space-y-3">{challenges.data.map((challenge) => <ChallengeReview key={challenge.id} challenge={challenge} />)}</ul>}
    </div>
  );
}

function ChallengeReview({ challenge }: { challenge: PaidChallenge }) {
  const client = useQueryClient();
  const [fundingConfirmed, setFundingConfirmed] = useState(false);
  const [rulesApproved, setRulesApproved] = useState(false);
  const approve = useMutation({
    mutationFn: () => post(`/admin/tables/${challenge.id}/approve-paid`, { fundingConfirmed, rulesApproved }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin-paid-challenges'] });
      void client.invalidateQueries({ queryKey: ['competition', challenge.code] });
      void client.invalidateQueries({ queryKey: ['competitions'] });
    },
  });

  return <li className="rounded-md border-[1.5px] border-ink bg-card p-4 shadow-hard-sm">
    <div className="flex flex-wrap justify-between gap-3">
      <div>
        <AppLink href={appUrl(`/competitions/${challenge.code}`)} className="text-[17px] font-bold hover:underline">{challenge.title}</AppLink>
        <p className="mt-1 text-[13px] text-ink-2">Hosted by {challenge.hostUsername ? `@${challenge.hostUsername}` : challenge.hostName}</p>
        <p className="mt-2 text-[13px]">Entry {formatMoney(challenge.entryFeeKobo)} · Guaranteed pot {formatMoney(challenge.guaranteedPrizeKobo)} · {challenge.prizeSplitBps.length} prize {challenge.prizeSplitBps.length === 1 ? 'place' : 'places'}</p>
        <p className="mt-1 text-[12px] text-ink-3">{formatDateTime(challenge.startsAt)} to {formatDateTime(challenge.scoringClosesAt)}</p>
      </div>
      <span className="tag h-fit border-ink bg-paper px-2 py-1 text-[10px]">{challenge.status === 'PENDING_APPROVAL' ? 'Needs approval' : 'Open'}</span>
    </div>
    {challenge.status === 'PENDING_APPROVAL' && <div className="mt-4 space-y-2 border-t border-line pt-3 text-[13px]">
      <label className="flex items-start gap-2"><input type="checkbox" checked={fundingConfirmed} onChange={(event) => setFundingConfirmed(event.target.checked)} />I verified the guaranteed prize is funded.</label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={rulesApproved} onChange={(event) => setRulesApproved(event.target.checked)} />I reviewed the scoring rules and dates.</label>
      <ErrorNotice error={approve.error} className="mt-2" />
      <button type="button" className="btn-primary btn-sm" disabled={!fundingConfirmed || !rulesApproved || approve.isPending} onClick={() => approve.mutate()}><CheckIcon size={15} />{approve.isPending ? 'Approving…' : 'Approve competition'}</button>
    </div>}
  </li>;
}
