import { createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import { AppShell, Private } from './components/Shell';
import { NotFound, PagePending, RouteError } from './components/RouteStates';
import { DashboardPage } from './pages/Dashboard';
import { LandingPage } from './pages/Landing';
import { StravaCallbackPage, StravaSignupPage } from './pages/Strava';

function guarded(Component: ComponentType) {
  return function ProtectedPage() {
    return <Private><Component /></Private>;
  };
}

// Every page but Landing, Home and the Strava hand-offs loads on first visit (or on hover/touch of a link to it), so opening the app downloads less.
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) {
  return lazyRouteComponent(() => load().then((module) => ({ default: module[name] as ComponentType })));
}

function protectedPage<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) {
  return lazyRouteComponent(() => load().then((module) => ({ default: guarded(module[name] as ComponentType) })));
}

const root = createRootRoute({ component: AppShell });
const home = createRoute({ getParentRoute: () => root, path: '/', component: LandingPage });
const competitions = createRoute({
  getParentRoute: () => root,
  path: '/competitions',
  validateSearch: (search: Record<string, unknown>): { q?: string; activity?: string } => ({
    ...(typeof search.q === 'string' && search.q ? { q: search.q } : {}),
    ...(typeof search.activity === 'string' && search.activity ? { activity: search.activity } : {}),
  }),
  component: page(() => import('./pages/Competitions'), 'CompetitionsPage'),
});
const competition = createRoute({
  getParentRoute: () => root,
  path: '/competitions/$code',
  validateSearch: (search: Record<string, unknown>): { created?: boolean; join?: boolean } => ({
    ...(search.created === true || search.created === 'true' ? { created: true } : {}),
    // Set when someone logged in or signed up from this page, so they're joined on arrival.
    ...(search.join === true || search.join === 'true' || search.join === 1 || search.join === '1' ? { join: true } : {}),
  }),
  component: page(() => import('./pages/Competitions'), 'CompetitionDetailPage'),
});
const runner = createRoute({
  getParentRoute: () => root,
  path: '/runners/$username',
  validateSearch: (search: Record<string, unknown>): { tab?: 'followers' | 'following' } =>
    search.tab === 'followers' || search.tab === 'following' ? { tab: search.tab } : {},
  component: page(() => import('./pages/You'), 'RunnerPage'),
});
const runners = createRoute({ getParentRoute: () => root, path: '/runners', component: protectedPage(() => import('./pages/Runners'), 'RunnersPage') });

const authLayout = createRoute({ getParentRoute: () => root, id: 'auth', component: page(() => import('./pages/auth'), 'AuthLayout') });
const login = createRoute({ getParentRoute: () => authLayout, path: '/login', validateSearch: redirectSearch, component: page(() => import('./pages/auth'), 'LoginPage') });
const register = createRoute({ getParentRoute: () => authLayout, path: '/register', validateSearch: redirectSearch, component: page(() => import('./pages/auth'), 'RegisterPage') });
const verify = createRoute({ getParentRoute: () => authLayout, path: '/verify-email', validateSearch: tokenSearch, component: page(() => import('./pages/auth'), 'VerifyEmailPage') });
const forgot = createRoute({ getParentRoute: () => authLayout, path: '/forgot-password', component: page(() => import('./pages/auth'), 'ForgotPasswordPage') });
const stravaSignup = createRoute({ getParentRoute: () => authLayout, path: '/strava/signup', component: StravaSignupPage });
const stravaCallback = createRoute({ getParentRoute: () => root, path: '/auth/strava', component: StravaCallbackPage });
const reset = createRoute({ getParentRoute: () => authLayout, path: '/reset-password', validateSearch: tokenSearch, component: page(() => import('./pages/auth'), 'ResetPasswordPage') });

