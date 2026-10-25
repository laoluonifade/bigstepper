import { formatDistanceNumber, formatPace, formatSpeed } from '@jump/shared/format';
import type { RunSession, Unit } from '@jump/shared/types';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import type { LiveActivity, LiveActivityFactory } from 'expo-widgets';
import type { RunActivityProps } from '@/widgets/RunActivity';

/**
 * The run in progress on the lock screen and in the Dynamic Island, like Strava's. iOS only, and only in
 * a real build: Expo Go and Android don't have the native side, so there everything here does nothing.
 */
const factory: LiveActivityFactory<RunActivityProps> | null = (() => {
  if (Platform.OS !== 'ios' || isRunningInExpoGo()) return null;
  try {
    return (require('@/widgets/RunActivity') as { default: LiveActivityFactory<RunActivityProps> }).default;
  } catch {
    return null; // a build from before Live Activities
  }
})();

let instance: LiveActivity<RunActivityProps> | null = null;
/** The last numbers while recording: the recorder clears its session as it finishes, so the ending uses these. */
let lastActive: LiveRun | null = null;
let lastSentAt = 0;
let lastKey = '';
/** Distance and pace change every fix; the clock ticks by itself. Refresh at most this often. */
const EVERY_MS = 4_000;

const SYMBOL = { run: 'figure.run', walk: 'figure.walk', cycle: 'bicycle' } as const;
const TITLE = { run: 'Run', walk: 'Walk', cycle: 'Ride' } as const;

export type LiveRun = {
  phase: string;
  session: RunSession | null;
  metres: number;
  movingSeconds: number;
  unit: Unit;
};

function propsFor(run: LiveRun, finished = false): RunActivityProps | null {
  const session = run.session;
  if (!session) return null;
  const now = Date.now();
  const cycling = session.activityType === 'cycle';
  const paused = run.phase === 'paused' || Boolean(session.pausedAt);
  return {
    title: TITLE[session.activityType],
    symbol: SYMBOL[session.activityType],
    distance: formatDistanceNumber(run.metres, run.unit),
    unit: run.unit,
    pace: (cycling ? formatSpeed(run.metres, run.movingSeconds, run.unit)?.split(' ')[0] : formatPace(run.metres, run.movingSeconds, run.unit)?.split(' ')[0]) ?? '–',
    paceUnit: cycling ? (run.unit === 'km' ? 'km/h' : 'mph') : `/${run.unit}`,
    timerStart: now - run.movingSeconds * 1000,
    pausedAt: paused || finished ? now : null,
    finished,
  };
}

/**
 * Keep the Live Activity in step with the recorder: start it when recording begins (or pick up the
 * one already showing after the app restarted), refresh it as distance grows or on pause and resume,
 * and end it, leaving the final numbers up for a few minutes, when the activity finishes.
 */
export function syncLiveActivity(run: LiveRun) {
  if (!factory) return;
  try {
    const active = run.phase === 'recording' || run.phase === 'paused' || run.phase === 'locating';
    if (active && run.session) {
      const props = propsFor(run);
      if (!props) return;
      lastActive = run;
      instance ??= factory.getInstances()[0] ?? null;
      if (!instance) {
        instance = factory.start(props, 'jump://run');
        lastSentAt = Date.now();
        lastKey = `${props.pausedAt ? 'p' : 'r'}`;
        return;
      }
      // Pause and resume go out at once; distance at most every few seconds.
      const key = `${props.pausedAt ? 'p' : 'r'}`;
      if (key === lastKey && Date.now() - lastSentAt < EVERY_MS) return;
      lastKey = key;
      lastSentAt = Date.now();
      void instance.update(props).catch(() => undefined);
      return;
    }
    if (run.phase === 'finishing') return;
    // Idle again: finished or discarded. Show the final numbers briefly, then go.
    const ending = instance ?? factory.getInstances()[0] ?? null;
    if (!ending) return;
    instance = null;
    const last = lastActive ? propsFor(lastActive, true) : null;
    lastActive = null;
    // `after(date)` from expo-widgets, written out: importing it would load the native module in Expo Go.
    void ending.end({ after: new Date(Date.now() + 5 * 60_000) } as never, last ?? undefined).catch(() => undefined);
  } catch { /* the lock screen is a nicety: never let it break recording */ }
}
