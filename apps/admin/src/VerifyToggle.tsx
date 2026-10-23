import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cx, VerifiedTick } from './ui';
import { toast } from './toast';
import { patch } from './api';

/** Give or take away a blue tick. People need a verified email first. */
export function VerifyToggle({ kind, id, verified, emailVerified = true, className }: {
  kind: 'person' | 'club';
  id: string;
  verified: boolean;
  emailVerified?: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => patch(kind === 'person' ? `/admin/people/${encodeURIComponent(id)}/verified` : `/admin/clubs/${id}/verified`, { verified: !verified }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast({ tone: 'ok', message: verified ? 'Blue tick removed.' : 'Blue tick given.' });
    },
    onError(error) { toast({ tone: 'warn', message: error instanceof Error ? error.message : 'That didn’t work.' }); },
  });
  const blocked = !verified && kind === 'person' && !emailVerified;
  return <button
    type="button"
    disabled={toggle.isPending || blocked}
    title={blocked ? 'They need to verify their email first' : undefined}
    onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggle.mutate(); }}
    className={cx('relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[12px] font-bold transition-colors disabled:opacity-45',
      verified ? 'border-line bg-card text-ink-2 hover:border-ink' : 'border-[#1D9BF0] bg-[#1D9BF0]/10 text-[#0F75BD] hover:bg-[#1D9BF0]/20', className)}
  >
    <VerifiedTick size={14} />
    {toggle.isPending ? '…' : verified ? 'Remove tick' : blocked ? 'Email not verified' : 'Give blue tick'}
  </button>;
}
