import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import { AppShell, Private } from './components/Shell';
import { ActivitiesPage, ActivityDetailPage } from './pages/Activities';
import { CompetitionDetailPage, CompetitionsPage, NewCompetitionPage } from './pages/Competitions';
import { DashboardPage } from './pages/Dashboard';
import { LandingPage } from './pages/Landing';
import { PaymentReturnPage } from './pages/Payments';
import { RunPage, RunSessionPage } from './pages/Run';
import { ClubDetailPage, ClubsPage, LeagueDetailPage, LeaguesPage } from './pages/Social';
import { CreatorPage, NotificationsPage, ProfileSettingsPage, RewardsPage, RunnerPage, WalletPage } from './pages/You';
import { AuthLayout, ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from './pages/auth';

function protectedPage(Component: ComponentType) {
  return function ProtectedPage() {
    return <Private><Component /></Private>;
  };
}

function AdminPlaceholder() {
  return <div className="panel p-6"><p className="eyebrow">Admin</p><h1 className="display mt-2 text-[32px]">Use the API console</h1><p className="mt-3 text-ink-2">This admin screen has not been designed yet.</p></div>;
}

const root = createRootRoute({ component: AppShell });
const home = createRoute({ getParentRoute: () => root, path: '/', component: LandingPage });
const competitions = createRoute({ getParentRoute: () => root, path: '/competitions', component: CompetitionsPage });
const competition = createRoute({
  getParentRoute: () => root,
  path: '/competitions/$code',
  validateSearch: (search: Record<string, unknown>): { created?: boolean } => search.created === true || search.created === 'true' ? { created: true } : {},
  component: CompetitionDetailPage,
});
const runner = createRoute({ getParentRoute: () => root, path: '/runners/$username', component: RunnerPage });

const authLayout = createRoute({ getParentRoute: () => root, id: 'auth', component: AuthLayout });
const login = createRoute({ getParentRoute: () => authLayout, path: '/login', validateSearch: redirectSearch, component: LoginPage });
const register = createRoute({ getParentRoute: () => authLayout, path: '/register', validateSearch: redirectSearch, component: RegisterPage });
const verify = createRoute({ getParentRoute: () => authLayout, path: '/verify-email', validateSearch: tokenSearch, component: VerifyEmailPage });
const forgot = createRoute({ getParentRoute: () => authLayout, path: '/forgot-password', component: ForgotPasswordPage });
const reset = createRoute({ getParentRoute: () => authLayout, path: '/reset-password', validateSearch: tokenSearch, component: ResetPasswordPage });

const dashboard = createRoute({ getParentRoute: () => root, path: '/dashboard', component: protectedPage(DashboardPage) });
const newCompetition = createRoute({ getParentRoute: () => root, path: '/competitions/new', component: protectedPage(NewCompetitionPage) });
const run = createRoute({ getParentRoute: () => root, path: '/run', component: protectedPage(RunPage) });
const runSession = createRoute({ getParentRoute: () => root, path: '/runs/$id', component: protectedPage(RunSessionPage) });
const activities = createRoute({ getParentRoute: () => root, path: '/activities', component: protectedPage(ActivitiesPage) });
const activity = createRoute({
  getParentRoute: () => root,
  path: '/activities/$id',
  validateSearch: (search: Record<string, unknown>): { fresh?: boolean } => search.fresh === true || search.fresh === 'true' ? { fresh: true } : {},
  component: protectedPage(ActivityDetailPage),
});
const leagues = createRoute({ getParentRoute: () => root, path: '/leagues', component: LeaguesPage });
const league = createRoute({ getParentRoute: () => root, path: '/leagues/$id', component: LeagueDetailPage });
const clubs = createRoute({ getParentRoute: () => root, path: '/clubs', component: protectedPage(ClubsPage) });
const club = createRoute({ getParentRoute: () => root, path: '/clubs/$id', component: protectedPage(ClubDetailPage) });
const rewards = createRoute({ getParentRoute: () => root, path: '/rewards', component: protectedPage(RewardsPage) });
const wallet = createRoute({ getParentRoute: () => root, path: '/wallet', component: protectedPage(WalletPage) });
const creator = createRoute({ getParentRoute: () => root, path: '/creator', component: protectedPage(CreatorPage) });
const notifications = createRoute({ getParentRoute: () => root, path: '/notifications', component: protectedPage(NotificationsPage) });
const profile = createRoute({ getParentRoute: () => root, path: '/settings/profile', component: protectedPage(ProfileSettingsPage) });
const paymentReturn = createRoute({ getParentRoute: () => root, path: '/payments/return', component: protectedPage(PaymentReturnPage) });
const adminReviews = createRoute({ getParentRoute: () => root, path: '/admin/reviews', component: protectedPage(AdminPlaceholder) });
const adminCompetitions = createRoute({ getParentRoute: () => root, path: '/admin/competitions', component: protectedPage(AdminPlaceholder) });
const adminPayouts = createRoute({ getParentRoute: () => root, path: '/admin/payouts', component: protectedPage(AdminPlaceholder) });

function redirectSearch(search: Record<string, unknown>): { redirect?: string } {
  return typeof search.redirect === 'string' ? { redirect: search.redirect } : {};
}

function tokenSearch(search: Record<string, unknown>): { token?: string } {
  return typeof search.token === 'string' ? { token: search.token } : {};
}

const routeTree = root.addChildren([
  home, competitions, competition, runner,
  authLayout.addChildren([login, register, verify, forgot, reset]),
  dashboard, newCompetition, run, runSession, activities, activity,
  leagues, league, clubs, club, rewards, wallet, creator, notifications, profile, paymentReturn,
  adminReviews, adminCompetitions, adminPayouts,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
