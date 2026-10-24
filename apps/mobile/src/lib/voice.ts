import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

export const VOICE_NOTE_MAX_SECONDS = 120;

/** A finished voice note on this phone: AAC in an .m4a file, which the API converts like the web's. */
export type VoiceRecording = { uri: string; seconds: number; mimeType: string };

/** Microphone recording for voice notes, the same contract as the web's; stops itself at two minutes. */
export function useVoiceRecorder(onAutoStop: (recording: VoiceRecording) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStop = useRef(onAutoStop);
  autoStop.current = onAutoStop;

  const finish = useCallback(async (keep: boolean): Promise<VoiceRecording | null> => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (!recorder.isRecording) {
      setRecording(false);
      return null;
    }
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    setRecording(false);
    const elapsed = Math.max(1, Math.min(VOICE_NOTE_MAX_SECONDS, Math.round((Date.now() - startedAt.current) / 1000)));
    return keep && recorder.uri ? { uri: recorder.uri, seconds: elapsed, mimeType: 'audio/mp4' } : null;
  }, [recorder]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const start = useCallback(async () => {
    setError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Allow microphone access in Settings to send voice notes.');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setError('Couldn’t start recording. Try again.');
      return;
    }
    startedAt.current = Date.now();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= VOICE_NOTE_MAX_SECONDS) void finish(true).then((result) => result && autoStop.current(result));
    }, 250);
  }, [finish, recorder]);

  return { recording, seconds, error, start, stop: finish, clearError: () => setError(null) };
}

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
