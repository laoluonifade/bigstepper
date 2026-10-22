import { ReactNode, RefObject } from 'react';
import { REACTIONS, type Reaction } from '../lib/reactions';
import { EmojiPopover } from './EmojiPopover';
import { cx } from './ui';

const BUTTON = 38;
const SHADOW = 'shadow-[0_10px_32px_-10px_rgba(18,18,18,0.35)]';

/**
 * One slim pill of reactions (scrolls sideways on narrow screens), with an optional small menu
 * underneath for message actions.
 */
export function ReactionBar({ anchor, current, onPick, onClose, menu }: {
  anchor: RefObject<HTMLElement>; current?: Reaction | string | null; onPick: (reaction: Reaction | null) => void; onClose: () => void;
  menu?: Array<{ label: string; icon: ReactNode; onSelect: () => void; danger?: boolean }>;
}) {
  const width = Math.min(window.innerWidth - 16, REACTIONS.length * BUTTON + 12);
  const height = 50 + (menu?.length ? menu.length * 40 + 14 : 0);
  return <EmojiPopover anchor={anchor} label="React" width={width} height={height} onClose={onClose} bare>
    <div className={cx('no-scrollbar flex overflow-x-auto overscroll-contain rounded-full border border-line/70 bg-card px-1.5 py-1', SHADOW)}>
      {REACTIONS.map((reaction, index) => <button
        key={reaction.value}
        type="button"
        className={cx('flex h-[38px] w-[38px] shrink-0 animate-pop items-center justify-center rounded-full text-[23px] transition-transform duration-150 hover:-translate-y-1 hover:scale-125 active:scale-95', current === reaction.value && 'bg-ink/[0.08]')}
        style={{ animationDelay: `${index * 15}ms` }}
        title={reaction.label}
        aria-label={reaction.label}
        aria-pressed={current === reaction.value}
        onClick={() => onPick(current === reaction.value ? null : reaction.value)}
      >{reaction.emoji}</button>)}
    </div>
    {menu?.length ? <div className={cx('mt-2 w-48 overflow-hidden rounded-2xl border border-line/70 bg-card py-1', SHADOW)}>
      {menu.map((item) => <button key={item.label} type="button" className={cx('flex w-full items-center justify-between px-4 py-2.5 text-left text-[14px] hover:bg-ink/[0.04]', item.danger && 'text-bad')} onClick={item.onSelect}>
        {item.label}<span className="text-ink-3">{item.icon}</span>
      </button>)}
    </div> : null}
  </EmojiPopover>;
}
