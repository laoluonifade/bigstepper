import { activityName, formatDistance, formatDuration, formatMoney, formatNairaInput, nairaInputToKobo } from '@jump/shared/format';
import { shownMetres } from '@jump/shared/progress';
import { REACTIONS, type Reaction } from '@jump/shared/reactions';
import type { Activity, AvatarStyle, CheckoutResponse, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, patch, post } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { openCheckout } from '@/lib/checkout';
import { savePayment } from '@/lib/payments';
import { keys, useActivities, useUnit } from '@/lib/queries';
import { colors, fontFamily, GUTTER, radius, score } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { formatClock, useVoiceRecorder, VOICE_NOTE_MAX_SECONDS, type VoiceRecording } from '@/lib/voice';
import { ActivityBadge, ActivityPicker } from './ActivityRow';
import { ActivityIcon, CheckIcon, CopyIcon, EditIcon, LockIcon, MicIcon, PauseIcon, PlayIcon, ReplyIcon, SendIcon, TrashIcon } from './icons';
import { ReactionPicker } from './social';
import { Avatar, Button, ErrorNotice, haptic, LiveDot, Skeleton, TextField, Txt, VerifiedTick, type TextFieldRef } from './ui';

/** Whoever wrote a message: the other person in a DM, any member in a club chat. */
export type Person = { displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; verified?: boolean; username?: string | null };
type SharedActivity = { id: string; activityType: 'walk' | 'run' | 'cycle'; startedAt: string; verificationStatus: string; distanceMetres: number; movingSeconds: number; steps: number };
export type Message = {
  id: string; senderId: string; recipientId: string | null; body: string; createdAt: string; editedAt: string | null; replyToId: string | null; replyToBody: string | null; replyToSenderId: string | null;
  reactions: Array<{ userId: string; reaction: Reaction }>; invitationId: string | null; invitationStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null; tableId: string | null; tableCode: string | null; tableTitle: string | null;
  tableType: 'free' | 'sponsored' | 'paid' | null; tableStatus: string | null; guaranteedPrizeKobo: string | null; entryFeeKobo: number | null; activity?: SharedActivity | null; audioUrl?: string | null; audioSeconds?: number | null; pending?: boolean;
};
export type Thread = { canMessage: boolean; messages: Message[] };
type SendDraft = { text: string; reply: Message | null; activityId?: string; voice?: VoiceRecording };
type SentMessage = Pick<Message, 'id' | 'senderId' | 'recipientId' | 'body' | 'createdAt' | 'replyToId'>;

function sharedFromMine(activity: Activity | undefined): SharedActivity | null {
  if (!activity) return null;
  return { id: activity.id, activityType: activity.activityType, startedAt: activity.startedAt, verificationStatus: activity.verificationStatus, distanceMetres: shownMetres(activity), movingSeconds: activity.movingSeconds, steps: activity.validatedSteps };
}

export function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const gapMinutes = (earlier: Message, later: Message) => (new Date(later.createdAt).getTime() - new Date(earlier.createdAt).getTime()) / 60_000;

export function UnreadBadge({ count }: { count: number }) {
  return count > 0 ? <View style={styles.unread} accessibilityLabel={`${count} unread messages`}><Text style={styles.unreadText}>{count > 9 ? '9+' : count}</Text></View> : null;
}

/**
 * A conversation: a DM with one runner, or a club's group chat. Both are the same messages underneath,
 * so replies, reactions, edits, voice notes and shared activities work the same in each.
 */
