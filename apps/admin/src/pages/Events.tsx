import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { api, appUrl } from '../api';
import { SearchIcon } from '../icons';
import { AppLink } from '../router';
import { cx, EmptyState, ErrorNotice, PageHeader, Segmented, Skeleton } from '../ui';

interface AdminEvent {
  id: string; slug: string; title: string; repeat: string; venue: string | null; coverUrl: string | null; createdAt: string; deletedAt: string | null; draft: boolean;
  nextAt: string | null; clubName: string; clubSlug: string; accentColor: string;
  registered: number; cancelled: number; fromWeb: number; newAccounts: number; checkIns: number;
  tickets: Array<{ name: string; priceMinor: number; currency: string; capacity: number | null; sold: number }>;
}

interface Registration {
  id: string; eventId: string; eventTitle: string; eventSlug: string; clubName: string;
  userId: string; name: string | null; username: string | null; email: string; accountEmail: string; phone: string | null;
  passCode: string; ticketType: string; paymentStatus: string; amountMinor: number; currency: string;
  source: 'app' | 'web' | 'guest'; newAccount: boolean; marketingConsent: boolean; emailVerified: boolean;
  registeredAt: string; cancelledAt: string | null; ticketSentAt: string | null; checkIns: number; lastCheckIn: string | null;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const SOURCE: Record<Registration['source'], string> = { guest: 'Web, no account', web: 'Web, signed in', app: 'App' };

function useDebounced(value: string) {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setSettled(value.trim()), 250); return () => window.clearTimeout(timer); }, [value]);
  return settled;
}

/** Every club event with its registrations, and anyone's event history by email, phone or name. */
export function AdminEventsPage() {
  const [view, setView] = useState<'events' | 'people'>('events');
  return <>
    <PageHeader eyebrow="Events" title="Events & passes" description="Who registered for what, which ticket, how they paid, whether they turned up, and what their Jump account looks like. Guests who register without signing in get an account automatically." />
    <div className="mb-4"><Segmented label="Show" value={view} onChange={setView} options={[{ value: 'events', label: 'By event' }, { value: 'people', label: 'By person' }]} /></div>
    {view === 'events' ? <EventList /> : <PersonHistory />}
  </>;
}

function EventList() {
  const [term, setTerm] = useState('');
  const query = useDebounced(term);
  const [open, setOpen] = useState<AdminEvent | null>(null);
  const events = useInfiniteQuery({
    queryKey: ['admin', 'events', query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<{ total: number; events: AdminEvent[] }>(`/admin/events?${new URLSearchParams({ q: query, offset: String(pageParam) })}`),
    getNextPageParam: (last, pages) => { const loaded = pages.reduce((sum, page) => sum + page.events.length, 0); return loaded < last.total ? loaded : undefined; },
  });
  const rows = events.data?.pages.flatMap((page) => page.events) ?? [];
  const total = events.data?.pages[0]?.total ?? 0;
  if (open) return <EventRegistrations event={open} onBack={() => setOpen(null)} />;
  return <>
    <Search value={term} onChange={setTerm} placeholder="Search events or clubs" />
    <p className="num mt-4 text-[13px] text-ink-3">{events.isLoading ? 'Loading…' : `${total.toLocaleString('en-GB')} ${total === 1 ? 'event' : 'events'}`}</p>
    <ErrorNotice error={events.error} onRetry={() => void events.refetch()} />
    {events.isLoading ? <Skeleton className="mt-3 h-64 rounded-2xl" /> : !rows.length ? <EmptyState title="No events">{query ? `Nothing matches “${query}”.` : 'No club has posted an event yet.'}</EmptyState>
      : <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card">
        {rows.map((event) => <li key={event.id}>
          <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink/[0.03]" onClick={() => setOpen(event)}>
            <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: event.accentColor }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{event.title}</p>
              <p className="mt-0.5 truncate text-[12px] text-ink-2">{[event.clubName, event.nextAt ? `Next ${day(event.nextAt)}` : 'Finished', event.repeat !== 'once' && event.repeat].filter(Boolean).join(' · ')}</p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {event.deletedAt && <Tag tone="bad">Removed</Tag>}
                {event.draft && <Tag>Draft</Tag>}
                {event.tickets.map((ticket) => <Tag key={ticket.name}>{ticket.name}{ticket.priceMinor ? ` · ${ticket.currency} ${(ticket.priceMinor / 100).toLocaleString('en-GB')}` : ''}{ticket.capacity ? ` · ${ticket.sold}/${ticket.capacity}` : ''}</Tag>)}
              </p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-0.5 text-right text-[12px] sm:grid-cols-4">
              <Stat label="Passes" value={event.registered} />
              <Stat label="Check-ins" value={event.checkIns} />
              <Stat label="From web" value={event.fromWeb} className="hidden sm:block" />
              <Stat label="New accounts" value={event.newAccounts} className="hidden sm:block" />
            </div>
          </button>
        </li>)}
      </ul>}
    {events.hasNextPage && <button type="button" className="btn-quiet mt-3 w-full" disabled={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()}>{events.isFetchingNextPage ? 'Loading…' : `Show more (${(total - rows.length).toLocaleString('en-GB')} left)`}</button>}
  </>;
}

