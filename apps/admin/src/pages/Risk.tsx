import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime, formatMoney, formatRelative } from '@jump/shared/format';
import { Children, cloneElement, FormEvent, isValidElement, ReactNode, useEffect, useState } from 'react';
import { api, appUrl, patch, post } from '../api';
import { FlagIcon } from '../icons';
import { AdminLink, AppLink, navigate, useLocation } from '../router';
import { Avatar, cx, EmptyState, ErrorNotice, Notice, PageHeader, Segmented, Skeleton } from '../ui';
import { RISK_TONE } from './Payouts';

type Level = 'LOW' | 'MEDIUM' | 'HIGH';
type FlagStatus = 'OPEN' | 'ESCALATED' | 'CONFIRMED' | 'DISMISSED';

interface Flag {
  id: string; rule: string; severity: 1 | 2 | 3; reason: string; evidence: Record<string, unknown>; status: FlagStatus;
  reviewNote: string | null; reviewedAt: string | null; reviewedBy: string | null; createdAt: string;
  userId: string; displayName: string | null; username: string | null; avatarUrl: string | null; email: string;
  tableCode: string | null; tableTitle: string | null;
  related: Array<{ userId: string; displayName: string | null; username: string | null }> | null;
}

interface RiskyUser { userId: string; score: number; level: Level; payoutHold: boolean; holdReason: string | null; displayName: string | null; username: string | null; avatarUrl: string | null; email: string; openFlags: number }

const RULES: Record<string, string> = {
  REPEATED_PAIR: 'Same people, again and again',
  SAME_WINNER: 'Keeps beating the same person',
  WIN_ROTATION: 'Wins rotated between them',
  FAST_CHALLENGE: 'Unusually short challenge',
  STAKE_SPIKE: 'Sudden jump in stakes',
  PAYOUT_SPIKE: 'Sudden jump in payouts',
  SHARED_DEVICE: 'Shares a device',
  SHARED_BANK_ACCOUNT: 'Shares a bank account',
  SHARED_BVN: 'BVN used by another account',
  SHARED_IP: 'Same IP in a paid challenge',
  NO_SHOW_ENTRIES: 'Paid in, never ran',
  DEPOSIT_CYCLE: 'Paid in, then straight out',
  REPEAT_VIOLATIONS: 'Repeat violations',
};

const SEVERITY: Record<number, { label: string; tone: string }> = {
  1: { label: 'Low', tone: 'border-line bg-paper text-ink-2' },
  2: { label: 'Medium', tone: 'border-warn/60 bg-warn-wash text-warn' },
  3: { label: 'Severe', tone: 'border-bad/60 bg-bad-wash text-bad' },
};

type Tab = 'overview' | 'flags' | 'audit' | 'settings';

/**
 * Anti-money-laundering review: who looks risky and why, every flag with its reason, account and payout
 * holds, the thresholds, and the audit log of every decision.
 */
export function RiskPage() {
  const { search } = useLocation();
  const userId = search.get('user');
  const [tab, setTab] = useState<Tab>((search.get('tab') as Tab) || 'overview');
  if (userId) return <UserRisk userId={userId} />;
  return <div className="animate-rise">
    <PageHeader eyebrow="Compliance" title="Risk" description="Flags from transaction monitoring, accounts on payout hold, and the AML thresholds. Every decision is recorded in the audit log." />
    <div className="mb-5">
      <Segmented<Tab> label="Risk" value={tab} onChange={setTab} options={[
        { value: 'overview', label: 'Overview' }, { value: 'flags', label: 'Flags' }, { value: 'audit', label: 'Audit log' }, { value: 'settings', label: 'Thresholds' },
      ]} />
    </div>
    {tab === 'overview' && <Overview />}
    {tab === 'flags' && <Flags />}
    {tab === 'audit' && <Audit />}
    {tab === 'settings' && <Settings />}
  </div>;
}

