import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { Storage } from './kv';

/** Jump's short UI sounds (synthesised tones in assets/sounds). */
const SOURCES = {
  /** Each beat of the 3, 2, 1. */
  tick: require('../../assets/sounds/tick.wav'),
  /** The activity starts. */
  go: require('../../assets/sounds/go.wav'),
  /** Another whole km or mile. */
  split: require('../../assets/sounds/split.wav'),
  /** An activity saved. */
  finish: require('../../assets/sounds/finish.wav'),
  /** A message on its way. */
  send: require('../../assets/sounds/send.wav'),
} as const;

export type Sound = keyof typeof SOURCES;

const SOUNDS_KEY = 'jump_sounds';
const players = new Map<Sound, AudioPlayer>();
const listeners = new Set<() => void>();
let enabled = (() => {
  try { return Storage.getItemSync(SOUNDS_KEY) !== 'off'; } catch { return true; }
})();
let ready = false;

/**
 * Sounds mix with whatever's playing (your music keeps going, just ducked for a beat on iOS) and respect
 * the silent switch. Set once; voice notes switch recording on and off around themselves.
 */
async function prepare() {
  if (ready) return;
  ready = true;
  await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
}

export function playSound(name: Sound) {
  if (!enabled) return;
  void prepare();
  try {
    let player = players.get(name);
    if (!player) {
      player = createAudioPlayer(SOURCES[name]);
      player.volume = 0.8;
      players.set(name, player);
    }
    void player.seekTo(0);
    player.play();
  } catch { /* a sound is never worth an error */ }
}

export function setSoundsEnabled(next: boolean) {
  enabled = next;
  try { Storage.setItemSync(SOUNDS_KEY, next ? 'on' : 'off'); } catch { /* stays on for this session */ }
  listeners.forEach((listener) => listener());
}

/** Whether sounds are on, for the switch in Settings. */
export function useSoundsEnabled() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => enabled);
}
