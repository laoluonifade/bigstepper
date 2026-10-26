import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ErrorNotice } from '../components/ui';
import { api, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AuthResponse } from '../lib/types';

const SCRIPT = 'https://accounts.google.com/gsi/client';

type GoogleId = {
  initialize(options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: 'popup' }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
};
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

let loading: Promise<void> | null = null;
function loadScript() {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loading = null; reject(new Error('Google sign-in could not load')); };
    document.head.appendChild(script);
  });
  return loading;
}

/** The browser's region ("en-NG" → "NG"), for a new account's country. */
function regionFromBrowser() {
  const region = navigator.language.split('-')[1]?.toUpperCase();
  return region && /^[A-Z]{2}$/.test(region) ? region : undefined;
}

/**
 * "Continue with Google" through Google's own button (their rules for how it looks). The ID token goes to
 * the API, which signs in, links the account with that email, or creates one.
 */
export function GoogleButton({ redirect, label = 'continue_with', divider }: { redirect: string; label?: 'continue_with' | 'signup_with' | 'signin_with'; /** Shown above the button, only when there is one. */ divider?: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  // The web OAuth client id comes from the API, so turning Google on needs no web rebuild. Null: no button.
  const config = useQuery({ queryKey: ['auth', 'google'], queryFn: () => api<{ webClientId: string | null }>('/auth/google/config'), staleTime: Infinity });
  const clientId = config.data?.webClientId;
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const signIn = useMutation({
    mutationFn: (idToken: string) => post<AuthResponse>('/auth/google', { idToken, countryCode: regionFromBrowser() }),
    onSuccess(response) {
      flushSync(() => auth.authenticate(response));
      void navigate({ href: redirect });
    },
  });
  const mutate = useRef(signIn.mutate);
  mutate.current = signIn.mutate;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadScript().then(() => {
      const id = window.google?.accounts.id;
      if (cancelled || !id || !holder.current) return;
      id.initialize({ client_id: clientId, ux_mode: 'popup', callback: (response) => mutate.current(response.credential) });
      id.renderButton(holder.current, { theme: 'outline', size: 'large', shape: 'rectangular', text: label, width: holder.current.offsetWidth || 320, logo_alignment: 'center' });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [clientId, label]);

  if (!clientId || failed) return null;
  return <div>
    {divider}
    <div ref={holder} className="flex min-h-[44px] w-full justify-center" aria-busy={signIn.isPending} />
    <ErrorNotice error={signIn.error} />
  </div>;
}
