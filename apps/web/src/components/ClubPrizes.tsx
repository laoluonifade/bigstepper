import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { countryName, flag } from '../lib/countries';
import { PRIZE_KIND, type PrizeDraft } from '@jump/shared/prizes';
import type { ClubPrize, ClubPrizeTerms, PrizeKind } from '../lib/types';
import { CountryPicker } from './CountryPicker';
import { CameraIcon, CloseIcon, PlusIcon, TrashIcon } from './icons';
import { prepare } from './Profile';
import { cx, ErrorNotice, Field, SectionTitle } from './ui';

export { EMPTY_PRIZES, PRIZE_KIND, prizeProblem, prizesPayload, type PrizeDraft } from '@jump/shared/prizes';

/** A list of countries: chips with a picker to add one. Empty can mean "everyone" (see `emptyLabel`). */
export function CountriesField({ value, onChange, label, hint, emptyLabel }: { value: string[]; onChange: (next: string[]) => void; label: string; hint?: string; emptyLabel?: string }) {
  const [adding, setAdding] = useState('');
  return <div>
    <p className="label">{label}</p>
    <div className="flex flex-wrap gap-1.5">
      {value.length === 0 && emptyLabel && <span className="inline-flex h-8 items-center rounded-full bg-ink/[0.06] px-3 text-[13px] font-semibold text-ink-2">{emptyLabel}</span>}
      {value.map((code) => <span key={code} className="inline-flex h-8 items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-card pl-2.5 pr-1 text-[13px] font-semibold">
        <span className="text-[15px] leading-none">{flag(code)}</span>{countryName(code)}
        <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.06] hover:text-ink" aria-label={`Remove ${countryName(code)}`} onClick={() => onChange(value.filter((item) => item !== code))}><CloseIcon size={12} /></button>
      </span>)}
    </div>
    <div className="mt-2 max-w-xs">
      <CountryPicker value={adding} placeholder="Add a country" onChange={(code) => { if (!value.includes(code)) onChange([...value, code]); setAdding(''); }} />
    </div>
    {hint && <p className="hint">{hint}</p>}
  </div>;
}

/**
 * The club's prizes for a competition: tiers (each for one or more winners), how winners are chosen,
 * where prizes can go, who delivers, and the claim terms.
 */
