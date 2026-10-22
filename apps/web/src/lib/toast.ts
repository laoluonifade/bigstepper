import { useSyncExternalStore } from 'react';

export type ToastTone = 'bad' | 'warn' | 'ok' | 'info';
export type Toast = { id: number; tone: ToastTone; title?: string; message: string; action?: { label: string; run: () => void } };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function dismissToast(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

/** Shows a toast for a few seconds. The same message again replaces the old one instead of stacking. */
export function toast(input: Omit<Toast, 'id'>) {
  const id = nextId++;
  toasts = [...toasts.filter((existing) => existing.message !== input.message), { ...input, id }].slice(-3);
  emit();
  window.setTimeout(() => dismissToast(id), input.action ? 7000 : input.tone === 'bad' ? 5500 : 4000);
  return id;
}

export function useToasts() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => toasts,
  );
}
