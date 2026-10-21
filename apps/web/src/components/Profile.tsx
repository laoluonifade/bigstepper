import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ReactNode, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDistanceNumber, formatDuration } from '../lib/format';
import { keys } from '../lib/queries';
import type { Connection, Profile, PublicProfile, PublicStats, Unit } from '../lib/types';
import { CameraIcon, CheckIcon, LinkIcon, PlusIcon, ShareIcon } from './icons';
import { Avatar, cx, EmptyState, ErrorNotice, Skeleton } from './ui';

/**
 * Shrinks a photo to at most 800px before upload (phone photos are 3–12 MB). Falls back to the
 * original file when the browser can't decode it (e.g. HEIC on desktop Chrome) — the API accepts both.
 */
async function prepare(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function useAvatar() {
  const queryClient = useQueryClient();
  const done = (updated: Profile) => {
    queryClient.setQueryData(keys.profile, updated);
    // Leaderboards and member lists carry the photo too.
    void queryClient.invalidateQueries({ predicate: (query) => ['standings', 'result', 'leagues', 'club', 'runner'].includes(String(query.queryKey[0])) });
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      const blob = await prepare(file);
      form.append('file', blob, blob === file ? file.name : 'avatar.jpg');
      return api<Profile>('/me/avatar', { method: 'POST', body: form });
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => api<Profile>('/me/avatar', { method: 'DELETE' }), onSuccess: done });
  return { upload, remove };
}

/** Avatar with a camera button; tapping it opens the photo picker (camera roll or camera on phones). */
export function AvatarEditor({ profile, size = 84 }: { profile: Profile; size?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, remove } = useAvatar();
  const busy = upload.isPending || remove.isPending;
  const error = upload.error ?? remove.error;
  return (
    <div className="flex flex-col items-start">
      <div className="relative">
        <Avatar name={profile.displayName} src={profile.avatarUrl} highlight size={size} className={cx('rounded-lg', busy && 'opacity-60')} />
        {busy && <span className="absolute inset-0 animate-shimmer rounded-lg" aria-hidden="true" />}
        <button
          type="button"
          className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-ink bg-volt text-ink transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label={profile.avatarUrl ? 'Change profile photo' : 'Add a profile photo'}
        >
          <CameraIcon size={15} />
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) upload.mutate(file);
          }}
        />
      </div>
      <p className="mt-2 min-h-[16px] text-[12px] text-ink-2" aria-live="polite">
        {upload.isPending ? 'Uploading…' : remove.isPending ? 'Removing…' : null}
        {!busy && profile.avatarUrl && (
          <button type="button" className="font-semibold underline underline-offset-4 hover:text-ink" onClick={() => remove.mutate()}>
            Remove photo
          </button>
        )}
      </p>
      {error && <p className="max-w-[220px] text-[12px] font-semibold text-bad">{error.message}</p>}
    </div>
  );
}

export interface HeroCounts {
  /** Omitted when the runner's activity isn't visible. */
  activities?: number;
  followers: number;
  following: number;
}

/**
 * Header shared by your own profile and other runners' profiles: photo with the counts beside it,
 * then name, handle, bio and a full-width action row.
 */
export function ProfileHero({
  avatar,
  displayName,
  username,
  meta,
  bio,
  counts,
  actions,
  children,
}: {
  avatar: ReactNode;
  displayName: string;
  username: string;
  meta: ReactNode;
  bio?: ReactNode;
  counts: HeroCounts;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="panel-strong min-w-0 p-5 sm:p-6">
      <div className="flex items-start gap-5">
        <div className="shrink-0 animate-pop">{avatar}</div>
        <ProfileCounts username={username} counts={counts} />
      </div>
      <h1 className="display mt-3 break-words text-[26px] leading-[0.95] sm:text-[32px]">{displayName}</h1>
      <p className="mt-1.5 text-[13px] text-ink-2">
        <span className="font-semibold text-ink">@{username}</span> · {meta}
      </p>
      {bio && <p className="mt-3 max-w-prose whitespace-pre-line text-[14px] leading-relaxed">{bio}</p>}
      {actions && <div className="mt-4 flex min-w-0 flex-wrap gap-2">{actions}</div>}
      {children}
    </section>
  );
}

