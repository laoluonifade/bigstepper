import type { QueryClient } from '@tanstack/react-query';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Storage } from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';
import { api, post } from './api';
import { openLink } from './links';
import { colors } from './theme';

const TOKEN_KEY = 'jump_push_token';

// A notification that arrives while Jump is open still shows as a banner, with its sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

/** Android files every notification under a channel; messages get their own, so they can be muted alone. */
async function createChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Activity and competitions', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 200, 120, 200], lightColor: colors.track, sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 120, 80, 120], lightColor: colors.track, sound: 'default',
  });
}

/**
 * Asks once for permission and registers this phone with the API, so new notifications (messages,
 * results, invitations, payouts) arrive as pushes. Quietly does nothing where pushes can't work: a
 * simulator, Android in Expo Go, or a runner who said no.
 */
export async function registerForPush() {
  if (Platform.OS === 'android' && isRunningInExpoGo()) return; // Expo Go on Android has no remote pushes
  try {
    await createChannels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await post('/notifications/push-token', { token, platform: Platform.OS });
    Storage.setItemSync(TOKEN_KEY, token);
  } catch { /* pushes are a bonus; the in-app inbox still has everything */ }
}

/** Signing out: this phone stops getting that runner's pushes. Call before the session is cleared. */
export async function unregisterForPush() {
  try {
    const token = Storage.getItemSync(TOKEN_KEY);
    if (token) await api('/notifications/push-token', { method: 'DELETE', body: { token } });
    Storage.removeItemSync(TOKEN_KEY);
    await Notifications.setBadgeCountAsync(0);
  } catch { /* the token expires on its own when it stops working */ }
}

/**
 * While signed in: tapping a notification opens what it's about (also when it launched the app), and
 * one arriving in the foreground refreshes the inbox and bell straight away.
 */
export function listenForPush(queryClient: QueryClient) {
  const open = (response: Notifications.NotificationResponse | null) => {
    const link = response?.notification.request.content.data?.link;
    if (typeof link === 'string' && link) openLink(link);
  };
  // One that launched the app opens once navigation is up.
  const launched = Notifications.getLastNotificationResponse();
  const timer = launched ? setTimeout(() => open(launched), 600) : null;
  const tapped = Notifications.addNotificationResponseReceivedListener(open);
  const received = Notifications.addNotificationReceivedListener(() => {
    // Same keys as lib/queries (not imported: queries → auth → push would be a cycle).
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['messages', 'unread'] });
  });
  return () => { if (timer) clearTimeout(timer); tapped.remove(); received.remove(); };
}

/** Keeps the app icon's badge at the unread count as notifications are read in the app. */
export function setAppBadge(count: number) {
  void Notifications.setBadgeCountAsync(count).catch(() => undefined);
}
