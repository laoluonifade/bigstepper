import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationPreferences as Preferences,
} from '@jump/shared/notification-preferences';
import { api, patch } from '@/lib/api';
import { Button, ErrorNotice, TextField, Txt } from '@/components/ui';
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
      <View>
        <Txt>Loading notification preferences…</Txt>
        <ErrorNotice error={query.error} />
      </View>
    );
  const update = (changes: Partial<Preferences>) =>
    setDraft({ ...value, timeZone: value.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, ...changes });
  return (
    <View style={{ gap: 12, marginTop: 20 }}>
      <Txt weight="bold">Notification preferences</Txt>
      <Txt size={12}>Security, payment and registered-event messages remain available.</Txt>
      {Object.entries(NOTIFICATION_CATEGORIES).map(([key, label]) => (
        <View key={key} style={{ gap: 6 }}>
          <Txt size={14} weight="semibold">
            {label}
          </Txt>
          {(['push', 'email', 'inapp'] as const).map((channel) => (
            <View key={channel} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt size={13}>{channel === 'inapp' ? 'In app' : channel === 'push' ? 'Phone push' : 'Email'}</Txt>
              <Switch
                accessibilityLabel={`${label}: ${channel}`}
                value={value.categories[key as keyof typeof NOTIFICATION_CATEGORIES]?.[channel] !== false}
                onValueChange={(on) =>
                  update({
                    categories: {
                      ...value.categories,
                      [key]: { ...value.categories[key as keyof typeof NOTIFICATION_CATEGORIES], [channel]: on },
                    },
                  })
                }
              />
            </View>
          ))}
        </View>
      ))}
      <TextField
        label="Time zone"
        value={value.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
        onChangeText={(timeZone) => update({ timeZone })}
      />
      <TextField
        label="Quiet hours start (0–23)"
        keyboardType="number-pad"
        value={String(value.quietStart)}
        onChangeText={(s) => update({ quietStart: Number(s) })}
      />
      <TextField
        label="Quiet hours end (0–23)"
        keyboardType="number-pad"
        value={String(value.quietEnd)}
        onChangeText={(s) => update({ quietEnd: Number(s) })}
      />
      <Button
        title="Save notification preferences"
        disabled={save.isPending}
        onPress={() =>
          save.mutate({ ...value, timeZone: value.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone })
        }
      />
      <ErrorNotice error={save.error} />
      {save.isSuccess && <Txt size={12}>Preferences saved.</Txt>}
    </View>
  );
}