function EventRegistrations({ event, onBack }: { event: AdminEvent; onBack: () => void }) {
  const [term, setTerm] = useState('');
  const query = useDebounced(term);
  const [showCancelled, setShowCancelled] = useState(false);
  const list = useQuery({
    queryKey: ['admin', 'event-registrations', event.id, query],
    queryFn: () => api<{ total: number; registrations: Registration[] }>(`/admin/event-registrations?${new URLSearchParams({ event: event.id, q: query })}`),
  });
  const rows = (list.data?.registrations ?? []).filter((row) => showCancelled || !row.cancelledAt);
  return <>
    <button type="button" className="mb-3 text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={onBack}>← All events</button>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[18px] font-extrabold leading-tight">{event.title}</p>
        <p className="text-[13px] text-ink-2">{event.clubName}{event.venue ? ` · ${event.venue}` : ''} · <AppLink href={appUrl(`/events/${event.slug}`)} className="underline underline-offset-2">Open in Jump</AppLink></p>
      </div>
      <div className="flex gap-4 text-[12px]">
        <Stat label="Passes" value={event.registered} />
        <Stat label="Gave up" value={event.cancelled} />
        <Stat label="Check-ins" value={event.checkIns} />
        <Stat label="New accounts" value={event.newAccounts} />
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <div className="min-w-0 flex-1"><Search value={term} onChange={setTerm} placeholder="Search name, email, phone or pass code" /></div>
      <button type="button" aria-pressed={showCancelled} onClick={() => setShowCancelled((value) => !value)} className={cx('h-11 rounded-xl border-[1.5px] px-3.5 text-[13px] font-bold', showCancelled ? 'border-ink bg-ink text-paper' : 'border-ink bg-card')}>Include given up</button>
      <button type="button" className="h-11 rounded-xl border-[1.5px] border-ink bg-card px-3.5 text-[13px] font-bold" disabled={!list.data?.registrations.length} onClick={() => download(`${event.slug}-registrations.csv`, list.data?.registrations ?? [])}>Download CSV</button>
    </div>
    <ErrorNotice error={list.error} onRetry={() => void list.refetch()} />
    {list.isLoading ? <Skeleton className="mt-3 h-64 rounded-2xl" /> : !rows.length ? <EmptyState title="No passes yet">{query ? `Nothing matches “${query}”.` : 'Nobody has registered for this event yet.'}</EmptyState>
      : <RegistrationTable rows={rows} />}
    {(list.data?.total ?? 0) > (list.data?.registrations.length ?? 0) && <p className="mt-2 text-[12px] text-ink-3">Showing the latest 100. Search to find someone, or download the CSV.</p>}
  </>;
}

function PersonHistory() {
  const [term, setTerm] = useState('');
  const query = useDebounced(term);
  const list = useQuery({
    queryKey: ['admin', 'event-registrations', 'person', query],
    queryFn: () => api<{ total: number; registrations: Registration[] }>(`/admin/event-registrations?${new URLSearchParams({ q: query })}`),
    enabled: query.length >= 3,
  });
  const rows = list.data?.registrations ?? [];
  return <>
    <Search value={term} onChange={setTerm} placeholder="Email, phone, name or pass code" />
    <p className="mt-2 text-[12px] text-ink-3">Every event someone has registered for, given up or turned up to.</p>
    <ErrorNotice error={list.error} onRetry={() => void list.refetch()} />
    {query.length < 3 ? null : list.isLoading ? <Skeleton className="mt-3 h-40 rounded-2xl" /> : !rows.length ? <EmptyState title="No registrations">Nothing matches “{query}”.</EmptyState>
      : <RegistrationTable rows={rows} withEvent />}
  </>;
}

