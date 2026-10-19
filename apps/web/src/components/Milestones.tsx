import type { Milestone } from '../lib/progress';
import { formatDistance } from '../lib/format';
import type { Unit } from '../lib/types';
import { cx } from './ui';

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
        {milestone.mark}
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
          title={`${milestone.title} — ${milestone.description}${milestone.earned ? ' (earned)' : ''}`}
          className={cx(
            'score flex h-11 w-11 items-center justify-center rounded-sm text-[17px]',
            milestone.earned ? 'border-2 border-ink bg-volt text-ink' : 'border-[1.5px] border-dashed border-ink/30 text-ink/30',
          )}
        >
          <span aria-hidden="true">{milestone.mark}</span>
          <span className="sr-only">
            {milestone.title}: {milestone.earned ? 'earned' : 'not yet earned'}
          </span>
        </li>
      ))}
    </ul>
  );
}
