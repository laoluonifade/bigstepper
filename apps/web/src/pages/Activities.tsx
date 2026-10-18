import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ActivityRow, shownMetres } from '../components/ActivityRow';
import { CheckIcon, RunIcon } from '../components/icons';
import {
  cx,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Meter,
  Notice,
  PageHeader,
  Segmented,
  Skeleton,
  Stat,
  VerificationTag,
} from '../components/ui';
import { api, isApiError, post } from '../lib/api';
import { describeReason } from '../lib/copy';
import { formatDateTime, formatDistance, formatDistanceNumber, formatDuration, formatPace } from '../lib/format';
import { lifetimeStats } from '../lib/progress';
import { keys, useActivities, useUnit } from '../lib/queries';
import type { Activity } from '../lib/types';

type Filter = 'all' | 'verified' | 'attention';

export function ActivitiesPage() {
  const activities = useActivities();
  const unit = useUnit();
  const [filter, setFilter] = useState<Filter>('all');
  const list = useMemo(() => activities.data ?? [], [activities.data]);
  const stats = useMemo(() => lifetimeStats(list), [list]);
  const attention = list.filter((a) => a.verificationStatus === 'FLAGGED' || a.verificationStatus === 'REJECTED').length;
  const filtered = list.filter((activity) =>
    filter === 'verified'
      ? activity.verificationStatus === 'VERIFIED'
      : filter === 'attention'
        ? activity.verificationStatus === 'FLAGGED' || activity.verificationStatus === 'REJECTED'
        : true,
  );

  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const activity of filtered) {
      const label = new Date(activity.startedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      map.set(label, [...(map.get(label) ?? []), activity]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Activity"
        title="Your runs"
        actions={
          <Link to="/run" className="btn-primary">
            <RunIcon size={16} /> New run
          </Link>
        }
      />

      <div className="panel-strong mb-8 grid grid-cols-2 gap-y-5 p-5 sm:grid-cols-4">
        <Stat label="Verified distance" value={activities.isLoading ? '–' : formatDistanceNumber(stats.totalMetres, unit)} unit={unit} />
        <Stat label="Verified runs" value={activities.isLoading ? '–' : stats.verifiedRuns} />
        <Stat label="Longest" value={activities.isLoading ? '–' : formatDistanceNumber(stats.longestMetres, unit)} unit={unit} />
        <Stat label="Moving time" value={activities.isLoading ? '–' : formatDuration(stats.movingSeconds)} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Filter>
          label="Filter runs"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'verified', label: 'Verified' },
            { value: 'attention', label: `Needs attention${attention ? ` · ${attention}` : ''}` },
          ]}
        />
        <p className="text-[12px] text-ink-3">Showing your latest {Math.min(list.length, 100)} runs</p>
      </div>

      <ErrorNotice error={activities.error} onRetry={() => void activities.refetch()} />
      {activities.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'No runs yet' : 'Nothing here'}
          action={
            filter === 'all' ? (
              <Link to="/run" className="btn-primary">
                <RunIcon size={16} /> Start a run
              </Link>
            ) : undefined
          }
        >
          {filter === 'attention' ? 'None of your runs need attention.' : filter === 'verified' ? 'Verified runs will appear here.' : 'Record a run and it’ll show up here.'}
        </EmptyState>
      ) : (
        groups.map(([month, items]) => (
          <section key={month} className="mb-6">
            <h2 className="eyebrow mb-1 border-b-2 border-ink pb-2">{month}</h2>
            {items.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} unit={unit} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function runName(iso: string) {
  const date = new Date(iso);
  const hour = date.getHours();
  const part = hour < 5 ? 'Night' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';
  return `${date.toLocaleDateString('en-GB', { weekday: 'long' })} ${part.toLowerCase()} run`;
}

export function ActivityDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const search = useSearch({ strict: false }) as { fresh?: boolean };
  const unit = useUnit();
  const activity = useQuery({
    queryKey: keys.activity(id),
    queryFn: () => api<Activity>(`/activities/${id}`),
    refetchInterval: (query) => (query.state.data?.verificationStatus === 'PENDING_VERIFICATION' ? 2500 : false),
  });

  if (activity.isLoading) return <Loading />;
  if (activity.error || !activity.data) {
    return (
      <>
        <PageHeader title="Run not found" back={{ to: '/activities', label: 'Runs' }} />
        <ErrorNotice error={activity.error ?? new Error('This run doesn’t exist.')} />
      </>
    );
  }

  const a = activity.data;
  const pending = a.verificationStatus === 'PENDING_VERIFICATION';
  const verified = a.verificationStatus === 'VERIFIED';
  const metres = shownMetres(a);
  const moving = a.movingSeconds || a.elapsedSeconds;
  const pace = formatPace(metres, moving, unit);
  const trimmed = verified ? a.recordedDistanceMetres - a.validatedDistanceMetres : 0;

  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: '/activities', label: 'Runs' }}
        eyebrow={formatDateTime(a.startedAt)}
        title={runName(a.startedAt)}
        actions={<VerificationTag status={a.verificationStatus} />}
      />

      {search.fresh && verified && (
        <div className="mb-6 flex items-center gap-4 rounded-md border-2 border-ink bg-volt px-5 py-4 shadow-hard">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-ink text-volt">
            <CheckIcon size={22} />
          </span>
          <div>
            <p className="wide text-[16px] font-black uppercase">Verified. It counts.</p>
            <p className="text-[13px]">
              {formatDistance(a.validatedDistanceMetres, unit)} credited to any tables you joined before this run started.
            </p>
          </div>
        </div>
      )}

      <section className="panel-strong overflow-hidden">
        <div className="grid gap-6 p-5 sm:grid-cols-[1.3fr_1fr] sm:p-6">
          <div>
            <p className="eyebrow">{verified ? 'Verified distance' : pending ? 'Recorded distance · provisional' : 'Recorded distance'}</p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className={cx('score text-[80px] sm:text-[96px]', a.verificationStatus === 'REJECTED' && 'text-ink-3 line-through decoration-4')}>
                {formatDistanceNumber(metres, unit)}
              </span>
              <span className="text-[16px] font-semibold text-ink-2">{unit}</span>
            </p>
            {trimmed > 0 && (
              <p className="text-[13px] text-ink-2">
                {formatDistance(trimmed, unit)} of the {formatDistance(a.recordedDistanceMetres, unit)} recorded didn’t pass checks.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-5 sm:border-l sm:border-line sm:pl-6">
            <Stat label="Moving time" value={formatDuration(moving)} />
            <Stat label={`Pace /${unit}`} value={pace ?? '–'} />
            <Stat label="Elapsed" value={formatDuration(a.elapsedSeconds)} />
            <Stat label="Finished" value={new Date(a.finishedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} />
          </div>
        </div>
        {!pending && (
          <div className="border-t border-line px-5 py-4 sm:px-6">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="eyebrow">GPS confidence</p>
              <p className="num text-[13px] font-bold">{Math.round(a.gpsConfidence * 100)}%</p>
            </div>
            <Meter value={a.gpsConfidence * 100} max={100} tone={a.gpsConfidence >= 0.7 ? 'ok' : 'track'} label="GPS confidence" />
            <p className="mt-2 text-[12px] text-ink-3">Share of GPS points accurate enough to use. Runs need 70% or more to verify automatically.</p>
          </div>
        )}
      </section>

      {pending && (
        <Notice tone="warn" className="mt-6" title="Checking your route">
          This usually takes a few seconds. The distance above is provisional until it’s verified — it won’t count on leaderboards
          before then. This page updates by itself.
        </Notice>
      )}

      {a.verificationReasons.length > 0 && (
        <section className="mt-8">
          <h2 className="eyebrow mb-3 border-b-2 border-ink pb-2">{verified ? 'Notes from verification' : 'Why this run was flagged'}</h2>
          <ul className="space-y-3">
            {a.verificationReasons.map((code) => {
              const reason = describeReason(code);
              return (
                <li key={code} className="flex gap-3 rounded-md border border-line bg-card p-4">
                  <span className={cx('mt-1 h-2.5 w-2.5 shrink-0 rounded-sm', verified ? 'bg-warn' : 'bg-bad')} />
                  <div>
                    <p className="text-[14px] font-bold">{reason.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{reason.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(a.verificationStatus === 'FLAGGED' || a.verificationStatus === 'REJECTED') && <ReviewRequest activityId={a.id} />}
    </div>
  );
}

function ReviewRequest({ activityId }: { activityId: string }) {
  const [reason, setReason] = useState('');
  const request = useMutation({
    mutationFn: () => post(`/activities/${activityId}/review-request`, { reason: reason.trim() }),
  });
  const alreadyPending = isApiError(request.error, 409);
  const length = reason.trim().length;

  if (request.isSuccess || alreadyPending) {
    return (
      <Notice tone="ok" className="mt-8" title={alreadyPending ? 'A review is already pending' : 'Review requested'}>
        A person on our team will look at this run. If it’s approved, it’ll be credited to your tables automatically.
      </Notice>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="eyebrow mb-3 border-b-2 border-ink pb-2">Think we got it wrong?</h2>
      <form
        className="panel space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          request.mutate();
        }}
      >
        <Field
          label="Tell us what happened"
          hint={`${length}/500 · e.g. “I ran under a bridge for part of the route and lost signal.”`}
          error={length > 0 && length < 10 ? 'A little more detail please — at least 10 characters.' : undefined}
        >
          {(props) => (
            <textarea {...props} className="field" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} required />
          )}
        </Field>
        <ErrorNotice error={request.error} />
        <button className="btn-secondary" disabled={request.isPending || length < 10}>
          {request.isPending ? 'Sending…' : 'Request a review'}
        </button>
      </form>
    </section>
  );
}
