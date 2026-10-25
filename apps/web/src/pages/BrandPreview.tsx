import { useEffect, useMemo, useState } from 'react';
import { Leaderboard, type LeaderboardRow } from '../components/Leaderboard';
import { Avatar, LiveTag, SectionTitle } from '../components/ui';
import { formatScore } from '../lib/scoring';
import type { CompetitionTable } from '../lib/types';
import { ChallengeCover, Faces, Stakes, TimeLeft } from './Competitions';

const DAY = 86_400_000;
const BOARD: Array<[string, number, string]> = [['Ada Okafor', 48210, '34.6 km'], ['Tunde Bakare', 45977, '32.9 km'], ['Chioma Eze', 41302, '29.4 km'], ['You', 38640, '27.6 km'], ['Femi Adeyemi', 35118, '25.0 km']];

/**
 * A sponsored competition as Jump really draws it on a phone, for the phone frame on /brands. It's
 * the competition page's own pieces with a sample competition, shown in a 393px-wide frame so the
 * phone layout applies. The brand name comes from ?name= and from the page around it as you type.
 */
export function BrandPreviewScreen() {
  const [name, setName] = useState(() => new URLSearchParams(window.location.search).get('name')?.trim() || 'Eko Runners Club');
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.origin === window.location.origin && typeof event.data?.brandName === 'string') setName(event.data.brandName.trim().slice(0, 24) || 'Eko Runners Club');
    };
    window.addEventListener('message', listen);
    // A still screen inside the phone frame: no scrolling, no scrollbar.
    document.documentElement.style.overflow = 'hidden';
    return () => { window.removeEventListener('message', listen); document.documentElement.style.overflow = ''; };
  }, []);

  // A fixed "now" keeps the sample's countdown steady.
  const now = useMemo(() => Date.now(), []);
  const table = useMemo(() => ({
    id: 'brand-preview', code: 'BRAND50K', title: `${name} 50K`, description: null, type: 'free', status: 'OPEN_FOR_ENTRY',
    entryFeeKobo: 0, guaranteedPrizeKobo: null, fundedPrizeKobo: null, prizeSplitBps: [], fundedAt: null, minimumEntrants: 1,
    startsAt: new Date(now - 2 * DAY).toISOString(), entryClosesAt: new Date(now + 28 * DAY).toISOString(), scoringClosesAt: new Date(now + 28 * DAY).toISOString(),
    capacity: 2000, distanceCapMetres: null, challengeType: 'STEP', scoringMethod: 'FIRST_TO_STEPS', targetDistanceMetres: null, targetSteps: 50000,
    bannerUrl: '/brands/sample-banner.jpg', platformFeeBps: 0, creatorCommissionBps: 0, visibility: 'public', creatorId: 'brand', createdAt: new Date(now - 2 * DAY).toISOString(), entrantCount: 1284,
  }) as unknown as CompetitionTable, [name, now]);
  const rows: LeaderboardRow[] = BOARD.map(([who, steps, km], index) => ({ rank: index + 1, userId: who, name: who, metres: 0, score: steps, detail: km }));

  return (
    <div className="min-h-screen bg-paper px-4 pb-10 text-ink">
      {/* iOS status bar, with room in the middle for the frame's Dynamic Island. */}
      <div className="mb-2 flex h-[54px] items-center justify-between px-5 pt-1.5 text-[16px] font-semibold tracking-tight">
        <span className="w-14">9:41</span>
        <span className="flex w-14 items-center justify-end gap-1.5">
          <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true"><path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.7 10.7 0 0 0 8 .4C5.1.4 2.5 1.5.5 3.4l1.2 1.3A8.9 8.9 0 0 1 8 2.2Zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3A7.4 7.4 0 0 0 8 4a7.4 7.4 0 0 0-4.9 1.9l1.2 1.3c1-.9 2.3-1.4 3.7-1.4Zm0 3.5c.5 0 1 .2 1.3.5L8 11.6 6.7 9.8c.3-.3.8-.5 1.3-.5Z" /></svg>
          <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden="true"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" /><rect x="2" y="2" width="17" height="9" rx="2" fill="currentColor" /><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity="0.4" /></svg>
        </span>
      </div>

      <ChallengeCover table={table} unit="km" now={now} />
      <h1 className="display mt-5 break-words text-[34px] leading-[0.95]">{table.title}</h1>
      <div className="mt-4 flex items-center gap-3">
        <Avatar name={name} size={40} className="rounded-full" />
        <p className="min-w-0 text-[14px] leading-snug">
          <span className="font-bold">{name}</span> is hosting
          <span className="block text-[12px] text-ink-3">Sponsored competition</span>
        </p>
      </div>

      <section className="mt-6 rounded-xl border-[1.5px] border-ink bg-card p-5 shadow-hard">
        <Stakes table={table} />
        <TimeLeft table={table} now={now} />
        <Faces faces={rows} count={1284} capacity={2000} />
        <span className="btn-primary mt-5 w-full">Join competition</span>
      </section>

      <div className="mt-4 flex items-center gap-2.5 rounded-lg border-[1.5px] border-ink bg-card py-2 pl-2 pr-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-volt text-[13px] font-black uppercase">{name.charAt(0)}</span>
        <p className="min-w-0 text-[13px] leading-snug"><b>To be won:</b> {name} gift box (1st) and 5 more prizes from {name}.</p>
      </div>

      <section className="mt-8">
        <SectionTitle aside={<LiveTag />}>Leaderboard</SectionTitle>
        <Leaderboard rows={rows} currentUserId="You" unit="km" metricLabel="Steps"
          formatScore={(row) => <span className="score num whitespace-nowrap text-[20px]">{formatScore(table, row.score, 'km', { short: true })}</span>} />
      </section>
    </div>
  );
}
