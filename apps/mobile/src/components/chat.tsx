import { activityName, formatDistance, formatDuration, formatMoney, formatNairaInput, nairaInputToKobo } from '@jump/shared/format';
import { shownMetres } from '@jump/shared/progress';
import { REACTIONS, type Reaction } from '@jump/shared/reactions';
import type { Activity, AvatarStyle, CheckoutResponse, Unit } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { ComponentRef, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlurView } from 'expo-blur';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { setOpenChat } from '@/lib/push';
import { api, patch, post } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { openCheckout } from '@/lib/checkout';
import { savePayment } from '@/lib/payments';
import { playSound } from '@/lib/sounds';
import { keys, useActivities, useUnit } from '@/lib/queries';
import { colors, fontFamily, GUTTER, radius, scheme, score } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { formatClock, useVoiceRecorder, VOICE_NOTE_MAX_SECONDS, type VoiceRecording } from '@/lib/voice';
import { ActivityBadge, ActivityPicker } from './ActivityRow';
import { ActivityIcon, CheckIcon, CopyIcon, EditIcon, LockIcon, MicIcon, PauseIcon, PlayIcon, ReplyIcon, SendIcon, TrashIcon } from './icons';
import { Avatar, Button, ErrorNotice, haptic, LiveDot, Skeleton, TextField, Txt, VerifiedTick, type TextFieldRef } from './ui';

