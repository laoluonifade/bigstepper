import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api, patch } from '../api';
import { toast } from '../toast';
import { cx, ErrorNotice, Field, Notice, PageHeader, Skeleton } from '../ui';

type Settings = {
  deliveryEnabled: boolean;
  newTriggersEnabled: boolean;
  pushDaily: number;
  emailWeekly: number;
  rolloutPercent: number;
  holdoutPercent: number;
  triggers: Record<string, boolean>;
};
type Performance = {
  delivery: Array<{ type: string; channel: string; status: string; reason: string | null; count: number }>;
  events: Array<{ kind: string; count: number }>;
  retention: Array<{ cohort: string; day: number; matured: number; returned: number; activeWithin7d: number; joinedWithin7d: number }>;
  limitations: string[];
};

const TRIGGERS: Record<string, { name: string; detail: string; group: 'Steps' | 'Training' | 'Competitions' }> = {
  stepsBoard: { group: 'Steps', name: 'Morning step board', detail: '8–10am: yesterday’s rank among everyone they follow. Apple Health only.' },
  stepMilestones: { group: 'Steps', name: 'Step milestones', detail: 'The moment someone passes 10,000 steps or sets a personal best.' },
  stepNudges: { group: 'Steps', name: 'Evening nudge', detail: '6–7pm when they’re under 5,000 steps, naming a friend just ahead.' },
  healthConnect: { group: 'Steps', name: 'Connect Health reminder', detail: 'iPhone users without Apple Health. Every 3 days, at most 4 times.' },
  friendsMoving: { group: 'Steps', name: 'Friends are moving', detail: '12–2pm: who they follow is already out, if they haven’t moved yet. Everyone, with or without Health.' },
  streak: { group: 'Training', name: 'Streak reminders', detail: '6–8pm push (plus the email) when they moved yesterday but not yet today. Counts 3,000 Health steps as moving.' },
  weeklyRecap: { group: 'Training', name: 'Weekly recap', detail: 'Last week’s walks, runs and club totals.' },
  weeklyGoal: { group: 'Training', name: 'Weekly goal', detail: 'When someone hits their weekly distance goal.' },
  digest: { group: 'Competitions', name: 'Competition digest', detail: 'New competitions worth joining.' },
  competitionCheckins: { group: 'Competitions', name: 'Daily standing', detail: '4–6pm: their place in the competition where a move matters most, and the gap to the next person.' },
  deadlines: { group: 'Competitions', name: 'Starting and ending soon', detail: 'Competitions they’re in that open or close shortly.' },
  proximity: { group: 'Competitions', name: 'Close races', detail: 'Unavailable until step sync is reliable enough to call a race close.' },
};

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors disabled:opacity-40', on ? 'bg-track' : 'bg-card')}>
      <span className={cx('absolute top-0.5 size-5 rounded-full border-2 border-ink bg-white transition-[left]', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

function Row({ title, detail, children }: { title: ReactNode; detail?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">{title}</p>
        {detail && <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{detail}</p>}
      </div>
      {children}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="wide text-[13px] font-bold uppercase tracking-[0.06em]">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-ink-2">{description}</p>}
      <div className="panel mt-3 divide-y divide-line">{children}</div>
    </section>
  );
}

/** Why optional engagement isn't reaching people right now, if it isn't. */
function status(value: Settings) {
  if (!value.deliveryEnabled) return { tone: 'bad' as const, title: 'Optional notifications are off', body: 'Only essential messages (payouts, prizes, DMs) are going out.' };
  if (!value.newTriggersEnabled) return { tone: 'warn' as const, title: 'Engagement triggers are off', body: 'Step boards, nudges, recaps and reminders aren’t being created.' };
  if (value.rolloutPercent <= 0) return { tone: 'warn' as const, title: 'Rollout is 0%', body: 'Triggers are on but nobody is in the rollout, so nothing is created. Raise the rollout to start sending.' };
  const reach = Math.round(value.rolloutPercent * (100 - value.holdoutPercent) / 100);
  return { tone: 'ok' as const, title: `Live for about ${reach}% of people`, body: `${value.rolloutPercent}% rollout, with ${value.holdoutPercent}% held back for comparison. Up to ${value.pushDaily} optional pushes a day each, 8am–9pm their time.` };
}

export function NotificationsPage() {
  const settings = useQuery({ queryKey: ['notification-settings'], queryFn: () => api<Settings>('/admin/notifications/settings') });
  const report = useQuery({ queryKey: ['notification-performance'], queryFn: () => api<Performance>('/admin/notifications/performance'), refetchInterval: 60_000 });
  const [draft, setDraft] = useState<Settings | null>(null);
  const save = useMutation({
    mutationFn: (value: Settings) => patch('/admin/notifications/settings', value),
    onSuccess: () => { void settings.refetch(); setDraft(null); toast({ tone: 'ok', message: 'Saved. Changes apply within 15 minutes.' }); },
  });
  const value = draft ?? settings.data;
  const set = (change: Partial<Settings>) => value && setDraft({ ...value, ...change });
  const number = (key: 'pushDaily' | 'emailWeekly' | 'rolloutPercent' | 'holdoutPercent', max: number) => (raw: string) =>
    set({ [key]: Math.max(0, Math.min(max, Math.round(Number(raw) || 0))) });

  return <>
    <PageHeader eyebrow="Engagement" title="Notifications" description="The pushes and emails that bring people back each day: what’s switched on, how many each person can get, and how they’re landing." />
    <ErrorNotice error={settings.error} onRetry={() => void settings.refetch()} />
    <ErrorNotice error={save.error} />

    {!value ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div> : <div className="space-y-8">
      {(() => { const s = status(value); return <Notice tone={s.tone} title={s.title}>{s.body}</Notice>; })()}

      <Section title="Switches">
        <Row title="Optional notifications" detail="Everything that isn’t essential. Off stops all of it at once.">
          <Toggle label="Optional notifications" on={value.deliveryEnabled} onChange={(on) => set({ deliveryEnabled: on })} />
        </Row>
        <Row title="Engagement triggers" detail="The step board, nudges, recaps and reminders below.">
          <Toggle label="Engagement triggers" on={value.newTriggersEnabled} onChange={(on) => set({ newTriggersEnabled: on })} />
        </Row>
      </Section>

      <Section title="Reach and limits" description="Rollout picks who gets engagement triggers. Holdout keeps a slice of them without, so you can see whether pushes actually bring people back.">
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Rollout" hint="Percent of people who get engagement triggers. 100 for everyone.">
            {(props) => <div className="relative"><input {...props} className="field pr-10" type="number" min={0} max={100} value={value.rolloutPercent} onChange={(e) => number('rolloutPercent', 100)(e.target.value)} /><span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3">%</span></div>}
          </Field>
          <Field label="Holdout" hint="Kept without triggers for comparison. Don’t change it mid-experiment.">
            {(props) => <div className="relative"><input {...props} className="field pr-10" type="number" min={0} max={100} value={value.holdoutPercent} onChange={(e) => number('holdoutPercent', 100)(e.target.value)} /><span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3">%</span></div>}
          </Field>
          <Field label="Pushes a day" hint="Optional pushes per person per day. DMs and payouts don’t count.">
            {(props) => <input {...props} className="field" type="number" min={0} max={20} value={value.pushDaily} onChange={(e) => number('pushDaily', 20)(e.target.value)} />}
          </Field>
          <Field label="Emails a week" hint="Engagement emails per person per week.">
            {(props) => <input {...props} className="field" type="number" min={0} max={20} value={value.emailWeekly} onChange={(e) => number('emailWeekly', 20)(e.target.value)} />}
          </Field>
        </div>
      </Section>

      {(['Steps', 'Training', 'Competitions'] as const).map((group) => (
        <Section key={group} title={group}>
          {Object.entries(TRIGGERS).filter(([, trigger]) => trigger.group === group).map(([key, trigger]) => (
            <Row key={key} title={trigger.name} detail={trigger.detail}>
              <Toggle label={trigger.name} on={Boolean(value.triggers[key])} disabled={key === 'proximity' || !value.newTriggersEnabled}
                onChange={(on) => set({ triggers: { ...value.triggers, [key]: on } })} />
            </Row>
          ))}
        </Section>
      ))}

      {draft && <div className="panel-strong sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-4 px-4 py-3 shadow-hard lg:bottom-6">
        <p className="text-[14px] font-semibold">Unsaved changes</p>
        <div className="flex gap-2">
          <button type="button" className="btn-quiet btn-sm" onClick={() => setDraft(null)}>Discard</button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate(draft)}>{save.isPending ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>}

      <Performance report={report.data} loading={report.isLoading} error={report.error} />
    </div>}

  </>;
}

const REASONS: Record<string, string> = {
  no_device: 'No phone registered', quiet_hours: 'Quiet hours', frequency_limit: 'Daily limit reached', push_preferred: 'Sent as push instead',
  outside_rollout: 'Outside rollout', holdout: 'Holdout', trigger_disabled: 'Trigger off', feature_disabled: 'Triggers off', delivery_disabled: 'Optional off',
  preference: 'Turned off by them', insignificant_update: 'Too small to send', other_channel: 'Other channel only', user_unavailable: 'Account gone',
};

function Performance({ report, loading, error }: { report?: Performance; loading: boolean; error: unknown }) {
  const rows = report?.delivery ?? [];
  const totals = (channel: string) => {
    const mine = rows.filter((row) => row.channel === channel);
    const sent = mine.filter((row) => row.status !== 'suppressed').reduce((sum, row) => sum + row.count, 0);
    return { sent, held: mine.reduce((sum, row) => sum + row.count, 0) - sent };
  };
  const held = Object.entries(rows.filter((row) => row.status === 'suppressed' && row.reason).reduce<Record<string, number>>((acc, row) => {
    acc[row.reason!] = (acc[row.reason!] ?? 0) + row.count; return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const heldMax = held[0]?.[1] ?? 1;

  return <section className="space-y-4">
    <h2 className="wide text-[13px] font-bold uppercase tracking-[0.06em]">Last 30 days</h2>
    <ErrorNotice error={error} />
    {loading ? <Skeleton className="h-40" /> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        {(['push', 'email', 'inapp'] as const).map((channel) => { const t = totals(channel); return (
          <div key={channel} className="panel p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">{channel === 'inapp' ? 'In app' : channel === 'push' ? 'Push' : 'Email'}</p>
            <p className="wide mt-1 text-[28px] font-black tabular-nums">{t.sent.toLocaleString()}</p>
            <p className="text-[12.5px] text-ink-2">sent · {t.held.toLocaleString()} held back</p>
          </div>
        ); })}
      </div>

      {held.length > 0 && <div className="panel p-5">
        <p className="text-[14px] font-semibold">Why notifications were held back</p>
        <div className="mt-3 space-y-2">
          {held.map(([reason, count]) => <div key={reason} className="grid grid-cols-[10rem_1fr_3.5rem] items-center gap-3 text-[13px]">
            <span className="truncate text-ink-2">{REASONS[reason] ?? reason}</span>
            <span className="h-2 rounded-full bg-ink/[0.06]"><span className="block h-full rounded-full bg-ink" style={{ width: `${(count / heldMax) * 100}%` }} /></span>
            <span className="text-right font-semibold tabular-nums">{count.toLocaleString()}</span>
          </div>)}
        </div>
      </div>}

      <details className="panel">
        <summary className="cursor-pointer px-5 py-4 text-[14px] font-semibold">Every type, channel and outcome</summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="border-b border-line text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
              <tr>{['Type', 'Channel', 'Outcome', 'Count'].map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr>
            </thead>
            <tbody className="[&_tr+tr]:border-t [&_tr+tr]:border-line">
              {rows.map((row, index) => <tr key={index}>
                <td className="px-4 py-2 font-mono text-[12px]">{row.type}</td>
                <td className="px-4 py-2">{row.channel}</td>
                <td className="px-4 py-2">{row.status === 'suppressed' ? <span className="text-ink-2">{REASONS[row.reason ?? ''] ?? row.reason}</span> : row.status}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.count.toLocaleString()}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </>}

    {report && report.retention.length > 0 && <div className="panel overflow-x-auto">
      <div className="px-5 pt-4">
        <p className="text-[14px] font-semibold">Coming back: treatment vs holdout</p>
        <p className="mt-0.5 text-[13px] text-ink-2">Only finished windows count. Compare the two cohorts; opens alone don’t prove the pushes work.</p>
      </div>
      <table className="mt-3 w-full min-w-[520px] text-left text-[13px]">
        <thead className="border-y border-line text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
          <tr>{['Cohort', 'Day', 'People', 'Came back', 'Active / joined in 7d'].map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr>
        </thead>
        <tbody className="[&_tr+tr]:border-t [&_tr+tr]:border-line">
          {report.retention.map((row) => <tr key={`${row.cohort}:${row.day}`}>
            <td className="px-4 py-2 capitalize">{row.cohort}</td>
            <td className="px-4 py-2 tabular-nums">{row.day}</td>
            <td className="px-4 py-2 tabular-nums">{row.matured}</td>
            <td className="px-4 py-2 tabular-nums">{row.returned}{row.matured ? <span className="text-ink-3"> · {Math.round((row.returned / row.matured) * 100)}%</span> : null}</td>
            <td className="px-4 py-2 tabular-nums">{row.activeWithin7d} / {row.joinedWithin7d}</td>
          </tr>)}
        </tbody>
      </table>
      {report.limitations.length > 0 && <ul className="space-y-1 border-t border-line px-5 py-3 text-[12px] text-ink-3">{report.limitations.map((line) => <li key={line}>{line}</li>)}</ul>}
    </div>}
  </section>;
}
