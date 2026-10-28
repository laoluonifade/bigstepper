import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ChatThread, GroupMark, type Person, type Thread } from '@/components/chat';
import { Txt } from '@/components/ui';
import { colors } from '@/lib/theme';

type GroupConversation = Thread & {
  group: { id: string; slug: string; name: string; description: string | null; memberCount: number; faces: Person[]; myRole: 'admin' | 'member' };
  people: Array<Person & { userId: string }>;
};

/** A group chat Jump runs, like Jump Hosts: everyone who belongs is already in it, nobody joins or leaves. */
export default function GroupChatScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [group, setGroup] = useState<GroupConversation['group'] | null>(null);
  const onData = useCallback((data: GroupConversation) => setGroup(data.group), []);
  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <Stack.Screen options={{
      headerTitleAlign: 'left',
      headerTitle: () => group ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 260 }}>
        <GroupMark size={34} />
        <View style={{ flexShrink: 1 }}>
          <Txt size={14} weight="bold" numberOfLines={1}>{group.name}</Txt>
          <Txt size={12} color="ink2" numberOfLines={1}>{`${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}`}</Txt>
        </View>
      </View> : <Txt size={15} weight="bold">Group</Txt>,
    }} />
    <ChatThread<GroupConversation>
      group
      queryKey={['group-chat', slug]}
      path={`/messages/groups/${encodeURIComponent(slug)}`}
      senderOf={(data, senderId) => data.people.find((person) => person.userId === senderId) ?? { displayName: 'Former member', avatarUrl: null }}
      onData={onData}
      empty={(data) => <>
        <GroupMark size={64} />
        <Txt size={15} weight="bold" style={{ marginTop: 12 }}>{data.group.name}</Txt>
        <Txt size={14} color="ink3" align="center">{data.group.description ?? 'Say hello to the group.'}</Txt>
      </>}
    />
  </View>;
}
