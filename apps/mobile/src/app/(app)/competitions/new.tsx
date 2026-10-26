import { prizeSplit } from '@jump/shared/competition';
import { ACTIVITY_RULES, FORMATS, METRICS, type CompetitionFormat } from '@jump/shared/competition-rules';
import { countryName } from '@jump/shared/countries';
import { formatDateTime, formatDistance, formatMoney, formatNairaInput, fromLocalInput, nairaInputToKobo, toLocalInput, toMetres } from '@jump/shared/format';
import { EMPTY_PRIZES, fundingForPrize, PRIZE_KIND, prizeProblem, prizesPayload, type PrizeDraft } from '@jump/shared/prizes';
import { draftFor, scoringPayload, type ScoringDraft } from '@jump/shared/scoring-draft';
import { templateById } from '@jump/shared/templates';
import type { Club, CompetitionTable } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { CountriesField, PrizeEditor } from '@/components/ClubPrizes';
import { DateTimePicker } from '@/components/DateTimePicker';
import { OpponentPicker, opponentLabel, type Opponent } from '@/components/OpponentPicker';
import { SelectField } from '@/components/pickers';
import { ScoringPicker } from '@/components/ScoringPicker';
import { Sheet, SheetRow } from '@/components/Sheet';
import { Button, Card, ErrorNotice, Eyebrow, FieldLabel, Footer, haptic, HardShadow, Hint, Notice, PageHeader, Screen, SectionTitle, TextField, Txt } from '@/components/ui';
import { api, post } from '@/lib/api';
import { keys, useCreator, useUnit } from '@/lib/queries';
import { colors, radius, wideLabel } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { pickPhoto, uploadPhoto, type PickedPhoto } from '@/lib/upload';
import { Image } from 'expo-image';

/** "2 prizes · 4 winners · top finishers" for the prizes row. */
function prizeSummary(draft: PrizeDraft) {
  const named = draft.prizes.filter((prize) => prize.productName.trim());
  if (!named.length) return 'Add what winners get.';
  const winners = draft.prizes.reduce((sum, prize) => sum + (prize.quantity || 0), 0);
  const first = named[0];
  return `${first.productName.trim()} (${PRIZE_KIND[first.kind].label.toLowerCase()})${named.length > 1 ? ` + ${named.length - 1} more` : ''} · ${winners} ${winners === 1 ? 'winner' : 'winners'} · ${draft.selection === 'draw' ? 'random draw' : 'top finishers'}`;
}

function publishSummary(publish: 'now' | 'schedule' | 'draft', at: string | null, repeat: 'none' | 'weekly' | 'monthly', auto: boolean) {
  const when = publish === 'now' ? 'Publish now' : publish === 'draft' ? 'Save as draft' : at ? `Opens ${formatDateTime(at)}` : 'Schedule';
  const series = repeat === 'none' ? 'once' : `${repeat}${auto ? ', auto-publish' : ', confirm each edition'}`;
  return `${when} · ${series}`;
}

const DURATIONS = [
  { label: '24 hours', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '30 days', days: 30 },
];

