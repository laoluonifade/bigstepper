import { useState } from 'react';
import { formatDistance, formatDistanceNumber } from '../lib/format';
import type { WeekDay } from '../lib/progress';
import type { Unit } from '../lib/types';
import { cx } from './ui';

const HEIGHT = 120;
const BAR_WIDTH = 22;

/**
 * Seven columns, Monday to Sunday, of verified distance.
 * Single series → no legend; today is the one accented, directly labelled bar.
 */
export function WeekChart({ days, unit }: { days: WeekDay[]; unit: Unit }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1000, ...days.map((day) => day.metres));
  const todayIndex = days.findIndex((day) => day.isToday);
  const focus = hovered ?? (days[todayIndex]?.metres > 0 ? todayIndex : null);

  return (
    <figure className="m-0">
      <div className="relative" style={{ height: HEIGHT + 24 }} onMouseLeave={() => setHovered(null)}>
        <div className="absolute inset-x-0 border-t border-ink/15" style={{ top: HEIGHT }} aria-hidden="true" />
        <div className="absolute inset-0 grid grid-cols-7">
          {days.map((day, index) => {
            const h = day.metres > 0 ? Math.max(4, Math.round((day.metres / max) * (HEIGHT - 26))) : 0;
            const active = focus === index;
            return (
              <button
                key={index}
                type="button"
                className="group relative flex flex-col items-center outline-none"
                onMouseEnter={() => setHovered(index)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                aria-label={`${day.date.toLocaleDateString('en-GB', { weekday: 'long' })}: ${formatDistance(day.metres, unit)} verified`}
              >
                <div className="relative w-full" style={{ height: HEIGHT }}>
                  {active && day.metres > 0 && (
                    <span
                      className="num absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] font-bold"
                      style={{ bottom: h + 6 }}
                    >
                      {formatDistanceNumber(day.metres, unit)}
                    </span>
                  )}
                  <span
                    className={cx(
                      'absolute bottom-0 left-1/2 origin-bottom animate-grow-y rounded-t transition-[height,opacity] duration-500',
                      day.isToday ? 'bg-track' : 'bg-ink',
                      hovered !== null && !active && 'opacity-40',
                    )}
                    // Centred with a margin, not a translate, so the grow animation owns `transform`.
                    style={{ width: BAR_WIDTH, height: h, marginLeft: -BAR_WIDTH / 2, animationDelay: `${index * 60}ms` }}
                  />
                  {day.metres === 0 && !day.isFuture && (
                    <span className="absolute bottom-0 left-1/2 h-[3px] w-[3px] -translate-x-1/2 translate-y-[-3px] rounded-full bg-ink/25" />
                  )}
                </div>
                <span
                  className={cx(
                    'mt-1.5 text-[11px] font-bold uppercase',
                    day.isToday ? 'text-ink' : 'text-ink-3',
                    day.isToday && 'underline decoration-track decoration-2 underline-offset-4',
                  )}
                >
                  {day.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <figcaption className="sr-only">
        Verified distance per day this week:{' '}
        {days.map((day) => `${day.date.toLocaleDateString('en-GB', { weekday: 'long' })} ${formatDistance(day.metres, unit)}`).join(', ')}
      </figcaption>
    </figure>
  );
}
