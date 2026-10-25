import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon } from '../components/icons';
import { CountUp, cx } from '../components/ui';
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
    <div className="mx-auto flex max-w-md animate-rise-lg flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center" style={{ animationDelay: `${delay}ms` }}>
      <a href={LAUNCH} className="btn-primary min-h-12 px-6">Sponsor a competition <ArrowRightIcon size={17} /></a>
      <a href={TALK} className={cx('btn-secondary min-h-12 px-6', dark && 'border-paper/40 bg-transparent text-paper')}>Talk to our team</a>
    </div>
  );
}

/**
 * For brands: why sponsor a competition on Jump, our live numbers, and a preview of their own
 * competition (type a brand name and the phone updates). Public, made to be shared as a link.
 */
export function BrandsPage() {
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: () => api<Stats>('/stats'), staleTime: 5 * 60_000 });
  const s = stats.data;
  const [numbersRef, numbersSeen] = useInView<HTMLDivElement>();
  const numbers = [
    { value: s?.runners, label: 'Runners & walkers', body: 'Moving, recording, competing.' },
    { value: s?.countries, label: 'Countries', body: 'And counting.' },
    { value: s?.verifiedKm, label: 'Verified km', body: 'Every one GPS-checked.' },
    { value: s?.participants, label: 'Competitors', body: 'Have raced on Jump.' },
  ];

  return (
    <div className="mx-auto max-w-6xl text-center">
      {/* Hero: the landing page's line-by-line reveal. */}
      <section className="py-14 sm:py-20">
        <p className="eyebrow animate-rise">Jump for brands</p>
        <h1 className="display mx-auto mt-4 max-w-4xl text-[clamp(44px,10vw,100px)] uppercase leading-[0.85] tracking-[-0.045em]">
          <span className="reveal-line"><span>Build your</span></span>
          <span className="reveal-line"><span className="[animation-delay:90ms]">next global</span></span>
          <span className="reveal-line"><span className="[animation-delay:180ms]">brand on Jump<span className="inline-block animate-pop text-track [animation-delay:750ms]">.</span></span></span>
        </h1>
        <p className="mx-auto mt-7 max-w-2xl animate-rise-lg text-[17px] leading-relaxed text-ink-2 [animation-delay:350ms] sm:text-[20px]">
          Reach runners and walkers across countries through sponsored competitions. Put your brand in front of an active fitness community and build visibility beyond traditional advertising.
        </p>
        <div className="mt-8"><Ctas delay={480} /></div>
      </section>

      {/* Live numbers, counting up when they scroll into view. */}
      <section ref={numbersRef} className="rounded-3xl bg-ink px-5 py-10 text-paper sm:px-10 sm:py-14">
        <p className="eyebrow text-paper/55">The community you’ll reach</p>
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
        <p className="eyebrow">One platform. Every market.</p>
        <h2 className="display mx-auto mt-3 max-w-3xl text-[clamp(30px,6vw,52px)] uppercase leading-[0.92]">Go local. Go national. Go global.</h2>
        <ul className="stagger mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
          {[
            ['Pick your markets', 'One country or several. You choose where the race runs.'],
            ['Meet them mid-stride', 'Your brand shows up while people are actually moving, not scrolling.'],
            ['Make them want it', 'Your products become the prize. Suddenly, everyone wants your shoes.'],
            ['Run it back', 'Weekly or monthly series keep your brand in their routine.'],
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
        <h2 className="display mx-auto mt-3 max-w-3xl text-[clamp(30px,6vw,52px)] uppercase leading-[0.92]">They’ll remember who made them run faster.</h2>
        {/* Equal cards: number, title, one line, all laid out the same way. */}
        <div className="stagger mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-3 text-left sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Brand awareness', 'Your name on every board, share card and push.'],
            ['Product discovery', 'Your products become the prize people chase.'],
            ['Community growth', 'People who race together follow you together.'],
            ['Repeat engagement', 'Weekly series bring them back again and again.'],
          ].map(([title, body], index) => (
            <div key={title} className="flex h-full flex-col rounded-xl border-[1.5px] border-ink bg-volt p-5 shadow-hard-sm">
              <span className="score text-[28px] leading-none">{String(index + 1).padStart(2, '0')}</span>
              <p className="wide mt-6 text-[14px] font-black uppercase leading-tight">{title}</p>
              <p className="mt-1.5 text-[13px] leading-snug text-ink/75">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="mb-12 rounded-3xl bg-ink px-5 py-14 text-paper sm:px-10">
        <h2 className="display mx-auto max-w-3xl text-[clamp(34px,7vw,64px)] uppercase leading-[0.9]">Your next market is already running.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-paper/75 sm:text-[17px]">Tell us where you want to show up and what you want people to win. We’ll build the race around it.</p>
        <div className="mt-8"><Ctas dark /></div>
        <p className="mt-8 text-[14px] text-paper/60">
          <a href={`mailto:${EMAIL}`} className="font-semibold text-paper underline">{EMAIL}</a> · <a href="https://startajump.com" className="font-semibold text-paper underline">startajump.com</a>
        </p>
      </section>
    </div>
  );
}

/** iPhone size, so the competition page inside the phone uses its real phone layout. */
const SCREEN = { width: 393, height: 852, maxScale: 0.78 };
/** The frame's bezel on each side. */
const BEZEL = 12;

/** How much to shrink the phone so it fits the space it's given (never bigger than maxScale). */
function usePhoneScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(SCREEN.maxScale);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const fit = () => setScale(Math.min(SCREEN.maxScale, (node.clientWidth - BEZEL * 2 - 8) / SCREEN.width));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, scale] as const;
}

