import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const XLogoIcon = (p: IconProps) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </Icon>
);

export const InstagramIcon = (p: IconProps) => (
  <Icon {...p} strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </Icon>
);

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />
  </Icon>
);

export const TableIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h16M4 10h16M4 15h16M4 20h16" />
    <path d="M8 5v15" />
  </Icon>
);

export const RunIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5v15L19 12z" fill="currentColor" stroke="none" />
  </Icon>
);

export const CycleIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5" cy="17" r="3" /><circle cx="19" cy="17" r="3" />
    <path d="m5 17 4-9 5 9H5l5-6h4l5 6m-10-9h3m-2-3h3" />
  </Icon>
);

export const ActivityIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
  </Icon>
);

export const FeedIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M8 9h8M8 12h5" />
  </Icon>
);

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" />
  </Icon>
);

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15z" />
    <path d="M10 21h4" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 3 3 10l7 3 3 7 8-17Z" />
    <path d="m10 13 11-10" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H6M11 6l-6 6 6 6" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 9h11v11H9z" />
    <path d="M15 9V4H4v11h5" />
  </Icon>
);

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" />
  </Icon>
);

export const StopIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6h12v12H6z" fill="currentColor" stroke="none" />
  </Icon>
);

export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h6v3h8v9h-7v-3H5" />
  </Icon>
);

export const SignalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20v-3M9 20v-7M14 20V9M19 20V4" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 17v.5" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5V8" />
  </Icon>
);

export const TicketIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4z" />
    <path d="M14 5v2M14 11v2M14 17v2" />
  </Icon>
);

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);

export const RepeatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17 2l3 3-3 3" />
    <path d="M4 11V9a4 4 0 0 1 4-4h12" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M20 13v2a4 4 0 0 1-4 4H4" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.5 3.2-5.5 6.5-5.5s5.9 2 6.5 5.5" />
    <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.7 3.1 2.5 3.5 5.2" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" />
  </Icon>
);

export const WalletIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7h16v13H3z" />
    <path d="M3 7l12-3v3" />
    <path d="M15 13h2" />
  </Icon>
);

export const LadderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h5v-5h5v-5h5V4" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <path d="M14 4.5v5M8 14.5v5" />
  </Icon>
);

export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4H4v16h6" />
    <path d="M9 12h11M16 8l4 4-4 4" />
  </Icon>
);

export const OfflineIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4l16 16" />
    <path d="M2 9a15 15 0 0 1 5-3M22 9a15 15 0 0 0-11-4M5.5 12.5a10 10 0 0 1 3-2M18.5 12.5a10 10 0 0 0-4-2.3M9 16a5 5 0 0 1 6 0" />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 11h14v10H5z" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const ShareIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v12M7 8l5-5 5 5" />
    <path d="M5 13v8h14v-8" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </Icon>
);

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
    <circle cx="12" cy="13" r="4" />
  </Icon>
);

/** Show password. */
export const EyeIcon = (p: IconProps) => (
  <Icon {...p} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

/** Hide password. */
export const EyeOffIcon = (p: IconProps) => (
  <Icon {...p} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.5M6.6 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </Icon>
);

export const LinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 14l4-4" />
    <path d="M9 7l2-2a4 4 0 0 1 6 6l-2 2M15 17l-2 2a4 4 0 0 1-6-6l2-2" />
  </Icon>
);

