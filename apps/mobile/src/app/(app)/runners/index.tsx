import type { RunnerSearchResult } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SearchIcon } from '@/components/icons';
import { Avatar, ErrorNotice, Screen, Skeleton, Txt, VerifiedTick } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, fontFamily, GUTTER, radius } from '@/lib/theme';

export default function RunnersScreen() {
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim().replace(/^@/, '')), 180);
    return () => clearTimeout(timer);
  }, [text]);
  const runners = useQuery({ queryKey: ['runner-search', term], queryFn: () => api<RunnerSearchResult[]>(`/users/search?q=${encodeURIComponent(term)}`), enabled: term.length >= 2 });

  return <Screen padded={false}>
    <Stack.Screen options={{ title: 'Find runners' }} />
    <View style={{ padding: GUTTER, paddingBottom: 8 }}>
      <View style={styles.search}>
        <SearchIcon size={18} color={colors.ink3} />
        <TextInput autoFocus value={text} onChangeText={setText} placeholder="Name or @username" placeholderTextColor={colors.ink3} style={styles.input} autoCapitalize="none" autoCorrect={false} returnKeyType="search" accessibilityLabel="Search runners" />
      </View>
    </View>
    <View style={{ paddingHorizontal: GUTTER }}>
      <ErrorNotice error={runners.error} onRetry={() => void runners.refetch()} />
      {term.length < 2 ? <Txt size={14} color="ink3" align="center" style={{ paddingVertical: 32 }}>Search by name or @username.</Txt>
        : runners.isLoading ? <View style={{ gap: 12, paddingVertical: 16 }}><Skeleton style={{ height: 64 }} /><Skeleton style={{ height: 64 }} /></View>
          : !runners.data?.length ? <Txt size={14} color="ink3" align="center" style={{ paddingVertical: 48 }}>No runners found.</Txt>
            : runners.data.map((runner, index) => <Pressable key={runner.username} onPress={() => router.push(`/runners/${runner.username}`)} style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, pressed && { backgroundColor: colors.card }]} accessibilityLabel={`View ${runner.displayName}'s profile`}>
              <Avatar name={runner.displayName} src={runner.avatarUrl} avatarStyle={runner.avatarStyle} size={44} round />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Txt size={14} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{runner.displayName}</Txt>{runner.verified ? <VerifiedTick /> : null}</View>
                <Txt size={13} color="ink2" numberOfLines={1}>{`@${runner.username}${runner.bio ? ` · ${runner.bio}` : ''}`}</Txt>
              </View>
            </Pressable>)}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.white, paddingHorizontal: 12 },
  input: { flex: 1, fontFamily: fontFamily('regular'), fontSize: 16, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
});
