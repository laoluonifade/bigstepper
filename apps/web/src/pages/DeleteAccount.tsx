import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ErrorNotice } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';

const SUPPORT = 'start@startajump.com';

const DELETED = [
  'Your profile: name, username, photo, bio, gender, weight and WhatsApp number',
  'Your walks, runs and rides, with their GPS routes and steps',
  'Your Rants, comments, reactions and messages, including club chat messages',
  'Who you follow and who follows you, your blocks and your club memberships',
  'Your entries in competitions that are still running',
  'Your sign-in details, including Google and Apple sign-in, and your notification settings',
];

const KEPT = [
  'Results of competitions that have already finished stay on their final leaderboards, shown as “Deleted runner”, so other runners’ results don’t change.',
  'Records of payments, prize payouts and identity checks are kept without your name for as long as financial, tax and accounting law requires, then deleted.',
  'Reports and safety decisions about your content are kept for as long as needed to resolve them and any related legal claims.',
];

/**
 * How to delete a Jump account and what that removes. Public (Google Play links here), and a signed-in
 * runner can delete straight from this page.
 */
export function DeleteAccountPage() {
  const { status } = useAuth();
  return <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
    <p className="eyebrow">Jump · Account</p>
    <h1 className="display mt-2 text-[clamp(32px,7vw,48px)] leading-[0.95]">Delete your Jump account</h1>
    <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
      You can delete your Jump account at any time, from the Jump app on iPhone or Android, or on the web. It takes effect straight away and can’t be undone.
    </p>

    <section className="mt-8 space-y-3">
      <h2 className="wide text-[15px] font-extrabold uppercase">How to delete it</h2>
      <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
        <li><strong>In the Jump app (iPhone and Android):</strong> open Jump, tap <strong>You</strong>, scroll to <strong>Account</strong>, tap <strong>Delete account</strong>, type DELETE and confirm. It’s the same on iOS and Android.</li>
        <li><strong>On the web:</strong> sign in below and press <strong>Delete my account</strong>.</li>
        <li><strong>By email:</strong> if you can’t sign in, email <a className="font-semibold underline" href={`mailto:${SUPPORT}?subject=Delete%20my%20Jump%20account`}>{SUPPORT}</a> from the address on your account. We delete it and confirm by email.</li>
      </ol>
      <p className="text-[13px] text-ink-2">If you have money in Jump (a prize waiting to be paid out, entry credit or a club you own), we’ll ask you to settle it first so nothing is lost.</p>
    </section>

    <section className="mt-8 rounded-2xl border-[1.5px] border-ink bg-card p-5">
      {status === 'signed-in' ? <DeleteNow /> : <div>
        <p className="text-[15px] font-bold">Delete on the web</p>
        <p className="mt-1 text-[14px] text-ink-2">Sign in to the account you want to delete, and you’ll come straight back here.</p>
        <Link to="/login" search={{ redirect: '/delete-account' }} className="btn-dark btn-sm mt-3 inline-flex">Sign in to delete</Link>
      </div>}
    </section>

    <section className="mt-8 space-y-3">
      <h2 className="wide text-[15px] font-extrabold uppercase">What’s deleted</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">{DELETED.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>

    <section className="mt-8 space-y-3">
      <h2 className="wide text-[15px] font-extrabold uppercase">What’s kept, and for how long</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">{KEPT.map((item) => <li key={item}>{item}</li>)}</ul>
      <p className="text-[14px] text-ink-2">More detail is in our <Link to="/privacy" className="font-semibold underline">Privacy Policy</Link>.</p>
    </section>
  </main>;
}

function DeleteNow() {
  const { logout } = useAuth();
  const [typed, setTyped] = useState('');
  const check = useQuery({ queryKey: ['me', 'deletion'], queryFn: () => api<{ canDelete: boolean; blocker: string | null }>('/me/deletion'), staleTime: 0 });
  const remove = useMutation({
    mutationFn: () => api('/me', { method: 'DELETE', body: { confirm: 'DELETE' } }),
    async onSuccess() {
      toast({ tone: 'ok', title: 'Account deleted', message: 'Thanks for running with Jump.' });
      await logout();
    },
  });
  if (check.isLoading) return <p className="text-[14px] text-ink-2">Checking your account…</p>;
  if (check.error) return <ErrorNotice error={check.error} onRetry={() => void check.refetch()} />;
  if (check.data?.blocker) return <div>
    <p className="text-[15px] font-bold">Not yet</p>
    <p className="mt-1 text-[14px] text-ink-2">{check.data.blocker}</p>
  </div>;
  return <form onSubmit={(event) => { event.preventDefault(); if (typed.trim().toUpperCase() === 'DELETE') remove.mutate(); }}>
    <p className="text-[15px] font-bold">Delete my account now</p>
    <label className="mt-3 block">
      <span className="text-[13px] font-semibold">Type DELETE to confirm</span>
      <input className="field mt-1" value={typed} onChange={(event) => setTyped(event.target.value)} autoCapitalize="characters" autoComplete="off" />
    </label>
    <ErrorNotice error={remove.error} />
    <button className="btn mt-3 w-full border-[1.5px] border-ink bg-bad text-paper hover:brightness-95" disabled={typed.trim().toUpperCase() !== 'DELETE' || remove.isPending}>
      {remove.isPending ? 'Deleting…' : 'Delete my account'}
    </button>
  </form>;
}