export default function NewCompetitionScreen() {
  const { club: clubId, template: templateId } = useLocalSearchParams<{ club?: string; template?: string }>();
  // "Challenge someone" starters arrive with everything set; the runner just names it and invites.
  const [preset] = useState(() => templateById(templateId));
  const queryClient = useQueryClient();
  const unit = useUnit();
  const creator = useCreator();
  const club = useQuery({ queryKey: keys.club(clubId ?? ''), queryFn: () => api<Club>(`/clubs/${clubId}`), enabled: Boolean(clubId) });
  // A club manager hosting for the club: prizes, who can enter, when it opens, and repeating it.
  const clubHost = Boolean(club.data && (club.data.myRole === 'owner' || club.data.myRole === 'admin'));
  const [eligibleCountries, setEligibleCountries] = useState<string[]>([]);
  const [prizesOn, setPrizesOn] = useState(false);
  const [prizes, setPrizes] = useState<PrizeDraft>(EMPTY_PRIZES);
  const [publish, setPublish] = useState<'now' | 'schedule' | 'draft'>('now');
  const [publishAt, setPublishAt] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [repeat, setRepeat] = useState<'none' | 'weekly' | 'monthly'>('none');
  const [autoPublish, setAutoPublish] = useState(true);
  const [sheet, setSheet] = useState<'entry' | 'prizes' | 'publish' | 'opponent' | 'invites' | null>(null);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [mode, setMode] = useState<'free' | 'sponsored' | 'paid'>('free');
  const [title, setTitle] = useState(preset?.title ?? '');
  const [description, setDescription] = useState('');
  const [banner, setBanner] = useState<PickedPhoto | null>(null);
  const [scoring, setScoring] = useState<ScoringDraft>(() => {
    const draft = draftFor(preset?.challengeType ?? 'RUN', preset?.scoringMethod ?? 'FARTHEST_DISTANCE');
    return preset?.targetKm ? { ...draft, target: String(preset.targetKm) } : draft;
  });
  const challengeType = scoring.challengeType;
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [scoringClosesAt, setScoringClosesAt] = useState(() => toLocalInput(new Date(Date.now() + (preset?.days ?? 7) * 86_400_000)));
  const [remindDaily, setRemindDaily] = useState(false);
  const [reminderTime, setReminderTime] = useState('08:00');
  const reminderTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [capacity, setCapacity] = useState(preset ? String(preset.capacity) : '');
  const [cap, setCap] = useState('');
  const [duration, setDuration] = useState<number | null>(preset?.days ?? 7);
  /** No end date: free competitions only; prizes need an end to pay out. */
  const [openEnded, setOpenEnded] = useState(false);
  const [entryFee, setEntryFee] = useState('');
  const [fundingOption, setFundingOption] = useState<'MULTI_WINNERS' | 'FIXED_WINNERS' | 'FIXED_CHARITY'>('MULTI_WINNERS');
  const [fixedPrize, setFixedPrize] = useState('');
  const [charityName, setCharityName] = useState('');
  const [winnerCount, setWinnerCount] = useState('1');
  const [shares, setShares] = useState(['100']);
  const [inviteClubMembers, setInviteClubMembers] = useState(Boolean(clubId));
  const [format, setFormat] = useState<CompetitionFormat>(preset ? (preset.capacity === 2 ? 'head_to_head' : 'invite') : 'open');
  const [emailText, setEmailText] = useState('');
  const [phoneText, setPhoneText] = useState('');

  // Room for the whole club, with space for people who join later.
  useEffect(() => {
    if (club.data && !capacity) setCapacity(String(Math.min(10000, Math.max(20, (club.data.memberCount ?? 0) * 2))));
  }, [club.data, capacity]);

  const startIso = fromLocalInput(startsAt);
  const endless = openEnded && mode === 'free';
  const scoringIso = endless ? null : fromLocalInput(scoringClosesAt);
  const capMetres = cap ? toMetres(Number(cap), unit) : undefined;
  const headToHead = format === 'head_to_head' && mode !== 'paid';
  const capacityNumber = headToHead ? 2 : capacity ? Number(capacity) : undefined;
  const entryFeeKobo = nairaInputToKobo(entryFee);
  const fundingStyle = fundingOption === 'MULTI_WINNERS' ? 'OPEN' : 'FIXED';
  const fundingDestination = fundingOption === 'FIXED_CHARITY' ? 'CHARITY' : 'WINNERS';
  // Scheduling and series are for free competitions (cash ones open once funded); club prizes are for
  // funded and paid ones only, on top of their cash.
  const clubExtras = clubHost && mode === 'free';
  const clubPrizesOn = clubHost && mode !== 'free';
  const later = clubExtras && publish !== 'now';
  const publishIso = later && publish === 'schedule' ? fromLocalInput(publishAt) : null;
  const draftOnCreate = mode === 'paid' || (mode === 'sponsored' && fundingStyle === 'FIXED') || later;
  // The host types the prize itself; Jump's 15% goes on top, so they see what they'll actually pay.
  const fixedPrizeKobo = nairaInputToKobo(fixedPrize);
  const fixedFunding = fundingForPrize(fixedPrizeKobo);
  const guaranteedPrizeKobo = mode === 'paid' ? (capacityNumber ?? 0) * entryFeeKobo : mode === 'sponsored' && fundingStyle === 'FIXED' ? fixedFunding.totalKobo : 0;
  const scoringFields = scoringPayload(scoring, unit, mode !== 'free');
  // Head-to-head invites its one opponent; other formats take lists.
  const inviteEmails = headToHead ? (opponent?.kind === 'email' ? [opponent.value] : []) : emailText.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  const invitePhones = headToHead ? (opponent?.kind === 'phone' ? [opponent.value] : []) : phoneText.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
  const inviteSummary = [
    club.data && inviteClubMembers ? `Everyone in ${club.data.name}` : '',
    inviteEmails.length ? `${inviteEmails.length} ${inviteEmails.length === 1 ? 'email' : 'emails'}` : '',
    invitePhones.length ? `${invitePhones.length} ${invitePhones.length === 1 ? 'phone' : 'phones'}` : '',
  ].filter(Boolean).join(' · ');
  const isCharity = mode === 'sponsored' && fundingDestination === 'CHARITY';
  const fixedHint = 'Minimum ₦10,000. Jump’s 15% fee is added on top.';
  const prizeSplitBps = isCharity ? [10000] : shares.map((value) => Math.round(Number(value) * 100));
  const hasPrize = mode !== 'free';
  const prizeError = hasPrize && !isCharity && (!Number.isInteger(Number(winnerCount)) || Number(winnerCount) < 1 || Number(winnerCount) > 100
    || shares.length !== Number(winnerCount) || prizeSplitBps.some((part) => !Number.isInteger(part) || part < 1)
    || prizeSplitBps.reduce((sum, part) => sum + part, 0) !== 10000 || (capacityNumber !== undefined && Number(winnerCount) > capacityNumber));

  const errors = {
    title: title.trim().length > 0 && title.trim().length < 3 ? 'At least 3 characters.' : undefined,
    scoring: startIso && scoringIso && new Date(scoringIso) <= new Date(startIso) ? 'Must be after the start.' : undefined,
    capacity: headToHead ? undefined : capacityNumber === undefined || capacityNumber < 2 || capacityNumber > 10000 || !Number.isInteger(capacityNumber) ? 'Enter a maximum between 2 and 10,000 runners.' : undefined,
    cap: capMetres !== undefined && (capMetres < 1000 || capMetres > 500000) ? `Between ${formatDistance(1000, unit)} and ${formatDistance(500000, unit)}.` : undefined,
    target: scoringFields.problem ? `${scoringFields.problem}.` : undefined,
    paid: mode === 'paid' && (creator.data?.status !== 'ACTIVE' || entryFeeKobo < 100 || guaranteedPrizeKobo < 100 || guaranteedPrizeKobo > 1_000_000_000 || !Number.isSafeInteger(guaranteedPrizeKobo)) ? 'Use an active creator account, an entry fee of at least ₦1, and a full-capacity pot no greater than ₦10,000,000.' : undefined,
    funding: mode === 'sponsored' && fundingStyle === 'FIXED' && (!Number.isSafeInteger(fixedPrizeKobo) || fixedPrizeKobo < 1_000_000 || guaranteedPrizeKobo > 1_000_000_000) ? `Enter ${isCharity ? 'an amount' : 'a prize'} from ₦10,000 to ₦8,500,000.` : mode === 'sponsored' && fundingDestination === 'CHARITY' && (fundingStyle !== 'FIXED' || charityName.trim().length < 2) ? 'Charity funding needs a fixed amount and charity name.' : undefined,
    prize: prizeError || (mode === 'paid' && guaranteedPrizeKobo < 100) ? 'Choose prize shares that total 100% and fit the maximum runner count.' : undefined,
    invites: !draftOnCreate && (inviteEmails.length > 50 || invitePhones.length > 50 || inviteEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || invitePhones.some((phone) => !/^\+[1-9]\d{7,14}$/.test(phone))) ? 'Use valid emails and international phone numbers, up to 50 of each.' : undefined,
    club: clubId && !club.data ? 'This club could not be loaded.' : club.data?.suspended ? 'Jump has suspended this club, so it can’t host competitions.' : undefined,
    prizes: clubPrizesOn && prizesOn ? prizeProblem(prizes, capacityNumber) ?? undefined : undefined,
    publishAt: later && publish === 'schedule' && (!publishIso || new Date(publishIso) <= new Date() || (scoringIso && new Date(publishIso) >= new Date(scoringIso))) ? 'Schedule it for a time in the future, before it ends.' : undefined,
    series: clubExtras && repeat !== 'none' && endless ? 'A series needs an end date for each edition.' : undefined,
  };
  // The first thing stopping you, shown under the pinned Create button.
  const blocker = title.trim().length < 3 ? 'Give it a name of at least 3 characters.' : Object.values(errors).find(Boolean) ?? null;

  const create = useMutation({
    mutationFn: () => post<CompetitionTable>(mode === 'paid' ? '/tables/paid-drafts' : '/tables', {
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...scoringFields.fields,
      timeZone: reminderTimeZone,
      ...(startIso ? { startsAt: startIso } : {}),
      ...(endless ? { openEnded: true } : scoringIso ? { scoringClosesAt: scoringIso } : {}),
      ...(remindDaily ? { reminderTime, reminderTimeZone } : {}),
      capacity: headToHead ? 2 : capacityNumber,
      ...(mode !== 'paid' && capMetres ? { distanceCapMetres: capMetres } : {}),
      ...(hasPrize ? { prizeSplitBps } : {}),
      ...(mode === 'sponsored' ? { fundedFree: true, ...(fundingStyle === 'FIXED' ? { guaranteedPrizeKobo } : {}), fundingDestination, ...(fundingDestination === 'CHARITY' ? { charityName: charityName.trim() } : {}) } : {}),
      ...(mode === 'paid' ? { entryFeeKobo } : {}),
      ...(club.data ? { communityId: club.data.id, ...((!draftOnCreate || later) && inviteClubMembers && !headToHead ? { inviteClubMembers: true } : {}) } : {}),
      ...(clubHost && eligibleCountries.length ? { eligibleCountries } : {}),
      ...(clubPrizesOn && prizesOn ? { clubPrizes: prizesPayload(prizes) } : {}),
      ...(later ? { publish, ...(publishIso ? { publishAt: publishIso } : {}) } : {}),
      ...(clubExtras && repeat !== 'none' ? { series: { cadence: repeat, autoPublish } } : {}),
      ...(!draftOnCreate && inviteEmails.length ? { inviteEmails } : {}),
      ...(mode !== 'paid' ? { format, visibility: format === 'open' ? 'public' : 'private' } : {}),
      ...(!draftOnCreate && invitePhones.length ? { invitePhones } : {}),
    }),
    async onSuccess(table) {
      if (banner) {
        await uploadPhoto(`/tables/${table.id}/banner`, banner, { name: 'banner.jpg' }).catch((error: unknown) => {
          if (__DEV__) console.warn('Banner upload failed:', String((error as { cause?: unknown }).cause ?? error));
          toast({ tone: 'warn', message: 'Created, but the banner didn’t upload. Add it from Host tools on the competition page.' });
        });
      }
      // A runner on Jump is invited by username once the competition exists.
      if (headToHead && opponent?.kind === 'runner' && table.status === 'OPEN_FOR_ENTRY') {
        await post(`/tables/${table.id}/invitations`, { username: opponent.username }).catch((error: unknown) => {
          toast({ tone: 'warn', message: `Created, but we couldn’t invite @${opponent.username}: ${error instanceof Error ? error.message : 'try again from the competition page.'}` });
        });
      }
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.tables }), queryClient.invalidateQueries({ queryKey: ['tables', 'mine'] })]);
      haptic('success');
      router.replace({ pathname: '/competitions/[code]', params: { code: table.code, created: '1' } });
    },
  });

  function pickDuration(days: number) {
    setOpenEnded(false);
    setDuration(days);
    const start = startIso ? new Date(startIso) : new Date();
    setScoringClosesAt(toLocalInput(new Date(start.getTime() + days * 86_400_000)));
  }

  function changeMode(value: typeof mode) {
    haptic();
    setMode(value);
    if (value !== 'free') setPrizesOn(false);
    // Cash needs a way of winning that's hard to game; fall back to the activity's first one that is.
    if (value !== 'free' && !METRICS[scoring.scoringMethod].prizes) {
      const safe = ACTIVITY_RULES[challengeType].options.find((option) => METRICS[option.method].prizes);
      if (safe) setScoring(draftFor(challengeType, safe.method, scoring));
    }
  }

  function setWinners(next: string) {
    setWinnerCount(next);
    const count = Number(next);
    if (!Number.isInteger(count) || count < 1 || count > 100) return;
    if (count === 3) setShares(['50', '30', '20']);
    else {
      const equal = Math.floor(10000 / count);
      setShares(Array.from({ length: count }, (_, index) => ((equal + (index === 0 ? 10000 - equal * count : 0)) / 100).toFixed(2)));
    }
  }

  const submitLabel = create.isPending ? 'Saving…' : mode === 'paid' ? 'Submit paid draft' : mode === 'sponsored' && fundingStyle === 'FIXED' ? 'Save funding draft' : later ? (publish === 'draft' ? 'Save draft' : 'Schedule it') : 'Create competition';
  const submitHint = blocker ?? (mode === 'paid' ? 'Jump reviews paid competitions before they open.' : mode === 'sponsored' && fundingStyle === 'FIXED' ? 'Entry opens once your payment is confirmed.' : later ? (publish === 'draft' ? 'Publish it from the club dashboard when it’s ready.' : `Opens ${publishIso ? formatDateTime(publishIso) : 'at the time you pick'}.`) : 'Opens as soon as you create it.');

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 56 : 0}>
    <Screen ownKeyboard footer={<Footer>
      <Button full size="lg" title={submitLabel} loading={create.isPending} disabled={Boolean(blocker)} onPress={() => (blocker ? toast({ tone: 'warn', message: blocker }) : create.mutate())} />
      <Txt size={12} color="ink3" align="center" numberOfLines={1} style={{ marginTop: 6 }}>{submitHint}</Txt>
    </Footer>}>
      <PageHeader eyebrow="New competition" title="Set up a competition" description="Choose the activity and exact scoring method before you publish." />
      <View style={{ gap: 24 }}>
        {challengeType === 'CYCLING'
          ? <Notice tone="neutral" title="Cycling is free to compete">Cycling distance uses GPS verification. Cash prizes are paused until bicycle rides can be distinguished from vehicle trips more reliably.</Notice>
          : <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Competition type">
            {([['free', 'Free', 'No entry fee, no prize'], ['sponsored', 'Funded', 'Free entry, cash prize'], ['paid', 'Paid', 'Entry fee, creators only']] as const).map(([value, label, body]) => {
              const active = mode === value;
              return <Pressable key={value} onPress={() => changeMode(value)} style={{ flex: 1 }} accessibilityRole="radio" accessibilityState={{ checked: active }}>
                {({ pressed }) => <HardShadow offset={2} radius={radius.md} pressed={active || pressed}>
                  <View style={[styles.mode, active && { backgroundColor: colors.ink }]}>
                    <Text style={[wideLabel(13, 0), active && { color: colors.paper }]}>{label}</Text>
                    <Txt size={11.5} leading={1.3} style={{ marginTop: 4, color: active ? colors.onInkMuted : colors.ink2 }}>{body}</Txt>
                  </View>
                </HardShadow>}
              </Pressable>;
            })}
          </View>}
        {club.data && <Notice tone="neutral" title={`Hosting for ${club.data.name}`}>
          {mode === 'paid' ? `All ${club.data.memberCount} members are invited once Jump approves it; they choose whether to pay to enter.`
            : inviteClubMembers ? `All ${club.data.memberCount} members are entered automatically, and anyone who joins the club later is added while it’s open.`
              : 'Linked to your club. Members aren’t entered automatically.'}
        </Notice>}
        {mode === 'paid' && !creator.data && <Notice tone="warn" title="Creator account required" action={<Button size="sm" variant="quiet" title="Become a creator" onPress={() => router.push('/creator')} />}>Paid competitions are hosted by approved creators. Apply first; Jump reviews every application.</Notice>}
        {mode === 'paid' && creator.data && creator.data.status !== 'ACTIVE' && <Notice tone="warn" title={creator.data.status === 'PENDING' ? 'Your creator account is awaiting approval' : 'Your creator account is suspended'}>
          {creator.data.status === 'PENDING' ? 'You can host paid competitions once Jump approves you. You’ll get a notification.' : 'You can’t host paid competitions right now. Contact Jump support.'}
        </Notice>}

        <TextField label="Competition name" error={errors.title} value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g. Lekki Saturday 10K" />
        <TextField label="What’s it about?" optional hint={`${280 - description.length} characters left`} multiline maxLength={280} value={description} onChangeText={setDescription} style={{ minHeight: 76 }}
          placeholder="e.g. Our run club’s month of miles. Every Saturday long run counts, slowest finisher buys the smoothies." />

        <View>
          <FieldLabel label="Banner" optional />
          {banner
            ? <View style={{ gap: 8 }}>
              <Image source={{ uri: banner.uri }} style={styles.bannerPreview} contentFit="cover" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button size="sm" variant="secondary" title="Change" onPress={() => void pickPhoto({ maxSide: 1600 }).then((photo) => photo && setBanner(photo))} />
                <Button size="sm" variant="quiet" title="Remove" onPress={() => setBanner(null)} />
              </View>
            </View>
            : <Pressable onPress={() => void pickPhoto({ maxSide: 1600 }).then((photo) => photo && setBanner(photo))} style={({ pressed }) => [styles.bannerPick, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <Txt size={14} weight="bold">Add a banner image</Txt>
              <Txt size={12} color="ink3">Shown at the top instead of the coloured card. Wide images (2:1) work best.</Txt>
            </Pressable>}
        </View>

        <ScoringPicker draft={scoring} unit={unit} prizes={mode !== 'free'} error={errors.target} onChange={(next) => { if (next.challengeType === 'CYCLING') setMode('free'); setScoring(next); }} />

        <View>
          <FieldLabel label="Length" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DURATIONS.map((option) => <Toggle key={option.days} label={option.label} on={!endless && duration === option.days} onPress={() => pickDuration(option.days)} />)}
            {mode === 'free' && <Toggle label="No end date" on={endless} onPress={() => { setOpenEnded(true); setDuration(null); }} />}
          </View>
          {endless && <Hint>Runs until you end it. Every verified activity keeps counting; the leader holds the top spot for as long as they keep it.</Hint>}
        </View>

        <DateTimePicker label="Starts" value={startsAt} min={toLocalInput(new Date())} onChange={(next) => { setStartsAt(next); setDuration(null); }} />
        {!endless && <View>
          <DateTimePicker label="Ends" hint={errors.scoring ? undefined : 'Runners can join and log activities until this.'} value={scoringClosesAt} min={startsAt || undefined} onChange={(next) => { setScoringClosesAt(next); setOpenEnded(false); setDuration(null); }} />
          {errors.scoring ? <Hint error>{errors.scoring}</Hint> : null}
        </View>}

        <Card style={{ padding: 16, gap: 12 }}>
          <View style={styles.switchRow}>
            <Txt size={14} weight="semibold" style={{ flex: 1 }}>Email joined runners a daily reminder</Txt>
            <Switch value={remindDaily} onValueChange={setRemindDaily} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} />
          </View>
          {remindDaily && <DateTimePicker timeOnly label={`Reminder time · ${reminderTimeZone}`} hint="Sent once per local day while the competition is active. Runners who have already recorded an activity that day are skipped."
            value={`2000-01-01T${reminderTime}`} onChange={(next) => setReminderTime(next.slice(11, 16))} />}
        </Card>

        {headToHead
          ? <Txt size={13} color="ink2">Head-to-head: just you and one other.</Txt>
          : <TextField label="Max runners" error={errors.capacity} hint="Required for every competition. Choose 2 to 10,000." keyboardType="number-pad" value={capacity} onChangeText={setCapacity} />}
        {mode !== 'paid' && <TextField label={`Distance cap per activity (${unit})`} optional error={errors.cap} hint="Stops one monster activity from deciding everything." keyboardType="decimal-pad" value={cap} onChangeText={setCap} />}

        {hasPrize && <Card style={{ padding: 20, gap: 20 }}>
          <SectionTitle style={{ marginBottom: 0 }}>{mode === 'paid' ? 'Paid competition' : 'Funded free competition'}</SectionTitle>
          {mode === 'sponsored' && <>
            <SelectField label="Funding plan" value={fundingOption} onChange={setFundingOption} options={[
              { value: 'MULTI_WINNERS', label: 'Growing pool', detail: 'Many people fund winners' },
              { value: 'FIXED_WINNERS', label: 'Fixed amount', detail: 'I fund winners' },
              { value: 'FIXED_CHARITY', label: 'Fixed amount for charity', detail: 'I fund a charity' },
            ]} />
            {fundingStyle === 'FIXED' && <TextField label={`${isCharity ? 'Amount for the charity' : 'Prize for the winners'} · NGN`} error={errors.funding} hint={fixedHint} keyboardType="decimal-pad" value={fixedPrize} onChangeText={(text) => setFixedPrize(formatNairaInput(text))} placeholder="10,000" />}
            {fundingDestination === 'CHARITY' && <TextField label="Charity name" error={errors.funding} maxLength={120} value={charityName} onChangeText={setCharityName} />}
          </>}
          {mode === 'paid' && <>
            <TextField label="Entry fee · NGN" keyboardType="decimal-pad" value={entryFee} onChangeText={(text) => setEntryFee(formatNairaInput(text))} />
            <Txt size={14} leading={1.5}>Full-capacity prize pot: <Txt size={14} weight="bold" num>{formatMoney(guaranteedPrizeKobo)}</Txt> <Txt size={14} color="ink2">{`(${capacityNumber || 0} runners × ${formatMoney(entryFeeKobo)} entry)`}</Txt></Txt>
          </>}
          {!isCharity && <TextField label="Number of prize places" hint="Choose one winner, top three, or any number up to 100." keyboardType="number-pad" value={winnerCount} onChangeText={setWinners} />}
          {!isCharity && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {shares.map((share, index) => <TextField key={index} containerStyle={{ width: '30%', minWidth: 96 }} label={`Place ${index + 1} · %`} keyboardType="decimal-pad" value={share} onChangeText={(text) => setShares((current) => current.map((part, partIndex) => (partIndex === index ? text : part)))} />)}
          </View>}
          {errors.prize ? <Hint error>{errors.prize}</Hint> : null}
          {mode === 'paid' ? <PrizeBreakdown potKobo={guaranteedPrizeKobo} shares={prizeSplitBps} />
            : fundingStyle === 'FIXED' ? <FundingTotal prizeKobo={fixedPrizeKobo} charity={isCharity} />
            : <Txt size={13} color="ink2">{`Jump retains 15%. ${fundingDestination === 'CHARITY' ? 'The other 85% is held for the charity until an admin verifies the recipient.' : 'Your percentages split the remaining 85% between eligible winners.'}`}</Txt>}
          <Txt size={12} color="ink3" leading={1.5}>{mode === 'paid' ? 'This is a fixed guaranteed pot based on a full competition, even if fewer runners join. Jump must confirm that the full prize is funded before opening paid entry.'
            : fundingStyle === 'FIXED' ? 'Entry is free. The competition opens after your fixed contribution is confirmed.' : 'Joining opens immediately, with no creator funding required. Anyone can contribute any amount from ₦1 through Paystack before scoring closes and still compete for the cash prize.'}</Txt>
        </Card>}

        {mode !== 'paid' && <Card style={{ padding: 20, gap: 12 }}>
          <SectionTitle style={{ marginBottom: 0 }}>Who competes</SectionTitle>
          {(Object.keys(FORMATS) as CompetitionFormat[]).map((value) => {
            const active = format === value;
            return <Pressable key={value} onPress={() => { haptic(); setFormat(value); }} accessibilityRole="radio" accessibilityState={{ checked: active }} style={[styles.format, active && { borderColor: colors.edge, backgroundColor: colors.ink }]}>
              <Text style={[wideLabel(13, 0), active && { color: colors.paper }]}>{FORMATS[value].label}</Text>
              <Txt size={12} leading={1.35} style={{ marginTop: 4, color: active ? colors.onInkMuted : colors.ink2 }}>{FORMATS[value].summary}</Txt>
            </Pressable>;
          })}
          {format === 'invite' && <Txt size={12} color="ink3">Invite by email below, or by username from the competition page after you create it.</Txt>}
        </Card>}

        {clubHost && <View style={{ gap: 10 }}>
          <FieldLabel label={`For ${club.data!.name}`} />
          <SheetRow title="Who can enter" onOpen={() => setSheet('entry')} summary={eligibleCountries.length ? `${eligibleCountries.map(countryName).join(', ')} only` : 'Anyone, anywhere'} />
          {clubPrizesOn && <SheetRow title="Club prizes" tone={prizesOn ? 'on' : 'default'} error={errors.prizes} onOpen={() => { if (!prizesOn) setPrizesOn(true); setSheet('prizes'); }}
            summary={prizesOn ? prizeSummary(prizes) : 'None yet. Add products, discounts or experiences.'} />}
          {clubExtras && <SheetRow title="Publishing" error={errors.publishAt ?? errors.series} onOpen={() => setSheet('publish')} summary={publishSummary(publish, publishIso ?? null, repeat, autoPublish)} />}
        </View>}

        {headToHead && !draftOnCreate
          ? <SheetRow title="Your opponent" tone={opponent ? 'on' : 'default'} onOpen={() => setSheet('opponent')} summary={opponent ? opponentLabel(opponent) : 'Pick who you’re racing: a runner on Jump, an email or a phone number.'} />
          : !draftOnCreate ? <SheetRow title="Invite runners" error={errors.invites} onOpen={() => setSheet('invites')} summary={inviteSummary || 'Optional. Invite by email, phone or club.'} />
            : later ? (club.data && <Card style={{ padding: 16 }}><View style={styles.switchRow}><Txt size={14} weight="semibold" style={{ flex: 1 }}>Enter everyone in {club.data.name} when it opens</Txt><Switch value={inviteClubMembers} onValueChange={setInviteClubMembers} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} /></View></Card>)
              : <Notice tone="neutral" title="Invite after launch">Save this draft first. You can invite runners after funding or approval opens entry.</Notice>}

        <ErrorNotice error={create.error} />
      </View>

      <Sheet open={sheet === 'entry'} onOpenChange={(open) => setSheet(open ? 'entry' : null)} title="Who can enter" description="Only people whose profile country is listed can join."
        footer={<Button full title="Done" onPress={() => setSheet(null)} />}>
        <CountriesField label="Countries" value={eligibleCountries} onChange={setEligibleCountries} emptyLabel="Anyone, anywhere" hint="Leave empty to open it to everyone." />
      </Sheet>

      {clubPrizesOn && <Sheet open={sheet === 'prizes'} onOpenChange={(open) => setSheet(open ? 'prizes' : null)} title="Club prizes" description={`From ${club.data!.name}. Winners get a claim form when it ends.`}
        footer={<View style={{ flexDirection: 'row', gap: 8 }}>
          <Button variant="secondary" full style={{ flex: 1 }} title="Remove prizes" onPress={() => { setPrizesOn(false); setPrizes(EMPTY_PRIZES); setSheet(null); }} />
          <Button full style={{ flex: 1 }} title="Done" onPress={() => { const problem = prizeProblem(prizes, capacityNumber); if (problem) toast({ tone: 'warn', message: problem }); else setSheet(null); }} />
        </View>}>
        <PrizeEditor clubSlug={club.data!.slug} value={prizes} onChange={setPrizes} />
        <Txt size={12} color="ink3" leading={1.5} style={{ marginTop: 20 }}>{`By publishing, ${club.data!.name} commits to these prizes and to delivering them to every listed country. Jump can remove competitions that break its rules.`}</Txt>
      </Sheet>}

      {clubExtras && <Sheet open={sheet === 'publish'} onOpenChange={(open) => setSheet(open ? 'publish' : null)} title="Publishing" description="When it opens, and whether it repeats."
        footer={<Button full title="Done" onPress={() => (errors.publishAt ? toast({ tone: 'warn', message: errors.publishAt }) : setSheet(null))} />}>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="When it opens">
          {([['now', 'Publish now', 'Opens as soon as you create it.'], ['schedule', 'Schedule', 'Opens at the time you pick.'], ['draft', 'Save as draft', 'Only your club’s managers see it.']] as const).map(([value, label, body]) => {
            const active = publish === value;
            return <Pressable key={value} onPress={() => { haptic(); setPublish(value); }} accessibilityRole="radio" accessibilityState={{ checked: active }} style={[styles.publish, active && { borderColor: colors.edge, backgroundColor: colors.ink }]}>
              <View style={[styles.radio, active && { borderColor: colors.paper }]}>{active ? <View style={styles.radioDot} /> : null}</View>
              <View style={{ flex: 1 }}>
                <Txt size={14} weight="bold" color={active ? 'paper' : 'ink'}>{label}</Txt>
                <Txt size={12.5} leading={1.35} style={{ color: active ? colors.onInkMuted : colors.ink2 }}>{body}</Txt>
              </View>
            </Pressable>;
          })}
        </View>
        {publish === 'schedule' && <View style={{ marginTop: 16 }}>
          <DateTimePicker label="Opens" value={publishAt} min={toLocalInput(new Date())} onChange={setPublishAt} />
          {errors.publishAt ? <Hint error>{errors.publishAt}</Hint> : null}
        </View>}
        <View style={{ marginTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 20 }}>
          <FieldLabel label="Repeat" />
          <View style={styles.repeat}>
            {([['none', 'Once'], ['weekly', 'Weekly'], ['monthly', 'Monthly']] as const).map(([value, label]) => <Pressable key={value} onPress={() => { haptic(); setRepeat(value); }} accessibilityRole="radio" accessibilityState={{ checked: repeat === value }}
              style={[styles.repeatOption, repeat === value && styles.repeatActive]}>
              <Txt size={14} weight="bold" color={repeat === value ? 'ink' : 'ink2'}>{label}</Txt>
            </Pressable>)}
          </View>
          {repeat !== 'none' && <>
            <View style={[styles.switchRow, styles.autoPublish]}>
              <View style={{ flex: 1 }}>
                <Txt size={14} weight="bold">Publish each new edition automatically</Txt>
                <Txt size={12.5} color="ink3">Otherwise each edition waits as a draft so you can change its theme and prizes first.</Txt>
              </View>
              <Switch value={autoPublish} onValueChange={setAutoPublish} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} />
            </View>
            <Txt size={12.5} color="ink3" leading={1.5} style={{ marginTop: 12 }}>Each edition copies these rules and prizes, with its own dates, leaderboard and winners. It’s created a week before it starts, and you manage the series from the club dashboard.</Txt>
            {errors.series ? <Hint error>{errors.series}</Hint> : null}
          </>}
        </View>
      </Sheet>}

      <OpponentPicker open={sheet === 'opponent'} onOpenChange={(open) => setSheet(open ? 'opponent' : null)} value={opponent} onChange={setOpponent} />

      <Sheet open={sheet === 'invites'} onOpenChange={(open) => setSheet(open ? 'invites' : null)} title="Invite runners"
        footer={<Button full title="Done" onPress={() => (errors.invites ? toast({ tone: 'warn', message: errors.invites }) : setSheet(null))} />}>
        <View style={{ gap: 16 }}>
          {club.data && <View style={styles.switchRow}><Txt size={14} weight="semibold" style={{ flex: 1 }}>Enter everyone in {club.data.name}</Txt><Switch value={inviteClubMembers} onValueChange={setInviteClubMembers} trackColor={{ true: colors.ink, false: colors.line }} thumbColor={colors.white} /></View>}
          <TextField label="Email addresses" optional hint="Separate with commas or new lines." multiline autoCapitalize="none" keyboardType="email-address" value={emailText} onChangeText={setEmailText} placeholder="runner@example.com" style={{ minHeight: 80 }} />
          <TextField label="Phone numbers" optional hint="With country code, e.g. +2348012345678. Text links are ready after you create it." multiline keyboardType="phone-pad" value={phoneText} onChangeText={setPhoneText} placeholder="+2348012345678" style={{ minHeight: 80 }} />
        </View>
      </Sheet>
    </Screen>
  </KeyboardAvoidingView>;
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return <Pressable onPress={() => { haptic(); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.toggle, on && { backgroundColor: colors.ink }]}>
    <Txt size={11} weight="bold" upper tracking={0.04} color={on ? 'paper' : 'ink'}>{label}</Txt>
  </Pressable>;
}