export function PrizeEditor({ clubSlug, value, onChange }: { clubSlug: string; value: PrizeDraft; onChange: (next: PrizeDraft) => void }) {
  const set = <K extends keyof PrizeDraft>(key: K, next: PrizeDraft[K]) => onChange({ ...value, [key]: next });
  const setPrize = (index: number, next: Partial<ClubPrize>) => set('prizes', value.prizes.map((prize, i) => i === index ? { ...prize, ...next } : prize));
  let place = 1;
  return <div className="space-y-5">
    <ul className="space-y-3">
      {value.prizes.map((prize, index) => {
        const from = place;
        place += Math.max(1, prize.quantity || 1);
        const range = prize.quantity > 1 ? `${from}–${from + prize.quantity - 1}` : `${from}`;
        return <li key={index} className="overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-line bg-ink/[0.03] px-4 py-2.5">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.08em]">{value.selection === 'draw' ? `Prize ${index + 1}` : `${prize.quantity > 1 ? 'Places' : 'Place'} ${range}`}</p>
            {value.prizes.length > 1 && <button type="button" className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-bad-wash hover:text-bad" aria-label="Remove prize" onClick={() => set('prizes', value.prizes.filter((_, i) => i !== index))}><TrashIcon size={15} /></button>}
          </div>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-3 rounded-xl bg-ink/[0.06] p-1" role="radiogroup" aria-label="Kind of prize">
              {(Object.keys(PRIZE_KIND) as PrizeKind[]).map((kind) => <button key={kind} type="button" role="radio" aria-checked={prize.kind === kind} onClick={() => setPrize(index, { kind })}
                className={cx('h-9 rounded-lg text-[13px] font-bold transition-colors', prize.kind === kind ? 'bg-card text-ink shadow-[0_1px_0_rgba(0,0,0,0.08),0_0_0_1.5px_#121212]' : 'text-ink-2')}>{PRIZE_KIND[kind].label}</button>)}
            </div>
            <div className="flex items-start gap-3">
              <PrizePhoto clubSlug={clubSlug} url={prize.imageUrl ?? null} onChange={(imageUrl) => setPrize(index, { imageUrl })} />
              <label className="min-w-0 flex-1">
                <span className="label">What they win</span>
                <input className="field" maxLength={120} value={prize.productName} onChange={(event) => setPrize(index, { productName: event.target.value })} placeholder={prize.kind === 'discount' ? '30% off any order' : prize.kind === 'experience' ? 'Session with our coach' : 'Running shoes'} />
              </label>
            </div>
            <p className="-mt-2 text-[12px] leading-snug text-ink-3">{PRIZE_KIND[prize.kind].hint}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="label">Winners</span>
                <div className="flex h-12 items-center rounded border-[1.5px] border-line bg-white">
                  <button type="button" className="flex h-full w-11 items-center justify-center text-[20px] font-bold text-ink-2 disabled:opacity-30" disabled={prize.quantity <= 1} onClick={() => setPrize(index, { quantity: Math.max(1, prize.quantity - 1) })} aria-label="Fewer winners">−</button>
                  <input className="num h-full min-w-0 flex-1 bg-transparent text-center text-[16px] font-bold outline-none" inputMode="numeric" value={prize.quantity || ''} aria-label="Number of winners"
                    onChange={(event) => setPrize(index, { quantity: Math.min(1000, Math.max(0, Math.floor(Number(event.target.value.replace(/\D/g, '')) || 0))) })} />
                  <button type="button" className="flex h-full w-11 items-center justify-center text-[20px] font-bold text-ink-2" onClick={() => setPrize(index, { quantity: Math.min(1000, prize.quantity + 1) })} aria-label="More winners">+</button>
                </div>
              </div>
              <label>
                <span className="label">Value</span>
                <span className="relative block">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-ink-2">₦</span>
                  <input className="field num pl-8" inputMode="numeric" value={prize.estimatedValue ? prize.estimatedValue.toLocaleString('en-NG') : ''} placeholder="Optional"
                    onChange={(event) => { const digits = event.target.value.replace(/\D/g, ''); setPrize(index, { estimatedValue: digits ? Math.min(100_000_000, Number(digits)) : null, currency: 'NGN' }); }} />
                </span>
              </label>
            </div>
            <PrizeExtra label="details" value={prize.description ?? ''} placeholder="Size, colour, what’s included" max={600} onChange={(description) => setPrize(index, { description })} title="Details" />
            {prize.kind !== 'product' && <PrizeExtra label="how to redeem" value={prize.redeemInstructions ?? ''} max={600} onChange={(redeemInstructions) => setPrize(index, { redeemInstructions })} title="How to redeem"
              hint="Only winners see this, after they claim." placeholder={prize.kind === 'discount' ? 'Use code JUMPWIN30 at checkout before 31 Dec.' : 'We’ll call you to book a date.'} />}
          </div>
        </li>;
      })}
    </ul>
    {value.prizes.length < 20 && <button type="button" className="flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-ink/40 text-[14px] font-bold text-ink-2 hover:border-ink hover:text-ink" onClick={() => set('prizes', [...value.prizes, { position: value.prizes.length + 1, kind: 'product', productName: '', quantity: 1 }])}><PlusIcon size={16} /> Add another prize</button>}

    <p className="border-t border-line pt-5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-ink-2">Prize rules</p>
    <fieldset>
      <legend className="label">How winners are chosen</legend>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
        {([['top', 'Top finishers', 'Prizes go down the final leaderboard, in order.'], ['draw', 'Random draw', 'Everyone who qualifies has an equal chance. The draw is recorded.']] as const).map(([option, title, body]) =>
          <label key={option} className={cx('cursor-pointer rounded-md border-[1.5px] p-3 transition-colors', value.selection === option ? 'border-ink bg-ink text-paper' : 'border-line bg-card hover:border-ink-3')}>
            <input type="radio" className="sr-only" checked={value.selection === option} onChange={() => set('selection', option)} />
            <span className="block text-[13px] font-bold">{title}</span>
            <span className={cx('mt-0.5 block text-[12px] leading-snug', value.selection === option ? 'text-paper/70' : 'text-ink-2')}>{body}</span>
          </label>)}
      </div>
      <p className="hint">Winners must have scored, met the minimums and live where you deliver. Your club’s managers can’t win.</p>
    </fieldset>

    <CountriesField label="Where you can deliver prizes" value={value.deliveryCountries} onChange={(next) => set('deliveryCountries', next)} hint="Only people living in these countries can win." />

    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Who delivers">
        {(props) => <select {...props} className="field" value={value.fulfilment} onChange={(event) => set('fulfilment', event.target.value as PrizeDraft['fulfilment'])}>
          <option value="club">Our club</option><option value="jump">Jump (agreed with us)</option>
        </select>}
      </Field>
      <Field label="Who pays delivery">
        {(props) => <select {...props} className="field" value={value.shipping} onChange={(event) => set('shipping', event.target.value as PrizeDraft['shipping'])}>
          <option value="club">Our club</option><option value="jump">Jump</option><option value="other">Other (explain below)</option>
        </select>}
      </Field>
    </div>
    <Field label="Fulfilment terms" optional hint="How long delivery takes, collection options, anything winners should know.">
      {(props) => <textarea {...props} className="field min-h-[60px] py-2.5" maxLength={300} value={value.shippingNote} onChange={(event) => set('shippingNote', event.target.value)} placeholder="Delivered within 10 working days of claiming. Lagos winners can collect from our store." />}
    </Field>
    <PrizeExtra title="Eligibility notes" label="eligibility notes" value={value.eligibilityNote} max={600} onChange={(next) => set('eligibilityNote', next)} placeholder="18+ only. One prize per person." />
    <Field label="Days to claim" hint="Unclaimed prizes pass to the next eligible finisher.">
      {(props) => <input {...props} className="field num max-w-28" type="number" min={3} max={60} value={value.claimDays} onChange={(event) => set('claimDays', Math.min(60, Math.max(3, Math.floor(Number(event.target.value) || 14))))} />}
    </Field>
  </div>;
}

