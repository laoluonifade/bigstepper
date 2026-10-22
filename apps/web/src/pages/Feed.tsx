import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ActivityIcon, CloseIcon, CycleIcon, FeedIcon, LockIcon, RunIcon, TrashIcon } from '../components/icons';
import { EmojiPopover } from '../components/EmojiPopover';
import { RantTabs } from '../components/RantTabs';
import { Avatar, cx, EmptyState, ErrorNotice, Loading, Skeleton } from '../components/ui';
import { api, post } from '../lib/api';
import { useUser } from '../lib/auth';
import { activityName, formatDistance, formatDuration } from '../lib/format';
import type { Unit } from '../lib/types';
import { useActivities, useProfile, useUnit, useUnreadMessages } from '../lib/queries';

type FeedPost = {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  activityId: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  activityVisibility: 'public' | 'followers' | 'private';
  activityType: 'walk' | 'run' | 'cycle' | null;
  startedAt: string | null;
  validatedSteps: number | null;
  distanceMetres: number | null;
  movingSeconds: number | null;
  reactionCount: number;
  myReaction: Reaction | null;
  commentCount: number;
};

type Reaction = 'LIKE' | 'FIRE' | 'CLAP' | 'HEART';
type FeedComment = { id: string; postId: string; userId: string; body: string; createdAt: string; username: string; displayName: string; avatarUrl: string | null };
const REACTIONS: { value: Reaction; symbol: string; label: string }[] = [
  { value: 'LIKE', symbol: '👍', label: 'Like' }, { value: 'FIRE', symbol: '🔥', label: 'Fire' },
  { value: 'CLAP', symbol: '👏', label: 'Clap' }, { value: 'HEART', symbol: '♥', label: 'Love' },
];