/** Whoever wrote a message: the other person in a DM, any member in a club chat. */
export type Person = { displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; verified?: boolean; username?: string | null };
type SharedActivity = { id: string; activityType: 'walk' | 'run' | 'cycle'; startedAt: string; verificationStatus: string; distanceMetres: number; movingSeconds: number; steps: number };
export type Message = {
  id: string; senderId: string; recipientId: string | null; body: string; createdAt: string; editedAt: string | null; replyToId: string | null; replyToBody: string | null; replyToSenderId: string | null;
  reactions: Array<{ userId: string; reaction: Reaction }>; invitationId: string | null; invitationStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null; tableId: string | null; tableCode: string | null; tableTitle: string | null;
  tableType: 'free' | 'sponsored' | 'paid' | null; tableStatus: string | null; guaranteedPrizeKobo: string | null; entryFeeKobo: number | null; activity?: SharedActivity | null; audioUrl?: string | null; audioSeconds?: number | null; pending?: boolean;
  /** When the other person read it; direct messages only. */
  readAt?: string | null;
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

/** Whether the keyboard is up, so the composer can drop the home-indicator gap while you type. */
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return shown;
}

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
  const headerHeight = useHeaderHeight();
  const keyboardShown = useKeyboardShown();
  const queryClient = useQueryClient();
  const myActivities = useActivities();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [pickingActivity, setPickingActivity] = useState(false);
  const stashedDraft = useRef<{ body: string; replyTo: Message | null }>({ body: '', replyTo: null });
  const composer = useRef<TextFieldRef>(null);
  // Near real time while you're in the chat (polls stop when the app is in the background).
  const conversation = useQuery({ queryKey, queryFn: () => api<T>(path), refetchInterval: group ? 5_000 : 3_000 });
  // While this chat is on screen, its own notifications don't banner or buzz.
  useFocusEffect(useCallback(() => {
    setOpenChat(path);
    return () => setOpenChat(null);
  }, [path]));
  useEffect(() => { if (conversation.data) onData?.(conversation.data); }, [conversation.data, onData]);

  const read = useMutation({
    mutationFn: () => post(`${path}/read`),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: keys.messagesUnread });
      void queryClient.invalidateQueries({ queryKey: ['messages', 'inbox'] });
      // The API reads this chat's notifications too: refresh the bell.
      void queryClient.invalidateQueries({ queryKey: keys.notifications });
    },
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
      playSound('send');
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
    toast({ tone: 'warn', message: voiceError, action: voiceError.includes('Settings') ? { label: 'Open Settings', run: () => void Linking.openSettings() } : undefined });
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

  // Both platforms pad for the keyboard: Android draws edge to edge, so the window no longer shrinks for it.
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={headerHeight}>
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
          group={group} showName={group && !joinsPrevious && message.senderId !== user.id} firstInGroup={!joinsPrevious} lastInGroup={!joinsNext} beingEdited={editing?.id === message.id}
          onEdit={() => startEditing(message)} onReply={() => { if (editing) stopEditing(); setReplyTo(message); composer.current?.focus(); }} />
      </View>}
    />
    {data.canMessage === false
      ? <View style={[styles.locked, { paddingBottom: keyboardShown ? 12 : Math.max(insets.bottom, 16) }]}><LockIcon size={14} color={colors.ink2} /><Txt size={13} color="ink2">Only the owner and managers can send messages here.</Txt></View>
      : <View style={[styles.composer, { paddingBottom: keyboardShown ? 8 : Math.max(insets.bottom, 8) }]}>
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

/** Sent, then read: one tick, then two in the accent colour, drawn rather than typed so they sit crisply. */
export function Ticks({ read, dark = false }: { read: boolean; dark?: boolean }) {
  // On your own ink bubble (light mode) read ticks are volt; elsewhere orange.
  const colour = read ? (dark ? colors.volt : colors.trackDeep) : dark ? colors.onInkMuted : colors.ink3;
  return <Svg width={read ? 17 : 12} height={10} viewBox={read ? '0 0 17 10' : '0 0 12 10'} accessibilityLabel={read ? 'Read' : 'Sent'}>
    <Path d="M1 5.4 4.3 8.6 11 1.6" stroke={colour} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {read ? <Path d="M7.4 8.1 7.9 8.6 14.6 1.6" stroke={colour} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
  </Svg>;
}

type Frame = { x: number; y: number; width: number; height: number };
type MenuAction = { label: string; icon: ReactNode; onSelect: () => void; danger?: boolean };

/**
 * Press and hold a message, iMessage-style: everything else blurs back, the message lifts where it was,
 * reactions sit just above it (the six favourites, + for the rest) and the actions just below.
 */
function MessageMenu({ frame, mine, children, current, onPick, actions, onClose }: {
  frame: Frame | null; mine: boolean; children: ReactNode; current?: Reaction; onPick: (reaction: Reaction | null) => void; actions: MenuAction[]; onClose: () => void;
}) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [allReactions, setAllReactions] = useState(false);
  const lift = useSharedValue(1);
  useEffect(() => {
    if (!frame) { setAllReactions(false); return; }
    lift.value = 1;
    lift.value = withTiming(1.03, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [frame, lift]);
  const lifted = useAnimatedStyle(() => ({ transform: [{ scale: lift.value }] }));
  if (!frame) return null;

  const barHeight = allReactions ? 152 : 52;
  const menuHeight = actions.length * 46;
  const bubbleHeight = Math.min(frame.height, height * 0.4);
  // Keep the whole stack on screen: nudge it down from the top or up from the bottom as needed.
  const stackTop = frame.y - barHeight - 8;
  const stackBottom = frame.y + bubbleHeight + 8 + menuHeight;
  const shift = stackTop < insets.top + 8 ? insets.top + 8 - stackTop
    : stackBottom > height - insets.bottom - 8 ? height - insets.bottom - 8 - stackBottom : 0;
  const y = frame.y + shift;
  const side = mine ? { right: Math.max(8, width - frame.x - frame.width) } : { left: Math.max(8, frame.x) };
  const shown = allReactions ? REACTIONS : REACTIONS.slice(0, 6);

  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close">
      <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
        {Platform.OS === 'ios' ? <BlurView intensity={28} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? 'rgba(18,18,18,0.12)' : 'rgba(18,18,18,0.45)' }]} />
      </Animated.View>
    </Pressable>

    <Animated.View entering={FadeIn.duration(200).delay(40)} style={[styles.reactionBar, side, { top: y - barHeight - 8 }, allReactions && styles.reactionGrid]}>
      {shown.map((reaction) => <Pressable key={reaction.value} onPress={() => { haptic('select'); onPick(current === reaction.value ? null : reaction.value); }}
        accessibilityRole="button" accessibilityLabel={reaction.label} accessibilityState={{ selected: current === reaction.value }}
        style={({ pressed }) => [styles.reaction, current === reaction.value && { backgroundColor: colors.trackWash }, pressed && { transform: [{ scale: 1.2 }] }]}>
        <Text style={{ fontSize: 26 }}>{reaction.emoji}</Text>
      </Pressable>)}
      {!allReactions && <Pressable onPress={() => { haptic('select'); setAllReactions(true); }} style={[styles.reaction, { backgroundColor: 'rgba(118,118,128,0.12)' }]} accessibilityLabel="More reactions">
        <Txt size={20} weight="semibold" color="ink2">+</Txt>
      </Pressable>}
    </Animated.View>

    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: y, left: frame.x, width: frame.width, height: bubbleHeight, overflow: 'hidden', borderRadius: 20 }, styles.liftShadow, lifted]}>
      {children}
    </Animated.View>

    <Animated.View entering={FadeIn.duration(200).delay(60)} style={[styles.menu, side, { top: y + bubbleHeight + 8 }]}>
      {actions.map((action, index) => <Pressable key={action.label} onPress={() => { onClose(); action.onSelect(); }}
        style={({ pressed }) => [styles.menuItem, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, pressed && { backgroundColor: colors.inkWash }]}>
        <Txt size={16} color={action.danger ? 'bad' : 'ink'}>{action.label}</Txt>
        {action.icon}
      </Pressable>)}
    </Animated.View>
  </Modal>;
}

