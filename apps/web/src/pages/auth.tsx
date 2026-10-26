import { useMutation } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useSearch } from '@tanstack/react-router';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Wordmark } from '../components/Shell';
import { cx, ErrorNotice, Field, Loading, Notice, Redirect } from '../components/ui';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { setFlag, storageKeys } from '../lib/local';
import type { AuthResponse, Gender } from '../lib/types';
import { CountryPicker, PhoneField } from '../components/CountryPicker';
import { GenderSelect } from '../components/GenderSelect';
import { GoogleButton } from './Google';
import { PasswordInput } from '../components/PasswordInput';
import { cleanUsername, UsernameField, useUsernameCheck } from '../components/UsernameField';

const DEV_VERIFY_KEY = 'jump_dev_verify_token';

export function AuthLayout() {
  // One centred form on the page, the wordmark above it: nothing beside it to compete with the form.
  return (
    <main className="flex min-h-screen flex-col items-center px-5 py-6 sm:px-10">
      <div className="flex w-full max-w-[420px] flex-1 animate-rise-lg flex-col justify-center py-10">
        <Link to="/competitions" className="mb-10 self-start">
          <Wordmark />
        </Link>
        <Outlet />
      </div>
    </main>
  );
}

function AuthHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h1 className="display text-[34px]">{title}</h1>
      {children && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{children}</p>}
    </div>
  );
}

function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-[13px] text-ink-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

function safeRedirect(target: string | undefined) {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return '/dashboard';
  // Never bounce back into an auth screen — that is how redirect URLs nest into each other.
  return AUTH_PATHS.some((path) => target === path || target.startsWith(`${path}?`) || target.startsWith(`${path}/`)) ? '/dashboard' : target;
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const login = useMutation({
    mutationFn: (values: { email: string; password: string }) => post<AuthResponse>('/auth/login', values),
    onSuccess(response) {
      flushSync(() => auth.authenticate(response));
      void navigate({ href: safeRedirect(search.redirect) });
    },
  });

  if (auth.status === 'signed-in') return <Redirect href={safeRedirect(search.redirect)} />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate({ email: String(form.get('email')).trim(), password: String(form.get('password')) });
  }

  return (
    <>
      <AuthHeading eyebrow="Welcome back" title="Log in" />
      {auth.expired && !login.error && (
        <Notice tone="warn" className="mb-6" title="Your session ended">
          Log in again to pick up where you left off.
        </Notice>
      )}
      <form className="space-y-5" onSubmit={submit} noValidate={false}>
        <Field label="Email">
          {(props) => <input {...props} className="field" name="email" type="email" autoComplete="email" required />}
        </Field>
        <Field label="Password">
          {(props) => <PasswordInput {...props} className="field" name="password" autoComplete="current-password" required />}
        </Field>
        <ErrorNotice error={login.error} />
        <button className="btn-primary w-full" disabled={login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <GoogleButton redirect={safeRedirect(search.redirect)} divider={<OrDivider />} />
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-[14px]">
        <Link to="/forgot-password" className="link">
          Forgot password?
        </Link>
        <span className="text-ink-2">
          New here?{' '}
          <Link to="/register" search={search.redirect ? { redirect: search.redirect } : {}} className="link text-ink">
            Create an account
          </Link>
        </span>
      </div>
    </>
  );
}

const SIGNUP_STEPS = [
  { eyebrow: 'Free to join', title: 'Create your account', blurb: 'Record your first run today. Free competitions never cost a thing.' },
  { eyebrow: 'About you', title: 'About you', blurb: 'How you show up on leaderboards. You can change all of this later.' },
  { eyebrow: 'Almost done', title: 'Stay in the loop', blurb: 'So we can reach you about prizes and your account. Optional.' },
] as const;

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Sign-up in three short steps, as in the app: the account first (email, or Google under it), then who
 * you are, then how to reach you.
 */
