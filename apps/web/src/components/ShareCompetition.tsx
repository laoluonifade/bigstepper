import { useEffect, useRef, useState } from 'react';
import { loadAvatars } from '../lib/boardImage';
import { competitionCardData } from '@jump/shared/competition';
import { type CardFormat, drawCompetitionCard } from '../lib/competitionCard';
import { hasScored } from '../lib/scoring';
import type { CompetitionTable, StandingRow, Unit } from '../lib/types';
import { CopyIcon, ShareIcon } from './icons';
import { Modal } from './Modal';
import { cx, Skeleton } from './ui';

/**
 * A designed card of the competition to post (a Story for Instagram and WhatsApp status, a Post for X,
 * chats and the feed), plus one-tap links for WhatsApp and X.
 */
export function ShareCompetitionSheet({ table, rows, viewerId, unit, onClose }: {
  table: CompetitionTable; rows: StandingRow[]; viewerId?: string; unit: Unit; onClose: () => void;
}) {
  const [format, setFormat] = useState<CardFormat>('story');
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const blob = useRef<Blob | null>(null);
  const url = `${window.location.origin}/competitions/${table.code}`;
  const mine = rows.find((row) => row.userId === viewerId);
  const caption = mine && hasScored(table.scoringMethod, mine.score)
    ? `I’m #${mine.rank} in “${table.title}” on Jump. Think you can beat me? Join with code ${table.code}`
    : `I’m in “${table.title}” on Jump. Join me with code ${table.code}`;
  const filename = `jump-${table.code}-${format}.png`;

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    const data = competitionCardData(table, rows, viewerId, unit, Date.now(), `${window.location.host}/competitions/${table.code}`);
    const people = rows.filter((row) => data.podium.some((person) => person.userId === row.userId) || row.userId === viewerId)
      .map((row) => ({ userId: row.userId, displayName: row.displayName, avatarUrl: row.avatarUrl ?? null, avatarStyle: row.avatarStyle }));
    const render = async (photos: boolean): Promise<Blob | null> => {
      // Wait for the fonts, so the card isn't drawn in a fallback face.
      await document.fonts?.ready;
      const canvas = document.createElement('canvas');
      drawCompetitionCard(canvas, data, format, await loadAvatars(people, photos));
      try {
        return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      } catch {
        // A photo host without CORS taints the canvas: use everyone's default picture.
        return photos ? render(false) : null;
      }
    };
    void render(true).then((made) => {
      if (cancelled || !made) return;
      blob.current = made;
      setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(made); });
    });
    return () => { cancelled = true; };
  }, [format, table, rows, viewerId, unit]);

  async function share() {
    if (!blob.current) return;
    const file = new File([blob.current], filename, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: table.title, text: `${caption} ${url}` });
        setStatus(null);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('Sharing didn’t work here. Save the image and post it from your photos.');
      }
    } else {
      save();
      setStatus('Saved. Post it from your photos, then add the link.');
    }
  }

  function save() {
    if (!preview) return;
    const link = document.createElement('a');
    link.href = preview;
    link.download = filename;
    link.click();
  }

  async function copy() {
    await navigator.clipboard?.writeText(`${caption} ${url}`);
    setStatus('Caption and link copied.');
  }

  return <Modal title="Share this competition" onClose={onClose}>
    <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Card size">
      {([['story', 'Story', 'Instagram · WhatsApp status'], ['post', 'Post', 'X · chats · feed']] as const).map(([value, label, hint]) =>
        <button key={value} type="button" role="tab" aria-selected={format === value} onClick={() => setFormat(value)}
          className={cx('rounded-xl border-[1.5px] border-ink px-3 py-2 text-left', format === value ? 'bg-ink text-paper' : 'bg-card')}>
          <span className="block text-[14px] font-bold">{label}</span>
          <span className={cx('block text-[11px]', format === value ? 'text-paper/70' : 'text-ink-3')}>{hint}</span>
        </button>)}
    </div>
    <div className={cx('mx-auto mt-4 overflow-hidden rounded-xl border-[1.5px] border-ink bg-ink', format === 'story' ? 'w-[62%]' : 'w-[82%]')} style={{ aspectRatio: format === 'story' ? '1080 / 1920' : '1080 / 1350' }}>
      {preview ? <img src={preview} alt={`Share card for ${table.title}`} className="h-full w-full" /> : <Skeleton className="h-full w-full rounded-none opacity-20" />}
    </div>
    <button type="button" className="btn-primary mt-4 w-full" disabled={!preview} onClick={() => void share()}><ShareIcon size={16} /> Share card</button>
    <div className="mt-2 grid grid-cols-3 gap-2">
      <a className="btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${caption} ${url}`)}`} target="_blank" rel="noreferrer noopener">WhatsApp</a>
      <a className="btn-secondary btn-sm" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer noopener">X</a>
      <button type="button" className="btn-secondary btn-sm" disabled={!preview} onClick={save}>Save</button>
    </div>
    <button type="button" className="mt-2 inline-flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={() => void copy()}><CopyIcon size={14} /> Copy caption and link</button>
    {status ? <p className="mt-2 text-center text-[13px] text-ink-2">{status}</p>
      : <p className="mt-2 text-center text-[12px] text-ink-3">On Instagram, add a link sticker to your story so people can tap straight in.</p>}
  </Modal>;
}
