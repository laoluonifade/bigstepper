import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDateTime, formatDistance, formatDuration } from '@jump/shared/format';
import { api, patch, post } from '../api';
import { EmptyState, ErrorNotice, PageHeader, Skeleton } from '../ui';
import { toast } from '../toast';

interface Review {
  id: string;
  reason: string;
  createdAt: string;
  requestedBy: { displayName: string; email: string };
  activity: {
    activityType: 'walk' | 'run' | 'cycle'; source: string; startedAt: string; recordedDistanceMetres: number; validatedDistanceMetres: number;
    validatedSteps: number; movingSeconds: number; gpsConfidence: number; verificationReasons: string[];
  };
}

/** Activities the checks flagged, where the runner asked for a person to look. Approving credits them. */
export function ReviewsPage() {
  const reviews = useQuery({ queryKey: ['admin', 'reviews'], queryFn: () => api<Review[]>('/admin/verification/reviews') });
  return <>
    <PageHeader eyebrow="Activities" title="Activity reviews" description="Flagged walks, runs and rides whose owners asked for a review. Approving puts them on boards; rejecting keeps them off." />
    <FlaggedRuns />
    <RecheckFlagged />
    <ErrorNotice error={reviews.error} onRetry={() => void reviews.refetch()} />
    {reviews.isLoading ? <Skeleton className="h-48 rounded-2xl" /> : !reviews.data?.length ? <EmptyState title="Nothing to review">Every flagged activity has been decided.</EmptyState>
      : <ul className="space-y-3">{reviews.data.map((review) => <li key={review.id}><ReviewCard review={review} /></li>)}</ul>}
  </>;
}

/** After the checks improve: run recently flagged activities through them again. Ones that now pass are credited. */
function RecheckFlagged() {
  const queryClient = useQueryClient();
  const recheck = useMutation({
    mutationFn: () => post<{ queued: number }>('/admin/verification/recheck'),
    onSuccess({ queued }) {
      toast({ tone: 'ok', message: queued ? `Re-checking ${queued} flagged ${queued === 1 ? 'activity' : 'activities'}. Ones that pass are verified and credited.` : 'No flagged activities from the last 60 days.' });
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] }), 5000);
    },
  });
  return <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-4">
    <p className="min-w-0 flex-1 text-[14px] text-ink-2"><b className="text-ink">Re-check flagged activities.</b> Runs every flagged Jump recording from the last 60 days through the current checks. Ones that pass are verified, credited and their owners told; the rest stay flagged without another message.</p>
    <button type="button" className="btn-primary btn-sm" disabled={recheck.isPending} onClick={() => recheck.mutate()}>{recheck.isPending ? 'Queuing…' : 'Re-check flagged'}</button>
    <ErrorNotice error={recheck.error} />
  </div>;
}

function ReviewCard({ review }: { review: Review }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') => patch(`/admin/verification/reviews/${review.id}`, { decision, note: note.trim() }),
    async onSuccess(_, decision) {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      toast({ tone: 'ok', message: decision === 'APPROVED' ? 'Approved and credited.' : 'Rejected.' });
    },
  });
  const a = review.activity;
  return <article className="rounded-2xl border-[1.5px] border-ink bg-card p-4">
    <p className="text-[15px] font-bold">{review.requestedBy.displayName} <span className="font-normal text-ink-3">· {review.requestedBy.email}</span></p>
    <p className="mt-0.5 text-[13px] text-ink-2">
      {a.activityType} from {a.source} · {formatDateTime(a.startedAt)} · {formatDistance(a.validatedDistanceMetres)} verified of {formatDistance(a.recordedDistanceMetres)} recorded · {formatDuration(a.movingSeconds)} moving · {a.validatedSteps.toLocaleString('en-GB')} steps · GPS {Math.round(a.gpsConfidence * 100)}%
    </p>
    {a.verificationReasons.length > 0 && <p className="mt-2 flex flex-wrap gap-1.5">{a.verificationReasons.map((reason) => <span key={reason} className="rounded bg-warn-wash px-1.5 py-0.5 text-[11px] font-bold uppercase text-warn">{reason.replace(/_/g, ' ')}</span>)}</p>}
    <blockquote className="mt-3 rounded-lg bg-ink/[0.04] px-3 py-2 text-[14px]">“{review.reason}”</blockquote>
    <p className="mt-1 text-[12px] text-ink-3">Asked {formatDateTime(review.createdAt)}</p>
    <label className="mt-3 block">
      <span className="label">Note to the runner (5+ characters)</span>
      <input className="field" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="e.g. GPS dropped in the tunnel; the route checks out." />
    </label>
    <ErrorNotice error={decide.error} />
    <div className="mt-3 flex gap-2">
      <button type="button" className="btn-primary btn-sm" disabled={note.trim().length < 5 || decide.isPending} onClick={() => decide.mutate('APPROVED')}>Approve</button>
      <button type="button" className="btn-secondary btn-sm" disabled={note.trim().length < 5 || decide.isPending} onClick={() => decide.mutate('REJECTED')}>Reject</button>
    </div>
  </article>;
}

