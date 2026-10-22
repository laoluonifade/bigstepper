import { useCallback, useEffect, useRef, useState } from 'react';

export const VOICE_NOTE_MAX_SECONDS = 120;

/** Formats the browser can record that Cloudinary can turn into MP3. */
function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export type VoiceRecording = { blob: Blob; seconds: number; mimeType: string };

/** Microphone recording for voice notes; stops itself at two minutes. */
export function useVoiceRecorder(onAutoStop: (recording: VoiceRecording) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const resolveStop = useRef<((recording: VoiceRecording | null) => void) | null>(null);
  const discard = useRef(false);
  const autoStop = useRef(onAutoStop);
  autoStop.current = onAutoStop;

  const cleanup = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    setRecording(false);
  }, []);

  useEffect(() => () => { discard.current = true; if (recorder.current?.state === 'recording') recorder.current.stop(); cleanup(); }, [cleanup]);

  const stop = useCallback((keep = true) => new Promise<VoiceRecording | null>((resolve) => {
    const active = recorder.current;
    if (!active || active.state !== 'recording') return resolve(null);
    discard.current = !keep;
    resolveStop.current = resolve;
    active.stop();
  }), []);

  const start = useCallback(async () => {
    setError(null);
    const mimeType = pickMimeType();
    if (mimeType === null || !navigator.mediaDevices?.getUserMedia) {
      setError('Voice notes aren’t supported in this browser.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Allow microphone access to send voice notes.');
      return;
    }
    const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    discard.current = false;
    media.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
    media.onstop = () => {
      const elapsed = Math.max(1, Math.min(VOICE_NOTE_MAX_SECONDS, Math.round((Date.now() - startedAt.current) / 1000)));
      const type = media.mimeType || mimeType || 'audio/webm';
      const result = discard.current ? null : { blob: new Blob(chunks.current, { type }), seconds: elapsed, mimeType: type };
      cleanup();
      if (resolveStop.current) {
        resolveStop.current(result);
        resolveStop.current = null;
      } else if (result) {
        autoStop.current(result);
      }
    };
    recorder.current = media;
    startedAt.current = Date.now();
    setSeconds(0);
    setRecording(true);
    media.start(250);
    timer.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= VOICE_NOTE_MAX_SECONDS && media.state === 'recording') media.stop();
    }, 250);
  }, [cleanup]);

  return { recording, seconds, error, start, stop, clearError: () => setError(null) };
}

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
