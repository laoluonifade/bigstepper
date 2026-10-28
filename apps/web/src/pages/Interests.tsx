import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ActivityIcon, CalendarIcon, CheckIcon, CrownIcon, CycleIcon, FlameIcon, RunIcon, UsersIcon, WalkIcon } from '../components/icons';
import { cx, ErrorNotice } from '../components/ui';
import { patch } from '../lib/api';
import { skipInterests } from '../lib/onboarding';
import { keys } from '../lib/queries';
import type { Profile } from '../lib/types';

const INTERESTS = [
  { value: 'run', label: 'Running', icon: RunIcon },
  { value: 'walk', label: 'Walking', icon: WalkIcon },
  { value: 'cycle', label: 'Cycling', icon: CycleIcon },
  { value: 'compete', label: 'Winning prizes', icon: CrownIcon },
  { value: 'events', label: 'Club runs and events', icon: CalendarIcon },
  { value: 'fitness', label: 'Getting fitter', icon: FlameIcon },
  { value: 'steps', label: 'Daily steps', icon: ActivityIcon },
  { value: 'friends', label: 'Moving with friends', icon: UsersIcon },
] as const;

/** Right after sign-up: what brought you here, so Jump knows what to show you more of. */
export function InterestsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string[]>([]);
  const next = () => void navigate({ to: '/welcome' });
  const save = useMutation({
    mutationFn: () => patch<Profile>('/me', { interests: picked }),
    onSuccess(updated) { queryClient.setQueryData(keys.profile, updated); next(); },
  });
  const toggle = (value: string) => setPicked((now) => (now.includes(value) ? now.filter((item) => item !== value) : [...now, value]));

  return <div className="mx-auto max-w-xl animate-rise">
    <p className="wide text-[11px] font-extrabold uppercase tracking-[0.1em] text-ink-3">One quick question</p>
    <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight">What brings you to Jump?</h1>
    <p className="mt-2 text-[14px] text-ink-2">Pick everything that fits. It helps us show you more of what you came for.</p>
    <div className="mt-6 grid grid-cols-2 gap-2.5">
      {INTERESTS.map(({ value, label, icon: Icon }) => {
        const on = picked.includes(value);
        return <button key={value} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(value)}
          className={cx('relative flex min-h-16 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-transform active:scale-[0.97]', on ? 'border-2 border-ink bg-volt' : 'border-[1.5px] border-line bg-card hover:border-ink')}>
          <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', on ? 'bg-ink text-volt' : 'bg-ink/[0.06] text-ink')}><Icon size={20} /></span>
          <span className="text-[14px] font-bold leading-snug">{label}</span>
          {on && <span className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ink text-volt"><CheckIcon size={12} /></span>}
        </button>;
      })}
    </div>
    <ErrorNotice error={save.error} />
    <button type="button" className="btn-primary mt-6 w-full" disabled={!picked.length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : picked.length ? 'Continue' : 'Pick at least one'}</button>
    <button type="button" className="mx-auto mt-3 block text-[13px] font-semibold text-ink-3 hover:text-ink" onClick={() => { skipInterests(); next(); }}>Skip for now</button>
  </div>;
}