function RegistrationTable({ rows, withEvent = false }: { rows: Registration[]; withEvent?: boolean }) {
  return <div className="mt-3 overflow-x-auto rounded-2xl border-[1.5px] border-ink bg-card">
    <table className="w-full min-w-[860px] text-left text-[13px]">
      <thead className="border-b border-line text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
        <tr>
          <th className="px-3 py-2.5">Person</th>
          {withEvent && <th className="px-3 py-2.5">Event</th>}
          <th className="px-3 py-2.5">Ticket</th>
          <th className="px-3 py-2.5">Payment</th>
          <th className="px-3 py-2.5">Registered</th>
          <th className="px-3 py-2.5">Attendance</th>
          <th className="px-3 py-2.5">Account</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => <tr key={row.id} className={cx(row.cancelledAt && 'opacity-55')}>
          <td className="px-3 py-2.5 align-top">
            <p className="font-semibold">{row.name ?? 'Runner'}</p>
            <p className="text-ink-2">{row.email}</p>
            {row.phone && <p className="num text-ink-2">{row.phone}</p>}
          </td>
          {withEvent && <td className="px-3 py-2.5 align-top"><AppLink href={appUrl(`/events/${row.eventSlug}`)} className="font-semibold hover:underline">{row.eventTitle}</AppLink><p className="text-ink-2">{row.clubName}</p></td>}
          <td className="px-3 py-2.5 align-top"><p className="font-semibold">{row.ticketType}</p><p className="font-mono text-[12px] text-ink-3">{row.passCode}</p></td>
          <td className="px-3 py-2.5 align-top">{row.paymentStatus === 'free' ? 'Free' : `${row.paymentStatus} · ${row.currency} ${(row.amountMinor / 100).toLocaleString('en-GB')}`}</td>
          <td className="px-3 py-2.5 align-top">
            <p>{day(row.registeredAt)}</p>
            <p className="text-ink-3">{SOURCE[row.source]}</p>
            {row.cancelledAt && <p className="font-semibold text-bad">Gave up {day(row.cancelledAt)}</p>}
            {!row.ticketSentAt && !row.cancelledAt && row.source !== 'app' && <p className="font-semibold text-bad">Ticket email not sent</p>}
          </td>
          <td className="px-3 py-2.5 align-top">{row.checkIns ? <><p className="font-semibold text-ok">Checked in{row.checkIns > 1 ? ` ×${row.checkIns}` : ''}</p><p className="text-ink-3">{day(row.lastCheckIn)}</p></> : <span className="text-ink-3">Not yet</span>}</td>
          <td className="px-3 py-2.5 align-top">
            <p className="flex flex-wrap gap-1">
              {row.newAccount && <Tag>New from this pass</Tag>}
              {!row.emailVerified && <Tag>Email unconfirmed</Tag>}
              {row.marketingConsent && <Tag>Opted in</Tag>}
            </p>
            {row.accountEmail !== row.email && <p className="mt-1 text-[12px] text-ink-3">Account: {row.accountEmail}</p>}
            {row.username && <AppLink href={appUrl(`/runners/${row.username}`)} className="text-[12px] font-semibold underline underline-offset-2">@{row.username}</AppLink>}
          </td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function download(filename: string, rows: Registration[]) {
  const columns: Array<[string, (row: Registration) => unknown]> = [
    ['Name', (row) => row.name], ['Email', (row) => row.email], ['Phone', (row) => row.phone], ['Ticket', (row) => row.ticketType], ['Pass code', (row) => row.passCode],
    ['Payment', (row) => row.paymentStatus], ['Amount', (row) => row.amountMinor / 100], ['Currency', (row) => row.currency], ['Source', (row) => SOURCE[row.source]],
    ['Registered', (row) => row.registeredAt], ['Gave up', (row) => row.cancelledAt], ['Check-ins', (row) => row.checkIns], ['Last check-in', (row) => row.lastCheckIn],
    ['New account', (row) => (row.newAccount ? 'yes' : 'no')], ['Marketing opt-in', (row) => (row.marketingConsent ? 'yes' : 'no')], ['Account email', (row) => row.accountEmail],
  ];
  const cell = (value: unknown) => { const text = value == null ? '' : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  const csv = [columns.map(([name]) => name).join(','), ...rows.map((row) => columns.map(([, get]) => cell(get(row))).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-card px-3">
    <SearchIcon size={16} className="shrink-0 text-ink-3" />
    <input className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} aria-label={placeholder} />
  </label>;
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return <div className={className}><p className="num text-[16px] font-extrabold leading-tight">{value.toLocaleString('en-GB')}</p><p className="text-[10.5px] uppercase tracking-[0.05em] text-ink-3">{label}</p></div>;
}

function Tag({ children, tone }: { children: ReactNode; tone?: 'bad' }) {
  return <span className={cx('rounded px-1.5 text-[10px] font-bold uppercase', tone === 'bad' ? 'bg-bad-wash text-bad' : 'bg-ink/[0.06] text-ink-2')}>{children}</span>;
}
