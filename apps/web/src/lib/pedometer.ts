/**
 * Step counting from the phone's accelerometer (what Apple Fitness uses indoors, where GPS can't see
 * movement). Steps only count once there's a walking rhythm, so bumps and one-off jolts don't.
 */

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * iOS asks the user before a page can read motion; it must be called straight from a tap, before any
 * `await`. Other browsers allow it without asking. Resolves false if motion isn't available.
 */
export function requestMotionPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return Promise.resolve(false);
  const ctor = window.DeviceMotionEvent as unknown as MotionPermission;
  if (typeof ctor.requestPermission === 'function') {
    return ctor.requestPermission().then((state) => state === 'granted').catch(() => false);
  }
  return Promise.resolve(true);
}

const MIN_STEP_MS = 250; // 4 steps/s: faster than any walk or run cadence
const MAX_STEP_MS = 2000; // slower than this isn't one continuous walk
const RHYTHM_STEPS = 4; // steps needed in a row before any of them count
const HIGH = 1.1; // m/s² above the gravity baseline: a footfall
const LOW = 0.3; // must drop back below this before the next footfall

export interface Pedometer {
  stop: () => void;
}

/** Starts counting; `onSteps` gets each newly confirmed batch of steps (1 at a time once walking). */
export function startPedometer(onSteps: (added: number) => void): Pedometer {
  let gravity = 9.81;
  let smooth = 0;
  let armed = true;
  let lastStepAt = 0;
  let pending = 0; // steps in the current rhythm, not yet confirmed
  let walking = false;

  const onMotion = (event: DeviceMotionEvent) => {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    gravity = gravity * 0.9 + magnitude * 0.1; // slow baseline
    smooth = smooth * 0.5 + (magnitude - gravity) * 0.5; // light smoothing of the bounce
    const now = event.timeStamp || performance.now();

    if (lastStepAt && now - lastStepAt > MAX_STEP_MS) {
      pending = 0; // rhythm broken
      walking = false;
    }
    if (armed && smooth > HIGH) {
      armed = false;
      const gap = now - lastStepAt;
      if (!lastStepAt || gap >= MIN_STEP_MS) {
        lastStepAt = now;
        if (walking) {
          onSteps(1);
        } else {
          pending += 1;
          if (pending >= RHYTHM_STEPS) {
            walking = true;
            onSteps(pending);
            pending = 0;
          }
        }
      }
    } else if (!armed && smooth < LOW) {
      armed = true;
    }
  };

  window.addEventListener('devicemotion', onMotion);
  return { stop: () => window.removeEventListener('devicemotion', onMotion) };
}
