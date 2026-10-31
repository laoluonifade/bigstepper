import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationPreferences as Preferences,
} from '@jump/shared/notification-preferences';
import { api, patch } from '../lib/api';

export function NotificationPreferences() {
  const query = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api<Preferences>('/notifications/preferences'),
  });
  const [draft, setDraft] = useState<Preferences | null>(null);
  const save = useMutation({
    mutationFn: (value: Preferences) => patch('/notifications/preferences', value),
    onSuccess: () => {
      void query.refetch();
      setDraft(null);
    },
  });
  const value = draft ?? query.data;
  if (!value)
    return (
      <p role="status">
        {query.error ? 'Notification preferences could not load.' : 'Loading notification preferences…'}
      </p>
    );
  const update = (changes: Partial<Preferences>) =>
    setDraft({ ...value, timeZone: value.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, ...changes });
  return (
    <section className="mt-5 space-y-3 border-t border-line pt-4">
      <h3 className="font-semibold">Notification preferences</h3>
      <p className="text-sm text-ink-3">
        Choose optional updates. Security, payments and registered-event messages remain available.
      </p>
      {Object.entries(NOTIFICATION_CATEGORIES).map(([key, label]) => (
        <fieldset key={key} className="space-y-1">
          <legend className="text-sm font-medium">{label}</legend>
          <div className="flex gap-4">
            {(['push', 'email', 'inapp'] as const).map((channel) => (
              <label key={channel} className="text-sm">
                <input
                  type="checkbox"
                  checked={value.categories[key as keyof typeof NOTIFICATION_CATEGORIES]?.[channel] !== false}
                  onChange={(e) =>
                    update({
                      categories: {
                        ...value.categories,
                        [key]: {
                          ...value.categories[key as keyof typeof NOTIFICATION_CATEGORIES],
                          [channel]: e.target.checked,
                        },
                      },
                    })
                  }
                />{' '}
                {channel === 'inapp' ? 'In app' : channel === 'push' ? 'Phone push' : 'Email'}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <label className="block text-sm">
        Time zone{' '}
        <input
          className="rounded border p-1"
          value={value.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
          onChange={(e) => update({ timeZone: e.target.value })}
        />
      </label>
      <div className="flex gap-3">
        {(['quietStart', 'quietEnd'] as const).map((key) => (
          <label key={key} className="text-sm">
            Quiet hours {key === 'quietStart' ? 'from' : 'until'}
            <input
              aria-label={key === 'quietStart' ? 'Quiet hours start' : 'Quiet hours end'}
              type="number"
              min={0}
              max={23}
              className="ml-2 w-14 rounded border p-1"
              value={value[key]}
              onChange={(e) => update({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="rounded bg-ink px-3 py-2 text-paper"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({ ...value, timeZone: value.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone })
        }
      >
        {save.isPending ? 'Saving…' : 'Save notification preferences'}
      </button>
      {save.error && <p role="alert">Could not save preferences. Check the time zone and try again.</p>}
      {save.isSuccess && <p role="status">Preferences saved.</p>}
    </section>
  );
}
