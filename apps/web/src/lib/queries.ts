import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { api, isApiError, patch, post } from './api';
import { useAuth } from './auth';
import type { Activity, CompetitionTable, CreatorEarning, CreatorProfile, FinalResult, LeagueDivision, LeagueMembership, LeagueRules, LeagueSeason, Notification, Profile, StandingRow, Unit, Wallet, WalletTransaction } from './types';

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
  messagesUnread: ['messages', 'unread'] as const,
  leagues: ['leagues'] as const,
  myLeagues: ['leagues', 'me'] as const,
  leagueStandings: (seasonId: string) => ['leagues', 'standings', seasonId] as const,
  club: (id: string) => ['club', id] as const,
  clubMembers: (id: string) => ['club', id, 'members'] as const,
  wallet: ['wallet'] as const,
  walletTransactions: ['wallet', 'transactions'] as const,
  creator: ['creator', 'me'] as const,
  creatorEarnings: ['creator', 'earnings'] as const,
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

export function useTables(sort = 'popular', type = 'all', activity = 'all') {
  return useQuery({ queryKey: [...keys.tables, sort, type, activity], queryFn: () => api<CompetitionTable[]>(`/tables?sort=${sort}&type=${type}&activity=${activity}`) });
}

export type DiscoverView = 'for-you' | 'trending' | 'starting' | 'friends' | 'newest' | 'created' | 'archived';

/** The discovery feed, 20 at a time with "load more". */
export function useDiscover(view: DiscoverView, type = 'all', activity = 'all', enabled = true) {
  return useInfiniteQuery({
    queryKey: [...keys.tables, 'discover', view, type, activity],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<{ items: CompetitionTable[]; hasMore: boolean }>(`/tables/discover?view=${view}&type=${type}&activity=${activity}&page=${pageParam}`),
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled,
  });
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
  useEffect(()=>{
    if(!user) return;
    const record=()=>{
      if(document.visibilityState!=='visible') return;
      void post('/notifications/context',{timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}).catch(()=>undefined);
      const id=new URLSearchParams(window.location.search).get('jump_notification');
      if(id) void post(`/notifications/${encodeURIComponent(id)}/click`).catch(()=>undefined);
    };
    record();
    document.addEventListener('visibilitychange',record);
    return ()=>document.removeEventListener('visibilitychange',record);
  },[user?.id]);
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => api<Notification[]>('/notifications'),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
}

export function useUnreadMessages() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.messagesUnread,
    queryFn: () => api<{ count: number }>('/messages/unread-count'),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });
}

export function useLeagues() {
  return useQuery({
    queryKey: keys.leagues,
    queryFn: () => api<{ seasons: LeagueSeason[]; divisions: LeagueDivision[]; rules: LeagueRules }>('/leagues'),
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
export function useWallet() {
  const { user } = useAuth();
  return useQuery({ queryKey: keys.wallet, queryFn: () => api<Wallet>('/wallet'), enabled: Boolean(user) });
}

export function useWalletTransactions() {
  const { user } = useAuth();
  return useQuery({ queryKey: keys.walletTransactions, queryFn: () => api<WalletTransaction[]>('/wallet/transactions'), enabled: Boolean(user) });
}

export function useCreator() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.creator,
    queryFn: async () => {
      try {
        return await api<CreatorProfile>('/creators/me');
      } catch (error) {
        if (isApiError(error, 404)) return null;
        throw error;
      }
    },
    enabled: Boolean(user),
    retry: false,
  });
}

export function useCreatorEarnings(enabled = true) {
  return useQuery({
    queryKey: keys.creatorEarnings,
    queryFn: () => api<CreatorEarning[]>('/creators/me/earnings'),
    enabled,
  });
}

/** Where a notification opens; older rows without a stored link fall back to their section. */
export function notificationLink(item: Notification) {
  if (item.link?.startsWith('/')) return item.link;
  if (/^(DIRECT_MESSAGE|MESSAGE_)/.test(item.type)) return '/messages';
  if (/^(RANT_|FOLLOWING_POST)/.test(item.type)) return '/feed';
  if (item.type.startsWith('ACTIVITY_')) return '/activities';
  if (/^(CHALLENGE_|COMPETITION_|LEADERBOARD_|PAID_CHALLENGE_)/.test(item.type)) return '/competitions';
  return null;
}

/** Marks a notification read and opens the thing it is about. */
export function useOpenNotification() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const markRead = useMutation({
    mutationFn: (id: string) => patch<{ success: boolean }>(`/notifications/${id}/read`),
    onMutate(id) {
      queryClient.setQueryData<Notification[]>(keys.notifications, (current) =>
        current?.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)),
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.notifications }),
  });
  return {
    markRead,
    open(item: Notification) {
      if (!item.readAt) markRead.mutate(item.id);
      void post(`/notifications/${item.id}/click`).catch(()=>undefined);
      const link = notificationLink(item);
      if (link) router.history.push(link);
    },
  };
}
