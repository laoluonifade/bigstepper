import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon, BellIcon, LogoutIcon, ShieldIcon } from '../components/icons';
import {
  Avatar,
  CopyButton,
  cx,
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
import { formatDate, formatMoney, formatRelative, shortId } from '../lib/format';
import { useStored } from '../lib/local';
import { keys, useNotifications, useProfile, useStaffAccess } from '../lib/queries';
import type { Notification, PayoutRecipient, PrizeAward, Profile, PublicProfile, Unit, Visibility } from '../lib/types';

export const YOU_NAV = [
  { to: '/settings/profile', label: 'Profile' },
  { to: '/rewards', label: 'Rewards' },
  { to: '/notifications', label: 'Notifications' },
] as const;

const COUNTRIES: Array<[string, string]> = [
  ['NG', 'Nigeria'],
  ['GH', 'Ghana'],
  ['KE', 'Kenya'],
  ['ZA', 'South Africa'],
  ['CM', 'Cameroon'],
  ['CI', 'Côte d’Ivoire'],
  ['SN', 'Senegal'],
  ['RW', 'Rwanda'],
  ['UG', 'Uganda'],
  ['TZ', 'Tanzania'],
  ['ET', 'Ethiopia'],
  ['EG', 'Egypt'],
  ['MA', 'Morocco'],
  ['GB', 'United Kingdom'],
  ['IE', 'Ireland'],
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['NL', 'Netherlands'],
  ['AE', 'United Arab Emirates'],
];

const VISIBILITY: Array<{ value: Visibility; title: string; body: string }> = [
  { value: 'private', title: 'Private', body: 'Only you see your runs.' },
  { value: 'followers', title: 'Followers', body: 'Runners who follow you. Following isn’t available yet.' },
  { value: 'public', title: 'Public', body: 'Anyone with your profile link.' },
];

export function ProfileSettingsPage() {
  const user = useUser();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const { isStaff } = useStaffAccess();
  const [draft, setDraft] = useState<Partial<Profile>>({});
  const merged = { ...profile.data, ...draft } as Profile;

  const save = useMutation({
    mutationFn: (changes: Partial<Profile>) => patch<Profile>('/me', changes),
    onSuccess(updated) {
      queryClient.setQueryData(keys.profile, updated);
      setDraft({});
    },
  });

  const { isSuccess: saved, reset: resetSave } = save;
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => resetSave(), 2500);
    return () => window.clearTimeout(timer);
  }, [saved, resetSave]);

  const dirty = useMemo(
    () => Object.entries(draft).some(([key, value]) => profile.data && profile.data[key as keyof Profile] !== value),
    [draft, profile.data],
  );
  const usernameError =
    draft.username !== undefined && !/^[a-z0-9_]{2,30}$/.test(draft.username) ? '2–30 characters: lowercase letters, numbers and underscores.' : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile.data || usernameError) return;
    const changes = Object.fromEntries(
      Object.entries(draft).filter(([key, value]) => profile.data![key as keyof Profile] !== value),
    ) as Partial<Profile>;
    if (changes.displayName !== undefined) changes.displayName = changes.displayName.trim();
    save.mutate(changes);
  }

  if (profile.isLoading) return <Loading />;
  if (profile.error || !profile.data) return <ErrorNotice error={profile.error} onRetry={() => void profile.refetch()} />;

  const countryKnown = COUNTRIES.some(([code]) => code === merged.countryCode);

  return (
    <div className="animate-rise">
      <SubNav items={[...YOU_NAV]} />

      <section className="mb-10 flex flex-wrap items-center gap-5">
        <Avatar name={profile.data.displayName} highlight size={72} />
        <div className="min-w-0">
          <h1 className="display text-[30px] sm:text-[36px]">{profile.data.displayName}</h1>
          <p className="mt-1 text-[14px] text-ink-2">
            @{profile.data.username} · {COUNTRIES.find(([code]) => code === profile.data.countryCode)?.[1] ?? profile.data.countryCode}
          </p>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={submit} className="space-y-6">
          <SectionTitle>Profile</SectionTitle>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Display name" hint="Shown on leaderboards.">
              {(props) => (
                <input
                  {...props}
                  className="field"
                  maxLength={80}
                  value={merged.displayName ?? ''}
                  onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
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
                    onChange={(event) => setDraft({ ...draft, username: event.target.value.toLowerCase() })}
                  />
                </div>
              )}
            </Field>
          </div>

          <div>
            <p className="label">Distance units</p>
            <Segmented<Unit>
              label="Distance units"
              value={merged.preferredUnit}
              onChange={(value) => setDraft({ ...draft, preferredUnit: value })}
              options={[
                { value: 'km', label: 'Kilometres' },
                { value: 'mi', label: 'Miles' },
              ]}
            />
          </div>

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
                      onChange={() => setDraft({ ...draft, activityVisibility: option.value })}
                    />
                    <span className="wide block text-[13px] font-extrabold uppercase">{option.title}</span>
                    <span className={cx('mt-1 block text-[12px] leading-snug', active ? 'text-paper/70' : 'text-ink-2')}>{option.body}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Field label="Country">
            {(props) => (
              <select
                {...props}
                className="field"
                value={merged.countryCode}
                onChange={(event) => setDraft({ ...draft, countryCode: event.target.value })}
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
          <div className="flex items-center gap-4 border-t border-line pt-6">
            <button className="btn-primary" disabled={!dirty || save.isPending || Boolean(usernameError)}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
            {save.isSuccess && <span className="text-[13px] font-semibold text-ok">Saved.</span>}
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
              <p className="eyebrow">Runner ID</p>
              <p className="mt-1 break-all font-mono text-[12px]">{user.id}</p>
              <p className="hint">Club admins use this to add you to a club.</p>
              <CopyButton value={user.id} label="Copy ID" className="mt-3" />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link to="/verify-email" className="btn-quiet justify-between">
                Verify email <ArrowRightIcon size={16} />
              </Link>
              <Link to="/forgot-password" className="btn-quiet justify-between">
                Change password <ArrowRightIcon size={16} />
              </Link>
              <Link to="/runners/$username" params={{ username: profile.data.username }} className="btn-quiet justify-between">
                Public profile <ArrowRightIcon size={16} />
              </Link>
            </div>
          </section>

          {isStaff && (
            <section>
              <SectionTitle>Staff tools</SectionTitle>
              <div className="flex flex-col gap-2">
                <Link to="/admin/reviews" className="btn-quiet justify-between">
                  <span className="flex items-center gap-2">
                    <ShieldIcon size={16} /> Verification reviews
                  </span>
                  <ArrowRightIcon size={16} />
                </Link>
                <Link to="/admin/competitions" className="btn-quiet justify-between">
                  Competitions <ArrowRightIcon size={16} />
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

const BANKS: Array<[string, string]> = [
  ['044', 'Access Bank'],
  ['023', 'Citibank Nigeria'],
  ['050', 'Ecobank Nigeria'],
  ['070', 'Fidelity Bank'],
  ['011', 'First Bank of Nigeria'],
  ['214', 'First City Monument Bank'],
  ['058', 'Guaranty Trust Bank'],
  ['030', 'Heritage Bank'],
  ['301', 'Jaiz Bank'],
  ['082', 'Keystone Bank'],
  ['076', 'Polaris Bank'],
  ['101', 'Providus Bank'],
  ['221', 'Stanbic IBTC Bank'],
  ['068', 'Standard Chartered Bank'],
  ['232', 'Sterling Bank'],
  ['032', 'Union Bank of Nigeria'],
  ['033', 'United Bank for Africa'],
  ['215', 'Unity Bank'],
  ['035', 'Wema Bank'],
  ['057', 'Zenith Bank'],
];

type SavedRecipient = Pick<PayoutRecipient, 'accountName' | 'bankCode' | 'accountLast4'>;

export function RewardsPage() {
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
      <PageHeader eyebrow="You" title="Rewards" description="Prizes from paid competitions you’ve won. Free tables are for glory." />

      <div className="panel-strong mb-8 grid grid-cols-2 divide-x divide-line">
        <div className="p-5">
          <p className="eyebrow">Total won</p>
          <p className="score mt-2 text-[36px] sm:text-[44px]">{rewards.isLoading ? '–' : formatMoney(total)}</p>
        </div>
        <div className="p-5">
          <p className="eyebrow">Paid out</p>
          <p className="score mt-2 text-[36px] sm:text-[44px]">{rewards.isLoading ? '–' : formatMoney(paid)}</p>
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
              Win a paid competition and your prize shows up here.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {list.map((award) => {
                const claimable = award.status === 'PENDING_APPROVAL';
                return (
                  <li key={award.id} className="flex flex-wrap items-center gap-4 rounded-md border-[1.5px] border-ink bg-card p-4">
                    <div className="min-w-0 flex-1">
                      <p className="score text-[30px]">{formatMoney(award.amountKobo)}</p>
                      <p className="mt-1 text-[12px] text-ink-2">
                        Table {shortId(award.tableId)} · won {formatDate(award.createdAt, { year: 'numeric' })}
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
              Two separate administrators approve and send every payout. You’ll see the status change here.
            </Notice>
          )}
        </section>

        <section>
          <SectionTitle>Payout details</SectionTitle>
          {recipient && !editing ? (
            <div className="rounded-md border border-line bg-card p-4">
              <p className="text-[15px] font-bold">{recipient.accountName}</p>
              <p className="num mt-1 text-[13px] text-ink-2">
                {BANKS.find(([code]) => code === recipient.bankCode)?.[1] ?? `Bank ${recipient.bankCode}`} · •••• {recipient.accountLast4}
              </p>
              <button type="button" className="btn-quiet btn-sm mt-4" onClick={() => setEditing(true)}>
                Replace account
              </button>
            </div>
          ) : (
            <RecipientForm
              onSaved={(saved) => {
                setRecipient({ accountName: saved.accountName, bankCode: saved.bankCode, accountLast4: saved.accountLast4 });
                setEditing(false);
              }}
              onCancel={recipient ? () => setEditing(false) : undefined}
            />
          )}
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
            We only keep the account name, bank and last four digits. Payouts are approved and sent by two different administrators.
          </p>
        </section>
      </div>
    </div>
  );
}

function RecipientForm({ onSaved, onCancel }: { onSaved: (recipient: PayoutRecipient) => void; onCancel?: () => void }) {
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [otherCode, setOtherCode] = useState('');
  const code = bankCode === 'other' ? otherCode.trim() : bankCode;
  const save = useMutation({
    mutationFn: () => post<PayoutRecipient>('/me/payout-recipient', { accountName: accountName.trim(), accountNumber, bankCode: code }),
    onSuccess(saved) {
      setAccountNumber('');
      onSaved(saved);
    },
    onError() {
      setAccountNumber('');
    },
  });
  const numberError = accountNumber.length > 0 && !/^\d{10}$/.test(accountNumber) ? 'NUBAN account numbers are 10 digits.' : undefined;
  const valid = accountName.trim().length >= 2 && /^\d{10}$/.test(accountNumber) && code.length >= 2;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <Field label="Account name">
        {(props) => <input {...props} className="field" autoComplete="name" maxLength={100} value={accountName} onChange={(event) => setAccountName(event.target.value)} required />}
      </Field>
      <Field label="Bank">
        {(props) => (
          <select {...props} className="field" value={bankCode} onChange={(event) => setBankCode(event.target.value)} required>
            <option value="" disabled>
              Choose your bank
            </option>
            {BANKS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
            <option value="other">Other — enter bank code</option>
          </select>
        )}
      </Field>
      {bankCode === 'other' && (
        <Field label="Bank code" hint="Your bank’s Paystack/CBN code.">
          {(props) => <input {...props} className="field font-mono" maxLength={20} value={otherCode} onChange={(event) => setOtherCode(event.target.value)} required />}
        </Field>
      )}
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
          {save.isPending ? 'Checking account…' : 'Save account'}
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

export function NotificationsPage() {
  const notifications = useNotifications();
  const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: (id: string) => patch<{ success: boolean }>(`/notifications/${id}/read`),
    onMutate(id) {
      queryClient.setQueryData<Notification[]>(keys.notifications, (current) =>
        current?.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)),
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.notifications }),
  });
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
        <ul className="divide-y divide-line border-y border-line">
          {list.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cx('flex w-full gap-4 px-2 py-4 text-left hover:bg-ink/[0.025]', !item.readAt && 'bg-card')}
                onClick={() => !item.readAt && markRead.mutate(item.id)}
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
  const runner = useQuery({ queryKey: ['runner', username], queryFn: () => api<PublicProfile>(`/users/${encodeURIComponent(username)}`) });
  if (runner.isLoading) return <Loading />;
  if (runner.error || !runner.data) {
    return isApiError(runner.error, 404) ? (
      <EmptyState title="Runner not found">There’s no runner called @{username}.</EmptyState>
    ) : (
      <ErrorNotice error={runner.error} onRetry={() => void runner.refetch()} />
    );
  }
  const country = COUNTRIES.find(([code]) => code === runner.data.countryCode)?.[1] ?? runner.data.countryCode;
  return (
    <div className="animate-rise">
      <div className="panel-strong flex flex-wrap items-center gap-5 p-6">
        <Avatar name={runner.data.displayName} highlight size={80} />
        <div>
          <p className="eyebrow">Runner</p>
          <h1 className="display mt-1 text-[32px]">{runner.data.displayName}</h1>
          <p className="mt-1 text-[14px] text-ink-2">
            @{runner.data.username} · {country}
          </p>
        </div>
      </div>
      <p className="mt-4 text-[13px] text-ink-3">Public run history isn’t shown on profiles yet.</p>
    </div>
  );
}
