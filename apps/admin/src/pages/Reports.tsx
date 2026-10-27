import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDateTime } from '@jump/shared/format';
import { REPORT_REASONS } from '@jump/shared/safety';
import { api, post } from '../api';
import { EmptyState, ErrorNotice, PageHeader, Skeleton } from '../ui';
import { toast } from '../toast';

interface Report {
  id: string;
  targetType: 'rant' | 'comment' | 'message' | 'profile';
  targetId: string;
  reason: string;
  note: string | null;
  snapshot: { body?: string; imageUrl?: string | null; audioUrl?: string | null; clubId?: string | null; username?: string; displayName?: string; bio?: string | null; avatarUrl?: string | null };
  status: 'OPEN' | 'DISMISSED' | 'ACTIONED';
  resolution: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporterUsername: string | null;
  reporterName: string | null;
  targetUserId: string | null;
  targetUsername: string | null;
  targetName: string | null;
  targetSuspended: boolean;
  sameTargetReports: number;
  resolvedBy: string | null;
}

const WHAT: Record<Report['targetType'], string> = { rant: 'Rant', comment: 'Comment', message: 'Message', profile: 'Profile' };
const reasonLabel = (reason: string) => REPORT_REASONS.find((option) => option.value === reason)?.label ?? reason;

/**
 * What runners reported: Rants, comments, messages and profiles. Dismiss it, remove the content, or
 * suspend the account. Every report on the same thing is closed together and its reporters are told.
 */
export function ReportsPage() {
  const [view, setView] = useState<'open' | 'resolved'>('open');
  const reports = useQuery({ queryKey: ['admin', 'reports', view], queryFn: () => api<Report[]>(`/admin/reports?status=${view}`) });
  return <>
    <PageHeader eyebrow="Safety" title="Reports" description="Content and runners that people reported. Removing deletes it for everyone; suspending signs them out and stops them signing in." />
    <div className="mb-4 inline-flex rounded-lg border-[1.5px] border-ink bg-card p-[3px]">
      {(['open', 'resolved'] as const).map((value) => <button key={value} type="button" onClick={() => setView(value)}
        className={`rounded-md px-3 py-1.5 text-[13px] font-bold capitalize ${view === value ? 'bg-ink text-paper' : 'text-ink-2'}`}>{value}</button>)}
    </div>
    <ErrorNotice error={reports.error} onRetry={() => void reports.refetch()} />
    {reports.isLoading ? <Skeleton className="h-48 rounded-2xl" />
      : !reports.data?.length ? <EmptyState title={view === 'open' ? 'Nothing reported' : 'No decisions yet'}>{view === 'open' ? 'Every report has been handled.' : 'Handled reports show here.'}</EmptyState>
        : <ul className="space-y-3">{reports.data.map((report) => <li key={report.id}><ReportCard report={report} /></li>)}</ul>}
  </>;
}

