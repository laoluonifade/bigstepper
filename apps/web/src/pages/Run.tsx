import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { CheckIcon, OfflineIcon, PauseIcon, RunIcon, SignalIcon, StepMark, StopIcon } from '../components/icons';
import { cx, ErrorNotice, KeyValue, LiveDot, Loading, Notice, PageHeader, Redirect, Segmented, useCountUp, useNow } from '../components/ui';
import { api, post } from '../lib/api';
import { formatDateTime, formatDistance, formatDistanceNumber, formatDuration, formatPace } from '../lib/format';
import { keys, useActivities, useUnit } from '../lib/queries';
import { movingSeconds, useRecorder } from '../lib/recorder';
import type { Activity, RunSession } from '../lib/types';

export function RunPage() {
  const recorder = useRecorder();

  switch (recorder.phase) {
    case 'restoring':
      return <Loading label="Checking for a run in progress" />;
    case 'unavailable':
      return (
        <div className="mx-auto max-w-lg">
          <PageHeader eyebrow="Run" title="Couldn’t reach your run" />
          <ErrorNotice error={new Error(recorder.error ?? 'We couldn’t load your run in progress.')} />
          <p className="mt-4 text-[14px] text-ink-2">
            Your GPS points are safe on this device. They’ll upload once we can reach Jump again.
          </p>
          <button type="button" className="btn-primary mt-6" onClick={recorder.retryRestore}>
            Try again
          </button>
        </div>
      );
    case 'recording':
    case 'paused':
    case 'finishing':
      return <Scoreboard />;
    default:
      return <ReadyScreen />;
  }
}

