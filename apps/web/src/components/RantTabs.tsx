import { Link } from '@tanstack/react-router';
import { cx } from './ui';

export function RantTabs({ active, unread = 0 }: { active: 'explore' | 'dms'; unread?: number }) {
  return <nav aria-label="Rant sections" className="flex border-b-[1.5px] border-line">
    {([{ value: 'explore', label: 'Explore', to: '/feed' }, { value: 'dms', label: 'DMs', to: '/messages' }] as const).map((tab) =>
      <Link key={tab.value} to={tab.to} aria-current={active === tab.value ? 'page' : undefined} className={cx(
        'wide -mb-[1.5px] flex-1 border-b-[3px] py-3 text-center text-[12px] font-extrabold uppercase transition-colors',
        active === tab.value ? 'border-track text-ink' : 'border-transparent text-ink-3 hover:text-ink',
      )}>{tab.label}{tab.value === 'dms' && unread > 0 && <span className="num ml-2 inline-block min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] leading-[18px] text-paper">{unread > 9 ? '9+' : unread}</span>}</Link>,
    )}
  </nav>;
}
