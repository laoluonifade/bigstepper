import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { CompetitionRow } from '../components/competition';
import { ArrowRightIcon, CameraIcon, CheckIcon, FeedIcon, LinkIcon, LockIcon, PlusIcon, SearchIcon, ShareIcon } from '../components/icons';
import { Leaderboard } from '../components/Leaderboard';
import { ClubEventsSection, EventForm } from '../components/ClubEvents';
import { ClubLogo } from '../components/ClubLogo';
import { Sheet } from '../components/Sheet';
import { useConfirm } from '../components/ConfirmDialog';
import { prepare } from '../components/Profile';
import { Avatar, CopyButton, cx, EmptyState, ErrorNotice, Field, Loading, Notice, PageHeader, SectionTitle, Segmented, Skeleton, useNow, VerifiedTick } from '../components/ui';
import { api, isApiError, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { flag } from '../lib/countries';
import { formatDate } from '../lib/format';
import { keys, useUnit } from '../lib/queries';
import { toast } from '../lib/toast';
import type { Club, ClubMember, ClubRole, ClubStanding, CompetitionTable } from '../lib/types';
import { CompeteSubNav, ExploreBack } from './Competitions';

type ClubSummary = Pick<Club, 'id' | 'slug' | 'name' | 'description' | 'logoUrl' | 'accentColor' | 'location' | 'privacy' | 'memberCount' | 'followerCount' | 'following' | 'verified'> & { myRole: ClubRole | null };

/** Colours a club can wear: the Jump palette. */
const ACCENTS = ['#FF5A1F', '#E4FF3A', '#8B7CF6', '#5EE0C1', '#FF8FB1', '#FFC53D', '#6FB7FF', '#121212'];
const ROLE_LABEL: Record<ClubRole, string> = { owner: 'Owner', admin: 'Manager', member: 'Member' };

/** Dark text on light colours, light text on dark ones. */
function onAccent(hex = '#FF5A1F') {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#121212' : '#F2EFE8';
}

/** Accepts `my-club`, `/my-club` or a pasted club link and returns the handle. */
function clubHandle(value: string) {
  return value.trim().toLowerCase().replace(/^.*\/clubs\//, '').replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '');
}

export { ClubLogo };

const isManager = (role: ClubRole | null | undefined) => role === 'owner' || role === 'admin';

/* ───────────────────────── Clubs list ───────────────────────── */

export function ClubsPage() {
  const navigate = useNavigate();
  const mine = useQuery({ queryKey: ['clubs', 'mine'], queryFn: () => api<ClubSummary[]>('/clubs?view=mine') });
  const discover = useQuery({ queryKey: ['clubs', 'discover'], queryFn: () => api<ClubSummary[]>('/clubs?view=discover') });
  const [lookup, setLookup] = useState('');
  const [creating, setCreating] = useState(false);

  function open(event: FormEvent) {
    event.preventDefault();
    const handle = clubHandle(lookup);
    if (handle) void navigate({ to: '/clubs/$id', params: { id: handle }, search: {} });
  }

  return <div className="animate-rise">
    <ExploreBack />
    <div className="hidden md:block"><CompeteSubNav /></div>
    <PageHeader
      eyebrow="Compete"
      title="Clubs"
      description="Run clubs and brands on Jump. Follow them for their competitions, or join your crew’s club."
      actions={<button type="button" className="btn-dark btn-sm" onClick={() => setCreating(true)}><PlusIcon size={16} /> Start a club</button>}
    />

    <section>
      <SectionTitle aside={mine.data?.length ? `${mine.data.length}` : undefined}>Your clubs</SectionTitle>
      <ErrorNotice error={mine.error} onRetry={() => void mine.refetch()} />
      {mine.isLoading ? <Skeleton className="h-24 rounded-2xl" />
        : !mine.data?.length ? <EmptyState title="No clubs yet" action={<button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}><PlusIcon size={16} /> Start a club</button>}>
            Start one for your run crew, or open a club from its link.
          </EmptyState>
          : <ul className="grid gap-3 sm:grid-cols-2">{mine.data.map((club) => <li key={club.id}><ClubCard club={club} /></li>)}</ul>}
    </section>

    <form onSubmit={open} className="mt-8 flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-card px-3">
      <SearchIcon size={16} className="shrink-0 text-ink-3" />
      <input className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Paste a club link" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Club link" />
      <button className="shrink-0 text-ink-2 hover:text-ink disabled:opacity-40" disabled={!clubHandle(lookup)} aria-label="Open club"><ArrowRightIcon size={18} /></button>
    </form>

    {Boolean(discover.data?.length) && <section className="mt-10">
      <SectionTitle>Open clubs</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2">{discover.data!.map((club) => <li key={club.id}><ClubCard club={club} /></li>)}</ul>
    </section>}

    {creating && <CreateClubSheet onClose={() => setCreating(false)} />}
  </div>;
}

function ClubCard({ club }: { club: ClubSummary }) {
  return <Link to="/clubs/$id" params={{ id: club.slug }} search={{}} className="group flex items-center gap-3 overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card p-3 transition-shadow hover:shadow-hard-sm">
    <span className="h-12 w-1.5 shrink-0 rounded-full" style={{ background: club.accentColor ?? '#FF5A1F' }} aria-hidden="true" />
    <ClubLogo club={club} size={44} />
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-[15px] font-bold leading-tight">
        <span className="truncate">{club.name}</span>
        {club.verified && <VerifiedTick />}
        {club.privacy === 'invite' && <LockIcon size={12} className="shrink-0 text-ink-3" />}
      </p>
      <p className="mt-0.5 truncate text-[12px] text-ink-2">
        {[`${club.followerCount ?? 0} ${club.followerCount === 1 ? 'follower' : 'followers'}`, club.location, club.myRole && club.myRole !== 'member' ? ROLE_LABEL[club.myRole] : !club.myRole && club.following ? 'Following' : null].filter(Boolean).join(' · ')}
      </p>
    </div>
    <ArrowRightIcon size={16} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
  </Link>;
}

function CreateClubSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'open' | 'invite'>('open');
  // The club's link is made from its name on the server.
  const create = useMutation({
    mutationFn: () => post<Club>('/clubs', { name: name.trim(), privacy, ...(description.trim() ? { description: description.trim() } : {}) }),
    onSuccess(club) {
      void queryClient.invalidateQueries({ queryKey: ['clubs'] });
      void navigate({ to: '/clubs/$id', params: { id: club.slug }, search: {} });
    },
  });
  return <Sheet open onOpenChange={(open) => !open && onClose()} title="Start a club" description="You can add a logo, colour and links next."
    footer={<button form="new-club" className="btn-primary w-full" disabled={create.isPending || name.trim().length < 3}>{create.isPending ? 'Creating…' : 'Create club'}</button>}>
    <form id="new-club" className="space-y-4" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
      <Field label="Club name">
        {(props) => <input {...props} autoFocus className="field" minLength={3} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Lagos Road Runners" required />}
      </Field>
      <Field label="About" optional hint={`${600 - description.length} characters left`}>
        {(props) => <textarea {...props} className="field min-h-[76px] py-3" maxLength={600} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Who you are, when you run, where you meet." />}
      </Field>
      <PrivacyChoice value={privacy} onChange={setPrivacy} />
      <ErrorNotice error={create.error} />
    </form>
  </Sheet>;
}

function PrivacyChoice({ value, onChange }: { value: 'open' | 'invite'; onChange: (value: 'open' | 'invite') => void }) {
  return <fieldset>
    <legend className="label">Who can join</legend>
    <div className="grid grid-cols-2 gap-2" role="radiogroup">
      {([['open', 'Open', 'Anyone with the page can join.'], ['invite', 'Invite-only', 'Only people with your invite link.']] as const).map(([option, title, body]) =>
        <label key={option} className={cx('cursor-pointer rounded-md border-[1.5px] p-3 transition-colors', value === option ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:border-ink-3')}>
          <input type="radio" name="club-privacy" className="sr-only" checked={value === option} onChange={() => onChange(option)} />
          <span className="block text-[13px] font-bold">{title}</span>
          <span className={cx('mt-0.5 block text-[12px] leading-snug', value === option ? 'text-paper/70' : 'text-ink-2')}>{body}</span>
        </label>)}
    </div>
  </fieldset>;
}

/* ───────────────────────── Club page ───────────────────────── */

type ClubTab = 'competitions' | 'leaderboard' | 'members' | 'invite';

/** Club landing page. A valid invite joins signed-in runners, including after sign-up or login. */
export function ClubDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const confirm = useConfirm();
  const search = useSearch({ strict: false }) as { invite?: string; join?: boolean };
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const club = useQuery({
    queryKey: [...keys.club(id), user?.id ?? 'guest', search.invite ?? ''],
    queryFn: () => api<Club>(`/clubs/${encodeURIComponent(id)}${search.invite ? `?invite=${encodeURIComponent(search.invite)}` : ''}`),
  });
  const [tab, setTab] = useState<ClubTab>('competitions');
  const [editing, setEditing] = useState(false);
  const [addingEvent, setAddingEvent] = useState(() => window.location.hash === '#new-event');
  const unit = useUnit();
  const role = club.data?.myRole ?? null;
  const canJoin = Boolean(club.data && !role && (club.data.privacy !== 'invite' || club.data.inviteValid));
  const autoJoin = Boolean(user && canJoin && (search.join || (search.invite && club.data?.inviteValid)));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['club'] }).then(() => queryClient.invalidateQueries({ queryKey: ['clubs'] }));

  const join = useMutation({
    mutationFn: () => post<{ joined: boolean; competitions: number }>(`/clubs/${id}/join`, search.invite ? { invite: search.invite } : {}),
    async onSuccess(result) {
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['tables'] })]);
      toast({ tone: 'ok', title: `Welcome to ${club.data?.name ?? 'the club'}`, message: result.competitions ? `You’re in ${result.competitions === 1 ? 'its live competition' : `its ${result.competitions} live competitions`} too.` : 'Club competitions will count you in automatically.' });
      if (search.invite || search.join) void navigate({ to: '/clubs/$id', params: { id: club.data?.slug ?? id }, search: {}, replace: true });
    },
  });
  const follow = useMutation({
    mutationFn: (next: boolean) => api<{ following: boolean; followerCount: number }>(`/clubs/${id}/follow`, { method: next ? 'POST' : 'DELETE' }),
    async onSuccess(result) { await refresh(); toast({ tone: 'ok', message: result.following ? `Following ${club.data?.name ?? 'the club'}. You’ll hear about its new competitions.` : 'Unfollowed.' }); },
  });
  const leave = useMutation({
    mutationFn: () => post(`/clubs/${id}/leave`),
    async onSuccess() { await refresh(); toast({ tone: 'ok', message: `You left ${club.data?.name ?? 'the club'}.` }); },
  });

  // A shared invite is enough to join, whether the runner was already signed in or just finished auth.
  // Keep the invite in the URL until the API confirms membership, so a refresh can safely retry.
  const autoJoinAttempted = useRef<string | null>(null);
  const joinClub = join.mutate;
  useEffect(() => {
    if (!autoJoin || !user || !club.data) return;
    const target = `${user.id}:${club.data.id}:${search.invite ?? ''}`;
    if (autoJoinAttempted.current === target) return;
    autoJoinAttempted.current = target;
    joinClub();
  }, [autoJoin, user, club.data, search.invite, joinClub]);
  useEffect(() => {
    const target = `${user?.id}:${club.data?.id}:${search.invite ?? ''}`;
    if (role && (search.invite || search.join) && autoJoinAttempted.current !== target) {
      void navigate({ to: '/clubs/$id', params: { id: club.data?.slug ?? id }, search: {}, replace: true });
    }
  }, [role, search.invite, search.join, club.data?.id, club.data?.slug, user?.id, id, navigate]);

  if (club.isLoading) return <Loading />;
  if (club.error || !club.data) {
    return <>
      <PageHeader back={{ to: '/clubs', label: 'Clubs' }} title="Club not found" />
      {isApiError(club.error, 404) ? <EmptyState title="No club with that handle">Check the link and try again.</EmptyState> : <ErrorNotice error={club.error} onRetry={() => void club.refetch()} />}
    </>;
  }
  const c = club.data;
  const member = Boolean(role);
  const tabs: Array<{ value: ClubTab; label: string }> = [
    { value: 'competitions', label: 'Competitions' },
    ...(member ? [{ value: 'leaderboard' as const, label: 'Leaderboard' }] : []),
    ...(member || c.privacy === 'open' ? [{ value: 'members' as const, label: 'Members' }] : []),
    ...(isManager(role) ? [{ value: 'invite' as const, label: 'Invite' }] : []),
  ];
  const back = `/clubs/${c.slug}?${search.invite ? `invite=${encodeURIComponent(search.invite)}&` : ''}join=1`;

  return <div className="animate-rise">
    {user && <Link to="/clubs" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink">← Clubs</Link>}

    <ClubHero club={c}>
      {!user ? <div className="flex flex-col items-stretch gap-2 sm:items-end">
        {c.privacy === 'invite' && !c.inviteValid
          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-2 text-[13px] font-semibold text-ink-2"><LockIcon size={13} /> Invite-only</span>
          : <Link to="/register" search={{ redirect: back }} className="btn-primary min-h-11 px-6">Join {c.name}</Link>}
        <p className="text-center text-[12px] text-ink-3 sm:text-right">On Jump already? <Link to="/login" search={{ redirect: back }} className="font-semibold text-ink underline">Log in</Link></p>
      </div>
        : !member ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <button type="button" className={cx('min-h-11 flex-1 px-6 sm:flex-none', c.following ? 'btn-secondary' : 'btn-primary')} disabled={follow.isPending} onClick={() => follow.mutate(!c.following)}>
            {c.following ? <><CheckIcon size={16} /> Following</> : 'Follow'}
          </button>
          {canJoin
            ? <button type="button" className="btn-secondary min-h-11 flex-1 px-5 sm:flex-none" disabled={join.isPending || (autoJoin && !join.isError)} onClick={() => join.mutate()}>{join.isPending || (autoJoin && !join.isError) ? 'Joining…' : 'Join club'}</button>
            : <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-2 text-[13px] font-semibold text-ink-2"><LockIcon size={13} /> Invite-only</span>}
          <ShareClubButton club={c} />
        </div>
          : <div className="flex w-full items-center gap-2 sm:w-auto">
            <Link to="/clubs/$id/chat" params={{ id: c.slug }} className="btn-dark min-h-11 flex-1 sm:flex-none sm:px-6"><FeedIcon size={16} /> Club chat</Link>
            <ShareClubButton club={c} />
            {isManager(role) && <RowMenu
              label="Club options"
              buttonClassName="flex h-11 w-11 items-center justify-center rounded border-[1.5px] border-ink bg-card text-[20px] font-bold leading-none shadow-hard-sm hover:bg-paper"
              actions={[
                { label: 'Dashboard', run: () => void navigate({ to: '/clubs/$id/dashboard', params: { id: c.slug } }) },
                ...(c.suspended ? [] : [{ label: 'New competition', run: () => void navigate({ to: '/competitions/new', search: { club: c.slug } }) }]),
                ...(c.suspended ? [] : [{ label: 'New event', run: () => setAddingEvent(true) }]),
                { label: 'Edit club', run: () => setEditing(true) },
              ]}
            />}
          </div>}
    </ClubHero>
    <ErrorNotice error={join.error ?? follow.error} className="mt-3" />

    {c.suspended && <Notice tone="warn" className="mt-5" title="Suspended by Jump">
      {isManager(role) ? `${c.suspendedReason ?? 'This club can’t run competitions right now.'} Contact Jump support to resolve it.` : 'This club can’t run new competitions right now.'}
    </Notice>}

    {isManager(role) && !c.suspended && <Link to="/clubs/$id/dashboard" params={{ id: c.slug }} className="mt-5 flex items-center gap-3 rounded-xl border-[1.5px] border-ink bg-volt/60 px-4 py-3 transition-colors hover:bg-volt">
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-bold">Club dashboard</span><span className="block text-[12.5px] text-ink-2">Competitions, series, prizes and how your community is doing.</span></span>
      <ArrowRightIcon size={16} />
    </Link>}

    {(c.privacy === 'open' || member) && <ClubEventsSection club={c} manager={isManager(role) && !c.suspended} unit={unit} />}
    {addingEvent && <EventForm club={c.slug} unit={unit} onClose={() => setAddingEvent(false)} />}

    {!member && user && <p className="mt-4 text-[13px] text-ink-2">Follow to hear about every new competition. Join to be in the club, its chat and the competitions it enters members in.</p>}

    <div className="no-scrollbar mt-8 flex gap-5 overflow-x-auto border-b border-line" role="tablist" aria-label="Club sections">
      {tabs.map((option) => <button key={option.value} type="button" role="tab" aria-selected={tab === option.value} onClick={() => setTab(option.value)}
        className={cx('relative shrink-0 pb-2.5 text-[15px] font-semibold transition-colors', tab === option.value ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}>
        {option.label}
        {tab === option.value && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink" aria-hidden="true" />}
      </button>)}
    </div>

    <div className="mt-5">
      {tab === 'competitions' && <ClubCompetitions club={c} />}
      {tab === 'leaderboard' && member && <ClubLeaderboard id={id} />}
      {tab === 'members' && <ClubMembers club={c} role={role} />}
      {tab === 'invite' && isManager(role) && <InvitePanel club={c} />}
    </div>

    {member && role !== 'owner' && <p className="mt-12 text-center">
      <button type="button" className="text-[13px] font-semibold text-ink-3 hover:text-bad" disabled={leave.isPending} onClick={() => confirm.ask({
        title: `Leave ${c.name}?`,
        body: 'You’ll leave the club chat and stop being entered in its competitions. Competitions you’re already in keep you. You can join again later.',
        confirmLabel: 'Leave club',
        danger: true,
        onConfirm: () => leave.mutate(),
      })}>Leave club</button>
    </p>}

    {editing && <EditClubSheet club={c} onClose={() => setEditing(false)} />}
    {confirm.dialog}
  </div>;
}

/** The club's banner: its colour, logo, name, where it runs, what it's about, and who's in. */
function ClubHero({ club, children }: { club: Club; children: ReactNode }) {
  const accent = club.accentColor ?? '#FF5A1F';
  const [more, setMore] = useState(false);
  const long = (club.description?.length ?? 0) > 180;
  return <section className="overflow-hidden rounded-3xl border-[1.5px] border-ink bg-card">
    <div className="relative h-28 sm:h-36" style={{ background: accent, color: onAccent(accent) }}>
      <svg className="absolute inset-0 h-full w-full opacity-[0.16]" preserveAspectRatio="none" viewBox="0 0 400 140" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((lane) => <path key={lane} d={`M-20 ${150 - lane * 24}C120 ${130 - lane * 28} 260 ${80 - lane * 20} 420 ${40 - lane * 16}`} fill="none" stroke="currentColor" strokeWidth="3" />)}
      </svg>
    </div>
    <div className="px-5 pb-5">
      {/* Above the banner (which is positioned), so the colour never covers the logo. */}
      <ClubLogo club={club} size={84} className="relative z-10 -mt-10 border-[3px] border-card shadow-hard-sm" />
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{club.name}{club.verified && <VerifiedTick size={24} className="ml-1.5" />}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            {club.location && <><span>{club.location}</span><span aria-hidden="true">·</span></>}
            <span className="inline-flex items-center gap-1">{club.privacy === 'invite' ? <><LockIcon size={12} /> Invite-only</> : 'Open club'}</span>
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-auto">{children}</div>
      </div>
      {club.description && <p className={cx('mt-4 max-w-2xl whitespace-pre-line break-words text-[15px] leading-relaxed', !more && long && 'line-clamp-3')}>{club.description}</p>}
      {long && <button type="button" className="mt-1 text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={() => setMore((value) => !value)}>{more ? 'Less' : 'More'}</button>}
      {(club.website || club.instagram) && <div className="mt-3 flex flex-wrap gap-2">
        {club.website && <a href={club.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-1.5 text-[13px] font-semibold hover:bg-ink/10"><LinkIcon size={13} />{club.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>}
        {club.instagram && <a href={`https://instagram.com/${club.instagram}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-1.5 text-[13px] font-semibold hover:bg-ink/10">Instagram · @{club.instagram}</a>}
      </div>}
      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <span className="flex -space-x-2">{(club.faces ?? []).slice(0, 5).map((face, index) => <Avatar key={index} name={face.displayName} src={face.avatarUrl} avatarStyle={face.avatarStyle} size={28} className="rounded-full ring-2 ring-card" />)}</span>
        <p className="num text-[13px] text-ink-2">
          <span className="font-bold text-ink">{club.followerCount ?? 0}</span> {club.followerCount === 1 ? 'follower' : 'followers'}
          {' · '}<span className="font-bold text-ink">{club.memberCount ?? 0}</span> {club.memberCount === 1 ? 'member' : 'members'}
          {Boolean(club.liveCompetitions) && <> · <span className="font-bold text-ink">{club.liveCompetitions}</span> live {club.liveCompetitions === 1 ? 'competition' : 'competitions'}</>}
          {club.owner && <> · run by {club.owner.username ? <Link to="/runners/$username" params={{ username: club.owner.username }} search={{}} className="font-semibold text-ink hover:underline">{club.owner.displayName}</Link> : club.owner.displayName}</>}
        </p>
      </div>
    </div>
  </section>;
}

type ClubChallenges = { live: CompetitionTable[]; upcoming: CompetitionTable[]; past: CompetitionTable[] };

/** Live, upcoming and past competitions; past ones show who won. */
function ClubCompetitions({ club }: { club: Club }) {
  const unit = useUnit();
  const now = useNow(60_000);
  const competitions = useQuery({ queryKey: ['club', club.slug, 'competitions', club.myRole ?? 'guest'], queryFn: () => api<ClubChallenges>(`/clubs/${club.slug}/competitions`) });
  if (competitions.isLoading) return <Skeleton className="h-32 rounded-2xl" />;
  if (competitions.error) return <ErrorNotice error={competitions.error} onRetry={() => void competitions.refetch()} />;
  const data = competitions.data ?? { live: [], upcoming: [], past: [] };
  const manager = isManager(club.myRole) && !club.suspended;
  if (!data.live.length && !data.upcoming.length && !data.past.length) {
    return <EmptyState title="No competitions yet" action={manager ? <Link to="/competitions/new" search={{ club: club.slug }} className="btn-primary btn-sm"><PlusIcon size={16} /> Create one</Link> : undefined}>
      {manager ? 'Create a competition, add prizes if you like, and share the link with your community.' : club.privacy === 'invite' && !club.myRole ? 'Join to see what the club is racing.' : 'Follow the club to hear when it posts one.'}
    </EmptyState>;
  }
  const list = (rows: CompetitionTable[]) => <ul className="divide-y divide-line overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card">
    {rows.map((table) => <li key={table.id}>
      <CompetitionRow table={table} unit={unit} now={now} />
      {table.hasPrizes && table.topPrize && <p className="-mt-1.5 truncate px-3.5 pb-2.5 pl-[66px] text-[12px] font-semibold text-ok">Prizes · {table.topPrize}</p>}
    </li>)}
  </ul>;
  return <div className="space-y-7">
    {manager && <div className="flex justify-end"><Link to="/competitions/new" search={{ club: club.slug }} className="btn-dark btn-sm"><PlusIcon size={14} /> New competition</Link></div>}
    {data.live.length > 0 && <section><SectionTitle aside={`${data.live.length}`}>Live now</SectionTitle>{list(data.live)}</section>}
    {data.upcoming.length > 0 && <section><SectionTitle aside={`${data.upcoming.length}`}>Upcoming</SectionTitle>{list(data.upcoming)}</section>}
    {data.past.length > 0 && <section>
      <SectionTitle>Past competitions</SectionTitle>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {data.past.map((table) => <li key={table.id}>
          <Link to="/competitions/$code" params={{ code: table.code }} className="flex items-center gap-3 px-3.5 py-3 hover:bg-ink/[0.025]">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{table.title}</p>
              <p className="mt-0.5 truncate text-[12px] text-ink-3">{table.scoringClosesAt ? `Ended ${formatDate(table.scoringClosesAt, { year: 'numeric' })}` : 'Ended'} · {table.entrantCount ?? 0} took part</p>
            </div>
            {table.podium?.length ? <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold">
              <Avatar name={table.podium[0].displayName} src={table.podium[0].avatarUrl} size={24} className="rounded-full" />
              <span className="max-w-[110px] truncate">{table.podium[0].displayName}</span>
            </span> : null}
          </Link>
        </li>)}
      </ul>
    </section>}
  </div>;
}

function ClubLeaderboard({ id }: { id: string }) {
  const { user } = useAuth();
  const unit = useUnit();
  const board = useQuery({ queryKey: ['club', id, 'leaderboard'], queryFn: () => api<ClubStanding[]>(`/clubs/${id}/leaderboard`) });
  if (board.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (board.error) return <ErrorNotice error={board.error} onRetry={() => void board.refetch()} />;
  return <Leaderboard
    rows={(board.data ?? []).map((row) => ({ rank: row.rank, userId: row.userId, name: row.displayName, username: row.username, avatarUrl: row.avatarUrl, avatarStyle: row.avatarStyle, verified: row.verified, metres: row.monthMetres }))}
    currentUserId={user?.id}
    unit={unit}
    caption="Verified walking and running distance this month."
    empty={<EmptyState title="No activity this month" />}
  />;
}

function ClubMembers({ club, role }: { club: Club; role: ClubRole | null }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: keys.clubMembers(club.slug), queryFn: () => api<ClubMember[]>(`/clubs/${club.slug}/members`) });
  const done = () => Promise.all([queryClient.invalidateQueries({ queryKey: keys.clubMembers(club.slug) }), queryClient.invalidateQueries({ queryKey: ['club'] })]);
  const setRole = useMutation({
    mutationFn: ({ userId, next }: { userId: string; next: 'admin' | 'member' }) => patch(`/clubs/${club.slug}/members/${userId}`, { role: next }),
    async onSuccess(_, { next }) { await done(); toast({ tone: 'ok', message: next === 'admin' ? 'They’re a manager now.' : 'They’re a member again.' }); },
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/clubs/${club.slug}/members/${userId}`, { method: 'DELETE' }),
    async onSuccess() { await done(); toast({ tone: 'ok', message: 'Removed from the club.' }); },
  });
  if (members.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (members.error) return <ErrorNotice error={members.error} onRetry={() => void members.refetch()} />;
  return <>
    {confirm.dialog}
    <ErrorNotice error={setRole.error ?? remove.error} className="mb-3" />
    {role === 'owner' && <p className="mb-3 text-[13px] text-ink-2">Managers can edit the club, invite and add people, and host club competitions.</p>}
    <ul className="divide-y divide-line rounded-2xl border-[1.5px] border-ink bg-card">
      {members.data?.map((member) => {
        const isMe = member.userId === user?.id;
        const name = member.displayName ?? (member.username ? `@${member.username}` : 'Runner');
        const actions = [
          ...(member.username ? [{ label: 'View profile', run: () => void navigate({ to: '/runners/$username', params: { username: member.username! }, search: {} }) }] : []),
          ...(role === 'owner' && member.role === 'member' ? [{ label: 'Make manager', run: () => setRole.mutate({ userId: member.userId, next: 'admin' }) }] : []),
          ...(role === 'owner' && member.role === 'admin' ? [{ label: 'Remove as manager', run: () => setRole.mutate({ userId: member.userId, next: 'member' }) }] : []),
          ...(!isMe && member.role !== 'owner' && (role === 'owner' || (role === 'admin' && member.role === 'member'))
            ? [{ label: 'Remove from club', danger: true, run: () => confirm.ask({
              title: `Remove ${name}?`,
              body: `They’ll leave ${club.name} and its chat. They can join again with the invite link.`,
              confirmLabel: 'Remove',
              danger: true,
              onConfirm: () => remove.mutate(member.userId),
            }) }] : []),
        ];
        return <li key={member.id} className="flex items-center gap-3 px-4 py-3">
          <span className="relative shrink-0">
            <Avatar name={name} src={member.avatarUrl} avatarStyle={member.avatarStyle} size={38} className="rounded-full" />
            {member.countryCode && <span className="absolute -bottom-0.5 -right-1 text-[12px] leading-none">{flag(member.countryCode)}</span>}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold leading-tight">
              {member.username ? <Link to="/runners/$username" params={{ username: member.username }} search={{}} className="truncate hover:underline">{name}</Link> : <span className="truncate">{name}</span>}
              {member.verified && <VerifiedTick />}
              {isMe && <span className="shrink-0 text-[12px] font-normal text-ink-3">(you)</span>}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-ink-3">{member.username && <>@{member.username} · </>}joined {formatDate(member.joinedAt, { year: 'numeric' })}</p>
          </div>
          {member.role !== 'member' && <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold', member.role === 'owner' ? 'bg-ink text-paper' : 'bg-ink/[0.07] text-ink')}>{ROLE_LABEL[member.role]}</span>}
          {actions.length > 0 && <RowMenu label={`Options for ${name}`} actions={actions} />}
        </li>;
      })}
    </ul>
  </>;
}

/** A small ⋯ menu for one row's actions. Closes on pick, outside tap or Escape. */
function RowMenu({ label, actions, buttonClassName }: { label: string; actions: Array<{ label: string; run: () => void; danger?: boolean }>; buttonClassName?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className="relative shrink-0">
    <button type="button" className={buttonClassName ?? 'flex h-8 w-8 items-center justify-center rounded-full text-[18px] font-bold leading-none text-ink-2 hover:bg-ink/[0.06]'} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>⋯</button>
    {open && <div role="menu" className="absolute bottom-full right-0 z-30 mb-1 w-48 animate-pop overflow-hidden rounded-md border-[1.5px] border-ink bg-card py-1 shadow-hard">
      {actions.map((action) => <button key={action.label} type="button" role="menuitem" className={cx('block w-full px-3 py-2 text-left text-[14px] font-semibold hover:bg-ink/[0.05]', action.danger && 'text-bad')} onClick={() => { setOpen(false); action.run(); }}>{action.label}</button>)}
    </div>}
  </div>;
}

/** The club's link for any member to pass on: with the invite in it, so invite-only clubs let people in. */
function clubShareLink(club: Club) {
  const base = `${window.location.origin}/clubs/${club.slug}`;
  return club.privacy === 'invite' && club.inviteCode ? `${base}?invite=${club.inviteCode}` : base;
}

/** Share the club from the phone's share sheet, or copy its link. */
function ShareClubButton({ club }: { club: Club }) {
  async function share() {
    const url = clubShareLink(club);
    const text = `Join ${club.name} on Jump`;
    if (navigator.share) {
      await navigator.share({ title: club.name, text, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url);
    toast({ tone: 'ok', message: 'Club link copied.' });
  }
  return <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded border-[1.5px] border-ink bg-card shadow-hard-sm hover:bg-paper" onClick={() => void share()} aria-label="Share the club" title="Share the club"><ShareIcon size={17} /></button>;
}

/** A number as wa.me wants it: digits with the country code. Nigerian 0803… becomes 234803…. */
function whatsappNumber(input: string) {
  const digits = input.replace(/\D/g, '');
  return /^0\d{10}$/.test(digits) ? `234${digits.slice(1)}` : digits;
}

/** Managers: the invite link, email invites, adding someone by username, and resetting the link. */
function InvitePanel({ club }: { club: Club }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const link = `${window.location.origin}/clubs/${club.slug}?invite=${club.inviteCode ?? ''}`;
  const message = `Join ${club.name} on Jump: ${link}`;
  const [emails, setEmails] = useState('');
  const [via, setVia] = useState<'email' | 'whatsapp'>('email');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const addresses = emails.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
  const invite = useMutation({
    mutationFn: () => post<{ invited: number; alreadyMembers: number }>(`/clubs/${club.slug}/invites`, { emails: addresses }),
    onSuccess(result) {
      setEmails('');
      toast({ tone: 'ok', message: `${result.invited} ${result.invited === 1 ? 'invite' : 'invites'} sent${result.alreadyMembers ? ` · ${result.alreadyMembers} already in the club` : ''}.` });
    },
  });
  const add = useMutation({
    mutationFn: () => post(`/clubs/${club.slug}/members`, { username: username.trim().replace(/^@/, '') }),
    async onSuccess() {
      setUsername('');
      await queryClient.invalidateQueries({ queryKey: ['club'] });
      toast({ tone: 'ok', message: 'Added. They’re in the club’s live competitions too.' });
    },
  });
  const reset = useMutation({
    mutationFn: () => post(`/clubs/${club.slug}/invite-code`),
    async onSuccess() { await queryClient.invalidateQueries({ queryKey: ['club'] }); toast({ tone: 'ok', message: 'New invite link ready. The old one no longer works for invite-only clubs.' }); },
  });
  async function share() {
    if (navigator.share) await navigator.share({ title: club.name, text: message, url: link }).catch(() => undefined);
    else await navigator.clipboard?.writeText(link);
  }
  return <div className="grid gap-5 lg:grid-cols-2">
    {confirm.dialog}
    <section className="rounded-2xl border-[1.5px] border-ink bg-card p-5">
      <p className="text-[15px] font-bold">Invite link</p>
      <p className="mt-0.5 text-[13px] text-ink-2">People who open this link join automatically after signing in or creating an account.</p>
      <p className="mt-3 truncate rounded-lg bg-ink/[0.05] px-3 py-2 font-mono text-[12px] text-ink-2">{link}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <CopyButton value={link} label="Copy" />
        <button type="button" className="btn-secondary btn-sm" onClick={() => void share()}><ShareIcon size={14} /> Share</button>
        <a className="btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer noopener">WhatsApp</a>
      </div>
      <button type="button" className="mt-3 text-[12px] font-semibold text-ink-3 hover:text-ink" disabled={reset.isPending} onClick={() => confirm.ask({
        title: 'Make a new invite link?',
        body: 'The current link stops working for invite-only clubs. Anyone already in the club stays in.',
        confirmLabel: 'Reset link',
        onConfirm: () => reset.mutate(),
      })}>Reset link</button>
    </section>

    <section className="space-y-5 rounded-2xl border-[1.5px] border-ink bg-card p-5">
      <Segmented label="Invite by" size="sm" value={via} onChange={setVia} options={[{ value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp' }]} />
      {via === 'email' ? <form onSubmit={(event) => { event.preventDefault(); invite.mutate(); }}>
        <Field label="Email addresses" hint="Separate with commas or new lines. Up to 50 at a time.">
          {(props) => <textarea {...props} className="field min-h-20 py-2.5" value={emails} onChange={(event) => setEmails(event.target.value)} placeholder="ada@example.com, tunde@example.com" />}
        </Field>
        <ErrorNotice error={invite.error} className="mt-2" />
        <button className="btn-dark btn-sm mt-2" disabled={invite.isPending || !addresses.length || addresses.length > 50}>{invite.isPending ? 'Sending…' : `Send ${addresses.length > 1 ? `${addresses.length} invites` : 'invite'}`}</button>
      </form> : <div>
        <Field label="Their WhatsApp number" hint="Opens WhatsApp with the invite ready to send. Leave it empty to pick a chat or group.">
          {(props) => <input {...props} className="field num" type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0803 123 4567" />}
        </Field>
        <a className="btn-dark btn-sm mt-2" href={`https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer noopener">Send on WhatsApp</a>
      </div>}
      <form className="border-t border-line pt-5" onSubmit={(event) => { event.preventDefault(); add.mutate(); }}>
        <Field label="Add someone on Jump" hint="By their @username. They’re added straight away.">
          {(props) => <div className="flex gap-2">
            <input {...props} className="field" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <button className="btn-secondary shrink-0" disabled={add.isPending || !username.trim().replace(/^@/, '')}>{add.isPending ? 'Adding…' : 'Add'}</button>
          </div>}
        </Field>
        <ErrorNotice error={add.error} className="mt-2" />
      </form>
    </section>
  </div>;
}

/** Managers edit everything but the handle (links keep working). */
function EditClubSheet({ club, onClose }: { club: Club; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(club.name);
  const [description, setDescription] = useState(club.description ?? '');
  const [accent, setAccent] = useState(club.accentColor ?? '#FF5A1F');
  const [location, setLocation] = useState(club.location ?? '');
  const [website, setWebsite] = useState(club.website ?? '');
  const [instagram, setInstagram] = useState(club.instagram ?? '');
  const [privacy, setPrivacy] = useState<'open' | 'invite'>(club.privacy ?? 'open');
  const [chatLocked, setChatLocked] = useState(Boolean(club.chatLocked));
  const file = useRef<HTMLInputElement | null>(null);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['club'] }), queryClient.invalidateQueries({ queryKey: ['clubs'] })]);
  const save = useMutation({
    mutationFn: () => patch<Club>(`/clubs/${club.slug}`, { name: name.trim(), description, accentColor: accent, location, website, instagram, privacy, chatLocked }),
    async onSuccess() { await refresh(); toast({ tone: 'ok', message: 'Club updated.' }); onClose(); },
  });
  const logo = useMutation({
    mutationFn: async (picked: File) => {
      const form = new FormData();
      const blob = await prepare(picked);
      form.append('file', blob, blob === picked ? picked.name : 'logo.jpg');
      return api<Club>(`/clubs/${club.slug}/logo`, { method: 'POST', body: form });
    },
    onSuccess: refresh,
  });
  const removeLogo = useMutation({ mutationFn: () => api<Club>(`/clubs/${club.slug}/logo`, { method: 'DELETE' }), onSuccess: refresh });
  const current = queryClient.getQueriesData<Club>({ queryKey: ['club'] }).map(([, data]) => data).find((data) => data?.id === club.id) ?? club;

  return <Sheet open onOpenChange={(open) => !open && onClose()} title="Edit club"
    footer={<button form="edit-club" className="btn-primary w-full" disabled={save.isPending || name.trim().length < 3}>{save.isPending ? 'Saving…' : 'Save changes'}</button>}>
    <form id="edit-club" className="space-y-5" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <div className="flex items-center gap-4">
        <ClubLogo club={{ name, logoUrl: current.logoUrl }} size={72} />
        <div className="space-y-1.5">
          <button type="button" className="btn-secondary btn-sm" disabled={logo.isPending} onClick={() => file.current?.click()}><CameraIcon size={14} /> {logo.isPending ? 'Uploading…' : current.logoUrl ? 'Change logo' : 'Add logo'}</button>
          {current.logoUrl && <button type="button" className="block text-[12px] font-semibold text-ink-3 hover:text-bad" disabled={removeLogo.isPending} onClick={() => removeLogo.mutate()}>Remove logo</button>}
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(event) => { const picked = event.target.files?.[0]; if (picked) logo.mutate(picked); event.target.value = ''; }} />
        </div>
      </div>
      <ErrorNotice error={logo.error ?? removeLogo.error} />
      <Field label="Club name">
        {(props) => <input {...props} className="field" minLength={3} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} required />}
      </Field>
      <Field label="About" hint={`${600 - description.length} characters left`}>
        {(props) => <textarea {...props} className="field min-h-[96px] py-3" maxLength={600} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Who you are, when you run, where you meet." />}
      </Field>
      <fieldset>
        <legend className="label">Club colour</legend>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((color) => <button key={color} type="button" aria-label={`Colour ${color}`} aria-pressed={accent.toUpperCase() === color}
            className={cx('flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-ink transition-transform', accent.toUpperCase() === color && 'scale-110 shadow-hard-sm')}
            style={{ background: color, color: onAccent(color) }} onClick={() => setAccent(color)}>
            {accent.toUpperCase() === color && <CheckIcon size={15} />}
          </button>)}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Where you run" optional>
          {(props) => <input {...props} className="field" maxLength={80} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Lekki, Lagos" />}
        </Field>
        <Field label="Instagram" optional>
          {(props) => <input {...props} className="field" maxLength={40} value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="@yourclub" autoCapitalize="none" />}
        </Field>
      </div>
      <Field label="Website" optional>
        {(props) => <input {...props} className="field" maxLength={200} value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="yourclub.com" autoCapitalize="none" inputMode="url" />}
      </Field>
      <PrivacyChoice value={privacy} onChange={setPrivacy} />
      <label className="flex items-start gap-3 rounded-md border-[1.5px] border-line bg-card p-3">
        <input type="checkbox" className="mt-1" checked={chatLocked} onChange={(event) => setChatLocked(event.target.checked)} />
        <span>
          <span className="block text-[14px] font-semibold">Only the owner and managers can send in the club chat</span>
          <span className="block text-[12px] text-ink-2">Members still read everything. Good for announcements.</span>
        </span>
      </label>
      <ErrorNotice error={save.error} />
    </form>
  </Sheet>;
}
