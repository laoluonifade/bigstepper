import { cx } from './ui';

export type EntryMode = 'free' | 'sponsored' | 'paid';

const TAGS: Array<{ value: EntryMode; word: string; line: string; tone: string; tilt: string }> = [
  { value: 'free', word: 'FREE', line: 'No fee. Just run.', tone: 'bg-volt text-ink', tilt: '-rotate-[5deg]' },
  { value: 'sponsored', word: '₦ PRIZE', line: 'Free entry. You fund the cash.', tone: 'bg-track text-ink', tilt: 'rotate-[4deg]' },
  { value: 'paid', word: 'PAID', line: 'Entry fees make the pot.', tone: 'bg-ink text-paper', tilt: '-rotate-[3deg]' },
];

/** Free, funded or paid entry, as three price tags on strings: tilted and faded until one's picked, then it straightens and lifts. */
export function PriceTags({ value, onChange }: { value: EntryMode; onChange: (mode: EntryMode) => void }) {
  return <div className="grid grid-cols-3 gap-2.5 pt-0.5" role="radiogroup" aria-label="Entry">
    {TAGS.map((tag) => {
      const active = value === tag.value;
      return <button key={tag.value} type="button" role="radio" aria-checked={active} aria-label={`${tag.word}: ${tag.line}`} onClick={() => onChange(tag.value)}
        className={cx('group block text-left transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          active ? '-translate-y-1.5 scale-[1.02] opacity-100' : cx(tag.tilt, 'scale-95 opacity-55 hover:opacity-80'))}>
        <svg className="mx-auto -mb-1 block h-[18px] w-full" viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true">
          <path d="M50 18 C 46 10, 54 6, 50 0" stroke="#8A857B" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className={cx('relative flex min-h-[108px] flex-col items-center rounded-xl border-2 border-ink px-2 pb-3 pt-2.5 text-center transition-shadow duration-300',
          tag.tone, active ? 'shadow-[4px_4px_0_#121212]' : 'shadow-none')}>
          <span className="h-3 w-3 rounded-full border-2 border-ink bg-paper" aria-hidden="true" />
          <span className="score mt-2.5 whitespace-nowrap text-[22px] leading-none">{tag.word}</span>
          <span className="mt-1.5 text-[11.5px] font-semibold leading-[14px]">{tag.line}</span>
        </span>
      </button>;
    })}
  </div>;
}
