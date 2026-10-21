import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, FeedIcon, SendIcon } from '../components/icons';
import { EmojiPopover } from '../components/EmojiPopover';
import { Avatar, EmptyState, ErrorNotice, PageHeader, Skeleton } from '../components/ui';
import { api, post } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatMoney } from '../lib/format';
import { savePayment } from '../lib/payments';
import { keys } from '../lib/queries';
import type { CheckoutResponse } from '../lib/types';

type InboxRow = { username: string; displayName: string; avatarUrl: string | null; body: string; createdAt: string; senderId: string; unreadCount: number };
type MessageReaction = 'LIKE' | 'HEART' | 'LAUGH' | 'FIRE' | 'CLAP';
type Message = { id: string; senderId: string; recipientId: string; body: string; createdAt: string; replyToId: string | null; replyToBody: string | null; replyToSenderId: string | null; reactions: Array<{ userId: string; reaction: MessageReaction }>; invitationId: string | null; invitationStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null; tableId: string | null; tableCode: string | null; tableTitle: string | null; tableType: 'free' | 'sponsored' | 'paid' | null; tableStatus: string | null; guaranteedPrizeKobo: string | null; entryFeeKobo: number | null };
type Conversation = { runner: { username: string; displayName: string; avatarUrl: string | null }; canMessage: boolean; messages: Message[] };
const MESSAGE_REACTIONS: Array<{ value: MessageReaction; emoji: string; label: string }> = [
  { value: 'LIKE', emoji: '👍', label: 'Like' }, { value: 'HEART', emoji: '❤️', label: 'Love' },
  { value: 'LAUGH', emoji: '😂', label: 'Laugh' }, { value: 'FIRE', emoji: '🔥', label: 'Fire' }, { value: 'CLAP', emoji: '👏', label: 'Clap' },
];
const COMPOSER_EMOJI = ['😀', '😂', '❤️', '🔥', '👏', '💪', '🏃', '🚶'];