export function FeedPage() {
  const user = useUser();
  const unit = useUnit();
  const profile = useProfile();
  const unreadMessages = useUnreadMessages().data?.count ?? 0;
  const activities = useActivities();
  const search = useSearch({ strict: false }) as { activity?: string };
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [activityId, setActivityId] = useState(search.activity ?? '');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  useEffect(() => { if (search.activity) setActivityId(search.activity); }, [search.activity]);

  const feed = useInfiniteQuery({
    queryKey: ['feed', 'explore'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<FeedPost[]>(`/feed?scope=explore&page=${pageParam}`),
    getNextPageParam: (lastPage, pages) => lastPage.length === 20 ? pages.length : undefined,
  });
  const create = useMutation({
    mutationFn: () => post('/feed', { body: body.trim(), ...(activityId ? { activityId } : {}) }),
    onSuccess() {
      setBody('');
      setActivityId('');
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/feed/${id}`, { method: 'DELETE' }),
    onSuccess() { setConfirmDelete(null); void queryClient.invalidateQueries({ queryKey: ['feed'] }); },
  });
  const verified = activities.data?.filter((activity) => activity.verificationStatus === 'VERIFIED') ?? [];
  const posts = feed.data?.pages.flat() ?? [];

  function publish(event: FormEvent) {
    event.preventDefault();
    if ((body.trim() || activityId) && !create.isPending) create.mutate();
  }

  const myName = profile.data?.displayName ?? user.displayName ?? 'You';
  const attached = verified.find((activity) => activity.id === activityId);
  const audience = profile.data?.activityVisibility === 'private' ? 'Only you' : profile.data?.activityVisibility === 'followers' ? 'Followers' : 'Public';

  return <div className="mx-auto max-w-[600px] animate-rise">
    <header className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="eyebrow">Community</p>
        <h1 className="display mt-1 text-[30px] leading-none">Rant</h1>
      </div>
    </header>

    <div className="-mx-4 sm:mx-0">
      <div className="sticky top-14 z-10 bg-paper/95 backdrop-blur md:top-0"><RantTabs active="explore" unread={unreadMessages} /></div>

      <form onSubmit={publish} className="flex gap-3 border-b border-line px-4 pb-3 pt-4">
        <Avatar name={myName} src={profile.data?.avatarUrl} size={40} className="rounded-full" />
        <div className="min-w-0 flex-1">
          <label htmlFor="feed-body" className="sr-only">Post about your workout</label>
          <textarea
            id="feed-body"
            rows={body ? 3 : 1}
            maxLength={500}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="How did your walk or run go?"
            className="block w-full resize-none bg-transparent py-2 text-[16px] leading-snug outline-none placeholder:text-ink-3"
          />
          {attached && <div className="mt-1 flex items-center gap-2">
            <ActivityChip type={attached.activityType} distance={formatDistance(Math.max(attached.validatedDistanceMetres, attached.stepDistanceMetres ?? 0), unit)} />
            <button type="button" className="text-ink-3 hover:text-ink" onClick={() => setActivityId('')} aria-label="Remove activity"><CloseIcon size={16} /></button>
          </div>}
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1">
              <label className="relative -ml-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-track-deep hover:bg-track-wash">
                <ActivityIcon size={17} />
                {attached ? 'Change' : 'Add activity'}
                <select aria-label="Attach a verified activity" className="absolute inset-0 cursor-pointer opacity-0" value={activityId} onChange={(event) => setActivityId(event.target.value)}>
                  <option value="">No activity attached</option>
                  {verified.map((activity) => <option key={activity.id} value={activity.id}>
                    {new Date(activity.startedAt).toLocaleDateString('en-GB')} · {activity.activityType} · {formatDistance(Math.max(activity.validatedDistanceMetres, activity.stepDistanceMetres ?? 0), unit)}
                  </option>)}
                </select>
              </label>
              <span className="truncate text-[13px] text-ink-3" title={profile.data?.activityVisibility === 'private' ? 'Change activity visibility in Profile to share posts.' : undefined}>{audience}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {body.length > 400 && <span className={cx('num text-[12px]', body.length >= 500 ? 'text-bad' : 'text-ink-3')}>{500 - body.length}</span>}
              <button type="submit" className="h-9 rounded-full bg-ink px-5 text-[14px] font-bold text-paper transition-opacity hover:bg-ink/85 disabled:opacity-30" disabled={create.isPending || (!body.trim() && !activityId)}>{create.isPending ? 'Posting…' : 'Post'}</button>
            </div>
          </div>
          <ErrorNotice error={create.error} className="mt-3" />
        </div>
      </form>

      <ErrorNotice error={feed.error} onRetry={() => void feed.refetch()} className="m-4" />
      {feed.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-20" />)}</div> : !posts.length ? (<div className="px-4 py-6">
        <EmptyState mark={<FeedIcon size={30} />} title="No updates yet" action={<Link to="/runners" className="btn-secondary">Find runners</Link>}>
          Public workout updates will appear here.
        </EmptyState>
      </div>) : <div className="divide-y divide-line border-b border-line">
        {posts.map((item) => <article key={item.id} className="flex gap-3 px-4 py-3 transition-colors hover:bg-ink/[0.025]">
          <Link to="/runners/$username" params={{ username: item.username }} search={{}} aria-label={`View ${item.displayName}'s profile`} className="shrink-0"><Avatar name={item.displayName} src={item.avatarUrl} size={40} className="rounded-full" /></Link>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-baseline gap-1 text-[14px] leading-tight">
              <Link to="/runners/$username" params={{ username: item.username }} search={{}} className="truncate font-bold hover:underline">{item.displayName}</Link>
              <span className="truncate text-ink-3">@{item.username}</span>
              <span className="text-ink-3" aria-hidden="true">·</span>
              <Link to="/feed/$id" params={{ id: item.id }} className="shrink-0 text-ink-3 hover:underline"><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}>{shortAgo(item.createdAt)}</time></Link>
              {item.activityVisibility !== 'public' && <LockIcon size={12} className="shrink-0 self-center text-ink-3" aria-label={item.activityVisibility === 'private' ? 'Only you' : 'Followers'} />}
              {item.userId === user.id && confirmDelete !== item.id && <button type="button" className="ml-auto shrink-0 self-center rounded-full p-1 text-ink-3 hover:bg-bad-wash hover:text-bad" onClick={() => setConfirmDelete(item.id)} aria-label="Delete post"><TrashIcon size={15} /></button>}
            </p>
            {item.body && <Link to="/feed/$id" params={{ id: item.id }} className="mt-1 block whitespace-pre-wrap break-words text-[15px] leading-snug hover:underline">{item.body}</Link>}
            {item.activityId && item.activityType && <ActivityAttachment item={item} unit={unit} mine={item.userId === user.id} />}
            {!item.body && <Link to="/feed/$id" params={{ id: item.id }} className="mt-2 block text-[12px] font-bold text-ink-2 underline">View post</Link>}
            <PostInteractions item={item} viewerId={user.id} />
            {confirmDelete === item.id && <div className="mt-2 flex items-center justify-end gap-4 text-[13px]">
              <span className="text-ink-2">Delete this post?</span>
              <button type="button" className="font-semibold text-ink-2 hover:text-ink" onClick={() => setConfirmDelete(null)}>Keep</button>
              <button type="button" className="font-bold text-bad" onClick={() => remove.mutate(item.id)} disabled={remove.isPending}>{remove.isPending ? 'Deleting…' : 'Delete'}</button>
            </div>}
          </div>
        </article>)}
        <ErrorNotice error={remove.error} className="m-4" />
        {feed.hasNextPage && <div className="p-3"><button type="button" className="btn-quiet w-full" onClick={() => void feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>{feed.isFetchingNextPage ? 'Loading…' : 'Show older posts'}</button></div>}
      </div>}
    </div>
  </div>;
}

export function FeedPostPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const user = useUser();
  const unit = useUnit();
  const post = useQuery({ queryKey: ['feed-post', id], queryFn: () => api<FeedPost>(`/feed/${encodeURIComponent(id)}`) });
  if (post.isLoading) return <Loading />;
  if (post.error || !post.data) return <div className="mx-auto max-w-[600px]"><Link to="/feed" className="text-[13px] font-bold underline">← Rant</Link><ErrorNotice error={post.error} onRetry={() => void post.refetch()} className="mt-4" /></div>;
  const item = post.data;
  return <div className="mx-auto max-w-[600px] animate-rise">
    <Link to="/feed" className="mb-4 inline-flex min-h-10 items-center text-[13px] font-bold text-ink-2 hover:text-ink">← Rant</Link>
    <article className="-mx-4 border-y border-line bg-card p-4 sm:mx-0 sm:rounded-2xl sm:border sm:p-5">
      <div className="flex items-center gap-3">
        <Link to="/runners/$username" params={{ username: item.username }} search={{}}><Avatar name={item.displayName} src={item.avatarUrl} size={44} className="rounded-full" /></Link>
        <div className="min-w-0"><Link to="/runners/$username" params={{ username: item.username }} search={{}} className="block truncate font-bold hover:underline">{item.displayName}</Link><p className="text-[12px] text-ink-3">@{item.username} · {shortAgo(item.createdAt)}</p></div>
      </div>
      {item.body && <p className="mt-4 whitespace-pre-wrap break-words text-[16px] leading-relaxed">{item.body}</p>}
      {item.activityId && item.activityType && <ActivityAttachment item={item} unit={unit} mine={item.userId === user.id} />}
      <PostInteractions item={item} viewerId={user.id} detail />
    </article>
  </div>;
}