function ProfileCounts({ username, counts }: { username: string; counts: HeroCounts }) {
  const cell = (value: number, label: string, tab?: 'followers' | 'following') => {
    const body = (
      <>
        <span className="score num block text-[24px] leading-none">{value.toLocaleString('en-GB')}</span>
        <span className="mt-1 block text-[11px] font-semibold text-ink-2">{label}</span>
      </>
    );
    return tab ? (
      <Link key={label} to="/runners/$username" params={{ username }} search={{ tab }} className="rounded-md py-1 text-center hover:bg-ink/[0.04]">
        {body}
      </Link>
    ) : (
      <div key={label} className="py-1 text-center">
        {body}
      </div>
    );
  };
  return (
    <div className={cx('grid flex-1 items-center self-center', counts.activities === undefined ? 'grid-cols-2' : 'grid-cols-3')}>
      {counts.activities !== undefined && cell(counts.activities, counts.activities === 1 ? 'Activity' : 'Activities')}
      {cell(counts.followers, counts.followers === 1 ? 'Follower' : 'Followers', 'followers')}
      {cell(counts.following, 'Following', 'following')}
    </div>
  );
}

/** Distance totals plus a run/walk split bar. (Activity count lives in the header.) */
export function ProfileStats({ stats, unit }: { stats: PublicStats; unit: Unit }) {
  const split = stats.runMetres + stats.walkMetres;
  const runShare = split > 0 ? stats.runMetres / split : 0;
  const cells = [
    { label: 'Distance', value: stats.totalMetres },
    { label: 'This month', value: stats.monthMetres },
    { label: 'Longest', value: stats.longestMetres },
  ];
  return (
    <div className="mt-5 rounded-md border border-line bg-paper">
      <div className="grid grid-cols-3 divide-x divide-line">
        {cells.map((cell) => (
          <div key={cell.label} className="min-w-0 px-3 py-3">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-2">{cell.label}</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="score num truncate text-[22px] leading-none">{formatDistanceNumber(cell.value, unit)}</span>
              <span className="text-[11px] font-semibold text-ink-2">{unit}</span>
            </p>
          </div>
        ))}
      </div>
      {split > 0 && (
        <div className="border-t border-line px-3 py-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-ink/10" role="img" aria-label={`${Math.round(runShare * 100)}% running, ${Math.round((1 - runShare) * 100)}% walking`}>
            <span className="h-full origin-left animate-grow-x bg-track" style={{ width: `${runShare * 100}%` }} />
            <span className="h-full origin-left animate-grow-x bg-ink [animation-delay:150ms]" style={{ width: `${(1 - runShare) * 100}%` }} />
          </div>
          <div className="num mt-2 flex justify-between gap-3 text-[12px] font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-track" /> {stats.runs} {stats.runs === 1 ? 'run' : 'runs'} · {formatDistanceNumber(stats.runMetres, unit)} {unit}
            </span>
            <span className="flex items-center gap-1.5">
              {stats.walks} {stats.walks === 1 ? 'walk' : 'walks'} · {formatDistanceNumber(stats.walkMetres, unit)} {unit} <span className="h-2 w-2 rounded-full bg-ink" />
            </span>
          </div>
          {stats.movingSeconds > 0 && <p className="mt-1 text-[12px] text-ink-3">{formatDuration(stats.movingSeconds)} moving in total</p>}
        </div>
      )}
    </div>
  );
}