/** The reward preview uses the same integer rounding as settlement: leftover kobo goes to first place. */
function PrizeBreakdown({ potKobo, shares }: { potKobo: number; shares: number[] }) {
  if (potKobo < 100 || !shares.length || shares.reduce((sum, part) => sum + part, 0) !== 10000) return null;
  const split = prizeSplit(potKobo, 3500, 500);
  const allocations = shares.map((share) => Math.floor((split.winnerKobo * share) / 10000));
  allocations[0] += split.winnerKobo - allocations.reduce((sum, amount) => sum + amount, 0);
  const rows = [
    ...allocations.map((amount, index) => ({ label: `Place ${index + 1}`, value: amount, share: `${(shares[index] / 100).toFixed(2)}%`, strong: index === 0 })),
    { label: 'You earn as creator', value: split.creatorKobo, share: '5%', strong: false },
    { label: 'Jump fee', value: split.jumpKobo, share: '30%', strong: false },
  ];
  return <View style={styles.breakdown}>
    <Eyebrow style={{ marginBottom: 8 }}>When the competition ends</Eyebrow>
    {rows.map((row, index) => <View key={row.label} style={[styles.breakdownRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <Txt size={14} weight={row.strong ? 'bold' : 'regular'} color={row.strong ? 'ink' : 'ink2'}>{row.label} <Txt size={12} color="ink3">{row.share}</Txt></Txt>
      <Txt size={row.strong ? 18 : 14} weight={row.strong ? 'extrabold' : 'semibold'} num>{formatMoney(row.value)}</Txt>
    </View>)}
    <Txt size={12} color="ink3" style={{ marginTop: 8 }}>The card shows the winner reward pool after fees.</Txt>
  </View>;
}

/** A fixed prize: what the winners (or charity) get, Jump's fee on top, and the total the host pays. */
function FundingTotal({ prizeKobo, charity }: { prizeKobo: number; charity: boolean }) {
  if (prizeKobo < 1_000_000) return null;
  const { totalKobo, feeKobo } = fundingForPrize(prizeKobo);
  const rows = [
    { label: charity ? 'For the charity' : 'Prize for the winners', value: prizeKobo, strong: false },
    { label: 'Jump fee · 15%', value: feeKobo, strong: false },
    { label: 'You pay', value: totalKobo, strong: true },
  ];
  return <View style={styles.breakdown}>
    {rows.map((row, index) => <View key={row.label} style={[styles.breakdownRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <Txt size={14} weight={row.strong ? 'bold' : 'regular'} color={row.strong ? 'ink' : 'ink2'}>{row.label}</Txt>
      <Txt size={row.strong ? 18 : 14} weight={row.strong ? 'extrabold' : 'semibold'} num>{formatMoney(row.value)}</Txt>
    </View>)}
    {!charity && <Txt size={12} color="ink3" style={{ marginTop: 8 }}>Your percentages split the full prize between eligible winners.</Txt>}
  </View>;
}

const styles = StyleSheet.create({
  bannerPreview: { width: '100%', aspectRatio: 2, borderRadius: radius.lg, backgroundColor: colors.inkWash },
  bannerPick: { borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, padding: 18, alignItems: 'center', gap: 4 },
  mode: { minHeight: 92, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, padding: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggle: { height: 36, justifyContent: 'center', borderRadius: radius.base, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingHorizontal: 12 },
  format: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, padding: 14 },
  publish: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, padding: 14 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(18,18,18,0.3)', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.paper },
  repeat: { flexDirection: 'row', borderRadius: radius.xl, backgroundColor: colors.inkWash, padding: 4 },
  repeatOption: { flex: 1, height: 40, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  repeatActive: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.edge },
  autoPublish: { marginTop: 16, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 14 },
  breakdown: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, padding: 16 },
  breakdownRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, paddingVertical: 8 },
});
