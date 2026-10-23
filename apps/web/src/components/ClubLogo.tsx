import type { Club } from '../lib/types';
import { cx } from './ui';

/** A club's picture everywhere it shows: its logo, or its first letters on an ink tile. */
export function ClubLogo({ club, size = 44, className }: { club: Pick<Club, 'name' | 'logoUrl'>; size?: number; className?: string }) {
  return club.logoUrl
    ? <img src={club.logoUrl} alt="" width={size} height={size} className={cx('shrink-0 rounded-xl bg-white object-cover', className)} style={{ width: size, height: size }} />
    : <span aria-hidden="true" className={cx('wide inline-flex shrink-0 items-center justify-center rounded-xl bg-ink font-black text-volt', className)} style={{ width: size, height: size, fontSize: Math.max(15, size * 0.38) }}>{club.name.trim().slice(0, 2).toUpperCase() || 'J'}</span>;
}
