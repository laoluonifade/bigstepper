import { dismissToast, useToasts, type ToastTone } from './toast';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons';
import { cx } from './ui';

const TONE: Record<ToastTone, { icon: JSX.Element; mark: string }> = {
  bad: { icon: <AlertIcon size={16} />, mark: 'bg-bad text-paper' },
  warn: { icon: <AlertIcon size={16} />, mark: 'bg-warn text-paper' },
  ok: { icon: <CheckIcon size={16} />, mark: 'bg-ok text-paper' },
  info: { icon: <InfoIcon size={16} />, mark: 'bg-ink text-volt' },
};

/** Toasts slide in at the top, above everything, and leave on their own. */
export function Toaster() {
  const toasts = useToasts();
  return <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-[70] flex flex-col items-center gap-2 px-3" aria-live="polite" aria-relevant="additions">
    {toasts.map((item) => <div key={item.id} role={item.tone === 'bad' ? 'alert' : 'status'} className="pointer-events-auto flex w-full max-w-md animate-rise items-center gap-3 rounded-md border-2 border-ink bg-card py-2.5 pl-2.5 pr-2 shadow-hard">
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px]', TONE[item.tone].mark)}>{TONE[item.tone].icon}</span>
      <p className="min-w-0 flex-1 text-[14px] leading-snug">
        {item.title && <span className="block font-bold">{item.title}</span>}
        <span className={item.title ? 'text-ink-2' : undefined}>{item.message}</span>
      </p>
      {item.action && <button type="button" className="wide shrink-0 rounded-[5px] border-[1.5px] border-ink px-2.5 py-1 text-[11px] font-extrabold uppercase hover:bg-volt" onClick={() => { item.action!.run(); dismissToast(item.id); }}>{item.action.label}</button>}
      <button type="button" className="shrink-0 rounded p-1 text-ink-3 hover:text-ink" onClick={() => dismissToast(item.id)} aria-label="Dismiss"><CloseIcon size={16} /></button>
    </div>)}
  </div>;
}
