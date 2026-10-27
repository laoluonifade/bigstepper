import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, CloseIcon, CycleIcon, OfflineIcon, PauseIcon, PlayIcon, RunIcon, JumpLogo, SignalIcon, StopIcon, WalkIcon } from '../components/icons';
import { Modal } from '../components/Modal';
import { RunMap, type LivePosition } from '../components/LazyRunMap';
import { usePlaceName } from '../lib/place';
import { toast } from '../lib/toast';
import { cx, ErrorNotice, KeyValue, Loading, Notice, PageHeader, Redirect, useCountUp, useNow } from '../components/ui';
import { api, post } from '../lib/api';
import { formatDateTime, formatDistance, formatDistanceNumber, formatDuration, formatPace } from '../lib/format';
import { keys, useActivities, useUnit } from '../lib/queries';
import { movingSeconds, START_ACTIVITY_EVENT, useRecorder } from '../lib/recorder';
import type { Activity, RunSession } from '../lib/types';

export function RunPage() {
  const recorder = useRecorder();

  switch (recorder.phase) {
    case 'restoring':
      return <Loading label="Checking for a run in progress" />;
    case 'unavailable':
      return (
        <div className="mx-auto max-w-lg">
          <PageHeader eyebrow="Activity" title="Couldn’t reach your activity" />
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

/**
 * Where you are before you start, without asking for location until the runner opts in: if permission
 * is already granted it watches straight away, otherwise `enable()` asks.
 */
function usePreviewPosition() {
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [state, setState] = useState<'idle' | 'locating' | 'ready' | 'denied' | 'unsupported'>('idle');
  const watch = useRef<number | null>(null);
  /** The raw latest fix, handed to the recorder so Start doesn't wait for a new one. */
  const latest = useRef<GeolocationPosition | null>(null);

  const enable = useCallback(() => {
    if (!('geolocation' in navigator)) return setState('unsupported');
    if (watch.current !== null) return;
    setState('locating');
    watch.current = navigator.geolocation.watchPosition(
      (fix) => { latest.current = fix; setPosition({ latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy }); setState('ready'); },
      (error) => setState(error.code === 1 ? 'denied' : 'locating'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then((status) => { if (!cancelled && status.state === 'granted') enable(); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
    };
  }, [enable]);

  return { position, state, enable, latest };
}

const ACTIVITY_CHOICES = [
  { value: 'run', label: 'Run', icon: RunIcon },
  { value: 'walk', label: 'Walk', icon: WalkIcon },
  { value: 'cycle', label: 'Ride', icon: CycleIcon },
] as const;

function ReadyScreen() {
  const recorder = useRecorder();
  const locating = recorder.phase === 'locating';
  const [activityType, setActivityType] = useState<'walk' | 'run' | 'cycle'>('run');
  const [showStartInfo, setShowStartInfo] = useState(false);
  const [showHowItCounts, setShowHowItCounts] = useState(false);
  const preview = usePreviewPosition();
  const eligible = useQuery({
    queryKey: ['tables', 'eligible', activityType],
    queryFn: () => api<Array<{ id: string; code: string; title: string; challengeType: string; type: string }>>(`/tables/eligible?activity=${activityType}`),
    enabled: showStartInfo,
  });
  // The bottom nav's centre button becomes "Start" on this page.
  useEffect(() => {
    const open = () => setShowStartInfo(true);
    window.addEventListener(START_ACTIVITY_EVENT, open);
    return () => window.removeEventListener(START_ACTIVITY_EVENT, open);
  }, []);
  const gpsError = recorder.gpsError;
  useEffect(() => { if (gpsError) toast({ tone: 'warn', title: 'No location yet', message: gpsError }); }, [gpsError]);
  const placeName = usePlaceName(preview.position);

  if (recorder.phase === 'blocked') {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader eyebrow="Activity" title="An activity is already going" />
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

  const accuracy = preview.position?.accuracy ?? null;
  const strength = signalStrength(accuracy);
  const gpsLabel = preview.state === 'ready' ? (strength >= 3 ? 'GPS ready' : strength === 2 ? 'GPS fair' : 'GPS weak')
    : preview.state === 'locating' ? 'Finding you…' : preview.state === 'denied' ? 'Location blocked' : preview.state === 'unsupported' ? 'No GPS on this device' : 'Show my location';

  return (
    <div className="mx-auto max-w-xl animate-fade">
      {/* Full-bleed map on phones, a rounded card on larger screens. */}
      <div className="relative -mx-4 -mt-6 md:mx-0 md:mt-0">
        <RunMap route={[]} position={preview.position} zoom={14} className="h-[46dvh] min-h-[300px] md:h-[420px] md:rounded-[28px] md:border-2 md:border-ink md:shadow-hard" />
        <button
          type="button"
          onClick={preview.enable}
          disabled={preview.state === 'ready' || preview.state === 'locating'}
          className="absolute left-4 top-4 z-10 flex h-9 items-center gap-2 rounded-full border-[1.5px] border-ink bg-card/80 px-3.5 text-[13px] font-semibold shadow-hard-sm backdrop-blur-md md:left-5 md:top-5"
        >
          <span className={cx('h-2 w-2 rounded-full', preview.state === 'ready' ? (strength >= 3 ? 'bg-ok' : 'bg-warn') : preview.state === 'locating' ? 'animate-blink bg-[#0A84FF]' : 'bg-ink-3')} />
          {preview.state === 'ready' && placeName ? <span className="max-w-[52vw] truncate">{placeName}</span> : gpsLabel}
          {accuracy !== null && preview.state === 'ready' && <span className="num text-ink-3">±{Math.round(accuracy)} m</span>}
        </button>
      </div>

      <section className="relative -mx-4 -mt-6 rounded-t-[28px] border-t-2 border-ink bg-card px-5 pb-6 pt-3 md:mx-0 md:mt-5 md:rounded-[28px] md:border-2 md:pt-6 md:shadow-hard">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink/20 md:hidden" aria-hidden="true" />
        <div className="flex items-end justify-between gap-3">
          <h1 className="display text-[30px] leading-[0.95]">Ready?</h1>
          <button type="button" className="shrink-0 text-[15px] font-semibold text-[#0A84FF]" onClick={() => setShowHowItCounts(true)}>How it counts</button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Activity type">
          {ACTIVITY_CHOICES.map(({ value, label, icon: Icon }) => {
            const active = activityType === value;
            return <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setActivityType(value)}
              className={cx('flex flex-col items-center gap-2 rounded-[20px] border-2 border-ink py-4 transition-all duration-200 active:scale-[0.96]', active ? 'translate-x-[2px] translate-y-[2px] bg-ink text-paper shadow-none' : 'bg-card text-ink shadow-hard hover:bg-track-wash')}
            >
              <span className={cx('flex h-11 w-11 items-center justify-center rounded-full border-2', active ? 'border-track bg-track text-ink' : 'border-ink bg-paper text-ink')}><Icon size={22} /></span>
              <span className="text-[15px] font-semibold">{label}</span>
            </button>;
          })}
        </div>

        {/* Phones start from the big button in the tab bar; larger screens have no tab bar, so show one here. */}
        <button
          type="button"
          className="btn-primary mt-5 hidden min-h-16 w-full rounded-full text-[16px] md:inline-flex"
          onClick={() => setShowStartInfo(true)}
          disabled={locating}
        >
          {locating ? <><JumpLogo height={12} motion="loop" /> Finding GPS signal…</> : <><PlayIcon size={18} /> Start {activityType === 'cycle' ? 'ride' : activityType}</>}
        </button>
        {locating
          ? <p className="mt-4 flex items-center justify-center gap-2 text-[13px] font-semibold md:hidden"><JumpLogo height={11} motion="loop" /> Finding GPS signal…</p>
          : <p className="mt-5 text-center text-[14px] font-medium text-ink-2 md:hidden">Tap <span className="rounded-full border-[1.5px] border-ink bg-track px-2 py-0.5 font-semibold text-ink">Start</span> below when you’re ready</p>}
        <p className="mt-2 text-center text-[12px] text-ink-3">Keep Jump open while you move. Location is only recorded during an activity.</p>
      </section>

      <ErrorNotice error={recorder.error ? new Error(recorder.error) : null} />

      {showHowItCounts && <Modal title="How it counts" onClose={() => setShowHowItCounts(false)}>
        <ul className="space-y-4">
          {[
            ['Stay on this screen', 'We keep it awake while you move. Browsers pause GPS in the background, so don’t switch apps.'],
            ['Head outdoors', 'Open sky gives the cleanest signal. Points less accurate than 50 m don’t count.'],
            ['Verified after you finish', activityType === 'cycle' ? 'Jump checks your GPS route. Cycling distance counts only in cycling competitions.' : 'Jump checks your route and steps. Competitions use the verified values.'],
          ].map(([title, body]) => <li key={title} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-ink text-volt"><CheckIcon size={14} /></span>
            <div><p className="text-[15px] font-semibold">{title}</p><p className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{body}</p></div>
          </li>)}
        </ul>
      </Modal>}

      {showStartInfo && <Modal title={`Before your ${activityType === 'cycle' ? 'ride' : activityType}`} onClose={() => setShowStartInfo(false)}>
        <p className="text-[14px] leading-relaxed text-ink-2">
          {activityType === 'cycle'
            ? 'After GPS verification, this ride counts in cycling competitions you’ve joined. Cycling doesn’t add to run, walk, step or league standings.'
            : `After verification, this ${activityType} counts in ${activityType} competitions you’ve joined, plus distance, step and timed ones, and your league.`}
        </p>
        <div className="mt-4 rounded-md border-[1.5px] border-ink bg-paper p-4">
          <p className="text-[13px] font-semibold">Counting toward</p>
          {eligible.isLoading ? <p className="mt-1 text-[13px] text-ink-3">Checking…</p> : eligible.data?.length ? (
            <ul className="mt-1.5 max-h-32 space-y-1 overflow-y-auto text-[14px]">{eligible.data.map((table) => <li key={table.id} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-track" />{table.title}</li>)}</ul>
          ) : <p className="mt-1 text-[13px] text-ink-3">No competitions yet.{activityType === 'cycle' ? '' : ' It still counts for your league.'}</p>}
          <ErrorNotice error={eligible.error} onRetry={() => void eligible.refetch()} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="btn-secondary" onClick={() => setShowStartInfo(false)}>Not yet</button>
          <button type="button" className="btn-primary" onClick={() => { setShowStartInfo(false); void recorder.start(activityType, preview.latest.current); }} disabled={locating}>Start</button>
        </div>
      </Modal>}
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

/** Less than this reads 0.00 km: GPS measured nothing, so there's nothing to save. 0.01 km and up is saved. */
const MIN_SAVE_METRES = 5;

function Scoreboard() {
  const recorder = useRecorder();
  const navigate = useNavigate();
  const unit = useUnit();
  const now = useNow(1000);
  const [confirming, setConfirming] = useState<'finish' | 'discard' | null>(null);
  // 0.00 km isn't saved (the API doesn't keep it either), so Finish offers to discard instead.
  const tooShort = confirming === 'finish' && recorder.distanceMetres < MIN_SAVE_METRES;
  const recording = recorder.phase === 'recording';
  const finishing = recorder.phase === 'finishing';
  const seconds = movingSeconds(recorder.session, now);
  const pace = formatPace(recorder.distanceMetres, seconds, unit);
  const speed = seconds > 0 && recorder.distanceMetres > 0 ? (recorder.distanceMetres / (unit === 'km' ? 1000 : 1609.344) / (seconds / 3600)).toFixed(1) : null;
  const strength = signalStrength(recorder.accuracy);
  const stale = recorder.lastFixAt !== null && now - recorder.lastFixAt > 20_000;
  const activityName = recorder.session?.activityType ?? 'run';
  const noun = activityName === 'cycle' ? 'ride' : activityName;
  const shownMetres = useCountUp(recorder.distanceMetres, 900);
  const split = useSplitBanner(recorder.distanceMetres, unit, seconds);
  const sheet = useRef<HTMLDivElement | null>(null);
  const [sheetHeight, setSheetHeight] = useState(360);
  useLayoutEffect(() => {
    const element = sheet.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setSheetHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  async function finish() {
    const activity = await recorder.finish();
    if (activity) void navigate({ to: '/activities/$id', params: { id: activity.id }, search: { fresh: true } });
    else setConfirming(null);
  }

  async function discard() {
    if (await recorder.discard()) void navigate({ to: '/run' });
    else setConfirming(null);
  }

  // Recording with a good fix but nothing counted yet: say why, so 0.00 doesn't look broken.
  const startedAt = recorder.session ? new Date(recorder.session.startedAt).getTime() : now;
  const showStillHint = recording && recorder.distanceMetres < 1 && !recorder.steps && now - startedAt > 20_000 && strength >= 2 && !stale;
  const warning = recorder.error ?? recorder.gpsError ?? (stale ? 'GPS signal lost. Keep this screen open and stay outdoors.' : null);
  const placeName = usePlaceName(recorder.position);
  const pill = 'flex h-9 items-center gap-2 rounded-full border-[1.5px] border-ink bg-card/80 px-3.5 text-[13px] font-semibold shadow-hard-sm backdrop-blur-md';

  return (
    <div className="fixed inset-0 z-50 animate-fade bg-paper">
      <RunMap route={recorder.route} position={recorder.position} className="absolute inset-0" bottomInset={sheetHeight} />

      {/* Floating status over the map. */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-4 pt-[max(env(safe-area-inset-top),0.875rem)]">
        <span className={pill}>
          {finishing ? 'Saving…' : <><span className={cx('h-2.5 w-2.5 rounded-full', recording ? 'animate-blink bg-track' : 'bg-warn')} />{recording ? 'Recording' : 'Paused'}</>}
        </span>
        <div className="flex items-center gap-2">
          <span className={pill} title="GPS accuracy">
            <SignalIcon size={15} className={cx(strength >= 3 ? 'text-ok' : strength === 2 ? 'text-warn' : 'text-bad', stale && 'opacity-40')} />
            <span className="num">{recorder.accuracy !== null ? `±${Math.round(recorder.accuracy)} m` : 'GPS'}</span>
            {recorder.connection === 'offline' ? <OfflineIcon size={15} className="text-track" /> : recorder.pendingCount > 0 ? <span className="num text-ink-3">{recorder.pendingCount}↑</span> : null}
          </span>
          <Link to="/dashboard" className={cx(pill, 'w-9 justify-center px-0')} aria-label="Minimise, keep recording">
            <ChevronDownIcon size={18} />
          </Link>
        </div>
      </header>

      {split && <div className="absolute inset-x-0 top-[calc(max(env(safe-area-inset-top),0.875rem)+3.25rem)] z-10 flex justify-center">
        <p key={split.count} className="num animate-pop rounded-full border-2 border-ink bg-ink px-4 py-2 text-[15px] font-semibold text-paper shadow-hard" role="status">
          {split.count} {unit} · {formatDuration(split.seconds)}
        </p>
      </div>}

      {/* Metrics and controls in a sheet, Fitness-style. */}
      <div ref={sheet} className="safe-bottom absolute inset-x-0 bottom-0 z-10 mx-auto max-w-xl rounded-t-[32px] border-t-2 border-ink bg-card/95 px-6 pt-3 backdrop-blur-xl md:bottom-4 md:rounded-[32px] md:border-2 md:pb-5 md:shadow-hard">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/20" aria-hidden="true" />
        <p className="truncate text-[14px] font-semibold text-ink-3">{noun.charAt(0).toUpperCase() + noun.slice(1)}{placeName ? ` in ${placeName}` : ''} · Distance{recorder.distanceFromSteps ? ' from steps' : ''}</p>
        <p className="flex items-baseline gap-2">
          <span className={cx('score num text-[clamp(72px,22vw,104px)] leading-[0.9] transition-colors', recording ? 'text-ink' : 'text-ink-3')}>{formatDistanceNumber(shownMetres, unit)}</span>
          <span className="text-[20px] font-semibold text-ink-3">{unit}</span>
        </p>
        <div className={cx('mt-3 grid divide-x divide-line rounded-2xl border-[1.5px] border-ink bg-paper/60', recorder.steps !== null ? 'grid-cols-3' : 'grid-cols-2')}>
          <Metric label="Time" value={formatDuration(seconds)}  />
          <Metric label={activityName === 'cycle' ? `Speed ${unit}/h` : `Pace /${unit}`} value={activityName === 'cycle' ? speed ?? '–' : pace ?? '–:––'} />
          {recorder.steps !== null && <Metric label="Steps" value={Math.round(recorder.steps).toLocaleString('en-GB')} />}
        </div>
        {(warning || showStillHint) && <p className="mt-3 text-[13px] leading-snug text-track-deep">
          {warning ?? (activityName === 'cycle' ? 'No distance yet. Cycling needs a good outdoor GPS signal.' : 'No distance yet. It counts once GPS sees you move a few metres outdoors.')}
        </p>}

        {confirming ? <div className="mt-5 animate-rise">
          <p className="text-[19px] font-bold tracking-tight">{tooShort ? 'Nothing to save yet' : confirming === 'finish' ? `Finish this ${noun}?` : `Discard this ${noun}?`}</p>
          <p className="mt-1 text-[14px] text-ink-2">{tooShort ? `GPS hasn’t measured any distance for this ${noun} yet. Keep going, or discard it.` : confirming === 'finish' ? `${formatDistance(recorder.distanceMetres, unit)} will be submitted for verification.` : 'Nothing is saved or counted. This can’t be undone.'}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 pb-4">
            <button type="button" className="btn-secondary min-h-14 rounded-full" onClick={() => setConfirming(null)} disabled={finishing}>{confirming === 'finish' ? 'Keep going' : 'Keep it'}</button>
            <button type="button" className={cx('btn min-h-14 rounded-full border-2 border-ink text-paper shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none', confirming === 'finish' && !tooShort ? 'bg-ink' : 'bg-bad')} onClick={() => void (confirming === 'finish' && !tooShort ? finish() : discard())} disabled={finishing}>
              {finishing ? 'Saving…' : confirming === 'finish' && !tooShort ? 'Finish' : 'Discard'}
            </button>
          </div>
        </div> : <div className="mt-5 flex items-start justify-center gap-10 pb-3">
          <RoundControl label="Discard" onClick={() => setConfirming('discard')} disabled={finishing} className="mt-3 h-14 w-14 bg-card text-ink" icon={<CloseIcon size={22} />} />
          {recording
            ? <RoundControl label="Pause" onClick={() => void recorder.pause()} className="h-20 w-20 bg-track text-ink" icon={<PauseIcon size={30} />} />
            : <RoundControl label="Resume" onClick={() => void recorder.resume()} disabled={finishing} className="h-20 w-20 bg-track text-ink" icon={<PlayIcon size={30} className="translate-x-[2px]" />} />}
          <RoundControl label="Finish" onClick={() => setConfirming('finish')} disabled={finishing} className="mt-3 h-14 w-14 bg-ink text-paper" icon={<StopIcon size={20} />} />
        </div>}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-3.5 py-3">
    <p className="truncate text-[12px] font-semibold text-ink-3">{label}</p>
    <p className="score num mt-1 truncate text-[30px] leading-none">{value}</p>
  </div>;
}

function RoundControl({ label, icon, onClick, disabled, className }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return <div className="flex flex-col items-center gap-1.5">
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className={cx('flex items-center justify-center rounded-full border-2 border-ink shadow-hard transition-all duration-150 active:translate-x-[3px] active:translate-y-[3px] active:scale-95 active:shadow-none disabled:opacity-50', className)}>{icon}</button>
    <span className="text-[13px] font-semibold text-ink-2">{label}</span>
  </div>;
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
      <PageHeader eyebrow="Activity session" title={inProgress ? `${run.data.activityType} in progress` : run.data.activityType} back={{ to: '/activities', label: 'Activities' }} />
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
            GPS points are recorded by the device that started the run. You can finish it from here and it’ll be submitted with the{' '}
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