/** An iPhone: dark frame, Dynamic Island, side buttons, and the screen inside, at `scale`. */
function IPhone({ scale, children }: { scale: number; children: React.ReactNode }) {
  const w = SCREEN.width * scale;
  const h = SCREEN.height * scale;
  return (
    <div className="relative mx-auto" style={{ width: w + BEZEL * 2, height: h + BEZEL * 2 }}>
      {/* Side buttons: action and volume on the left, power on the right. */}
      <span className="absolute -left-[3px] top-[96px] h-7 w-[4px] rounded-l bg-[#2a2a2c]" />
      <span className="absolute -left-[3px] top-[146px] h-12 w-[4px] rounded-l bg-[#2a2a2c]" />
      <span className="absolute -left-[3px] top-[206px] h-12 w-[4px] rounded-l bg-[#2a2a2c]" />
      <span className="absolute -right-[3px] top-[166px] h-[72px] w-[4px] rounded-r bg-[#2a2a2c]" />
      <div className="absolute inset-0 rounded-[54px] bg-[#1b1b1d] p-[12px] shadow-[0_30px_60px_-20px_rgba(18,18,18,0.45),inset_0_0_0_2px_#3a3a3d]">
        <div className="relative overflow-hidden rounded-[43px] bg-paper" style={{ width: w, height: h }}>
          {children}
          {/* Dynamic Island, scaled with the screen. */}
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-black" style={{ top: 11 * scale, height: 35 * scale, width: 123 * scale }} />
        </div>
      </div>
    </div>
  );
}

/** What their competition could look like: Jump's real competition page, in an iPhone, with their name in it. */
function BrandPreview() {
  const [brand, setBrand] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const [fitRef, scale] = usePhoneScale();
  // Sent in as they type, so the phone updates without reloading.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ brandName: brand }, window.location.origin);
  }, [brand]);
  return (
    <section className="grid items-center gap-12 rounded-3xl border-[1.5px] border-ink bg-card px-4 py-12 shadow-hard sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:text-left">
      <div>
        <p className="eyebrow">See yourself on the start line</p>
        <h2 className="display mt-3 text-[clamp(30px,6vw,52px)] uppercase leading-[0.92]">This is your race.</h2>
        <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2 lg:mx-0">Your banner on top. Your name on the competition. Your products up for grabs. A live leaderboard people check more than their messages.</p>
        <label className="mx-auto mt-6 block max-w-sm text-left lg:mx-0">
          <span className="text-[13px] font-bold">Type your brand name</span>
          <input className="field mt-2" placeholder="Eko Runners Club" maxLength={24} value={brand} onChange={(event) => setBrand(event.target.value)} />
        </label>
      </div>

      <div ref={fitRef} className="w-full animate-rise-lg lg:w-[340px]">
        <IPhone scale={scale}>
          <iframe ref={frame} src="/brands/preview" title="Preview of a sponsored competition on Jump" tabIndex={-1} scrolling="no"
            onLoad={() => frame.current?.contentWindow?.postMessage({ brandName: brand }, window.location.origin)}
            style={{ width: SCREEN.width, height: SCREEN.height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }} />
        </IPhone>
      </div>
    </section>
  );
}
