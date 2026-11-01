import { formatRelative } from '@jump/shared/format';
import type { AppleHealthStatus } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '../components/ConfirmDialog';
import { ErrorNotice, PageHeader } from '../components/ui';
import { api, patch } from '../lib/api';
import { StravaConnection } from './Strava';
import { YouBack } from './You';

const ROW = 'flex items-center gap-3 px-4 py-4';

/** Apps that send walks, runs and rides into Jump, in one place instead of on the profile card. */
export function ConnectionsPage() {
  return <div className="animate-rise">
    <YouBack />
    <PageHeader eyebrow="You" title="Connections" />
    <div className="mx-auto max-w-2xl">
      <p className="text-[14px] leading-relaxed text-ink-2">Bring in walks, runs and rides you record with other apps and watches. Each one is checked like any Jump activity before it counts on a leaderboard.</p>
      <div className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card">
        <StravaConnection className={ROW} />
        <AppleHealthConnection />
      </div>
    </div>
  </div>;
}

function HealthMark() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.4 10.6 20.1C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6L12 21.4Z" /></svg>;
}

/** Apple Health only connects from the iPhone app; here it shows the link and can undo it. */
function AppleHealthConnection() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['apple-health'], queryFn: () => api<AppleHealthStatus>('/apple-health') });
  const confirm = useConfirm();
  const disconnect = useMutation({
    mutationFn: () => api<AppleHealthStatus>('/apple-health', { method: 'DELETE' }),
    onSuccess(next) {
      queryClient.setQueryData(['apple-health'], next);
      void queryClient.invalidateQueries();
    },
  });
  const share = useMutation({
    mutationFn: (shareSteps: boolean) => patch<AppleHealthStatus>('/apple-health', { shareSteps }),
    onSuccess: (next) => queryClient.setQueryData(['apple-health'], next),
  });
  const data = status.data;
  return <div className="px-4 py-4">
    <div className="flex items-center gap-3">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#FF2D55] text-white"><HealthMark /></span>
    <div className="min-w-0 flex-1">
      <p className="text-[14px] font-bold">Apple Health</p>
      <p className="text-[12px] text-ink-2">
        {status.isPending ? 'Checking…'
          : !data?.connected ? 'Connect from the Jump app on your iPhone to import workouts and daily steps'
            : data.lastSyncedAt ? `Synced ${formatRelative(data.lastSyncedAt)} from your iPhone` : 'Connected on your iPhone'}
      </p>
      <ErrorNotice error={status.error ?? disconnect.error ?? share.error} className="mt-2" />
    </div>
    {data?.connected && <button type="button" className="text-[13px] font-semibold text-ink-2 underline-offset-2 hover:text-bad hover:underline" disabled={disconnect.isPending} onClick={() => confirm.ask({ title: 'Disconnect Apple Health?', body: 'Jump deletes the workouts and daily steps it imported from Apple Health, and they stop counting in competitions that are still running. Nothing in Apple Health itself changes.', confirmLabel: 'Disconnect', danger: true, onConfirm: () => disconnect.mutate() })}>
      {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
    </button>}
    </div>
    {data?.connected && <label className="mt-3 flex cursor-pointer items-center gap-3 pl-12">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">Post my daily steps to Rant</span>
        <span className="block text-[12px] text-ink-2">Once a day at 9pm, for days with at least 500 steps. Your followers see it.</span>
      </span>
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#121212]" checked={data.shareSteps !== false} disabled={share.isPending} onChange={(event) => share.mutate(event.target.checked)} />
    </label>}
    {confirm.dialog}
  </div>;
}