/** The Jump wordmark (traced from the brand artwork): the rising arrow and the letters, kept apart so the arrow can move. */
export const JUMP_LOGO = {
  width: 266.4,
  height: 102.5,
  arrow: 'M253.6 0 255.4 0.2 255.4 1.3 240.2 23.5 237.5 28 236.2 29.2 230.8 30.9 225 32.2 223.8 32.2 223.9 31 226.5 27.3 226.4 26.6 225.8 26.3 199.9 27.1 163.4 30.2 139.4 33.5 107.5 39.2 81 45.6 68.1 49.2 63.2 51 60 51.6 61 50.7 64 49.3 83.1 42.2 108 34.2 132.8 27.3 159.5 20.7 183.5 15.3 203.5 11.2 226 7.1 226.8 6.6 226.6 6 221.9 2.2 221.8 1.3 222 1.2Z',
  letters: 'M139 44.5 151 44.5 152.4 44.7 153 45.3 162 65.9 165.2 72.3 166.1 72.2 168.9 69.2 170.8 66.6 189.1 44.9 190.1 44.5 200.8 44.5 203.2 44.6 203.8 45 203.9 46.5 196.9 82.6 193.6 99 192.6 101.6 179.5 101.7 178.6 101 181.1 86.9 184.1 73.2 184.6 70.5 184.5 69.1 183.9 69.2 182.1 71 180.8 73 165.1 91.3 163.9 92.5 162.1 92.7 160.1 92.6 159.1 91.7 149.1 70.1 148.6 69.6 148 69.6 147.1 72.3 141.5 101.1 140.6 101.7 127.6 101.7 127.2 101.5 127 100 135.8 57 137.4 47.3 138.1 45ZM213.4 44.5 248.9 44.5 254.2 45.1 257.1 46 259.8 47.2 261.6 48.6 263.6 50.7 265.2 53.7 266 56 266.4 58.7 266 65.5 264.8 70.1 262.8 74.3 259.8 78.2 255.4 81.7 250.9 83.7 244.6 85.1 219.2 85.3 218.4 86.2 215.8 100.1 214.9 101.6 201.5 101.7 200.9 101.2 201.1 97.9 204.9 80.3 205.1 77.7 211.4 46 212 44.9ZM128.1 44.6 130 44.7 130.5 46 123.6 80.5 122 85.9 120.4 89.3 117.9 93.2 115.4 95.9 112.9 97.7 108.9 100 102.4 101.9 97.5 102.5 83.6 102.5 80 102 73.9 99.9 71.5 98.2 69.8 96.5 68.4 94.5 67.1 91.3 66.6 88.1 66.6 83.3 71.2 58.7 72.6 53.5 74.1 52.7 84.1 50.3 86.4 50 87.6 50.3 87.8 51.3 86.9 56.1 82 79.2 81.8 82.5 82.1 84.6 83 86.3 84 87.3 86.4 88.5 89.5 89.1 98.5 89 102.5 88 104.6 86.7 106.6 84.6 108.4 81.3 110.9 70.3 114.2 52.1 115.8 46.1 117.1 45.3ZM63.5 55.6 64.9 55.9 65 57.2 59.8 83.5 57.6 89.2 56 92.1 53.6 95.1 51.4 97.1 48.4 99 45.8 100.1 42.6 101 37.2 101.7 0.9 101.7 0.1 101.3 0 99.3 1.9 89.7 2.2 88.7 2.9 88.2 35.9 88.1 39.8 87.5 41.8 86.5 43.6 84.6 45.4 80.6 48.2 65.5 49.5 60.6 52 59.3ZM229.8 57.5 224.6 57.6 223.9 58.3 221.2 70.7 221.5 72.3 222 72.6 243 72.5 245.5 71.9 247.2 71 249.4 68.7 250.6 65.6 250.9 62 250 59.7 248.5 58.5 245.4 57.6Z',
};

/**
 * The Jump wordmark in `currentColor`. `motion="enter"` lifts the arrow in on mount; `motion="loop"` keeps it
 * nudging upward, for waiting states.
 */
export const DuelIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 4 9.5 14.5" />
    <path d="M7 12l5 5" />
    <path d="M9.5 14.5 5 19" />
    <path d="M4 4l10.5 10.5" />
    <path d="M17 12l-5 5" />
    <path d="M14.5 14.5 19 19" />
  </Icon>
);

export const CrownIcon = (p: IconProps) => (
  <Icon {...p} strokeLinejoin="round">
    <path d="M3 18 5 7l4.5 5L12 5l2.5 7L19 7l2 11z" />
    <path d="M4 21h16" />
  </Icon>
);

