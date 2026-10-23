import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { cx, ErrorNotice, Field, Loading, Redirect } from '../components/ui';
import { api, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CountryPicker, PhoneField } from '../components/CountryPicker';
import { GenderSelect } from '../components/GenderSelect';
import { formatRelative } from '../lib/format';
import { keys } from '../lib/queries';
import { STRAVA_SIGNUP_KEY, takePendingStravaAuth, type StravaIntent } from '../lib/strava';
import type { AuthResponse, Gender, StravaLoginResponse, StravaStatus } from '../lib/types';

/** Strava's brand orange, required on "Connect with Strava" buttons. */
const STRAVA_ORANGE = 'bg-[#FC5200] text-white hover:bg-[#E34A00]';
const STRAVA_REVIEW_MESSAGE = 'Not available at the moment. We’re working to increase our limits, and our request is under review by Strava.';

export function StravaButton({ label, className }: { intent: StravaIntent; redirect?: string; label?: string; className?: string }) {
  return (
    <>
      <button
        type="button"
        className={cx('btn w-full cursor-not-allowed opacity-60', STRAVA_ORANGE, className)}
        disabled
        title={STRAVA_REVIEW_MESSAGE}
      >
        <StravaMark />
        {label ?? 'Continue with Strava'}
      </button>
      <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-3">{STRAVA_REVIEW_MESSAGE}</p>
    </>
  );
}

function StravaMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

function splitParams() {
  const params = new URLSearchParams(window.location.search);
  return { code: params.get('code'), scope: params.get('scope') ?? '', state: params.get('state'), error: params.get('error') };
}

/** Strava redirects here after the consent screen, for both sign-in and connecting from settings. */
export function StravaCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<unknown>(null);
  const started = useRef(false);

  useEffect(() => {
    // Codes are single-use, so never exchange twice (StrictMode runs effects twice in development).
    if (started.current) return;
    started.current = true;
    const { code, scope, state, error } = splitParams();
    const pending = takePendingStravaAuth(state);
    if (error === 'access_denied') return setProblem(new Error('You cancelled on Strava, so nothing was connected.'));
    if (!code || !pending) return setProblem(new Error('This Strava link is out of date. Start again from Jump.'));

    if (pending.intent === 'connect') {
      post<StravaStatus>('/strava/connect', { code, scope })
        .then((status) => {
          queryClient.setQueryData(['strava'], status);
          void queryClient.invalidateQueries({ queryKey: keys.activities });
          void navigate({ to: '/settings/profile' });
        })
        .catch(setProblem);
      return;
    }

    post<StravaLoginResponse>('/strava/login', { code, scope })
      .then((response) => {
        if (response.status === 'signed-in') {
          flushSync(() => auth.authenticate(response));
          void navigate({ href: pending.redirect ?? '/dashboard' });
        } else {
          sessionStorage.setItem(STRAVA_SIGNUP_KEY, JSON.stringify({ ...response, redirect: pending.redirect }));
          void navigate({ to: '/strava/signup' });
        }
      })
      .catch(setProblem);
  }, [auth, navigate, queryClient]);

  if (!problem) return <Loading label="Connecting to Strava" />;
  return (
    <div className="mx-auto max-w-[420px] px-5 py-16">
      <ErrorNotice error={problem} />
      <Link to={auth.status === 'signed-in' ? '/settings/profile' : '/login'} className="btn-quiet mt-4">
        Back
      </Link>
    </div>
  );
}

