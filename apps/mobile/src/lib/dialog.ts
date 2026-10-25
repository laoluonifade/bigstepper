import { useSyncExternalStore } from 'react';

export type DialogAction = { label: string; style?: 'default' | 'destructive' };
export type Dialog = { id: number; title: string; message?: string; actions: DialogAction[]; cancelLabel: string; resolve: (index: number | null) => void };

let current: Dialog | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/**
 * Asks in Jump's own sheet instead of the system alert, which looks out of place on Android. Resolves
 * with the index of the action picked, or null if they cancelled or dismissed it.
 */
export function ask(input: { title: string; message?: string; actions: DialogAction[]; cancelLabel?: string }): Promise<number | null> {
  current?.resolve(null);
  return new Promise((resolve) => {
    current = { id: nextId++, cancelLabel: 'Cancel', ...input, resolve };
    emit();
  });
}

/** A yes/no question: true when they pick the action. */
export async function confirm(input: { title: string; message?: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean }) {
  const picked = await ask({ title: input.title, message: input.message, cancelLabel: input.cancelLabel, actions: [{ label: input.confirmLabel, style: input.destructive ? 'destructive' : 'default' }] });
  return picked === 0;
}

export function settleDialog(index: number | null) {
  const dialog = current;
  current = null;
  emit();
  dialog?.resolve(index);
}

export function useDialog() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
