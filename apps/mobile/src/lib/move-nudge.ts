import type * as BackgroundTaskModule from 'expo-background-task';
import * as Location from 'expo-location';
import type * as NotificationsModule from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { Storage } from './kv';

/**
 * "Out moving? Record it": every so often (iOS decides when, usually every 15 to 30 minutes) the phone
 * looks at the steps it counted in the last ten minutes. A brisk walk's worth, with no run recording,
 * and Jump nudges you with a notification that opens the Run tab. No location, just the motion chip.
 *
 * iPhone only for now: Android keeps no step history to look back on.
 */
const TASK = 'jump-move-nudge';
const RECORDING_TASK = 'jump-track';
const ENABLED_KEY = 'jump_move_nudge';
const LAST_KEY = 'jump_move_nudge_last';
const LOOK_BACK_MS = 10 * 60_000;
const STEPS = 900;
const COOLDOWN_MS = 3 * 60 * 60_000;
const FIRST_HOUR = 6;
const LAST_HOUR = 21;

const load = <T,>(name: string): T | null => {
  try { return require(name) as T; } catch { return null; }
};
// Missing from builds made before this was added: there it all quietly does nothing.
const BackgroundTask = Platform.OS === 'ios' ? load<typeof BackgroundTaskModule>('expo-background-task') : null;
const Notifications = load<typeof NotificationsModule>('expo-notifications');

export const moveNudgeSupported = BackgroundTask !== null;

export function moveNudgeEnabled() {
  try { return Storage.getItemSync(ENABLED_KEY) !== 'off'; } catch { return true; }
}

async function check() {
  if (!moveNudgeEnabled() || !Notifications) return;
  const now = new Date();
  if (now.getHours() < FIRST_HOUR || now.getHours() >= LAST_HOUR) return;
  if (Date.now() - Number(Storage.getItemSync(LAST_KEY) ?? 0) < COOLDOWN_MS) return;
  if (await Location.hasStartedLocationUpdatesAsync(RECORDING_TASK).catch(() => false)) return;
  if (!(await Pedometer.getPermissionsAsync()).granted) return;
  const { steps } = await Pedometer.getStepCountAsync(new Date(Date.now() - LOOK_BACK_MS), now);
  if (steps < STEPS) return;
  Storage.setItemSync(LAST_KEY, String(Date.now()));
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Out moving? 👟', body: `${steps.toLocaleString('en-GB')} steps in the last 10 minutes. Tap to record it so it counts.`, data: { link: '/run' } },
    trigger: null,
  });
}

if (BackgroundTask && !TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask(TASK, async () => {
    try { await check(); } catch { /* try again next time */ }
    return BackgroundTask.BackgroundTaskResult.Success;
  });
}

/** Starts the background check when it's on and Motion & Fitness is allowed; never asks by itself. */
export async function syncMoveNudge() {
  if (!BackgroundTask) return;
  const registered = await TaskManager.isTaskRegisteredAsync(TASK).catch(() => false);
  const wanted = moveNudgeEnabled() && (await Pedometer.getPermissionsAsync().then((permission) => permission.granted).catch(() => false));
  if (wanted && !registered) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 }).catch(() => undefined);
  if (!wanted && registered) await BackgroundTask.unregisterTaskAsync(TASK).catch(() => undefined);
}

/** The setting: turning it on asks for Motion & Fitness if needed. Returns whether it's on. */
export async function setMoveNudge(on: boolean) {
  try { Storage.setItemSync(ENABLED_KEY, on ? 'on' : 'off'); } catch { /* fine */ }
  if (on && !(await Pedometer.getPermissionsAsync()).granted) {
    const asked = await Pedometer.requestPermissionsAsync().catch(() => null);
    if (!asked?.granted) {
      try { Storage.setItemSync(ENABLED_KEY, 'off'); } catch { /* fine */ }
      await syncMoveNudge();
      return false;
    }
  }
  await syncMoveNudge();
  return on;
}