const terms = createRoute({ getParentRoute: () => root, path: '/terms', component: page(() => import('./pages/Legal'), 'TermsPage') });
const privacy = createRoute({ getParentRoute: () => root, path: '/privacy', component: page(() => import('./pages/Legal'), 'PrivacyPage') });
const deleteAccount = createRoute({ getParentRoute: () => root, path: '/delete-account', component: page(() => import('./pages/DeleteAccount'), 'DeleteAccountPage') });
const safety = createRoute({ getParentRoute: () => root, path: '/safety', component: page(() => import('./pages/Legal'), 'SafetyPage') });
const brandsPreview = createRoute({ getParentRoute: () => root, path: '/brands/preview', component: page(() => import('./pages/BrandPreview'), 'BrandPreviewScreen') });
const brands = createRoute({ getParentRoute: () => root, path: '/brands', component: page(() => import('./pages/Brands'), 'BrandsPage') });
const support = createRoute({ getParentRoute: () => root, path: '/support', component: page(() => import('./pages/Support'), 'SupportPage') });
const leaderboard = createRoute({ getParentRoute: () => root, path: '/leaderboard', component: protectedPage(() => import('./pages/LeaderboardPage'), 'LeaderboardPage') });
const setup = createRoute({ getParentRoute: () => root, path: '/setup', component: protectedPage(() => import('./pages/Setup'), 'SetupPage') });
const welcome = createRoute({ getParentRoute: () => root, path: '/welcome', component: protectedPage(() => import('./pages/Welcome'), 'WelcomePage') });
const dashboard = createRoute({ getParentRoute: () => root, path: '/dashboard', component: guarded(DashboardPage) });
const feed = createRoute({ getParentRoute: () => root, path: '/feed', validateSearch: (search: Record<string, unknown>): { activity?: string } => typeof search.activity === 'string' ? { activity: search.activity } : {}, component: protectedPage(() => import('./pages/Feed'), 'FeedPage') });
const feedPost = createRoute({ getParentRoute: () => root, path: '/feed/$id', component: protectedPage(() => import('./pages/Feed'), 'FeedPostPage') });
const messages = createRoute({ getParentRoute: () => root, path: '/messages', component: protectedPage(() => import('./pages/Messages'), 'MessagesPage') });
const conversation = createRoute({ getParentRoute: () => root, path: '/messages/$username', component: protectedPage(() => import('./pages/Messages'), 'ConversationPage') });
const duel = createRoute({ getParentRoute: () => root, path: '/duels/$id', component: protectedPage(() => import('./pages/Duel'), 'DuelPage') });
const newCompetition = createRoute({ getParentRoute: () => root, path: '/competitions/new', validateSearch: (search: Record<string, unknown>): { club?: string; template?: string } => ({ ...(typeof search.club === 'string' ? { club: search.club } : {}), ...(typeof search.template === 'string' ? { template: search.template } : {}) }), component: protectedPage(() => import('./pages/Competitions'), 'NewCompetitionPage') });
const run = createRoute({ getParentRoute: () => root, path: '/run', component: protectedPage(() => import('./pages/Run'), 'RunPage') });
const runSession = createRoute({ getParentRoute: () => root, path: '/runs/$id', component: protectedPage(() => import('./pages/Run'), 'RunSessionPage') });
const activities = createRoute({ getParentRoute: () => root, path: '/activities', component: protectedPage(() => import('./pages/Activities'), 'ActivitiesPage') });
const activity = createRoute({
  getParentRoute: () => root,
  path: '/activities/$id',
  validateSearch: (search: Record<string, unknown>): { fresh?: boolean } => search.fresh === true || search.fresh === 'true' ? { fresh: true } : {},
  component: protectedPage(() => import('./pages/Activities'), 'ActivityDetailPage'),
});
const leagues = createRoute({ getParentRoute: () => root, path: '/leagues', component: protectedPage(() => import('./pages/Social'), 'LeaguesPage') });
const league = createRoute({ getParentRoute: () => root, path: '/leagues/$id', component: protectedPage(() => import('./pages/Social'), 'LeagueDetailPage') });
const clubChat = createRoute({ getParentRoute: () => root, path: '/clubs/$id/chat', component: protectedPage(() => import('./pages/Messages'), 'ClubChatPage') });
const clubs = createRoute({ getParentRoute: () => root, path: '/clubs', component: protectedPage(() => import('./pages/Clubs'), 'ClubsPage') });
// Public, so an invite link shows the club before anyone signs up.
const club = createRoute({
  getParentRoute: () => root,
  path: '/clubs/$id',
  validateSearch: (search: Record<string, unknown>): { invite?: string; join?: boolean } => ({
    ...(typeof search.invite === 'string' && search.invite ? { invite: search.invite } : {}),
    ...(search.join === true || search.join === 'true' || search.join === 1 || search.join === '1' ? { join: true } : {}),
  }),
  component: page(() => import('./pages/Clubs'), 'ClubDetailPage'),
});
const clubDashboard = createRoute({ getParentRoute: () => root, path: '/clubs/$id/dashboard', component: protectedPage(() => import('./pages/ClubDashboard'), 'ClubDashboardPage') });
const prizes = createRoute({ getParentRoute: () => root, path: '/prizes', component: protectedPage(() => import('./pages/Prizes'), 'PrizesPage') });
const rewards = createRoute({ getParentRoute: () => root, path: '/rewards', component: protectedPage(() => import('./pages/You'), 'RewardsPage') });
const identity = createRoute({ getParentRoute: () => root, path: '/identity', component: protectedPage(() => import('./pages/You'), 'IdentityPage') });
const wallet = createRoute({ getParentRoute: () => root, path: '/wallet', beforeLoad: () => { throw redirect({ to: '/rewards', hash: window.location.hash.slice(1) || undefined }); } });
const creator = createRoute({ getParentRoute: () => root, path: '/creator', component: protectedPage(() => import('./pages/You'), 'CreatorPage') });
const notifications = createRoute({ getParentRoute: () => root, path: '/notifications', component: protectedPage(() => import('./pages/You'), 'NotificationsPage') });
const profile = createRoute({ getParentRoute: () => root, path: '/settings/profile', component: protectedPage(() => import('./pages/You'), 'ProfileSettingsPage') });
const paymentReturn = createRoute({ getParentRoute: () => root, path: '/payments/return', component: page(() => import('./pages/Payments'), 'PaymentReturnRoute') });

function redirectSearch(search: Record<string, unknown>): { redirect?: string } {
  return typeof search.redirect === 'string' ? { redirect: search.redirect } : {};
}

function tokenSearch(search: Record<string, unknown>): { token?: string } {
  return typeof search.token === 'string' ? { token: search.token } : {};
}

const routeTree = root.addChildren([
  home, competitions, competition, runners, runner, terms, privacy, deleteAccount, safety, support, brands, brandsPreview,
  authLayout.addChildren([login, register, verify, forgot, reset, stravaSignup]),
  stravaCallback,
  dashboard, setup, welcome, leaderboard, feed, feedPost, messages, conversation, duel, newCompetition, run, runSession, activities, activity,
  leagues, league, clubs, club, clubChat, clubDashboard, prizes, rewards, identity, wallet, creator, notifications, profile, paymentReturn,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // While a page's code loads, show its outline instead of a blank screen; quick loads skip it, and once
  // shown it stays long enough not to flicker.
  defaultPendingComponent: PagePending,
  defaultPendingMs: 100,
  defaultPendingMinMs: 300,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: NotFound,
});

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
