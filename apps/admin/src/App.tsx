import { useQuery } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { api } from './api';
import { useAdmin, useAdminAuth } from './auth';
import { ActivityIcon, CheckIcon, CloseIcon, FlagIcon, HomeIcon, LogoutIcon, MoreIcon, ShieldIcon, TableIcon, TicketIcon, UsersIcon, WalletIcon } from './icons';
import { AdminLogin } from './Login';
import { ClubsPage } from './pages/Clubs';
import { AdminEventsPage } from './pages/Events';
import { AdminChallengesPage } from './pages/Competitions';
import { AdminCreatorsPage } from './pages/Creators';
import { OverviewPage } from './pages/Overview';
import { AdminPayoutsPage } from './pages/Payouts';
import { AdminPeoplePage } from './pages/People';
import { ReportsPage } from './pages/Reports';
import { ReviewsPage } from './pages/Reviews';
import { RiskPage } from './pages/Risk';
import { AdminLink, useLocation } from './router';
import { cx, Loading } from './ui';

type Section = {
  path: string; label: string; short?: string; icon: (size: number) => ReactNode; page: () => ReactNode; adminOnly: boolean;
  /** Shown in the phone's bottom bar; the rest live under More. */
  primary?: boolean;
};

const SECTIONS: Section[] = [
  { path: '/', label: 'Overview', icon: (size) => <HomeIcon size={size} />, page: () => <OverviewPage />, adminOnly: true, primary: true },
  { path: '/payouts', label: 'Payouts', icon: (size) => <WalletIcon size={size} />, page: () => <AdminPayoutsPage />, adminOnly: true, primary: true },
  { path: '/risk', label: 'Risk', icon: (size) => <FlagIcon size={size} />, page: () => <RiskPage />, adminOnly: true, primary: true },
  { path: '/people', label: 'People', icon: (size) => <UsersIcon size={size} />, page: () => <AdminPeoplePage />, adminOnly: true, primary: true },
  { path: '/reports', label: 'Reports', icon: (size) => <FlagIcon size={size} />, page: () => <ReportsPage />, adminOnly: false },
  { path: '/reviews', label: 'Activity reviews', short: 'Reviews', icon: (size) => <ActivityIcon size={size} />, page: () => <ReviewsPage />, adminOnly: false },
  { path: '/competitions', label: 'Paid competitions', short: 'Competitions', icon: (size) => <TableIcon size={size} />, page: () => <AdminChallengesPage />, adminOnly: true },
  { path: '/creators', label: 'Creators', icon: (size) => <ShieldIcon size={size} />, page: () => <AdminCreatorsPage />, adminOnly: true },
  { path: '/clubs', label: 'Clubs', icon: (size) => <CheckIcon size={size} />, page: () => <ClubsPage />, adminOnly: true },
  { path: '/events', label: 'Events', icon: (size) => <TicketIcon size={size} />, page: () => <AdminEventsPage />, adminOnly: true },
];

export function AdminApp() {
  const { status } = useAdminAuth();
  if (status === 'loading') return <div className="flex min-h-screen items-center justify-center"><Loading label="Checking your session" /></div>;
  if (status === 'signed-out') return <AdminLogin />;
  return <Console />;
}

/**
 * What's waiting in each section. The query keys match the pages', so the badges and the lists share
 * one fetch.
 */
function useWaiting(isAdmin: boolean): Record<string, number> {
  const every = { refetchInterval: 60_000, staleTime: 30_000 };
  const payouts = useQuery({ queryKey: ['admin-payouts', 'pending'], queryFn: () => api<unknown[]>('/admin/payouts?view=pending'), enabled: isAdmin, ...every });
  const risk = useQuery({ queryKey: ['risk', 'overview'], queryFn: () => api<{ openFlags: number; escalated: number }>('/admin/risk/overview'), enabled: isAdmin, ...every });
  const reviews = useQuery({ queryKey: ['admin', 'reviews'], queryFn: () => api<unknown[]>('/admin/verification/reviews'), ...every });
  const creators = useQuery({ queryKey: ['admin-creators', 'pending'], queryFn: () => api<unknown[]>('/admin/creators?view=pending'), enabled: isAdmin, ...every });
  const competitions = useQuery({ queryKey: ['admin-paid-challenges', 'pending'], queryFn: () => api<unknown[]>('/admin/tables/paid-drafts?view=pending'), enabled: isAdmin, ...every });
  return {
    '/payouts': payouts.data?.length ?? 0,
    '/risk': (risk.data?.openFlags ?? 0) + (risk.data?.escalated ?? 0),
    '/reviews': reviews.data?.length ?? 0,
    '/creators': creators.data?.length ?? 0,
    '/competitions': competitions.data?.length ?? 0,
  };
}

function Badge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return <span className={cx('num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-track px-1 text-[10.5px] font-extrabold leading-none text-white', className)}>
    {count > 99 ? '99+' : count}
  </span>;
}

