import { flag } from '@jump/shared/countries';
import { formatDate } from '@jump/shared/format';
import type { Club, ClubMember, ClubRole, ClubStanding, CompetitionTable } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ActionMenu } from '@/components/ActionMenu';
import { ClubLogo } from '@/components/ClubLogo';
import { ACCENTS, isManager, onAccent, PrivacyChoice, ROLE_LABEL } from '@/components/clubs';
import { CompetitionRow } from '@/components/competition';
import { ArrowRightIcon, CameraIcon, CheckIcon, FeedIcon, LinkIcon, LockIcon, PlusIcon, ShareIcon } from '@/components/icons';
import { Leaderboard } from '@/components/Leaderboard';
import { Sheet } from '@/components/Sheet';
import { Avatar, Button, CopyButton, EmptyState, ErrorNotice, FieldLabel, haptic, HardShadow, Loading, Notice, Screen, SectionTitle, Segmented, Skeleton, TextField, Txt, useNow, VerifiedTick } from '@/components/ui';
import { api, isApiError, patch, post, WEB_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { keys, useUnit } from '@/lib/queries';
import { colors, fontFamily, GUTTER, mono, radius, scheme, voltWash } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { pickPhoto, uploadPhoto } from '@/lib/upload';
import { confirm } from '@/lib/dialog';

type ClubTab = 'competitions' | 'leaderboard' | 'members' | 'invite';

/** The club's link for any member to pass on: with the invite in it, so invite-only clubs let people in. */
function clubShareLink(club: Club) {
  const base = `${WEB_URL}/clubs/${club.slug}`;
  return club.privacy === 'invite' && club.inviteCode ? `${base}?invite=${club.inviteCode}` : base;
}

const shareClub = (club: Club) => {
  // Counted for the club's dashboard.
  void post(`/clubs/${club.slug}/shared`, { channel: 'other' }).catch(() => undefined);
  void Share.share({ title: club.name, message: `Join ${club.name} on Jump: ${clubShareLink(club)}`, url: clubShareLink(club) });
};

/** Club page. A valid invite link joins the runner on arrival. */
export default function ClubScreen() {
  const { id, invite } = useLocalSearchParams<{ id: string; invite?: string; join?: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const club = useQuery({
    queryKey: [...keys.club(id), user?.id ?? 'guest', invite ?? ''],
    queryFn: () => api<Club>(`/clubs/${encodeURIComponent(id)}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`),
  });
  const [tab, setTab] = useState<ClubTab>('competitions');
  const [editing, setEditing] = useState(false);
  const role = club.data?.myRole ?? null;
  const canJoin = Boolean(club.data && !role && (club.data.privacy !== 'invite' || club.data.inviteValid));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['club'] }).then(() => queryClient.invalidateQueries({ queryKey: ['clubs'] }));

  const join = useMutation({
    mutationFn: () => post<{ joined: boolean; competitions: number }>(`/clubs/${id}/join`, invite ? { invite } : {}),
    async onSuccess(result) {
      haptic('success');
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['tables'] })]);
      toast({ tone: 'ok', title: `Welcome to ${club.data?.name ?? 'the club'}`, message: result.competitions ? `You’re in ${result.competitions === 1 ? 'its live competition' : `its ${result.competitions} live competitions`} too.` : 'Club competitions will count you in automatically.' });
    },
  });
  const follow = useMutation({
    mutationFn: (next: boolean) => api<{ following: boolean; followerCount: number }>(`/clubs/${id}/follow`, { method: next ? 'POST' : 'DELETE' }),
    async onSuccess(result) { haptic(); await refresh(); toast({ tone: 'ok', message: result.following ? `Following ${club.data?.name ?? 'the club'}. You’ll hear about its new competitions.` : 'Unfollowed.' }); },
  });
  const leave = useMutation({
    mutationFn: () => post(`/clubs/${id}/leave`),
    async onSuccess() { await refresh(); toast({ tone: 'ok', message: `You left ${club.data?.name ?? 'the club'}.` }); },
  });

  // A shared invite is enough to join: opening its link joins once.
  const autoJoined = useRef<string | null>(null);
  const joinClub = join.mutate;
  useEffect(() => {
    if (!invite || !club.data?.inviteValid || role || !user) return;
    const target = `${user.id}:${club.data.id}:${invite}`;
    if (autoJoined.current === target) return;
    autoJoined.current = target;
    joinClub();
  }, [invite, club.data, role, user, joinClub]);

  if (club.isLoading) return <Screen><Stack.Screen options={{ title: '' }} /><Loading /></Screen>;
  if (club.error || !club.data) {
    return <Screen>
      <Stack.Screen options={{ title: 'Club not found' }} />
      {isApiError(club.error, 404) ? <EmptyState title="No club with that handle">Check the link and try again.</EmptyState> : <ErrorNotice error={club.error} onRetry={() => void club.refetch()} />}
    </Screen>;
  }
  const c = club.data;
  const member = Boolean(role);
  const tabs: Array<{ value: ClubTab; label: string }> = [
    { value: 'competitions', label: 'Competitions' },
    ...(member ? [{ value: 'leaderboard' as const, label: 'Leaderboard' }] : []),
    ...(member || c.privacy === 'open' ? [{ value: 'members' as const, label: 'Members' }] : []),
    ...(isManager(role) ? [{ value: 'invite' as const, label: 'Invite' }] : []),
  ];

  return <Screen refreshing={club.isRefetching} onRefresh={() => void refresh()}>
    <Stack.Screen options={{ title: c.name }} />
    <ClubHero club={c}>
      {!member ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Button style={{ flex: 1 }} full variant={c.following ? 'secondary' : 'primary'} disabled={follow.isPending} icon={c.following ? <CheckIcon size={16} /> : undefined} title={c.following ? 'Following' : 'Follow'} onPress={() => follow.mutate(!c.following)} />
        {canJoin
          ? <Button style={{ flex: 1 }} full variant="secondary" loading={join.isPending} title={join.isPending ? 'Joining…' : 'Join club'} onPress={() => join.mutate()} />
          : <View style={styles.invitePill}><LockIcon size={13} color={colors.ink2} /><Txt size={13} weight="semibold" color="ink2">Invite-only</Txt></View>}
        <SquareButton label="Share the club" onPress={() => shareClub(c)}><ShareIcon size={17} /></SquareButton>
      </View>
        : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button style={{ flex: 1 }} full variant="dark" icon={<FeedIcon size={16} color={colors.paper} />} title="Club chat" onPress={() => router.push(`/clubs/${c.slug}/chat`)} />
          <SquareButton label="Share the club" onPress={() => shareClub(c)}><ShareIcon size={17} /></SquareButton>
          {isManager(role) && <ActionMenu label="Club options" trigger={<HardShadow offset={2} radius={radius.base}><View style={styles.square}><Text style={{ fontFamily: fontFamily('bold'), fontSize: 20, color: colors.ink }}>⋯</Text></View></HardShadow>} actions={[
            { label: 'Dashboard', run: () => router.push(`/clubs/${c.slug}/dashboard`) },
            ...(c.suspended ? [] : [{ label: 'New competition', run: () => router.push({ pathname: '/competitions/new', params: { club: c.slug } }) }]),
            { label: 'Edit club', run: () => setEditing(true) },
          ]} />}
        </View>}
    </ClubHero>
    <ErrorNotice error={join.error ?? follow.error} />

    {c.suspended && <Notice tone="warn" title="Suspended by Jump" style={{ marginTop: 20 }}>
      {isManager(role) ? `${c.suspendedReason ?? 'This club can’t run competitions right now.'} Contact Jump support to resolve it.` : 'This club can’t run new competitions right now.'}
    </Notice>}
    {isManager(role) && !c.suspended && <Pressable onPress={() => router.push(`/clubs/${c.slug}/dashboard`)} style={({ pressed }) => [styles.dashboard, pressed && { backgroundColor: colors.inkWash }]} accessibilityRole="link">
      <View style={{ flex: 1 }}>
        <Txt size={14} weight="bold">Club dashboard</Txt>
        <Txt size={12.5} color="ink2">Competitions, series, prizes and how your community is doing.</Txt>
      </View>
      <ArrowRightIcon size={16} />
    </Pressable>}
    {!member && <Txt size={13} color="ink2" style={{ marginTop: 16 }}>Follow to hear about every new competition. Join to be in the club, its chat and the competitions it enters members in.</Txt>}

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: 20 }} accessibilityRole="tablist">
      {tabs.map((option) => <Pressable key={option.value} onPress={() => { haptic(); setTab(option.value); }} accessibilityRole="tab" accessibilityState={{ selected: tab === option.value }} style={[styles.tab, tab === option.value && { borderBottomColor: colors.ink }]}>
        <Txt size={15} weight="semibold" color={tab === option.value ? 'ink' : 'ink3'}>{option.label}</Txt>
      </Pressable>)}
    </ScrollView>

    <View style={{ marginTop: 20 }}>
      {tab === 'competitions' && <ClubCompetitions club={c} />}
      {tab === 'leaderboard' && member && <ClubLeaderboard id={id} />}
      {tab === 'members' && <ClubMembers club={c} role={role} />}
      {tab === 'invite' && isManager(role) && <InvitePanel club={c} />}
    </View>

    {member && role !== 'owner' && <Pressable style={{ alignSelf: 'center', marginTop: 48 }} disabled={leave.isPending} hitSlop={8} onPress={() => void confirm({ title: `Leave ${c.name}?`, message: 'You’ll leave the club chat and stop being entered in its competitions. Competitions you’re already in keep you. You can join again later.', cancelLabel: 'Stay', confirmLabel: 'Leave club', destructive: true })
      .then((ok) => { if (ok) leave.mutate(); })}><Txt size={13} weight="semibold" color="ink3">Leave club</Txt></Pressable>}

    {editing && <EditClubSheet club={c} onClose={() => setEditing(false)} />}
  </Screen>;
}

function SquareButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    {({ pressed }) => <HardShadow offset={2} radius={radius.base} pressed={pressed}><View style={styles.square}>{children}</View></HardShadow>}
  </Pressable>;
}

/** The club's banner: its colour, logo, name, where it runs, what it's about, and who's in. */
function ClubHero({ club, children }: { club: Club; children: ReactNode }) {
  const accent = club.accentColor ?? '#FF5A1F';
  const [more, setMore] = useState(false);
  const long = (club.description?.length ?? 0) > 180;
  return <View style={styles.hero}>
    <View style={{ height: 112, backgroundColor: accent }}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 400 140" opacity={0.16}>
        {[0, 1, 2, 3, 4].map((lane) => <Path key={lane} d={`M-20 ${150 - lane * 24}C120 ${130 - lane * 28} 260 ${80 - lane * 20} 420 ${40 - lane * 16}`} fill="none" stroke={onAccent(accent)} strokeWidth="3" />)}
      </Svg>
    </View>
    <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
      <View style={styles.heroLogo}><ClubLogo club={club} size={84} /></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
        <Txt size={28} weight="extrabold" leading={1.15} style={{ flexShrink: 1, letterSpacing: -0.4 }}>{club.name}</Txt>
        {club.verified ? <VerifiedTick size={24} /> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
        {club.location ? <Txt size={13} color="ink2">{club.location} ·</Txt> : null}
        {club.privacy === 'invite' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><LockIcon size={12} color={colors.ink2} /><Txt size={13} color="ink2">Invite-only</Txt></View> : <Txt size={13} color="ink2">Open club</Txt>}
      </View>
      <View style={{ marginTop: 16 }}>{children}</View>
      {club.description ? <Txt size={15} leading={1.55} numberOfLines={!more && long ? 3 : undefined} style={{ marginTop: 16 }}>{club.description}</Txt> : null}
      {long && <Pressable onPress={() => setMore((value) => !value)} hitSlop={6} style={{ marginTop: 4 }}><Txt size={13} weight="semibold" color="ink2">{more ? 'Less' : 'More'}</Txt></Pressable>}
      {(club.website || club.instagram) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {club.website && <Pressable onPress={() => void Linking.openURL(/^https?:/.test(club.website!) ? club.website! : `https://${club.website}`)} style={styles.link}><LinkIcon size={13} /><Txt size={13} weight="semibold">{club.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</Txt></Pressable>}
        {club.instagram && <Pressable onPress={() => void Linking.openURL(`https://instagram.com/${club.instagram}`)} style={styles.link}><Txt size={13} weight="semibold">Instagram · @{club.instagram}</Txt></Pressable>}
      </View>}
      <View style={styles.people}>
        <View style={{ flexDirection: 'row' }}>{(club.faces ?? []).slice(0, 5).map((face, index) => <View key={index} style={{ marginLeft: index ? -8 : 0, borderRadius: 16, borderWidth: 2, borderColor: colors.card }}><Avatar name={face.displayName} src={face.avatarUrl} avatarStyle={face.avatarStyle} size={28} round /></View>)}</View>
        <Txt size={13} color="ink2" num style={{ flex: 1 }}>
          <Txt size={13} weight="bold">{club.followerCount ?? 0}</Txt>{` ${club.followerCount === 1 ? 'follower' : 'followers'} · `}
          <Txt size={13} weight="bold">{club.memberCount ?? 0}</Txt>{` ${club.memberCount === 1 ? 'member' : 'members'}`}
          {club.liveCompetitions ? <>{' · '}<Txt size={13} weight="bold">{club.liveCompetitions}</Txt>{` live ${club.liveCompetitions === 1 ? 'competition' : 'competitions'}`}</> : null}
          {club.owner ? <>{' · run by '}<Txt size={13} weight="semibold" onPress={club.owner.username ? () => router.push(`/runners/${club.owner!.username}`) : undefined}>{club.owner.displayName}</Txt></> : null}
        </Txt>
      </View>
    </View>
  </View>;
}

type ClubChallenges = { live: CompetitionTable[]; upcoming: CompetitionTable[]; past: CompetitionTable[] };

/** Live, upcoming and past competitions; past ones show who won. */
function ClubCompetitions({ club }: { club: Club }) {
  const unit = useUnit();
  const now = useNow(60_000);
  const competitions = useQuery({ queryKey: ['club', club.slug, 'competitions', club.myRole ?? 'guest'], queryFn: () => api<ClubChallenges>(`/clubs/${club.slug}/competitions`) });
  if (competitions.isLoading) return <Skeleton style={{ height: 128, borderRadius: radius['2xl'] }} />;
  if (competitions.error) return <ErrorNotice error={competitions.error} onRetry={() => void competitions.refetch()} />;
  const data = competitions.data ?? { live: [], upcoming: [], past: [] };
  const manager = isManager(club.myRole) && !club.suspended;
  const create = () => router.push({ pathname: '/competitions/new', params: { club: club.slug } });
  if (!data.live.length && !data.upcoming.length && !data.past.length) {
    return <EmptyState title="No competitions yet" action={manager ? <Button size="sm" title="Create one" icon={<PlusIcon size={16} />} onPress={create} /> : undefined}>
      {manager ? 'Create a competition, add prizes if you like, and share the link with your community.' : club.privacy === 'invite' && !club.myRole ? 'Join to see what the club is racing.' : 'Follow the club to hear when it posts one.'}
    </EmptyState>;
  }
  const list = (rows: CompetitionTable[]) => <View style={styles.list}>
    {rows.map((table, index) => <View key={table.id}>
      <CompetitionRow table={table} unit={unit} now={now} last={index === rows.length - 1 && !(table.hasPrizes && table.topPrize)} />
      {table.hasPrizes && table.topPrize ? <Txt size={12} weight="semibold" color="ok" numberOfLines={1} style={{ marginTop: -6, paddingBottom: 10, paddingLeft: 66, paddingRight: 14 }}>Prizes · {table.topPrize}</Txt> : null}
    </View>)}
  </View>;
  return <View style={{ gap: 28 }}>
    {manager && <View style={{ alignItems: 'flex-end' }}><Button variant="dark" size="sm" title="New competition" icon={<PlusIcon size={14} color={colors.paper} />} onPress={create} /></View>}
    {data.live.length > 0 && <View><SectionTitle aside={`${data.live.length}`}>Live now</SectionTitle>{list(data.live)}</View>}
    {data.upcoming.length > 0 && <View><SectionTitle aside={`${data.upcoming.length}`}>Upcoming</SectionTitle>{list(data.upcoming)}</View>}
    {data.past.length > 0 && <View>
      <SectionTitle>Past competitions</SectionTitle>
      <View style={[styles.list, { borderWidth: 1, borderColor: colors.line }]}>
        {data.past.map((table, index) => <Pressable key={table.id} onPress={() => router.push(`/competitions/${table.code}`)} style={({ pressed }) => [styles.past, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, pressed && { backgroundColor: colors.inkWash }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={14} weight="semibold" numberOfLines={1}>{table.title}</Txt>
            <Txt size={12} color="ink3" numberOfLines={1} style={{ marginTop: 2 }}>{`${table.scoringClosesAt ? `Ended ${formatDate(table.scoringClosesAt, { year: 'numeric' })}` : 'Ended'} · ${table.entrantCount ?? 0} took part`}</Txt>
          </View>
          {table.podium?.length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Avatar name={table.podium[0].displayName} src={table.podium[0].avatarUrl} size={24} round />
            <Txt size={12} weight="semibold" numberOfLines={1} style={{ maxWidth: 110 }}>{table.podium[0].displayName}</Txt>
          </View> : null}
        </Pressable>)}
      </View>
    </View>}
  </View>;
}

function ClubLeaderboard({ id }: { id: string }) {
  const { user } = useAuth();
  const unit = useUnit();
  const board = useQuery({ queryKey: ['club', id, 'leaderboard'], queryFn: () => api<ClubStanding[]>(`/clubs/${id}/leaderboard`) });
  if (board.isLoading) return <Skeleton style={{ height: 160, borderRadius: radius['2xl'] }} />;
  if (board.error) return <ErrorNotice error={board.error} onRetry={() => void board.refetch()} />;
  return <View>
    <Txt size={12} color="ink2" style={{ marginBottom: 8 }}>Verified walking and running distance this month.</Txt>
    <Leaderboard rows={(board.data ?? []).map((row) => ({ rank: row.rank, userId: row.userId, name: row.displayName, username: row.username, avatarUrl: row.avatarUrl, avatarStyle: row.avatarStyle, verified: row.verified, metres: row.monthMetres }))}
      currentUserId={user?.id} unit={unit} empty={<EmptyState title="No activity this month" />} />
  </View>;
}

function ClubMembers({ club, role }: { club: Club; role: ClubRole | null }) {
  const { user } = useAuth();
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
  if (members.isLoading) return <Skeleton style={{ height: 160, borderRadius: radius['2xl'] }} />;
  if (members.error) return <ErrorNotice error={members.error} onRetry={() => void members.refetch()} />;
  return <View>
    <ErrorNotice error={setRole.error ?? remove.error} />
    {role === 'owner' && <Txt size={13} color="ink2" style={{ marginBottom: 12 }}>Managers can edit the club, invite and add people, and host club competitions.</Txt>}
    <View style={styles.list}>
      {members.data?.map((entry, index) => {
        const isMe = entry.userId === user?.id;
        const name = entry.displayName ?? (entry.username ? `@${entry.username}` : 'Runner');
        const actions = [
          ...(entry.username ? [{ label: 'View profile', run: () => router.push(`/runners/${entry.username}`) }] : []),
          ...(role === 'owner' && entry.role === 'member' ? [{ label: 'Make manager', run: () => setRole.mutate({ userId: entry.userId, next: 'admin' }) }] : []),
          ...(role === 'owner' && entry.role === 'admin' ? [{ label: 'Remove as manager', run: () => setRole.mutate({ userId: entry.userId, next: 'member' }) }] : []),
          ...(!isMe && entry.role !== 'owner' && (role === 'owner' || (role === 'admin' && entry.role === 'member')) ? [{
            label: 'Remove from club', danger: true,
            run: () => void confirm({ title: `Remove ${name}?`, message: `They’ll leave ${club.name} and its chat. They can join again with the invite link.`, confirmLabel: 'Remove', destructive: true }).then((ok) => { if (ok) remove.mutate(entry.userId); }),
          }] : []),
        ];
        return <View key={entry.id} style={[styles.member, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
          <View>
            <Avatar name={name} src={entry.avatarUrl} avatarStyle={entry.avatarStyle} size={38} round />
            {entry.countryCode ? <Text style={{ position: 'absolute', bottom: -2, right: -4, fontSize: 12 }}>{flag(entry.countryCode)}</Text> : null}
          </View>
          <Pressable style={{ flex: 1, minWidth: 0 }} disabled={!entry.username} onPress={() => router.push(`/runners/${entry.username}`)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Txt size={14} weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{name}</Txt>
              {entry.verified ? <VerifiedTick /> : null}
              {isMe ? <Txt size={12} color="ink3">(you)</Txt> : null}
            </View>
            <Txt size={12} color="ink3" numberOfLines={1} style={{ marginTop: 2 }}>{`${entry.username ? `@${entry.username} · ` : ''}joined ${formatDate(entry.joinedAt, { year: 'numeric' })}`}</Txt>
          </Pressable>
          {entry.role !== 'member' && <View style={[styles.role, entry.role === 'owner' ? { backgroundColor: colors.ink } : { backgroundColor: colors.inkWash }]}><Txt size={11} weight="bold" color={entry.role === 'owner' ? 'paper' : 'ink'}>{ROLE_LABEL[entry.role]}</Txt></View>}
          {actions.length > 0 && <ActionMenu label={`Options for ${name}`} title={name} actions={actions} />}
        </View>;
      })}
    </View>
  </View>;
}

/** A number as wa.me wants it: digits with the country code. Nigerian 0803… becomes 234803…. */
function whatsappNumber(input: string) {
  const digits = input.replace(/\D/g, '');
  return /^0\d{10}$/.test(digits) ? `234${digits.slice(1)}` : digits;
}

/** Managers: the invite link, email invites, adding someone by username, and resetting the link. */
function InvitePanel({ club }: { club: Club }) {
  const queryClient = useQueryClient();
  const link = `${WEB_URL}/clubs/${club.slug}?invite=${club.inviteCode ?? ''}`;
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
    async onSuccess() { setUsername(''); await queryClient.invalidateQueries({ queryKey: ['club'] }); toast({ tone: 'ok', message: 'Added. They’re in the club’s live competitions too.' }); },
  });
  const reset = useMutation({
    mutationFn: () => post(`/clubs/${club.slug}/invite-code`),
    async onSuccess() { await queryClient.invalidateQueries({ queryKey: ['club'] }); toast({ tone: 'ok', message: 'New invite link ready. The old one no longer works for invite-only clubs.' }); },
  });
  return <View style={{ gap: 20 }}>
    <View style={styles.panel}>
      <Txt size={15} weight="bold">Invite link</Txt>
      <Txt size={13} color="ink2" style={{ marginTop: 2 }}>People who open this link join automatically after signing in or creating an account.</Txt>
      <Text selectable numberOfLines={1} style={styles.code}>{link}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <CopyButton value={link} label="Copy" />
        <Button size="sm" variant="secondary" title="Share" icon={<ShareIcon size={14} />} onPress={() => void Share.share({ title: club.name, message, url: link })} />
        <Button size="sm" variant="secondary" title="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`)} />
      </View>
      <Pressable style={{ marginTop: 12, alignSelf: 'flex-start' }} disabled={reset.isPending} onPress={() => void confirm({ title: 'Make a new invite link?', message: 'The current link stops working for invite-only clubs. Anyone already in the club stays in.', confirmLabel: 'Reset link' }).then((ok) => { if (ok) reset.mutate(); })}>
        <Txt size={12} weight="semibold" color="ink3">Reset link</Txt>
      </Pressable>
    </View>
    <View style={[styles.panel, { gap: 16 }]}>
      <Segmented label="Invite by" value={via} onChange={setVia} options={[{ value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp' }]} />
      {via === 'email' ? <>
        <TextField label="Email addresses" hint="Separate with commas or new lines. Up to 50 at a time." multiline autoCapitalize="none" keyboardType="email-address" value={emails} onChangeText={setEmails} placeholder="ada@example.com, tunde@example.com" style={{ minHeight: 80 }} />
        <ErrorNotice error={invite.error} />
        <Button size="sm" variant="dark" loading={invite.isPending} disabled={!addresses.length || addresses.length > 50} title={invite.isPending ? 'Sending…' : `Send ${addresses.length > 1 ? `${addresses.length} invites` : 'invite'}`} onPress={() => invite.mutate()} />
      </> : <>
        <TextField label="Their WhatsApp number" optional hint="Opens WhatsApp with the invite ready to send. Leave it empty to pick a chat or group." keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="0803 123 4567" />
        <Button size="sm" variant="dark" title="Send on WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(message)}`)} />
      </>}
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 16 }}>
        <FieldLabel label="Add someone on Jump" />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextField containerStyle={{ flex: 1 }} value={username} onChangeText={setUsername} placeholder="@username" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Username to add" />
          <Button variant="secondary" loading={add.isPending} disabled={!username.trim().replace(/^@/, '')} title={add.isPending ? 'Adding…' : 'Add'} onPress={() => add.mutate()} />
        </View>
        <Txt size={12} color="ink2" style={{ marginTop: 6 }}>By their @username. They’re added straight away.</Txt>
        <ErrorNotice error={add.error} />
      </View>
    </View>
  </View>;
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
  const [logoUrl, setLogoUrl] = useState(club.logoUrl);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['club'] }), queryClient.invalidateQueries({ queryKey: ['clubs'] })]);
  const save = useMutation({
    mutationFn: () => patch<Club>(`/clubs/${club.slug}`, { name: name.trim(), description, accentColor: accent, location, website, instagram, privacy, chatLocked }),
    async onSuccess() { await refresh(); haptic('success'); toast({ tone: 'ok', message: 'Club updated.' }); onClose(); },
  });
  const logo = useMutation({
    mutationFn: async () => {
      const photo = await pickPhoto({ square: true });
      return photo ? uploadPhoto<Club>(`/clubs/${club.slug}/logo`, photo, { name: 'logo.jpg' }) : null;
    },
    async onSuccess(updated) { if (updated) { setLogoUrl(updated.logoUrl); await refresh(); } },
  });
  const removeLogo = useMutation({ mutationFn: () => api<Club>(`/clubs/${club.slug}/logo`, { method: 'DELETE' }), async onSuccess() { setLogoUrl(null); await refresh(); } });

  return <Sheet open onOpenChange={(open) => !open && onClose()} title="Edit club" footer={<Button full title={save.isPending ? 'Saving…' : 'Save changes'} loading={save.isPending} disabled={name.trim().length < 3} onPress={() => save.mutate()} />}>
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ClubLogo club={{ name, logoUrl }} size={72} />
        <View style={{ gap: 6 }}>
          <Button size="sm" variant="secondary" loading={logo.isPending} icon={<CameraIcon size={14} />} title={logo.isPending ? 'Uploading…' : logoUrl ? 'Change logo' : 'Add logo'} onPress={() => logo.mutate()} />
          {logoUrl ? <Pressable onPress={() => removeLogo.mutate()} disabled={removeLogo.isPending}><Txt size={12} weight="semibold" color="ink3">Remove logo</Txt></Pressable> : null}
        </View>
      </View>
      <ErrorNotice error={logo.error ?? removeLogo.error} />
      <TextField label="Club name" maxLength={100} value={name} onChangeText={setName} />
      <TextField label="About" hint={`${600 - description.length} characters left`} multiline maxLength={600} value={description} onChangeText={setDescription} placeholder="Who you are, when you run, where you meet." style={{ minHeight: 96 }} />
      <View>
        <FieldLabel label="Club colour" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ACCENTS.map((color) => {
            const on = accent.toUpperCase() === color;
            return <Pressable key={color} onPress={() => { haptic(); setAccent(color); }} accessibilityLabel={`Colour ${color}`} accessibilityState={{ selected: on }}
              style={[styles.swatch, { backgroundColor: color }, on && { transform: [{ scale: 1.1 }] }]}>{on ? <CheckIcon size={15} color={onAccent(color)} /> : null}</Pressable>;
          })}
        </View>
      </View>
      <TextField label="Where you run" optional maxLength={80} value={location} onChangeText={setLocation} placeholder="Lekki, Lagos" />
      <TextField label="Instagram" optional maxLength={40} value={instagram} onChangeText={setInstagram} placeholder="@yourclub" autoCapitalize="none" />
      <TextField label="Website" optional maxLength={200} value={website} onChangeText={setWebsite} placeholder="yourclub.com" autoCapitalize="none" keyboardType="url" />
      <PrivacyChoice value={privacy} onChange={setPrivacy} />
      <View style={styles.lock}>
        <View style={{ flex: 1 }}>
          <Txt size={14} weight="semibold">Only the owner and managers can send in the club chat</Txt>
          <Txt size={12} color="ink2">Members still read everything. Good for announcements.</Txt>
        </View>
        <Switch value={chatLocked} onValueChange={setChatLocked} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} />
      </View>
      <ErrorNotice error={save.error} />
    </View>
  </Sheet>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, overflow: 'hidden' },
  heroLogo: { marginTop: -40, alignSelf: 'flex-start', borderRadius: radius.xl + 3, borderWidth: 3, borderColor: colors.card },
  invitePill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: radius.full, backgroundColor: colors.inkWash },
  square: { width: 46, height: 46, borderRadius: radius.base, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.full, backgroundColor: colors.inkWash, paddingHorizontal: 12, paddingVertical: 6 },
  people: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 16 },
  dashboard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, borderRadius: radius.xl, borderWidth: 1.5, borderColor: scheme === 'dark' ? colors.volt : colors.edge, backgroundColor: voltWash(0.6), paddingHorizontal: 16, paddingVertical: 12 },
  tabs: { marginTop: 32, flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, marginHorizontal: -GUTTER, paddingHorizontal: GUTTER },
  tab: { paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  list: { borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, overflow: 'hidden' },
  past: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  role: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 2 },
  panel: { borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, padding: 20 },
  code: { marginTop: 12, borderRadius: radius.lg, backgroundColor: colors.inkWash, paddingHorizontal: 12, paddingVertical: 8, fontFamily: mono, fontSize: 12, color: colors.ink2 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: colors.edge, alignItems: 'center', justifyContent: 'center' },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, padding: 12 },
});
