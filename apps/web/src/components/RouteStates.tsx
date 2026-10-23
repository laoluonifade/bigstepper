import { Link, useRouter, useRouterState, type ErrorComponentProps } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ArrowLeftIcon, HomeIcon } from './icons';
import { cx, Skeleton } from './ui';

/**
 * Shown while a page's code or session loads: the outline of a page rather than a blank screen. It
 * matches the usual layout (title, a hero card, a list) so the real page drops into place.
 */
export function PagePending() {
  return <div className="animate-[fade-in_200ms_ease-out_both]" role="status" aria-live="polite">
    <span className="sr-only">Loading</span>
    <Skeleton className="h-3 w-24" />
    <Skeleton className="mt-3 h-8 w-3/5 max-w-sm" />
    <Skeleton className="mt-6 h-40 rounded-2xl sm:h-48" />
    <div className="mt-6 space-y-3">
      {[0, 1, 2].map((row) => <div key={row} className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className={cx('h-3.5', row === 1 ? 'w-2/3' : 'w-1/2')} />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>)}
    </div>
  </div>;
}

/** A thin bar along the top while the router fetches the next page, so a tap always feels answered. */
export function NavigationProgress() {
  const loading = useRouterState({ select: (state) => state.status === 'pending' || state.isLoading });
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!loading) { setVisible(false); return; }
    // Fast navigations finish before the bar would appear.
    const timer = window.setTimeout(() => setVisible(true), 120);
    return () => window.clearTimeout(timer);
  }, [loading]);
  return <div className={cx('pointer-events-none fixed inset-x-0 top-0 z-[80] h-[3px] overflow-hidden transition-opacity duration-200', visible ? 'opacity-100' : 'opacity-0')} aria-hidden="true">
    <div className="h-full w-1/3 animate-[nav-progress_1.1s_ease-in-out_infinite] rounded-r-full bg-track" />
  </div>;
}

/** After a deploy, an open tab can ask for code that no longer exists. A reload fetches the new version. */
function isStaleChunk(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically imported module|ChunkLoadError|Loading chunk/i.test(message);
}

/** The lanes of a running track bending off the page: the art for both error states. */
function TrackArt({ broken }: { broken?: boolean }) {
  return <svg viewBox="0 0 320 150" className="mx-auto h-auto w-full max-w-[320px]" aria-hidden="true">
    {[0, 1, 2, 3].map((lane) => <path key={lane} d={`M0 ${140 - lane * 18}C90 ${136 - lane * 20} 170 ${108 - lane * 22} 240 ${60 - lane * 14}`}
      fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={broken && lane === 1 ? '10 10' : undefined} className={lane === 1 ? 'text-track' : 'text-ink/15'} />)}
    {broken
      ? <g className="text-ink"><path d="M244 58l22-18m0 0l10 22m-10-22l26 4" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="300" cy="40" r="7" fill="currentColor" /></g>
      : <g className="text-ink"><path d="M262 30h40v26h-40z" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M262 30v70" stroke="currentColor" strokeWidth="3" /><path d="M276 40h12M276 47h8" stroke="currentColor" strokeWidth="3" /></g>}
  </svg>;
}

function Frame({ code, title, body, children, art }: { code: string; title: string; body: string; children: React.ReactNode; art: React.ReactNode }) {
  return <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-2 py-10 text-center">
    {art}
    <p className="score mt-6 text-[clamp(56px,18vw,96px)] leading-none text-ink">{code}</p>
    <h1 className="mt-3 text-[24px] font-extrabold tracking-tight sm:text-[28px]">{title}</h1>
    <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink-2">{body}</p>
    <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">{children}</div>
  </div>;
}

/** Any page that crashed while loading or rendering. Retries in place; stale code reloads once by itself. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const stale = isStaleChunk(error);
  useEffect(() => {
    if (!stale) return;
    try {
      // Reload once for a new version; if that didn't help, show the page instead of looping.
      if (sessionStorage.getItem('jump_chunk_reload') !== window.location.pathname) {
        sessionStorage.setItem('jump_chunk_reload', window.location.pathname);
        window.location.reload();
      }
    } catch { /* storage blocked: the buttons below still work */ }
  }, [stale]);
  const retry = () => { reset(); void router.invalidate(); };
  return <Frame
    code={stale ? 'NEW' : 'OOPS'}
    title={stale ? 'Jump just got an update' : 'We tripped on that one'}
    body={stale ? 'Reload to get the newest version. Your runs and progress are safe.' : 'Something went wrong showing this page. Your runs and progress are safe. Try again, and if it keeps happening, let us know.'}
    art={<TrackArt broken />}
  >
    {stale
      ? <button type="button" className="btn-primary min-h-12 px-8" onClick={() => window.location.reload()}>Reload</button>
      : <button type="button" className="btn-primary min-h-12 px-8" onClick={retry}>Try again</button>}
    <Link to="/" className="btn-secondary min-h-12 px-6"><HomeIcon size={16} /> Home</Link>
    {import.meta.env.DEV && error instanceof Error && <details className="mt-4 w-full text-left text-[12px] text-ink-3 sm:absolute sm:bottom-6 sm:left-1/2 sm:w-[min(90vw,640px)] sm:-translate-x-1/2"><summary className="cursor-pointer font-semibold">Details (development only)</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-ink/[0.05] p-3">{error.stack ?? error.message}</pre></details>}
  </Frame>;
}

/** A link to a page that doesn't exist. */
export function NotFound() {
  return <Frame code="404" title="This page took a wrong turn" body="The link may be old or mistyped. Head back and pick up the route from there." art={<TrackArt />}>
    <button type="button" className="btn-secondary min-h-12 px-6" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/')}><ArrowLeftIcon size={16} /> Go back</button>
    <Link to="/" className="btn-primary min-h-12 px-8"><HomeIcon size={16} /> Home</Link>
  </Frame>;
}
