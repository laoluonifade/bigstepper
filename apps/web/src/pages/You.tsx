import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon, BellIcon, CheckIcon, JumpLogo, LockIcon, LogoutIcon, RunIcon, ShieldIcon } from '../components/icons';
import { AvatarEditor, ConnectionList, FollowButton, ProfileHero, ProfileStats, ProfileTabs, ShareProfileButton } from '../components/Profile';
import { BankPicker } from '../components/BankPicker';
import {
  Avatar,
  CopyButton,
  cx,
  CountUp,
  EmptyState,
  ErrorNotice,
  Field,
  KeyValue,
  Loading,
  Notice,
  PageHeader,
  SectionTitle,
  Segmented,
  Skeleton,
  SubNav,
} from '../components/ui';
import { api, isApiError, patch, post } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { AWARD_STATUS } from '../lib/copy';
import { activityName, formatDate, formatDistanceNumber, formatDuration, formatMoney, formatNairaInput, formatPace, formatRelative, formatSpeed, nairaInputToKobo, shortId } from '../lib/format';
import { profileStats } from '../lib/progress';
import { useStored } from '../lib/local';
import { keys, useActivities, useCreator, useCreatorEarnings, useNotifications, useOpenNotification, useProfile, useStaffAccess, useUnit, useWallet, useWalletTransactions } from '../lib/queries';
import { savePayment } from '../lib/payments';
import type { CheckoutResponse, CreatorProfile, PayoutRecipient, PrizeAward, Profile, PublicProfile, Unit, Visibility } from '../lib/types';
import { COUNTRIES } from '../lib/countries';

