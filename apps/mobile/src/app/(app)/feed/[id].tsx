import { avatarStyleForGender } from '@jump/shared/avatars';
import { shortAgo } from '@jump/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionBar, ActivityAttachment, PostImage, updatePost, type FeedComment, type FeedPost } from '@/components/feed';
import { SendIcon, TrashIcon } from '@/components/icons';
import { MentionInput, MentionText } from '@/components/social';
import { Avatar, ErrorNotice, Footer, Loading, Screen, Skeleton, Txt, VerifiedTick, type TextFieldRef } from '@/components/ui';
import { api, post } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useProfile, useUnit } from '@/lib/queries';
import { colors, fontFamily, GUTTER, radius } from '@/lib/theme';

export default function FeedPostScreen() {
  const { id, reply } = useLocalSearchParams<{ id: string; reply?: string }>();
  const user = useUser();
  const unit = useUnit();
  const profile = useProfile();
  const queryClient = useQueryClient();
  const replyField = useRef<TextFieldRef>(null);
  const [body, setBody] = useState('');
  const postQuery = useQuery({ queryKey: ['feed-post', id], queryFn: () => api<FeedPost>(`/feed/${encodeURIComponent(id)}`) });
  const comments = useQuery({ queryKey: ['feed-comments', id], queryFn: () => api<FeedComment[]>(`/feed/${id}/comments`) });
  const loaded = Boolean(postQuery.data);
  useEffect(() => { if (loaded && reply === '1') setTimeout(() => replyField.current?.focus(), 300); }, [loaded, reply]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['feed-comments', id] });
    void queryClient.invalidateQueries({ queryKey: ['feed-post', id] });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  };
  const comment = useMutation({
    mutationFn: (text: string) => post(`/feed/${id}/comments`, { body: text }),
    onMutate(text) {
      // Show it straight away; the server copy replaces it when the list refreshes.
      const pending: FeedComment = {
        id: `pending-${Date.now()}`, postId: id, userId: user.id, body: text, createdAt: new Date().toISOString(),
        username: profile.data?.username ?? '', displayName: profile.data?.displayName ?? 'You', avatarUrl: profile.data?.avatarUrl ?? null, pending: true,
      };
      queryClient.setQueryData<FeedComment[]>(['feed-comments', id], (current) => [...(current ?? []), pending]);
      updatePost(queryClient, id, (current) => ({ ...current, commentCount: current.commentCount + 1 }));
      setBody('');
      return { pending, text };
    },
    onError(_error, _text, context) {
      queryClient.setQueryData<FeedComment[]>(['feed-comments', id], (current) => current?.filter((entry) => entry.id !== context?.pending.id));
      updatePost(queryClient, id, (current) => ({ ...current, commentCount: Math.max(0, current.commentCount - 1) }));
      setBody((current) => current || context?.text || '');
    },
    onSettled: refresh,
  });
  const removeComment = useMutation({ mutationFn: (commentId: string) => api(`/feed/comments/${commentId}`, { method: 'DELETE' }), onSuccess: refresh });
  const submit = () => {
    const text = body.trim();
    if (text && !comment.isPending) comment.mutate(text);
  };

  if (postQuery.isLoading) return <Screen><Stack.Screen options={{ title: 'Post' }} /><Loading /></Screen>;
  if (postQuery.error || !postQuery.data) return <Screen><Stack.Screen options={{ title: 'Post' }} /><ErrorNotice error={postQuery.error} onRetry={() => void postQuery.refetch()} /></Screen>;
  const item = postQuery.data;
  const posted = new Date(item.createdAt);
  const list = comments.data ?? [];

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
    <Stack.Screen options={{ title: 'Post' }} />
    <Screen ownKeyboard padded={false} refreshing={comments.isRefetching} onRefresh={refresh} footer={<Footer style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10 }}>
      <Avatar name={profile.data?.displayName ?? 'You'} src={profile.data?.avatarUrl} avatarStyle={avatarStyleForGender(profile.data?.gender)} size={34} round style={{ marginBottom: 4 }} />
      <View style={styles.reply}>
        <MentionInput ref={replyField} value={body} onValueChange={setBody} placement="above" multiline maxLength={500} placeholder={`Reply to ${item.displayName.split(' ')[0]}…`} accessibilityLabel="Write a comment"
          style={{ fontSize: 15, lineHeight: 20, paddingVertical: 8, maxHeight: 140 }} />
        <Pressable onPress={submit} disabled={!body.trim() || comment.isPending} style={[styles.send, !body.trim() && { backgroundColor: 'transparent' }]} accessibilityLabel="Post comment">
          <SendIcon size={15} color={body.trim() ? colors.paper : colors.ink3} />
        </Pressable>
      </View>
    </Footer>}>
      <View style={{ paddingHorizontal: GUTTER, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.push(`/runners/${item.username}`)}><Avatar name={item.displayName} src={item.avatarUrl} avatarStyle={item.avatarStyle} size={48} round /></Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text onPress={() => router.push(`/runners/${item.username}`)} numberOfLines={1} style={styles.name}>{item.displayName}</Text>
              {item.verified ? <VerifiedTick size={16} /> : null}
            </View>
            <Txt size={14} color="ink3" numberOfLines={1}>@{item.username}</Txt>
          </View>
          {item.userId !== user.id && <Pressable onPress={() => router.push(`/messages/${item.username}`)} style={styles.message}><Txt size={13} weight="bold">Message</Txt></Pressable>}
        </View>
        {item.body ? <View style={{ marginTop: 16 }}><MentionText text={item.body} size={19} /></View> : null}
        {item.imageUrl ? <PostImage uri={item.imageUrl} /> : null}
        {item.activityId && item.activityType ? <ActivityAttachment item={item} unit={unit} mine={item.userId === user.id} /> : null}
        <Txt size={14} color="ink3" style={{ marginTop: 16 }}>{`${posted.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ${posted.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}</Txt>
        <View style={styles.bar}><ActionBar item={item} viewerId={user.id} onComment={() => replyField.current?.focus()} /></View>
      </View>
      <ErrorNotice error={comment.error || comments.error || removeComment.error} />
      {comments.isLoading ? <View style={{ padding: GUTTER }}><Skeleton style={{ height: 56 }} /></View>
        : !list.length ? <Txt size={14} color="ink3" align="center" style={{ paddingVertical: 48 }}>No comments yet. Be the first.</Txt>
          : list.map((entry) => <View key={entry.id} style={[styles.comment, entry.pending && { opacity: 0.6 }]}>
            <Pressable onPress={() => router.push(`/runners/${entry.username}`)}><Avatar name={entry.displayName} src={entry.avatarUrl} avatarStyle={entry.avatarStyle} size={38} round /></Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text onPress={() => router.push(`/runners/${entry.username}`)} numberOfLines={1} style={[styles.name, { fontSize: 14 }]}>{entry.displayName}</Text>
                <Txt size={13} color="ink3">{entry.pending ? 'Posting…' : shortAgo(entry.createdAt)}</Txt>
                {entry.userId === user.id && !entry.pending && <Pressable onPress={() => removeComment.mutate(entry.id)} disabled={removeComment.isPending} hitSlop={8} style={{ marginLeft: 'auto' }} accessibilityLabel="Delete comment"><TrashIcon size={14} color={colors.ink3} /></Pressable>}
              </View>
              <View style={{ marginTop: 4 }}><MentionText text={entry.body} /></View>
            </View>
          </View>)}
    </Screen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  name: { fontFamily: fontFamily('bold'), fontSize: 16, color: colors.ink, flexShrink: 1 },
  message: { height: 36, borderRadius: radius.full, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, justifyContent: 'center' },
  bar: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, paddingVertical: 4, paddingLeft: 10 },
  comment: { flexDirection: 'row', gap: 12, paddingHorizontal: GUTTER, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  reply: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingLeft: 16, paddingRight: 4 },
  send: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.track, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
});
