import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { Linking, Platform } from 'react-native';
import { ask } from './dialog';
import { Storage } from './kv';
import type { ActivityKind } from './recorder';

const SNOOZE_KEY = 'jump_run_readiness_snoozed';
const SNOOZE_MS = 24 * 60 * 60_000;

type Problem = { title: string; message: string; blocking?: boolean };

/**
 * What would stop Jump measuring the whole activity, found before the countdown so it can be fixed first:
 * location off, approximate location (fixes land a few kilometres out), no Motion & Fitness (no steps)
 * and, on iPhone, no "Always" location: with it, iOS reopens Jump to carry on recording even after it's
 * been swiped away. Asks for whatever the phone still lets an app ask for; the rest needs Settings.
 */
async function problems(kind: ActivityKind): Promise<Problem[]> {
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) {
    return [{ blocking: true, title: 'Location Services are off', message: 'Turn on Location Services in Settings so Jump can measure your distance.' }];
  }
  let foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted' && foreground.canAskAgain) foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return [{ blocking: true, title: 'Jump can’t see your location', message: 'Allow location for Jump in Settings so it can measure your distance.' }];
  }
  const found: Problem[] = [];
  if (Platform.OS === 'ios' && foreground.ios?.accuracy === 'reduced') {
    found.push({ title: 'Turn on Precise Location', message: 'With approximate location, Jump can’t measure distance. In Settings → Location, switch on Precise Location.' });
  }
  if (Platform.OS === 'ios') {
    let background = await Location.getBackgroundPermissionsAsync().catch(() => null);
    if (background && background.status !== 'granted' && background.canAskAgain) background = await Location.requestBackgroundPermissionsAsync().catch(() => background);
    if (background && background.status !== 'granted') {
      found.push({ title: 'Set location to “Always”', message: 'So your activity keeps recording even if Jump gets closed, set Location to “Always” in Settings. Jump only uses it while you’re recording.' });
    }
  }
  if (kind !== 'cycle') {
    let motion = await Pedometer.getPermissionsAsync().catch(() => null);
    if (motion && !motion.granted && motion.canAskAgain) motion = await Pedometer.requestPermissionsAsync().catch(() => motion);
    if (motion && !motion.granted) {
      found.push({ title: 'Allow Motion & Fitness', message: 'Jump counts your steps with it. Turn on Motion & Fitness for Jump in Settings.' });
    }
  }
  return found;
}

const snoozedAt = () => { try { return Number(Storage.getItemSync(SNOOZE_KEY) ?? 0); } catch { return 0; } };
/** "Start anyway" quiets the gentle warnings for a day; location being off still stops every start. */
const snooze = () => { try { Storage.setItemSync(SNOOZE_KEY, String(Date.now())); } catch { /* asks again next time */ } };

/** True when it's fine to start: nothing's wrong, or they chose to start anyway. */
export async function readyToRecord(kind: ActivityKind): Promise<boolean> {
  const found = await problems(kind).catch(() => []);
  if (!found.length) return true;
  const blocking = found.some((problem) => problem.blocking);
  if (!blocking && Date.now() - snoozedAt() < SNOOZE_MS) return true;
  const title = found.length === 1 ? found[0].title : 'Before you start';
  const message = found.length === 1 ? found[0].message : found.map((problem) => `• ${problem.title}. ${problem.message}`).join('\n');
  const picked = await ask({ title, message, actions: [{ label: 'Open Settings' }, ...(blocking ? [] : [{ label: 'Start anyway' }])], cancelLabel: 'Not now' });
  if (picked === 0) void Linking.openSettings();
  if (picked === 1) snooze();
  return picked === 1;
}
