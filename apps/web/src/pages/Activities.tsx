import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ActivityRow, fromSteps, shownMetres } from '../components/ActivityRow';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { SendActivityButton } from '../components/SendActivitySheet';
import { ShareRun } from '../components/ShareRun';
import { CheckIcon, FeedIcon, RunIcon, SendIcon } from '../components/icons';
import { CountUp, cx, EmptyState, ErrorNotice, Field, Loading, Meter, Notice, PageHeader, Segmented, Skeleton, Stat, VerificationTag } from '../components/ui';
import { api, isApiError, post } from '../lib/api';
import { estimatedCalories } from '../lib/calories';
import { describeReason } from '../lib/copy';
import { activityName, formatDateTime, formatDistance, formatDistanceNumber, formatDuration, formatPace, formatSpeed } from '../lib/format';
import { ActivityKind, lifetimeStats, ofKind } from '../lib/progress';
import { storageKeys, useStored } from '../lib/local';
import { useUser } from '../lib/auth';
import { KindFilter } from './Dashboard';
import { keys, useActivities, useProfile, useUnit } from '../lib/queries';
import { metricOf } from '../lib/scoring';
import type { Activity } from '../lib/types';

type Filter = 'all' | 'verified' | 'attention';

export function ActivitiesPage() {
  const activities = useActivities();
  const unit = useUnit();
  const user = useUser();
  const [filter, setFilter] = useState<Filter>('all');
  const [kind, setKind] = useStored<ActivityKind>(storageKeys.activityKind(user.id), 'all');
  const list = useMemo(() => ofKind(activities.data ?? [], kind), [activities.data, kind]);
  const stats = useMemo(() => lifetimeStats(list), [list]);
  const attention = list.filter((a) => a.verificationStatus === 'REJECTED').length;
  const filtered = list.filter((activity) =>
    filter === 'verified'
      ? (activity.verificationStatus === 'VERIFIED' || activity.verificationStatus === 'FLAGGED')
      : filter === 'attention'
        ? activity.verificationStatus === 'REJECTED'
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
        title="Your activities"
        actions={
          <Link to="/run" className="btn-primary btn-sm hidden sm:inline-flex">
            <RunIcon size={16} /> New activity
          </Link>
        }
      />

      <div className="mb-4">
        <KindFilter value={kind} onChange={setKind} />
      </div>

      <div key={kind} className="panel-strong mb-6 grid animate-rise grid-cols-2 gap-x-4 gap-y-5 p-5 sm:grid-cols-4">
        <Stat label={kind === 'run' ? 'Run distance' : kind === 'walk' ? 'Walk distance' : 'Verified distance'} value={activities.isLoading ? '–' : formatDistanceNumber(stats.totalMetres, unit)} unit={unit} />
        <Stat label={kind === 'run' ? 'Verified runs' : kind === 'walk' ? 'Verified walks' : 'Verified activities'} value={activities.isLoading ? '–' : stats.verifiedRuns} />
        <Stat label="Longest" value={activities.isLoading ? '–' : formatDistanceNumber(stats.longestMetres, unit)} unit={unit} />
        <Stat label="Moving time" value={activities.isLoading ? '–' : formatDuration(stats.movingSeconds)} />
      </div>

      <ActivityCalendar unit={unit} />

      <div className="mb-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="wide text-[16px] font-extrabold uppercase sm:text-[18px]">History</h2>
          <p className="text-[12px] text-ink-3">Latest {Math.min(list.length, 100)}</p>
        </div>
        <div className="mt-3">
          <Segmented<Filter>
            label="Filter activities"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'verified', label: 'Verified' },
              { value: 'attention', label: attention ? `Review · ${attention}` : 'Review' },
            ]}
          />
        </div>
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
          title={filter === 'all' && kind === 'all' ? 'No activities yet' : 'Nothing here'}
          action={
            filter === 'all' && kind === 'all' ? (
              <Link to="/run" className="btn-primary">
                <RunIcon size={16} /> Start an activity
              </Link>
            ) : undefined
          }
        >
          {filter === 'attention'
            ? 'None of these need attention.'
            : filter === 'verified'
              ? 'Verified activities will appear here.'
              : kind !== 'all'
                ? `No ${kind}s recorded yet.`
                : 'Record a walk, run or ride and it’ll show up here.'}
        </EmptyState>
      ) : (
        groups.map(([month, items]) => (
          <section key={month} className="mb-6">
            <h2 className="eyebrow mb-1 flex items-baseline justify-between border-b-2 border-ink pb-2">{month}<span className="num normal-case tracking-normal text-ink-3">{items.length} {items.length === 1 ? 'activity' : 'activities'}</span></h2>
            {items.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} unit={unit} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}


const ACTIVITY_ACTION = 'inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-line bg-card text-[14px] font-semibold text-ink transition-colors hover:border-ink';

export function ActivityDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const search = useSearch({ strict: false }) as { fresh?: boolean };
  const unit = useUnit();
  const profile = useProfile();
  const activity = useQuery({
    queryKey: keys.activity(id),
    queryFn: () => api<Activity>(`/activities/${id}`),
    refetchInterval: (query) => (query.state.data?.verificationStatus === 'PENDING_VERIFICATION' ? 2500 : false),
  });

  if (activity.isLoading) return <Loading />;
  if (activity.error || !activity.data) {
    return (
      <>
        <PageHeader title="Activity not found" back={{ to: '/activities', label: 'Activities' }} />
        <ErrorNotice error={activity.error ?? new Error('This activity doesn’t exist.')} />
      </>
    );
  }

  const a = activity.data;
  const pending = a.verificationStatus === 'PENDING_VERIFICATION';
  const verified = (a.verificationStatus === 'VERIFIED' || a.verificationStatus === 'FLAGGED');
  const metres = shownMetres(a);
  const moving = a.movingSeconds || a.elapsedSeconds;
  const pace = a.activityType === 'cycle' ? formatSpeed(metres, moving, unit) : formatPace(metres, moving, unit);
  const trimmed = verified ? a.recordedDistanceMetres - a.validatedDistanceMetres : 0;
  const calories = estimatedCalories(a, profile.data?.weightKg);

  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: '/activities', label: 'Activities' }}
        eyebrow={<span className="flex flex-wrap items-center gap-2">{formatDateTime(a.startedAt)} <VerificationTag status={a.verificationStatus} /></span>}
        title={<>{activityName(a.startedAt, a.activityType)}{a.source === 'strava' && <span className="ml-2 align-middle text-[12px] font-bold normal-case tracking-normal text-[#FC5200]">via Strava</span>}{a.source === 'apple_health' && <span className="ml-2 align-middle text-[12px] font-bold normal-case tracking-normal text-[#FF2D55]">via Apple Health</span>}</>}
      />
      {/* Equal, quiet actions that fit one row on a phone. */}
      <div className="-mt-2 mb-6 grid grid-cols-3 gap-2 md:max-w-md">
        {verified || pending
          ? <Link to="/feed" search={{ activity: a.id }} className={ACTIVITY_ACTION}><FeedIcon size={17} />Post</Link>
          : <span className={cx(ACTIVITY_ACTION, 'pointer-events-none opacity-40')}><FeedIcon size={17} />Post</span>}
        <ShareRun activity={a} unit={unit} className={ACTIVITY_ACTION} plain autoOpen={Boolean(search.fresh) && verified} />
        {a.verificationStatus !== 'REJECTED'
          ? <SendActivityButton activity={a} unit={unit} className={ACTIVITY_ACTION} plain />
          : <span className={cx(ACTIVITY_ACTION, 'pointer-events-none opacity-40')}><SendIcon size={16} />Send</span>}
      </div>

      {search.fresh && verified && (
        <div className="mb-6 flex animate-pop items-center gap-4 rounded-md border-2 border-ink bg-volt px-5 py-4 shadow-hard">
          <span className="flex h-10 w-10 shrink-0 animate-pop items-center justify-center rounded-sm bg-ink text-volt [animation-delay:250ms]">
            <CheckIcon size={22} />
          </span>
          <div>
            <p className="wide text-[16px] font-black uppercase">Verified. It counts.</p>
            <p className="text-[13px]">
              {a.activityType === 'cycle' ? `${formatDistance(shownMetres(a), unit)} can count in your active Cycling and Distance competitions. It does not count toward the running league.` : `${formatDistance(shownMetres(a), unit)} counts in your active league. Eligible competitions are listed below.`}
            </p>
          </div>
        </div>
      )}

      <section className="panel-strong overflow-hidden">
        <div className="grid gap-6 p-5 sm:grid-cols-[1.3fr_1fr] sm:p-6">
          <div>
            <p className="eyebrow">{verified ? (fromSteps(a) ? 'Verified distance · from steps' : 'Verified distance') : 'Distance'}</p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className={cx('score text-[80px] sm:text-[96px]', a.verificationStatus === 'REJECTED' && 'text-ink-3 line-through decoration-4')}>
                <CountUp value={metres} format={(m) => formatDistanceNumber(m, unit)} />
              </span>
              <span className="text-[16px] font-semibold text-ink-2">{unit}</span>
            </p>
            {fromSteps(a) && (
              <p className="text-[13px] text-ink-2">
                Measured from {a.validatedSteps.toLocaleString('en-GB')} steps. GPS couldn’t track this one (indoors?). It can count for your league and step-based competitions, but not paid distance scoring.
              </p>
            )}
            {trimmed > 0 && !fromSteps(a) && (
              <p className="text-[13px] text-ink-2">
                {formatDistance(trimmed, unit)} of the {formatDistance(a.recordedDistanceMetres, unit)} recorded didn’t pass checks.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-5 sm:border-l sm:border-line sm:pl-6">
            {a.activityType !== 'cycle' && <><Stat label={verified ? 'Verified steps' : 'Recorded steps'} value={verified ? a.validatedSteps.toLocaleString('en-GB') : a.recordedSteps.toLocaleString('en-GB')} />
            <Stat label="Step cadence" value={verified && a.validatedSteps > 0 && moving > 0 ? `${Math.round(a.validatedSteps * 60 / moving).toLocaleString('en-GB')} /min` : '–'} /></>}
            {calories !== null && <Stat label="Estimated calories" value={calories.toLocaleString('en-GB')} unit="kcal" />}
            <Stat label="Moving time" value={formatDuration(moving)} />
            <Stat label={a.activityType === 'cycle' ? 'Avg speed' : `Pace /${unit}`} value={pace ?? '–'} />
            <Stat label="Elapsed" value={formatDuration(a.elapsedSeconds)} />
            <Stat label="Finished" value={new Date(a.finishedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} />
          </div>
        </div>
        {verified && <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3 sm:px-6">{profile.data?.weightKg ? 'Calories are an estimate from your private body weight and verified moving time, not a device measurement.' : <>Want a calorie estimate? <Link to="/settings/profile" className="font-semibold underline">Add your private body weight</Link>.</>}</p>}
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

      {verified && <div className="mt-6"><ActivityCredits activityId={a.id} unit={unit} /></div>}


      {a.verificationStatus === 'REJECTED' && a.verificationReasons.length > 0 && (
        <section className="mt-8">
          <h2 className="eyebrow mb-3 border-b-2 border-ink pb-2">{verified ? 'Notes from verification' : 'Why this activity was flagged'}</h2>
          <ul className="stagger space-y-3">
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

      {(a.verificationStatus === 'REJECTED') && <ReviewRequest activityId={a.id} />}
      <DeleteActivity activityId={a.id} />
    </div>
  );
}

function ActivityCredits({ activityId, unit }: { activityId: string; unit: 'km' | 'mi' }) {
  const credits = useQuery({
    queryKey: ['activity-credits', activityId],
    queryFn: () => api<Array<{ code: string; title: string; scoringMethod: string; creditedDistanceMetres: number; creditedSteps: number; completionTimeSeconds: number | null }>>(`/activities/${activityId}/credits`),
  });
  return <section className="panel mt-6 p-5">
    <h2 className="wide text-[16px] font-extrabold uppercase">Competition credits</h2>
    <ErrorNotice error={credits.error} onRetry={() => void credits.refetch()} className="mt-3" />
    {credits.isLoading ? <p className="mt-2 text-[13px] text-ink-2">Checking joined competitions…</p> : !credits.data?.length ? (
      <p className="mt-2 text-[13px] text-ink-2">No competition credited this activity. It counts in competitions you’ve joined when it’s the right kind of activity and falls inside their dates.</p>
    ) : <ul className="mt-3 divide-y divide-line">{credits.data.map((credit) => {
      // What this one activity added: its time for a race against the clock, else distance and steps.
      const score = metricOf(credit.scoringMethod).aggregate === 'fastest' && credit.completionTimeSeconds
        ? formatDuration(credit.completionTimeSeconds)
        : [formatDistance(credit.creditedDistanceMetres, unit), credit.creditedSteps ? `${credit.creditedSteps.toLocaleString('en-GB')} steps` : null].filter(Boolean).join(' · ');
      return <li key={credit.code} className="flex items-center justify-between gap-3 py-2 text-[13px]">
        <Link to="/competitions/$code" params={{ code: credit.code }} className="min-w-0 truncate font-bold underline-offset-2 hover:underline">{credit.title}</Link>
        <span className="num shrink-0 text-ink-2">{score}</span>
      </li>;
    })}</ul>}
  </section>;
}

/** Remove an activity and recalculate any standings it affected. */
function DeleteActivity({ activityId }: { activityId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/activities/${activityId}`, { method: 'DELETE' }),
    onSuccess() {
      queryClient.removeQueries({ queryKey: keys.activity(activityId) });
      void queryClient.invalidateQueries({ queryKey: keys.activities });
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
      void queryClient.invalidateQueries({ queryKey: keys.myLeagues });
      void navigate({ to: '/activities' });
    },
  });

  return (
    <section className="mt-10 border-t border-line pt-6">
      {confirming ? (
        <div className="animate-rise rounded-md border-[1.5px] border-bad/50 bg-bad-wash p-4">
          <p className="text-[15px] font-bold">Delete this activity?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            It’s removed for good, along with its distance in any active competitions and, for walks or runs, your league. This can’t be undone.
          </p>
          <ErrorNotice error={remove.error} className="mt-3" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm border-[1.5px] border-bad bg-bad text-white" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? 'Deleting…' : 'Delete activity'}
            </button>
            <button type="button" className="btn-quiet btn-sm" disabled={remove.isPending} onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="text-[13px] font-semibold text-bad underline decoration-bad/30 underline-offset-4 hover:decoration-bad" onClick={() => setConfirming(true)}>
          Delete this activity
        </button>
      )}
    </section>
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
        A person on our team will look at this activity. If it’s approved, it’ll be credited to your competitions automatically.
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
          error={length > 0 && length < 10 ? 'A little more detail please, at least 10 characters.' : undefined}
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
