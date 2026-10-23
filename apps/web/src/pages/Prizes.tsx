import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FormEvent, useState } from 'react';
import { PRIZE_KIND } from '../components/ClubPrizes';
import { CountryPicker, PhoneField } from '../components/CountryPicker';
import { CheckIcon } from '../components/icons';
import { cx, EmptyState, ErrorNotice, Field, Notice, PageHeader, Skeleton, SubNav } from '../components/ui';
import { api, post } from '../lib/api';
import { countryName } from '../lib/countries';
import { formatDate } from '../lib/format';
import { toast } from '../lib/toast';
import type { AwardStatus, MyPrize } from '../lib/types';
import { YOU_NAV } from './You';

const STATUS: Record<AwardStatus, { label: string; tone: string }> = {
  AWAITING_DETAILS: { label: 'Claim it', tone: 'bg-track text-white' },
  DETAILS_SUBMITTED: { label: 'Claimed', tone: 'bg-ink text-paper' },
  READY_FOR_DISPATCH: { label: 'Being prepared', tone: 'bg-ink text-paper' },
  SHIPPED: { label: 'On its way', tone: 'bg-volt text-ink' },
  DELIVERED: { label: 'Delivered', tone: 'bg-ok text-white' },
  FORFEITED: { label: 'Passed on', tone: 'bg-ink/10 text-ink-2' },
  ISSUE: { label: 'Needs attention', tone: 'bg-bad text-white' },
};

/** Prizes you've won from club competitions: claim them, then follow them to your door. */
export function PrizesPage() {
  const prizes = useQuery({ queryKey: ['prizes', 'mine'], queryFn: () => api<MyPrize[]>('/prizes/mine') });
  const list = prizes.data ?? [];
  return <div className="animate-rise">
    <SubNav items={[...YOU_NAV]} />
    <PageHeader eyebrow="You" title="Prizes" description="Products, discounts and experiences you’ve won in club competitions." />
    <ErrorNotice error={prizes.error} onRetry={() => void prizes.refetch()} />
    {prizes.isLoading ? <Skeleton className="h-40 rounded-2xl" />
      : !list.length ? <EmptyState mark="★" title="No prizes yet" action={<Link to="/clubs" className="btn-primary btn-sm">Find club competitions</Link>}>Clubs put up prizes for their competitions. Finish near the top, or get lucky in a draw.</EmptyState>
        : <ul className="space-y-4">{list.map((prize) => <li key={prize.id}><PrizeCard prize={prize} /></li>)}</ul>}
  </div>;
}

