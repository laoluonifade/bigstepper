import { RefObject } from 'react';
import { activityName, formatDistance } from '../lib/format';
import type { Activity, Unit } from '../lib/types';
import { EmojiPopover } from './EmojiPopover';
import { CheckIcon, CycleIcon, RunIcon } from './icons';
import { cx } from './ui';

export function ActivityBadge({ type, size = 36 }: { type: 'walk' | 'run' | 'cycle'; size?: number }) {
  return <span className={cx('flex shrink-0 items-center justify-center rounded-xl', type === 'run' ? 'bg-track text-paper' : 'bg-volt text-ink')} style={{ width: size, height: size }}>
    {type === 'cycle' ? <CycleIcon size={size / 2.1} /> : <RunIcon size={size / 2.1} />}
  </span>;
}

export function activityMetres(activity: Activity) {
  return activity.verificationStatus === 'VERIFIED' ? Math.max(activity.validatedDistanceMetres, activity.stepDistanceMetres ?? 0) : activity.recordedDistanceMetres;
}

/** Scrollable list of all your activities, newest first, to attach one to a post or message. */
export function ActivityPicker({ anchor, activities, unit, selectedId, title = 'Share an activity', onPick, onClose }: {
  anchor: RefObject<HTMLElement>; activities: Activity[]; unit: Unit; selectedId?: string; title?: string; onPick: (activity: Activity) => void; onClose: () => void;
}) {
  const width = Math.min(window.innerWidth - 16, 340);
  return <EmojiPopover anchor={anchor} label={title} width={width} height={360} onClose={onClose}>
    <p className="px-2 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{title}</p>
    <div className="max-h-[316px] overflow-y-auto overscroll-contain">
      {activities.map((activity) => <button key={activity.id} type="button" className={cx('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors', selectedId === activity.id ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.04]')} onClick={() => onPick(activity)}>
        <ActivityBadge type={activity.activityType} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[14px] font-semibold">{activityName(activity.startedAt, activity.activityType)}</span>
          <span className="block text-[12px] text-ink-3">{new Date(activity.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: new Date(activity.startedAt).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}</span>
        </span>
        <span className="num shrink-0 text-[14px] font-bold">{formatDistance(activityMetres(activity), unit)}</span>
        {selectedId === activity.id && <CheckIcon size={16} className="shrink-0 text-track" />}
      </button>)}
      {!activities.length && <p className="px-2 py-8 text-center text-[13px] text-ink-3">Record or import an activity to share it.</p>}
    </div>
  </EmojiPopover>;
}
