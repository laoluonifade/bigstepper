import { InfiniteData, QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams, useSearch } from '@tanstack/react-router';
import { FormEvent, ReactNode, RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActivityIcon, ArrowLeftIcon, CameraIcon, CloseIcon, CommentIcon, CycleIcon, FeedIcon, HeartIcon, RunIcon, SendIcon, ShareIcon, TrashIcon } from '../components/icons';
import { ReactionBar } from '../components/ReactionBar';
import { ActivityBadge, activityMetres, ActivityPicker } from '../components/ActivityPicker';
import { MentionText, MentionTextarea } from '../components/Mentions';
import { RantTabs } from '../components/RantTabs';
import { Avatar, cx, EmptyState, ErrorNotice, Loading, Skeleton } from '../components/ui';
import { api, post } from '../lib/api';
import { useUser } from '../lib/auth';
import { activityName, formatDistance, formatDuration } from '../lib/format';
import type { Unit } from '../lib/types';
import { useActivities, useProfile, useUnit, useUnreadMessages } from '../lib/queries';
import { reactionEmoji as symbolFor, REACTIONS, type Reaction } from '../lib/reactions';

type FeedPost = {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  activityId: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  activityType: 'walk' | 'run' | 'cycle' | null;
  startedAt: string | null;
  validatedSteps: number | null;
  distanceMetres: number | null;
  movingSeconds: number | null;
  reactionCount: number;
  myReaction: Reaction | null;
  topReactions?: Reaction[];
  commentCount: number;
  imageUrl?: string | null;
};

type FeedComment = { id: string; postId: string; userId: string; body: string; createdAt: string; username: string; displayName: string; avatarUrl: string | null; pending?: boolean };

/** Applies a change to a post wherever it's cached: the feed pages and its own page. */
function updatePost(queryClient: QueryClient, id: string, change: (post: FeedPost) => FeedPost) {
  queryClient.setQueryData<InfiniteData<FeedPost[]>>(['feed', 'explore'], (data) => data && {
    ...data,
    pages: data.pages.map((page) => page.map((item) => (item.id === id ? change(item) : item))),
  });
  queryClient.setQueryData<FeedPost>(['feed-post', id], (item) => item && change(item));
}

