import { useQuery } from '@tanstack/react-query';
import { api } from './api';

const STATE_KEY = 'jump_strava_state';
export const STRAVA_SIGNUP_KEY = 'jump_strava_signup';

export type StravaIntent = 'login' | 'connect';

interface PendingAuth {
  state: string;
  intent: StravaIntent;
  redirect?: string;
}

/** Sends the browser to Strava's consent screen. Strava returns to /auth/strava with a code. */
export async function startStravaAuth(intent: StravaIntent, redirect?: string) {
  const { clientId } = await api<{ clientId: string | null }>('/strava/config');
  if (!clientId) throw new Error('Strava isn’t set up yet.');
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, JSON.stringify({ state, intent, redirect } satisfies PendingAuth));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth/strava`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  });
  window.location.assign(`https://www.strava.com/oauth/authorize?${params}`);
}

/** The pending request this callback answers, or null when the state doesn't match (stale or forged). */
export function takePendingStravaAuth(state: string | null): PendingAuth | null {
  const raw = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (!raw || !state) return null;
  try {
    const pending = JSON.parse(raw) as PendingAuth;
    return pending.state === state ? pending : null;
  } catch {
    return null;
  }
}

/** Whether Strava sign-in/connect is open to everyone (it stays hidden until Strava approves the app). */
export function useStravaPublic() {
  const config = useQuery({ queryKey: ['strava-config'], queryFn: () => api<{ clientId: string | null; public: boolean }>('/strava/config'), staleTime: 5 * 60_000 });
  return Boolean(config.data?.clientId && config.data.public);
}
