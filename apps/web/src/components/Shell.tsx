import { StravaSyncBar } from '../pages/Strava';
import { LEGAL_LINKS } from '../legal/links';
import { Link, Outlet, useLocation, type LinkProps } from '@tanstack/react-router';
import { NavigationProgress, PagePending } from './RouteStates';
import { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { formatDistanceNumber, formatDuration } from '../lib/format';
import { OPEN_PAYMENT_STATUSES, useSavedPayments } from '../lib/payments';
import { useNotifications, useProfile, useUnit, useUnreadMessages } from '../lib/queries';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { onboardingSkipped } from '../lib/onboarding';
import { movingSeconds, RecorderProvider, START_ACTIVITY_EVENT, useRecorder } from '../lib/recorder';
import { ActivityIcon, ArrowRightIcon, BellIcon, FeedIcon, HomeIcon, LadderIcon, LogoutIcon, RunIcon, SearchIcon, SettingsIcon, JumpLogo, TableIcon, UserIcon, UsersIcon, WalletIcon, PlayIcon } from './icons';
import { cx, LiveDot, Redirect, useNow } from './ui';
import { QuickPanelsProvider, useQuickPanels } from './QuickPanels';

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
  if (status !== 'signed-in') return <PagePending />;
  return <>{children}</>;
}

/** Auth screens bring their own full-screen layout and logo, so no site header around them. */
const AUTH_PATHS = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];

export function AppShell() {
  return <><NavigationProgress /><Shell /></>;
}

function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  if (AUTH_PATHS.includes(location.pathname)) return <Outlet />;
  if (!user) return <PublicShell />;
  return (
    <RecorderProvider user={user}>
      <QuickPanelsProvider><SignedInShell /></QuickPanelsProvider>
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
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1.5">
            {LEGAL_LINKS.map((link) => <Link key={link.to} to={link.to} className="font-medium text-ink-2 hover:text-ink">{link.label}</Link>)}
            <a href="mailto:start@startajump.com" className="font-medium text-ink-2 hover:text-ink">Contact</a>
          </nav>
          <p>© {new Date().getFullYear()} Voyatech Limited</p>
        </div>
      </footer>
    </div>
  );
}

/** Pages a runner can use before joining their first competition: the ways into one, and account basics. */
const ONBOARDING_PATHS = ['/welcome', '/competitions', '/clubs', '/settings', '/verify-email', '/strava'];

/** New runners go to the welcome page until they're in at least one competition (joined or hosting). */
function OnboardingGate() {
  const location = useLocation();
  const profile = useProfile();
  const mine = useQuery({ queryKey: ['tables', 'mine'], queryFn: () => api<Array<{ joined: boolean }>>('/tables/mine') });
  const fresh = profile.data && new Date(profile.data.createdAt).getTime() >= ONBOARDING_REQUIRED_SINCE;
  if (!fresh || !mine.data || mine.data.some((row) => row.joined) || onboardingSkipped()) return null;
  if (ONBOARDING_PATHS.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))) return null;
  return <Redirect to="/welcome" />;
}

/** Accounts created from this release on; older runners aren't pushed through onboarding again. */
const ONBOARDING_REQUIRED_SINCE = Date.UTC(2026, 9, 22);

type NavItem = { to?: LinkProps['to']; popover?: 'notifications'; label: string; icon: ReactNode; badge?: number };

