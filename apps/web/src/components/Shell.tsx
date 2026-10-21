import { Link, Outlet, useLocation, type LinkProps } from '@tanstack/react-router';
import { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { formatDistanceNumber, formatDuration } from '../lib/format';
import { OPEN_PAYMENT_STATUSES, useSavedPayments } from '../lib/payments';
import { useNotifications, useStaffAccess, useUnit } from '../lib/queries';
import { movingSeconds, RecorderProvider, useRecorder } from '../lib/recorder';
import {
  ActivityIcon,
  ArrowRightIcon,
  BellIcon,
  FeedIcon,
  HomeIcon,
  LadderIcon,
  LogoutIcon,
  RunIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  JumpLogo,
  TableIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
} from './icons';
import { cx, LiveDot, Redirect, useNow } from './ui';

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('flex items-center text-ink', className)}>
      <JumpLogo height={26} motion="enter" />
    </span>
  );
}

/** Wraps a route that requires a signed-in runner. */
export function Private({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'signed-out') return <Redirect to="/login" search={{ redirect: location.href }} />;
  if (status !== 'signed-in') return null;
  return <>{children}</>;
}

/** Auth screens bring their own full-screen layout and logo, so no site header around them. */
const AUTH_PATHS = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  if (AUTH_PATHS.includes(location.pathname)) return <Outlet />;
  if (!user) return <PublicShell />;
  return (
    <RecorderProvider user={user}>
      <SignedInShell />
    </RecorderProvider>
  );
}

function PublicShell() {
  const location = useLocation();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link to="/">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-quiet btn-sm">
              Log in
            </Link>
            <Link to="/register" className="btn-primary btn-sm">
              Join free
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Re-keyed per page so each navigation plays the entrance. */}
        <div key={location.pathname} className="animate-rise">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

type NavItem = { to: LinkProps['to']; label: string; icon: ReactNode; badge?: number };

function SignedInShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const notifications = useNotifications();
  const { isStaff } = useStaffAccess();
  const recorder = useRecorder();
  const unread = notifications.data?.filter((item) => !item.readAt).length ?? 0;
  const onRunScreen = location.pathname === '/run' || location.pathname.startsWith('/runs/');
  const fullscreen = onRunScreen && ['recording', 'paused', 'finishing'].includes(recorder.phase);

  const groups: Array<{ title?: string; items: NavItem[] }> = [
    {
      items: [
        { to: '/dashboard', label: 'Home', icon: <HomeIcon /> },
        { to: '/feed', label: 'Feed', icon: <FeedIcon /> },
        { to: '/runners', label: 'Find runners', icon: <UsersIcon /> },
      ],
    },
    {
      title: 'Compete',
      items: [
        { to: '/competitions', label: 'Challenges', icon: <TableIcon /> },
        { to: '/clubs', label: 'Clubs', icon: <UsersIcon /> },
      ],
    },
    {
      title: 'You',
      items: [
        { to: '/activities', label: 'Your activity', icon: <ActivityIcon /> },
        { to: '/leagues', label: 'My league', icon: <LadderIcon /> },
        { to: '/wallet', label: 'Wallet', icon: <WalletIcon /> },
        { to: '/rewards', label: 'Rewards', icon: <WalletIcon /> },
        { to: '/creator', label: 'Creator', icon: <UserIcon /> },
        { to: '/notifications', label: 'Notifications', icon: <BellIcon />, badge: unread },
        { to: '/settings/profile', label: 'Settings', icon: <SettingsIcon /> },
      ],
    },
    ...(isStaff
      ? [
          {
            title: 'Staff',
            items: [
              { to: '/admin/creators', label: 'Creator approvals', icon: <ShieldIcon /> },
              { to: '/admin/challenges', label: 'Paid challenges', icon: <ShieldIcon /> },
              { to: '/admin/payouts', label: 'Payouts', icon: <WalletIcon /> },
            ] as NavItem[],
          },
        ]
      : []),
  ];

  if (fullscreen) return <Outlet />;

  return (
    <div className="min-h-screen md:pl-60">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r-[1.5px] border-ink bg-paper md:flex">
        <Link to="/dashboard" className="flex h-16 items-center px-5">
          <Wordmark />
        </Link>
        <div className="px-4 pb-2">
          <Link to="/run" className="btn-primary w-full">
            <RunIcon size={16} />
            {recorder.phase === 'recording' || recorder.phase === 'paused' ? 'Back to run' : 'Start a run'}
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main">
          {groups.map((group, index) => (
            <div key={index} className="mb-4">
              {group.title && <p className="eyebrow mb-1 px-2 text-ink-3">{group.title}</p>}
              {group.items.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="flex h-10 items-center gap-3 rounded px-2 text-[14px] font-semibold text-ink-2 hover:bg-ink/[0.05] hover:text-ink [&.active]:bg-ink [&.active]:text-paper"
                >
                  <span className="opacity-90">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span className="num rounded-sm bg-track px-1.5 text-[11px] font-bold text-ink">{item.badge}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold">{user?.displayName ?? 'Runner'}</p>
            <p className="truncate text-[12px] text-ink-3">{user?.email}</p>
          </div>
          <button type="button" onClick={() => void logout()} className="rounded p-2 text-ink-2 hover:bg-ink/[0.06] hover:text-ink" aria-label="Log out">
            <LogoutIcon size={18} />
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur md:hidden">
        <Link to="/dashboard">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          <Link to="/runners" className="rounded p-2 text-ink" aria-label="Find runners by username" title="Find runners">
            <SearchIcon size={20} />
          </Link>
          <Link to="/notifications" className="relative rounded p-2" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <BellIcon />
            {unread > 0 && (
              <span className="num absolute right-0.5 top-0.5 min-w-[18px] rounded-sm border-[1.5px] border-paper bg-track px-1 text-center text-[10px] font-bold leading-[15px]">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-32 pt-6 md:px-8 md:pb-16 md:pt-10">
        <LiveRunBar hidden={onRunScreen} />
        <PendingPaymentsBar hidden={location.pathname === '/payments/return'} />
        <div key={location.pathname} className="animate-rise">
          <Outlet />
        </div>
      </div>

      {/* Mobile tabs */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-ink bg-paper md:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
          <Tab to="/dashboard" label="Home" icon={<HomeIcon />} />
          <Tab to="/competitions" label="Compete" icon={<TableIcon />} />
          <Link to="/run" className="-mt-5 flex flex-col items-center gap-1" aria-label="Run">
            <span className="flex h-14 w-14 items-center justify-center rounded-md border-2 border-ink bg-track shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none">
              <RunIcon size={22} />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em]">Run</span>
          </Link>
          <Tab to="/feed" label="Feed" icon={<FeedIcon />} />
          <Tab to="/settings/profile" label="You" icon={<UserIcon />} />
        </div>
      </nav>
    </div>
  );
}

/** Which bottom tab owns a page, so "You" stays lit on Wallet, League etc. and "Compete" on Clubs. */
const TAB_PATHS: Record<string, string[]> = {
  Home: ['/dashboard'],
  Compete: ['/competitions', '/clubs'],
  Run: ['/run', '/runs'],
  Feed: ['/feed'],
  You: ['/settings', '/activities', '/runners', '/leagues', '/wallet', '/rewards', '/creator', '/notifications', '/payments', '/admin'],
};

function useTabActive(label: string) {
  const { pathname } = useLocation();
  return (TAB_PATHS[label] ?? []).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function Tab({ to, label, icon }: { to: LinkProps['to']; label: string; icon: ReactNode }) {
  const active = useTabActive(label);
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cx('relative flex flex-col items-center gap-0.5 pb-1 pt-1.5 transition-colors', active ? 'text-ink' : 'text-ink-3')}
    >
      {/* Orange bar along the top edge of the active tab. */}
      <span
        className={cx(
          'absolute -top-1.5 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-b-sm bg-track transition-opacity duration-200',
          active ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden="true"
      />
      <span
        key={String(active)}
        className={cx(
          'flex h-8 w-12 items-center justify-center rounded-md transition-colors duration-200',
          active ? 'animate-pop bg-ink text-volt' : 'text-ink-3',
        )}
      >
        {icon}
      </span>
      <span className={cx('text-[10px] uppercase tracking-[0.08em]', active ? 'font-black' : 'font-semibold')}>{label}</span>
    </Link>
  );
}

function LiveRunBar({ hidden }: { hidden: boolean }) {
  const recorder = useRecorder();
  const unit = useUnit();
  const live = recorder.phase === 'recording' || recorder.phase === 'paused';
  const now = useNow(1000, live && !hidden);
  if (!live || hidden) return null;
  return (
    <Link
      to="/run"
      className="mb-6 flex animate-rise items-center gap-3 rounded-md border-2 border-ink bg-ink px-4 py-3 text-paper"
    >
      <LiveDot live={recorder.phase === 'recording'} className={recorder.phase === 'recording' ? 'text-track' : 'text-paper'} />
      <span className="text-[11px] font-bold uppercase tracking-[0.14em]">{recorder.phase === 'recording' ? 'Recording' : 'Paused'}</span>
      <span className="score num ml-auto text-[22px] text-volt">
        {formatDistanceNumber(recorder.distanceMetres, unit)}
        <span className="ml-1 text-[12px] text-paper/70">{unit}</span>
      </span>
      <span className="score num text-[22px]">{formatDuration(movingSeconds(recorder.session, now))}</span>
      <ArrowRightIcon size={18} />
    </Link>
  );
}

function PendingPaymentsBar({ hidden }: { hidden: boolean }) {
  const payments = useSavedPayments();
  const open = payments.filter((payment) => OPEN_PAYMENT_STATUSES.includes(payment.lastStatus));
  const review = payments.filter((payment) => payment.lastStatus === 'RECONCILIATION_REQUIRED');
  if (hidden || (open.length === 0 && review.length === 0)) return null;
  const first = open[0] ?? review[0];
  return (
    <Link
      to="/payments/return"
      className="mb-6 flex items-center gap-3 rounded-md border-[1.5px] border-ink bg-warn-wash px-4 py-3 text-[14px]"
    >
      <span className={cx('h-2 w-2 rounded-full bg-warn', open.length > 0 && 'animate-blink')} />
      <span className="flex-1">
        <span className="font-bold">{open.length > 0 ? 'Payment being confirmed.' : 'A payment needs review.'}</span>{' '}
        <span className="text-ink-2">
          {open.length + review.length === 1 ? `Entry to ${first.tableTitle}` : `${open.length + review.length} entries`}: check status
        </span>
      </span>
      <ArrowRightIcon size={18} />
    </Link>
  );
}
