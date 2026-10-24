import { usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useNotifications } from '@/lib/queries';
import { useRecorder } from '@/lib/recorder';
import { colors, fontFamily } from '@/lib/theme';

/** The web's mobile tab bar, as the platform's own: UITabBar on iOS, a Material bar on Android. */
export default function TabsLayout() {
  const recorder = useRecorder();
  const unread = useNotifications().data?.filter((item) => !item.readAt).length ?? 0;
  const live = recorder.phase === 'recording' || recorder.phase === 'paused';
  // The live scoreboard fills the screen, like the web's; minimising it brings the tabs back.
  const fullscreen = usePathname() === '/run' && (live || recorder.phase === 'finishing');
  return <NativeTabs
    hidden={fullscreen}
    backgroundColor={colors.paper}
    tintColor={colors.ink}
    iconColor={{ default: colors.ink3, selected: colors.ink }}
    indicatorColor={colors.volt}
    labelStyle={{ default: { fontFamily: fontFamily('semibold'), fontSize: 10, color: colors.ink3 }, selected: { fontFamily: fontFamily('black'), fontSize: 10, color: colors.ink } }}
    badgeBackgroundColor={colors.track}
    labelVisibilityMode="labeled"
  >
    <NativeTabs.Trigger name="dashboard">
      <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="competitions">
      <NativeTabs.Trigger.Label>Compete</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} md="emoji_events" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="run">
      <NativeTabs.Trigger.Label>{live ? 'Live' : 'Run'}</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf="figure.run" md="directions_run" />
      <NativeTabs.Trigger.Badge hidden={!live}>{recorder.phase === 'paused' ? 'II' : '●'}</NativeTabs.Trigger.Badge>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="feed">
      <NativeTabs.Trigger.Label>Rant</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} md="forum" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="you">
      <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
      <NativeTabs.Trigger.Badge hidden={unread === 0}>{unread > 9 ? '9+' : String(unread)}</NativeTabs.Trigger.Badge>
    </NativeTabs.Trigger>
  </NativeTabs>;
}