function Overview() {
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['risk', 'overview'], queryFn: () => api<Record<string, number> & { risky: RiskyUser[] }>('/admin/risk/overview'), refetchInterval: 60_000 });
  const scan = useMutation({ mutationFn: () => post<{ raised: number }>('/admin/risk/scan'), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['risk'] }) });
  const data = overview.data;
  return <>
    <ErrorNotice error={overview.error} onRetry={() => void overview.refetch()} />
    {!data ? <Skeleton className="h-64" /> : <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ['Open flags', data.openFlags, `${data.severeFlags} severe`],
          ['Escalated', data.escalated, 'under investigation'],
          ['Accounts on hold', data.heldAccounts, `${data.highRisk} high risk`],
          ['Payouts held', data.heldPayouts, 'waiting for review'],
          ['KYC verified', data.kycVerified, `${data.kycPending} being checked`],
        ] as const).map(([label, value, hint]) => <div key={label} className="rounded-xl border border-line bg-card px-4 py-3">
          <p className="text-[12px] font-semibold text-ink-2">{label}</p>
          <p className="num text-[28px] font-extrabold leading-tight">{value}</p>
          <p className="text-[11px] text-ink-3">{hint}</p>
        </div>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary btn-sm" disabled={scan.isPending} onClick={() => scan.mutate()}>{scan.isPending ? 'Scanning…' : 'Run monitoring now'}</button>
        <p className="text-[12px] text-ink-3">{scan.data ? `${scan.data.raised} new flag${scan.data.raised === 1 ? '' : 's'}.` : 'Runs every hour on its own.'}</p>
      </div>
      <section>
        <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.08em]">Highest risk</h2>
        {data.risky.length === 0 ? <EmptyState title="Nobody flagged">Accounts appear here once monitoring raises a flag.</EmptyState>
          : <ul className="divide-y divide-line rounded-md border-[1.5px] border-ink bg-card">
            {data.risky.map((person) => <li key={person.userId}>
              <AdminLink to={`/risk?user=${person.userId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink/[0.03]">
                <Avatar name={person.displayName ?? person.email} src={person.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold">{person.displayName ?? person.email}</p>
                  <p className="truncate text-[12px] text-ink-2">{person.openFlags} open flag{person.openFlags === 1 ? '' : 's'}{person.payoutHold && ` · on hold: ${person.holdReason ?? ''}`}</p>
                </div>
                <span className={cx('tag', RISK_TONE[person.level])}>{person.level} · {person.score}</span>
              </AdminLink>
            </li>)}
          </ul>}
      </section>
    </div>}
  </>;
}

function Flags() {
  const [status, setStatus] = useState<FlagStatus | 'all'>('OPEN');
  const flags = useQuery({ queryKey: ['risk', 'flags', status], queryFn: () => api<Flag[]>(`/admin/risk/flags?status=${status}`) });
  return <>
    <div className="mb-4"><Segmented<FlagStatus | 'all'> label="Flag status" size="sm" value={status} onChange={setStatus} options={[
      { value: 'OPEN', label: 'Open' }, { value: 'ESCALATED', label: 'Escalated' }, { value: 'CONFIRMED', label: 'Upheld' }, { value: 'DISMISSED', label: 'Dismissed' }, { value: 'all', label: 'All' },
    ]} /></div>
    <ErrorNotice error={flags.error} onRetry={() => void flags.refetch()} />
    {flags.isLoading ? <Skeleton className="h-40" /> : (flags.data ?? []).length === 0
      ? <EmptyState mark={<FlagIcon size={36} className="mx-auto" />} title="No flags">Nothing here right now.</EmptyState>
      : <ul className="space-y-3">{(flags.data ?? []).map((flag) => <FlagCard key={flag.id} flag={flag} showPerson />)}</ul>}
  </>;
}

function FlagCard({ flag, showPerson }: { flag: Flag; showPerson: boolean }) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<'DISMISSED' | 'CONFIRMED' | 'ESCALATED' | null>(null);
  const [note, setNote] = useState('');
  const review = useMutation({
    mutationFn: () => post(`/admin/risk/flags/${flag.id}/review`, { decision, note: note.trim() }),
    onSuccess: () => { setDecision(null); setNote(''); void queryClient.invalidateQueries({ queryKey: ['risk'] }); void queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }); },
  });
  const open = flag.status === 'OPEN' || flag.status === 'ESCALATED';
  function submit(event: FormEvent) {
    event.preventDefault();
    if (decision && note.trim().length >= 5) review.mutate();
  }
  return <li className={cx('rounded-md border-[1.5px] bg-card', open ? 'border-ink' : 'border-line')}>
    <div className="flex flex-wrap items-start gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx('tag h-5 px-1.5 text-[9.5px]', SEVERITY[flag.severity].tone)}>{SEVERITY[flag.severity].label}</span>
          <p className="text-[14px] font-bold">{RULES[flag.rule] ?? flag.rule}</p>
          {flag.status !== 'OPEN' && <span className="tag h-5 border-ink bg-paper px-1.5 text-[9.5px]">{flag.status === 'CONFIRMED' ? 'Upheld' : flag.status.toLowerCase()}</span>}
        </div>
        <p className="mt-1.5 text-[14px]">{flag.reason}</p>
        <p className="mt-2 text-[12px] text-ink-2">
          {showPerson && <><AdminLink to={`/risk?user=${flag.userId}`} className="font-semibold text-ink underline underline-offset-4">{flag.displayName ?? flag.email}</AdminLink>{' · '}</>}
          {flag.related?.length ? <>with {flag.related.map((person, index) => <span key={person.userId}>{index > 0 && ', '}<AdminLink to={`/risk?user=${person.userId}`} className="underline underline-offset-4">{person.displayName ?? person.username ?? 'runner'}</AdminLink></span>)} · </> : null}
          {flag.tableCode && <><AppLink href={appUrl(`/competitions/${flag.tableCode}`)} className="underline underline-offset-4">{flag.tableTitle ?? flag.tableCode}</AppLink> · </>}
          raised {formatRelative(flag.createdAt)}
        </p>
        <Evidence evidence={flag.evidence} />
        {flag.reviewNote && <p className="mt-2 text-[12px] text-ink-2">{flag.reviewedBy ?? 'Admin'}{flag.reviewedAt && `, ${formatDateTime(flag.reviewedAt)}`}: “{flag.reviewNote}”</p>}
      </div>
    </div>
    {open && !decision && <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
      <button type="button" className="btn-quiet btn-sm" onClick={() => setDecision('DISMISSED')}>Dismiss</button>
      <button type="button" className="btn-secondary btn-sm" onClick={() => setDecision('CONFIRMED')}>Uphold</button>
      {flag.status !== 'ESCALATED' && <button type="button" className="btn-danger btn-sm" onClick={() => setDecision('ESCALATED')}>Escalate</button>}
    </div>}
    {decision && <form onSubmit={submit} className="space-y-3 border-t border-line bg-paper px-4 py-4">
      <p className="text-[13px]">{decision === 'DISMISSED' ? 'Dismiss as a false alarm. It stops counting towards their risk score.'
        : decision === 'CONFIRMED' ? 'Uphold: the pattern is real. It keeps counting, and repeat upheld flags escalate the account.'
          : 'Escalate for investigation. Their payouts are held until someone clears the account.'}</p>
      <textarea className="field min-h-[72px] py-3" maxLength={1000} placeholder="Your reasons, for the audit log" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
      {review.error && <p className="text-[13px] font-semibold text-bad">{review.error.message}</p>}
      <div className="flex gap-2">
        <button className={decision === 'ESCALATED' ? 'btn-danger btn-sm' : 'btn-primary btn-sm'} disabled={note.trim().length < 5 || review.isPending}>{review.isPending ? 'Saving…' : 'Record decision'}</button>
        <button type="button" className="btn-quiet btn-sm" onClick={() => setDecision(null)}>Cancel</button>
      </div>
    </form>}
  </li>;
}

/** Amounts in kobo read as naira; ids and lists are left out. */
function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence ?? {}).filter(([key, value]) => !key.endsWith('Ids') && typeof value !== 'object');
  if (!entries.length) return null;
  return <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
    {entries.map(([key, value]) => <span key={key}>{key.replace(/Kobo$/, '').replace(/([A-Z])/g, ' $1').toLowerCase()}: <b className="num text-ink-2">{key.endsWith('Kobo') ? formatMoney(Number(value)) : String(value)}</b></span>)}
  </p>;
}

interface Profile {
  person: Record<string, string | number | boolean | null>;
  risk: { score: number; level: Level; payoutHold: boolean; holdReason: string | null; openFlags: number };
  flags: Flag[];
  linked: Array<{ userId: string; via: string[]; displayName: string | null; username: string | null; email: string; score: number | null; level: Level | null; payoutHold: boolean | null }>;
  competitions: Array<{ id: string; code: string; title: string; status: string; entryFeeKobo: number; guaranteedPrizeKobo: number | null; createdAt: string; hosted: boolean; entrants: number; creditedDistanceMetres: number | null; winners: Array<{ userId: string; place: number; amountKobo: number; displayName: string }> | null }>;
  payouts: Array<{ id: string; status: string; createdAt: string; amountKobo: number; kind: string; riskHold: boolean; holdReasons: string[]; escalatedAt: string | null; decisionNote: string | null }>;
  timeline: Array<{ at: string; kind: string; amountKobo: number; status: string; reference: string | null; tableCode: string | null; via: string }>;
}

/** One account: identity, risk, flags, linked accounts, competitions, payouts and every naira in and out. */
function UserRisk({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['risk', 'user', userId], queryFn: () => api<Profile>(`/admin/risk/users/${userId}`) });
  const [note, setNote] = useState('');
  const [holding, setHolding] = useState(false);
  const hold = useMutation({
    mutationFn: (value: boolean) => post(`/admin/risk/users/${userId}/hold`, { hold: value, note: note.trim() }),
    onSuccess: () => { setNote(''); setHolding(false); void queryClient.invalidateQueries({ queryKey: ['risk'] }); },
  });
  useEffect(() => { setHolding(false); setNote(''); }, [userId]);
  const data = profile.data;
  const person = data?.person;
  const name = String(person?.displayName ?? person?.email ?? 'Runner');

  return <div className="animate-rise">
    <button type="button" className="mb-3 inline-flex min-h-10 items-center text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={() => navigate('/risk')}>← Risk</button>
    <ErrorNotice error={profile.error} onRetry={() => void profile.refetch()} />
    {!data || !person ? <Skeleton className="h-96" /> : <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} src={person.avatarUrl as string | null} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-extrabold">{name}</h1>
          <p className="truncate text-[13px] text-ink-2">
            {person.username && <><AppLink href={appUrl(`/runners/${person.username}`)} className="underline underline-offset-4">@{person.username}</AppLink> · </>}
            {person.email} · joined {formatRelative(String(person.createdAt))}
          </p>
        </div>
        <span className={cx('tag text-[12px]', RISK_TONE[data.risk.level])}>{data.risk.level} risk · {data.risk.score}/100</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel title="Identity (KYC)">
          {person.kycStatus === 'VERIFIED' ? <>
            <p className="font-bold text-ok">Level {person.kycLevel} verified{person.verifiedAt && ` · ${formatRelative(String(person.verifiedAt))}`}</p>
            <p className="mt-1">{person.firstName} {person.lastName} · BVN ••••{person.bvnLast4}</p>
            <p className="text-ink-2">{person.accountName} · ••••{person.accountLast4}</p>
          </> : <p className="font-semibold">{person.kycStatus ? `${String(person.kycStatus).toLowerCase()}${person.failureReason ? `: ${person.failureReason}` : ''}` : 'Not verified'}</p>}
          {person.payoutAccountName && <p className="mt-2 text-ink-2">Payout account: {person.payoutAccountName} ••••{person.payoutAccountLast4} {person.payoutKycVerified ? '(verified)' : <b className="text-bad">(not verified)</b>}</p>}
          <p className="mt-2 text-ink-2">Wallet {formatMoney(Number(person.balanceKobo ?? 0))}{person.frozenAt && ' · frozen'}</p>
        </Panel>
        <Panel title="Payout hold">
          {data.risk.payoutHold ? <p className="font-bold text-bad">On hold: {data.risk.holdReason}</p> : <p className="font-semibold text-ok">Payouts allowed</p>}
          <p className="mt-1 text-ink-2">{data.risk.openFlags} open flag{data.risk.openFlags === 1 ? '' : 's'}</p>
          {!holding ? <button type="button" className={cx('btn-sm mt-3', data.risk.payoutHold ? 'btn-secondary' : 'btn-danger')} onClick={() => setHolding(true)}>
            {data.risk.payoutHold ? 'Release hold' : 'Put payouts on hold'}
          </button> : <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); if (note.trim().length >= 5) hold.mutate(!data.risk.payoutHold); }}>
            <textarea className="field min-h-[64px] py-2" maxLength={300} placeholder={data.risk.payoutHold ? 'Why it’s safe to release (for the audit log)' : 'Why payouts should stop (for the audit log)'} value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
            {hold.error && <p className="text-[13px] font-semibold text-bad">{hold.error.message}</p>}
            <div className="flex gap-2">
              <button className="btn-primary btn-sm" disabled={note.trim().length < 5 || hold.isPending}>{data.risk.payoutHold ? 'Release' : 'Hold payouts'}</button>
              <button type="button" className="btn-quiet btn-sm" onClick={() => setHolding(false)}>Cancel</button>
            </div>
          </form>}
        </Panel>
      </div>

      <Section title={`Flags (${data.flags.length})`}>
        {data.flags.length === 0 ? <p className="text-[13px] text-ink-3">No flags.</p> : <ul className="space-y-3">{data.flags.map((flag) => <FlagCard key={flag.id} flag={flag} showPerson={flag.userId !== userId} />)}</ul>}
      </Section>

      <Section title={`Linked accounts (${data.linked.length})`}>
        {data.linked.length === 0 ? <p className="text-[13px] text-ink-3">No other account shares a BVN, bank account, device or IP.</p>
          : <ul className="divide-y divide-line rounded-md border border-line bg-card">{data.linked.map((link) => <li key={link.userId}>
            <AdminLink to={`/risk?user=${link.userId}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-ink/[0.03]">
              <span className="min-w-0 flex-1 truncate font-semibold">{link.displayName ?? link.email}</span>
              <span className="text-ink-2">shares {link.via.join(', ')}</span>
              {link.level && <span className={cx('tag h-5 px-1.5 text-[9.5px]', RISK_TONE[link.level])}>{link.level} · {link.score}</span>}
            </AdminLink>
          </li>)}</ul>}
      </Section>

      <Section title="Paid competitions">
        {data.competitions.length === 0 ? <p className="text-[13px] text-ink-3">None.</p> : <Table head={['Competition', 'Entry', 'Entrants', 'Their distance', 'Winners']}>
          {data.competitions.map((row) => <tr key={row.id}>
            <td><AppLink href={appUrl(`/competitions/${row.code}`)} className="font-semibold underline underline-offset-4">{row.title}</AppLink><br /><span className="text-ink-3">{row.hosted ? 'Hosted · ' : ''}{row.status.toLowerCase().replace(/_/g, ' ')} · {formatRelative(row.createdAt)}</span></td>
            <td className="num">{formatMoney(row.entryFeeKobo)}</td>
            <td className="num">{row.entrants}</td>
            <td className="num">{row.hosted ? '–' : `${((row.creditedDistanceMetres ?? 0) / 1000).toFixed(1)} km`}</td>
            <td>{row.winners?.map((winner) => <span key={winner.userId} className={cx('block', winner.userId === userId && 'font-bold')}>{winner.place}. {winner.displayName} {formatMoney(winner.amountKobo)}</span>) ?? '–'}</td>
          </tr>)}
        </Table>}
      </Section>

      <Section title="Payouts">
        {data.payouts.length === 0 ? <p className="text-[13px] text-ink-3">None.</p> : <Table head={['Requested', 'Amount', 'Status', 'Review']}>
          {data.payouts.map((row) => <tr key={row.id}>
            <td>{formatDateTime(row.createdAt)}<br /><span className="text-ink-3">{row.kind === 'PRIZE' ? 'Prize' : 'Creator share'}</span></td>
            <td className="num font-semibold">{formatMoney(row.amountKobo)}</td>
            <td>{row.status.toLowerCase().replace(/_/g, ' ')}{row.escalatedAt && <b className="block text-bad">escalated</b>}</td>
            <td className="text-ink-2">{row.riskHold ? row.holdReasons.join('; ') : 'No hold'}{row.decisionNote && <span className="block text-ink">“{row.decisionNote}”</span>}</td>
          </tr>)}
        </Table>}
      </Section>

      <Section title="Money in and out">
        {data.timeline.length === 0 ? <p className="text-[13px] text-ink-3">No money movements.</p> : <Table head={['When', 'What', 'Amount', 'Status', 'Detail']}>
          {data.timeline.map((row, index) => <tr key={`${row.at}-${index}`}>
            <td className="whitespace-nowrap">{formatDateTime(row.at)}</td>
            <td className="capitalize">{row.kind}<br /><span className="text-ink-3">{row.via}</span></td>
            <td className={cx('num font-semibold', Number(row.amountKobo) < 0 ? 'text-bad' : 'text-ok')}>{Number(row.amountKobo) > 0 ? '+' : '−'}{formatMoney(Math.abs(Number(row.amountKobo)))}</td>
            <td>{String(row.status).toLowerCase().replace(/_/g, ' ')}</td>
            <td className="text-ink-3">{row.tableCode ?? ''} {row.reference ?? ''}</td>
          </tr>)}
        </Table>}
      </Section>

      <Section title="Audit trail"><AuditList targetId={userId} /></Section>
    </div>}
  </div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-md border border-line bg-card p-4 text-[13px]"><p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-2">{title}</p>{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.08em]">{title}</h2>{children}</section>;
}

