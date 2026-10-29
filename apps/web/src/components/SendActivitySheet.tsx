import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, post } from '../lib/api';
import { formatDistance } from '../lib/format';
import { useProfile } from '../lib/queries';
import type { Activity, Unit } from '../lib/types';
import { CheckIcon, CloseIcon, SearchIcon, SendIcon } from './icons';
import { Avatar, cx, ErrorNotice, Skeleton } from './ui';

type Person = { username: string; displayName: string; avatarUrl: string | null; isMe?: boolean };

/** "Send to…" for an activity: people you follow and who follow you, or anyone by username. */
export function SendActivityButton({ activity, unit, className, plain = false }: { activity: Activity; unit: Unit; className?: string; plain?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={plain ? className : cx('btn-secondary', className)} onClick={() => setOpen(true)}><SendIcon size={15} /> Send</button>
    {open && <SendActivitySheet activity={activity} unit={unit} onClose={() => setOpen(false)} />}
  </>;
}

function SendActivitySheet({ activity, unit, onClose }: { activity: Activity; unit: Unit; onClose: () => void }) {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const username = profile.data?.username;
  const [term, setTerm] = useState('');
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<Person | null>(null);
  const [sentTo, setSentTo] = useState<Person | null>(null);
  const searching = term.trim().replace(/^@/, '').length >= 2;

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  const following = useQuery({ queryKey: ['connections', username, 'following'], queryFn: () => api<Person[]>(`/users/${encodeURIComponent(username!)}/following`), enabled: Boolean(username) });
  const followers = useQuery({ queryKey: ['connections', username, 'followers'], queryFn: () => api<Person[]>(`/users/${encodeURIComponent(username!)}/followers`), enabled: Boolean(username) });
  const results = useQuery({
    queryKey: ['runner-search', term.trim()],
    queryFn: () => api<Person[]>(`/users/search?q=${encodeURIComponent(term.trim())}`),
    enabled: searching,
    staleTime: 30_000,
  });
  const people = useMemo(() => {
    const source = searching ? results.data ?? [] : [...(following.data ?? []), ...(followers.data ?? [])];
    const seen = new Set<string>();
    return source.filter((person) => !person.isMe && person.username !== username && !seen.has(person.username) && seen.add(person.username));
  }, [searching, results.data, following.data, followers.data, username]);
  const loading = searching ? results.isLoading : following.isLoading || followers.isLoading;

  const send = useMutation({
    mutationFn: (to: Person) => post(`/messages/${encodeURIComponent(to.username)}`, { body: note.trim(), activityId: activity.id }),
    onSuccess(_result, to) {
      setSentTo(to);
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
  const metres = (activity.verificationStatus === 'VERIFIED' || activity.verificationStatus === 'FLAGGED') ? Math.max(activity.validatedDistanceMetres, activity.stepDistanceMetres ?? 0) : activity.recordedDistanceMetres;

  return createPortal(<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Send activity">
    <div className="absolute inset-0 animate-fade bg-ink/50" onClick={onClose} />
    <div className="safe-bottom relative flex max-h-[86vh] w-full max-w-md animate-sheet-up flex-col rounded-t-3xl bg-card sm:animate-pop sm:rounded-3xl">
      <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
      <div className="flex items-center justify-between px-5 pb-2 pt-3">
        <p className="text-[17px] font-bold">Send {activity.activityType === 'cycle' ? 'ride' : activity.activityType} · {formatDistance(metres, unit)}</p>
        <button type="button" className="rounded-full p-1.5 hover:bg-ink/[0.06]" aria-label="Close" onClick={onClose}><CloseIcon size={18} /></button>
      </div>

      {sentTo ? <div className="flex flex-col items-center px-5 pb-8 pt-6 text-center">
        <span className="flex h-14 w-14 animate-pop items-center justify-center rounded-full bg-ok text-paper"><CheckIcon size={26} /></span>
        <p className="mt-3 text-[16px] font-bold">Sent to {sentTo.displayName}</p>
        <div className="mt-5 flex gap-2">
          <Link to="/messages/$username" params={{ username: sentTo.username }} className="btn-primary btn-sm">Open chat</Link>
          <button type="button" className="btn-secondary btn-sm" onClick={() => { setSentTo(null); setChosen(null); setNote(''); send.reset(); }}>Send to someone else</button>
        </div>
      </div> : <>
        <label className="mx-5 flex items-center gap-2 rounded-full bg-ink/[0.05] px-4">
          <SearchIcon size={16} className="text-ink-3" />
          <input autoFocus className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" placeholder="Search by name or @username" value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Search runners" />
        </label>
        <p className="px-5 pb-1 pt-3 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-3">{searching ? 'Results' : 'Following and followers'}</p>
        <ul className="min-h-[180px] flex-1 overflow-y-auto px-2">
          {loading ? <li className="space-y-2 px-3 py-2">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-12" />)}</li>
            : !people.length ? <li className="px-3 py-8 text-center text-[14px] text-ink-3">{searching ? 'No runners match that.' : 'Follow runners to see them here, or search above.'}</li>
            : people.map((person) => <li key={person.username}>
              <button type="button" className={cx('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors', chosen?.username === person.username ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.03]')} onClick={() => setChosen((current) => current?.username === person.username ? null : person)} aria-pressed={chosen?.username === person.username}>
                <Avatar name={person.displayName} src={person.avatarUrl} size={42} className="shrink-0 rounded-full" />
                <span className="min-w-0 flex-1 leading-tight"><span className="block truncate font-semibold">{person.displayName}</span><span className="block truncate text-[13px] text-ink-3">@{person.username}</span></span>
                <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors', chosen?.username === person.username ? 'border-track bg-track text-paper' : 'border-line')}>{chosen?.username === person.username && <CheckIcon size={14} />}</span>
              </button>
            </li>)}
        </ul>
        <div className="border-t border-line px-5 py-3">
          <ErrorNotice error={send.error} className="mb-2" />
          <div className="flex items-center gap-2">
            <input className="h-11 min-w-0 flex-1 rounded-full bg-ink/[0.05] px-4 text-[15px] outline-none placeholder:text-ink-3" placeholder="Add a note (optional)" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} aria-label="Add a note" />
            <button type="button" className="h-11 shrink-0 rounded-full bg-track px-5 text-[14px] font-bold text-paper transition hover:bg-track-deep disabled:bg-ink/10 disabled:text-ink-3" disabled={!chosen || send.isPending} onClick={() => chosen && send.mutate(chosen)}>{send.isPending ? 'Sending…' : 'Send'}</button>
          </div>
        </div>
      </>}
    </div>
  </div>, document.body);
}
