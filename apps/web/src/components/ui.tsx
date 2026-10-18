import { Link, useNavigate, type LinkProps, type NavigateOptions } from '@tanstack/react-router';
import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { isApiError } from '../lib/api';
import { VERIFICATION_LABEL } from '../lib/copy';
import { initials } from '../lib/format';
import type { VerificationStatus } from '../lib/types';
import { AlertIcon, ArrowLeftIcon, CheckIcon, CopyIcon, InfoIcon, OfflineIcon } from './icons';

/**
 * Navigates once when mounted. TanStack's `<Navigate>` re-navigates whenever its props object changes,
 * so an inline `search={{ … }}` re-fires on every render and can loop until the tab runs out of memory.
 */
export function Redirect(props: NavigateOptions) {
  const navigate = useNavigate();
  const target = useRef(props);
  useEffect(() => {
    void navigate({ ...target.current, replace: true });
  }, [navigate]);
  return null;
}

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}

/* ───────────────────────── Layout ───────────────────────── */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: LinkProps['to']; label: string };
}) {
  return (
    <header className="mb-6 md:mb-8">
      {back && (
        <Link to={back.to} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
          <ArrowLeftIcon size={16} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h1 className="display text-[30px] sm:text-[40px]">{title}</h1>
          {description && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
      <h2 className="wide text-[13px] font-extrabold uppercase tracking-[0.08em]">{children}</h2>
      {aside && <div className="text-[13px] text-ink-2">{aside}</div>}
    </div>
  );
}

/* ───────────────────────── Feedback ───────────────────────── */

type Tone = 'info' | 'ok' | 'warn' | 'bad' | 'neutral';

const toneClasses: Record<Tone, string> = {
  info: 'border-ink bg-card',
  ok: 'border-ok bg-ok-wash',
  warn: 'border-warn bg-warn-wash',
  bad: 'border-bad bg-bad-wash',
  neutral: 'border-line bg-card',
};

const toneIcon: Record<Tone, ReactNode> = {
  info: <InfoIcon size={18} />,
  ok: <CheckIcon size={18} />,
  warn: <AlertIcon size={18} />,
  bad: <AlertIcon size={18} />,
  neutral: <InfoIcon size={18} />,
};

export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cx('flex gap-3 rounded border-l-4 border-y border-r px-4 py-3', toneClasses[tone], className)}
    >
      <span className={cx('mt-0.5 shrink-0', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-bad')}>
        {toneIcon[tone]}
      </span>
      <div className="min-w-0 flex-1 text-[14px] leading-relaxed">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={cx(Boolean(title) && 'mt-0.5', 'text-ink-2')}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorNotice({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const offline = isApiError(error, 0);
  const disabled = isApiError(error, 503);
  return (
    <Notice
      tone={disabled ? 'warn' : 'bad'}
      className={className}
      title={offline ? 'You’re offline' : disabled ? 'Not available right now' : undefined}
      action={
        onRetry && !disabled ? (
          <button type="button" className="btn-quiet btn-sm" onClick={onRetry}>
            Try again
          </button>
        ) : undefined
      }
    >
      <span className="inline-flex items-center gap-2">
        {offline && <OfflineIcon size={16} />}
        {message}
      </span>
    </Notice>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-2" role="status">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-3 w-1.5 animate-blink bg-ink" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </span>
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded bg-line/60', className)} aria-hidden="true" />;
}

export function EmptyState({
  mark,
  title,
  children,
  action,
}: {
  mark?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-md border-[1.5px] border-dashed border-ink-3/60 px-6 py-10 text-center">
      {mark && <div className="score mx-auto mb-3 text-[44px] text-ink-3">{mark}</div>}
      <p className="wide text-[15px] font-extrabold uppercase">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/* ───────────────────────── Data display ───────────────────────── */

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('tag border-ink/80 bg-card text-ink', className)}>{children}</span>;
}

const verificationStyles: Record<VerificationStatus, string> = {
  PENDING_VERIFICATION: 'border-warn/60 bg-warn-wash text-warn',
  VERIFIED: 'border-ok/60 bg-ok-wash text-ok',
  FLAGGED: 'border-bad/60 bg-bad-wash text-bad',
  REJECTED: 'border-ink bg-ink text-paper',
};

export function VerificationTag({ status }: { status: VerificationStatus }) {
  return (
    <span className={cx('tag', verificationStyles[status])}>
      <span
        className={cx(
          'h-1.5 w-1.5 rounded-full bg-current',
          status === 'PENDING_VERIFICATION' && 'animate-blink',
        )}
        aria-hidden="true"
      />
      {VERIFICATION_LABEL[status]}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  sub,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span className="score text-[32px]">{value}</span>
        {unit && <span className="text-[13px] font-semibold text-ink-2">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-[12px] text-ink-2">{sub}</p>}
    </div>
  );
}

/** Thin progress meter: the filled part carries the accent; the track is a lighter step. */
export function Meter({ value, max, tone = 'track', label }: { value: number; max: number; tone?: 'track' | 'ink' | 'ok'; label: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="h-2 w-full overflow-hidden rounded-sm bg-ink/10"
    >
      <div
        className={cx('h-full transition-[width] duration-500', tone === 'track' && 'bg-track', tone === 'ink' && 'bg-ink', tone === 'ok' && 'bg-ok')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Avatar({ name, highlight, size = 36 }: { name: string | null | undefined; highlight?: boolean; size?: number }) {
  return (
    <span
      className={cx(
        'wide inline-flex shrink-0 items-center justify-center rounded-sm font-extrabold',
        highlight ? 'bg-ink text-volt' : 'bg-ink/[0.07] text-ink',
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function KeyValue({ items }: { items: Array<{ label: ReactNode; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-line">
      {items.map((item, index) => (
        <div key={index} className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
          <dt className="text-ink-2">{item.label}</dt>
          <dd className="num text-right font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────────────────────── Inputs ───────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
  optional,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-3">Optional</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="hint font-semibold text-bad">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded border-[1.5px] border-ink bg-card p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'wide min-h-9 rounded-sm px-4 text-[12px] font-bold uppercase tracking-[0.06em] transition-colors',
              active ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={cx('btn-quiet btn-sm', className)}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function SubNav({ items }: { items: Array<{ to: LinkProps['to']; label: string }> }) {
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Section">
      <div className="flex min-w-max gap-6 border-b border-line">
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="wide -mb-px border-b-[3px] border-transparent pb-2.5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-ink-3 hover:text-ink [&.active]:border-track [&.active]:text-ink"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
