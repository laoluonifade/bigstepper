import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { CSSProperties, FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIcon, ArrowLeftIcon, CheckIcon, ClockIcon, CopyIcon, EditIcon, FeedIcon, MicIcon, ReplyIcon, PauseIcon, PlayIcon, SendIcon, TrashIcon } from '../components/icons';
import { ActivityBadge, ActivityPicker } from '../components/ActivityPicker';
import { EmojiPicker } from '../components/EmojiPicker';
import { ReactionBar } from '../components/ReactionBar';
import { Avatar, cx, EmptyState, ErrorNotice, Skeleton } from '../components/ui';
import { RantTabs } from '../components/RantTabs';
import { api, patch, post } from '../lib/api';
import { useUser } from '../lib/auth';
import { activityName, formatDistance, formatDuration, formatMoney, formatNairaInput, nairaInputToKobo } from '../lib/format';
import { savePayment } from '../lib/payments';
import { keys, useActivities, useUnit, useUnreadMessages } from '../lib/queries';
import { REACTIONS, type Reaction } from '../lib/reactions';
import { toast } from '../lib/toast';
import { formatClock, useVoiceRecorder, VOICE_NOTE_MAX_SECONDS, type VoiceRecording } from '../lib/voice';
import type { Activity, AvatarStyle, CheckoutResponse, Unit } from '../lib/types';

type InboxRow = { username: string; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; body: string; kind?: 'text' | 'voice' | 'activity'; createdAt: string; senderId: string; unreadCount: number };
type MessageReaction = Reaction;
type SharedActivity = { id: string; activityType: 'walk' | 'run' | 'cycle'; startedAt: string; verificationStatus: string; distanceMetres: number; movingSeconds: number; steps: number };
type Message = { id: string; senderId: string; recipientId: string; body: string; createdAt: string; editedAt: string | null; replyToId: string | null; replyToBody: string | null; replyToSenderId: string | null; reactions: Array<{ userId: string; reaction: MessageReaction }>; invitationId: string | null; invitationStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null; tableId: string | null; tableCode: string | null; tableTitle: string | null; tableType: 'free' | 'sponsored' | 'paid' | null; tableStatus: string | null; guaranteedPrizeKobo: string | null; entryFeeKobo: number | null; activity?: SharedActivity | null; audioUrl?: string | null; audioSeconds?: number | null; pending?: boolean };
type Conversation = { runner: { username: string; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle }; canMessage: boolean; messages: Message[] };
type SendDraft = { text: string; reply: Message | null; activityId?: string; voice?: VoiceRecording & { localUrl: string } };
type SentMessage = Pick<Message, 'id' | 'senderId' | 'recipientId' | 'body' | 'createdAt' | 'replyToId'>;

export function MessagesPage() {
  const unread = useUnreadMessages().data?.count ?? 0;
  const inbox = useQuery({ queryKey: ['messages', 'inbox'], queryFn: () => api<InboxRow[]>('/messages'), refetchInterval: 30_000 });
  return <div className="mx-auto max-w-[600px] animate-rise">
    <header className="mb-4"><p className="eyebrow">Community</p><h1 className="display mt-1 text-[30px] leading-none">Rant</h1></header>
    <div className="-mx-4 mb-4 sm:mx-0"><RantTabs active="dms" unread={unread} /></div>
    <ErrorNotice error={inbox.error} onRetry={() => void inbox.refetch()} />
    {inbox.isLoading ? <Skeleton className="h-32" /> : !inbox.data?.length ? <EmptyState mark={<FeedIcon size={30} />} title="No messages yet" action={<Link to="/runners" className="btn-secondary">Find runners</Link>}>Open a runner’s profile and tap Message to say hello.</EmptyState> : <ul className="-mx-4 divide-y divide-line border-b border-line sm:mx-0">
      {inbox.data.map((row) => <li key={row.username}><Link to="/messages/$username" params={{ username: row.username }} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-card">
        <Avatar name={row.displayName} src={row.avatarUrl} avatarStyle={row.avatarStyle} size={48} className="shrink-0 rounded-full" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate"><span className="font-bold">{row.displayName}</span> <span className="text-[13px] text-ink-3">@{row.username}</span></span><time className={`shrink-0 text-[12px] ${row.unreadCount ? 'font-semibold text-ink' : 'text-ink-3'}`}>{new Date(row.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</time></span>
          <span className="mt-0.5 flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-[13px] ${row.unreadCount ? 'font-semibold text-ink' : 'text-ink-2'}`}>{row.kind === 'voice' ? '🎤 Voice note' : row.body || 'Shared an activity'}</span>{row.unreadCount > 0 && <span className="num min-w-[20px] shrink-0 rounded-full bg-bad px-1.5 text-center text-[11px] font-bold leading-5 text-paper" aria-label={`${row.unreadCount} unread messages`}>{row.unreadCount > 9 ? '9+' : row.unreadCount}</span>}</span>
        </span>
      </Link></li>)}
    </ul>}
  </div>;
}

