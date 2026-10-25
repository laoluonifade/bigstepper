import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRightIcon } from '../components/icons';
import { cx } from '../components/ui';
import { api } from '../lib/api';
import { countryName, flag } from '../lib/countries';

/** Jump in numbers, from the API (totals only, cached there for 10 minutes). */
type Stats = {
  runners: number; countries: number; verifiedKm: number; activities: number; participants: number; competitions: number;
  topCountries: Array<{ code: string; runners: number }>;
};

const EMAIL = 'start@startajump.com';
const mail = (subject: string) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;
const LAUNCH = mail('Launch a sponsored competition on Jump');
const TALK = mail('Brand partnership with Jump');
const count = (value: number | undefined) => (value === undefined ? '–' : value.toLocaleString('en-GB'));

function Ctas({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      <a href={LAUNCH} className="btn-primary min-h-12 px-6">Launch a sponsored competition <ArrowRightIcon size={17} /></a>
      <a href={TALK} className={cx('btn-secondary min-h-12 px-6', dark && 'border-paper/40 bg-transparent text-paper')}>Talk to our team</a>
    </div>
  );
}

/**
 * For brands: why sponsor a competition on Jump, our live numbers, and a preview of their own
 * competition (type a brand name and the mock-up updates). Public, made to be shared as a link.
 */
