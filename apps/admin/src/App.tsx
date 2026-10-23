import { ReactNode } from 'react';
import { useAdmin, useAdminAuth } from './auth';
import { ActivityIcon, CheckIcon, HomeIcon, LogoutIcon, ShieldIcon, TableIcon, UsersIcon, WalletIcon } from './icons';
import { AdminLogin } from './Login';
import { ClubsPage } from './pages/Clubs';
import { AdminChallengesPage } from './pages/Competitions';
import { AdminCreatorsPage } from './pages/Creators';
import { OverviewPage } from './pages/Overview';
import { AdminPayoutsPage } from './pages/Payouts';
import { AdminPeoplePage } from './pages/People';
import { ReviewsPage } from './pages/Reviews';
import { AdminLink, useLocation } from './router';
import { cx, Loading } from './ui';

type Section = { path: string; label: string; icon: ReactNode; page: () => ReactNode; adminOnly: boolean };

const SECTIONS: Section[] = [
  { path: '/', label: 'Overview', icon: <HomeIcon size={18} />, page: () => <OverviewPage />, adminOnly: true },
  { path: '/people', label: 'People', icon: <UsersIcon size={18} />, page: () => <AdminPeoplePage />, adminOnly: true },
  { path: '/clubs', label: 'Clubs', icon: <CheckIcon size={18} />, page: () => <ClubsPage />, adminOnly: true },
  { path: '/reviews', label: 'Activity reviews', icon: <ActivityIcon size={18} />, page: () => <ReviewsPage />, adminOnly: false },
  { path: '/creators', label: 'Creators', icon: <ShieldIcon size={18} />, page: () => <AdminCreatorsPage />, adminOnly: true },
  { path: '/competitions', label: 'Paid competitions', icon: <TableIcon size={18} />, page: () => <AdminChallengesPage />, adminOnly: true },
  { path: '/payouts', label: 'Payouts', icon: <WalletIcon size={18} />, page: () => <AdminPayoutsPage />, adminOnly: true },
];

export function AdminApp() {
  const { status } = useAdminAuth();
  if (status === 'loading') return <div className="flex min-h-screen items-center justify-center"><Loading label="Checking your session" /></div>;
  if (status === 'signed-out') return <AdminLogin />;
  return <Console />;
}

function Console() {
  const admin = useAdmin();
  const { signOut } = useAdminAuth();
  const { path } = useLocation();
  // Compliance staff see the review queue only; everything else is for admins.
  const sections = SECTIONS.filter((section) => admin.role === 'admin' || !section.adminOnly);
  const current = sections.find((section) => section.path === path) ?? sections[0];

  return <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="border-b border-line bg-[#121212] text-paper lg:sticky lg:top-0 lg:h-screen lg:border-b-0">
      <div className="flex items-center justify-between gap-3 px-5 py-4 lg:block">
        <p className="text-[20px] font-black italic tracking-tight text-track">JUMP <span className="not-italic text-paper">admin</span></p>
        <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-paper/60 hover:text-paper lg:hidden"><LogoutIcon size={14} /> Sign out</button>
      </div>
      <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-0.5 lg:px-3" aria-label="Admin">
        {sections.map((section) => <AdminLink key={section.path} to={section.path} aria-current={section === current ? 'page' : undefined}
          className={cx('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-semibold transition-colors', section === current ? 'bg-paper text-ink' : 'text-paper/70 hover:bg-paper/10 hover:text-paper')}>
          {section.icon}{section.label}
        </AdminLink>)}
      </nav>
      <div className="absolute bottom-0 hidden w-[240px] border-t border-paper/10 px-5 py-4 lg:block">
        <p className="truncate text-[13px] font-semibold">{admin.displayName}</p>
        <p className="truncate text-[12px] text-paper/60">{admin.email} · {admin.role}</p>
        <button type="button" onClick={() => void signOut()} className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-paper/60 hover:text-paper"><LogoutIcon size={14} /> Sign out</button>
      </div>
    </aside>
    <main className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8 lg:py-8">{current.page()}</main>
  </div>;
}