/** A table on wider screens; on a phone each row becomes a card with every value labelled. */
function Table({ head, children }: { head: string[]; children: ReactNode }) {
  const rows = Children.map(children, (row) => isValidElement<{ children: ReactNode }>(row)
    ? cloneElement(row, {}, Children.map(row.props.children, (cell, index) => isValidElement<{ 'data-label'?: string; children?: ReactNode }>(cell)
      ? cloneElement(cell, { 'data-label': head[index] }, <span className="min-w-0 flex-1 break-words">{cell.props.children}</span>)
      : cell))
    : row);
  return <div className="sm:overflow-x-auto sm:rounded-md sm:border sm:border-line sm:bg-card">
    <table className={cx('w-full text-left text-[12.5px] sm:min-w-[560px]',
      // Phone: rows as cards, each cell a "label  value" line.
      'max-sm:block max-sm:[&_tbody]:block max-sm:[&_tbody]:space-y-2 max-sm:[&_thead]:hidden',
      'max-sm:[&_tr]:block max-sm:[&_tr]:rounded-md max-sm:[&_tr]:border max-sm:[&_tr]:border-line max-sm:[&_tr]:bg-card max-sm:[&_tr]:p-3',
      'max-sm:[&_td]:flex max-sm:[&_td]:gap-3 max-sm:[&_td]:py-1 max-sm:[&_td]:before:w-24 max-sm:[&_td]:before:shrink-0 max-sm:[&_td]:before:text-[11px] max-sm:[&_td]:before:font-bold max-sm:[&_td]:before:uppercase max-sm:[&_td]:before:tracking-[0.06em] max-sm:[&_td]:before:text-ink-3 max-sm:[&_td]:before:content-[attr(data-label)]',
      'sm:[&_td]:px-3 sm:[&_td]:py-2 sm:[&_td]:align-top sm:[&_tbody_tr+tr]:border-t sm:[&_tbody_tr+tr]:border-line')}>
      <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-3">{head.map((cell) => <th key={cell} className="px-3 py-2 font-bold">{cell}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </div>;
}