function ReadyScreen() {
  const recorder = useRecorder();
  const locating = recorder.phase === 'locating';
  const [activityType, setActivityType] = useState<'walk' | 'run'>('run');

  if (recorder.phase === 'blocked') {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader eyebrow="Run" title="A run is already going" />
        <Notice tone="warn" title="You have a run in progress somewhere else">
          It was probably started on another device or in a browser whose data has since been cleared. Finish it on the device
          that started it, then come back. Recovering an interrupted run from here isn’t supported yet.
        </Notice>
        <Link to="/activities" className="btn-secondary mt-6">
          See your runs
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl animate-rise">
      <PageHeader eyebrow="Activity" title="Ready when you are" />

      <div className="mb-5">
        <Segmented<'walk' | 'run'>
          label="Activity type"
          value={activityType}
          onChange={setActivityType}
          options={[{ value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }]}
        />
      </div>

      <div className="panel-strong overflow-hidden">
        <div className="bg-ink px-6 py-10 text-center text-paper">
          <p className="eyebrow text-paper/60">Distance</p>
          <p className="score mt-2 animate-pop text-[96px] text-paper/25">0.00</p>
        </div>
        <ul className="stagger divide-y divide-line">
          {[
            ['Stay on this screen', 'We keep it awake while you move. Browsers pause GPS in the background, so don’t switch apps.'],
            ['Head outdoors', 'Open sky gives the cleanest signal. Points less accurate than 50 m don’t count.'],
            ['Only verified distance scores', 'After you finish we check the route. Verified distance is what challenges credit.'],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-3 px-5 py-4">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-ink text-volt">
                <CheckIcon size={14} />
              </span>
              <div>
                <p className="text-[14px] font-bold">{title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {recorder.gpsError && (
        <Notice tone="bad" className="mt-5" title="No location yet">
          {recorder.gpsError}
        </Notice>
      )}
      <ErrorNotice error={recorder.error ? new Error(recorder.error) : null} className="mt-5" />

      <button type="button" className="btn-primary mt-6 min-h-16 w-full text-[16px]" onClick={() => void recorder.start(activityType)} disabled={locating}>
        {locating ? (
          <>
            <StepMark size={18} motion="loop" /> Finding GPS signal…
          </>
        ) : (
          <>
            <RunIcon size={18} /> Start {activityType}
          </>
        )}
      </button>
      <p className="mt-3 text-center text-[12px] text-ink-3">Your location is only recorded while an activity is active.</p>
    </div>
  );
}

function signalStrength(accuracy: number | null) {
  if (accuracy === null) return 0;
  if (accuracy <= 10) return 4;
  if (accuracy <= 20) return 3;
  if (accuracy <= 50) return 2;
  return 1;
}

function Scoreboard() {
  const recorder = useRecorder();
  const navigate = useNavigate();
  const unit = useUnit();
  const now = useNow(1000);
  const [confirming, setConfirming] = useState(false);
  const recording = recorder.phase === 'recording';
  const finishing = recorder.phase === 'finishing';
  const seconds = movingSeconds(recorder.session, now);
  const pace = formatPace(recorder.distanceMetres, seconds, unit);
  const strength = signalStrength(recorder.accuracy);
  const stale = recorder.lastFixAt !== null && now - recorder.lastFixAt > 20_000;
  const activityName = recorder.session?.activityType ?? 'run';
  const shownMetres = useCountUp(recorder.distanceMetres, 900);
  const split = useSplitBanner(recorder.distanceMetres, unit, seconds);

  async function finish() {
    const activity = await recorder.finish();
    if (activity) void navigate({ to: '/activities/$id', params: { id: activity.id }, search: { fresh: true } });
    else setConfirming(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-fade flex-col bg-ink text-paper">
      {/* Live strip: sweeps while recording, still while paused. */}
      <div className="h-1 overflow-hidden bg-paper/10" aria-hidden="true">
        {recording && <div className="h-full w-1/3 animate-sweep bg-track" />}
      </div>
      <header className="flex items-center justify-between gap-3 px-5 pt-[max(env(safe-area-inset-top),1rem)]">
        <span
          className={cx(
            'tag h-7 border-0 px-2.5 text-[11px]',
            recording ? 'bg-track text-ink' : 'bg-paper/15 text-paper',
          )}
        >
          {!finishing && <LiveDot live={recording} className={recording ? 'text-ink' : 'text-paper'} />}
          {finishing ? 'Finishing' : recording ? 'Recording' : 'Paused'}
        </span>
        <div className="flex items-center gap-4 text-[12px] font-semibold text-paper/70">
          <span className="flex items-center gap-1.5" title="GPS accuracy">
            <SignalIcon size={16} className={cx(strength >= 3 ? 'text-volt' : strength === 2 ? 'text-paper' : 'text-track', stale && 'opacity-40')} />
            {recorder.accuracy !== null ? `±${Math.round(recorder.accuracy)} m` : 'Searching'}
          </span>
          <span className="flex items-center gap-1.5">
            {recorder.connection === 'offline' ? (
              <>
                <OfflineIcon size={16} className="text-track" /> {recorder.pendingCount} saved
              </>
            ) : recorder.pendingCount > 0 ? (
              `${recorder.pendingCount} to sync`
            ) : (
              'Synced'
            )}
          </span>
        </div>
        <Link to="/dashboard" className="text-[12px] font-bold uppercase tracking-[0.1em] text-paper/60 hover:text-paper">
          Minimise
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 text-center">
        <p className="eyebrow text-paper/50">Distance · {unit}</p>
        <p
          className={cx('score num mt-1 animate-pop text-[clamp(104px,32vw,220px)] transition-colors duration-500', recording ? 'text-volt' : 'text-paper/60')}
          aria-live="off"
        >
          {formatDistanceNumber(shownMetres, unit)}
        </p>
        <div className="h-10">
          {split && (
            <p key={split.count} className="tag h-8 animate-pop border-0 bg-volt px-3 text-[12px] text-ink" role="status">
              {split.count} {unit} · {formatDuration(split.seconds)}
            </p>
          )}
        </div>
        <div className="mt-2 grid w-full max-w-md animate-rise-lg grid-cols-2 divide-x divide-paper/15 border-y border-paper/15 [animation-delay:150ms]">
          <div className="py-4">
            <p className="eyebrow text-paper/50">Time</p>
            <p className="score num mt-1 text-[44px]">{formatDuration(seconds)}</p>
          </div>
          <div className="py-4">
            <p className="eyebrow text-paper/50">Avg pace /{unit}</p>
            <p className="score num mt-1 text-[44px]">{pace ?? '–:––'}</p>
          </div>
        </div>
        {(recorder.gpsError || stale) && (
          <p className="mt-5 max-w-sm text-[13px] text-track">{recorder.gpsError ?? 'GPS signal lost. Keep this screen open and stay outdoors.'}</p>
        )}
        {recorder.error && <p className="mt-5 max-w-sm text-[13px] font-semibold text-track">{recorder.error}</p>}
      </main>

      <footer className="safe-bottom px-5 pt-4">
        {confirming ? (
          <div className="mx-auto max-w-md animate-rise rounded-md border-2 border-paper/20 p-4">
            <p className="wide text-[15px] font-extrabold uppercase">Finish this {activityName}?</p>
            <p className="mt-1 text-[13px] text-paper/70">
              {formatDistance(recorder.distanceMetres, unit)} will be submitted for verification. You can’t add to it afterwards.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" className="btn min-h-14 border-2 border-paper/30 text-paper" onClick={() => setConfirming(false)} disabled={finishing}>
                Keep going
              </button>
              <button type="button" className="btn min-h-14 border-2 border-paper bg-paper text-ink" onClick={() => void finish()} disabled={finishing}>
                {finishing ? 'Saving…' : 'Finish'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-md animate-rise-lg grid-cols-2 gap-3 [animation-delay:250ms]">
            {recording ? (
              <button type="button" className="btn min-h-20 border-2 border-paper text-paper hover:bg-paper/10" onClick={() => void recorder.pause()}>
                <PauseIcon size={22} /> Pause
              </button>
            ) : (
              <button
                type="button"
                className="btn min-h-20 border-2 border-track bg-track text-ink"
                onClick={() => void recorder.resume()}
                disabled={finishing}
              >
                <RunIcon size={22} /> Resume
              </button>
            )}
            <button
              type="button"
              className="btn min-h-20 border-2 border-paper bg-paper text-ink"
              onClick={() => setConfirming(true)}
              disabled={finishing}
            >
              <StopIcon size={20} /> Finish
            </button>
          </div>
        )}
        <p className="mx-auto mt-3 max-w-md text-center text-[11px] text-paper/45">
          Keep this screen open. Browsers pause GPS when you switch apps.
        </p>
      </footer>
    </div>
  );
}

/**
 * Each time the runner passes another whole km/mile, briefly shows "3 km · 18:42".
 * Starts from the distance already covered, so restoring a run mid-way doesn't replay old splits.
 */
function useSplitBanner(metres: number, unit: 'km' | 'mi', seconds: number) {
  const unitMetres = unit === 'km' ? 1000 : 1609.344;
  const count = Math.floor(metres / unitMetres);
  const last = useRef(count);
  const [banner, setBanner] = useState<{ count: number; seconds: number } | null>(null);
  useEffect(() => {
    if (count > last.current) {
      last.current = count;
      setBanner({ count, seconds });
      const timer = window.setTimeout(() => setBanner(null), 4000);
      return () => window.clearTimeout(timer);
    }
    last.current = Math.max(last.current, count);
    // Only `count` triggers this; `seconds` is just read at the moment a split happens.
  }, [count]);
  return banner;
}

/** A specific server-side run session, e.g. opened from another device. */
export function RunSessionPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const recorder = useRecorder();
  const unit = useUnit();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const run = useQuery({ queryKey: keys.run(id), queryFn: () => api<RunSession>(`/runs/${id}`), enabled: recorder.session?.id !== id });
  const activities = useActivities();
  const activity = activities.data?.find((item) => item.runningSessionId === id);
  const finishRemote = useMutation({
    mutationFn: () => post<Activity>(`/runs/${id}/finish`),
    onSuccess(result) {
      void queryClient.invalidateQueries({ queryKey: keys.activities });
      void navigate({ to: '/activities/$id', params: { id: result.id } });
    },
  });

  useEffect(() => {
    if (activity) void navigate({ to: '/activities/$id', params: { id: activity.id }, replace: true });
  }, [activity, navigate]);

  if (recorder.session?.id === id) return <Redirect to="/run" />;
  if (run.isLoading) return <Loading />;
  if (run.error) return <ErrorNotice error={run.error} onRetry={() => void run.refetch()} />;
  if (!run.data) return null;

  const inProgress = run.data.status === 'RUNNING' || run.data.status === 'PAUSED';
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader eyebrow="Run session" title={inProgress ? 'Run in progress' : 'Run'} back={{ to: '/activities', label: 'Runs' }} />
      <div className="panel p-5">
        <KeyValue
          items={[
            { label: 'Status', value: run.data.status === 'PAUSED' ? 'Paused' : run.data.status === 'RUNNING' ? 'Recording' : run.data.status.replace(/_/g, ' ').toLowerCase() },
            { label: 'Started', value: formatDateTime(run.data.startedAt) },
            { label: 'Uploaded distance', value: formatDistance(run.data.distanceMetres, unit) },
          ]}
        />
      </div>
      {inProgress && (
        <>
          <Notice tone="info" className="mt-5" title="This run was started on another device">
            GPS points are recorded by the device that started the run. You can finish it from here — it’ll be submitted with the{' '}
            {formatDistance(run.data.distanceMetres, unit)} already uploaded.
          </Notice>
          <ErrorNotice error={finishRemote.error} className="mt-4" />
          <button type="button" className="btn-secondary mt-5" onClick={() => finishRemote.mutate()} disabled={finishRemote.isPending}>
            {finishRemote.isPending ? 'Finishing…' : 'Finish run'}
          </button>
        </>
      )}
    </div>
  );
}
