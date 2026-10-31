import type { QueryClient } from '@tanstack/react-query';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';
import { Storage } from './kv';
import { api, post } from './api';
import { openLink } from './links';
import { colors } from './theme';

const TOKEN_KEY = 'jump_push_token';

/**
 * Loaded only where its native side exists: Expo Go on Android has no remote pushes (and is missing parts
 * of the module), and builds made before pushes were added don't have it at all. There, everything here
 * quietly does nothing instead of crashing the app at launch.
 */
const Notifications: typeof NotificationsModule | null = (() => {
  if (Platform.OS === 'android' && isRunningInExpoGo()) return null;
  try {
    return require('expo-notifications') as typeof NotificationsModule;
  } catch {
    return null;
  }
})();

/** The chat on screen (its link, e.g. "/messages/ada"), set by the chat while it's open. */
let openChat: string | null = null;
export function setOpenChat(link: string | null) {
  openChat = link;
}
const sameChat = (link: unknown) => typeof link === 'string' && openChat !== null && link.toLowerCase() === openChat.toLowerCase();

// A notification that arrives while Jump is open still shows as a banner, with its sound, unless it's
// about the chat you're reading: that message is already appearing in front of you.
try {
  Notifications?.setNotificationHandler({
    handleNotification: async (notification) => {
      const quiet = sameChat(notification.request.content.data?.link);
      return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: !quiet, shouldSetBadge: true };
    },
  });
} catch { /* no native side after all */ }

/** Android files every notification under a channel; messages get their own, so they can be muted alone. */
async function createChannels(notifications: typeof NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await notifications.setNotificationChannelAsync('default', {
    name: 'Activity and competitions', importance: notifications.AndroidImportance.HIGH, vibrationPattern: [0, 200, 120, 200], lightColor: colors.track, sound: 'default',
  });
  await notifications.setNotificationChannelAsync('messages', {
    name: 'Messages', importance: notifications.AndroidImportance.MAX, vibrationPattern: [0, 120, 80, 120], lightColor: colors.track, sound: 'default',
  });
}

/**
 * Asks once for permission and registers this phone with the API, so new notifications (messages,
 * results, invitations, payouts) arrive as pushes. Quietly does nothing where pushes can't work: a
 * simulator, Expo Go on Android, an older build, or a runner who said no.
 */
export async function registerForPush() {
  if (!Notifications) return;
  try {
    await createChannels(Notifications);
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
    await Notifications?.setBadgeCountAsync(0);
  } catch { /* the token expires on its own when it stops working */ }
}

/**
 * While signed in: tapping a notification opens what it's about (also when it launched the app), and
 * one arriving in the foreground refreshes the inbox and bell straight away.
 */
export function listenForPush(queryClient: QueryClient) {
  if (!Notifications) return () => undefined;
  const notifications = Notifications;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  // A tap that launched the app can be reported twice (as the last response and to the listener).
  const handled = new Set<string>();
  // Navigating before the root navigator has mounted throws (and in a release build, closes the app),
  // which is what a tap that launches Jump from closed would hit: keep trying until it's up.
  const openWhenReady = (link: string, attempt = 0) => {
    try {
      openLink(link);
    } catch {
      if (attempt >= 20) return;
      const timer = setTimeout(() => { timers.delete(timer); openWhenReady(link, attempt + 1); }, 250);
      timers.add(timer);
    }
  };
  const open = (response: NotificationsModule.NotificationResponse | null) => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    // Handled: don't replay it when this runs again (signing back in, say).
    try { notifications.clearLastNotificationResponse(); } catch { /* older native side */ }
    const notificationId=response.notification.request.content.data?.id;
    if(typeof notificationId==='string') void post(`/notifications/${notificationId}/click`).catch(()=>undefined);
    const link = response.notification.request.content.data?.link;
    if (typeof link === 'string' && link) openWhenReady(link);
  };
  try {
    // One that launched the app opens as soon as navigation is up.
    const launched = Notifications.getLastNotificationResponse();
    const timer = launched ? setTimeout(() => open(launched), 300) : null;
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    const received = Notifications.addNotificationReceivedListener((notification) => {
      // Same keys as lib/queries (not imported: queries → auth → push would be a cycle).
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      // A message for an open chat: fetch it now rather than at the next poll.
      if (sameChat(notification.request.content.data?.link)) void queryClient.invalidateQueries({ queryKey: ['club-chat'] });
      // A podium finish: fetch trophies now, so the "you won" moment shows straight away.
      if (notification.request.content.data?.type === 'PODIUM') void queryClient.invalidateQueries({ queryKey: ['trophies'] });
    });
    return () => { if (timer) clearTimeout(timer); timers.forEach(clearTimeout); tapped.remove(); received.remove(); };
  } catch {
    return () => undefined;
  }
}

/** Keeps the app icon's badge at the unread count as notifications are read in the app. */
export function setAppBadge(count: number) {
  void Notifications?.setBadgeCountAsync(count).catch(() => undefined);
}