export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const usernameCheck = useUsernameCheck(username);
  const [country, setCountry] = useState('NG');
  const [gender, setGender] = useState<Gender | ''>('');
  const [whatsapp, setWhatsapp] = useState('');
  const register = useMutation({
    mutationFn: (values: { email: string; password: string; countryCode: string; username: string; displayName?: string; whatsappNumber?: string; gender?: Gender }) => post<AuthResponse>('/auth/register', values),
    onSuccess(response) {
      flushSync(() => auth.authenticate(response));
      setFlag(storageKeys.verifyPrompt(response.user.id), true);
      if (import.meta.env.DEV && response.developmentVerificationToken) {
        sessionStorage.setItem(DEV_VERIFY_KEY, response.developmentVerificationToken);
      }
      // New runners go straight to picking competitions, unless they came from a specific one.
      void navigate({ href: search.redirect ? safeRedirect(search.redirect) : '/welcome' });
    },
  });

  if (auth.status === 'signed-in' && !register.isSuccess) return <Redirect to="/dashboard" />;

  function go(next: number) {
    register.reset();
    // Start them off with the name from their email; they can change it.
    if (next === 1 && !username) setUsername(cleanUsername(email.split('@')[0] ?? '').slice(0, 30));
    setStep(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 0) return go(1);
    if (step === 1) return usernameCheck.ok ? go(2) : undefined;
    register.mutate({
      email: email.trim(),
      password,
      countryCode: country,
      username,
      ...(gender ? { gender } : {}),
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      ...(whatsapp ? { whatsappNumber: whatsapp } : {}),
    });
  }

  const { eyebrow, title, blurb } = SIGNUP_STEPS[step];
  return (
    <>
      <div className="mb-5 flex gap-1.5" aria-label={`Step ${step + 1} of ${SIGNUP_STEPS.length}`}>
        {SIGNUP_STEPS.map((_, index) => <span key={index} className={cx('h-1 flex-1 rounded-full', index <= step ? 'bg-track' : 'bg-line')} />)}
      </div>
      <AuthHeading eyebrow={`Step ${step + 1} of ${SIGNUP_STEPS.length} · ${eyebrow}`} title={title}>{blurb}</AuthHeading>
      <form key={step} className="animate-rise space-y-5" onSubmit={submit}>
        {step === 0 && <>
          <Field label="Email">
            {(props) => <input {...props} className="field" name="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />}
          </Field>
          <Field label="Password" hint={password.length > 0 && password.length < 8 ? `${8 - password.length} more characters needed` : 'At least 8 characters.'}>
            {(props) => <PasswordInput {...props} className="field" name="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />}
          </Field>
          <button className="btn-primary w-full" disabled={!looksLikeEmail(email) || password.length < 8}>Continue</button>
        </>}

        {step === 1 && <>
          <UsernameField value={username} onChange={setUsername} autoFocus />
          <Field label="Display name" hint="Shown on leaderboards." optional>
            {(props) => <input {...props} className="field" name="displayName" autoComplete="nickname" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />}
          </Field>
          <Field label="Country of residence">
            {(props) => <CountryPicker id={props.id} value={country} onChange={setCountry} required />}
          </Field>
          <Field label="Gender" optional hint="Only used to choose your default avatar.">
            {(props) => <GenderSelect id={props.id} value={gender} onChange={setGender} />}
          </Field>
          <button className="btn-primary w-full" disabled={!usernameCheck.ok}>Continue</button>
        </>}

        {step === 2 && <>
          <Field label="WhatsApp number" optional hint="Private. Only Jump uses it.">
            {(props) => <PhoneField id={props.id} value={whatsapp} onChange={setWhatsapp} defaultCountry={country} />}
          </Field>
          <ErrorNotice error={register.error} />
          <button className="btn-primary w-full" disabled={register.isPending}>
            {register.isPending ? 'Creating account…' : 'Create account'}
          </button>
          {!whatsapp && <p className="text-center text-[13px] text-ink-3">You can leave this blank and add it later.</p>}
        </>}
      </form>

      {step === 0 && <GoogleButton redirect={safeRedirect(search.redirect)} label="signup_with" divider={<OrDivider />} />}

      {step > 0
        ? <button type="button" className="mt-6 text-[14px] font-semibold text-ink-2 hover:text-ink" onClick={() => go(step - 1)}>← Back</button>
        : <p className="mt-6 text-[14px] text-ink-2">
          Already running with us?{' '}
          <Link to="/login" className="link text-ink">
            Log in
          </Link>
        </p>}
    </>
  );
}

export function VerifyEmailPage() {
  const search = useSearch({ strict: false }) as { token?: string };
  const auth = useAuth();
  const [manualToken, setManualToken] = useState('');
  const started = useRef(false);
  const verify = useMutation({
    mutationFn: (token: string) => post<{ success: boolean }>('/auth/verify-email', { token }),
    onSuccess() {
      sessionStorage.removeItem(DEV_VERIFY_KEY);
      if (auth.user) {
        setFlag(storageKeys.verifyPrompt(auth.user.id), false);
        auth.updateUser({ emailVerified: true });
      }
    },
  });
  const resend = useResendVerification();

  useEffect(() => {
    if (search.token && !started.current) {
      started.current = true;
      verify.mutate(search.token);
    }
  }, [search.token, verify]);

  if (verify.isSuccess) {
    return (
      <>
        <AuthHeading eyebrow="All set" title="Email verified">
          You can now enter paid competitions when they’re available.
        </AuthHeading>
        <Link to={auth.user ? '/dashboard' : '/login'} className="btn-primary w-full">
          {auth.user ? 'Go to dashboard' : 'Log in'}
        </Link>
      </>
    );
  }

  if (search.token && verify.isPending) return <Loading label="Verifying your email" />;

  if (auth.user?.emailVerified || resend.data?.alreadyVerified) {
    return (
      <>
        <AuthHeading eyebrow="All set" title="Email verified">
          {auth.user?.email ?? 'Your email'} is already verified.
        </AuthHeading>
        <Link to="/dashboard" className="btn-primary w-full">
          Go to dashboard
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading eyebrow="Account" title="Verify your email">
        {auth.user ? (
          <>
            We sent a link to <span className="font-semibold text-ink">{auth.user.email}</span>. Open it on any device to verify. Check spam if it’s not in your inbox.
          </>
        ) : (
          'Open the link in your verification email. If you have a code instead, paste it below.'
        )}
      </AuthHeading>
      {verify.error && search.token && !manualToken && (
        <Notice tone="warn" className="mb-6" title="That link didn’t work">
          It may have expired or already been used.{auth.user ? ' Send a fresh one below.' : ' Log in to send a fresh one.'}
        </Notice>
      )}
      {auth.user && (
        <div className="mb-8">
          <button type="button" className="btn-secondary w-full" disabled={resend.isPending} onClick={() => resend.mutate()}>
            {resend.isPending ? 'Sending…' : resend.isSuccess ? 'Send another email' : 'Resend verification email'}
          </button>
          {resend.isSuccess && !resend.data.alreadyVerified && (
            <Notice tone="ok" className="mt-4">
              Sent. The new link replaces any earlier ones.
            </Notice>
          )}
          <ErrorNotice error={resend.error} />
        </div>
      )}
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          verify.mutate(manualToken.trim());
        }}
      >
        <Field label="Verification code">
          {(props) => (
            <input {...props} className="field font-mono text-[13px]" value={manualToken} onChange={(event) => setManualToken(event.target.value)} required />
          )}
        </Field>
        <ErrorNotice error={search.token && !manualToken ? null : verify.error} />
        <button className="btn-primary w-full" disabled={verify.isPending || !manualToken.trim()}>
          {verify.isPending ? 'Verifying…' : 'Verify email'}
        </button>
      </form>
    </>
  );
}

