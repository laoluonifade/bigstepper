import { formatDateTime, formatDistance } from '@jump/shared/format';
import type { Activity, RunSession } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Button, Card, ErrorNotice, KeyValue, Loading, Notice, PageHeader, Screen } from '@/components/ui';
import { api, post } from '@/lib/api';
import { keys, useActivities, useUnit } from '@/lib/queries';
import { useRecorder } from '@/lib/recorder';

/** A specific server-side activity session, e.g. one started on another device. */
export default function RunSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recorder = useRecorder();
  const unit = useUnit();
  const queryClient = useQueryClient();
  const run = useQuery({ queryKey: keys.run(id), queryFn: () => api<RunSession>(`/runs/${id}`), enabled: recorder.session?.id !== id });
  const activities = useActivities();
  const activity = activities.data?.find((item) => item.runningSessionId === id);
  const finishRemote = useMutation({
    mutationFn: () => post<Activity>(`/runs/${id}/finish`),
    onSuccess(result) {
      void queryClient.invalidateQueries({ queryKey: keys.activities });
      router.replace(`/activities/${result.id}`);
    },
  });

  useEffect(() => {
    if (activity) router.replace(`/activities/${activity.id}`);
  }, [activity]);

  if (recorder.session?.id === id) return <Redirect href="/run" />;
  if (run.isLoading) return <Screen><Loading /></Screen>;
  if (run.error || !run.data) return <Screen><ErrorNotice error={run.error} onRetry={() => void run.refetch()} /></Screen>;

  const inProgress = run.data.status === 'RUNNING' || run.data.status === 'PAUSED';
  return <Screen>
    <Stack.Screen options={{ title: 'Activity session' }} />
    <PageHeader eyebrow="Activity session" title={inProgress ? `${run.data.activityType} in progress` : run.data.activityType} />
    <Card style={{ padding: 20 }}>
      <KeyValue items={[
        { label: 'Status', value: run.data.status === 'PAUSED' ? 'Paused' : run.data.status === 'RUNNING' ? 'Recording' : run.data.status.replace(/_/g, ' ').toLowerCase() },
        { label: 'Started', value: formatDateTime(run.data.startedAt) },
        { label: 'Uploaded distance', value: formatDistance(run.data.distanceMetres, unit) },
      ]} />
    </Card>
    {inProgress && <>
      <Notice tone="info" title="This activity was started on another device" style={{ marginTop: 20 }}>
        {`GPS points are recorded by the device that started it. You can finish it from here and it’ll be submitted with the ${formatDistance(run.data.distanceMetres, unit)} already uploaded.`}
      </Notice>
      <ErrorNotice error={finishRemote.error} />
      <Button variant="secondary" style={{ marginTop: 20 }} title={finishRemote.isPending ? 'Finishing…' : 'Finish activity'} loading={finishRemote.isPending} onPress={() => finishRemote.mutate()} />
    </>}
  </Screen>;
}