export function ChatThread<T extends Thread>({ queryKey, path, empty, senderOf, group = false, onData }: {
  queryKey: readonly unknown[];
  /** GET loads it, POST sends, POST /read marks it read. */
  path: string;
  empty: (data: T) => ReactNode;
  senderOf: (data: T, senderId: string) => Person;
  group?: boolean;
  /** Hands the loaded thread to the screen, for its header. */
  onData?: (data: T) => void;
}) {
  const user = useUser();
  const unit = useUnit();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const myActivities = useActivities();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [pickingActivity, setPickingActivity] = useState(false);
  const stashedDraft = useRef<{ body: string; replyTo: Message | null }>({ body: '', replyTo: null });
  const composer = useRef<TextFieldRef>(null);
  const conversation = useQuery({ queryKey, queryFn: () => api<T>(path), refetchInterval: group ? 10_000 : 15_000 });
  useEffect(() => { if (conversation.data) onData?.(conversation.data); }, [conversation.data, onData]);

  const read = useMutation({
    mutationFn: () => post(`${path}/read`),
    onSuccess() { void queryClient.invalidateQueries({ queryKey: keys.messagesUnread }); void queryClient.invalidateQueries({ queryKey: ['messages', 'inbox'] }); },
  });
  const newestIncomingId = [...(conversation.data?.messages ?? [])].reverse().find((message) => message.senderId !== user.id)?.id;
  const markRead = read.mutate;
  useEffect(() => { if (newestIncomingId) markRead(); }, [newestIncomingId, markRead]);

  const send = useMutation({
    async mutationFn({ text, reply, activityId, voice }: SendDraft) {
      let audio: { audioUrl: string; audioSeconds: number } | null = null;
      if (voice) {
        const form = new FormData();
        form.append('file', { uri: voice.uri, name: 'voice.m4a', type: 'audio/mp4' } as unknown as Blob);
        const { url } = await api<{ url: string }>('/messages/voice', { method: 'POST', body: form });
        audio = { audioUrl: url, audioSeconds: voice.seconds };
      }
      return post<SentMessage>(path, { body: text, ...(reply ? { replyToId: reply.id } : {}), ...(activityId ? { activityId } : {}), ...(audio ?? {}) });
    },
    async onMutate({ text, reply, activityId, voice }) {
      await queryClient.cancelQueries({ queryKey });
      const pendingId = `pending-${Date.now()}`;
      const pendingMessage: Message = {
        id: pendingId, senderId: user.id, recipientId: '', body: text, createdAt: new Date().toISOString(), editedAt: null,
        replyToId: reply?.id ?? null, replyToBody: reply?.body ?? null, replyToSenderId: reply?.senderId ?? null,
        reactions: [], invitationId: null, invitationStatus: null, tableId: null, tableCode: null, tableTitle: null, tableType: null, tableStatus: null, guaranteedPrizeKobo: null, entryFeeKobo: null, pending: true,
        activity: activityId ? sharedFromMine(myActivities.data?.find((activity) => activity.id === activityId)) : null,
        audioUrl: voice?.uri ?? null, audioSeconds: voice?.seconds ?? null,
      };
      queryClient.setQueryData<T>(queryKey, (current) => current && { ...current, messages: [...current.messages, pendingMessage] });
      setBody('');
      setReplyTo(null);
      return { pendingId, text, reply };
    },
    onSuccess(saved, _draft, context) {
      haptic();
      queryClient.setQueryData<T>(queryKey, (current) => current && {
        ...current,
        messages: current.messages.flatMap((message) => (message.id === context?.pendingId ? (current.messages.some((item) => item.id === saved.id) ? [] : [{ ...message, ...saved, pending: false }]) : [message])),
      });
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['messages', 'inbox'] });
    },
    onError(_error, _draft, context) {
      queryClient.setQueryData<T>(queryKey, (current) => current && { ...current, messages: current.messages.filter((message) => message.id !== context?.pendingId) });
      setBody((current) => (current ? `${context?.text ?? ''}\n${current}` : context?.text ?? ''));
      setReplyTo((current) => current ?? context?.reply ?? null);
    },
  });
  const edit = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => patch<Pick<Message, 'id' | 'body' | 'editedAt'>>(`/messages/${id}`, { body: text }),
    onSuccess(updated) {
      queryClient.setQueryData<T>(queryKey, (current) => current && {
        ...current,
        messages: current.messages.map((item) => (item.id === updated.id ? { ...item, ...updated } : item.replyToId === updated.id ? { ...item, replyToBody: updated.body } : item)),
      });
      stopEditing();
      void queryClient.invalidateQueries({ queryKey: ['messages', 'inbox'] });
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const sendVoice = (recording: VoiceRecording) => send.mutate({ text: '', reply: replyTo, voice: recording });
  const voice = useVoiceRecorder(sendVoice);
  const { error: voiceError, clearError: clearVoiceError } = voice;
  useEffect(() => {
    if (!voiceError) return;
    toast({ tone: 'warn', message: voiceError });
    clearVoiceError();
  }, [voiceError, clearVoiceError]);

  function startEditing(message: Message) {
    if (!editing) stashedDraft.current = { body, replyTo };
    setEditing(message);
    setReplyTo(null);
    setBody(message.body);
    edit.reset();
    setTimeout(() => composer.current?.focus(), 50);
  }
  function stopEditing() {
    setEditing(null);
    setBody(stashedDraft.current.body);
    setReplyTo(stashedDraft.current.replyTo);
    stashedDraft.current = { body: '', replyTo: null };
  }
  function sendOrSave() {
    const text = body.trim();
    if (editing) {
      if (!text || edit.isPending) return;
      if (text === editing.body) stopEditing();
      else edit.mutate({ id: editing.id, text });
    } else if (text && !send.isPending) send.mutate({ text, reply: replyTo });
  }

  const data = conversation.data;
  // Newest first, for an inverted list that opens at the bottom and stays there as messages arrive.
  const rows = useMemo(() => {
    const all = data?.messages ?? [];
    return all.map((message, index) => {
      const previous = all[index - 1];
      const next = all[index + 1];
      const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
      // Messages from one person within five minutes read as one group.
      const joinsPrevious = !newDay && previous?.senderId === message.senderId && gapMinutes(previous, message) < 5;
      const joinsNext = Boolean(next) && next.senderId === message.senderId && dayLabel(next.createdAt) === dayLabel(message.createdAt) && gapMinutes(message, next) < 5;
      return { message, newDay, joinsPrevious, joinsNext };
    }).reverse();
  }, [data?.messages]);

  if (conversation.isLoading) return <View style={{ flex: 1, padding: GUTTER }}><Skeleton style={{ height: 256 }} /></View>;
  if (!data) return <View style={{ flex: 1, padding: GUTTER }}><ErrorNotice error={conversation.error} onRetry={() => void conversation.refetch()} /></View>;

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}>
    <FlatList
      inverted
      data={rows}
      keyExtractor={(row) => row.message.id}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<View style={{ alignItems: 'center', paddingVertical: 48, transform: [{ scaleY: -1 }] }}>{empty(data)}</View>}
      renderItem={({ item: { message, newDay, joinsPrevious, joinsNext } }) => <View style={{ paddingTop: newDay ? 8 : joinsPrevious ? 2 : 12 }}>
        {newDay && <View style={{ alignItems: 'center', marginBottom: 12 }}><View style={styles.day}><Txt size={11} weight="bold" upper tracking={0.06} color="ink2">{dayLabel(message.createdAt)}</Txt></View></View>}
        <MessageBubble unit={unit} message={message} viewerId={user.id} queryKey={queryKey} sender={senderOf(data, message.senderId)} nameOf={(id) => senderOf(data, id).displayName}
          showName={group && !joinsPrevious && message.senderId !== user.id} firstInGroup={!joinsPrevious} lastInGroup={!joinsNext} beingEdited={editing?.id === message.id}
          onEdit={() => startEditing(message)} onReply={() => { if (editing) stopEditing(); setReplyTo(message); composer.current?.focus(); }} />
      </View>}
    />
    {data.canMessage === false
      ? <View style={[styles.locked, { paddingBottom: Math.max(insets.bottom, 16) }]}><LockIcon size={14} color={colors.ink2} /><Txt size={13} color="ink2">Only the owner and managers can send messages here.</Txt></View>
      : <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <ErrorNotice error={send.error} />
        <ErrorNotice error={edit.error} />
        {editing && <Banner tone={colors.volt} title="Editing message" body={editing.body} onCancel={stopEditing} />}
        {replyTo && <Banner tone={colors.track} title={`Replying to ${replyTo.senderId === user.id ? 'yourself' : senderOf(data, replyTo.senderId).displayName}`} body={replyTo.body} onCancel={() => setReplyTo(null)} />}
        {voice.recording ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => void voice.stop(false)} style={styles.round} accessibilityLabel="Discard voice note"><TrashIcon size={19} color={colors.ink2} /></Pressable>
          <View style={styles.recording} accessibilityLiveRegion="polite">
            <LiveDot live color={colors.bad} />
            <Txt size={15} weight="semibold" num>{formatClock(voice.seconds)}</Txt>
            <Txt size={12} color="ink3" style={{ marginLeft: 'auto' }}>max {formatClock(VOICE_NOTE_MAX_SECONDS)}</Txt>
          </View>
          <Pressable onPress={() => void voice.stop(true).then((recording) => recording && sendVoice(recording))} style={[styles.round, { backgroundColor: colors.track }]} accessibilityLabel="Send voice note"><SendIcon size={18} color={colors.paper} /></Pressable>
        </View> : <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={styles.field}>
            {!editing && <Pressable onPress={() => setPickingActivity(true)} style={styles.inline} accessibilityLabel="Share an activity"><ActivityIcon size={19} color={colors.ink2} /></Pressable>}
            <TextInput ref={composer} value={body} onChangeText={setBody} multiline maxLength={1000} placeholder="Message…" placeholderTextColor={colors.ink3} selectionColor={colors.track}
              style={styles.input} accessibilityLabel={editing ? 'Edit message' : group ? 'Write to the club' : 'Write a private message'} />
          </View>
          {editing
            ? <Pressable onPress={sendOrSave} disabled={!body.trim() || edit.isPending} style={[styles.round, { backgroundColor: colors.ink }, !body.trim() && { opacity: 0.3 }]} accessibilityLabel="Save edit"><CheckIcon size={19} color={colors.paper} /></Pressable>
            : body.trim()
              ? <Pressable onPress={sendOrSave} disabled={send.isPending} style={[styles.round, { backgroundColor: colors.track }]} accessibilityLabel="Send message"><SendIcon size={18} color={colors.paper} /></Pressable>
              : <Pressable onPress={() => { haptic(); void voice.start(); }} style={[styles.round, { backgroundColor: colors.ink }]} accessibilityLabel="Record a voice note"><MicIcon size={19} color={colors.paper} /></Pressable>}
        </View>}
      </View>}
    <ActivityPicker open={pickingActivity} onOpenChange={setPickingActivity} unit={unit} activities={(myActivities.data ?? []).filter((activity) => activity.verificationStatus !== 'REJECTED')}
      onPick={(activity) => send.mutate({ text: body.trim(), reply: replyTo, activityId: activity.id })} />
  </KeyboardAvoidingView>;
}