function Console() {
  const admin = useAdmin();
  const { signOut } = useAdminAuth();
  const { path } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  // Compliance staff see the review queue only; everything else is for admins.
  const sections = SECTIONS.filter((section) => admin.role === 'admin' || !section.adminOnly);
  const current = sections.find((section) => section.path === path) ?? sections[0];
  const waiting = useWaiting(admin.role === 'admin');
  // With five sections or fewer every one fits in the bottom bar; otherwise the rest go under More.
  const bar = sections.length <= 5 ? sections : sections.filter((section) => section.primary);
  const rest = sections.filter((section) => !bar.includes(section));
  const restWaiting = rest.reduce((sum, section) => sum + (waiting[section.path] ?? 0), 0);

  useEffect(() => { setMoreOpen(false); }, [path]);

  return <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
    {/* Desktop: the sidebar. */}
    <aside className="hidden bg-[#121212] text-paper lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <p className="px-5 py-5 text-[20px] font-black italic tracking-tight text-track">JUMP <span className="not-italic text-paper">admin</span></p>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Admin">
        {sections.map((section) => <AdminLink key={section.path} to={section.path} aria-current={section === current ? 'page' : undefined}
          className={cx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-semibold transition-colors', section === current ? 'bg-paper text-ink' : 'text-paper/70 hover:bg-paper/10 hover:text-paper')}>
          {section.icon(18)}<span className="flex-1">{section.label}</span><Badge count={waiting[section.path] ?? 0} />
        </AdminLink>)}
      </nav>
      <Account name={admin.displayName} email={admin.email} role={admin.role} onSignOut={() => void signOut()} className="border-t border-paper/10 px-5 py-4" />
    </aside>

    {/* Phone and tablet: a slim header with the section's name. */}
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-[#121212] px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] text-paper lg:hidden">
      <p className="text-[17px] font-black italic tracking-tight text-track">JUMP</p>
      <p className="min-w-0 flex-1 truncate text-[15px] font-bold">{current.label}</p>
    </header>

    <main className="mx-auto w-full min-w-0 max-w-5xl px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5 lg:px-8 lg:py-8">{current.page()}</main>

    {/* Phone and tablet: the sections people use most, a thumb away. */}
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Admin">
      <div className="mx-auto flex max-w-lg">
        {bar.map((section) => <AdminLink key={section.path} to={section.path} aria-current={section === current ? 'page' : undefined}
          className={cx('relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold', section === current ? 'text-ink' : 'text-ink-3')}>
          <span className="relative">{section.icon(22)}<Badge count={waiting[section.path] ?? 0} className="absolute -right-3 -top-1.5" /></span>
          {section.short ?? section.label}
          {section === current && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-track" aria-hidden="true" />}
        </AdminLink>)}
        {rest.length > 0 && <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}
          className={cx('relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold', rest.includes(current) ? 'text-ink' : 'text-ink-3')}>
          <span className="relative"><MoreIcon size={22} /><Badge count={restWaiting} className="absolute -right-3 -top-1.5" /></span>
          More
          {rest.includes(current) && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-track" aria-hidden="true" />}
        </button>}
      </div>
    </nav>

    {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)}>
      <ul className="divide-y divide-line">
        {rest.map((section) => <li key={section.path}>
          <AdminLink to={section.path} aria-current={section === current ? 'page' : undefined}
            className={cx('flex min-h-14 items-center gap-3 px-1 text-[15px] font-semibold', section === current ? 'text-ink' : 'text-ink-2')}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink/[0.06] text-ink">{section.icon(18)}</span>
            <span className="flex-1">{section.label}</span>
            <Badge count={waiting[section.path] ?? 0} />
          </AdminLink>
        </li>)}
      </ul>
      <Account name={admin.displayName} email={admin.email} role={admin.role} onSignOut={() => void signOut()} className="mt-3 border-t border-line pt-4 text-ink" muted="text-ink-3" />
    </MoreSheet>}
  </div>;
}

/** A sheet that rises from the bottom; tap outside, the close button or Escape closes it. */
function MoreSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More sections">
    <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close" onClick={onClose} />
    <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-card px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2 shadow-hard animate-rise">
      <span className="mx-auto mb-1 block h-1 w-10 rounded-full bg-ink/15" aria-hidden="true" />
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.08em]">More</p>
        <button type="button" className="-mr-2 rounded p-2 text-ink-3 hover:text-ink" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
      </div>
      {children}
    </div>
  </div>;
}

function Account({ name, email, role, onSignOut, className, muted = 'text-paper/60' }: { name: string; email: string; role: string; onSignOut: () => void; className?: string; muted?: string }) {
  return <div className={className}>
    <p className="truncate text-[13px] font-semibold">{name}</p>
    <p className={cx('truncate text-[12px]', muted)}>{email} · {role}</p>
    <button type="button" onClick={onSignOut} className={cx('mt-2 inline-flex min-h-9 items-center gap-1.5 text-[12px] font-semibold hover:underline', muted)}><LogoutIcon size={14} /> Sign out</button>
  </div>;
}
