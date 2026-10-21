import type { ReactNode } from 'react';
import type { Milestone } from '../lib/progress';
import { formatDistance } from '../lib/format';
import type { Unit } from '../lib/types';
import { cx } from './ui';

function MilestoneGlyph({ id }: { id: string }) {
  const artwork: Record<string, ReactNode> = {
    first: <><path d="M9 32V7m0 2h22l-5 6 5 6H9" /><path d="M15 9v12m6-12v12m5-12v12" /></>,
    '5k': <><path d="M7 31V9h24v22H7zM7 17h24M15 9v8m8 0v14" /><path d="M12 25h4m8 0h4" /></>,
    '10k': <><path d="M5 30 14 10l7 14 5-9 9 15H5z" /><path d="M13 15h4m9 6h4" /></>,
    half: <><path d="M6 31c1-14 10-23 20-23 5 0 8 2 9 5" /><path d="M11 31c1-11 7-18 16-18m-1 0 5 5-6 4" /></>,
    streak3: <><path d="M21 5c2 9-7 11-4 19 1-4 4-5 5-8 7 6 8 17-3 19C8 35 7 24 13 17c0 5 2 7 2 7" /></>,
    streak7: <><circle cx="20" cy="20" r="7" /><path d="M20 3v7m0 20v7M3 20h7m20 0h7M8 8l5 5m14 14 5 5M32 8l-5 5M13 27l-5 5" /></>,
    total50: <><path d="m4 31 9-17 6 9 6-15 11 23H4z" /><path d="m22 14 3-6 3 6M8 25l5-11 3 5" /></>,
    total100: <><path d="m20 4 14 6v9c0 10-6 15-14 18C12 34 6 29 6 19v-9z" /><path d="m20 11 2.5 6 6.5.5-5 4 1.5 6-5.5-3.5-5.5 3.5 1.5-6-5-4 6.5-.5z" /></>,
    total500: <><path d="M22 3 8 22h11l-2 15 15-20H21z" /></>,
  };
  return <svg width="36" height="36" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{artwork[id]}</svg>;
}

function progressText(milestone: Milestone, unit: Unit) {
  if (milestone.earned) return 'Earned';
  if (milestone.kind === 'streak') return `Best ${milestone.progress} of ${milestone.target} days`;
  if (milestone.kind === 'count') return 'Not yet';
  if (milestone.kind === 'single') return `Longest ${formatDistance(milestone.progress, unit)}`;
  return `${formatDistance(milestone.progress, unit)} so far`;
}

export function MilestoneBadge({ milestone, unit, compact }: { milestone: Milestone; unit: Unit; compact?: boolean }) {
  const pct = Math.round((milestone.progress / milestone.target) * 100);
  return (
    <div className={cx('flex items-center gap-3', compact ? '' : 'rounded-md border border-line bg-card p-3')}>
      <span
        className={cx(
          'score relative flex h-14 w-14 shrink-0 items-center justify-center rounded-sm text-[22px]',
          milestone.earned ? 'border-2 border-ink bg-volt text-ink shadow-hard-sm' : 'border-[1.5px] border-dashed border-ink/35 text-ink/35',
        )}
        aria-hidden="true"
      >
        <MilestoneGlyph id={milestone.id} />
        {!milestone.earned && pct > 0 && (
          <span className="absolute inset-x-1 bottom-1 h-[3px] bg-ink/10">
            <span className="block h-full bg-track" style={{ width: `${pct}%` }} />
          </span>
        )}
      </span>
      <div className="min-w-0">
        <p className="wide truncate text-[13px] font-extrabold uppercase">{milestone.title}</p>
        <p className="truncate text-[12px] text-ink-2">{milestone.description}</p>
        <p className={cx('mt-0.5 text-[11px] font-semibold', milestone.earned ? 'text-ok' : 'text-ink-3')}>{progressText(milestone, unit)}</p>
      </div>
    </div>
  );
}

export function MilestoneStrip({ milestones }: { milestones: Milestone[] }) {
  return (
    <ul className="stagger flex flex-wrap gap-2" aria-label="Milestones">
      {milestones.map((milestone) => (
        <li
          key={milestone.id}
          title={`${milestone.title}: ${milestone.description}${milestone.earned ? ' (earned)' : ''}`}
          className={cx(
            'score flex h-11 w-11 items-center justify-center rounded-sm text-[17px]',
            milestone.earned ? 'border-2 border-ink bg-volt text-ink' : 'border-[1.5px] border-dashed border-ink/30 text-ink/30',
          )}
        >
          <MilestoneGlyph id={milestone.id} />
          <span className="sr-only">
            {milestone.title}: {milestone.earned ? 'earned' : 'not yet earned'}
          </span>
        </li>
      ))}
    </ul>
  );
}
