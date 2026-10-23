import { ReactNode } from 'react';
import { Drawer } from 'vaul';
import { ChevronRightIcon, CloseIcon } from './icons';
import { cx } from './ui';

/**
 * A bottom sheet you can drag down to close (vaul). For long settings that would otherwise make a form
 * scroll on and on: the form keeps a one-line summary, the detail lives here. The footer stays pinned.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  return <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/50" />
      <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-lg flex-col rounded-t-[22px] border-t-2 border-ink bg-card outline-none sm:border-x-2" aria-describedby={undefined}>
        <div className="mx-auto mb-1 mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-ink/15" aria-hidden="true" />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-2">
          <div className="min-w-0">
            <Drawer.Title className="wide text-[17px] font-extrabold uppercase">{title}</Drawer.Title>
            {description && <Drawer.Description className="mt-0.5 text-[13px] leading-snug text-ink-2">{description}</Drawer.Description>}
          </div>
          <button type="button" className="-mr-1.5 rounded-md p-1.5 text-ink-2 hover:bg-ink/[0.06] hover:text-ink" aria-label="Close" onClick={() => onOpenChange(false)}><CloseIcon size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-line bg-card px-5 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">{footer}</div>}
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>;
}

/** One line in a form that opens a sheet: what it is, what's set now, and any problem to fix. */
export function SheetRow({ title, summary, onOpen, error, tone = 'default' }: { title: string; summary: ReactNode; onOpen: () => void; error?: string; tone?: 'default' | 'on' }) {
  return <button type="button" onClick={onOpen}
    className={cx('flex w-full items-center gap-3 rounded-2xl border-[1.5px] p-4 text-left transition-shadow hover:shadow-hard-sm', error ? 'border-bad bg-bad-wash/40' : 'border-ink', tone === 'on' && !error ? 'bg-volt/40' : !error && 'bg-card')}>
    <span className="min-w-0 flex-1">
      <span className="wide block text-[13px] font-extrabold uppercase">{title}</span>
      <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">{summary}</span>
      {error && <span className="mt-1 block text-[12.5px] font-semibold text-bad">{error}</span>}
    </span>
    <ChevronRightIcon size={18} className="shrink-0 text-ink-3" />
  </button>;
}