interface AuditEvent { id: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>; createdAt: string; actor: string | null }

function Audit() {
  const [action, setAction] = useState('');
  return <>
    <div className="mb-4 flex flex-wrap gap-2">
      {['', 'PAYOUT', 'RISK_FLAG', 'KYC', 'AML_SETTINGS'].map((value) => <button key={value} type="button" onClick={() => setAction(value)}
        className={cx('btn btn-sm border-[1.5px] normal-case', action === value ? 'border-ink bg-ink text-paper' : 'border-line')}>{value ? value.toLowerCase().replace(/_/g, ' ') : 'Everything'}</button>)}
    </div>
    <AuditList action={action || undefined} />
  </>;
}

function AuditList({ targetId, action }: { targetId?: string; action?: string }) {
  const params = new URLSearchParams();
  if (targetId) params.set('target', targetId);
  if (action) params.set('action', action);
  const events = useQuery({ queryKey: ['risk', 'audit', targetId, action], queryFn: () => api<AuditEvent[]>(`/admin/risk/audit?${params}`) });
  if (events.isLoading) return <Skeleton className="h-32" />;
  if (events.error) return <ErrorNotice error={events.error} onRetry={() => void events.refetch()} />;
  if (!events.data?.length) return <p className="text-[13px] text-ink-3">Nothing recorded yet.</p>;
  return <ul className="divide-y divide-line rounded-md border border-line bg-card text-[12.5px]">
    {events.data.map((event) => {
      const detail = Object.entries(event.metadata ?? {}).filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object').map(([key, value]) => `${key}: ${key.endsWith('Kobo') ? formatMoney(Number(value)) : String(value)}`);
      return <li key={event.id} className="px-4 py-2.5">
        <p><b>{event.action.toLowerCase().replace(/_/g, ' ')}</b> <span className="text-ink-3">· {event.actor ?? 'System'} · {formatDateTime(event.createdAt)}</span></p>
        {detail.length > 0 && <p className="mt-0.5 break-words text-ink-2">{detail.join(' · ')}</p>}
        {Array.isArray(event.metadata?.reasons) && <p className="mt-0.5 text-ink-2">{(event.metadata.reasons as string[]).join('; ')}</p>}
        {event.metadata?.changes ? <p className="mt-0.5 break-words text-ink-2">{Object.entries(event.metadata.changes as Record<string, { from: unknown; to: unknown }>).map(([key, change]) => `${key}: ${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`).join(' · ')}</p> : null}
      </li>;
    })}
  </ul>;
}