export function ForgotPasswordPage() {
  const request = useMutation({
    mutationFn: (email: string) => post<{ success: boolean; developmentResetToken?: string }>('/auth/reset-password/request', { email }),
  });

  if (request.isSuccess) {
    const devToken = import.meta.env.DEV ? request.data.developmentResetToken : undefined;
    return (
      <>
        <AuthHeading eyebrow="Request received" title="Check your inbox">
          If an account uses that email, a reset link has been issued. It expires in one hour.
        </AuthHeading>
        <Notice tone="neutral" title="Nothing arrived?">
          Check your spam folder, or wait a minute and request another link.
        </Notice>
        {devToken && (
          <Link to="/reset-password" search={{ token: devToken }} className="btn-secondary mt-6 w-full">
            Development: continue to reset
          </Link>
        )}
        <Link to="/login" className="link mt-6 inline-block text-[14px]">
          Back to log in
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading eyebrow="Account recovery" title="Reset your password">
        Enter the email you signed up with and we’ll issue a reset link.
      </AuthHeading>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          request.mutate(String(new FormData(event.currentTarget).get('email')).trim());
        }}
      >
        <Field label="Email">
          {(props) => <input {...props} className="field" name="email" type="email" autoComplete="email" required />}
        </Field>
        <ErrorNotice error={request.error} />
        <button className="btn-primary w-full" disabled={request.isPending}>
          {request.isPending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <Link to="/login" className="link mt-6 inline-block text-[14px]">
        Back to log in
      </Link>
    </>
  );
}