export function ConversationPage() {
  const { username } = useParams({ strict: false }) as { username: string };
  const user = useUser();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const stashedDraft = useRef<{ body: string; replyTo: Message | null }>({ body: '', replyTo: null });
  const [showEmoji, setShowEmoji] = useState(false);
  const [pickingActivity, setPickingActivity] = useState(false);
  const sendVoice = (recording: VoiceRecording) => send.mutate({ text: '', reply: replyTo, voice: { ...recording, localUrl: URL.createObjectURL(recording.blob) } });
  const voice = useVoiceRecorder(sendVoice);
  const voiceError = voice.error;
  const clearVoiceError = voice.clearError;
  useEffect(() => {
    if (!voiceError) return;
    toast({ tone: 'warn', message: voiceError });
    clearVoiceError();
  }, [voiceError, clearVoiceError]);
  const activityAnchor = useRef<HTMLButtonElement | null>(null);
  const myActivities = useActivities();
  const unit = useUnit();
  const [viewport, setViewport] = useState<{ height: number; top: number; keyboardOpen: boolean } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiAnchor = useRef<HTMLButtonElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const followLatest = useRef(true);
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () => setViewport({ height: visual.height, top: visual.offsetTop, keyboardOpen: visual.height + visual.offsetTop < window.innerHeight - 100 });
    update();
    visual.addEventListener('resize', update);
    visual.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => { visual.removeEventListener('resize', update); visual.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  const conversation = useQuery({ queryKey: ['messages', username], queryFn: () => api<Conversation>(`/messages/${encodeURIComponent(username)}`), refetchInterval: 15_000 });
  const read = useMutation({
    mutationFn: () => post(`/messages/${encodeURIComponent(username)}/read`),
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
        form.append('file', voice.blob, `voice.${voice.mimeType.includes('mp4') ? 'm4a' : voice.mimeType.includes('ogg') ? 'ogg' : 'webm'}`);
        const { url } = await api<{ url: string }>('/messages/voice', { method: 'POST', body: form });
        audio = { audioUrl: url, audioSeconds: voice.seconds };
      }
      return post<SentMessage>(`/messages/${encodeURIComponent(username)}`, { body: text, ...(reply ? { replyToId: reply.id } : {}), ...(activityId ? { activityId } : {}), ...(audio ?? {}) });
    },
    async onMutate({ text, reply, activityId, voice }) {
      const queryKey = ['messages', username];
      await queryClient.cancelQueries({ queryKey });
      const pendingId = `pending-${crypto.randomUUID()}`;
      const pendingMessage: Message = {
        id: pendingId, senderId: user.id, recipientId: '', body: text, createdAt: new Date().toISOString(), editedAt: null,
        replyToId: reply?.id ?? null, replyToBody: reply?.body ?? null, replyToSenderId: reply?.senderId ?? null,
        reactions: [], invitationId: null, invitationStatus: null, tableId: null, tableCode: null,
        tableTitle: null, tableType: null, tableStatus: null, guaranteedPrizeKobo: null, entryFeeKobo: null, pending: true,
        activity: activityId ? sharedFromMine(myActivities.data?.find((activity) => activity.id === activityId)) : null,
        audioUrl: voice?.localUrl ?? null, audioSeconds: voice?.seconds ?? null,
      };
      followLatest.current = true;
      queryClient.setQueryData<Conversation>(queryKey, (current) => current && { ...current, messages: [...current.messages, pendingMessage] });
      setBody('');
      setReplyTo(null);
      setShowEmoji(false);
      return { pendingId, text, reply };
    },
    onSuccess(saved, _draft, context) {
      queryClient.setQueryData<Conversation>(['messages', username], (current) => current && {
        ...current,
        messages: current.messages.flatMap((message) => message.id === context?.pendingId
          ? current.messages.some((item) => item.id === saved.id) ? [] : [{ ...message, ...saved, pending: false }]
          : [message]),
      });
      void queryClient.invalidateQueries({ queryKey: ['messages', username] });
      void queryClient.invalidateQueries({ queryKey: ['messages', 'inbox'] });
    },
    onError(_error, _draft, context) {
      queryClient.setQueryData<Conversation>(['messages', username], (current) => current && {
        ...current,
        messages: current.messages.filter((message) => message.id !== context?.pendingId),
      });
      setBody((current) => current ? `${context?.text ?? ''}\n${current}` : context?.text ?? '');
      setReplyTo((current) => current ?? context?.reply ?? null);
    },
  });
  const edit = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => patch<Pick<Message, 'id' | 'body' | 'editedAt'>>(`/messages/${id}`, { body: text }),
    onSuccess(updated) {
      queryClient.setQueryData<Conversation>(['messages', username], (current) => current && {
        ...current,
        messages: current.messages.map((item) => item.id === updated.id ? { ...item, ...updated } : item.replyToId === updated.id ? { ...item, replyToBody: updated.body } : item),
      });
      stopEditing();
      void queryClient.invalidateQueries({ queryKey: ['messages', 'inbox'] });
      void queryClient.invalidateQueries({ queryKey: ['messages', username] });
    },
  });
  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = 'auto';
    composer.style.height = `${Math.min(composer.scrollHeight, 168)}px`;
  }, [body, conversation.data]);
  useEffect(() => {
    const thread = threadRef.current;
    if (thread && followLatest.current) thread.scrollTop = thread.scrollHeight;
  }, [username, conversation.data?.messages.length, viewport?.height]);
  function startEditing(message: Message) {
    if (!editing) stashedDraft.current = { body, replyTo };
    setEditing(message);
    setReplyTo(null);
    setBody(message.body);
    setShowEmoji(false);
    edit.reset();
    requestAnimationFrame(() => { const composer = composerRef.current; if (composer) { composer.focus(); composer.setSelectionRange(composer.value.length, composer.value.length); } });
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
  function submit(event: FormEvent) { event.preventDefault(); sendOrSave(); }
  return <div className="fixed inset-x-0 z-40 mx-auto flex h-[var(--chat-height)] min-w-0 max-w-[600px] flex-col overflow-hidden bg-paper md:static md:h-auto md:overflow-visible md:bg-transparent" style={{ '--chat-height': viewport ? `${viewport.height}px` : '100dvh', top: viewport?.top ?? 0 } as CSSProperties}>
    <Link to="/messages" className="mb-4 hidden items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink md:inline-flex"><ArrowLeftIcon size={16} /> Messages</Link>
    <ErrorNotice error={conversation.error} onRetry={() => void conversation.refetch()} />
    <ErrorNotice error={read.error} />
    {conversation.isLoading ? <Skeleton className="h-64" /> : conversation.data && <>
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-3 py-2.5 md:mb-3 md:rounded-2xl md:border md:px-4 md:py-3">
        <Link to="/messages" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-paper md:hidden" aria-label="Back to messages"><ArrowLeftIcon size={20} /></Link>
        <Avatar name={conversation.data.runner.displayName} src={conversation.data.runner.avatarUrl} avatarStyle={conversation.data.runner.avatarStyle} size={42} className="rounded-full" />
        <div className="min-w-0"><h1 className="wide truncate text-[16px] font-black uppercase md:text-[18px]">{conversation.data.runner.displayName}</h1><Link to="/runners/$username" params={{ username }} search={{}} className="block truncate text-[12px] text-ink-2 hover:underline md:text-[13px]">@{username}</Link></div>
      </header>
      <div ref={threadRef} onScroll={(event) => { const target = event.currentTarget; followLatest.current = target.scrollHeight - target.scrollTop - target.clientHeight < 80; }} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3 pb-5 sm:p-4 md:max-h-[65vh] md:min-h-[45vh] md:flex-none md:rounded-2xl md:border md:border-line md:bg-paper" aria-label="Conversation">
        {!conversation.data.messages.length && <div className="flex flex-col items-center py-12 text-center">
          <Avatar name={conversation.data.runner.displayName} src={conversation.data.runner.avatarUrl} avatarStyle={conversation.data.runner.avatarStyle} size={72} className="rounded-full" />
          <p className="mt-3 font-bold">{conversation.data.runner.displayName}</p>
          <p className="text-[14px] text-ink-3">Say hello 👋</p>
        </div>}
        {conversation.data.messages.map((message, index, all) => {
          const previous = all[index - 1];
          const next = all[index + 1];
          const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
          // Messages from one person within five minutes read as one group.
          const joinsPrevious = !newDay && previous?.senderId === message.senderId && gapMinutes(previous, message) < 5;
          const joinsNext = Boolean(next) && next.senderId === message.senderId && dayLabel(next.createdAt) === dayLabel(message.createdAt) && gapMinutes(message, next) < 5;
          return <div key={message.id} className={newDay ? 'pt-2' : joinsPrevious ? 'pt-0.5' : 'pt-3'}>
            {newDay && <p className="mb-3 text-center"><span className="rounded-full bg-ink/[0.06] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{dayLabel(message.createdAt)}</span></p>}
            <MessageBubble unit={unit} message={message} viewerId={user.id} username={username} runner={conversation.data!.runner} firstInGroup={!joinsPrevious} lastInGroup={!joinsNext} beingEdited={editing?.id === message.id} onEdit={() => startEditing(message)} onReply={() => { if (editing) stopEditing(); setReplyTo(message); composerRef.current?.focus(); }} />
          </div>;
        })}
      </div>
      <form onSubmit={submit} className={`shrink-0 border-t border-line bg-card px-3 pt-2 md:mt-3 md:rounded-2xl md:border md:p-3 ${viewport?.keyboardOpen ? 'pb-2' : 'pb-[max(env(safe-area-inset-bottom),0.5rem)]'}`}>
        <ErrorNotice error={send.error} className="mb-2" />
        <ErrorNotice error={edit.error} className="mb-2" />
        {editing && <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border-l-4 border-volt bg-paper px-3 py-2 text-[12px]"><span className="min-w-0 truncate"><strong>Editing message</strong><span className="ml-2 text-ink-2">{editing.body}</span></span><button type="button" className="font-bold" onClick={stopEditing} aria-label="Cancel editing">×</button></div>}
        {replyTo && <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border-l-4 border-track bg-paper px-3 py-2 text-[12px]"><span className="min-w-0 truncate"><strong>Replying to {replyTo.senderId === user.id ? 'yourself' : conversation.data.runner.displayName}</strong><span className="ml-2 text-ink-2">{replyTo.body}</span></span><button type="button" className="font-bold" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button></div>}
        {voice.recording ? <div className="flex min-w-0 items-center gap-2">
          <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-bad-wash hover:text-bad" onClick={() => void voice.stop(false)} aria-label="Discard voice note"><TrashIcon size={19} /></button>
          <div className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-3xl border border-bad/40 bg-bad-wash/60 px-4" role="status" aria-live="polite">
            <span className="h-2.5 w-2.5 shrink-0 animate-blink rounded-full bg-bad" />
            <span className="num text-[15px] font-semibold">{formatClock(voice.seconds)}</span>
            <span className="flex h-6 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <span key={index} className="w-[3px] animate-stride rounded-full bg-bad/60" style={{ height: `${30 + ((index * 37) % 70)}%`, animationDelay: `${(index % 7) * 110}ms` }} />)}</span>
            <span className="hidden text-[12px] text-ink-3 sm:inline">max {formatClock(VOICE_NOTE_MAX_SECONDS)}</span>
          </div>
          <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-track text-paper transition hover:bg-track-deep" onClick={() => void voice.stop().then((recording) => recording && sendVoice(recording))} aria-label="Send voice note"><SendIcon size={18} /></button>
        </div> : <div className="flex min-w-0 items-end gap-2">
          <div className="flex min-w-0 flex-1 items-end rounded-3xl border border-line bg-paper pl-1 pr-1 focus-within:border-ink">
            <button ref={emojiAnchor} type="button" className="flex h-10 w-9 shrink-0 items-center justify-center rounded-full text-[20px] text-ink-2 hover:text-ink" onClick={() => setShowEmoji((open) => !open)} aria-label="Choose emoji" aria-expanded={showEmoji}>☺</button>
            {!editing && <button ref={activityAnchor} type="button" className="flex h-10 w-8 shrink-0 items-center justify-center rounded-full text-ink-2 hover:text-ink" onClick={() => setPickingActivity((open) => !open)} aria-label="Share an activity" aria-expanded={pickingActivity}><ActivityIcon size={19} /></button>}
            <textarea ref={composerRef} rows={1} className="max-h-[168px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2.5 text-[15px] leading-snug outline-none placeholder:text-ink-3" aria-label={editing ? 'Edit message' : 'Write a private message'} maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && editing) { event.preventDefault(); stopEditing(); } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendOrSave(); } }} placeholder="Message…" />
          </div>
          {editing
            ? <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition disabled:bg-ink/15 disabled:text-ink-3" aria-label={edit.isPending ? 'Saving edit' : 'Save edit'} title="Save edit" disabled={!body.trim() || edit.isPending}><CheckIcon size={19} /></button>
            : body.trim()
              ? <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-track text-paper transition hover:bg-track-deep disabled:bg-ink/10 disabled:text-ink-3" aria-label={send.isPending ? 'Sending message' : 'Send message'} title="Send message" disabled={send.isPending}><SendIcon size={18} /></button>
              : <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition hover:bg-ink/85" aria-label="Record a voice note" title="Record a voice note" onClick={() => { setShowEmoji(false); void voice.start(); }}><MicIcon size={19} /></button>}
        </div>}
        {showEmoji && <EmojiPicker anchor={emojiAnchor} onClose={() => setShowEmoji(false)} onPick={(emoji) => { setBody((value) => value + emoji); composerRef.current?.focus(); }} />}
        {pickingActivity && <ActivityPicker anchor={activityAnchor} unit={unit} activities={(myActivities.data ?? []).filter((activity) => activity.verificationStatus !== 'REJECTED')} onClose={() => setPickingActivity(false)} onPick={(activity) => { setPickingActivity(false); send.mutate({ text: body.trim(), reply: replyTo, activityId: activity.id }); }} />}
      </form>
    </>}
  </div>;
}