function MessageBubble({ unit, message, viewerId, queryKey, sender, nameOf, showName, firstInGroup, lastInGroup, beingEdited, group, onEdit, onReply }: {
  unit: Unit; message: Message; viewerId: string; queryKey: readonly unknown[]; sender: Person; nameOf: (userId: string) => string; showName: boolean;
  firstInGroup: boolean; lastInGroup: boolean; beingEdited: boolean; group: boolean; onEdit: () => void; onReply: () => void;
}) {
  const queryClient = useQueryClient();
  const bubble = useRef<ComponentRef<typeof View>>(null);
  const [menu, setMenu] = useState<Frame | null>(null);
  const lastTap = useRef(0);
  const mine = message.senderId === viewerId;
  // Your own messages are an ink bubble in light mode. Inverted, that turned into a glaring cream block in
  // dark mode, so there they're a raised grey instead, styled like any other bubble.
  const dark = mine && !message.invitationId && scheme === 'light';
  const raised = mine && scheme === 'dark';
  const ownReaction = message.reactions.find((item) => item.userId === viewerId)?.reaction;
  const react = useMutation({
    mutationFn: (reaction: Reaction | null) => (reaction ? post(`/messages/${message.id}/reaction`, { reaction }) : api(`/messages/${message.id}/reaction`, { method: 'DELETE' })),
    onMutate(reaction) {
      setMenu(null);
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

  function openMenu() {
    haptic('medium');
    bubble.current?.measureInWindow((x, y, width, height) => setMenu({ x, y, width, height }));
  }

  const body = <View style={[styles.bubble, dark ? { backgroundColor: colors.ink } : raised ? { backgroundColor: MINE_DARK } : mine ? { backgroundColor: colors.volt } : { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
    mine
      ? { borderTopRightRadius: firstInGroup ? 20 : 6, borderBottomRightRadius: lastInGroup ? 20 : 6 }
      : { borderTopLeftRadius: firstInGroup ? 20 : 6, borderBottomLeftRadius: lastInGroup ? 20 : 6 },
    beingEdited && { borderWidth: 2, borderColor: colors.track }]}>
    {message.replyToBody ? <View style={[styles.quote, { borderLeftColor: dark ? colors.volt : colors.track, backgroundColor: dark ? colors.onInkWash : colors.inkWash }]}>
      <Txt size={12} weight="bold" color={dark ? 'paper' : 'ink'}>{message.replyToSenderId === viewerId ? 'You' : nameOf(message.replyToSenderId ?? '')}</Txt>
      <Txt size={12} numberOfLines={1} style={{ opacity: 0.75, color: dark ? colors.paper : colors.ink }}>{message.replyToBody}</Txt>
    </View> : null}
    {message.activity && <SharedActivityCard activity={message.activity} unit={unit} dark={dark} raised={raised} mine={mine} />}
    {message.audioUrl && <VoiceNotePlayer id={message.id} src={message.audioUrl} seconds={message.audioSeconds ?? 0} dark={dark} sending={Boolean(message.pending)} />}
    {message.body ? <Txt size={16} leading={1.35} color={dark ? 'paper' : 'ink'} style={message.activity ? { marginTop: 6 } : undefined}>{message.body}</Txt> : null}
    {/* Time, edited and the ticks tucked into the bottom corner. */}
    <View style={styles.meta}>
      <Txt size={11} num style={{ color: dark ? colors.onInkMuted : colors.ink3 }}>
        {message.pending ? (message.audioUrl ? '' : 'Sending…') : `${message.editedAt ? 'Edited · ' : ''}${time}`}
      </Txt>
      {mine && !group && !message.pending ? <Ticks read={Boolean(message.readAt)} dark={dark} /> : null}
    </View>
    {message.invitationId ? <InvitationActions message={message} received={message.recipientId === viewerId} queryKey={queryKey} />
      : inviteCode ? <Pressable onPress={() => router.push(`/competitions/${inviteCode}`)} style={{ marginTop: 8 }}><Txt size={12} weight="bold" color={dark ? 'paper' : 'ink'} style={{ textDecorationLine: 'underline' }}>View competition</Txt></Pressable> : null}
  </View>;

  return <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
    {!mine && <View style={{ width: 28 }}>{lastInGroup && <Avatar name={sender.displayName} src={sender.avatarUrl} avatarStyle={sender.avatarStyle} size={28} round />}</View>}
    <GestureDetector gesture={swipe}>
      <Animated.View style={[{ maxWidth: '80%', marginTop: counts.length ? 16 : 0, opacity: message.pending ? 0.75 : 1 }, swiped]}>
        {showName && <Txt size={12} weight="bold" color="ink2" style={{ marginBottom: 4, marginLeft: 4 }}>{sender.displayName}{sender.verified ? ' ✓' : ''}</Txt>}
        <Pressable disabled={message.pending} delayLongPress={300} onLongPress={openMenu}
          onPress={() => {
            // Double-tap to love, like most chat apps.
            const now = Date.now();
            if (now - lastTap.current < 300) { haptic('medium'); react.mutate(ownReaction === 'HEART' ? null : 'HEART'); lastTap.current = 0; } else lastTap.current = now;
          }}
          accessibilityHint="Press and hold for reactions and actions, double-tap to love, swipe right to reply">
          <View ref={bubble} collapsable={false}>{body}</View>
        </Pressable>
        {/* Tapbacks: a small badge on the top corner, the emojis used and how many. */}
        {counts.length > 0 && <Animated.View entering={FadeIn.duration(180)} style={[styles.tapback, mine ? { left: -10 } : { right: -10 }]}>
          <Pressable onPress={openMenu} style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }} accessibilityLabel={`Reactions: ${counts.map((choice) => `${choice.label} ${choice.count}`).join(', ')}`}>
            {counts.slice(0, 3).map((choice) => <Text key={choice.value} style={{ fontSize: 14 }}>{choice.emoji}</Text>)}
            {message.reactions.length > 1 && <Txt size={11} weight="bold" color="ink2" num style={{ marginLeft: 3 }}>{message.reactions.length}</Txt>}
          </Pressable>
        </Animated.View>}
      </Animated.View>
    </GestureDetector>
    <MessageMenu frame={menu} mine={mine} current={ownReaction} onPick={(reaction) => react.mutate(reaction)} onClose={() => setMenu(null)} actions={[
      { label: 'Reply', icon: <ReplyIcon size={18} color={colors.ink} />, onSelect: onReply },
      ...(message.body ? [{ label: 'Copy', icon: <CopyIcon size={18} color={colors.ink} />, onSelect: () => void Clipboard.setStringAsync(message.body).then(() => toast({ tone: 'ok', message: 'Copied.' })) }] : []),
      ...(dark && !message.activity && !message.audioUrl ? [{ label: 'Edit', icon: <EditIcon size={18} color={colors.ink} />, onSelect: onEdit }] : []),
    ]}>{body}</MessageMenu>
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
      ? <View style={[styles.play, { backgroundColor: dark ? colors.onInkWash : colors.inkFaint }]}><ActivityIndicator size="small" color={dark ? colors.paper : colors.ink} /></View>
      : <Pressable onPress={() => (status.playing ? player.pause() : player.play())} style={[styles.play, { backgroundColor: dark ? colors.paper : colors.ink }]} accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}>
        {status.playing ? <PauseIcon size={15} color={dark ? colors.ink : colors.paper} /> : <PlayIcon size={15} color={dark ? colors.ink : colors.paper} />}
      </Pressable>}
    <View style={{ flex: 1, height: 32, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {bars.map((height, index) => <View key={index} style={{ flex: 1, height: `${height}%`, borderRadius: 2, backgroundColor: index / bars.length < progress ? (dark ? colors.volt : colors.track) : dark ? colors.onInkWash : scheme === 'dark' ? 'rgba(242,239,232,0.22)' : 'rgba(18,18,18,0.2)' }} />)}
    </View>
    <Txt size={12} num align="right" style={{ width: sending ? 56 : 36, color: dark ? colors.onInkMuted : colors.ink2 }}>{sending ? 'Sending…' : formatClock(status.playing || status.currentTime ? duration - status.currentTime : duration)}</Txt>
  </View>;
}

/** A walk, run or ride shared in a chat. Your own opens its activity page. */
function SharedActivityCard({ activity, unit, dark, raised = false, mine }: { activity: SharedActivity; unit: Unit; dark: boolean; raised?: boolean; mine: boolean }) {
  return <Pressable disabled={!mine} onPress={() => router.push(`/activities/${activity.id}`)} style={[styles.shared, { backgroundColor: dark ? colors.onInkWash : raised ? 'rgba(255,255,255,0.06)' : colors.paper }]}>
    <ActivityBadge type={activity.activityType} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt size={13} weight="bold" numberOfLines={1} color={dark ? 'paper' : 'ink'}>{activityName(activity.startedAt, activity.activityType)}</Txt>
      <Txt size={12} num style={{ color: dark ? colors.onInkMuted : colors.ink3 }}>{`${formatDuration(activity.movingSeconds)}${activity.verificationStatus === 'VERIFIED' ? ' · Verified' : ''}`}</Txt>
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

/** Your own bubble in dark mode: a step up from the other side's card. */
const MINE_DARK = '#2C2C30';

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
  meta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, marginTop: 2, marginBottom: -2 },
  tapback: { position: 'absolute', top: -16, minWidth: 30, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.paper, backgroundColor: colors.card, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  reactionBar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 2, height: 52, borderRadius: 26, backgroundColor: colors.white, paddingHorizontal: 6, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  reactionGrid: { flexWrap: 'wrap', width: 6 * 44 + 12, height: 152, borderRadius: 24, paddingVertical: 6, justifyContent: 'center' },
  reaction: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  liftShadow: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  menu: { position: 'absolute', width: 230, borderRadius: 14, backgroundColor: colors.white, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 46, paddingHorizontal: 16 },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  shared: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 220, borderRadius: radius['2xl'], padding: 10 },
});
