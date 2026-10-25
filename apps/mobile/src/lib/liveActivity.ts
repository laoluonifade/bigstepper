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
/** Set once the activities left from before an app restart have been looked at. */
let adopted = false;
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
      if (!instance && !adopted) {
        // After a restart, carry on with the one already showing instead of starting a second, and clear any extras.
        adopted = true;
        const [first, ...extra] = factory.getInstances();
        instance = first ?? null;
        for (const leftover of extra) void leftover.end('immediate').catch(() => undefined);
      }
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
    // Only a run that's really over ends it. Restoring after a restart, or a blocked or unavailable
    // recorder, passes through here too: ending then left a stale card ticking and started a second one.
    if (run.phase !== 'idle' && run.phase !== 'saved') return;
    adopted = true;
    const endings = instance ? [instance] : factory.getInstances();
    if (!endings.length) return;
    instance = null;
    const last = lastActive ? propsFor(lastActive, true) : null;
    lastActive = null;
    for (const ending of endings) {
      // With the final numbers, leave them up for a few minutes; without them (the app restarted), just go.
      // `after(date)` from expo-widgets, written out: importing it would load the native module in Expo Go.
      void ending.end(last ? { after: new Date(Date.now() + 5 * 60_000) } as never : 'immediate', last ?? undefined).catch(() => undefined);
    }
  } catch { /* the lock screen is a nicety: never let it break recording */ }
}

/**
 * Pause and Resume pressed on the lock screen or in the Dynamic Island. The press runs in the app (the
 * recording keeps it alive in the background), and the recorder's change updates the activity.
 */
export function onLiveActivityControl(handlers: { pause: () => void; resume: () => void }) {
  if (!factory) return;
  try {
    const { addUserInteractionListener } = require('expo-widgets') as typeof import('expo-widgets');
    addUserInteractionListener((event) => {
      if (event.source !== 'RunActivity') return;
      if (event.target === 'pause') handlers.pause();
      else if (event.target === 'resume') handlers.resume();
    });
  } catch { /* a build without widgets */ }
}