function MessageBubble({ unit, message, viewerId, username, runner, firstInGroup, lastInGroup, beingEdited, onEdit, onReply }: {
  unit: Unit; message: Message; viewerId: string; username: string; runner: Conversation['runner']; firstInGroup: boolean; lastInGroup: boolean; beingEdited: boolean; onEdit: () => void; onReply: () => void;
}) {
  const queryClient = useQueryClient();
  const [showReactions, setShowReactions] = useState(false);
  const reactionAnchor = useRef<HTMLDivElement | null>(null);
  const [dragX, setDragX] = useState(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragDistance = useRef(0);
  const holdTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const lastTap = useRef(0);
  const [burst, setBurst] = useState(0);
  const mine = message.senderId === viewerId;
  const dark = mine && !message.invitationId;
  const ownReaction = message.reactions.find((item) => item.userId === viewerId)?.reaction;
  const react = useMutation({
    mutationFn: (reaction: MessageReaction | null) => reaction ? post(`/messages/${message.id}/reaction`, { reaction }) : api(`/messages/${message.id}/reaction`, { method: 'DELETE' }),
    onMutate(reaction) {
      setShowReactions(false);
      if (reaction) setBurst((value) => value + 1);
      const reactions = [...message.reactions.filter((item) => item.userId !== viewerId), ...(reaction ? [{ userId: viewerId, reaction }] : [])];
      queryClient.setQueryData<Conversation>(['messages', username], (current) => current && {
        ...current, messages: current.messages.map((item) => item.id === message.id ? { ...item, reactions } : item),
      });
    },
    onSettled() { void queryClient.invalidateQueries({ queryKey: ['messages', username] }); },
  });
  const counts = REACTIONS.map((choice) => ({ ...choice, count: message.reactions.filter((item) => item.reaction === choice.value).length })).filter((choice) => choice.count);
  const inviteCode = /^Join .+ on Jump: https?:\/\/[^\s]+\/competitions\/([A-F0-9]{8})$/.exec(message.body)?.[1];
  function clearHold() { if (holdTimer.current !== null) window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  function toggleHeart() { react.mutate(ownReaction === 'HEART' ? null : 'HEART'); }
  // Bubble corners: the tail only on the last message of a group, squared where messages stack.
  const corners = mine
    ? cx('rounded-[20px]', !firstInGroup && 'rounded-tr-md', !lastInGroup ? 'rounded-br-md' : 'rounded-br-sm')
    : cx('rounded-[20px]', !firstInGroup && 'rounded-tl-md', !lastInGroup ? 'rounded-bl-md' : 'rounded-bl-sm');
  const time = new Date(message.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return <div className={cx('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
    {!mine && <span className="w-7 shrink-0">{lastInGroup && <Avatar name={runner.displayName} src={runner.avatarUrl} avatarStyle={runner.avatarStyle} size={28} className="rounded-full" />}</span>}
    <div className={cx('relative max-w-[80%] select-none sm:max-w-[72%]', message.pending && 'pointer-events-none', counts.length > 0 && 'mb-3')} style={{ transform: `translateX(${dragX}px)`, touchAction: 'pan-y', WebkitTouchCallout: 'none' }}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => { suppressClick.current = false; if ((event.target as HTMLElement).closest('a,button,input,select,textarea')) return; pointerStart.current = { x: event.clientX, y: event.clientY }; clearHold(); if (event.pointerType === 'touch') holdTimer.current = window.setTimeout(() => { if (pointerStart.current) { suppressClick.current = true; setShowReactions(true); } }, 450); }}
      onPointerMove={(event) => { if (!pointerStart.current) return; const dx = event.clientX - pointerStart.current.x; const dy = event.clientY - pointerStart.current.y; if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearHold(); if (Math.abs(dx) > Math.abs(dy) && dx > 0) { dragDistance.current = Math.min(dx, 72); setDragX(dragDistance.current); } }}
      onPointerUp={() => { clearHold(); if (dragDistance.current >= 56) { suppressClick.current = true; setShowReactions(false); onReply(); } pointerStart.current = null; dragDistance.current = 0; setDragX(0); }}
      onPointerCancel={() => { clearHold(); pointerStart.current = null; dragDistance.current = 0; setDragX(0); }}>
      <div className={cx('px-3.5 py-2', corners, beingEdited && 'ring-2 ring-volt ring-offset-2 ring-offset-paper', dark ? 'bg-ink text-paper' : mine ? 'border border-ink bg-volt text-ink' : 'border border-line bg-card text-ink')}>
        <div ref={reactionAnchor} role="button" tabIndex={0} aria-label="Message: tap for reactions, double-tap to love, swipe right to reply" aria-expanded={showReactions} className="cursor-pointer outline-offset-4"
          onClick={() => {
            if (suppressClick.current) { suppressClick.current = false; return; }
            const now = Date.now();
            if (now - lastTap.current < 300) { lastTap.current = 0; setShowReactions(false); toggleHeart(); return; }
            lastTap.current = now;
            window.setTimeout(() => { if (lastTap.current === now) setShowReactions((open) => !open); }, 300);
          }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setShowReactions((open) => !open); } else if (event.key === 'ArrowRight') { event.preventDefault(); onReply(); } }}
          onContextMenu={(event) => { event.preventDefault(); suppressClick.current = true; setShowReactions(true); }}>
          {message.replyToBody && <div className={cx('mb-1.5 rounded-xl border-l-[3px] px-2.5 py-1 text-[12px]', dark ? 'border-volt bg-paper/10' : 'border-track bg-paper')}><span className="block font-bold">{message.replyToSenderId === viewerId ? 'You' : runner.displayName}</span><span className="block truncate opacity-75">{message.replyToBody}</span></div>}
          {message.activity && <SharedActivityCard activity={message.activity} unit={unit} dark={dark} mine={mine} />}
          {message.audioUrl && <VoiceNotePlayer id={message.id} src={message.audioUrl} seconds={message.audioSeconds ?? 0} dark={dark} sending={Boolean(message.pending)} />}
          <p className={cx('whitespace-pre-wrap break-words text-[15px] leading-snug', message.activity && message.body && 'mt-1.5')}>
            {message.body}
            {/* Time sits inline at the end of the text, like most chat apps. */}
            <span className={cx('float-right ml-2 mt-1.5 text-[10.5px] leading-none', dark ? 'text-paper/55' : 'text-ink-3')}>{message.pending ? (message.audioUrl ? null : <><ClockIcon size={11} className="mr-0.5 inline align-[-1px]" />Sending</>) : <>{message.editedAt && 'Edited · '}{time}{mine && !message.pending && <CheckIcon size={11} className="ml-0.5 inline align-[-1px]" />}</>}</span>
          </p>
        </div>
        {message.invitationId ? <InvitationActions message={message} received={message.recipientId === viewerId} username={username} /> : inviteCode && <Link to="/competitions/$code" params={{ code: inviteCode }} className="mt-2 inline-block text-[12px] font-bold underline">View competition</Link>}
      </div>
      {/* One small pill hanging off the bubble's corner: the emojis used, then the total. Tap to change yours. */}
      {counts.length > 0 && <button type="button" key={burst} className={cx(
        'absolute -bottom-3 flex h-[22px] animate-pop items-center gap-0.5 rounded-full bg-card pl-1 pr-1.5 text-[13px] leading-none shadow-[0_2px_10px_-2px_rgba(18,18,18,0.25)] ring-1 ring-ink/[0.06]',
        mine ? 'right-3' : 'left-3', counts.length === 1 && counts[0].count === 1 && 'pr-1',
      )} onClick={() => setShowReactions(true)} aria-label={`Reactions: ${counts.map((choice) => `${choice.label} ${choice.count}`).join(', ')}`}>
        {counts.slice(0, 3).map((choice) => <span key={choice.value}>{choice.emoji}</span>)}
        {message.reactions.length > 1 && <span className="num ml-0.5 text-[11px] font-semibold text-ink-2">{message.reactions.length}</span>}
      </button>}
      {showReactions && <ReactionBar anchor={reactionAnchor} current={ownReaction} onPick={(reaction) => react.mutate(reaction)} onClose={() => setShowReactions(false)} menu={[
        { label: 'Reply', icon: <ReplyIcon size={16} />, onSelect: () => { setShowReactions(false); onReply(); } },
        ...(message.body ? [{ label: 'Copy', icon: <CopyIcon size={16} />, onSelect: () => { setShowReactions(false); void navigator.clipboard?.writeText(message.body); } }] : []),
        ...(dark && !message.activity && !message.audioUrl ? [{ label: 'Edit', icon: <EditIcon size={16} />, onSelect: () => { setShowReactions(false); onEdit(); } }] : []),
      ]} />}
      <ErrorNotice error={react.error} className="mt-1" />
    </div>
  </div>;
}

/** Play/pause, a seekable bar of fixed "waveform" ticks, and the time left. */
function VoiceNotePlayer({ id, src, seconds, dark, sending = false }: { id: string; src: string; seconds: number; dark: boolean; sending?: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(seconds);
  const [failed, setFailed] = useState(false);
  // Same id, same bar heights: a stable pseudo-waveform without decoding the audio.
  const bars = useMemo(() => Array.from({ length: 30 }, (_, index) => {
    const code = id.charCodeAt(index % id.length) + index * 13;
    return 25 + (code * 7919) % 75;
  }), [id]);
  const progress = duration ? Math.min(1, position / duration) : 0;

  function toggle() {
    const player = audio.current;
    if (!player) return;
    if (player.paused) {
      document.querySelectorAll('audio').forEach((other) => { if (other !== player) other.pause(); });
      void player.play().catch(() => setFailed(true));
    } else player.pause();
  }

  return <div className="flex min-w-[210px] items-center gap-2.5 py-0.5" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <audio ref={audio} src={src} preload="metadata"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPosition(0); }}
      onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }}
      onError={() => setFailed(true)} />
    {sending
      ? <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', dark ? 'bg-paper/15' : 'bg-ink/10')} role="status" aria-label="Sending voice note">
        <span className={cx('h-5 w-5 animate-spin rounded-full border-2 border-t-transparent', dark ? 'border-paper' : 'border-ink')} />
      </span>
      : <button type="button" className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95', dark ? 'bg-paper text-ink' : 'bg-ink text-paper')} onClick={toggle} aria-label={playing ? 'Pause voice note' : 'Play voice note'}>
        {playing ? <PauseIcon size={15} /> : <PlayIcon size={15} className="translate-x-[1px]" />}
      </button>}
    <button type="button" disabled={sending} className={cx('flex h-8 flex-1 items-center gap-[2px]', sending && 'animate-pulse')} aria-label="Seek" onClick={(event) => {
      const player = audio.current;
      if (!player || !duration) return;
      const rect = event.currentTarget.getBoundingClientRect();
      player.currentTime = ((event.clientX - rect.left) / rect.width) * duration;
      setPosition(player.currentTime);
    }}>
      {bars.map((height, index) => <span key={index} className={cx('w-[3px] flex-1 rounded-full transition-colors', index / bars.length < progress ? (dark ? 'bg-volt' : 'bg-track') : dark ? 'bg-paper/35' : 'bg-ink/20')} style={{ height: `${height}%` }} />)}
    </button>
    <span className={cx('num shrink-0 text-right text-[12px]', sending ? 'w-14' : 'w-9', dark ? 'text-paper/70' : 'text-ink-2')}>{sending ? 'Sending…' : failed ? '—' : formatClock(playing || position ? duration - position : duration)}</span>
  </div>;
}

