import { MouseEvent, ReactNode, useEffect, useState } from 'react';

/**
 * A few pages don't need a router library: the path and query live in the address bar, links push
 * history. (The runner app's TanStack router is typed for its own routes.)
 */
export function useLocation() {
  const read = () => ({ path: window.location.pathname.replace(/\/+$/, '') || '/', search: new URLSearchParams(window.location.search) });
  const [location, setLocation] = useState(read);
  useEffect(() => {
    const update = () => setLocation(read());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return location;
}

export function navigate(to: string, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

export function AdminLink({ to, className, children, ...rest }: { to: string; className?: string; children: ReactNode; 'aria-current'?: 'page' }) {
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  }
  return <a href={to} onClick={open} className={className} {...rest}>{children}</a>;
}

/** A page in the runner app, opened in a new tab. */
export function AppLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer noopener" className={className}>{children}</a>;
}