/** A phone, where the Jump app is likely installed. */
const ON_PHONE = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export function ResetPasswordPage() {
  const search = useSearch({ strict: false }) as { token?: string };
  const [token, setToken] = useState(search.token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const reset = useMutation({
    mutationFn: () => post<{ success: boolean }>('/auth/reset-password/complete', { token: token.trim(), password }),
  });
  const mismatch = confirm.length > 0 && confirm !== password;

  if (reset.isSuccess) {
    return (
      <>
        <AuthHeading eyebrow="Done" title="Password updated">
          For your security, every device has been signed out. Log in with your new password.
        </AuthHeading>
        {/* Reset links open in the phone's browser; on a phone, the way back is the app. */}
        {ON_PHONE ? <>
          <a href="jump://login" className="btn-primary w-full">Open the Jump app</a>
          <Link to="/login" className="mt-3 block text-center text-[14px] font-semibold text-ink-2 underline underline-offset-2">Log in on the web instead</Link>
        </> : <Link to="/login" className="btn-primary w-full">
          Log in
        </Link>}
      </>
    );
  }

  return (
    <>
      <AuthHeading eyebrow="Account recovery" title="Choose a new password" />
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mismatch) reset.mutate();
        }}
      >
        {!search.token && (
          <Field label="Reset code" hint="From your reset email.">
            {(props) => <input {...props} className="field font-mono text-[13px]" value={token} onChange={(event) => setToken(event.target.value)} required />}
          </Field>
        )}
        <Field label="New password" hint="At least 8 characters.">
          {(props) => (
            <PasswordInput
              {...props}
              className="field"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <Field label="Confirm new password" error={mismatch ? 'Passwords don’t match.' : undefined}>
          {(props) => (
            <PasswordInput
              {...props}
              className="field"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          )}
        </Field>
        <ErrorNotice error={reset.error} />
        <button className="btn-primary w-full" disabled={reset.isPending || mismatch || password.length < 8}>
          {reset.isPending ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </>
  );
}

/** Sends a fresh verification link to the signed-in runner. */
export function useResendVerification() {
  return useMutation({
    mutationFn: () =>
      post<{ success: boolean; alreadyVerified: boolean; developmentVerificationToken?: string }>('/auth/verify-email/resend'),
    onSuccess(response) {
      if (import.meta.env.DEV && response.developmentVerificationToken) {
        sessionStorage.setItem(DEV_VERIFY_KEY, response.developmentVerificationToken);
      }
    },
  });
}

export function getDevVerifyToken() {
  return import.meta.env.DEV ? sessionStorage.getItem(DEV_VERIFY_KEY) : null;
}