export function MessagesPage() {
  const inbox = useQuery({ queryKey: ['messages', 'inbox'], queryFn: () => api<InboxRow[]>('/messages'), refetchInterval: 30_000 });
  return <div className="mx-auto max-w-[600px] animate-rise">
    <PageHeader eyebrow="Community" title="Messages" description="Catch up with runners and respond to competition invites." />
    <ErrorNotice error={inbox.error} onRetry={() => void inbox.refetch()} />
    {inbox.isLoading ? <Skeleton className="h-32" /> : !inbox.data?.length ? <EmptyState mark={<FeedIcon size={30} />} title="No messages yet" action={<Link to="/runners" className="btn-secondary">Find runners</Link>}>Open a runner’s profile and tap Message to say hello.</EmptyState> : <ul className="space-y-2">
      {inbox.data.map((row) => <li key={row.username}><Link to="/messages/$username" params={{ username: row.username }} className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 hover:border-ink">
        <Avatar name={row.displayName} src={row.avatarUrl} size={42} />
        <span className="min-w-0 flex-1"><span className="block truncate font-bold">{row.displayName} <span className="font-normal text-ink-3">@{row.username}</span></span><span className={`block truncate text-[13px] ${row.unreadCount ? 'font-semibold text-ink' : 'text-ink-2'}`}>{row.body}</span></span>
        <span className="flex shrink-0 flex-col items-end gap-1"><time className="text-[12px] text-ink-3">{new Date(row.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</time>{row.unreadCount > 0 && <span className="num min-w-[20px] rounded-full bg-bad px-1.5 text-center text-[11px] font-bold leading-5 text-paper" aria-label={`${row.unreadCount} unread messages`}>{row.unreadCount > 9 ? '9+' : row.unreadCount}</span>}</span>
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
  const [showEmoji, setShowEmoji] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiAnchor = useRef<HTMLButtonElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const followLatest = useRef(true);
  const conversation = useQuery({ queryKey: ['messages', username], queryFn: () => api<Conversation>(`/messages/${encodeURIComponent(username)}`), refetchInterval: 15_000 });
  const read = useMutation({
    mutationFn: () => post(`/messages/${encodeURIComponent(username)}/read`),
    onSuccess() { void queryClient.invalidateQueries({ queryKey: keys.messagesUnread }); void queryClient.invalidateQueries({ queryKey: ['messages', 'inbox'] }); },
  });
  const newestIncomingId = [...(conversation.data?.messages ?? [])].reverse().find((message) => message.senderId !== user.id)?.id;
  const markRead = read.mutate;
  useEffect(() => { if (newestIncomingId) markRead(); }, [newestIncomingId, markRead]);
  const send = useMutation({
    mutationFn: () => post(`/messages/${encodeURIComponent(username)}`, { body: body.trim(), ...(replyTo ? { replyToId: replyTo.id } : {}) }),
    onSuccess() { followLatest.current = true; setBody(''); setReplyTo(null); setShowEmoji(false); void queryClient.invalidateQueries({ queryKey: ['messages'] }); },
  });
  useEffect(() => {
    const thread = threadRef.current;
    if (thread && followLatest.current) thread.scrollTop = thread.scrollHeight;
  }, [username, conversation.data?.messages.length]);
  function submit(event: FormEvent) { event.preventDefault(); if (body.trim() && !send.isPending) send.mutate(); }
  return <div className="mx-auto flex h-[100dvh] min-w-0 max-w-[600px] flex-col overflow-hidden bg-paper md:h-auto md:overflow-visible md:bg-transparent">
    <Link to="/messages" className="mb-4 hidden items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink md:inline-flex"><ArrowLeftIcon size={16} /> Messages</Link>
    <ErrorNotice error={conversation.error} onRetry={() => void conversation.refetch()} />
    <ErrorNotice error={read.error} />
    {conversation.isLoading ? <Skeleton className="h-64" /> : conversation.data && <>
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-3 py-2.5 md:mb-3 md:rounded-2xl md:border md:px-4 md:py-3">
        <Link to="/messages" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-paper md:hidden" aria-label="Back to messages"><ArrowLeftIcon size={20} /></Link>
        <Avatar name={conversation.data.runner.displayName} src={conversation.data.runner.avatarUrl} size={42} className="rounded-full" />
        <div className="min-w-0"><h1 className="wide truncate text-[16px] font-black uppercase md:text-[18px]">{conversation.data.runner.displayName}</h1><Link to="/runners/$username" params={{ username }} search={{}} className="block truncate text-[12px] text-ink-2 hover:underline md:text-[13px]">@{username}</Link></div>
      </header>
      <div ref={threadRef} onScroll={(event) => { const target = event.currentTarget; followLatest.current = target.scrollHeight - target.scrollTop - target.clientHeight < 80; }} className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain p-3 pb-5 sm:p-4 md:max-h-[65vh] md:min-h-[45vh] md:flex-none md:rounded-2xl md:border md:border-line md:bg-paper" aria-label="Conversation">
        {!conversation.data.messages.length && <p className="py-12 text-center text-[14px] text-ink-3">No messages yet. Say hello.</p>}
        {conversation.data.messages.map((message) => <MessageBubble key={message.id} message={message} viewerId={user.id} username={username} onReply={() => { setReplyTo(message); composerRef.current?.focus(); }} />)}
      </div>
      <form onSubmit={submit} className="shrink-0 border-t border-line bg-card px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 md:mt-3 md:rounded-2xl md:border md:p-3">
        {replyTo && <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border-l-4 border-track bg-paper px-3 py-2 text-[12px]"><span className="min-w-0 truncate"><strong>Replying to {replyTo.senderId === user.id ? 'yourself' : conversation.data.runner.displayName}</strong><span className="ml-2 text-ink-2">{replyTo.body}</span></span><button type="button" className="font-bold" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button></div>}
        <div className="flex min-w-0 items-end gap-2"><button ref={emojiAnchor} type="button" className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-[23px] hover:bg-paper" onClick={() => setShowEmoji((open) => !open)} aria-label="Choose emoji" aria-expanded={showEmoji}>☺</button><textarea ref={composerRef} rows={1} className="field !min-h-11 max-h-28 min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl !py-2.5" aria-label="Write a private message" maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (body.trim() && !send.isPending) send.mutate(); } }} placeholder="Message…" /><button className="btn-dark !h-11 !w-11 shrink-0 rounded-xl !px-0" aria-label={send.isPending ? 'Sending message' : 'Send message'} title="Send message" disabled={!body.trim() || send.isPending}><SendIcon size={19} /></button></div>
        {showEmoji && <EmojiPopover anchor={emojiAnchor} label="Add emoji" width={208} height={112} onClose={() => setShowEmoji(false)}><div className="grid grid-cols-4 gap-1">{COMPOSER_EMOJI.map((emoji) => <button key={emoji} type="button" className="flex h-11 w-11 items-center justify-center rounded-xl text-[22px] hover:bg-paper" onClick={() => { setBody((value) => value + emoji); setShowEmoji(false); composerRef.current?.focus(); }}>{emoji}</button>)}</div></EmojiPopover>}
      </form>
      <ErrorNotice error={send.error} className="mt-3" />
    </>}
  </div>;
}

function MessageBubble({ message, viewerId, username, onReply }: { message: Message; viewerId: string; username: string; onReply: () => void }) {
  const queryClient = useQueryClient();
  const [showReactions, setShowReactions] = useState(false);
  const reactionAnchor = useRef<HTMLDivElement | null>(null);
  const [dragX, setDragX] = useState(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragDistance = useRef(0);
  const holdTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const mine = message.senderId === viewerId;
  const ownReaction = message.reactions.find((item) => item.userId === viewerId)?.reaction;
  const react = useMutation({
    mutationFn: (reaction: MessageReaction | null) => reaction ? post(`/messages/${message.id}/reaction`, { reaction }) : api(`/messages/${message.id}/reaction`, { method: 'DELETE' }),
    onSuccess() { setShowReactions(false); void queryClient.invalidateQueries({ queryKey: ['messages', username] }); },
  });
  const counts = MESSAGE_REACTIONS.map((choice) => ({ ...choice, count: message.reactions.filter((item) => item.reaction === choice.value).length })).filter((choice) => choice.count);
  const inviteCode = /^Join .+ on Jump: https?:\/\/[^\s]+\/competitions\/([A-F0-9]{8})$/.exec(message.body)?.[1];
  function clearHold() { if (holdTimer.current !== null) window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  return <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
    <div className="max-w-[88%] sm:max-w-[78%]" style={{ transform: `translateX(${dragX}px)`, touchAction: 'pan-y' }}
      onPointerDown={(event) => { suppressClick.current = false; if ((event.target as HTMLElement).closest('a,button,input,select,textarea')) return; pointerStart.current = { x: event.clientX, y: event.clientY }; clearHold(); if (event.pointerType === 'touch') holdTimer.current = window.setTimeout(() => { if (pointerStart.current) { suppressClick.current = true; setShowReactions(true); } }, 450); }}
      onPointerMove={(event) => { if (!pointerStart.current) return; const dx = event.clientX - pointerStart.current.x; const dy = event.clientY - pointerStart.current.y; if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearHold(); if (Math.abs(dx) > Math.abs(dy) && dx > 0) { dragDistance.current = Math.min(dx, 72); setDragX(dragDistance.current); } }}
      onPointerUp={() => { clearHold(); if (dragDistance.current >= 56) { suppressClick.current = true; setShowReactions(false); onReply(); } pointerStart.current = null; dragDistance.current = 0; setDragX(0); }}
      onPointerCancel={() => { clearHold(); pointerStart.current = null; dragDistance.current = 0; setDragX(0); }}>
      <div className={`rounded-2xl border px-3.5 py-2.5 ${mine && !message.invitationId ? 'rounded-br-sm border-ink bg-ink text-paper' : mine ? 'rounded-br-sm border-ink bg-volt text-ink' : 'rounded-bl-sm border-line bg-card text-ink'}`}>
        <div ref={reactionAnchor} role="button" tabIndex={0} aria-label="React to message; swipe right to reply" aria-expanded={showReactions} className="cursor-pointer outline-offset-4"
          onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setShowReactions((open) => !open); }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setShowReactions((open) => !open); } else if (event.key === 'ArrowRight') { event.preventDefault(); onReply(); } }}
          onContextMenu={(event) => { event.preventDefault(); suppressClick.current = true; setShowReactions(true); }}>
          {message.replyToBody && <div className={`mb-2 rounded-lg border-l-2 px-2 py-1 text-[12px] ${mine && !message.invitationId ? 'border-volt bg-paper/10' : 'border-track bg-paper'}`}><span className="block font-bold">{message.replyToSenderId === viewerId ? 'You' : username}</span><span className="block truncate opacity-75">{message.replyToBody}</span></div>}
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{message.body}</p>
          <time className={`mt-1 block text-right text-[10px] ${mine && !message.invitationId ? 'text-paper/60' : 'text-ink-3'}`}>{new Date(message.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </div>
        {message.invitationId ? <InvitationActions message={message} received={message.recipientId === viewerId} username={username} /> : inviteCode && <Link to="/competitions/$code" params={{ code: inviteCode }} className="mt-2 inline-block text-[12px] font-bold underline">View competition</Link>}
      </div>
      {counts.length > 0 && <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>{counts.map((choice) => <button key={choice.value} type="button" className={`rounded-full border px-2 py-0.5 text-[12px] ${ownReaction === choice.value ? 'border-ink bg-volt' : 'border-line bg-card'}`} onClick={() => react.mutate(ownReaction === choice.value ? null : choice.value)} aria-label={`${choice.label} reaction, ${choice.count}`}>{choice.emoji} {choice.count}</button>)}</div>}
      {showReactions && <EmojiPopover anchor={reactionAnchor} label="React to message" width={246} height={62} onClose={() => setShowReactions(false)}><div className="flex gap-0.5">{MESSAGE_REACTIONS.map((choice) => <button key={choice.value} type="button" className="flex h-11 w-11 items-center justify-center rounded-xl text-[22px] hover:bg-paper" title={choice.label} aria-label={choice.label} disabled={react.isPending} onClick={() => react.mutate(ownReaction === choice.value ? null : choice.value)}>{choice.emoji}</button>)}</div></EmojiPopover>}
      <ErrorNotice error={react.error} className="mt-1" />
    </div>
  </div>;
}

function InvitationActions({ message, received, username }: { message: Message; received: boolean; username: string }) {
  const queryClient = useQueryClient();
  const [choosingContribution, setChoosingContribution] = useState(false);
  const [amount, setAmount] = useState('1000');
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
      <input className="field num" aria-label="Contribution amount in naira" type="number" min="1" max="1000000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary btn-sm" disabled={response.isPending} onClick={() => response.mutate({ decision: 'ACCEPT' })}>No thanks · join free</button><button type="button" className="btn-dark btn-sm" disabled={response.isPending || !Number.isSafeInteger(Math.round(Number(amount) * 100)) || Number(amount) < 1 || Number(amount) > 1_000_000} onClick={() => response.mutate({ decision: 'ACCEPT', contributeKobo: Math.round(Number(amount) * 100) })}>Join & contribute</button><button type="button" className="btn-quiet btn-sm" disabled={response.isPending} onClick={() => response.mutate({ decision: 'DECLINE' })}>Decline</button></div>
    </div> : <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="btn-dark btn-sm" disabled={response.isPending} onClick={() => openPool ? setChoosingContribution(true) : response.mutate({ decision: 'ACCEPT' })}>{message.tableType === 'paid' ? `Accept & pay ${formatMoney(message.entryFeeKobo ?? 0)}` : 'Accept · join free'}</button><button type="button" className="btn-secondary btn-sm" disabled={response.isPending} onClick={() => response.mutate({ decision: 'DECLINE' })}>Decline</button></div>}
    <ErrorNotice error={response.error} className="mt-2" />
  </div>;
}