interface FlaggedRun {
  id: string; activityType: 'walk' | 'run' | 'cycle'; source: string; startedAt: string; verificationStatus: string; verificationReasons: string[];
  recordedDistanceMetres: number; validatedDistanceMetres: number; validatedSteps: number; movingSeconds: number; gpsConfidence: number;
  displayName: string; username: string | null; email: string; competitions: number; pointsMetres: number | null;
}

/**
 * Runs the checks had doubts about. Runners never see this: their run stays posted and counted. Clearing
 * keeps it as it is; rejecting takes it off every live board and the feed.
 */
function FlaggedRuns() {
  const flags = useQuery({ queryKey: ['admin', 'flags'], queryFn: () => api<FlaggedRun[]>('/admin/verification/flags') });
  if (flags.isLoading) return <Skeleton className="mb-6 h-32 rounded-2xl" />;
  return <section className="mb-8">
    <h2 className="text-[17px] font-extrabold">Runs with warnings</h2>
    <p className="mt-0.5 text-[13px] text-ink-2">From the last 30 days. Runners don’t see these warnings; their runs stay posted and counted unless you reject them.</p>
    <ErrorNotice error={flags.error} onRetry={() => void flags.refetch()} />
    {!flags.data?.length ? <p className="mt-3 rounded-xl bg-ink/[0.05] px-4 py-5 text-[14px] text-ink-2">No warnings. Every recent run looked normal.</p>
      : <ul className="mt-3 space-y-3">{flags.data.map((run) => <li key={run.id}><FlaggedCard run={run} /></li>)}</ul>}
  </section>;
}

function FlaggedCard({ run }: { run: FlaggedRun }) {
  const queryClient = useQueryClient();
  const settle = useMutation({
    mutationFn: (decision: 'CLEAR' | 'REJECT') => post(`/admin/verification/flags/${run.id}`, { decision }),
    async onSuccess(_, decision) {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] });
      toast({ tone: 'ok', message: decision === 'CLEAR' ? 'Cleared. The run stays as it is.' : 'Rejected and taken off the boards.' });
    },
  });
  return <article className="rounded-2xl border-[1.5px] border-ink bg-card p-4">
    <p className="text-[15px] font-bold">{run.displayName} <span className="font-normal text-ink-3">· {run.username ? `@${run.username}` : run.email}</span></p>
    <p className="mt-0.5 text-[13px] text-ink-2">
      {run.activityType} from {run.source} · {formatDateTime(run.startedAt)} · {formatDistance(run.recordedDistanceMetres)} on the phone{run.pointsMetres !== null ? `, ${formatDistance(run.pointsMetres)} from its GPS points` : ''} · {formatDuration(run.movingSeconds)} moving · {run.validatedSteps.toLocaleString('en-GB')} steps · GPS {Math.round(run.gpsConfidence * 100)}%
      {run.competitions ? ` · counts in ${run.competitions} ${run.competitions === 1 ? 'competition' : 'competitions'}` : ''}
    </p>
    <p className="mt-2 flex flex-wrap gap-1.5">{run.verificationReasons.map((reason) => <span key={reason} className="rounded bg-warn-wash px-1.5 py-0.5 text-[11px] font-bold uppercase text-warn">{reason.replace(/_/g, ' ')}</span>)}</p>
    <ErrorNotice error={settle.error} />
    <div className="mt-3 flex gap-2">
      <button type="button" className="btn-secondary btn-sm" disabled={settle.isPending} onClick={() => settle.mutate('CLEAR')}>Looks fine</button>
      <button type="button" className="btn-secondary btn-sm text-bad" disabled={settle.isPending} onClick={() => { if (window.confirm('Reject this run? It comes off every live leaderboard and the feed.')) settle.mutate('REJECT'); }}>Reject</button>
    </div>
  </article>;
}