/** Underline tabs that stay on one line at phone width. */
export function ProfileTabs<T extends string>({ value, onChange, tabs, label = 'Profile sections' }: { value: T; onChange: (value: T) => void; tabs: Array<{ value: T; label: string }>; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex border-b-[1.5px] border-line">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cx(
              'wide -mb-[1.5px] flex-1 whitespace-nowrap border-b-[3px] py-3 text-[12px] font-extrabold uppercase transition-colors',
              active ? 'border-track text-ink' : 'border-transparent text-ink-3 hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Shares the profile link through the phone's share sheet, or copies it. */
export function ShareProfileButton({ username, displayName, className, iconOnly }: { username: string; displayName: string; className?: string; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/runners/${username}`;
  async function share() {
    if (navigator.share) {
      try {
        // The link goes inside the text: many apps (iOS Copy, WhatsApp) keep only the text and drop `url`.
        await navigator.share({ title: `${displayName} on Jump`, text: `Follow ${displayName}’s walks and runs on Jump: ${url}` });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy your profile link', url);
    }
  }
  const native = typeof navigator !== 'undefined' && 'share' in navigator;
  const icon = copied ? <CheckIcon size={16} /> : native ? <ShareIcon size={16} /> : <LinkIcon size={16} />;
  const label = copied ? 'Link copied' : native ? 'Share profile' : 'Copy link';
  return (
    <button
      type="button"
      className={cx('btn-secondary btn-sm', iconOnly && 'w-11 shrink-0 px-0', className)}
      onClick={() => void share()}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
    >
      {icon}
      {!iconOnly && label}
    </button>
  );
}

/** Follow / unfollow, updating counts straight away and rolling back if the API refuses. */
export function useFollow(username: string) {
  const queryClient = useQueryClient();
  const key = ['runner', username.toLowerCase()];
  return useMutation({
    mutationFn: (follow: boolean) => api<{ following: boolean }>(`/users/${encodeURIComponent(username)}/follow`, { method: follow ? 'POST' : 'DELETE' }),
    onMutate(follow) {
      const previous = queryClient.getQueryData<PublicProfile>(key);
      if (previous && previous.followedByMe !== follow) {
        queryClient.setQueryData<PublicProfile>(key, { ...previous, followedByMe: follow, followers: previous.followers + (follow ? 1 : -1) });
      }
      // Any visible list row for this runner flips too.
      queryClient.setQueriesData<Connection[]>({ queryKey: ['connections'] }, (rows) =>
        rows?.map((row) => (row.username === username ? { ...row, followedByMe: follow } : row)),
      );
      return { previous };
    },
    onError(_error, _follow, context) {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['connections'] });
      void queryClient.invalidateQueries({ queryKey: ['runner-search'] });
    },
  });
}

export function FollowButton({
  username,
  following,
  className,
  size = 'md',
  preview,
}: {
  username: string;
  following: boolean;
  className?: string;
  size?: 'sm' | 'md';
  /** Your own profile in "view as others": the button visitors see, inert. */
  preview?: boolean;
}) {
  const { user } = useAuth();
  const follow = useFollow(username);
  const [hover, setHover] = useState(false);
  if (preview) {
    return (
      <span className={cx('btn-primary pointer-events-none select-none', size === 'sm' && 'btn-sm', className)} aria-disabled="true" title="Visitors see this button">
        <PlusIcon size={15} /> Follow
      </span>
    );
  }
  if (!user) {
    return (
      <Link to="/login" search={{ redirect: `/runners/${username}` }} className={cx('btn-primary', size === 'sm' && 'btn-sm', className)}>
        <PlusIcon size={15} /> Follow
      </Link>
    );
  }
  return (
    <span className={cx('inline-flex flex-col', className)}>
      <button
        type="button"
        className={cx(following ? 'btn-secondary' : 'btn-primary', size === 'sm' && 'btn-sm', 'min-w-[112px]')}
        onClick={() => follow.mutate(!following)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-pressed={following}
        disabled={follow.isPending}
      >
        {following ? (hover ? 'Unfollow' : <><CheckIcon size={15} /> Following</>) : <><PlusIcon size={15} /> Follow</>}
      </button>
      {follow.error && <span role="alert" className="mt-1 max-w-[180px] text-[11px] text-bad">{follow.error.message}</span>}
    </span>
  );
}

/** Followers or following, each with their own follow button. */
export function ConnectionList({ username, direction }: { username: string; direction: 'followers' | 'following' }) {
  const list = useQuery({
    queryKey: ['connections', username.toLowerCase(), direction],
    queryFn: () => api<Connection[]>(`/users/${encodeURIComponent(username)}/${direction}`),
  });
  if (list.isLoading) return <Skeleton className="h-40" />;
  if (list.error) return <ErrorNotice error={list.error} onRetry={() => void list.refetch()} />;
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState title={direction === 'followers' ? 'No followers yet' : 'Not following anyone yet'}>
        {direction === 'followers' ? 'Share the profile link to get the first one.' : 'Follow runners from leaderboards and their profiles.'}
      </EmptyState>
    );
  }
  return (
    <ul className="stagger divide-y divide-line border-y border-line">
      {rows.map((row) => (
        <li key={row.username} className="flex items-center gap-3 px-1 py-3 sm:px-3">
          <Link to="/runners/$username" params={{ username: row.username }} search={{}} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={row.displayName} src={row.avatarUrl} size={44} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold">{row.displayName}</span>
              <span className="block truncate text-[12px] text-ink-2">
                @{row.username}
                {row.bio && ` · ${row.bio}`}
              </span>
            </span>
          </Link>
          {!row.isMe && <FollowButton username={row.username} following={row.followedByMe} size="sm" />}
        </li>
      ))}
    </ul>
  );
}
