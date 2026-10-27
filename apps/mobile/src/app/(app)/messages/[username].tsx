import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ActionMenu } from '@/components/ActionMenu';
import { ChatThread, VerifiedName, type Person, type Thread } from '@/components/chat';
import { blockRunner, openReport, unblockRunner } from '@/components/Safety';
import { Avatar, Txt } from '@/components/ui';
import { colors } from '@/lib/theme';

type Conversation = Thread & { runner: Person & { username: string }; blockedByMe?: boolean };

export default function ConversationScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const queryClient = useQueryClient();
  const [runner, setRunner] = useState<Conversation['runner'] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const onData = useCallback((data: Conversation) => { setRunner(data.runner); setBlocked(Boolean(data.blockedByMe)); }, []);
  const name = runner?.displayName ?? `@${username}`;
  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <Stack.Screen options={{
      headerTitleAlign: 'left',
      headerTitle: () => <Pressable onPress={() => router.push(`/runners/${username}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 260 }} accessibilityRole="link">
        <Avatar name={runner?.displayName ?? username} src={runner?.avatarUrl} avatarStyle={runner?.avatarStyle} size={34} round />
        <View style={{ flexShrink: 1 }}>
          <VerifiedName name={runner?.displayName ?? username} verified={runner?.verified} size={14} />
          <Txt size={12} color="ink2" numberOfLines={1}>@{username}</Txt>
        </View>
      </Pressable>,
      headerRight: () => <ActionMenu label="Conversation options" actions={[
        { label: 'View profile', run: () => router.push(`/runners/${username}`) },
        { label: `Report ${name}`, run: () => openReport({ targetType: 'profile', target: username, name }) },
        blocked
          ? { label: `Unblock @${username}`, run: () => void unblockRunner(queryClient, username, name) }
          : { label: `Block @${username}`, danger: true, run: () => void blockRunner(queryClient, username, name) },
      ]} />,
    }} />
    <ChatThread<Conversation>
      queryKey={['messages', username]}
      path={`/messages/${encodeURIComponent(username)}`}
      senderOf={(data) => data.runner}
      onData={onData}
      empty={(data) => <>
        <Avatar name={data.runner.displayName} src={data.runner.avatarUrl} avatarStyle={data.runner.avatarStyle} size={72} round />
        <Txt size={15} weight="bold" style={{ marginTop: 12 }}>{data.runner.displayName}</Txt>
        <Txt size={14} color="ink3">Say hello 👋</Txt>
      </>}
    />
  </View>;
}
