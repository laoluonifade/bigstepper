import { ReactNode, useCallback, useState } from 'react';
import { Modal } from './Modal';
import { cx } from './ui';

export interface ConfirmRequest {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  /** Red confirm button, for things like leaving or removing. */
  danger?: boolean;
  onConfirm: () => void;
}

/** An in-app "are you sure?" (never the browser's confirm box). */
export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onClose }: ConfirmRequest & { onClose: () => void }) {
  return <Modal title={title} onClose={onClose}>
    {body && <div className="text-[14px] leading-relaxed text-ink-2">{body}</div>}
    <div className="mt-5 grid grid-cols-2 gap-2">
      <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
      <button type="button" autoFocus className={cx('btn', danger ? 'border-[1.5px] border-ink bg-bad text-paper hover:brightness-95' : 'btn-primary')} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
    </div>
  </Modal>;
}

/** `ask({...})` opens a confirm dialog; render `dialog` somewhere in the component. */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const ask = useCallback((next: ConfirmRequest) => setRequest(next), []);
  const dialog = request ? <ConfirmDialog {...request} onClose={() => setRequest(null)} /> : null;
  return { dialog, ask };
}
