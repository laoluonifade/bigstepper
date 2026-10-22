import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';

/** A sheet from the bottom on phones, a centred dialog on larger screens. Escape or the backdrop closes it. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', escape);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
    <div className="absolute inset-0 animate-fade bg-ink/50" onClick={onClose} />
    <div className="safe-bottom relative max-h-[90vh] w-full max-w-md animate-sheet-up overflow-y-auto rounded-t-2xl border-t-2 border-ink bg-card px-5 pb-5 pt-3 sm:animate-pop sm:rounded-xl sm:border-2 sm:shadow-hard">
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="wide text-[16px] font-extrabold uppercase">{title}</h2>
        <button type="button" className="rounded-md p-1.5 hover:bg-ink/[0.06]" aria-label="Close" onClick={onClose}><CloseIcon size={18} /></button>
      </div>
      {children}
    </div>
  </div>, document.body);
}
