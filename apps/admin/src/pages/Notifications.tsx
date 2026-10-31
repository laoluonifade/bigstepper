import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, patch } from '../api';
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
  retention: Array<{
    cohort: string;
    day: number;
    matured: number;
    returned: number;
    activeWithin7d: number;
    joinedWithin7d: number;
  }>;
  limitations: string[];
};
export function NotificationsPage() {
  const settings = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => api<Settings>('/admin/notifications/settings'),
  });
  const report = useQuery({
    queryKey: ['notification-performance'],
    queryFn: () => api<Performance>('/admin/notifications/performance'),
    refetchInterval: 60_000,
  });
  const [draft, setDraft] = useState<Settings | null>(null);
  const save = useMutation({
    mutationFn: (value: Settings) => patch('/admin/notifications/settings', value),
    onSuccess: () => {
      void settings.refetch();
      setDraft(null);
    },
  });
  const value = draft ?? settings.data;
  if (!value) return <p>{settings.error ? 'Could not load notification controls.' : 'Loading…'}</p>;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <p>
        New engagement is disabled by default. Validate in staging before enabling delivery. Competitive proximity stays
        unavailable until reliable synchronization evidence exists.
      </p>
      {(['deliveryEnabled', 'newTriggersEnabled'] as const).map((key) => (
        <label key={key} className="block">
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(e) => setDraft({ ...value, [key]: e.target.checked })}
          />{' '}
          {key === 'deliveryEnabled' ? 'Allow optional notifications' : 'Enable new engagement triggers'}
        </label>
      ))}
      {(['pushDaily', 'emailWeekly', 'holdoutPercent', 'rolloutPercent'] as const).map((key) => (
        <label key={key} className="block">
          {key === 'pushDaily'
            ? 'Daily optional push limit'
            : key === 'emailWeekly'
              ? 'Weekly engagement email limit'
              : key === 'rolloutPercent'
                ? 'Rollout percent (start small)'
                : 'Holdout percent (freeze during experiment)'}{' '}
          <input
            className="w-20 rounded border p-1"
            type="number"
            min={0}
            max={key === 'holdoutPercent' || key === 'rolloutPercent' ? 100 : 10}
            value={value[key]}
            onChange={(e) => setDraft({ ...value, [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <fieldset>
        <legend className="font-semibold">Triggers</legend>
        {Object.entries(value.triggers).map(([key, on]) => (
          <label key={key} className="block">
            <input
              type="checkbox"
              disabled={key === 'proximity'}
              checked={on}
              onChange={(e) => setDraft({ ...value, triggers: { ...value.triggers, [key]: e.target.checked } })}
            />{' '}
            {key}
          </label>
        ))}
      </fieldset>
      <button
        className="rounded bg-ink px-3 py-2 text-paper"
        disabled={save.isPending}
        onClick={() => save.mutate(value)}
      >
        Save settings
      </button>
      {save.error && <p role="alert">Could not save settings.</p>}
      {save.isSuccess && <p>Saved.</p>}
      <h2 className="text-lg font-bold">Last 30 days</h2>
      {report.error && <p role="alert">Performance report could not load.</p>}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['Type', 'Channel', 'Status', 'Reason', 'Count'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.data?.delivery.map((d, i) => (
              <tr key={i}>
                <td>{d.type}</td>
                <td>{d.channel}</td>
                <td>{d.status}</td>
                <td>{d.reason ?? '—'}</td>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>{report.data?.events.map((e) => `${e.kind}: ${e.count}`).join(' · ')}</p>
      <h2 className="text-lg font-bold">Retention by exposure cohort</h2>
      <p>Only matured windows count. Compare treatment and holdout; opens alone do not establish impact.</p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Cohort</th>
            <th>Day</th>
            <th>Matured</th>
            <th>Returned</th>
            <th>Active / joined within 7d</th>
          </tr>
        </thead>
        <tbody>
          {report.data?.retention.map((row) => (
            <tr key={`${row.cohort}:${row.day}`}>
              <td>{row.cohort}</td>
              <td>{row.day}</td>
              <td>{row.matured}</td>
              <td>{row.returned}</td>
              <td>
                {row.activeWithin7d} / {row.joinedWithin7d}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.data?.limitations.map((l) => (
        <p key={l} className="text-sm">
          {l}
        </p>
      ))}
    </div>
  );
}