export function FeedPage() {
  const user = useUser();
  const unit = useUnit();
  const unreadMessages = useUnreadMessages().data?.count ?? 0;
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const feed = useInfiniteQuery({
    queryKey: ['feed', 'explore'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<FeedPost[]>(`/feed?scope=explore&page=${pageParam}`),
    getNextPageParam: (lastPage, pages) => lastPage.length === 20 ? pages.length : undefined,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/feed/${id}`, { method: 'DELETE' }),
    onSuccess() { setConfirmDelete(null); void queryClient.invalidateQueries({ queryKey: ['feed'] }); },
  });
  const posts = feed.data?.pages.flat() ?? [];

  return <div className="mx-auto max-w-[600px] animate-rise">
    <header className="mb-4">
      <p className="eyebrow">Community</p>
      <h1 className="display mt-1 text-[30px] leading-none">Rant</h1>
    </header>

    <div className="-mx-4 sm:mx-0">
      <div className="sticky top-14 z-10 bg-paper/95 backdrop-blur md:top-0"><RantTabs active="explore" unread={unreadMessages} /></div>
      <Composer unit={unit} />

      <ErrorNotice error={feed.error} onRetry={() => void feed.refetch()} className="m-4" />
      {feed.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-28" />)}</div> : !posts.length ? <div className="px-4 py-6">
        <EmptyState mark={<FeedIcon size={30} />} title="No rants yet" action={<Link to="/runners" className="btn-secondary">Find runners</Link>}>
          Be the first: share how your last walk, run or ride went.
        </EmptyState>
      </div> : <div className="divide-y divide-line border-b border-line">
        {posts.map((item) => <PostCard
          key={item.id}
          item={item}
          unit={unit}
          viewerId={user.id}
          confirmingDelete={confirmDelete === item.id}
          onAskDelete={() => setConfirmDelete(item.id)}
          onCancelDelete={() => setConfirmDelete(null)}
          onDelete={() => remove.mutate(item.id)}
          deleting={remove.isPending}
        />)}
        <ErrorNotice error={remove.error} className="m-4" />
        {feed.hasNextPage && <div className="p-3"><button type="button" className="btn-quiet w-full" onClick={() => void feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>{feed.isFetchingNextPage ? 'Loading…' : 'Show older posts'}</button></div>}
      </div>}
    </div>
  </div>;
}

function Composer({ unit }: { unit: Unit }) {
  const user = useUser();
  const profile = useProfile();
  const activities = useActivities();
  const search = useSearch({ strict: false }) as { activity?: string };
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [activityId, setActivityId] = useState(search.activity ?? '');
  const [pickingActivity, setPickingActivity] = useState(false);
  const activityButton = useRef<HTMLButtonElement | null>(null);
  const [photo, setPhoto] = useState<{ preview: string; url: string | null } | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const filePicker = useRef<HTMLInputElement | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<{ url: string }>('/feed/images', { method: 'POST', body: form });
    },
    onSuccess: ({ url }) => setPhoto((current) => current && { ...current, url }),
    onError: () => setPhoto(null),
  });
  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto({ preview: URL.createObjectURL(file), url: null });
    upload.mutate(file);
  }
  function clearPhoto() {
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
    upload.reset();
  }
  useEffect(() => { if (search.activity) setActivityId(search.activity); }, [search.activity]);
  useLayoutEffect(() => {
    const field = textarea.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 240)}px`;
  }, [body]);

  const create = useMutation({
    mutationFn: () => post('/feed', { body: body.trim(), ...(activityId ? { activityId } : {}), ...(photo?.url ? { imageUrl: photo.url } : {}) }),
    onSuccess() {
      setBody('');
      setActivityId('');
      clearPhoto();
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  const verified = (activities.data ?? []).filter((activity) => activity.verificationStatus === 'VERIFIED');
  const attached = verified.find((activity) => activity.id === activityId);
  const canPost = Boolean(body.trim() || activityId || photo?.url) && !create.isPending && !upload.isPending;

  function publish(event: FormEvent) {
    event.preventDefault();
    if (canPost) create.mutate();
  }

  return <form onSubmit={publish} className="flex gap-3 border-b border-line px-4 pb-3 pt-4">
    <Avatar name={profile.data?.displayName ?? user.displayName ?? 'You'} src={profile.data?.avatarUrl} size={40} className="shrink-0 rounded-full" />
    <div className="min-w-0 flex-1">
      <label htmlFor="feed-body" className="sr-only">Post to Rant</label>
      <MentionTextarea
        ref={textarea}
        id="feed-body"
        rows={1}
        maxLength={500}
        value={body}
        onValueChange={setBody}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) publish(event); }}
        placeholder="How did your walk, run or ride go? Tag friends with @"
        className="block w-full resize-none bg-transparent py-2 text-[17px] leading-snug outline-none placeholder:text-ink-3"
      />
      {photo && <div className="relative mt-2 inline-block">
        <img src={photo.preview} alt="Your photo" className={cx('max-h-72 rounded-2xl border border-line object-cover', upload.isPending && 'opacity-60')} />
        {upload.isPending && <span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-ink/70 px-3 py-1 text-[12px] font-bold text-paper">Uploading…</span></span>}
        <button type="button" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink/75 text-paper hover:bg-ink" onClick={clearPhoto} aria-label="Remove photo"><CloseIcon size={16} /></button>
      </div>}
      {attached && <div className="mt-2 flex max-w-sm items-center gap-3 rounded-2xl border border-line bg-card p-2 pr-2.5">
        <ActivityBadge type={attached.activityType} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[14px] font-semibold">{activityName(attached.startedAt, attached.activityType)}</span>
          <span className="num block text-[12px] text-ink-3">{formatDistance(activityMetres(attached), unit)} · {new Date(attached.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        </span>
        <button type="button" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.06] hover:text-ink" onClick={() => setActivityId('')} aria-label="Remove activity"><CloseIcon size={15} /></button>
      </div>}
      <div className="mt-2 flex items-center justify-end gap-3">
        <input ref={filePicker} type="file" accept="image/*" className="hidden" onChange={(event) => { choosePhoto(event.target.files?.[0]); event.target.value = ''; }} />
        <div className="-ml-2 mr-auto flex items-center">
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-track-deep hover:bg-track-wash" onClick={() => filePicker.current?.click()} aria-label="Add a photo" title="Add a photo"><CameraIcon size={19} /></button>
          <button ref={activityButton} type="button" className={cx('flex h-9 w-9 items-center justify-center rounded-full text-track-deep hover:bg-track-wash', attached && 'bg-track-wash')} onClick={() => setPickingActivity((open) => !open)} aria-label="Attach an activity" title="Attach an activity" aria-expanded={pickingActivity}><ActivityIcon size={19} /></button>
        </div>
        {pickingActivity && <ActivityPicker anchor={activityButton} unit={unit} activities={verified} selectedId={activityId} title="Attach a verified activity" onClose={() => setPickingActivity(false)} onPick={(activity) => { setActivityId((current) => current === activity.id ? '' : activity.id); setPickingActivity(false); }} />}
        {body.length > 400 && <span className={cx('num text-[12px]', body.length >= 500 ? 'text-bad' : 'text-ink-3')}>{500 - body.length}</span>}
        <button type="submit" className="h-9 rounded-full bg-track px-5 text-[14px] font-bold text-paper transition hover:bg-track-deep disabled:bg-ink/15 disabled:text-ink-3" disabled={!canPost}>{create.isPending ? 'Posting…' : 'Post'}</button>
      </div>
      <ErrorNotice error={create.error ?? upload.error} className="mt-3" />
    </div>
  </form>;
}

function PostCard({ item, unit, viewerId, confirmingDelete, onAskDelete, onCancelDelete, onDelete, deleting }: {
  item: FeedPost; unit: Unit; viewerId: string; confirmingDelete: boolean; onAskDelete: () => void; onCancelDelete: () => void; onDelete: () => void; deleting: boolean;
}) {
  return <article className="relative flex gap-3 px-4 py-3.5 transition-colors hover:bg-ink/[0.02]">
    <Link to="/runners/$username" params={{ username: item.username }} search={{}} aria-label={`View ${item.displayName}'s profile`} className="relative z-[1] h-fit shrink-0 self-start rounded-full">
      <Avatar name={item.displayName} src={item.avatarUrl} size={42} className="rounded-full" />
    </Link>
    <div className="min-w-0 flex-1">
      <p className="flex min-w-0 items-baseline gap-1 text-[14px] leading-tight">
        <Link to="/runners/$username" params={{ username: item.username }} search={{}} className="relative z-[1] truncate font-bold hover:underline">{item.displayName}</Link>
        <span className="truncate text-ink-3">@{item.username}</span>
        <span className="text-ink-3" aria-hidden="true">·</span>
        <time dateTime={item.createdAt} className="shrink-0 text-ink-3" title={new Date(item.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}>{shortAgo(item.createdAt)}</time>
        {item.userId === viewerId && !confirmingDelete && <button type="button" className="relative z-[1] ml-auto shrink-0 self-center rounded-full p-1 text-ink-3 hover:bg-bad-wash hover:text-bad" onClick={onAskDelete} aria-label="Delete post"><TrashIcon size={15} /></button>}
      </p>
      {/* The whole card opens the post; links and buttons inside sit above this overlay. */}
      <Link to="/feed/$id" params={{ id: item.id }} className="absolute inset-0" aria-label={`Open post by ${item.displayName}`} />
      {item.body && <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-snug"><MentionText text={item.body} /></p>}
      {/* In the list these are part of the card, so a tap anywhere opens the post. */}
      {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" className="mt-2.5 max-h-[420px] w-full rounded-2xl border border-line object-cover" />}
      {item.activityId && item.activityType && <ActivityAttachment item={item} unit={unit} mine={false} />}
      <ActionBar item={item} viewerId={viewerId} />
      {confirmingDelete && <div className="relative z-[1] mt-2 flex items-center justify-end gap-4 text-[13px]">
        <span className="text-ink-2">Delete this post?</span>
        <button type="button" className="font-semibold text-ink-2 hover:text-ink" onClick={onCancelDelete}>Keep</button>
        <button type="button" className="font-bold text-bad" onClick={onDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
      </div>}
    </div>
  </article>;
}

/** "❤️🔥 12 · 3 comments", only when there's something to show. */
function ActionBar({ item, viewerId, onComment }: { item: FeedPost; viewerId: string; onComment?: () => void }) {
  const [copied, setCopied] = useState(false);
  const action = 'relative z-[1] inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-ink/[0.05] hover:text-ink';

  async function share() {
    const url = `${window.location.origin}/feed/${item.id}`;
    try {
      if (navigator.share) await navigator.share({ url, title: `${item.displayName} on Jump` });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // Cancelled share sheet: nothing to do.
    }
  }

  return <div className="-ml-2.5 mt-1.5 flex items-center gap-1">
    <ReactButton item={item} className={action} />
    {onComment
      ? <button type="button" className={action} onClick={onComment} aria-label={`${item.commentCount} comments. Write a comment`}><CommentIcon size={18} />{item.commentCount > 0 ? <span className="num">{item.commentCount}</span> : 'Comment'}</button>
      : <Link to="/feed/$id" params={{ id: item.id }} hash="reply" className={action} aria-label="Comment"><CommentIcon size={18} />Comment</Link>}
    {item.userId !== viewerId && <Link to="/messages/$username" params={{ username: item.username }} className={action} aria-label={`Message ${item.displayName}`}><SendIcon size={16} /></Link>}
    <button type="button" className={cx(action, 'ml-auto')} onClick={() => void share()} aria-label="Share post">
      {copied ? <span className="text-[12px] text-ok">Link copied</span> : <ShareIcon size={16} />}
    </button>
  </div>;
}

/** Tap to ❤️ (instantly); press and hold, or right-click, for other reactions. */
function ReactButton({ item, className }: { item: FeedPost; className: string }) {
  const queryClient = useQueryClient();
  const anchor = useRef<HTMLButtonElement | null>(null);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const [picking, setPicking] = useState(false);
  const [burst, setBurst] = useState(0);

  const react = useMutation({
    mutationFn: (reaction: Reaction | null) => reaction ? post(`/feed/${item.id}/reaction`, { reaction }) : api(`/feed/${item.id}/reaction`, { method: 'DELETE' }),
    onMutate(reaction) {
      const previous = item;
      updatePost(queryClient, item.id, (current) => ({
        ...current,
        myReaction: reaction,
        reactionCount: current.reactionCount + (reaction && !current.myReaction ? 1 : !reaction && current.myReaction ? -1 : 0),
        topReactions: reaction && !(current.topReactions ?? []).includes(reaction) ? [reaction, ...(current.topReactions ?? [])].slice(0, 3) : current.topReactions,
      }));
      return { previous };
    },
    onError(_error, _reaction, context) {
      if (context) updatePost(queryClient, item.id, () => context.previous);
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['feed-post', item.id] });
    },
  });

  function choose(reaction: Reaction | null) {
    setPicking(false);
    if (reaction) setBurst((value) => value + 1);
    react.mutate(reaction);
  }
  function clearHold() {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  const mine = item.myReaction;
  return <>
    <button
      ref={anchor}
      type="button"
      className={cx(className, mine && 'text-bad hover:text-bad')}
      aria-pressed={Boolean(mine)}
      aria-label={mine ? `Remove your ${REACTIONS.find((choice) => choice.value === mine)?.label ?? ''} reaction` : 'Love this post'}
      onPointerDown={() => { held.current = false; clearHold(); holdTimer.current = window.setTimeout(() => { held.current = true; setPicking(true); }, 420); }}
      onPointerUp={clearHold}
      onPointerLeave={clearHold}
      onContextMenu={(event) => { event.preventDefault(); clearHold(); held.current = true; setPicking(true); }}
      onClick={() => { if (held.current) { held.current = false; return; } choose(mine ? null : 'HEART'); }}
    >
      <span key={burst} className={cx('inline-flex', burst > 0 && 'animate-pop')}>
        {mine && mine !== 'HEART' ? <span className="text-[17px] leading-none">{symbolFor(mine)}</span> : <HeartIcon size={18} filled={mine === 'HEART'} />}
      </span>
      {item.reactionCount > 0 && <span className="num">{item.reactionCount}</span>}
    </button>
    {picking && <ReactionBar anchor={anchor} current={mine} onPick={choose} onClose={() => setPicking(false)} />}
    {react.error && <span className="sr-only" role="alert">Couldn’t save your reaction.</span>}
  </>;
}

export function FeedPostPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const user = useUser();
  const unit = useUnit();
  const location = useLocation();
  const replyField = useRef<HTMLTextAreaElement | null>(null);
  const post = useQuery({ queryKey: ['feed-post', id], queryFn: () => api<FeedPost>(`/feed/${encodeURIComponent(id)}`) });
  const loaded = Boolean(post.data);
  useEffect(() => {
    if (loaded && location.hash === 'reply') replyField.current?.focus();
  }, [loaded, location.hash]);

  const bar = <div className="sticky top-14 z-10 -mx-4 flex h-12 items-center gap-2 border-b border-line bg-paper/95 px-2 backdrop-blur sm:mx-0 md:top-0">
    <Link to="/feed" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink/[0.06]" aria-label="Back to Rant"><ArrowLeftIcon size={20} /></Link>
    <p className="text-[17px] font-bold">Post</p>
  </div>;
  if (post.isLoading) return <div className="mx-auto max-w-[600px]">{bar}<Loading /></div>;
  if (post.error || !post.data) return <div className="mx-auto max-w-[600px]">{bar}<ErrorNotice error={post.error} onRetry={() => void post.refetch()} className="mt-4" /></div>;
  const item = post.data;
  const posted = new Date(item.createdAt);
  return <div className="mx-auto -mt-6 max-w-[600px] animate-rise md:-mt-10">
    {bar}
    <div className="-mx-4 sm:mx-0">
      <article className="px-4 pt-4">
        <div className="flex items-center gap-3">
          <Link to="/runners/$username" params={{ username: item.username }} search={{}} className="shrink-0"><Avatar name={item.displayName} src={item.avatarUrl} size={48} className="rounded-full" /></Link>
          <div className="min-w-0 flex-1 leading-tight">
            <Link to="/runners/$username" params={{ username: item.username }} search={{}} className="block truncate text-[16px] font-bold hover:underline">{item.displayName}</Link>
            <span className="block truncate text-[14px] text-ink-3">@{item.username}</span>
          </div>
          {item.userId !== user.id && <Link to="/messages/$username" params={{ username: item.username }} className="h-9 shrink-0 rounded-full border border-line px-4 text-[13px] font-bold leading-9 hover:border-ink">Message</Link>}
        </div>
        {item.body && <p className="mt-4 whitespace-pre-wrap break-words text-[19px] leading-relaxed"><MentionText text={item.body} /></p>}
        {item.imageUrl && <PostImage src={item.imageUrl} className="mt-3 max-h-[560px]" />}
        {item.activityId && item.activityType && <ActivityAttachment item={item} unit={unit} mine={item.userId === user.id} />}
        <p className="mt-4 text-[14px] text-ink-3">
          <time dateTime={item.createdAt}>{posted.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {posted.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
        </p>
        <div className="mt-3 border-y border-line py-1">
          <ActionBar item={item} viewerId={user.id} onComment={() => replyField.current?.focus()} />
        </div>
      </article>
      <Comments post={item} viewerId={user.id} replyField={replyField} />
    </div>
  </div>;
}

/** A post photo; tap to see it full size. */
function PostImage({ src, className }: { src: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={cx('relative z-[1] block w-full overflow-hidden rounded-2xl border border-line bg-ink/[0.03]', className)} onClick={() => setOpen(true)} aria-label="View photo">
      <img src={src} alt="" loading="lazy" className="h-full max-h-[inherit] w-full object-cover" />
    </button>
    {open && createPortal(<div className="fixed inset-0 z-50 flex animate-fade items-center justify-center bg-ink/90 p-4" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setOpen(false)}>
      <img src={src} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
      <button type="button" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-paper/15 text-paper hover:bg-paper/25" aria-label="Close photo"><CloseIcon size={20} /></button>
    </div>, document.body)}
  </>;
}

function Comments({ post: item, viewerId, replyField }: { post: FeedPost; viewerId: string; replyField: RefObject<HTMLTextAreaElement> }) {
  const queryClient = useQueryClient();
  const profile = useProfile();
  const [body, setBody] = useState('');
  const comments = useQuery({ queryKey: ['feed-comments', item.id], queryFn: () => api<FeedComment[]>(`/feed/${item.id}/comments`) });
  useLayoutEffect(() => {
    const field = replyField.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 140)}px`;
  }, [body, replyField]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['feed-comments', item.id] });
    void queryClient.invalidateQueries({ queryKey: ['feed-post', item.id] });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  };
  const comment = useMutation({
    mutationFn: (text: string) => post(`/feed/${item.id}/comments`, { body: text }),
    onMutate(text) {
      // Show it straight away; the server copy replaces it when the list refreshes.
      const pending: FeedComment = {
        id: `pending-${crypto.randomUUID()}`, postId: item.id, userId: viewerId, body: text, createdAt: new Date().toISOString(),
        username: profile.data?.username ?? '', displayName: profile.data?.displayName ?? 'You', avatarUrl: profile.data?.avatarUrl ?? null, pending: true,
      };
      queryClient.setQueryData<FeedComment[]>(['feed-comments', item.id], (current) => [...(current ?? []), pending]);
      updatePost(queryClient, item.id, (current) => ({ ...current, commentCount: current.commentCount + 1 }));
      setBody('');
      return { pending, text };
    },
    onError(_error, _text, context) {
      queryClient.setQueryData<FeedComment[]>(['feed-comments', item.id], (current) => current?.filter((entry) => entry.id !== context?.pending.id));
      updatePost(queryClient, item.id, (current) => ({ ...current, commentCount: Math.max(0, current.commentCount - 1) }));
      setBody((current) => current || context?.text || '');
    },
    onSettled: refresh,
  });
  const removeComment = useMutation({ mutationFn: (id: string) => api(`/feed/comments/${id}`, { method: 'DELETE' }), onSuccess: refresh });

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = body.trim();
    if (text && !comment.isPending) comment.mutate(text);
  }

  const list = comments.data ?? [];
  return <>
    <ErrorNotice error={comment.error || comments.error || removeComment.error} className="m-4" />
    {comments.isLoading ? <div className="p-4"><Skeleton className="h-14" /></div> : !list.length ? <p className="px-4 py-12 text-center text-[14px] text-ink-3">No comments yet. Be the first.</p> : <div className="divide-y divide-line">
      {list.map((entry) => <div key={entry.id} className={cx('flex min-w-0 gap-3 px-4 py-3.5', entry.pending && 'opacity-60')}>
        <Link to="/runners/$username" params={{ username: entry.username }} search={{}} className="h-fit shrink-0 self-start rounded-full"><Avatar name={entry.displayName} src={entry.avatarUrl} size={38} className="rounded-full" /></Link>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline gap-1.5 text-[14px] leading-tight">
            <Link to="/runners/$username" params={{ username: entry.username }} search={{}} className="truncate font-bold hover:underline">{entry.displayName}</Link>
            <time dateTime={entry.createdAt} className="shrink-0 text-[13px] text-ink-3">{entry.pending ? 'Posting…' : shortAgo(entry.createdAt)}</time>
            {entry.userId === viewerId && !entry.pending && <button type="button" className="ml-auto shrink-0 self-center rounded-full p-1 text-ink-3 hover:bg-bad-wash hover:text-bad" onClick={() => removeComment.mutate(entry.id)} disabled={removeComment.isPending} aria-label="Delete comment"><TrashIcon size={14} /></button>}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-snug"><MentionText text={entry.body} /></p>
        </div>
      </div>)}
    </div>}
    {/* Pinned above the mobile tab bar, like a chat composer. */}
    <form onSubmit={submit} className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex items-end gap-2 border-t border-line bg-paper/95 px-4 py-2.5 backdrop-blur md:bottom-0">
      <Avatar name={profile.data?.displayName ?? 'You'} src={profile.data?.avatarUrl} size={34} className="mb-0.5 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 items-end rounded-3xl border border-line bg-card pl-4 pr-1 focus-within:border-ink">
        <MentionTextarea
          ref={replyField}
          id={`reply-${item.id}`}
          rows={1}
          className="min-w-0 flex-1 resize-none bg-transparent py-2 text-[15px] leading-snug outline-none placeholder:text-ink-3"
          aria-label="Write a comment"
          maxLength={500}
          value={body}
          onValueChange={setBody}
          placement="above"
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}
          placeholder={`Reply to ${item.displayName.split(' ')[0]}…`}
        />
        <SendButton disabled={!body.trim() || comment.isPending} label="Post comment" />
      </div>
    </form>
  </>;
}

export function SendButton({ disabled, label, children }: { disabled: boolean; label: string; children?: ReactNode }) {
  return <button className="my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-track text-paper transition hover:bg-track-deep disabled:bg-transparent disabled:text-ink-3" aria-label={label} title={label} disabled={disabled}>
    {children ?? <SendIcon size={15} />}
  </button>;
}

/** Twitter-style timestamp: `now`, `5m`, `3h`, `2d`, then the date. */
function shortAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 7 * 1440) return `${Math.floor(minutes / 1440)}d`;
  const date = new Date(iso);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

function ActivityAttachment({ item, unit, mine }: { item: FeedPost; unit: Unit; mine: boolean }) {
  const run = item.activityType === 'run';
  const card = <span className="mt-2.5 flex items-stretch overflow-hidden rounded-xl border border-line">
    <span className={cx('flex w-12 shrink-0 items-center justify-center', run ? 'bg-track text-paper' : 'bg-volt')}>{item.activityType === 'cycle' ? <CycleIcon size={20} /> : <RunIcon size={20} />}</span>
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3 bg-card px-3 py-2.5">
      <span className="min-w-0">
        <span className="wide block text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-ink-2">{item.startedAt ? activityName(item.startedAt, item.activityType!) : item.activityType}</span>
        <span className="num block truncate text-[12px] text-ink-2">{item.activityType === 'cycle' ? 'GPS distance' : `${(item.validatedSteps ?? 0).toLocaleString('en-GB')} steps`} · {formatDuration(item.movingSeconds ?? 0)}</span>
      </span>
      <span className="score num shrink-0 text-[24px] leading-none">{formatDistance(item.distanceMetres ?? 0, unit)}</span>
    </span>
  </span>;
  return mine ? <Link to="/activities/$id" params={{ id: item.activityId! }} search={{}} className="relative z-[1] block transition-transform hover:-translate-y-0.5">{card}</Link> : card;
}