interface Settings {
  kycRequired: boolean; maxPaidChallengesPerDay: number; maxEntryFeeKobo: number; maxPotKobo: number;
  participantTiers: Array<{ potKobo: number; minEntrants: number }>; maxWalletFundingPerDayKobo: number;
  payoutReviewThresholdKobo: number; newAccountDays: number; withdrawalLimits: Record<Level, { dailyKobo: number; monthlyKobo: number }>;
  riskMediumScore: number; riskHighScore: number; autoHoldHighRisk: boolean; repeatViolationCount: number;
  windowDays: number; pairRepeatCount: number; sameWinnerCount: number; rotationSharedCount: number; fastChallengeMinutes: number;
  spikeMultiplier: number; spikeMinKobo: number; noShowEntries: number; cycleHours: number; cycleMinKobo: number;
}

type NumberKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];

const GROUPS: Array<[string, Array<[NumberKey, string, 'naira' | 'count']>]> = [
  ['Challenge limits', [
    ['maxPaidChallengesPerDay', 'Paid challenges a person can create a day', 'count'],
    ['maxEntryFeeKobo', 'Highest entry fee (stake per participant)', 'naira'],
    ['maxPotKobo', 'Highest prize pot per challenge', 'naira'],
    ['maxWalletFundingPerDayKobo', 'Wallet funding per person a day', 'naira'],
  ]],
  ['Payout review', [
    ['payoutReviewThresholdKobo', 'Hold payouts at or above', 'naira'],
    ['newAccountDays', 'Hold payouts from accounts or KYC younger than (days)', 'count'],
  ]],
  ['Risk score', [
    ['riskMediumScore', 'Medium risk from score', 'count'],
    ['riskHighScore', 'High risk from score', 'count'],
    ['repeatViolationCount', 'Upheld flags before escalation', 'count'],
  ]],
  ['Monitoring rules', [
    ['windowDays', 'Look back over (days)', 'count'],
    ['pairRepeatCount', 'Shared paid challenges before a pair is flagged', 'count'],
    ['sameWinnerCount', 'Wins over the same person before flagging', 'count'],
    ['rotationSharedCount', 'Shared challenges before checking win rotation', 'count'],
    ['fastChallengeMinutes', 'Flag paid challenges shorter than (minutes)', 'count'],
    ['spikeMultiplier', 'Spike: this week vs weekly average (×)', 'count'],
    ['spikeMinKobo', 'Ignore spikes below', 'naira'],
    ['noShowEntries', 'Paid entries with no activity before flagging', 'count'],
    ['cycleHours', 'Payout this soon after paying in (hours)', 'count'],
    ['cycleMinKobo', 'Only when at least this was paid in', 'naira'],
  ]],
];

