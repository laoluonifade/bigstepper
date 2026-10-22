import { ReactNode, RefObject, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/** Keeps a small picker above other content without changing the surrounding layout. */
export function EmojiPopover({ anchor, label, width, height, onClose, children, bare = false }: { anchor: RefObject<HTMLElement>; label: string; width: number; height: number; onClose: () => void; children: ReactNode; bare?: boolean }) {
  const panel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) onClose();
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    // Scrolling the page moves the anchor away, so close; scrolling a list inside the panel must not.
    function scrolled(event: Event) { if (!panel.current?.contains(event.target as Node)) onClose(); }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);
  const rect = anchor.current?.getBoundingClientRect();
  if (!rect) return null;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(rect.top >= height + 16 ? rect.top - height - 8 : rect.bottom + 8, window.innerHeight - height - 8));
  return createPortal(<div ref={panel} role="group" aria-label={label} className={bare ? 'fixed z-50 animate-pop' : 'fixed z-50 animate-pop rounded-2xl border border-line/70 bg-card p-1.5 shadow-[0_12px_40px_-12px_rgba(18,18,18,0.35)]'} style={{ left, top, width }}>{children}</div>, document.body);
}
