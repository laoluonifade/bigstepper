import { useMutation } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { ErrorNotice, Field } from './ui';
import { post } from './api';
import { Admin, useAdminAuth } from './auth';

/** Email, then the 6-digit code sent to it. Only provisioned admins get a code. */
export function AdminLogin() {
  const { signIn } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const request = useMutation({ mutationFn: () => post('/admin-auth/code', { email: email.trim() }), onSuccess: () => setSent(true) });
  const verify = useMutation({
    mutationFn: () => post<{ access_token: string; admin: Admin }>('/admin-auth/verify', { email: email.trim(), code }),
    onSuccess: (result) => signIn(result.access_token),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!sent) request.mutate();
    else verify.mutate();
  }

  return <main className="flex min-h-screen items-center justify-center bg-paper px-4">
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border-[1.5px] border-ink bg-card p-6 shadow-hard">
      <p className="text-[22px] font-black italic tracking-tight text-track">JUMP <span className="not-italic text-ink">admin</span></p>
      <h1 className="mt-4 text-[20px] font-extrabold">{sent ? 'Enter your code' : 'Sign in'}</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        {sent ? <>If <b className="text-ink">{email.trim()}</b> is an admin, a 6-digit code is on its way. It works once, for 10 minutes.</> : 'We’ll email a one-time code to your admin address.'}
      </p>
      <div className="mt-5 space-y-4">
        {!sent ? <Field label="Admin email">
          {(props) => <input {...props} autoFocus className="field" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />}
        </Field> : <Field label="6-digit code">
          {(props) => <input {...props} autoFocus className="field num text-center text-[22px] tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required />}
        </Field>}
        <ErrorNotice error={request.error ?? verify.error} />
        <button className="btn-primary w-full" disabled={request.isPending || verify.isPending || (sent ? code.length !== 6 : !email.includes('@'))}>
          {sent ? (verify.isPending ? 'Checking…' : 'Sign in') : (request.isPending ? 'Sending…' : 'Email me a code')}
        </button>
        {sent && <div className="flex justify-between text-[13px]">
          <button type="button" className="font-semibold text-ink-2 hover:text-ink" onClick={() => { setSent(false); setCode(''); verify.reset(); }}>Change email</button>
          <button type="button" className="font-semibold text-ink-2 hover:text-ink" disabled={request.isPending} onClick={() => { setCode(''); request.mutate(); }}>Send a new code</button>
        </div>}
      </div>
    </form>
  </main>;
}
