import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChatThread, VerifiedName, type Person, type Thread } from '@/components/chat';
import { ClubLogo } from '@/components/ClubLogo';
import { Txt } from '@/components/ui';
import { colors } from '@/lib/theme';

type ClubConversation = Thread & {
  club: { id: string; slug: string; name: string; logoUrl: string | null; accentColor: string; verified: boolean; memberCount: number; faces: Person[]; chatLocked: boolean; myRole: 'owner' | 'admin' | 'member' };
  people: Array<Person & { userId: string }>;
};

/** A club's group chat. Members only; the API turns everyone else away. */
export default function ClubChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [club, setClub] = useState<ClubConversation['club'] | null>(null);
  const onData = useCallback((data: ClubConversation) => setClub(data.club), []);
  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <Stack.Screen options={{
      headerTitleAlign: 'left',
      headerTitle: () => club ? <Pressable onPress={() => router.push(`/clubs/${club.slug}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 260 }} accessibilityRole="link">
        <ClubLogo club={club} size={34} />
        <View style={{ flexShrink: 1 }}>
          <VerifiedName name={club.name} verified={club.verified} size={14} />
          <Txt size={12} color="ink2" numberOfLines={1}>{`${club.memberCount} ${club.memberCount === 1 ? 'member' : 'members'}${club.chatLocked ? ' · only managers can send' : ''}`}</Txt>
        </View>
      </Pressable> : <Txt size={15} weight="bold">Club chat</Txt>,
    }} />
    <ChatThread<ClubConversation>
      group
      queryKey={['club-chat', id]}
      path={`/clubs/${encodeURIComponent(id)}/chat`}
      senderOf={(data, senderId) => data.people.find((person) => person.userId === senderId) ?? { displayName: 'Former member', avatarUrl: null }}
      onData={onData}
      empty={(data) => <>
        <View style={{ width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: data.club.accentColor }}><Text style={{ fontSize: 30 }}>👋</Text></View>
        <Txt size={15} weight="bold" style={{ marginTop: 12 }}>Start the {data.club.name} chat</Txt>
        <Txt size={14} color="ink3" align="center">Every member sees it. Plan runs, cheer each other on.</Txt>
      </>}
    />
  </View>;
}