function SignedInShell() {
  const { user, logout } = useAuth();
  const quickPanels = useQuickPanels();
  const location = useLocation();
  const notifications = useNotifications();
  const unreadMessages = useUnreadMessages().data?.count ?? 0;
  const recorder = useRecorder();
  const unread = notifications.data?.filter((item) => !item.readAt).length ?? 0;
  const onRunScreen = location.pathname === '/run' || location.pathname.startsWith('/runs/');
  // DMs and club chats fill the phone screen: no top bar, tab bar or entrance animation (its transform
  // would pin the composer to the wrong place).
  const onConversation = location.pathname.startsWith('/messages/') || /^\/clubs\/[^/]+\/chat\/?$/.test(location.pathname);
  const onSearchScreen = location.pathname === '/runners';
  const fullscreen = onRunScreen && ['recording', 'paused', 'finishing'].includes(recorder.phase);

  const groups: Array<{ title?: string; items: NavItem[] }> = [
    {
      items: [
        { to: '/dashboard', label: 'Home', icon: <HomeIcon /> },
        { to: '/feed', label: 'Rant', icon: <FeedIcon /> },
        { to: '/messages', label: 'Messages', icon: <FeedIcon />, badge: unreadMessages },
        { to: '/runners', label: 'Find runners', icon: <UsersIcon /> },
      ],
    },
    {
      title: 'Compete',
      items: [
        { to: '/competitions', label: 'Competitions', icon: <TableIcon /> },
        { to: '/clubs', label: 'Clubs', icon: <UsersIcon /> },
      ],
    },
    {
      title: 'You',
      items: [
        { to: '/activities', label: 'Your activity', icon: <ActivityIcon /> },
        { to: '/leagues', label: 'My league', icon: <LadderIcon /> },
        { to: '/rewards', label: 'Rewards', icon: <WalletIcon /> },
        { to: '/creator', label: 'Creator', icon: <UserIcon /> },
        { popover: 'notifications', label: 'Notifications', icon: <BellIcon />, badge: unread },
        { to: '/settings/profile', label: 'Settings', icon: <SettingsIcon /> },
      ],
    },
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
              {group.items.map((item) => {
                const content = <><span className="opacity-90">{item.icon}</span><span className="flex-1 text-left">{item.label}</span>{item.badge ? <span className={cx('num min-w-[18px] rounded-full px-1.5 text-center text-[11px] font-bold', item.label === 'Messages' ? 'bg-bad text-paper' : 'bg-track text-ink')}>{item.badge > 9 ? '9+' : item.badge}</span> : null}</>;
                const className = 'flex h-10 w-full items-center gap-3 rounded px-2 text-[14px] font-semibold text-ink-2 hover:bg-ink/[0.05] hover:text-ink [&.active]:bg-ink [&.active]:text-paper';
                return item.popover ? <button key={item.label} type="button" className={className} onClick={(event) => quickPanels.toggleNotifications(event.currentTarget)}>{content}</button> : <Link key={item.label} to={item.to!} className={className}>{content}</Link>;
              })}
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
      <header className={cx('sticky top-0 z-30 h-14 items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur md:hidden', onConversation ? 'hidden' : 'flex')}>
        <Link to="/dashboard">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          <Link to="/runners" className="rounded p-2 text-ink" aria-label="Find runners by username" title="Find runners">
            <SearchIcon size={20} />
          </Link>
          <Link to="/messages" className="relative rounded p-2 text-ink" aria-label={`Messages${unreadMessages ? `, ${unreadMessages} unread` : ''}`} title="Messages">
            <FeedIcon size={20} />
            {unreadMessages > 0 && <span className="num absolute right-0.5 top-0.5 min-w-[18px] rounded-full border-[1.5px] border-paper bg-bad px-1 text-center text-[10px] font-bold leading-[15px] text-paper">{unreadMessages > 9 ? '9+' : unreadMessages}</span>}
          </Link>
          <button type="button" onClick={(event) => quickPanels.toggleNotifications(event.currentTarget)} className="relative rounded p-2" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <BellIcon />
            {unread > 0 && (
              <span className="num absolute right-0.5 top-0.5 min-w-[18px] rounded-sm border-[1.5px] border-paper bg-track px-1 text-center text-[10px] font-bold leading-[15px]">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className={cx('mx-auto max-w-5xl md:px-8 md:pb-16 md:pt-10', onConversation ? 'px-0 pb-0 pt-0' : onSearchScreen ? 'px-0 pb-32 pt-0' : 'px-4 pb-32 pt-6')}>
        <div className={onConversation || onSearchScreen ? 'hidden md:block' : undefined}>
          <LiveRunBar hidden={onRunScreen} />
          <PendingPaymentsBar hidden={location.pathname === '/payments/return'} />
          <StravaSyncBar hidden={onRunScreen} />
        </div>
        <div key={location.pathname} className={onConversation ? undefined : 'animate-rise'}>
          <OnboardingGate />
          <Outlet />
        </div>
      </div>

      {/* Mobile tabs */}
      <nav className={cx('safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-ink bg-paper md:hidden', onConversation && 'hidden')} aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
          <Tab to="/dashboard" label="Home" icon={<HomeIcon />} />
          <Tab to="/competitions" label="Compete" icon={<TableIcon />} />
          {location.pathname === '/run' && !['recording', 'paused', 'finishing'].includes(recorder.phase) ? (
            // On the run page the big centre button is Start, and shows the GPS search once you've tapped it.
            <button type="button" onClick={() => window.dispatchEvent(new Event(START_ACTIVITY_EVENT))} disabled={recorder.phase === 'locating'} className="-mt-5 flex flex-col items-center gap-1" aria-label={recorder.phase === 'locating' ? 'Finding GPS signal' : 'Start activity'} aria-busy={recorder.phase === 'locating'}>
              <span className={cx('flex h-14 w-14 items-center justify-center rounded-md border-2 border-ink bg-track shadow-hard', recorder.phase === 'locating' ? 'translate-x-[3px] translate-y-[3px] shadow-none' : 'animate-pop active:translate-x-[3px] active:translate-y-[3px] active:shadow-none')}>
                {recorder.phase === 'locating'
                  ? <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-ink border-t-transparent" />
                  : <PlayIcon size={24} className="translate-x-[1px]" />}
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-[0.08em]">{recorder.phase === 'locating' ? 'GPS…' : 'Start'}</span>
            </button>
          ) : (
            <Link to="/run" className="-mt-5 flex flex-col items-center gap-1" aria-label="Run">
              <span className="flex h-14 w-14 items-center justify-center rounded-md border-2 border-ink bg-track shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none">
                <RunIcon size={22} />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.08em]">Run</span>
            </Link>
          )}
          <Tab to="/feed" label="Rant" icon={<FeedIcon />} />
          <Tab to="/settings/profile" label="You" icon={<UserIcon />} />
        </div>
      </nav>
    </div>
  );
}

/** Which bottom tab owns a page, so "You" stays lit on Rewards, League etc. and "Compete" on Clubs. */
const TAB_PATHS: Record<string, string[]> = {
  Home: ['/dashboard'],
  Compete: ['/competitions', '/leaderboard', '/clubs'],
  Run: ['/run', '/runs'],
  Rant: ['/feed'],
  You: ['/settings', '/activities', '/leagues', '/rewards', '/creator', '/notifications', '/payments'],
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
