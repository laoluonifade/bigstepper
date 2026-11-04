import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon } from './icons';

const signup = { redirect: '/clubs' };
const clubAccents = ['#8B7CF6', '#FF5A1F', '#E4FF3A', '#5EE0C1'];

const benefits = [
  {
    number: '01',
    title: 'Get people moving',
    body: 'Make everyday movement part of the workday.',
    mark: '↗',
    tone: 'bg-volt',
  },
  {
    number: '02',
    title: 'Bring colleagues together',
    body: 'Build connections through friendly step challenges.',
    mark: 'VS',
    tone: 'bg-[#D9E8FF]',
  },
  {
    number: '03',
    title: 'See everyone’s progress',
    body: 'Follow participation and individual leaderboards.',
    mark: '⌁',
    tone: 'bg-[#FFD9C8]',
  },
];

const leaderboard = [
  { name: 'Amara Okafor', steps: '42,860', avatar: 'AO', color: 'bg-[#F5B89B]' },
  { name: 'Tunde Bello', steps: '38,420', avatar: 'TB', color: 'bg-[#B9D3FF]' },
  { name: 'Maya Johnson', steps: '35,190', avatar: 'MJ', color: 'bg-[#EFC7EA]' },
];

export function BusinessSection() {
  const [clubAccent, setClubAccent] = useState(clubAccents[0]);

  return (
    <section aria-labelledby="business-heading" className="pt-2 text-left sm:pt-4">
      {/* Hero */}
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.95fr] lg:gap-12">
        <div className="max-w-xl">
          <p className="eyebrow flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-track" /> Jump for businesses</p>
          <h2 id="business-heading" className="display mt-4 text-[clamp(36px,6.6vw,68px)] leading-[0.9] tracking-[-0.055em] lg:text-[clamp(44px,4.4vw,60px)]">
            Turn everyday steps into workplace victories.
          </h2>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-2 sm:text-[18px]">
            Bring your team together with step challenges. Sync everyday steps through Apple Health on iPhone.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link to="/register" search={signup} className="btn-primary min-h-12 whitespace-nowrap px-4 max-sm:text-[12px] max-sm:tracking-normal sm:px-5">Create your workplace club <ArrowRightIcon size={16} /></Link>
            <a href="#business-how" className="btn-secondary min-h-12 whitespace-nowrap px-4 max-sm:text-[12px] max-sm:tracking-normal sm:px-5">See how it works</a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[530px] lg:mx-0 lg:ml-auto">
          <div className="relative overflow-hidden rounded-md border-2 border-ink bg-[#FFD7C4] p-4 shadow-hard sm:p-6">
            <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-volt" aria-hidden="true" />
            <div className="absolute -bottom-16 -left-12 h-48 w-48 rounded-full border-[26px] border-white/30" aria-hidden="true" />
            <WorkdayIllustration />
            <div className="relative z-10 -mt-2 rounded-md border-2 border-ink bg-card p-4 shadow-hard-sm sm:ml-12 sm:mr-3 sm:p-5">
              <div className="flex items-center gap-3">
                <img src="/brands/stripe-logo.png" alt="Stripe logo" className="h-12 w-12 shrink-0 rounded-xl border-2 border-ink object-cover shadow-hard-sm" />
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">Illustrative example · Stripe</p>
                  <p className="wide mt-1 truncate text-[18px] font-extrabold uppercase">Stripe Walk Club</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-ink text-[20px] transition-colors" style={{ backgroundColor: clubAccent }} aria-hidden="true">↗</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="text-[11px] font-semibold text-ink-2">Try a club colour</span>
                <div className="flex gap-2" role="group" aria-label="Preview club colours">
                  {clubAccents.map((color) => <button key={color} type="button" aria-label={`Preview ${color} club colour`} aria-pressed={clubAccent === color}
                    onClick={() => setClubAccent(color)} style={{ backgroundColor: color }}
                    className={`h-7 w-7 rounded-full border border-ink transition-transform ${clubAccent === color ? 'scale-110 shadow-hard-sm ring-2 ring-ink ring-offset-2 ring-offset-card' : 'hover:scale-110'}`} />)}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <p className="text-[12px] font-semibold text-ink-2">This week’s recorded steps</p>
                <span className="tag border-ink bg-volt">Illustrative</span>
              </div>
              <ol className="mt-2 divide-y divide-line">
                {leaderboard.map((person, index) => <li key={person.name} className="flex items-center gap-2.5 py-2">
                  <span className="score w-4 text-[16px] text-ink-3">{index + 1}</span>
                  <span className={`grid h-8 w-8 place-items-center rounded-full border border-ink/20 text-[10px] font-extrabold ${person.color}`}>{person.avatar}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold">{person.name}</span>
                    <span className="block text-[10px] text-ink-3">Club member</span>
                  </span>
                  <span className="num text-[12px] font-bold">{person.steps}</span>
                </li>)}
              </ol>
            </div>
            <p className="relative z-10 mt-3 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/60">Illustrative names and scores</p>
          </div>
          <span className="absolute -left-3 top-8 hidden -rotate-6 border-2 border-ink bg-volt px-3 py-2 text-[11px] font-extrabold uppercase shadow-hard-sm sm:block">Move together!</span>
        </div>
      </div>

      {/* Benefits */}
      <div className="mt-16 sm:mt-20">
        <SectionIntro eyebrow="Why teams pick Jump" title="Move more. Connect more." />
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {benefits.map((item) => <article key={item.number} className="flex min-h-[180px] flex-col rounded-md border-[1.5px] border-ink bg-card p-4 transition-transform duration-150 hover:-translate-y-1 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="score text-[15px] text-ink-3">{item.number}</span>
              <span className={`grid h-10 w-10 place-items-center rounded-full border-2 border-ink text-[15px] font-black ${item.tone}`}>{item.mark}</span>
            </div>
            <h3 className="wide mt-6 text-[20px] font-extrabold uppercase leading-[1.02]">{item.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{item.body}</p>
          </article>)}
        </div>
      </div>

      {/* How it works */}
      <div id="business-how" className="scroll-mt-8 relative mt-12 rounded-md border-2 border-ink bg-ink px-5 py-7 text-paper shadow-hard sm:mt-16 sm:px-8 sm:py-9 [&_.eyebrow]:text-paper/55">
        <SectionIntro eyebrow="No complicated onboarding" title="Start in three steps." />
        <ol className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            ['01', 'Create your club', 'Add your workplace and invite colleagues.'],
            ['02', 'Connect Apple Health', 'On iPhone, allow access to sync daily steps.'],
            ['03', 'Start a challenge', 'Choose a supported free challenge and follow the leaderboard.'],
          ].map(([n, title, body]) => <li key={n} className="relative rounded-md border border-white/20 bg-white/[0.06] p-4 sm:p-5">
            <span className="score text-[30px] text-volt">{n}</span>
            <h3 className="wide mt-5 text-[18px] font-extrabold uppercase leading-tight">{title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-paper/70">{body}</p>
          </li>)}
        </ol>
      </div>

      {/* Final CTA */}
      <div className="relative mt-12 overflow-hidden rounded-md border-2 border-ink bg-volt px-5 py-9 shadow-hard sm:mt-16 sm:px-10 sm:py-12">
        <span className="absolute -right-7 -top-16 rotate-12 text-[180px] font-black leading-none text-ink/[0.06]" aria-hidden="true">J</span>
        <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <h3 className="display mt-2 text-[clamp(36px,6vw,64px)] leading-[0.9] tracking-[-0.05em]">Get your people moving.</h3>
          </div>
          <Link to="/register" search={signup} className="btn-dark min-h-12 w-full shrink-0 whitespace-nowrap px-3 max-sm:text-[12px] max-sm:tracking-normal sm:w-auto sm:px-5">Create your workplace club <ArrowRightIcon size={16} /></Link>
        </div>
      </div>
    </section>
  );
}

function SectionIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return <div className="max-w-2xl">
    <p className="eyebrow">{eyebrow}</p>
    <h3 className="display mt-2 text-[clamp(30px,4.8vw,48px)] leading-[0.92] tracking-[-0.04em]">{title}</h3>
    {body && <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink-2">{body}</p>}
  </div>;
}

/** An original, lightweight vector scene keeps the landing page image-free and on-brand. */
function WorkdayIllustration() {
  return <svg viewBox="0 0 520 260" role="img" aria-label="Illustration of three colleagues walking together" className="relative z-0 block h-auto w-full">
    <path d="M9 212c75-36 140-26 214-4 70 21 131 16 288-25v77H9z" fill="#FF6B3D" opacity=".22" />
    <path d="M40 46l8 19 19 8-19 8-8 19-8-19-19-8 19-8zM455 42l5 12 12 5-12 5-5 12-5-12-12-5 12-5z" fill="#151515" />
    <circle cx="98" cy="65" r="16" fill="#C6D7FF" stroke="#151515" strokeWidth="3" />
    <path d="M91 67c2-2 4-2 6 0m4 0c2-2 4-2 6 0m-12 6c4 4 8 4 12 0" fill="none" stroke="#151515" strokeWidth="2" strokeLinecap="round" />
    <path d="M86 88c-16 7-24 21-25 43l-7 40 40 8 9-44 14 40 36-10-22-50c-7-16-22-26-45-27z" fill="#F0C2A5" stroke="#151515" strokeWidth="3" strokeLinejoin="round" />
    <path d="M68 125l-23 27 15 11 24-26m42-13 23 24 14-14-26-28" fill="none" stroke="#151515" strokeWidth="12" strokeLinecap="round" />
    <path d="M80 176l-10 46m36-42 8 44m-45 0h-18m65 0h19" fill="none" stroke="#151515" strokeWidth="9" strokeLinecap="round" />
    <circle cx="244" cy="47" r="20" fill="#6B3E2E" stroke="#151515" strokeWidth="3" />
    <path d="M228 45c3-18 30-23 38-5-11-4-24-2-38 5z" fill="#151515" />
    <path d="M236 50c2-2 4-2 6 0m8 0c2-2 4-2 6 0m-15 8c5 3 9 3 13 0" fill="none" stroke="#151515" strokeWidth="2" strokeLinecap="round" />
    <path d="M224 74c-20 6-31 19-31 40v49h99l-9-58c-2-17-18-30-42-31z" fill="#8DB4FF" stroke="#151515" strokeWidth="3" strokeLinejoin="round" />
    <path d="M202 103l-20 34 16 8 19-31m59-8 18 26 16-10-23-32" fill="none" stroke="#151515" strokeWidth="11" strokeLinecap="round" />
    <path d="M216 162l-14 60m61-60 17 60m-96 0h-16m113 0h18" fill="none" stroke="#151515" strokeWidth="10" strokeLinecap="round" />
    <circle cx="383" cy="65" r="19" fill="#AD704B" stroke="#151515" strokeWidth="3" />
    <path d="M364 63c1-19 28-27 39-9l-4 8c-8-7-19-9-35 1z" fill="#291E1B" />
    <path d="M375 68c2-2 4-2 6 0m8 0c2-2 4-2 6 0m-14 8c4 3 8 3 12 0" fill="none" stroke="#151515" strokeWidth="2" strokeLinecap="round" />
    <path d="M374 91c-21 7-31 22-29 43l5 33h83l-9-51c-3-17-22-29-50-25z" fill="#C7E45B" stroke="#151515" strokeWidth="3" strokeLinejoin="round" />
    <path d="M355 113l-27 20 10 14 28-17m50-17 20 22 14-12-22-28" fill="none" stroke="#151515" strokeWidth="11" strokeLinecap="round" />
    <path d="M365 166l-7 57m47-56 20 56m-76 0h-17m107 0h17" fill="none" stroke="#151515" strokeWidth="10" strokeLinecap="round" />
    <path d="M476 144v62" stroke="#151515" strokeWidth="4" strokeLinecap="round" />
    <path d="M478 146h30l-10 12 10 11h-30z" fill="#FFF3B0" stroke="#151515" strokeWidth="3" strokeLinejoin="round" />
    <path d="M149 62h28m-14-14v28m228 59h28m-14-14v28" stroke="#151515" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}