/** An optional text, behind a link until it's wanted, so each prize stays short on a phone. */
function PrizeExtra({ title, label, value, onChange, placeholder, hint, max }: { title: string; label: string; value: string; onChange: (value: string) => void; placeholder: string; hint?: string; max: number }) {
  const [open, setOpen] = useState(Boolean(value));
  if (!open) return <button type="button" className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={() => setOpen(true)}><PlusIcon size={13} /> Add {label}</button>;
  return <label className="block">
    <span className="label">{title}</span>
    <textarea className="field min-h-[64px] py-2.5" maxLength={max} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoFocus={!value} />
    {hint && <span className="hint">{hint}</span>}
  </label>;
}

function PrizePhoto({ clubSlug, url, onChange }: { clubSlug: string; url: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      const blob = await prepare(file);
      form.append('file', blob, blob === file ? file.name : 'prize.jpg');
      return api<{ url: string }>(`/clubs/${clubSlug}/prize-images`, { method: 'POST', body: form });
    },
    onSuccess: (result) => onChange(result.url),
  });
  return <div className="shrink-0">
    <button type="button" onClick={() => input.current?.click()} disabled={upload.isPending}
      className="relative mt-[22px] flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border-[1.5px] border-dashed border-ink/40 bg-paper text-ink-3 hover:border-ink" aria-label={url ? 'Change prize photo' : 'Add a prize photo'}>
      {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : upload.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" /> : <CameraIcon size={18} />}
    </button>
    {url && <button type="button" className="mt-0.5 block w-full text-center text-[11px] font-semibold text-ink-3 hover:text-bad" onClick={() => onChange(null)}>Remove</button>}
    <input ref={input} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ''; }} />
    <ErrorNotice error={upload.error} />
  </div>;
}

/** On a competition's page: what can be won, how winners are chosen, and the terms. */
export function PrizeTerms({ terms, clubName }: { terms: ClubPrizeTerms; clubName?: string }) {
  let place = 1;
  return <section>
    <SectionTitle aside={clubName ? <span className="text-[12px] text-ink-3">From {clubName}</span> : undefined}>Prizes</SectionTitle>
    <ul className="grid gap-3 sm:grid-cols-2">
      {terms.prizes.map((prize) => {
        const from = place;
        place += prize.quantity;
        return <li key={prize.position} className="flex gap-3 rounded-xl border-[1.5px] border-ink bg-card p-3">
          {prize.imageUrl ? <img src={prize.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-volt text-[22px] font-black">{terms.selection === 'draw' ? '★' : from}</span>}
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-3">
              {terms.selection === 'draw' ? `${prize.quantity} ${prize.quantity === 1 ? 'winner' : 'winners'} by draw` : prize.quantity > 1 ? `Places ${from}–${from + prize.quantity - 1}` : `Place ${from}`} · {PRIZE_KIND[prize.kind].label}
            </p>
            <p className="text-[15px] font-bold leading-snug">{prize.productName}</p>
            {prize.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-2">{prize.description}</p>}
            {prize.estimatedValue ? <p className="num mt-0.5 text-[12px] text-ink-3">Worth about ₦{prize.estimatedValue.toLocaleString('en-NG')}</p> : null}
          </div>
        </li>;
      })}
    </ul>
    {terms.winners.length > 0 && <div className="mt-4 rounded-xl bg-ok-wash p-3">
      <p className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-ok">Winners</p>
      <ul className="mt-1 space-y-0.5 text-[14px]">{terms.winners.map((winner, index) => <li key={index}><b>{winner.displayName}</b> · {winner.productName}</li>)}</ul>
    </div>}
    <ul className="mt-4 space-y-1.5 text-[13px] leading-relaxed text-ink-2">
      <li>{terms.selection === 'draw' ? 'Winners are drawn at random from everyone who qualifies, once the competition ends. The draw is recorded so it can be checked.' : 'Prizes go down the final leaderboard to people who qualify.'}</li>
      <li>Open to people living in {terms.deliveryCountries.map(countryName).join(', ')}. The club’s managers can’t win.</li>
      <li>Winners have {terms.claimDays} days to claim, or the prize passes to the next eligible finisher. {terms.fulfilment === 'jump' ? 'Jump delivers the prizes.' : 'The club delivers the prizes.'} {terms.shipping === 'club' ? 'The club pays delivery.' : terms.shipping === 'jump' ? 'Jump pays delivery.' : ''}</li>
      {terms.shippingNote && <li>{terms.shippingNote}</li>}
      {terms.eligibilityNote && <li>{terms.eligibilityNote}</li>}
    </ul>
  </section>;
}