export const FinishFlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 21V3" />
    <path d="M5 4h14v10H5" />
    <path d="M5 4h3.5v3.33H5zM12 4h3.5v3.33H12zM8.5 7.33H12v3.34H8.5zM15.5 7.33H19v3.34h-3.5zM5 10.67h3.5V14H5zM12 10.67h3.5V14H12z" fill="currentColor" stroke="none" />
  </Icon>
);

export function JumpLogo({ height = 24, className = '', motion }: { height?: number; className?: string; motion?: 'enter' | 'loop' }) {
  return (
    <svg
      height={height}
      width={(height * JUMP_LOGO.width) / JUMP_LOGO.height}
      viewBox={`0 0 ${JUMP_LOGO.width} ${JUMP_LOGO.height}`}
      fill="currentColor"
      role="img"
      aria-label="Jump"
      className={className}
    >
      <path d={JUMP_LOGO.letters} fillRule="evenodd" className={motion === 'enter' ? 'animate-fade' : undefined} />
      <path d={JUMP_LOGO.arrow} className={motion === 'enter' ? 'animate-arrow-in [animation-delay:150ms]' : motion === 'loop' ? 'animate-arrow-nudge' : undefined} />
    </svg>
  );
}

/** The app icon: the wordmark on an ink tile. Same motion options as {@link JumpLogo}. */
export function StepMark({
  size = 28,
  className = '',
  motion,
}: {
  size?: number;
  className?: string;
  motion?: 'enter' | 'loop';
}) {
  const inner = 76;
  const scale = inner / JUMP_LOGO.width;
  const offsetY = (100 - JUMP_LOGO.height * scale) / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <rect width="100" height="100" rx="22" fill="#121212" />
      <g transform={`translate(${(100 - inner) / 2} ${offsetY}) scale(${scale})`} fill="#F2EFE8">
        <path d={JUMP_LOGO.letters} fillRule="evenodd" className={motion === 'enter' ? 'animate-fade' : undefined} />
        <path d={JUMP_LOGO.arrow} className={motion === 'enter' ? 'animate-arrow-in [animation-delay:150ms]' : motion === 'loop' ? 'animate-arrow-nudge' : undefined} />
      </g>
    </svg>
  );
}

/** Filled flame for streaks; colour it with text-*. */
export const FlameIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
    <path d="M12 2c.6 3.2-1 5.2-2.6 7C7.7 10.9 6 12.9 6 15.6 6 19.2 8.7 22 12 22s6-2.8 6-6.3c0-2.6-1.3-4.4-2.6-5.9-.2 1.5-.9 2.6-2.1 3.2.4-3.8-.6-8.3-1.3-11Z" />
  </svg>
);

/** Outline heart; pass `filled` for the liked state. */
export const HeartIcon = ({ filled = false, size = 20, ...props }: IconProps & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
    <path d="M12 20.5s-7.5-4.4-9.3-9.2C1.5 8 3.4 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.6 0 5.5 3.5 4.3 6.8-1.8 4.8-9.3 9.2-9.3 9.2Z" />
  </svg>
);

export const CommentIcon = (p: IconProps) => (
  <Icon {...p} strokeLinejoin="round">
    <path d="M4 5h16v11H9l-5 4z" />
  </Icon>
);

export const MicIcon = (p: IconProps) => (
  <Icon {...p} strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
);

export const PlayIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
  </svg>
);

export const ReplyIcon = (p: IconProps) => (
  <Icon {...p} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 6 6v5" />
  </Icon>
);

export const EditIcon = (p: IconProps) => (
  <Icon {...p} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const WalkIcon = (p: IconProps) => (
  <Icon {...p} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13" cy="4" r="1.8" />
    <path d="m9 21 3-7 3 3v4M12 14l-1-5-4 3v3M11 9l4 2 2 3" />
  </Icon>
);

export const SlidersIcon = (p: IconProps) => (
  <Icon {...p} strokeLinecap="round">
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Icon>
);
