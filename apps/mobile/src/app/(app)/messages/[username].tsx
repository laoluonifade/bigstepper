import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChatThread, VerifiedName, type Person, type Thread } from '@/components/chat';
import { Avatar, Txt } from '@/components/ui';
import { colors } from '@/lib/theme';

type Conversation = Thread & { runner: Person & { username: string } };

export default function ConversationScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const [runner, setRunner] = useState<Conversation['runner'] | null>(null);
  const onData = useCallback((data: Conversation) => setRunner(data.runner), []);
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