export function BrandsPage() {
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: () => api<Stats>('/stats'), staleTime: 5 * 60_000 });
  const s = stats.data;
  const numbers = [
    { value: count(s?.runners), label: 'Runners and walkers', body: 'An active fitness community on Jump.' },
    { value: count(s?.countries), label: 'Countries reached', body: 'Participants across different markets.' },
    { value: count(s?.verifiedKm), label: 'Verified kilometres', body: 'Every one GPS-checked before it counts.' },
    { value: count(s?.participants), label: 'Competition participants', body: 'People actively taking part in challenges.' },
  ];

  return (
    <div className="animate-rise">
      {/* Hero */}
      <section className="py-12 sm:py-16">
        <p className="eyebrow">Jump for brands</p>
        <h1 className="display mt-3 max-w-4xl text-[clamp(40px,8vw,84px)] uppercase leading-[0.88] tracking-[-0.04em]">
          Build your next global brand on Jump<span className="text-track">.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-ink-2 sm:text-[20px]">
          Reach runners and walkers across countries and cities through sponsored competitions. Put your brand in front of an active fitness community, drive direct engagement, and build visibility beyond traditional advertising.
        </p>
        <div className="mt-8"><Ctas /></div>
      </section>

      {/* Numbers */}
      <section className="rounded-2xl bg-ink px-5 py-10 text-paper sm:px-10">
        <p className="eyebrow text-paper/55">Your brand. A global community.</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {numbers.map((item) => (
            <div key={item.label}>
              <p className="score text-[48px] text-volt sm:text-[56px]">{item.value}</p>
              <p className="mt-1 text-[14px] font-bold uppercase tracking-[0.08em]">{item.label}</p>
              <p className="mt-1 text-[14px] text-paper/65">{item.body}</p>
            </div>
          ))}
        </div>
        {s && s.topCountries.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2 border-t border-paper/15 pt-6">
            {s.topCountries.map((country) => (
              <span key={country.code} className="inline-flex items-center gap-2 rounded-full bg-paper/10 px-3 py-1.5 text-[13px] font-semibold">
                <span>{flag(country.code)}</span>{countryName(country.code)}<span className="text-paper/55">{country.runners.toLocaleString('en-GB')}</span>
              </span>
            ))}
          </div>
        )}
        <p className="mt-6 text-[12px] text-paper/45">Live from Jump{s ? ` · ${count(s.activities)} verified activities · ${count(s.competitions)} competitions run` : ''}.</p>
      </section>

      {/* Markets */}
      <section className="grid gap-10 py-16 lg:grid-cols-2">
        <div>
          <p className="eyebrow">One platform. Multiple markets.</p>
          <h2 className="display mt-3 text-[clamp(30px,5vw,48px)] uppercase leading-[0.95]">Launch in one city, across states, or in different countries.</h2>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {[
            ['Choose your locations', 'Target the markets relevant to your brand.'],
            ['Reach active communities', 'Put your competition in front of runners and walkers.'],
            ['Drive engagement', 'Give people a reason to interact with your brand.'],
            ['Scale your campaign', 'Expand into new locations and run recurring competitions.'],
          ].map(([title, body]) => (
            <li key={title} className="panel p-5">
              <p className="text-[16px] font-bold">{title}</p>
              <p className="mt-1 text-[14px] text-ink-2">{body}</p>
            </li>
          ))}
          <li className="text-[12px] text-ink-3 sm:col-span-2">Geographic availability and targeting depend on participant coverage and campaign setup.</li>
        </ul>
      </section>

      {/* Preview */}
      <BrandPreview />

      {/* Outcomes */}
      <section className="py-16">
        <p className="eyebrow">Turn visibility into participation</p>
        <h2 className="display mt-3 max-w-3xl text-[clamp(30px,5vw,48px)] uppercase leading-[0.95]">A reason to engage, discover and come back.</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          {['Brand awareness', 'Product discovery', 'Community growth', 'Repeat engagement'].map((outcome) => (
            <p key={outcome} className="rounded-xl border-[1.5px] border-ink bg-volt px-4 py-5 text-[15px] font-extrabold uppercase tracking-[0.04em] text-ink">{outcome}</p>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="mb-12 rounded-2xl bg-ink px-5 py-12 text-paper sm:px-10">
        <h2 className="display text-[clamp(32px,6vw,60px)] uppercase leading-[0.92]">Ready to reach your next market?</h2>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-paper/75">Bring your brand to Jump. Tell us which countries, states or cities you want to reach and what you want your campaign to achieve.</p>
        <div className="mt-8"><Ctas dark /></div>
        <p className="mt-8 text-[14px] text-paper/60">
          <a href={`mailto:${EMAIL}`} className="font-semibold text-paper underline">{EMAIL}</a> · <a href="https://startajump.com" className="font-semibold text-paper underline">startajump.com</a>
        </p>
      </section>
    </div>
  );
}

/** What their competition could look like: type a brand name and watch it fill in. */
function BrandPreview() {
  const [brand, setBrand] = useState('');
  const name = brand.trim() || 'Your Brand';
  const rows = [['1', 'Ada O.', '48,210'], ['2', 'Tunde B.', '45,977'], ['3', 'Chioma E.', '41,302'], ['4', 'You', '38,640']];
  return (
    <section className="grid items-center gap-10 rounded-2xl border-[1.5px] border-ink bg-card px-5 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <p className="eyebrow">This is what your brand could look like on Jump</p>
        <h2 className="display mt-3 text-[clamp(30px,5vw,48px)] uppercase leading-[0.95]">Your brand. Your competition. Your audience.</h2>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2">Give people more than an advert to scroll past: a sponsored competition they discover, join and compete in. Your brand isn’t displayed alongside it; it becomes the experience.</p>
        <label className="mt-6 block max-w-sm">
          <span className="text-[13px] font-bold">Try it with your brand</span>
          <input className="field mt-2" placeholder="Type your brand name" maxLength={24} value={brand} onChange={(event) => setBrand(event.target.value)} />
        </label>
        <ul className="mt-6 grid gap-2 text-[14px] text-ink-2 sm:grid-cols-2">
          {['Your logo and campaign banner', 'A competition in your name', 'People competing on the leaderboard', 'Your products as the prizes'].map((item) => (
            <li key={item} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-track" />{item}</li>
          ))}
        </ul>
        <div className="mt-8"><a href={LAUNCH} className="btn-primary min-h-12 px-6">Launch a sponsored competition <ArrowRightIcon size={17} /></a></div>
      </div>

      {/* The phone */}
      <div className="mx-auto w-full max-w-[340px] rounded-[44px] border-[10px] border-ink bg-paper p-3 shadow-hard">
        <div className="relative overflow-hidden rounded-2xl bg-track px-4 pb-4 pt-3 text-ink">
          <div className="flex gap-1.5"><span className="tag bg-card">Free</span><span className="tag bg-card">Steps</span><span className="tag border-ok/50 bg-ok-wash text-ok">● Open</span></div>
          <div className="mt-6 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="score text-[40px] leading-[0.9]">50K</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">Steps challenge</p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-volt text-[11px] font-black uppercase">{name.slice(0, 2)}</span>
          </div>
        </div>
        <p className="wide mt-3 truncate text-[18px] font-black uppercase">{name} 50K Steps</p>
        <p className="mt-0.5 text-[12px] text-ink-2"><b>{name}</b> is hosting · 1,284 joined</p>
        <div className="mt-3 rounded-lg border-[1.5px] border-ink bg-card px-3 py-2 text-[12px]"><b>To be won:</b> {name} gift box (1st) and 5 more prizes</div>
        <div className="mt-3 overflow-hidden rounded-lg border-[1.5px] border-ink bg-card">
          {rows.map(([rank, who, steps]) => (
            <div key={rank} className={cx('flex items-center gap-3 border-b border-line px-3 py-2 text-[13px] last:border-b-0', who === 'You' && 'bg-volt')}>
              <span className="score w-4 text-[15px]">{rank}</span>
              <span className="flex-1 font-semibold">{who}</span>
              <span className="score text-[15px]">{steps}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md border-[1.5px] border-ink bg-track py-3 text-center text-[12px] font-black uppercase tracking-[0.08em]">Join challenge</div>
      </div>
    </section>
  );
}