function ReportCard({ report }: { report: Report }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const resolve = useMutation({
    mutationFn: (action: 'dismiss' | 'remove' | 'suspend') => post<{ resolved: number }>(`/admin/reports/${report.id}/resolve`, { action, ...(note.trim() ? { note: note.trim() } : {}) }),
    async onSuccess({ resolved }, action) {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      toast({ tone: 'ok', message: `${action === 'dismiss' ? 'Dismissed' : action === 'remove' ? 'Removed' : 'Account suspended'}. ${resolved} ${resolved === 1 ? 'report' : 'reports'} closed.` });
    },
  });
  const lift = useMutation({
    mutationFn: () => post('/admin/suspensions/lift', { userId: report.targetUserId, reason: note.trim() || 'Lifted after review' }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      toast({ tone: 'ok', message: 'Suspension lifted. They can sign in again.' });
    },
  });
  const open = report.status === 'OPEN';
  const shot = report.snapshot;
  return <article className="rounded-2xl border-[1.5px] border-ink bg-card p-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded bg-ink px-1.5 py-0.5 text-[11px] font-bold uppercase text-paper">{WHAT[report.targetType]}</span>
      <span className="rounded bg-bad-wash px-1.5 py-0.5 text-[11px] font-bold uppercase text-bad">{reasonLabel(report.reason)}</span>
      {report.sameTargetReports > 1 && <span className="rounded bg-warn-wash px-1.5 py-0.5 text-[11px] font-bold uppercase text-warn">Reported {report.sameTargetReports}×</span>}
      {report.targetSuspended && <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[11px] font-bold uppercase">Suspended</span>}
    </div>
    <p className="mt-2 text-[15px] font-bold">
      {report.targetName ?? 'Deleted account'} {report.targetUsername && <a className="font-normal text-ink-3 underline" href={`https://startajump.com/runners/${report.targetUsername}`} target="_blank" rel="noreferrer">@{report.targetUsername}</a>}
    </p>
    <div className="mt-2 rounded-lg bg-ink/[0.04] px-3 py-2 text-[14px]">
      {report.targetType === 'profile'
        ? <>{shot.displayName} · @{shot.username}{shot.bio ? <p className="mt-1 text-ink-2">{shot.bio}</p> : null}{shot.avatarUrl ? <img src={shot.avatarUrl} alt="" className="mt-2 h-16 w-16 rounded-lg object-cover" /> : null}</>
        : <>{shot.body ? <p className="whitespace-pre-wrap">{shot.body}</p> : <p className="text-ink-3">{shot.audioUrl ? 'Voice note' : 'No text'}</p>}
          {shot.imageUrl ? <img src={shot.imageUrl} alt="" className="mt-2 max-h-48 rounded-lg object-cover" /> : null}
          {shot.audioUrl ? <audio controls src={shot.audioUrl} className="mt-2 w-full" /> : null}</>}
    </div>
    <p className="mt-1 text-[12px] text-ink-3">As it was when reported{report.targetType === 'message' && shot.clubId ? ' · club chat' : report.targetType === 'message' ? ' · direct message' : ''}</p>
    <p className="mt-3 text-[13px] text-ink-2">
      Reported by {report.reporterName ?? 'a deleted account'}{report.reporterUsername ? ` (@${report.reporterUsername})` : ''} · {formatDateTime(report.createdAt)}
    </p>
    {report.note && <blockquote className="mt-2 border-l-2 border-line pl-3 text-[14px]">“{report.note}”</blockquote>}

    {open ? <>
      <label className="mt-3 block">
        <span className="label">Note (required to suspend; shown in the audit log)</span>
        <input className="field" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="e.g. Repeated harassment in DMs" />
      </label>
      <ErrorNotice error={resolve.error} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={resolve.isPending} onClick={() => resolve.mutate('dismiss')}>Dismiss</button>
        {report.targetType !== 'profile' && <button type="button" className="btn-primary btn-sm" disabled={resolve.isPending} onClick={() => resolve.mutate('remove')}>Remove {WHAT[report.targetType].toLowerCase()}</button>}
        {report.targetUserId && !report.targetSuspended && <button type="button" className="btn btn-sm border-[1.5px] border-ink bg-bad text-paper" disabled={resolve.isPending || note.trim().length < 3} onClick={() => resolve.mutate('suspend')}>Suspend account</button>}
      </div>
    </> : <div className="mt-3 text-[13px] text-ink-2">
      <p><b className="capitalize text-ink">{report.resolution}</b> by {report.resolvedBy ?? 'an admin'}{report.resolvedAt ? ` · ${formatDateTime(report.resolvedAt)}` : ''}{report.resolutionNote ? ` · “${report.resolutionNote}”` : ''}</p>
      {report.targetSuspended && report.targetUserId && <div className="mt-2 flex flex-wrap items-center gap-2">
        <input className="field max-w-xs" value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="Why lift it?" />
        <button type="button" className="btn-secondary btn-sm" disabled={lift.isPending} onClick={() => lift.mutate()}>Lift suspension</button>
        <ErrorNotice error={lift.error} />
      </div>}
    </div>}
  </article>;
}