/** Every threshold, in naira (stored in kobo). Saving records the before and after in the audit log. */
function Settings() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['risk', 'settings'], queryFn: () => api<Settings>('/admin/risk/settings') });
  const [draft, setDraft] = useState<Settings | null>(null);
  useEffect(() => { if (settings.data) setDraft(structuredClone(settings.data)); }, [settings.data]);
  const save = useMutation({
    mutationFn: () => patch<Settings>('/admin/risk/settings', { values: draft }),
    onSuccess: (saved) => { queryClient.setQueryData(['risk', 'settings'], saved); void queryClient.invalidateQueries({ queryKey: ['risk', 'audit'] }); },
  });
  if (settings.error) return <ErrorNotice error={settings.error} onRetry={() => void settings.refetch()} />;
  if (!draft) return <Skeleton className="h-96" />;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...draft, [key]: value });
  const changed = JSON.stringify(draft) !== JSON.stringify(settings.data);

  return <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
    <Notice tone="info" title="Starting values">These defaults suit a young platform. Confirm them with your lawyer against Nigerian AML rules and Paystack’s policies.</Notice>
    <label className="flex items-start gap-3 rounded-md border-[1.5px] border-ink bg-card p-4">
      <input type="checkbox" className="mt-1" checked={draft.kycRequired} onChange={(event) => set('kycRequired', event.target.checked)} />
      <span><b className="block text-[14px]">Require KYC Level 2</b><span className="text-[13px] text-ink-2">BVN and an own-name bank account before paid challenges, hosting, creator accounts and payouts. Turning this off lets unverified people move money.</span></span>
    </label>
    <label className="flex items-start gap-3 rounded-md border border-line bg-card p-4">
      <input type="checkbox" className="mt-1" checked={draft.autoHoldHighRisk} onChange={(event) => set('autoHoldHighRisk', event.target.checked)} />
      <span><b className="block text-[14px]">Hold payouts for high-risk accounts automatically</b><span className="text-[13px] text-ink-2">Severe flags always hold payouts until reviewed.</span></span>
    </label>
    {GROUPS.map(([title, fields]) => <fieldset key={title} className="rounded-md border border-line bg-card p-4">
      <legend className="px-1 text-[12px] font-extrabold uppercase tracking-[0.08em]">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label, kind]) => <NumberField key={key} label={label} kind={kind} value={draft[key]} onChange={(value) => set(key, value)} />)}
      </div>
    </fieldset>)}
    <fieldset className="rounded-md border border-line bg-card p-4">
      <legend className="px-1 text-[12px] font-extrabold uppercase tracking-[0.08em]">Payout limits by risk level</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {(['LOW', 'MEDIUM', 'HIGH'] as const).map((level) => <div key={level} className="space-y-2">
          <span className={cx('tag', RISK_TONE[level])}>{level}</span>
          <NumberField label="A day" kind="naira" value={draft.withdrawalLimits[level].dailyKobo} onChange={(value) => set('withdrawalLimits', { ...draft.withdrawalLimits, [level]: { ...draft.withdrawalLimits[level], dailyKobo: value } })} />
          <NumberField label="Every 30 days" kind="naira" value={draft.withdrawalLimits[level].monthlyKobo} onChange={(value) => set('withdrawalLimits', { ...draft.withdrawalLimits, [level]: { ...draft.withdrawalLimits[level], monthlyKobo: value } })} />
        </div>)}
      </div>
      <p className="mt-2 text-[12px] text-ink-3">₦0 pauses payouts for that level until an admin reviews the account.</p>
    </fieldset>
    <fieldset className="rounded-md border border-line bg-card p-4">
      <legend className="px-1 text-[12px] font-extrabold uppercase tracking-[0.08em]">Entrants needed by pot size</legend>
      <div className="space-y-2">
        {draft.participantTiers.map((tier, index) => <div key={index} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <NumberField label="Pot from" kind="naira" value={tier.potKobo} onChange={(value) => set('participantTiers', draft.participantTiers.map((item, i) => i === index ? { ...item, potKobo: value } : item))} />
          <NumberField label="At least entrants" kind="count" value={tier.minEntrants} onChange={(value) => set('participantTiers', draft.participantTiers.map((item, i) => i === index ? { ...item, minEntrants: value } : item))} />
          <button type="button" className="btn-quiet btn-sm col-span-2 mb-1 justify-self-start sm:col-span-1" disabled={draft.participantTiers.length === 1} onClick={() => set('participantTiers', draft.participantTiers.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        <button type="button" className="btn-quiet btn-sm" onClick={() => set('participantTiers', [...draft.participantTiers, { potKobo: 0, minEntrants: 2 }])}>Add tier</button>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">A challenge can’t start or pay out with fewer entrants than its pot needs.</p>
    </fieldset>
    {save.error && <ErrorNotice error={save.error} />}
    {save.isSuccess && !changed && <Notice tone="ok">Saved. The change is in the audit log.</Notice>}
    {/* Clears the phone's bottom bar; on desktop it sits at the bottom of the window. */}
    <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-2 border-t border-line bg-paper px-4 py-3 lg:bottom-0 lg:mx-0 lg:px-0">
      <button className="btn-primary" disabled={!changed || save.isPending}>{save.isPending ? 'Saving…' : 'Save thresholds'}</button>
      <button type="button" className="btn-quiet" disabled={!changed} onClick={() => setDraft(structuredClone(settings.data!))}>Undo changes</button>
    </div>
  </form>;
}

function NumberField({ label, kind, value, onChange }: { label: string; kind: 'naira' | 'count'; value: number; onChange: (value: number) => void }) {
  const shown = kind === 'naira' ? value / 100 : value;
  return <label className="block">
    <span className="label">{label}</span>
    <div className="relative">
      {kind === 'naira' && <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold">₦</span>}
      <input className={cx('field num', kind === 'naira' && 'pl-7')} type="number" min={0} step={kind === 'naira' ? 100 : 'any'} value={Number.isFinite(shown) ? shown : 0}
        onChange={(event) => { const next = Number(event.target.value); onChange(kind === 'naira' ? Math.round(next * 100) : next); }} />
    </div>
  </label>;
}