function PostInteractions({ item, viewerId, detail = false }: { item: FeedPost; viewerId: string; detail?: boolean }) {
  const queryClient = useQueryClient();
  const [showReactions, setShowReactions] = useState(false);
  const reactionAnchor = useRef<HTMLButtonElement | null>(null);
  const showComments = detail;
  const [commentBody, setCommentBody] = useState('');
  const comments = useQuery({ queryKey: ['feed-comments', item.id], queryFn: () => api<FeedComment[]>(`/feed/${item.id}/comments`), enabled: showComments });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['feed'] }); void queryClient.invalidateQueries({ queryKey: ['feed-post', item.id] }); void queryClient.invalidateQueries({ queryKey: ['feed-comments', item.id] }); };
  const react = useMutation({
    mutationFn: (reaction: Reaction | null) => reaction ? post(`/feed/${item.id}/reaction`, { reaction }) : api(`/feed/${item.id}/reaction`, { method: 'DELETE' }),
    onSuccess() { setShowReactions(false); refresh(); },
  });
  const comment = useMutation({ mutationFn: () => post(`/feed/${item.id}/comments`, { body: commentBody.trim() }), onSuccess() { setCommentBody(''); refresh(); } });
  const removeComment = useMutation({ mutationFn: (id: string) => api(`/feed/comments/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  return <div className="mt-3 border-t border-line pt-2.5">
    <div className="flex flex-wrap items-center gap-4 text-[13px] font-semibold text-ink-2">
      <button ref={reactionAnchor} type="button" className="min-h-9 rounded-full px-2 hover:bg-paper hover:text-ink" onClick={() => setShowReactions((value) => !value)} aria-expanded={showReactions}>
        {REACTIONS.find((reaction) => reaction.value === item.myReaction)?.symbol ?? '♡'} {item.reactionCount} {item.myReaction ? REACTIONS.find((reaction) => reaction.value === item.myReaction)?.label : 'React'}
      </button>
      {detail ? <span>{item.commentCount} Comments</span> : <Link to="/feed/$id" params={{ id: item.id }} className="hover:text-ink">{item.commentCount} Comments</Link>}
      {item.userId !== viewerId && <Link to="/messages/$username" params={{ username: item.username }} className="hover:text-ink">Message</Link>}
    </div>
    {showReactions && <EmojiPopover anchor={reactionAnchor} label="React to post" width={208} height={62} onClose={() => setShowReactions(false)}><div className="flex gap-0.5">
      {REACTIONS.map((choice) => <button key={choice.value} type="button" className={cx('flex h-11 w-11 items-center justify-center rounded-xl text-[22px] hover:bg-paper', item.myReaction === choice.value && 'bg-volt')} title={choice.label} aria-label={choice.label} onClick={() => react.mutate(item.myReaction === choice.value ? null : choice.value)} disabled={react.isPending}>{choice.symbol}</button>)}
    </div></EmojiPopover>}
    <ErrorNotice error={react.error} className="mt-2" />
    {showComments && <div className="mt-3 space-y-3">
      <ErrorNotice error={comment.error || comments.error || removeComment.error} />
      {comments.isLoading ? <Skeleton className="h-16" /> : (comments.data ?? []).map((entry) => <div key={entry.id} className="flex min-w-0 gap-2.5 rounded-xl bg-paper p-2.5">
        <Link to="/runners/$username" params={{ username: entry.username }} search={{}} className="shrink-0"><Avatar name={entry.displayName} src={entry.avatarUrl} size={28} /></Link>
        <p className="min-w-0 flex-1 break-words text-[13px]"><span className="font-bold">{entry.displayName}</span> <span className="whitespace-pre-wrap">{entry.body}</span></p>
        {entry.userId === viewerId && <button type="button" className="self-start text-ink-3 hover:text-bad" onClick={() => removeComment.mutate(entry.id)} aria-label="Delete comment"><TrashIcon size={14} /></button>}
      </div>)}
      <form className="flex min-w-0 gap-2 border-t border-line pt-3" onSubmit={(event) => { event.preventDefault(); if (commentBody.trim() && !comment.isPending) comment.mutate(); }}>
        <input className="field min-w-0 flex-1 rounded-xl" aria-label="Write a comment" maxLength={500} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Write a comment" />
        <button className="btn-dark btn-sm shrink-0 rounded-xl" disabled={!commentBody.trim() || comment.isPending}>Post</button>
      </form>
    </div>}
  </div>;
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

function ActivityChip({ type, distance }: { type: 'walk' | 'run' | 'cycle'; distance: string }) {
  return <span className={cx('wide inline-flex h-7 items-center gap-1.5 rounded-full border border-ink px-2.5 text-[11px] font-extrabold uppercase', type === 'run' ? 'bg-track-wash' : 'bg-volt')}>
    {type === 'cycle' ? <CycleIcon size={13} /> : <RunIcon size={13} />} {type === 'cycle' ? 'ride' : type} · {distance}
  </span>;
}

function ActivityAttachment({ item, unit, mine }: { item: FeedPost; unit: Unit; mine: boolean }) {
  const run = item.activityType === 'run';
  const card = <span className="mt-2.5 flex items-stretch overflow-hidden rounded-xl border border-line">
    <span className={cx('flex w-12 shrink-0 items-center justify-center', run ? 'bg-track' : 'bg-volt')}>{item.activityType === 'cycle' ? <CycleIcon size={20} /> : <RunIcon size={20} />}</span>
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3 bg-card px-3 py-2.5">
      <span className="min-w-0">
        <span className="wide block text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-ink-2">{item.startedAt ? activityName(item.startedAt, item.activityType!) : item.activityType}</span>
        <span className="num block truncate text-[12px] text-ink-2">{item.activityType === 'cycle' ? 'GPS distance' : `${(item.validatedSteps ?? 0).toLocaleString('en-GB')} steps`} · {formatDuration(item.movingSeconds ?? 0)}</span>
      </span>
      <span className="score num shrink-0 text-[24px] leading-none">{formatDistance(item.distanceMetres ?? 0, unit)}</span>
    </span>
  </span>;
  return mine ? <Link to="/activities/$id" params={{ id: item.activityId! }} search={{}} className="block transition-transform hover:-translate-y-0.5">{card}</Link> : card;
}