function PrizeCard({ prize }: { prize: MyPrize }) {
  const status = STATUS[prize.status];
  const [editing, setEditing] = useState(false);
  const claimable = prize.status === 'AWAITING_DETAILS' || (prize.status === 'DETAILS_SUBMITTED' && editing);
  return <article className={cx('overflow-hidden rounded-2xl border-[1.5px] bg-card', prize.status === 'AWAITING_DETAILS' ? 'border-ink shadow-hard-sm' : 'border-line')}>
    <div className="flex gap-4 p-4">
      {prize.imageUrl ? <img src={prize.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" /> : <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-volt text-[30px] font-black">★</span>}
      <div className="min-w-0 flex-1">
        <span className={cx('inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em]', status.tone)}>{status.label}</span>
        <h2 className="mt-1.5 text-[18px] font-extrabold leading-tight">{prize.productName}</h2>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {PRIZE_KIND[prize.kind].label} from <Link to="/clubs/$id" params={{ id: prize.clubSlug }} search={{}} className="font-semibold text-ink hover:underline">{prize.clubName}</Link>
          {' · '}<Link to="/competitions/$code" params={{ code: prize.code }} className="hover:underline">{prize.title}</Link>
        </p>
        {prize.description && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{prize.description}</p>}
      </div>
    </div>

    {prize.status === 'AWAITING_DETAILS' && <p className="border-t border-line bg-track-wash px-4 py-2.5 text-[13px] font-semibold">Claim it by {formatDate(prize.detailsDueAt, { year: 'numeric' })}, or it passes to the next finisher.</p>}
    {claimable && <ClaimForm prize={prize} onDone={() => setEditing(false)} />}

    {!claimable && prize.status !== 'FORFEITED' && prize.status !== 'AWAITING_DETAILS' && <div className="space-y-3 border-t border-line px-4 py-3 text-[13px]">
      {prize.redeemInstructions && <div className="rounded-xl bg-ok-wash p-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ok">How to redeem</p>
        <p className="mt-1 whitespace-pre-line text-[14px] text-ink">{prize.redeemInstructions}</p>
      </div>}
      {prize.kind === 'product' && prize.address && <p className="text-ink-2">Delivering to <b className="text-ink">{prize.fullName}</b>, {prize.address}, {prize.city}, {prize.region}, {prize.country ? countryName(prize.country) : ''}</p>}
      {prize.kind !== 'product' && prize.fullName && <p className="text-ink-2">Claimed as <b className="text-ink">{prize.fullName}</b>{prize.phone ? ` · ${prize.phone}` : ''}</p>}
      {prize.trackingNote && <p className="text-ink-2">Update from {prize.clubName}: <b className="text-ink">{prize.trackingNote}</b></p>}
      {prize.shippingNote && <p className="text-ink-3">{prize.shippingNote}</p>}
      {prize.status === 'DETAILS_SUBMITTED' && <button type="button" className="text-[13px] font-semibold text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => setEditing(true)}>Change my details</button>}
      {prize.status === 'ISSUE' && <Notice tone="warn">The club flagged a problem with this prize. They or Jump will contact you.</Notice>}
    </div>}
    {prize.status === 'FORFEITED' && <p className="border-t border-line px-4 py-3 text-[13px] text-ink-2">{prize.forfeitReason ?? 'This prize passed to the next finisher.'}</p>}
  </article>;
}

/** Only what the prize needs: a delivery address for products, a phone for experiences, a name for discounts. */
function ClaimForm({ prize, onDone }: { prize: MyPrize; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(prize.fullName ?? '');
  const [phone, setPhone] = useState(prize.phone ?? '');
  const [address, setAddress] = useState(prize.address ?? '');
  const [city, setCity] = useState(prize.city ?? '');
  const [region, setRegion] = useState(prize.region ?? '');
  const [country, setCountry] = useState(prize.country ?? (prize.deliveryCountries.length === 1 ? prize.deliveryCountries[0] : ''));
  const [notes, setNotes] = useState(prize.deliveryNotes ?? '');
  const product = prize.kind === 'product';
  const needsPhone = prize.kind !== 'discount';
  const claim = useMutation({
    mutationFn: () => post(`/prizes/${prize.id}/details`, {
      fullName: fullName.trim(),
      ...(needsPhone ? { phone } : {}),
      ...(product ? { address: address.trim(), city: city.trim(), region: region.trim(), country } : {}),
      ...(notes.trim() ? { deliveryNotes: notes.trim() } : {}),
    }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['prizes'] });
      toast({ tone: 'ok', title: 'Claimed', message: product ? `${prize.clubName} will send it to you.` : 'You can see how to redeem it now.' });
      onDone();
    },
  });
  const outside = product && country && !prize.deliveryCountries.includes(country);
  const ready = fullName.trim().length >= 2 && (!needsPhone || phone.length >= 8) && (!product || (address.trim().length >= 5 && city.trim().length >= 2 && region.trim().length >= 2 && country && !outside));
  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready) claim.mutate();
  }
  return <form onSubmit={submit} className="space-y-4 border-t border-line px-4 py-4">
    <p className="text-[13px] text-ink-2">
      {product ? `Where should ${prize.clubName} send it? Only they${prize.fulfilment === 'jump' ? ' and Jump' : ''} see these details, and only until it’s delivered.` : prize.kind === 'experience' ? `${prize.clubName} will use your phone number to arrange it.` : 'Confirm your name to see how to redeem it.'}
    </p>
    <Field label="Full name">{(props) => <input {...props} className="field" autoComplete="name" maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} required />}</Field>
    {needsPhone && <Field label="Phone">{(props) => <PhoneField id={props.id} value={phone} onChange={setPhone} defaultCountry={country || 'NG'} required />}</Field>}
    {product && <>
      <Field label="Street address">{(props) => <input {...props} className="field" autoComplete="street-address" maxLength={300} value={address} onChange={(event) => setAddress(event.target.value)} required />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="City">{(props) => <input {...props} className="field" autoComplete="address-level2" maxLength={80} value={city} onChange={(event) => setCity(event.target.value)} required />}</Field>
        <Field label="State or region">{(props) => <input {...props} className="field" autoComplete="address-level1" maxLength={80} value={region} onChange={(event) => setRegion(event.target.value)} required />}</Field>
      </div>
      <Field label="Country" error={outside ? `${prize.clubName} only delivers to ${prize.deliveryCountries.map(countryName).join(', ')}.` : undefined}>
        {(props) => <CountryPicker id={props.id} value={country} onChange={setCountry} required />}
      </Field>
    </>}
    <Field label={product ? 'Delivery notes' : 'Anything the club should know'} optional>
      {(props) => <textarea {...props} className="field min-h-[60px] py-2.5" maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={product ? 'Landmark, best time to call' : ''} />}
    </Field>
    <ErrorNotice error={claim.error} />
    <button className="btn-primary w-full sm:w-auto sm:px-8" disabled={!ready || claim.isPending}><CheckIcon size={16} /> {claim.isPending ? 'Sending…' : prize.status === 'DETAILS_SUBMITTED' ? 'Update details' : 'Claim prize'}</button>
  </form>;
}
