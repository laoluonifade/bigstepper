import { REPORT_NOUN, REPORT_REASONS, type ReportReason, type ReportTarget } from '@jump/shared/safety';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, post } from '../lib/api';
import { toast } from '../lib/toast';
import { Modal } from './Modal';
import { cx, ErrorNotice } from './ui';

export type ReportSubject = { targetType: ReportTarget; target: string; name?: string };
type BlockSubject = { username: string; name?: string };
type Open = { report: ReportSubject } | { block: BlockSubject } | null;

let current: Open = null;
const listeners = new Set<() => void>();
const set = (next: Open) => { current = next; listeners.forEach((listener) => listener()); };

/** Opens the one report dialog (mounted once by SafetyHost) for this Rant, comment, message or runner. */
export function openReport(subject: ReportSubject) {
  set({ report: subject });
}

/** Asks first (in the one block dialog), then blocks. */
export function openBlock(subject: BlockSubject) {
  set({ block: subject });
}

/** Everything a block or report hides: refetched so it disappears straight away. */
function refreshHidden(queryClient: QueryClient) {
  for (const key of ['feed', 'feed-post', 'feed-comments', 'messages', 'club-chat', 'runner', 'blocks']) void queryClient.invalidateQueries({ queryKey: [key] });
}

export async function unblockRunner(queryClient: QueryClient, username: string, name?: string) {
  try {
    await api(`/blocks/${encodeURIComponent(username)}`, { method: 'DELETE' });
    refreshHidden(queryClient);
    toast({ tone: 'ok', message: `${name ?? `@${username}`} is unblocked.` });
  } catch (error) {
    toast({ tone: 'bad', message: error instanceof Error ? error.message : 'Couldn’t unblock them. Try again.' });
  }
}

/** Mounted once in the signed-in shell, so any page can report or block without a dialog per row. */
export function SafetyHost() {
  const open = useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => current);
  if (!open) return null;
  return 'report' in open ? <ReportDialog subject={open.report} onClose={() => set(null)} /> : <BlockDialog subject={open.block} onClose={() => set(null)} />;
}

function ReportDialog({ subject, onClose }: { subject: ReportSubject; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: () => post('/reports', { targetType: subject.targetType, target: subject.target, reason, ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess() {
      refreshHidden(queryClient);
      toast({ tone: 'ok', title: 'Thanks for reporting', message: 'We’ll review it and let you know. You won’t see it any more.' });
      onClose();
    },
  });
  const title = subject.targetType === 'profile' ? `Report ${subject.name ?? 'this runner'}` : `Report this ${REPORT_NOUN[subject.targetType]}`;
  return <Modal title={title} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); if (reason) send.mutate(); }} className="space-y-2">
      <p className="mb-3 text-[13px] text-ink-2">Only Jump’s team sees who reported it.</p>
      {REPORT_REASONS.map((option) => <label key={option.value} className={cx('flex cursor-pointer items-center gap-3 rounded-lg border-[1.5px] p-3', reason === option.value ? 'border-ink bg-ink/[0.04]' : 'border-line hover:border-ink/40')}>
        <input type="radio" name="reason" className="h-4 w-4 accent-ink" checked={reason === option.value} onChange={() => setReason(option.value)} />
        <span><span className="block text-[14px] font-semibold">{option.label}</span><span className="block text-[12px] text-ink-2">{option.detail}</span></span>
      </label>)}
      <label className="block pt-2">
        <span className="text-[13px] font-semibold">{reason === 'other' ? 'What’s wrong?' : 'Anything else? (optional)'}</span>
        <textarea className="field mt-1 min-h-20 py-2" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add details that help us review it" />
      </label>
      <ErrorNotice error={send.error} />
      <button className="btn-dark mt-2 w-full" disabled={!reason || (reason === 'other' && note.trim().length < 3) || send.isPending}>{send.isPending ? 'Sending…' : 'Send report'}</button>
    </form>
  </Modal>;
}

function BlockDialog({ subject, onClose }: { subject: BlockSubject; onClose: () => void }) {
  const queryClient = useQueryClient();
  const name = subject.name ?? `@${subject.username}`;
  const block = useMutation({
    mutationFn: () => post(`/blocks/${encodeURIComponent(subject.username)}`),
    onSuccess() {
      refreshHidden(queryClient);
      toast({ tone: 'ok', message: `${name} is blocked.` });
      onClose();
    },
  });
  return <Modal title={`Block ${name}?`} onClose={onClose}>
    <p className="text-[14px] leading-relaxed text-ink-2">You won’t see their Rants, comments or messages, and neither of you can message or follow the other. They aren’t told. You’ll both still appear on competition leaderboards.</p>
    <ErrorNotice error={block.error} />
    <div className="mt-5 grid grid-cols-2 gap-2">
      <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
      <button type="button" className="btn border-[1.5px] border-ink bg-bad text-paper hover:brightness-95" disabled={block.isPending} onClick={() => block.mutate()}>{block.isPending ? 'Blocking…' : 'Block'}</button>
    </div>
  </Modal>;
}

/** A "⋯" button with a small menu under it; any click outside or Escape closes it. */
export function MoreMenu({ label, items, className }: { label: string; items: Array<{ label: string; onSelect: () => void; danger?: boolean }>; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={box} className={cx('relative z-[2]', className)}>
    <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value); }}
      className="rounded-full px-1.5 py-0.5 text-[18px] font-bold leading-none text-ink-3 hover:bg-ink/[0.06] hover:text-ink">⋯</button>
    {open && <div role="menu" className="absolute right-0 top-full mt-1 w-56 overflow-hidden rounded-xl border-[1.5px] border-ink bg-card shadow-hard-sm">
      {items.map((item) => <MenuItem key={item.label} danger={item.danger} onSelect={() => { setOpen(false); item.onSelect(); }}>{item.label}</MenuItem>)}
    </div>}
  </div>;
}

function MenuItem({ children, onSelect, danger }: { children: ReactNode; onSelect: () => void; danger?: boolean }) {
  return <button type="button" role="menuitem" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSelect(); }}
    className={cx('block w-full px-4 py-2.5 text-left text-[14px] font-semibold hover:bg-ink/[0.05]', danger && 'text-bad')}>{children}</button>;
}
