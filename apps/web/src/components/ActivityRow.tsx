import { Link } from '@tanstack/react-router';
import { formatDistanceNumber, formatDuration, formatPace, formatTime } from '../lib/format';
import type { Activity, Unit } from '../lib/types';
import { ChevronRightIcon } from './icons';
import { cx, VerificationTag } from './ui';

/** Verified runs show validated distance; anything else shows what was recorded. */
/** Verified distance: GPS, or steps × stride when that's larger (indoors). Provisional before verification. */
export function shownMetres(activity: Activity) {
  if (activity.verificationStatus !== 'VERIFIED') return activity.recordedDistanceMetres;
  return Math.max(activity.validatedDistanceMetres, activity.stepDistanceMetres ?? 0);
}

export function fromSteps(activity: Activity) {
  return activity.verificationStatus === 'VERIFIED' && (activity.stepDistanceMetres ?? 0) > activity.validatedDistanceMetres;
}

export function ActivityRow({ activity, unit }: { activity: Activity; unit: Unit }) {
  const started = new Date(activity.startedAt);
  const metres = shownMetres(activity);
  const pace = formatPace(metres, activity.movingSeconds || activity.elapsedSeconds, unit);
  const rejected = activity.verificationStatus === 'REJECTED';
  return (
    <Link
      to="/activities/$id"
      params={{ id: activity.id }}
      className="group flex items-center gap-4 border-b border-line px-1 py-3.5 last:border-b-0 hover:bg-ink/[0.025] sm:px-3"
    >
      <div className="w-11 shrink-0 text-center">
        <p className="score num text-[26px]">{started.getDate()}</p>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-2">
          {started.toLocaleDateString('en-GB', { month: 'short' })}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1">
          <span className={cx('score num text-[26px]', rejected && 'text-ink-3 line-through decoration-2')}>
            {formatDistanceNumber(metres, unit)}
          </span>
          <span className="text-[12px] font-semibold text-ink-2">{unit}</span>
        </p>
        <p className="num mt-0.5 text-[12px] text-ink-2">
          <span className="font-bold capitalize text-ink">{activity.activityType}</span> · {formatTime(activity.startedAt)} · {formatDuration(activity.movingSeconds || activity.elapsedSeconds)}
          {pace && ` · ${pace} /${unit}`}
        </p>
      </div>
      <VerificationTag status={activity.verificationStatus} />
      <ChevronRightIcon size={18} className="hidden shrink-0 text-ink-3 group-hover:text-ink sm:block" />
    </Link>
  );
}
