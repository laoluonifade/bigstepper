import type { AuthResponse, User } from '@jump/shared/types';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { api, isApiError, onUnauthorized, post } from './api';
import { unregisterForPush } from './push';
import { clearToken, loadToken, setToken } from './token';

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
  /** Sign out on this phone only, for when the account is already gone on the server (deleted). */
  forget: () => void;
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
    let cleanup = () => {};
    setStatus('checking');
    (async () => {
      const stored = await loadToken();
      if (cancelled) return;
      // iOS woke Jump in the background with the phone locked: the token is there but can't be read yet.
      // Stay on 'checking' and try again when the app comes to the front, rather than showing the login screen.
      if (stored === 'unreadable') {
        const subscription = AppState.addEventListener('change', (state) => {
          if (state !== 'active') return;
          subscription.remove();
          setAttempt((n) => n + 1);
        });
        cleanup = () => subscription.remove();
        return;
      }
      if (!stored) {
        setStatus('signed-out');
        return;
      }
      try {
        const sessionUser = await api<User>('/auth/session');
        if (cancelled) return;
        setUser(sessionUser);
        setStatus('signed-in');
      } catch (error) {
        if (cancelled) return;
        // Only a 401 ends the session, and that's handled centrally. A dropped connection, a 502 while the API
        // restarts for a deploy or a rate limit says nothing about the session, so keep the token and offer a retry.
        if (!isApiError(error, 401)) setStatus('unreachable');
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [attempt]);

  // Couldn't reach the API on startup: try again whenever Jump comes back to the front.
  useEffect(() => {
    if (status !== 'unreachable') return;
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') setAttempt((n) => n + 1); });
    return () => subscription.remove();
  }, [status]);

  // The verification link opens in the browser, so check again whenever Jump comes back on screen, and every
  // few seconds while it's open, until the email is verified. The banner then clears without a restart.
  const waitingForEmail = status === 'signed-in' && user?.emailVerified === false;
  useEffect(() => {
    if (!waitingForEmail) return;
    const check = () => {
      void api<User>('/auth/session').then((fresh) => {
        if (fresh.emailVerified) setUser((current) => (current ? { ...current, ...fresh } : fresh));
      }).catch(() => undefined);
    };
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') check(); }, 15_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [waitingForEmail]);

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
        // Stop this phone's pushes while the session can still say whose they are.
        await unregisterForPush();
        await post('/auth/logout').catch(() => undefined);
        setExpired(false);
        signOutLocally();
      },
      forget() {
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