function Banner({ tone, title, body, onCancel }: { tone: string; title: string; body: string; onCancel: () => void }) {
  return <View style={[styles.banner, { borderLeftColor: tone }]}>
    <Txt size={12} numberOfLines={1} style={{ flex: 1 }}><Txt size={12} weight="bold">{title}</Txt>  <Txt size={12} color="ink2">{body}</Txt></Txt>
    <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Cancel"><Txt size={16} weight="bold">×</Txt></Pressable>
  </View>;
}

function MessageBubble({ unit, message, viewerId, queryKey, sender, nameOf, showName, firstInGroup, lastInGroup, beingEdited, onEdit, onReply }: {
  unit: Unit; message: Message; viewerId: string; queryKey: readonly unknown[]; sender: Person; nameOf: (userId: string) => string; showName: boolean;
  firstInGroup: boolean; lastInGroup: boolean; beingEdited: boolean; onEdit: () => void; onReply: () => void;
}) {
  const queryClient = useQueryClient();
  const [picker, setPicker] = useState<number | null>(null);
  const [burst, setBurst] = useState(0);
  const lastTap = useRef(0);
  const mine = message.senderId === viewerId;
  const dark = mine && !message.invitationId;
  const ownReaction = message.reactions.find((item) => item.userId === viewerId)?.reaction;
  const react = useMutation({
    mutationFn: (reaction: Reaction | null) => (reaction ? post(`/messages/${message.id}/reaction`, { reaction }) : api(`/messages/${message.id}/reaction`, { method: 'DELETE' })),
    onMutate(reaction) {
      setPicker(null);
      if (reaction) setBurst((value) => value + 1);
      const reactions = [...message.reactions.filter((item) => item.userId !== viewerId), ...(reaction ? [{ userId: viewerId, reaction }] : [])];
      queryClient.setQueryData<Thread>(queryKey, (current) => current && { ...current, messages: current.messages.map((item) => (item.id === message.id ? { ...item, reactions } : item)) });
    },
    onSettled() { void queryClient.invalidateQueries({ queryKey }); },
  });
  const counts = REACTIONS.map((choice) => ({ ...choice, count: message.reactions.filter((item) => item.reaction === choice.value).length })).filter((choice) => choice.count);
  const inviteCode = /^Join .+ on Jump: https?:\/\/[^\s]+\/competitions\/([A-F0-9]{8})$/.exec(message.body)?.[1];
  const time = new Date(message.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // Swipe right to reply: the bubble follows the finger, and past 56pt it replies.
  const dragX = useSharedValue(0);
  const swipe = Gesture.Pan().activeOffsetX(12).failOffsetY([-12, 12]).enabled(!message.pending)
    .onChange((event) => { dragX.value = Math.max(0, Math.min(72, event.translationX)); })
    .onEnd(() => {
      if (dragX.value >= 56) runOnJS(onReply)();
      dragX.value = withTiming(0, { duration: 180 });
    });
  const swiped = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value }] }));
  const corner = (on: boolean, stacked: boolean) => (on ? 20 : stacked ? 6 : 3);

  return <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
    {!mine && <View style={{ width: 28 }}>{lastInGroup && <Avatar name={sender.displayName} src={sender.avatarUrl} avatarStyle={sender.avatarStyle} size={28} round />}</View>}
    <GestureDetector gesture={swipe}>
      <Animated.View style={[{ maxWidth: '80%', marginBottom: counts.length ? 12 : 0, opacity: message.pending ? 0.75 : 1 }, swiped]}>
        {showName && <Txt size={12} weight="bold" color="ink2" style={{ marginBottom: 4, marginLeft: 4 }}>{sender.displayName}{sender.verified ? ' ✓' : ''}</Txt>}
        <Pressable disabled={message.pending} delayLongPress={350}
          onLongPress={(event) => { haptic(); setPicker(event.nativeEvent.pageY); }}
          onPress={() => {
            // Double-tap to love, like most chat apps.
            const now = Date.now();
            if (now - lastTap.current < 300) { haptic(); react.mutate(ownReaction === 'HEART' ? null : 'HEART'); lastTap.current = 0; } else lastTap.current = now;
          }}
          accessibilityHint="Press and hold for reactions, double-tap to love, swipe right to reply"
          style={[styles.bubble, dark ? { backgroundColor: colors.ink } : mine ? { borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.volt } : { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
            mine
              ? { borderTopRightRadius: firstInGroup ? 20 : 6, borderBottomRightRadius: corner(false, !lastInGroup) }
              : { borderTopLeftRadius: firstInGroup ? 20 : 6, borderBottomLeftRadius: corner(false, !lastInGroup) },
            beingEdited && { borderWidth: 2, borderColor: colors.volt }]}>
          {message.replyToBody ? <View style={[styles.quote, { borderLeftColor: dark ? colors.volt : colors.track, backgroundColor: dark ? 'rgba(242,239,232,0.1)' : colors.paper }]}>
            <Txt size={12} weight="bold" color={dark ? 'paper' : 'ink'}>{message.replyToSenderId === viewerId ? 'You' : nameOf(message.replyToSenderId ?? '')}</Txt>
            <Txt size={12} numberOfLines={1} style={{ opacity: 0.75, color: dark ? colors.paper : colors.ink }}>{message.replyToBody}</Txt>
          </View> : null}
          {message.activity && <SharedActivityCard activity={message.activity} unit={unit} dark={dark} mine={mine} />}
          {message.audioUrl && <VoiceNotePlayer id={message.id} src={message.audioUrl} seconds={message.audioSeconds ?? 0} dark={dark} sending={Boolean(message.pending)} />}
          <Txt size={15} leading={1.35} color={dark ? 'paper' : 'ink'} style={message.activity && message.body ? { marginTop: 6 } : undefined}>
            {message.body}
            <Txt size={10.5} style={{ color: dark ? 'rgba(242,239,232,0.55)' : colors.ink3 }}>
              {`${message.body ? '   ' : ''}${message.pending ? (message.audioUrl ? '' : 'Sending') : `${message.editedAt ? 'Edited · ' : ''}${time}${mine ? ' ✓' : ''}`}`}
            </Txt>
          </Txt>
          {message.invitationId ? <InvitationActions message={message} received={message.recipientId === viewerId} queryKey={queryKey} />
            : inviteCode ? <Pressable onPress={() => router.push(`/competitions/${inviteCode}`)} style={{ marginTop: 8 }}><Txt size={12} weight="bold" color={dark ? 'paper' : 'ink'} style={{ textDecorationLine: 'underline' }}>View competition</Txt></Pressable> : null}
        </Pressable>
        {/* One small pill hanging off the bubble's corner: the emojis used, then the total. */}
        {counts.length > 0 && <Animated.View key={burst} entering={burst ? ZoomIn.springify() : undefined} style={[styles.counts, mine ? { right: 12 } : { left: 12 }]}>
          <Pressable onPress={() => setPicker(0)} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessibilityLabel={`Reactions: ${counts.map((choice) => `${choice.label} ${choice.count}`).join(', ')}`}>
            {counts.slice(0, 3).map((choice) => <Text key={choice.value} style={{ fontSize: 13 }}>{choice.emoji}</Text>)}
            {message.reactions.length > 1 && <Txt size={11} weight="semibold" color="ink2" num style={{ marginLeft: 2 }}>{message.reactions.length}</Txt>}
          </Pressable>
        </Animated.View>}
      </Animated.View>
    </GestureDetector>
    <ReactionPicker open={picker !== null} y={picker || undefined} current={ownReaction} onPick={(reaction) => react.mutate(reaction)} onClose={() => setPicker(null)} menu={[
      { label: 'Reply', icon: <ReplyIcon size={16} color={colors.ink3} />, onSelect: onReply },
      ...(message.body ? [{ label: 'Copy', icon: <CopyIcon size={16} color={colors.ink3} />, onSelect: () => void Clipboard.setStringAsync(message.body).then(() => toast({ tone: 'ok', message: 'Copied.' })) }] : []),
      ...(dark && !message.activity && !message.audioUrl ? [{ label: 'Edit', icon: <EditIcon size={16} color={colors.ink3} />, onSelect: onEdit }] : []),
    ]} />
  </View>;
}

