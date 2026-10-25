import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ChallengeMark } from '../components/competition';
import { ArrowRightIcon } from '../components/icons';
import { RankBadge } from '../components/Leaderboard';
import { Avatar, CountUp, cx } from '../components/ui';
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
const thousands = (n: number) => Math.round(n).toLocaleString('en-GB');

/** True once the element has scrolled into view (and stays true), so numbers count up when seen. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setSeen(true); }, { threshold: 0.3 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

function Ctas({ dark = false, delay = 0 }: { dark?: boolean; delay?: number }) {
  return (
    <div className="flex animate-rise-lg flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center" style={{ animationDelay: `${delay}ms` }}>
      <a href={LAUNCH} className="btn-primary min-h-12 px-6">Sponsor a competition <ArrowRightIcon size={17} /></a>
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
  const [numbersRef, numbersSeen] = useInView<HTMLDivElement>();
  const numbers = [
    { value: s?.runners, label: 'Runners & walkers', body: 'An active fitness community.' },
    { value: s?.countries, label: 'Countries', body: 'Participants across markets.' },
    { value: s?.verifiedKm, label: 'Verified km', body: 'Every one GPS-checked.' },
    { value: s?.participants, label: 'Competitors', body: 'Taking part in challenges.' },
  ];

  return (
    <div className="mx-auto max-w-6xl text-center">
      {/* Hero: the landing page's line-by-line reveal. */}
      <section className="py-14 sm:py-20">
        <p className="eyebrow animate-rise">Jump for brands</p>
        <h1 className="display mx-auto mt-4 max-w-4xl text-[clamp(40px,9vw,92px)] uppercase leading-[0.86] tracking-[-0.045em]">
          <span className="reveal-line"><span>Build your</span></span>
          <span className="reveal-line"><span className="[animation-delay:90ms]">next global</span></span>
          <span className="reveal-line"><span className="[animation-delay:180ms]">brand on Jump<span className="inline-block animate-pop text-track [animation-delay:750ms]">.</span></span></span>
        </h1>
        <p className="mx-auto mt-7 max-w-2xl animate-rise-lg text-[17px] leading-relaxed text-ink-2 [animation-delay:350ms] sm:text-[20px]">
          Reach runners and walkers across countries and cities through sponsored competitions. Put your brand in front of an active fitness community and build visibility beyond traditional advertising.
        </p>
        <div className="mx-auto mt-8 max-w-md sm:max-w-none"><Ctas delay={480} /></div>
      </section>

      {/* Live numbers, counting up when they scroll into view. */}
      <section ref={numbersRef} className="rounded-3xl bg-ink px-5 py-10 text-paper sm:px-10 sm:py-14">
        <p className="eyebrow text-paper/55">Your brand. A global community.</p>
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
          {numbers.map((item, index) => (
            <div key={item.label} className={cx('opacity-0', numbersSeen && 'animate-rise')} style={{ animationDelay: `${index * 110}ms` }}>
              <p className="score text-[clamp(40px,11vw,64px)] leading-none text-volt">
                {item.value === undefined ? '–' : <CountUp value={numbersSeen ? item.value : 0} format={thousands} />}
              </p>
              <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.1em] sm:text-[14px]">{item.label}</p>
              <p className="mt-1 text-[13px] text-paper/60 sm:text-[14px]">{item.body}</p>
            </div>
          ))}
        </div>
        {s && s.topCountries.length > 0 && (
          <div className="mt-10 flex flex-wrap justify-center gap-2 border-t border-paper/15 pt-8">
            {s.topCountries.map((country, index) => (
              <span key={country.code} className={cx('inline-flex items-center gap-2 rounded-full bg-paper/10 px-3.5 py-1.5 text-[13px] font-semibold opacity-0', numbersSeen && 'animate-pop')}
                style={{ animationDelay: `${450 + index * 80}ms` }}>
                <span>{flag(country.code)}</span>{countryName(country.code)}<span className="num text-paper/55">{country.runners.toLocaleString('en-GB')}</span>
              </span>
            ))}
          </div>
        )}
        {s && <p className="mt-6 text-[12px] text-paper/45">Live from Jump · {thousands(s.activities)} verified activities · {thousands(s.competitions)} competitions run</p>}
      </section>

      {/* Markets */}
      <section className="py-16 sm:py-20">
        <p className="eyebrow">One platform. Multiple markets.</p>
        <h2 className="display mx-auto mt-3 max-w-3xl text-[clamp(28px,6vw,48px)] uppercase leading-[0.95]">One city, many states, or different countries.</h2>
        <ul className="stagger mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
          {[
            ['Choose your locations', 'Target the markets that matter to your brand.'],
            ['Reach active communities', 'Your competition in front of runners and walkers.'],
            ['Drive engagement', 'Give people a reason to interact with your brand.'],
            ['Scale your campaign', 'New locations and recurring competitions.'],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border-[1.5px] border-ink bg-card p-5 shadow-hard-sm">
              <p className="wide text-[15px] font-black uppercase">{title}</p>
              <p className="mt-1 text-[14px] text-ink-2">{body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[12px] text-ink-3">Geographic availability and targeting depend on participant coverage and campaign setup.</p>
      </section>

      <BrandPreview />

      {/* Outcomes */}
      <section className="py-16 sm:py-20">
        <p className="eyebrow">Turn visibility into participation</p>
        <h2 className="display mx-auto mt-3 max-w-3xl text-[clamp(28px,6vw,48px)] uppercase leading-[0.95]">A reason to engage, discover and come back.</h2>
        <div className="stagger mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-3 lg:grid-cols-4">
          {['Brand awareness', 'Product discovery', 'Community growth', 'Repeat engagement'].map((outcome) => (
            <p key={outcome} className="rounded-xl border-[1.5px] border-ink bg-volt px-3 py-5 text-[13px] font-extrabold uppercase tracking-[0.04em] shadow-hard-sm sm:text-[15px]">{outcome}</p>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="mb-12 rounded-3xl bg-ink px-5 py-14 text-paper sm:px-10">
        <h2 className="display mx-auto max-w-3xl text-[clamp(32px,7vw,60px)] uppercase leading-[0.92]">Ready to reach your next market?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-paper/75 sm:text-[17px]">Tell us which countries, states or cities you want to reach and what you want your campaign to achieve.</p>
        <div className="mx-auto mt-8 max-w-md sm:max-w-none"><Ctas dark /></div>
        <p className="mt-8 text-[14px] text-paper/60">
          <a href={`mailto:${EMAIL}`} className="font-semibold text-paper underline">{EMAIL}</a> · <a href="https://startajump.com" className="font-semibold text-paper underline">startajump.com</a>
        </p>
      </section>
    </div>
  );
}

const SAMPLE_BOARD = [
  { rank: 1, name: 'Ada Okafor', steps: 48210 },
  { rank: 2, name: 'Tunde Bakare', steps: 45977 },
  { rank: 3, name: 'Chioma Eze', steps: 41302 },
  { rank: 4, name: 'You', steps: 38640 },
];

/** What their competition could look like, drawn with Jump's own pieces: type a brand name and it fills in. */
function BrandPreview() {
  const [brand, setBrand] = useState('');
  const name = brand.trim() || 'Your Brand';
  return (
    <section className="grid items-center gap-10 rounded-3xl border-[1.5px] border-ink bg-card px-5 py-12 shadow-hard sm:px-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:text-left">
      <div>
        <p className="eyebrow">What your brand could look like on Jump</p>
        <h2 className="display mt-3 text-[clamp(28px,6vw,48px)] uppercase leading-[0.95]">Your brand. Your competition. Your audience.</h2>
        <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2 lg:mx-0">More than an advert to scroll past: a sponsored competition people discover, join and compete in.</p>
        <label className="mx-auto mt-6 block max-w-sm text-left lg:mx-0">
          <span className="text-[13px] font-bold">Try it with your brand</span>
          <input className="field mt-2" placeholder="Type your brand name" maxLength={24} value={brand} onChange={(event) => setBrand(event.target.value)} />
        </label>
      </div>

      {/* The phone: the competition page as Jump draws it. */}
      <div className="mx-auto w-full max-w-[340px] animate-rise-lg rounded-[44px] border-[10px] border-ink bg-paper p-3 text-left shadow-hard">
        <div className="relative overflow-hidden rounded-xl border-[1.5px] border-ink bg-track px-4 pb-4 pt-3 text-ink">
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]" preserveAspectRatio="none" viewBox="0 0 400 200" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((lane) => <path key={lane} d={`M-20 ${200 - lane * 26}C120 ${180 - lane * 30} 240 ${120 - lane * 22} 420 ${60 - lane * 18}`} fill="none" stroke="currentColor" strokeWidth="3" />)}
          </svg>
          <div className="relative flex flex-wrap gap-1.5">
            <span className="tag border-ink bg-card">Free</span>
            <span className="tag bg-paper text-ink">Steps</span>
            <span className="tag gap-1.5 border-ok/50 bg-ok-wash text-ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Open</span>
          </div>
          <div className="relative mt-7 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="score text-[44px] uppercase leading-[0.85]">50K</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">Steps to the top</p>
            </div>
            <ChallengeMark type="STEP" code="BRAND50K" size={52} />
          </div>
        </div>
        <p className="display mt-4 truncate text-[22px] uppercase leading-none">{name} 50K</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-black uppercase text-volt">{name.charAt(0)}</span>
          <p className="truncate text-[12px] text-ink-2"><b className="text-ink">{name}</b> is hosting · 1,284 in</p>
        </div>
        <div className="mt-3 rounded-lg border-[1.5px] border-ink bg-card px-3 py-2 text-[12px] leading-snug"><b>To be won:</b> {name} gift box (1st) and 5 more prizes from {name}.</div>
        <div className="mt-3 flex items-center justify-between border-b-2 border-ink pb-1.5">
          <span className="wide text-[11px] font-extrabold uppercase tracking-[0.08em]">Leaderboard</span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ok"><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22C55E] opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#22C55E]" /></span>Live</span>
        </div>
        <div className="mt-2 overflow-hidden rounded-lg border-[1.5px] border-ink bg-card">
          {SAMPLE_BOARD.map((row) => (
            <div key={row.rank} className={cx('flex items-center gap-2.5 border-b border-line px-2.5 py-1.5 last:border-b-0', row.name === 'You' && 'bg-volt')}>
              <span className="grid w-7 place-items-center">{row.rank <= 3 ? <RankBadge rank={row.rank} /> : <span className="score text-[15px]">{row.rank}</span>}</span>
              <Avatar name={row.name} size={22} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{row.name}</span>
              <span className="score text-[14px]">{row.steps.toLocaleString('en-GB')}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md border-[1.5px] border-ink bg-track py-3 text-center text-[12px] font-black uppercase tracking-[0.08em] shadow-hard-sm">Join challenge</div>
      </div>
    </section>
  );
}
