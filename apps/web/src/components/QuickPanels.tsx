import { Link, useLocation } from '@tanstack/react-router';
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellIcon } from './icons';
import { ErrorNotice, Skeleton } from './ui';
import { formatRelative } from '../lib/format';
import { useNotifications, useOpenNotification } from '../lib/queries';

const QuickPanelsContext = createContext<{ toggleNotifications: (anchor: HTMLElement) => void } | null>(null);

export function useQuickPanels() {
  const context = useContext(QuickPanelsContext);
  if (!context) throw new Error('Quick panels must be used inside the signed-in shell');
  return context;
}

export function QuickPanelsProvider({ children }: { children: ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const location = useLocation();
  useEffect(() => setAnchor(null), [location.pathname]);
  return <QuickPanelsContext.Provider value={{ toggleNotifications: (button) => setAnchor((current) => current === button ? null : button) }}>
    {children}
    {anchor && <NotificationsPopover anchor={anchor} onClose={() => setAnchor(null)} />}
  </QuickPanelsContext.Provider>;
}

function NotificationsPopover({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const panel = useRef<HTMLDivElement | null>(null);
  const notifications = useNotifications();
  const { open } = useOpenNotification();
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!panel.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose();
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { onClose(); anchor.focus(); } }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 16);
  const desktopRail = window.innerWidth >= 768 && rect.right < 300;
  const left = desktopRail ? rect.right + 8 : Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
  const top = desktopRail ? Math.max(8, Math.min(rect.top, window.innerHeight - 280)) : rect.bottom + 8;
  return createPortal(<div ref={panel} className="fixed z-50 max-h-[min(32rem,calc(100dvh-5rem))] overflow-y-auto rounded-2xl border-2 border-ink bg-card p-3 shadow-hard" style={{ left, top, width }}>
    <div className="mb-2 flex items-center justify-between gap-2"><h2 className="eyebrow">Notifications</h2><Link to="/notifications" onClick={onClose} className="text-[12px] font-bold underline">View all</Link></div>
    <ErrorNotice error={notifications.error} onRetry={() => void notifications.refetch()} />
    {notifications.isLoading ? <Skeleton className="h-24" /> : !notifications.data?.length ? <p className="py-6 text-center text-[13px] text-ink-3">All quiet for now.</p> : <ul className="divide-y divide-line">
      {notifications.data.slice(0, 6).map((item) => <li key={item.id}><button type="button" onClick={() => { open(item); onClose(); }} className="flex w-full gap-2.5 rounded-xl px-2 py-2.5 text-left hover:bg-paper"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? 'bg-line' : 'bg-track'}`} /><span className="min-w-0"><span className="block text-[13px] font-bold">{item.title}</span><span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-ink-2">{item.body}</span><span className="mt-1 block text-[11px] text-ink-3">{formatRelative(item.createdAt)}</span></span></button></li>)}
    </ul>}
    {notifications.data && notifications.data.length > 6 && <Link to="/notifications" onClick={onClose} className="mt-2 flex items-center justify-center gap-1 rounded-xl py-2 text-[12px] font-bold hover:bg-paper"><BellIcon size={14} /> See all notifications</Link>}
  </div>, document.body);
}