export const YOU_NAV = [
  { to: '/settings/profile', label: 'Profile' },
  { to: '/activities', label: 'Activity' },
  { to: '/runners', label: 'Find runners' },
  { to: '/leagues', label: 'League' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/rewards', label: 'Rewards' },
  { to: '/creator', label: 'Creator' },
  { to: '/notifications', label: 'Notifications' },
] as const;

const VISIBILITY: Array<{ value: Visibility; title: string; body: string }> = [
  { value: 'private', title: 'Private', body: 'Only you see your individual activities.' },
  { value: 'followers', title: 'Followers', body: 'Followers see your individual activities.' },
  { value: 'public', title: 'Public', body: 'Anyone can see your individual activities.' },
];

export function ProfileSettingsPage() {
  const user = useUser();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const activities = useActivities();
  const unit = useUnit();
  const { isStaff } = useStaffAccess();
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const merged = { ...profile.data, ...draft } as Profile;
  const stats = useMemo(() => profileStats(activities.data ?? []), [activities.data]);
  // Follower counts come from the public profile.
  const social = useQuery({
    queryKey: ['runner', profile.data?.username ?? ''],
    queryFn: () => api<PublicProfile>(`/users/${encodeURIComponent(profile.data!.username)}`),
    enabled: Boolean(profile.data?.username),
  });

  const save = useMutation({
    mutationFn: (changes: Partial<Profile>) => patch<Profile>('/me', changes),
    onSuccess(updated) {
      queryClient.setQueryData(keys.profile, updated);
      setDraft({});
      // Your name and handle also appear on leaderboards and member lists.
      void queryClient.invalidateQueries({ predicate: (query) => ['standings', 'result', 'leagues', 'club', 'runner'].includes(String(query.queryKey[0])) });
    },
  });

  const { isSuccess: saved, reset: resetSave } = save;
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => resetSave(), 2500);
    return () => window.clearTimeout(timer);
  }, [saved, resetSave]);

  const changes = useMemo(() => {
    if (!profile.data) return {};
    const next: Partial<Profile> = { ...draft };
    if (next.displayName !== undefined) next.displayName = next.displayName.trim();
    if (next.bio !== undefined) next.bio = next.bio?.trim() || null;
    return Object.fromEntries(Object.entries(next).filter(([key, value]) => (profile.data![key as keyof Profile] ?? null) !== (value ?? null))) as Partial<Profile>;
  }, [draft, profile.data]);
  const dirty = Object.keys(changes).length > 0;
  const usernameError =
    draft.username !== undefined && !/^[a-z0-9_]{2,30}$/.test(draft.username) ? '2–30 characters: lowercase letters, numbers and underscores.' : undefined;
  const nameError = draft.displayName !== undefined && !draft.displayName.trim() ? 'Your name can’t be empty.' : undefined;
  const weightError = draft.weightKg !== undefined && draft.weightKg !== null &&
    (!Number.isFinite(draft.weightKg) || draft.weightKg < 20 || draft.weightKg > 300 || !Number.isInteger(draft.weightKg * 10))
    ? 'Enter a weight from 20 to 300 kg, to one decimal place.' : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty || usernameError || nameError || weightError) return;
    save.mutate(changes);
  }

  if (profile.isLoading) return <Loading />;
  if (profile.error || !profile.data) return <ErrorNotice error={profile.error} onRetry={() => void profile.refetch()} />;

  const countryKnown = COUNTRIES.some(([code]) => code === merged.countryCode);
  const bioLength = (merged.bio ?? '').length;

  return (
    <div className="animate-rise">
      <SubNav items={[...YOU_NAV]} />

      <ProfileHero
        avatar={<AvatarEditor profile={profile.data} />}
        displayName={profile.data.displayName}
        username={profile.data.username}
        meta={
          <>
            {countryName(profile.data.countryCode)} · Joined {formatDate(profile.data.createdAt, { month: 'short', year: 'numeric' })}
          </>
        }
        bio={profile.data.bio ?? <span className="text-ink-3">Add a short bio below: what you train for, your club, your goal.</span>}
        counts={{ activities: stats.activities, followers: social.data?.followers ?? 0, following: social.data?.following ?? 0 }}
        actions={
          <>
            <Link to="/runners/$username" params={{ username: profile.data.username }} search={{}} className="btn-secondary btn-sm flex-1">
              View as others
            </Link>
            <ShareProfileButton username={profile.data.username} displayName={profile.data.displayName} iconOnly />
          </>
        }
      >
        {activities.isLoading ? <Skeleton className="mt-5 h-20" /> : <ProfileStats stats={stats} unit={unit} />}
        <Link to="/activities" className="link mt-3 inline-block text-[13px]">View your activity and calendar →</Link>
        <p className="mt-3 text-[12px] text-ink-3">
          Your verified totals and run/walk split are public. {profile.data.activityVisibility === 'public'
            ? 'Anyone can also see your recent activities.'
            : profile.data.activityVisibility === 'followers'
              ? 'Only followers can see your recent activities.'
              : 'Only you can see your recent activities.'}
        </p>
      </ProfileHero>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={submit} className="space-y-6">
          <SectionTitle>Edit profile</SectionTitle>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Display name" error={nameError} hint="Shown on leaderboards.">
              {(props) => (
                <input
                  {...props}
                  className="field"
                  maxLength={80}
                  value={merged.displayName ?? ''}
                  onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                />
              )}
            </Field>
            <Field label="Username" error={usernameError} hint="Your profile link.">
              {(props) => (
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">@</span>
                  <input
                    {...props}
                    className="field pl-8"
                    maxLength={30}
                    autoCapitalize="none"
                    spellCheck={false}
                    value={merged.username ?? ''}
                    onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value.toLowerCase() }))}
                  />
                </div>
              )}
            </Field>
          </div>

          <Field label="Bio" hint={`${bioLength}/160`}>
            {(props) => (
              <textarea
                {...props}
                className="field min-h-[88px] resize-y py-3"
                maxLength={160}
                rows={3}
                placeholder="Chasing a sub-25 5K. Lagos Road Runners."
                value={merged.bio ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
              />
            )}
          </Field>

          <div>
            <p className="label">Distance units</p>
            <Segmented<Unit>
              label="Distance units"
              value={merged.preferredUnit}
              onChange={(value) => setDraft((current) => ({ ...current, preferredUnit: value }))}
              options={[
                { value: 'km', label: 'Kilometres' },
                { value: 'mi', label: 'Miles' },
              ]}
            />
          </div>

          <Field label="Body weight · kg" optional error={weightError} hint="Private. Used only to estimate calories on your activities; not shown on your public profile.">
            {(props) => <input {...props} className="field num" type="number" inputMode="decimal" min="20" max="300" step="0.1" value={merged.weightKg ?? ''} onChange={(event) => setDraft((current) => ({ ...current, weightKg: event.target.value === '' ? null : Number(event.target.value) }))} />}
          </Field>

          <fieldset id="email-preferences" className="space-y-3 border-t border-line pt-5">
            <legend className="label">Email updates</legend>
            <label className="flex items-start gap-3 text-[13px]"><input type="checkbox" className="mt-0.5" checked={merged.emailActivityEnabled} onChange={(event) => setDraft((current) => ({ ...current, emailActivityEnabled: event.target.checked }))} /><span><strong className="block">Activity and people</strong>Messages, follows, Rant interactions, competition progress and results.</span></label>
            <label className="flex items-start gap-3 text-[13px]"><input type="checkbox" className="mt-0.5" checked={merged.emailDigestEnabled} onChange={(event) => setDraft((current) => ({ ...current, emailDigestEnabled: event.target.checked }))} /><span><strong className="block">Competition picks</strong>Popular open competitions every three days.</span></label>
            <p className="text-[12px] text-ink-3">Account-security and payment emails are separate from these choices.</p>
          </fieldset>

          <fieldset>
            <legend className="label">Who can see your runs</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {VISIBILITY.map((option) => {
                const active = merged.activityVisibility === option.value;
                return (
                  <label
                    key={option.value}
                    className={cx(
                      'cursor-pointer rounded-md border-[1.5px] p-3.5 transition-colors',
                      active ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:border-ink-3',
                    )}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      className="sr-only"
                      checked={active}
                      onChange={() => setDraft((current) => ({ ...current, activityVisibility: option.value }))}
                    />
                    <span className="wide block text-[13px] font-extrabold uppercase">{option.title}</span>
                    <span className={cx('mt-1 block text-[12px] leading-snug', active ? 'text-paper/70' : 'text-ink-2')}>{option.body}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Field label="Country of residence">
            {(props) => (
              <select
                {...props}
                className="field"
                value={merged.countryCode}
                onChange={(event) => setDraft((current) => ({ ...current, countryCode: event.target.value }))}
              >
                {!countryKnown && <option value={merged.countryCode}>{merged.countryCode}</option>}
                {COUNTRIES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <ErrorNotice error={save.error} />
          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+76px)] z-10 -mx-4 flex items-center gap-4 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:pt-6 md:backdrop-blur-none">
            <button className="btn-primary" disabled={!dirty || save.isPending || Boolean(usernameError) || Boolean(nameError) || Boolean(weightError)}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
            {save.isSuccess && (
              <span className="flex items-center gap-1 text-[13px] font-semibold text-ok">
                <CheckIcon size={15} /> Saved
              </span>
            )}
            {dirty && !save.isPending && (
              <button type="button" className="text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={() => setDraft({})}>
                Discard
              </button>
            )}
          </div>
        </form>

        <aside className="space-y-8">
          <section>
            <SectionTitle>Account</SectionTitle>
            <KeyValue
              items={[
                { label: 'Email', value: <span className="break-all">{user.email}</span> },
                { label: 'Member since', value: formatDate(profile.data.createdAt, { year: 'numeric' }) },
              ]}
            />
            <div className="mt-4 rounded-md border border-line bg-card p-4">
              <p className="eyebrow">Your runner handle</p>
              <p className="wide mt-1 break-all text-[18px] font-extrabold">@{profile.data.username}</p>
              <p className="hint">Club admins add you to a club with this.</p>
              <CopyButton value={`@${profile.data.username}`} label="Copy handle" className="mt-3" />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {user.emailVerified ? (
                <p className="btn-quiet pointer-events-none justify-between text-ok">
                  Email verified <CheckIcon size={16} />
                </p>
              ) : (
                <Link to="/verify-email" className="btn-quiet justify-between">
                  Verify email <ArrowRightIcon size={16} />
                </Link>
              )}
              <Link to="/forgot-password" className="btn-quiet justify-between">
                Change password <ArrowRightIcon size={16} />
              </Link>
            </div>
          </section>

          {isStaff && (
            <section>
              <SectionTitle>Staff tools</SectionTitle>
              <div className="flex flex-col gap-2">
                <Link to="/admin/creators" className="btn-quiet justify-between">
                  <span className="flex items-center gap-2">
                    <ShieldIcon size={16} /> Creator approvals
                  </span>
                  <ArrowRightIcon size={16} />
                </Link>
                <Link to="/admin/payouts" className="btn-quiet justify-between">
                  Payouts <ArrowRightIcon size={16} />
                </Link>
              </div>
            </section>
          )}

          <button type="button" className="btn-danger w-full" onClick={() => void logout()}>
            <LogoutIcon size={16} /> Log out
          </button>
        </aside>
      </div>
    </div>
  );
}

function countryName(code: string) {
  return COUNTRIES.find(([value]) => value === code)?.[1] ?? code;
}

/** Live list from Paystack via the API, so payouts never offer a closed bank. */
function useBanks() {
  return useQuery({ queryKey: ['banks'], queryFn: () => api<Array<{ code: string; name: string }>>('/banks'), staleTime: 12 * 60 * 60_000 });
}

type SavedRecipient = Pick<PayoutRecipient, 'accountName' | 'bankCode' | 'accountLast4'> & { availableForPayoutAt?: string };

export function RewardsPage() {
  const banks = useBanks();
  const user = useUser();
  const queryClient = useQueryClient();
  const rewards = useQuery({ queryKey: keys.rewards, queryFn: () => api<PrizeAward[]>('/me/rewards') });
  // Only the masked summary the API returns is kept — never the full account number.
  const [recipient, setRecipient] = useStored<SavedRecipient | null>(`jump_recipient:${user.id}`, null);
  const [editing, setEditing] = useState(false);
  const list = rewards.data ?? [];
  const total = list.reduce((sum, award) => sum + Number(award.amountKobo), 0);
  const paid = list.filter((award) => award.status === 'PAID').reduce((sum, award) => sum + Number(award.amountKobo), 0);

  const requestPayout = useMutation({
    mutationFn: (awardId: string) => post(`/me/rewards/${awardId}/payout`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.rewards }),
  });

  return (
    <div className="animate-rise">
      <SubNav items={[...YOU_NAV]} />
      <PageHeader eyebrow="You" title="Rewards" description="Prizes from paid competitions you’ve won. Free competitions are for glory." />

      <div className="panel-strong mb-8 grid grid-cols-2 divide-x divide-line">
        <div className="p-5">
          <p className="eyebrow">Total won</p>
          <p className="score mt-2 text-[36px] sm:text-[44px]">{rewards.isLoading ? '–' : <CountUp value={total} format={(k) => formatMoney(Math.round(k))} />}</p>
        </div>
        <div className="p-5">
          <p className="eyebrow">Paid out</p>
          <p className="score mt-2 text-[36px] sm:text-[44px]">{rewards.isLoading ? '–' : <CountUp value={paid} format={(k) => formatMoney(Math.round(k))} />}</p>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <SectionTitle>Prizes</SectionTitle>
          <ErrorNotice error={rewards.error} onRetry={() => void rewards.refetch()} />
          {requestPayout.error && (
            <div className="mb-4">
              {isApiError(requestPayout.error, 503) ? (
                <Notice tone="warn" title="Payouts are switched off">
                  Prize payouts aren’t enabled yet. Your prize is safe and will be claimable once they are.
                </Notice>
              ) : isApiError(requestPayout.error, 409) ? (
                <Notice tone="neutral">A payout was already requested for this prize, or it isn’t claimable. Add payout details first if you haven’t.</Notice>
              ) : (
                <ErrorNotice error={requestPayout.error} />
              )}
            </div>
          )}
          {rewards.isLoading ? (
            <Skeleton className="h-24" />
          ) : list.length === 0 ? (
            <EmptyState mark="₦0" title="No prizes yet">
              Place in a paid or funded free competition and your prize shows up here.
            </EmptyState>
          ) : (
            <ul className="stagger space-y-3">
              {list.map((award) => {
                const claimable = award.status === 'PENDING_APPROVAL';
                return (
                  <li key={award.id} className="flex flex-wrap items-center gap-4 rounded-md border-[1.5px] border-ink bg-card p-4">
                    <div className="min-w-0 flex-1">
                      <p className="score text-[30px]">{formatMoney(award.amountKobo)}</p>
                      <p className="mt-1 text-[12px] text-ink-2">
                        Place {award.place ?? 1} · Competition {shortId(award.tableId)} · {formatDate(award.createdAt, { year: 'numeric' })}
                      </p>
                    </div>
                    <span className={cx('tag', award.status === 'PAID' ? 'border-ok/60 bg-ok-wash text-ok' : award.status === 'FAILED' || award.status === 'REVERSED' ? 'border-bad/60 bg-bad-wash text-bad' : 'border-ink bg-card')}>
                      {AWARD_STATUS[award.status] ?? award.status}
                    </span>
                    {claimable && (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={!recipient || requestPayout.isPending}
                        title={recipient ? undefined : 'Add payout details first'}
                        onClick={() => requestPayout.mutate(award.id)}
                      >
                        {requestPayout.isPending && requestPayout.variables === award.id ? 'Requesting…' : 'Request payout'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {requestPayout.isSuccess && (
            <Notice tone="ok" className="mt-4" title="Payout requested">
              Jump reviews every payout before sending it. You’ll get a notification when it’s on its way.
            </Notice>
          )}
        </section>

        <section>
          <SectionTitle>Payout details</SectionTitle>
          {recipient && !editing ? (
            <div className="rounded-md border border-line bg-card p-4">
              <p className="text-[15px] font-bold">{recipient.accountName}</p>
              <p className="num mt-1 text-[13px] text-ink-2">
                {banks.data?.find((bank) => bank.code === recipient.bankCode)?.name ?? `Bank ${recipient.bankCode}`} · •••• {recipient.accountLast4}
              </p>
              {recipient.availableForPayoutAt && new Date(recipient.availableForPayoutAt) > new Date() && (
                <p className="mt-3 text-[12px] font-semibold text-warn">Security hold until {formatDate(recipient.availableForPayoutAt, { year: 'numeric' })}</p>
              )}
              <button type="button" className="btn-quiet btn-sm mt-4" onClick={() => setEditing(true)}>
                Replace account
              </button>
            </div>
          ) : (
            <RecipientForm
              onSaved={(saved) => {
                setRecipient({ accountName: saved.accountName, bankCode: saved.bankCode, accountLast4: saved.accountLast4, availableForPayoutAt: saved.availableForPayoutAt });
                setEditing(false);
              }}
              onCancel={recipient ? () => setEditing(false) : undefined}
            />
          )}
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
            We only keep the account name, bank and last four digits. Jump reviews and approves every payout before it’s sent.
          </p>
        </section>
      </div>
    </div>
  );
}

function RecipientForm({ onSaved, onCancel }: { onSaved: (recipient: PayoutRecipient) => void; onCancel?: () => void }) {
  const banks = useBanks();
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [password, setPassword] = useState('');
  const complete = /^\d{10}$/.test(accountNumber) && bankCode.length > 0;
  // The bank tells us the account holder's name; the runner confirms it rather than typing it.
  const resolved = useQuery({
    queryKey: ['resolve-account', bankCode, accountNumber],
    queryFn: () =>
      api<{ accountName: string; bankName: string }>(
        `/banks/resolve?accountNumber=${encodeURIComponent(accountNumber)}&bankCode=${encodeURIComponent(bankCode)}`,
      ),
    enabled: complete,
    retry: false,
    staleTime: Infinity,
  });
  const save = useMutation({
    mutationFn: () => post<PayoutRecipient>('/me/payout-recipient', { accountNumber, bankCode, password }),
    onSuccess(saved) {
      setAccountNumber('');
      setPassword('');
      onSaved(saved);
    },
    onError() {
      setPassword('');
    },
  });
  const numberError = accountNumber.length > 0 && accountNumber.length < 10 ? `${10 - accountNumber.length} more digits. Account numbers are 10 digits.` : undefined;
  const valid = complete && Boolean(resolved.data) && password.length >= 8;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <Field label="Bank">
        {(props) => <BankPicker {...props} banks={banks.data ?? []} loading={banks.isLoading} value={bankCode} onChange={setBankCode} />}
      </Field>
      {banks.isError && <ErrorNotice error={banks.error} onRetry={() => void banks.refetch()} />}
      <Field label="Account number" error={numberError}>
        {(props) => (
          <input
            {...props}
            className="field num font-mono tracking-[0.12em]"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ''))}
            required
          />
        )}
      </Field>

      {complete && (
        <div aria-live="polite">
          {resolved.isLoading ? (
            <div className="flex items-center gap-3 rounded-md border border-line bg-card px-4 py-3 text-[14px] text-ink-2">
              <JumpLogo height={12} motion="loop" /> Checking account…
            </div>
          ) : resolved.data ? (
            <div className="flex animate-pop items-center gap-3 rounded-md border-[1.5px] border-ok/60 bg-ok-wash px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-ok text-white">
                <CheckIcon size={16} />
              </span>
              <div className="min-w-0">
                <p className="eyebrow text-ok">Account name</p>
                <p className="truncate text-[15px] font-bold">{resolved.data.accountName}</p>
              </div>
            </div>
          ) : (
            <ErrorNotice error={resolved.error} />
          )}
        </div>
      )}

      <Field label="Current password" hint="Required to protect bank-detail changes.">
        {(props) => <input {...props} className="field" type="password" autoComplete="current-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />}
      </Field>
      {save.error &&
        (isApiError(save.error, 503) ? (
          <Notice tone="warn" title="Payouts are switched off">
            You can’t add payout details until prize payouts are enabled.
          </Notice>
        ) : (
          <ErrorNotice error={save.error} />
        ))}
      <div className="flex gap-2">
        <button className="btn-secondary" disabled={!valid || save.isPending}>
          {save.isPending ? 'Saving…' : resolved.data ? 'Save this account' : 'Save account'}
        </button>
        {onCancel && (
          <button type="button" className="btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function WalletPage() {
  const wallet = useWallet();
  const transactions = useWalletTransactions();
  const [amount, setAmount] = useState('');
  const amountKobo = nairaInputToKobo(amount);
  const fund = useMutation({
    mutationFn: () => post<CheckoutResponse>('/wallet/fund', { amountKobo }),
    onSuccess(response) {
      savePayment({
        reference: response.reference,
        purpose: 'WALLET_FUNDING',
        tableTitle: 'Wallet funding',
        amountKobo,
        createdAt: new Date().toISOString(),
      });
      window.location.assign(response.authorizationUrl);
    },
  });

  return (
    <div className="animate-rise">
      <SubNav items={[...YOU_NAV]} />
      <PageHeader eyebrow="You" title="Wallet" description="Fund entries once and use your balance for paid competitions." />
      <Notice tone="neutral" className="mb-6" title="Closed-loop balance">
        Wallet funding cannot be withdrawn or transferred back. It can only be used for eligible Jump competition entries.
      </Notice>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <SectionTitle>Transactions</SectionTitle>
          <ErrorNotice error={transactions.error} onRetry={() => void transactions.refetch()} />
          {transactions.isLoading ? (
            <Skeleton className="h-36" />
          ) : (transactions.data ?? []).length === 0 ? (
            <EmptyState mark="₦0" title="No wallet activity">Fund your wallet to see transactions here.</EmptyState>
          ) : (
            <ul className="stagger divide-y divide-line border-y border-line">
              {(transactions.data ?? []).map((item) => (
                <li key={item.id} className="flex items-center gap-4 px-2 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold">{item.description}</p>
                    <p className="mt-1 text-[12px] text-ink-3">{formatDate(item.createdAt, { year: 'numeric' })} · balance {formatMoney(item.balanceAfterKobo)}</p>
                  </div>
                  <p className={cx('score text-[24px]', Number(item.amountKobo) < 0 ? 'text-bad' : 'text-ok')}>
                    {Number(item.amountKobo) > 0 ? '+' : '−'}{formatMoney(Math.abs(Number(item.amountKobo)))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          <SectionTitle>Balance</SectionTitle>
          <div className="panel-strong p-5">
            <p className="eyebrow">Available for entries</p>
            <p className="score mt-2 text-[48px]">{wallet.isLoading ? '–' : <CountUp value={Number(wallet.data?.balanceKobo ?? 0)} format={(k) => formatMoney(Math.round(k))} />}</p>
            <form
              className="mt-6 space-y-4 border-t border-line pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (amountKobo >= 10_000) fund.mutate();
              }}
            >
              <Field label="Amount to fund" hint="Minimum ₦100.">
                {(props) => (
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold">₦</span>
                    <input {...props} className="field pl-8 num" type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(formatNairaInput(event.target.value))} />
                  </div>
                )}
              </Field>
              <button className="btn-primary w-full" disabled={fund.isPending || amountKobo < 10_000}>
                {fund.isPending ? 'Opening Paystack…' : 'Fund wallet'}
              </button>
              {fund.error && <ErrorNotice error={fund.error} />}
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function CreatorPage() {
  const queryClient = useQueryClient();
  const creator = useCreator();
  const earnings = useCreatorEarnings(Boolean(creator.data));
  const [creatorType, setCreatorType] = useState<CreatorProfile['creatorType']>('influencer');
  const [displayName, setDisplayName] = useState('');
  const [socialUrl, setSocialUrl] = useState('');
  const [bio, setBio] = useState('');
  const signup = useMutation({
    mutationFn: () => post<CreatorProfile>('/creators/signup', {
      creatorType,
      displayName: displayName.trim(),
      ...(socialUrl.trim() ? { socialUrl: socialUrl.trim() } : {}),
      ...(bio.trim() ? { bio: bio.trim() } : {}),
    }),
    onSuccess(profile) {
      queryClient.setQueryData(keys.creator, profile);
    },
  });
  const payout = useMutation({
    mutationFn: (earningId: string) => post(`/creators/me/earnings/${earningId}/payout`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.creatorEarnings }),
  });

  if (creator.isLoading) return <Loading />;
  return (
    <div className="animate-rise">
      <SubNav items={[...YOU_NAV]} />
      <PageHeader eyebrow="You" title="Creator" description="Create paid competitions for your audience and earn 5% when they settle." />
      {!creator.data ? (
        <form
          className="panel-strong max-w-2xl space-y-5 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (displayName.trim().length >= 2) signup.mutate();
          }}
        >
          <SectionTitle>Creator signup</SectionTitle>
          <Field label="Creator type">
            {(props) => (
              <select {...props} className="field" value={creatorType} onChange={(event) => setCreatorType(event.target.value as CreatorProfile['creatorType'])}>
                <option value="influencer">Influencer</option>
                <option value="community_manager">Community manager</option>
                <option value="run_club">Run club</option>
                <option value="other">Other</option>
              </select>
            )}
          </Field>
          <Field label="Display name">
            {(props) => <input {...props} className="field" minLength={2} maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />}
          </Field>
          <Field label="Social or community URL" optional>
            {(props) => <input {...props} className="field" type="url" placeholder="https://" value={socialUrl} onChange={(event) => setSocialUrl(event.target.value)} />}
          </Field>
          <Field label="About" optional>
            {(props) => <textarea {...props} className="field min-h-28" maxLength={500} value={bio} onChange={(event) => setBio(event.target.value)} />}
          </Field>
          <Notice tone="neutral">Creator competitions use a 35% total deduction: Jump keeps 30%, the creator earns 5%, and the winner receives 65%.</Notice>
          <ErrorNotice error={signup.error} />
          <p className="text-[13px] text-ink-2">Jump reviews every creator application before you can host paid competitions.</p>
          <button className="btn-primary" disabled={signup.isPending || displayName.trim().length < 2}>{signup.isPending ? 'Sending…' : 'Apply to be a creator'}</button>
        </form>
      ) : (
        <>
        {creator.data.status === 'PENDING' && (
          <Notice tone="info" className="mb-8" title="Waiting for approval">
            Jump reviews every new creator before they can host paid competitions. You’ll get a notification once you’re approved. Free competitions work in the meantime.
          </Notice>
        )}
        {creator.data.status === 'SUSPENDED' && (
          <Notice tone="warn" className="mb-8" title="Creator account suspended">
            You can’t host new paid competitions right now. Contact Jump support if you think this is a mistake.
          </Notice>
        )}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section>
            <SectionTitle>Earnings</SectionTitle>
            <ErrorNotice error={earnings.error} onRetry={() => void earnings.refetch()} />
            {(earnings.data ?? []).length === 0 ? (
              <EmptyState mark="5%" title="No creator earnings yet" action={<Link to="/competitions/new" className="btn-primary">Create a competition</Link>}>
                Earnings appear after one of your paid competitions settles.
              </EmptyState>
            ) : (
              <ul className="stagger space-y-3">
                {(earnings.data ?? []).map((earning) => (
                  <li key={earning.id} className="flex flex-wrap items-center gap-4 rounded-md border-[1.5px] border-ink bg-card p-4">
                    <div className="min-w-0 flex-1">
                      <p className="score text-[30px]">{formatMoney(earning.amountKobo)}</p>
                      <p className="mt-1 text-[12px] text-ink-2">5% of {formatMoney(earning.grossPrizeKobo)} · {formatDate(earning.createdAt, { year: 'numeric' })}</p>
                    </div>
                    <span className="tag border-ink bg-card">{earning.status}</span>
                    {earning.status === 'EARNED' && <button className="btn-primary btn-sm" disabled={payout.isPending} onClick={() => payout.mutate(earning.id)}>Request payout</button>}
                  </li>
                ))}
              </ul>
            )}
            {payout.error && <div className="mt-4"><ErrorNotice error={payout.error} /></div>}
          </section>
          <aside>
            <SectionTitle>Creator account</SectionTitle>
            <div className="panel p-5">
              <p className="text-[18px] font-bold">{creator.data.displayName}</p>
              <p className="mt-1 text-[13px] capitalize text-ink-2">
                {creator.data.creatorType.replace('_', ' ')} · {creator.data.status === 'ACTIVE' ? 'approved' : creator.data.status === 'PENDING' ? 'awaiting approval' : 'suspended'}
              </p>
              {creator.data.bio && <p className="mt-4 text-[13px] leading-relaxed text-ink-2">{creator.data.bio}</p>}
              {creator.data.status === 'ACTIVE' && <Link to="/competitions/new" className="btn-secondary mt-5 w-full">Create paid competition</Link>}
              <Link to="/rewards" className="btn-quiet mt-2 w-full">Manage payout account</Link>
            </div>
          </aside>
        </div>
        </>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const notifications = useNotifications();
  const { markRead, open } = useOpenNotification();
  const list = notifications.data ?? [];
  const unread = list.filter((item) => !item.readAt);

  return (
    <div className="animate-rise">
      <SubNav items={[...YOU_NAV]} />
      <PageHeader
        eyebrow="You"
        title="Notifications"
        actions={
          unread.length > 0 && (
            <button type="button" className="btn-quiet btn-sm" onClick={() => unread.forEach((item) => markRead.mutate(item.id))}>
              Mark all read
            </button>
          )
        }
      />
      <ErrorNotice error={notifications.error} onRetry={() => void notifications.refetch()} />
      {notifications.isLoading ? (
        <Skeleton className="h-40" />
      ) : list.length === 0 ? (
        <EmptyState mark={<BellIcon size={40} className="mx-auto" />} title="All quiet">
          Updates about your runs and competitions will land here.
        </EmptyState>
      ) : (
        <ul className="stagger divide-y divide-line border-y border-line">
          {list.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cx('flex w-full gap-4 px-2 py-4 text-left hover:bg-ink/[0.025]', !item.readAt && 'bg-card')}
                onClick={() => open(item)}
              >
                <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm', item.readAt ? 'bg-transparent' : 'bg-track')} aria-label={item.readAt ? undefined : 'Unread'} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-[15px]', item.readAt ? 'font-medium text-ink-2' : 'font-bold')}>{item.title}</span>
                  <span className="mt-0.5 block text-[14px] leading-relaxed text-ink-2">{item.body}</span>
                  <span className="mt-1 block text-[12px] text-ink-3">{formatRelative(item.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RunnerPage() {
  const { username } = useParams({ strict: false }) as { username: string };
  const { user } = useAuth();
  const { tab = 'activity' } = useSearch({ strict: false }) as { tab?: 'followers' | 'following' | 'activity' };
  const navigate = useNavigate();
  const unit = useUnit();
  const runner = useQuery({ queryKey: ['runner', username.toLowerCase()], queryFn: () => api<PublicProfile>(`/users/${encodeURIComponent(username)}`) });
  if (runner.isLoading) return <Loading />;
  if (runner.error || !runner.data) {
    return isApiError(runner.error, 404) ? (
      <EmptyState title="Runner not found">There’s no runner called @{username}.</EmptyState>
    ) : (
      <ErrorNotice error={runner.error} onRetry={() => void runner.refetch()} />
    );
  }
  const data = runner.data;
  const isMe = data.isMe;
  return (
    <div className="animate-rise">
      {isMe && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-ink px-4 py-2.5 text-paper">
          <p className="text-[13px] font-semibold">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-volt align-middle" />
            Preview: how other runners see you
          </p>
          <Link to="/settings/profile" className="shrink-0 text-[12px] font-bold uppercase tracking-[0.06em] text-volt hover:underline hover:underline-offset-4">
            Done
          </Link>
        </div>
      )}
      <ProfileHero
        avatar={<Avatar name={data.displayName} src={data.avatarUrl} highlight size={84} className="rounded-lg" />}
        displayName={data.displayName}
        username={data.username}
        meta={
          <>
            {countryName(data.countryCode)} · Joined {formatDate(data.memberSince, { month: 'short', year: 'numeric' })}
          </>
        }
        bio={data.bio}
        counts={{ activities: data.stats.activities, followers: data.followers, following: data.following }}
        actions={
          <>
            <FollowButton username={data.username} following={data.followedByMe} size="sm" preview={isMe} className="min-w-[calc(50%-0.25rem)] flex-1 sm:min-w-0" />
            {!isMe && user && <Link to="/messages/$username" params={{ username: data.username }} className="btn-secondary btn-sm min-w-[calc(50%-0.25rem)] flex-1 sm:min-w-0">Message</Link>}
            {!isMe && <RunnerChallengeInvite username={data.username} />}
            <ShareProfileButton username={data.username} displayName={data.displayName} iconOnly />
          </>
        }
      >
        {data.followsMe && !isMe && <p className="mt-3 text-[12px] font-semibold text-ink-2">Follows you</p>}
        <ProfileStats stats={data.stats} unit={unit} />
      </ProfileHero>

      <div className="mb-5 mt-6">
        <ProfileTabs<'activity' | 'followers' | 'following'>
          value={tab}
          onChange={(next) => void navigate({ to: '/runners/$username', params: { username: data.username }, search: next === 'activity' ? {} : { tab: next }, replace: true })}
          tabs={[
            { value: 'activity', label: 'Activity' },
            { value: 'followers', label: 'Followers' },
            { value: 'following', label: 'Following' },
          ]}
        />
      </div>

      {tab !== 'activity' ? (
        <ConnectionList key={tab} username={data.username} direction={tab} />
      ) : !data.runsVisible ? (
        <EmptyState mark={<LockIcon size={36} className="mx-auto" />} title="Activity is private">
          {data.followedByMe
            ? `${data.displayName.split(' ')[0]} hasn’t shared individual walks and runs.`
            : 'Their verified totals are public, but individual walks and runs are not shared with you.'}
        </EmptyState>
      ) : data.recent && (
        <section>
          {data.recent.length === 0 ? (
            <EmptyState title="No verified activity yet">Verified walks and runs will show here.</EmptyState>
          ) : (
            <ul className="stagger divide-y divide-line border-y border-line">
              {data.recent.map((item, index) => {
                const pace = item.activityType === 'cycle' ? formatSpeed(item.metres, item.movingSeconds, unit) : formatPace(item.metres, item.movingSeconds, unit);
                return (
                  <li key={index} className="flex items-center gap-4 px-1 py-3.5 sm:px-3">
                    <span
                      className={cx(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
                        item.activityType === 'run' ? 'bg-track text-paper' : 'bg-ink text-volt',
                      )}
                      aria-hidden="true"
                    >
                      <RunIcon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold">{activityName(item.startedAt, item.activityType)}</p>
                      <p className="num text-[12px] text-ink-2">
                        {formatRelative(item.startedAt)} · {formatDuration(item.movingSeconds)}
                        {pace && ` · ${pace}${item.activityType === 'cycle' ? '' : ` /${unit}`}`}
                      </p>
                    </div>
                    <p className="flex items-baseline gap-1">
                      <span className="score num text-[24px]">{formatDistanceNumber(item.metres, unit)}</span>
                      <span className="text-[12px] font-semibold text-ink-2">{unit}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function RunnerChallengeInvite({ username }: { username: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tableId, setTableId] = useState('');
  const tables = useQuery({
    queryKey: ['tables', 'mine'],
    queryFn: () => api<Array<{ id: string; title: string; status: string; hosting: boolean }>>('/tables/mine'),
    enabled: Boolean(user && open),
  });
  const hosted = tables.data?.filter((table) => table.hosting && table.status === 'OPEN_FOR_ENTRY') ?? [];
  const invite = useMutation({ mutationFn: () => post(`/tables/${tableId}/invitations`, { username }), onSuccess: () => setOpen(false) });
  if (!user) return null;
  return <div className="relative min-w-0 flex-1 sm:flex-none">
    <button type="button" className="btn-secondary btn-sm w-full" onClick={() => setOpen((value) => !value)}>Invite</button>
    {open && <div className="absolute left-0 z-20 mt-2 w-[min(16rem,calc(100vw-4rem))] rounded-lg border border-ink bg-paper p-3 shadow-hard sm:left-auto sm:right-0">
      <p className="mb-2 text-[12px] font-bold uppercase">Invite @{username}</p>
      <ErrorNotice error={tables.error || invite.error} />
      {tables.isLoading ? <p className="text-[12px]">Loading competitions…</p> : hosted.length ? <>
        <select className="field" aria-label="Choose competition" value={tableId} onChange={(event) => setTableId(event.target.value)}><option value="">Choose competition</option>{hosted.map((table) => <option key={table.id} value={table.id}>{table.title}</option>)}</select>
        <button type="button" className="btn-secondary btn-sm mt-2 w-full" disabled={!tableId || invite.isPending} onClick={() => invite.mutate()}>{invite.isPending ? 'Sending…' : 'Send invite'}</button>
      </> : <p className="text-[12px] text-ink-2">You have no open competitions to invite them to.</p>}
    </div>}
  </div>;
}