/** Play/pause, a bar of fixed "waveform" ticks showing progress, and the time left. */
function VoiceNotePlayer({ id, src, seconds, dark, sending = false }: { id: string; src: string; seconds: number; dark: boolean; sending?: boolean }) {
  const player = useAudioPlayer(sending ? null : src);
  const status = useAudioPlayerStatus(player);
  // Same id, same bar heights: a stable pseudo-waveform without decoding the audio.
  const bars = useMemo(() => Array.from({ length: 30 }, (_, index) => 25 + ((id.charCodeAt(index % id.length) + index * 13) * 7919) % 75), [id]);
  const duration = status.duration || seconds;
  const progress = duration ? Math.min(1, status.currentTime / duration) : 0;
  useEffect(() => {
    if (status.didJustFinish) { player.pause(); void player.seekTo(0); }
  }, [player, status.didJustFinish]);
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210, paddingVertical: 2 }}>
    {sending
      ? <View style={[styles.play, { backgroundColor: dark ? 'rgba(242,239,232,0.15)' : colors.inkFaint }]}><ActivityIndicator size="small" color={dark ? colors.paper : colors.ink} /></View>
      : <Pressable onPress={() => (status.playing ? player.pause() : player.play())} style={[styles.play, { backgroundColor: dark ? colors.paper : colors.ink }]} accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}>
        {status.playing ? <PauseIcon size={15} color={dark ? colors.ink : colors.paper} /> : <PlayIcon size={15} color={dark ? colors.ink : colors.paper} />}
      </Pressable>}
    <View style={{ flex: 1, height: 32, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {bars.map((height, index) => <View key={index} style={{ flex: 1, height: `${height}%`, borderRadius: 2, backgroundColor: index / bars.length < progress ? (dark ? colors.volt : colors.track) : dark ? 'rgba(242,239,232,0.35)' : 'rgba(18,18,18,0.2)' }} />)}
    </View>
    <Txt size={12} num align="right" style={{ width: sending ? 56 : 36, color: dark ? 'rgba(242,239,232,0.7)' : colors.ink2 }}>{sending ? 'Sending…' : formatClock(status.playing || status.currentTime ? duration - status.currentTime : duration)}</Txt>
  </View>;
}

/** A walk, run or ride shared in a chat. Your own opens its activity page. */
function SharedActivityCard({ activity, unit, dark, mine }: { activity: SharedActivity; unit: Unit; dark: boolean; mine: boolean }) {
  return <Pressable disabled={!mine} onPress={() => router.push(`/activities/${activity.id}`)} style={[styles.shared, { backgroundColor: dark ? 'rgba(242,239,232,0.1)' : colors.paper }]}>
    <ActivityBadge type={activity.activityType} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt size={13} weight="bold" numberOfLines={1} color={dark ? 'paper' : 'ink'}>{activityName(activity.startedAt, activity.activityType)}</Txt>
      <Txt size={12} num style={{ color: dark ? 'rgba(242,239,232,0.6)' : colors.ink3 }}>{`${formatDuration(activity.movingSeconds)}${activity.verificationStatus === 'VERIFIED' ? ' · Verified' : ''}`}</Txt>
    </View>
    <Text style={[score(20), { color: dark ? colors.paper : colors.ink }]}>{formatDistance(activity.distanceMetres, unit)}</Text>
  </Pressable>;
}

function InvitationActions({ message, received, queryKey }: { message: Message; received: boolean; queryKey: readonly unknown[] }) {
  const queryClient = useQueryClient();
  const [choosingContribution, setChoosingContribution] = useState(false);
  const [amount, setAmount] = useState('1,000');
  const code = message.tableCode;
  const tableId = message.tableId;
  const openPool = message.tableType === 'sponsored' && message.guaranteedPrizeKobo === null;
  const response = useMutation({
    mutationFn: async ({ decision, contributeKobo }: { decision: 'ACCEPT' | 'DECLINE'; contributeKobo?: number }) => {
      const answer = await post<{ status: string; joined: boolean; paymentRequired?: boolean }>(`/tables/invitations/${message.invitationId}/respond`, { decision });
      if (decision === 'DECLINE' || !tableId || !code) return;
      if (answer.paymentRequired) {
        const checkout = await post<CheckoutResponse>(`/tables/${tableId}/checkout`);
        savePayment({ reference: checkout.reference, purpose: 'CHALLENGE_ENTRY', tableId, tableCode: code, tableTitle: message.tableTitle ?? 'Competition', amountKobo: message.entryFeeKobo ?? 0, createdAt: new Date().toISOString() });
        await openCheckout(checkout.authorizationUrl);
      } else if (contributeKobo) {
        const checkout = await post<CheckoutResponse>(`/tables/${tableId}/fund-prize`, { amountKobo: contributeKobo });
        savePayment({ reference: checkout.reference, purpose: 'SPONSOR_FUNDING', tableId, tableCode: code, tableTitle: message.tableTitle ?? 'Competition', amountKobo: contributeKobo, createdAt: new Date().toISOString() });
        await openCheckout(checkout.authorizationUrl);
      }
    },
    async onSettled() {
      await Promise.all([queryClient.invalidateQueries({ queryKey }), queryClient.invalidateQueries({ queryKey: ['tables', 'mine'] }), ...(code ? [queryClient.invalidateQueries({ queryKey: keys.table(code) })] : [])]);
    },
  });
  if (!message.invitationId || !code) return null;
  const view = <Pressable onPress={() => router.push(`/competitions/${code}`)}><Txt size={12} weight="bold" style={{ textDecorationLine: 'underline' }}>View competition</Txt></Pressable>;
  if (message.invitationStatus !== 'PENDING') return <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    {view}<Txt size={12} weight="semibold" upper color="ink2">{message.invitationStatus === 'ACCEPTED' ? 'Accepted' : 'Declined'}</Txt>
    <ErrorNotice error={response.error} />
  </View>;
  if (!received) return <Txt size={12} color="ink2" style={{ marginTop: 8 }}>Invitation pending</Txt>;
  return <View style={{ marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 12, gap: 8 }}>
    {view}
    {message.tableStatus !== 'OPEN_FOR_ENTRY'
      ? <Txt size={12} color="ink2">{message.tableStatus === 'PENDING_FUNDING' ? 'The host must fund this draft before you can accept.' : 'Entry is not open right now.'}</Txt>
      : choosingContribution ? <View style={{ gap: 8 }}>
        <Txt size={12} weight="semibold">Contribution is optional. Join free, or fund the prize.</Txt>
        <Txt size={12} color="ink2">You can still win this competition’s cash prize if you contribute.</Txt>
        <TextField keyboardType="decimal-pad" accessibilityLabel="Contribution amount in naira" value={amount} onChangeText={(text) => setAmount(formatNairaInput(text))} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button size="sm" variant="secondary" title="No thanks · join free" disabled={response.isPending} onPress={() => response.mutate({ decision: 'ACCEPT' })} />
          <Button size="sm" variant="dark" title="Join & contribute" disabled={response.isPending || !Number.isSafeInteger(nairaInputToKobo(amount)) || nairaInputToKobo(amount) < 100 || nairaInputToKobo(amount) > 100_000_000} onPress={() => response.mutate({ decision: 'ACCEPT', contributeKobo: nairaInputToKobo(amount) })} />
          <Button size="sm" variant="quiet" title="Decline" disabled={response.isPending} onPress={() => response.mutate({ decision: 'DECLINE' })} />
        </View>
      </View>
        : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button size="sm" variant="dark" loading={response.isPending} title={message.tableType === 'paid' ? `Accept & pay ${formatMoney(message.entryFeeKobo ?? 0)}` : 'Accept · join free'} onPress={() => (openPool ? setChoosingContribution(true) : response.mutate({ decision: 'ACCEPT' }))} />
          <Button size="sm" variant="secondary" title="Decline" disabled={response.isPending} onPress={() => response.mutate({ decision: 'DECLINE' })} />
        </View>}
    <ErrorNotice error={response.error} />
  </View>;
}

export function VerifiedName({ name, verified, size = 16 }: { name: string; verified?: boolean; size?: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
    <Text numberOfLines={1} style={{ fontFamily: fontFamily('black', 'wide'), fontSize: size, textTransform: 'uppercase', color: colors.ink, flexShrink: 1 }}>{name}</Text>
    {verified ? <VerifiedTick size={size} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  unread: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.bad, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  unreadText: { fontFamily: fontFamily('bold'), fontSize: 11, color: colors.paper, fontVariant: ['tabular-nums'] },
  day: { borderRadius: radius.full, backgroundColor: colors.inkWash, paddingHorizontal: 12, paddingVertical: 4 },
  locked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.card, paddingHorizontal: GUTTER, paddingTop: 16 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.xl, borderLeftWidth: 4, backgroundColor: colors.paper, paddingHorizontal: 12, paddingVertical: 8 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, paddingLeft: 4, paddingRight: 12, minHeight: 44 },
  inline: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, maxHeight: 168, fontFamily: fontFamily('regular'), fontSize: 16, lineHeight: 21, color: colors.ink, paddingTop: 11, paddingBottom: 11, paddingLeft: 8 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  recording: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(194,38,27,0.4)', backgroundColor: 'rgba(250,220,216,0.6)', paddingHorizontal: 16 },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  quote: { borderRadius: radius.xl, borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  counts: { position: 'absolute', bottom: -12, height: 22, borderRadius: 11, backgroundColor: colors.card, paddingHorizontal: 6, justifyContent: 'center', shadowColor: colors.ink, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  shared: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 220, borderRadius: radius['2xl'], padding: 10 },
});