/** A walk, run or ride shared in a chat. Your own opens its activity page. */
function SharedActivityCard({ activity, unit, dark, mine }: { activity: SharedActivity; unit: Unit; dark: boolean; mine: boolean }) {
  const card = <span className={cx('flex min-w-[220px] items-center gap-3 rounded-2xl p-2.5', dark ? 'bg-paper/10' : 'bg-paper')}>
    <ActivityBadge type={activity.activityType} />
    <span className="min-w-0 flex-1 leading-tight">
      <span className="block truncate text-[13px] font-bold">{activityName(activity.startedAt, activity.activityType)}</span>
      <span className={cx('num block text-[12px]', dark ? 'text-paper/60' : 'text-ink-3')}>{formatDuration(activity.movingSeconds)}{activity.verificationStatus === 'VERIFIED' ? ' · Verified' : ''}</span>
    </span>
    <span className="score num shrink-0 text-[20px] leading-none">{formatDistance(activity.distanceMetres, unit)}</span>
  </span>;
  return mine ? <Link to="/activities/$id" params={{ id: activity.id }} search={{}} className="block">{card}</Link> : card;
}

function sharedFromMine(activity: Activity | undefined): SharedActivity | null {
  if (!activity) return null;
  return {
    id: activity.id, activityType: activity.activityType, startedAt: activity.startedAt, verificationStatus: activity.verificationStatus,
    distanceMetres: activity.verificationStatus === 'VERIFIED' ? Math.max(activity.validatedDistanceMetres, activity.stepDistanceMetres ?? 0) : activity.recordedDistanceMetres,
    movingSeconds: activity.movingSeconds, steps: activity.validatedSteps,
  };
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function gapMinutes(earlier: Message, later: Message) {
  return (new Date(later.createdAt).getTime() - new Date(earlier.createdAt).getTime()) / 60_000;
}

function InvitationActions({ message, received, username }: { message: Message; received: boolean; username: string }) {
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
        window.location.assign(checkout.authorizationUrl);
      } else if (contributeKobo) {
        const checkout = await post<CheckoutResponse>(`/tables/${tableId}/fund-prize`, { amountKobo: contributeKobo });
        savePayment({ reference: checkout.reference, purpose: 'SPONSOR_FUNDING', tableId, tableCode: code, tableTitle: message.tableTitle ?? 'Competition', amountKobo: contributeKobo, createdAt: new Date().toISOString() });
        window.location.assign(checkout.authorizationUrl);
      }
    },
    async onSettled() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messages', username] }),
        queryClient.invalidateQueries({ queryKey: ['tables', 'mine'] }),
        ...(code ? [queryClient.invalidateQueries({ queryKey: keys.table(code) })] : []),
      ]);
    },
  });
  if (!message.invitationId || !code) return null;
  if (message.invitationStatus !== 'PENDING') return <div className="mt-2"><Link to="/competitions/$code" params={{ code }} className="text-[12px] font-bold underline">View competition</Link><span className="ml-2 text-[12px] font-semibold uppercase text-ink-2">{message.invitationStatus === 'ACCEPTED' ? 'Accepted' : 'Declined'}</span>{response.error && <><ErrorNotice error={response.error} className="mt-2" /><p className="mt-1 text-[12px] text-ink-2">You joined, but funding checkout did not open. You can still contribute from the competition page.</p></>}</div>;
  if (!received) return <p className="mt-2 text-[12px] text-ink-2">Invitation pending</p>;
  return <div className="mt-3 border-t border-line pt-3">
    <Link to="/competitions/$code" params={{ code }} className="text-[12px] font-bold underline">View competition</Link>
    {message.tableStatus !== 'OPEN_FOR_ENTRY' ? <p className="mt-2 text-[12px] text-ink-2">{message.tableStatus === 'PENDING_FUNDING' ? 'The host must fund this draft before you can accept.' : 'Entry is not open right now.'}</p> : choosingContribution ? <div className="mt-3 space-y-2">
      <p className="text-[12px] font-semibold">Contribution is optional. Join free, or fund the prize.</p>
      <p className="text-[12px] text-ink-2">Contributing is optional. You can still win this competition’s cash prize if you contribute.</p>
      <input className="field num" aria-label="Contribution amount in naira" type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(formatNairaInput(event.target.value))} />
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary btn-sm" disabled={response.isPending} onClick={() => response.mutate({ decision: 'ACCEPT' })}>No thanks · join free</button><button type="button" className="btn-dark btn-sm" disabled={response.isPending || !Number.isSafeInteger(nairaInputToKobo(amount)) || nairaInputToKobo(amount) < 100 || nairaInputToKobo(amount) > 100_000_000} onClick={() => response.mutate({ decision: 'ACCEPT', contributeKobo: nairaInputToKobo(amount) })}>Join & contribute</button><button type="button" className="btn-quiet btn-sm" disabled={response.isPending} onClick={() => response.mutate({ decision: 'DECLINE' })}>Decline</button></div>
    </div> : <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="btn-dark btn-sm" disabled={response.isPending} onClick={() => openPool ? setChoosingContribution(true) : response.mutate({ decision: 'ACCEPT' })}>{message.tableType === 'paid' ? `Accept & pay ${formatMoney(message.entryFeeKobo ?? 0)}` : 'Accept · join free'}</button><button type="button" className="btn-secondary btn-sm" disabled={response.isPending} onClick={() => response.mutate({ decision: 'DECLINE' })}>Decline</button></div>}
    <ErrorNotice error={response.error} className="mt-2" />
  </div>;
}
