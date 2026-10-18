import { useQuery } from '@tanstack/react-query';
import { api, isApiError } from './api';
import { useAuth } from './auth';
import type {
  Activity,
  CompetitionTable,
  FinalResult,
  LeagueDivision,
  LeagueMembership,
  LeagueSeason,
  Notification,
  Profile,
  StandingRow,
  Unit,
  VerificationReview,
} from './types';

export const keys = {
  profile: ['profile', 'me'] as const,
  activities: ['activities'] as const,
  activity: (id: string) => ['activity', id] as const,
  run: (id: string) => ['run', id] as const,
  tables: ['tables'] as const,
  table: (code: string) => ['table', code.toUpperCase()] as const,
  standings: (tableId: string) => ['standings', tableId] as const,
  finalResult: (tableId: string) => ['result', tableId] as const,
  payment: (reference: string) => ['payment', reference] as const,
  rewards: ['rewards'] as const,
  notifications: ['notifications'] as const,
  leagues: ['leagues'] as const,
  myLeagues: ['leagues', 'me'] as const,
  leagueStandings: (seasonId: string) => ['leagues', 'standings', seasonId] as const,
  club: (id: string) => ['club', id] as const,
  clubMembers: (id: string) => ['club', id, 'members'] as const,
  adminReviews: ['admin', 'reviews'] as const,
};

export function useProfile() {
  const { user } = useAuth();
  return useQuery({ queryKey: keys.profile, queryFn: () => api<Profile>('/me'), enabled: Boolean(user), staleTime: 60_000 });
}

/** Preferred unit, defaulting to km until the profile loads. */
export function useUnit(): Unit {
  return useProfile().data?.preferredUnit ?? 'km';
}

export function useActivities() {
  return useQuery({ queryKey: keys.activities, queryFn: () => api<Activity[]>('/activities') });
}

export function useTables() {
  return useQuery({ queryKey: keys.tables, queryFn: () => api<CompetitionTable[]>('/tables') });
}

export function useStandings(tableId: string | undefined, refetchInterval: number | false = false) {
  return useQuery({
    queryKey: keys.standings(tableId ?? ''),
    queryFn: () => api<StandingRow[]>(`/tables/${tableId}/standings`),
    enabled: Boolean(tableId),
    refetchInterval,
  });
}

/** Resolves to `null` (not an error) before the table is settled. */
export function useFinalResult(tableId: string | undefined) {
  return useQuery({
    queryKey: keys.finalResult(tableId ?? ''),
    queryFn: async () => {
      try {
        return await api<FinalResult>(`/tables/${tableId}/result/final`);
      } catch (error) {
        if (isApiError(error, 404)) return null;
        throw error;
      }
    },
    enabled: Boolean(tableId),
    staleTime: 60_000,
  });
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => api<Notification[]>('/notifications'),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
}

export function useLeagues() {
  return useQuery({
    queryKey: keys.leagues,
    queryFn: () => api<{ seasons: LeagueSeason[]; divisions: LeagueDivision[] }>('/leagues'),
    staleTime: 5 * 60_000,
  });
}

export function useMyLeagues() {
  return useQuery({ queryKey: keys.myLeagues, queryFn: () => api<LeagueMembership[]>('/leagues/me') });
}

export function useLeagueStandings(seasonId: string | undefined) {
  return useQuery({
    queryKey: keys.leagueStandings(seasonId ?? ''),
    queryFn: () => api<LeagueMembership[]>(`/leagues/${seasonId}/standings`),
    enabled: Boolean(seasonId),
  });
}

/**
 * The session payload does not include the user's role, so staff access is
 * discovered by asking a staff-only endpoint. A 403 simply means "not staff".
 */
export function useStaffAccess() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: keys.adminReviews,
    queryFn: () => api<VerificationReview[]>('/admin/verification/reviews'),
    enabled: Boolean(user),
    retry: false,
    staleTime: 5 * 60_000,
  });
  return { isStaff: query.isSuccess, checking: query.isLoading, query };
}
