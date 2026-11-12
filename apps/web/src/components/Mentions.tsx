import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { forwardRef, KeyboardEvent, ReactNode, RefObject, TextareaHTMLAttributes, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { AvatarStyle } from '../lib/types';
import { useProfile } from '../lib/queries';
import { Avatar, cx } from './ui';

type Person = { username: string; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; isMe?: boolean };

/** Same rule as the API: @ at a word start, 2–30 of a–z, 0–9 or _. */
const MENTION = /(^|[^a-z0-9_@])@([a-z0-9_]{2,30})\b/gi;

const LINK = /\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'’”]/gi;
const COMPETITION_LINK = /\bhttps?:\/\/(?:www\.)?startajump\.com\/competitions\/([a-z0-9]{4,16})\b\/?/i;

/** The first Jump competition link in a post, so it can show as a card instead of a bare URL. */
export function competitionLink(text: string) {
  const match = COMPETITION_LINK.exec(text);
  return match ? { url: match[0], code: match[1].toUpperCase() } : null;
}

function shortUrl(url: string) {
  const bare = url.replace(/^https?:\/\/(www\.)?/i, '');
  return bare.length > 40 ? `${bare.slice(0, 39)}…` : bare;
}

function withMentions(text: string, key: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    const start = match.index! + match[1].length;
    const username = match[2];
    parts.push(text.slice(last, start), <Link key={`${key}-${start}`} to="/runners/$username" params={{ username: username.toLowerCase() }} search={{}} className="relative z-[1] font-semibold text-track-deep hover:underline" onClick={(event) => event.stopPropagation()}>@{username}</Link>);
    last = start + username.length + 1;
  }
  parts.push(text.slice(last));
  return parts;
}

/** Text with @handles turned into profile links and URLs made clickable. `hide` drops a link shown as a card below. */
export function MentionText({ text, hide }: { text: string; hide?: string }) {
  const shown = hide ? text.replace(hide, '').replace(/[ \t]+$/gm, '').trim() : text;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of shown.matchAll(LINK)) {
    const url = match[0];
    const competition = competitionLink(url);
    parts.push(...withMentions(shown.slice(last, match.index), `t${last}`), competition
      ? <Link key={`l${match.index}`} to="/competitions/$code" params={{ code: competition.code }} className="relative z-[1] font-semibold text-track-deep hover:underline" onClick={(event) => event.stopPropagation()}>{shortUrl(url)}</Link>
      : <a key={`l${match.index}`} href={url} target="_blank" rel="noopener noreferrer nofollow" className="relative z-[1] font-semibold text-track-deep hover:underline" onClick={(event) => event.stopPropagation()}>{shortUrl(url)}</a>);
    last = match.index! + url.length;
  }
  parts.push(...withMentions(shown.slice(last), `t${last}`));
  return <>{parts}</>;
}

/** The "@partial" being typed just before the caret, if any. */
function activeMention(value: string, caret: number) {
  const match = /(^|[^a-z0-9_@])@([a-z0-9_]{0,30})$/i.exec(value.slice(0, caret));
  return match ? { term: match[2], start: caret - match[2].length - 1 } : null;
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Where the suggestion list opens: below for the top composer, above for a bottom reply bar. */
  placement?: 'above' | 'below';
};

/** A textarea that suggests runners after "@" and inserts their handle. */
export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function MentionTextarea(
  { value, onValueChange, placement = 'below', onKeyDown, ...props }, ref,
) {
  const profile = useProfile();
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(0);
  const mention = activeMention(value, caret);
  const open = Boolean(mention) && dismissed !== mention?.start;
  const term = mention?.term ?? '';

  const following = useQuery({
    queryKey: ['connections', profile.data?.username, 'following'],
    queryFn: () => api<Person[]>(`/users/${encodeURIComponent(profile.data!.username)}/following`),
    enabled: open && Boolean(profile.data?.username),
    staleTime: 60_000,
  });
  const search = useQuery({
    queryKey: ['runner-search', term],
    queryFn: () => api<Person[]>(`/users/search?q=${encodeURIComponent(term)}`),
    enabled: open && term.length >= 2,
    staleTime: 30_000,
  });
  const people = useMemo(() => {
    const source = term.length >= 2 ? search.data ?? [] : (following.data ?? []).filter((person) => person.username.startsWith(term.toLowerCase()));
    return source.filter((person) => !person.isMe && person.username !== profile.data?.username).slice(0, 6);
  }, [term, search.data, following.data, profile.data?.username]);
  useEffect(() => setHighlight(0), [term]);

  function insert(person: Person) {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(caret).replace(/^[a-z0-9_]*/i, '');
    const next = `${before}@${person.username} ${after}`;
    onValueChange(next);
    const position = before.length + person.username.length + 2;
    setCaret(position);
    requestAnimationFrame(() => {
      const field = (ref as RefObject<HTMLTextAreaElement> | null)?.current;
      field?.focus();
      field?.setSelectionRange(position, position);
    });
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && people.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight((index) => (index + (event.key === 'ArrowDown' ? 1 : people.length - 1)) % people.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        insert(people[highlight]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissed(mention!.start);
        return;
      }
    }
    onKeyDown?.(event);
  }

  return <div className="relative min-w-0 flex-1">
    <textarea
      ref={ref}
      {...props}
      value={value}
      onChange={(event) => { onValueChange(event.target.value); setCaret(event.target.selectionStart); }}
      onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
      onKeyDown={keyDown}
      aria-autocomplete="list"
      aria-expanded={open && people.length > 0}
    />
    {open && people.length > 0 && <ul role="listbox" aria-label="Mention a runner" className={cx(
      'absolute left-0 z-30 w-full min-w-[240px] max-w-[340px] animate-pop overflow-hidden rounded-2xl border border-line/70 bg-card p-1 shadow-[0_12px_40px_-12px_rgba(18,18,18,0.35)]',
      placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-1',
    )}>
      {people.map((person, index) => <li key={person.username} role="option" aria-selected={index === highlight}>
        <button type="button" className={cx('flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left', index === highlight ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.04]')} onMouseDown={(event) => event.preventDefault()} onClick={() => insert(person)}>
          <Avatar name={person.displayName} src={person.avatarUrl} avatarStyle={person.avatarStyle} size={32} className="shrink-0 rounded-full" />
          <span className="min-w-0 leading-tight"><span className="block truncate text-[14px] font-semibold">{person.displayName}</span><span className="block truncate text-[12px] text-ink-3">@{person.username}</span></span>
        </button>
      </li>)}
    </ul>}
  </div>;
});
