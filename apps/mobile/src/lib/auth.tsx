import type { AuthResponse, User } from '@jump/shared/types';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, isApiError, onUnauthorized, post } from './api';
import { clearToken, getToken, loadToken, setToken } from './token';

type AuthStatus = 'checking' | 'signed-in' | 'signed-out' | 'unreachable';

interface AuthState {
  user: User | null;
  status: AuthStatus;
  /** True when the last session ended because the API rejected the token. */
  expired: boolean;
  authenticate: (response: AuthResponse) => void;
  /** Patch the signed-in user locally after a change the API has confirmed. */
  updateUser: (changes: Partial<User>) => void;
  logout: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const signOutLocally = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus('signed-out');
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => onUnauthorized(() => {
    setExpired(true);
    signOutLocally();
  }), [signOutLocally]);

  // A stored token is not proof of a session — always confirm with the API on startup.
  useEffect(() => {
    let cancelled = false;
    setStatus('checking');
    (async () => {
      if (!(await loadToken())) {
        if (!cancelled) setStatus('signed-out');
        return;
      }
      try {
        const sessionUser = await api<User>('/auth/session');
        if (cancelled) return;
        setUser(sessionUser);
        setStatus('signed-in');
      } catch (error) {
        if (cancelled) return;
        // 401s are handled centrally. If the API is unreachable we can't confirm either way, so wait for a retry.
        if (isApiError(error, 0)) setStatus('unreachable');
        else if (getToken()) signOutLocally();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, signOutLocally]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      status,
      expired,
      authenticate(response) {
        setToken(response.access_token);
        queryClient.clear();
        setUser(response.user);
        setExpired(false);
        setStatus('signed-in');
      },
      updateUser(changes) {
        setUser((current) => (current ? { ...current, ...changes } : current));
      },
      async logout() {
        await post('/auth/logout').catch(() => undefined);
        setExpired(false);
        signOutLocally();
      },
      retry: () => setAttempt((n) => n + 1),
    }),
    [expired, queryClient, signOutLocally, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** For screens that render only inside the signed-in app. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without a signed-in user');
  return user;
}