/** Strava doesn't share email addresses, so a new runner adds theirs here to finish signing up. */
export function StravaSignupPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [pending] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STRAVA_SIGNUP_KEY) ?? 'null') as (Extract<StravaLoginResponse, { status: 'needs-signup' }> & { redirect?: string }) | null;
    } catch {
      return null;
    }
  });
  const [country, setCountry] = useState('NG');
  const [gender, setGender] = useState<Gender | ''>('');
  const [whatsapp, setWhatsapp] = useState('');
  const signup = useMutation({
    mutationFn: (values: { email: string; countryCode: string; whatsappNumber?: string; gender?: Gender }) =>
      post<AuthResponse>('/strava/signup', { ...values, signupToken: pending!.signupToken }),
    onSuccess(response) {
      sessionStorage.removeItem(STRAVA_SIGNUP_KEY);
      flushSync(() => auth.authenticate(response));
      // Back to where they started (e.g. a competition, which then joins them), or onboarding.
      const next = pending?.redirect?.startsWith('/') && !pending.redirect.startsWith('//') && pending.redirect !== '/dashboard' ? pending.redirect : '/welcome';
      void navigate({ href: next });
    },
  });

  if (auth.status === 'signed-in' && !signup.isSuccess) return <Redirect to="/dashboard" />;
  if (!pending) return <Redirect to="/register" />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    signup.mutate({ email: String(form.get('email')).trim(), countryCode: country, ...(gender ? { gender } : {}), ...(whatsapp ? { whatsappNumber: whatsapp } : {}) });
  }

  return (
    <>
      <div className="mb-8">
        <p className="eyebrow mb-2">Almost there</p>
        <div className="flex items-center gap-3">
          {pending.athlete.avatarUrl && <img src={pending.athlete.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />}
          <h1 className="display text-[34px]">Hi {pending.athlete.name?.split(' ')[0] ?? 'there'}</h1>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Strava doesn’t share your email, so add it to finish. It’s where receipts and password resets go.
        </p>
      </div>
      <form className="space-y-5" onSubmit={submit}>
        <Field label="Email">
          {(props) => <input {...props} className="field" name="email" type="email" autoComplete="email" required />}
        </Field>
        <Field label="Country of residence">
          {(props) => <CountryPicker id={props.id} value={country} onChange={setCountry} required />}
        </Field>
        <Field label="Gender" optional hint="Only used to choose your default avatar. You can change this later.">
          {(props) => <GenderSelect id={props.id} value={gender} onChange={setGender} />}
        </Field>
        <Field label="WhatsApp number" optional hint="Private. Only Jump uses it, to reach you about prizes and your account.">
          {(props) => <PhoneField id={props.id} value={whatsapp} onChange={setWhatsapp} defaultCountry={country} />}
        </Field>
        <ErrorNotice error={signup.error} />
        <button className="btn-primary w-full" disabled={signup.isPending}>
          {signup.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-[14px] text-ink-2">
        Already have a Jump account?{' '}
        <Link to="/login" className="link text-ink">Log in</Link>, then connect Strava from your settings.
      </p>
    </>
  );
}

const STALE_AFTER_MS = 10 * 60 * 1000;

function refreshStravaProgress(queryClient: QueryClient) {
  for (const queryKey of [keys.activities, keys.tables, ['standings'], keys.leagues, ['club'], keys.profile]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

function useStravaStatus(enabled = true) {
  return useQuery({
    queryKey: ['strava'],
    queryFn: () => api<StravaStatus>('/strava'),
    enabled,
    // While the server is importing (right after connecting), check back until it's done.
    refetchInterval: (query) => (query.state.data?.connected && query.state.data.syncing ? 2000 : false),
  });
}

/**
 * Keeps Strava in step without a button: syncs when Jump opens if the last sync is stale, and shows a thin
 * orange bar while it works. Webhooks import new uploads too once they're registered.
 */
export function StravaSyncBar({ hidden }: { hidden?: boolean }) {
  const queryClient = useQueryClient();
  const status = useStravaStatus();
  const attempted = useRef(false);
  const [imported, setImported] = useState(0);
  const sync = useMutation({
    mutationFn: () => post<{ imported: number; skipped: number }>('/strava/sync'),
    onSuccess(result) {
      setImported(result.imported);
      void queryClient.invalidateQueries({ queryKey: ['strava'] });
      refreshStravaProgress(queryClient);
      if (result.imported) {
        // Import queues verification; refresh once more after those jobs have had time to credit boards.
        window.setTimeout(() => refreshStravaProgress(queryClient), 15_000);
      }
    },
  });
  const data = status.data;
  const serverSyncing = Boolean(data?.connected && data.syncing);

  useEffect(() => {
    if (attempted.current || !data?.connected || data.syncing || !data.canReadActivities) return;
    if (data.lastSyncedAt && Date.now() - new Date(data.lastSyncedAt).getTime() < STALE_AFTER_MS) return;
    attempted.current = true;
    sync.mutate();
  }, [data, sync]);

  // A sync that ran on the server (just after connecting) finished: pull in what it imported.
  const wasSyncing = useRef(false);
  useEffect(() => {
    if (wasSyncing.current && !serverSyncing) refreshStravaProgress(queryClient);
    wasSyncing.current = serverSyncing;
  }, [serverSyncing, queryClient]);

  useEffect(() => {
    if (!imported) return;
    const timer = window.setTimeout(() => setImported(0), 4000);
    return () => window.clearTimeout(timer);
  }, [imported]);

  const syncing = sync.isPending || serverSyncing;
  if (hidden || (!syncing && !imported)) return null;
  return (
    <div role="status" className={cx('mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-bold', STRAVA_ORANGE)}>
      <StravaMark />
      {syncing ? 'Syncing from Strava…' : `${imported} new ${imported === 1 ? 'activity' : 'activities'} from Strava`}
    </div>
  );
}

/** One compact row in the profile card: connect, or who's connected and when it last synced. */
export function StravaConnection() {
  const queryClient = useQueryClient();
  const status = useStravaStatus();
  const disconnect = useMutation({
    mutationFn: () => api<StravaStatus>('/strava', { method: 'DELETE' }),
    onSuccess: (next) => queryClient.setQueryData(['strava'], next),
  });

  if (status.isPending) return null;
  const data = status.data;

  return (
    <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FC5200] text-white">
        <StravaMark />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold">Strava</p>
        <p className="text-[12px] text-ink-2">
          {!data?.connected
            ? STRAVA_REVIEW_MESSAGE
            : data.syncing
              ? 'Syncing…'
              : !data.canReadActivities
                ? 'Reconnect and allow activity access'
                : data.lastSyncedAt
                  ? `${data.athleteName ?? 'Connected'} · synced ${formatRelative(data.lastSyncedAt)}`
                  : data.athleteName ?? 'Connected'}
        </p>
        <ErrorNotice error={disconnect.error} className="mt-2" />
      </div>
      {!data?.connected || !data.canReadActivities ? (
        <ConnectButton />
      ) : (
        <button type="button" className="text-[13px] font-semibold text-ink-2 underline-offset-2 hover:text-bad hover:underline" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
          {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
        </button>
      )}
    </div>
  );
}

function ConnectButton() {
  return (
    <button
      type="button"
      className={cx('btn btn-sm shrink-0 cursor-not-allowed opacity-60', STRAVA_ORANGE)}
      disabled
      title={STRAVA_REVIEW_MESSAGE}
    >
      Connect
    </button>
  );
}
