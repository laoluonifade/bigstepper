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

export const ActivityIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
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

/** The Jump mark: three rising steps — a podium and a bar chart at once. */
/**
 * The Jump mark. `motion="enter"` grows the three steps in on mount; `motion="loop"` keeps them
 * stepping, for waiting states (finding GPS, loading).
 */
export function StepMark({
  size = 28,
  className = '',
  motion,
}: {
  size?: number;
  className?: string;
  motion?: 'enter' | 'loop';
}) {
  const bar = motion === 'loop' ? 'origin-own-bottom animate-stride' : motion === 'enter' ? 'origin-own-bottom animate-grow-y' : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="5" fill="#121212" />
      <rect x="6" y="18" width="6" height="8" fill="#FF4D12" className={bar} style={motion ? { animationDelay: '0ms' } : undefined} />
      <rect x="13" y="12" width="6" height="14" fill="#FF4D12" className={bar} style={motion ? { animationDelay: motion === 'loop' ? '150ms' : '110ms' } : undefined} />
      <rect x="20" y="6" width="6" height="20" fill="#E4FF3A" className={bar} style={motion ? { animationDelay: motion === 'loop' ? '300ms' : '220ms' } : undefined} />
    </svg>
  );
}
