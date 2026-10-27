import { REPORT_NOUN, REPORT_REASONS, type ReportReason, type ReportTarget } from '@jump/shared/safety';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, post } from '@/lib/api';
import { confirm } from '@/lib/dialog';
import { colors, radius } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { Sheet } from './Sheet';
import { Button, ErrorNotice, haptic, TextField, Txt } from './ui';

export type ReportSubject = { targetType: ReportTarget; target: string; name?: string };

/** Everything that shows what a block or report hides: refetched so it disappears straight away. */
function refreshHidden(queryClient: QueryClient) {
  for (const key of ['feed', 'feed-post', 'feed-comments', 'messages', 'club-chat', 'runner', 'blocks']) void queryClient.invalidateQueries({ queryKey: [key] });
}

let current: ReportSubject | null = null;
const listeners = new Set<() => void>();
const setSubject = (next: ReportSubject | null) => { current = next; listeners.forEach((listener) => listener()); };

/** Opens the one report sheet (mounted once by ReportHost) for this Rant, comment, message or runner. */
export function openReport(subject: ReportSubject) {
  setSubject(subject);
}

/** Mounted once in the signed-in layout, so any screen can open a report without a sheet per row. */
export function ReportHost() {
  const subject = useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => current);
  return <ReportSheet subject={subject} onClose={() => setSubject(null)} />;
}

/**
 * Report a Rant, comment, message or runner: why, and optionally a note. It disappears for you at once;
 * Jump's team reviews the report and lets you know.
 */
export function ReportSheet({ subject, onClose }: { subject: ReportSubject | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: () => post('/reports', { targetType: subject!.targetType, target: subject!.target, reason, ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess() {
      haptic('success');
      refreshHidden(queryClient);
      toast({ tone: 'ok', title: 'Thanks for reporting', message: 'We’ll review it and let you know. You won’t see it any more.' });
      close();
    },
  });
  function close() {
    setReason(null);
    setNote('');
    send.reset();
    onClose();
  }
  const noun = subject ? REPORT_NOUN[subject.targetType] : '';
  return <Sheet open={subject !== null} onOpenChange={(open) => !open && close()}
    title={subject?.targetType === 'profile' ? `Report ${subject.name ?? 'this runner'}` : `Report this ${noun}`}
    description="Only Jump’s team sees who reported it."
    footer={<Button full variant="dark" title={send.isPending ? 'Sending…' : 'Send report'} loading={send.isPending}
      disabled={!reason || (reason === 'other' && note.trim().length < 3)} onPress={() => send.mutate()} />}>
    <View style={{ gap: 8 }}>
      {REPORT_REASONS.map((option) => {
        const picked = reason === option.value;
        return <Pressable key={option.value} onPress={() => { haptic('select'); setReason(option.value); }} accessibilityRole="radio" accessibilityState={{ selected: picked }}
          style={[styles.reason, picked && { borderColor: colors.ink, backgroundColor: colors.inkWash }]}>
          <View style={[styles.radio, picked && { borderColor: colors.ink }]}>{picked ? <View style={styles.dot} /> : null}</View>
          <View style={{ flex: 1 }}>
            <Txt size={15} weight="semibold">{option.label}</Txt>
            <Txt size={13} color="ink2">{option.detail}</Txt>
          </View>
        </Pressable>;
      })}
      <TextField label={reason === 'other' ? 'What’s wrong?' : 'Anything else?'} optional={reason !== 'other'} multiline maxLength={500}
        value={note} onChangeText={setNote} placeholder="Add details that help us review it" style={{ minHeight: 72 }} />
      <ErrorNotice error={send.error} />
    </View>
  </Sheet>;
}

/** Asks first, then blocks: their Rants, comments and messages disappear and neither of you can message or follow the other. */
export async function blockRunner(queryClient: QueryClient, username: string, name?: string) {
  const ok = await confirm({
    title: `Block ${name ?? `@${username}`}?`,
    message: 'You won’t see their Rants, comments or messages, and neither of you can message or follow the other. They aren’t told. You’ll both still appear on competition leaderboards.',
    confirmLabel: 'Block', destructive: true,
  });
  if (!ok) return false;
  try {
    await post(`/blocks/${encodeURIComponent(username)}`);
    haptic('success');
    refreshHidden(queryClient);
    toast({ tone: 'ok', message: `${name ?? `@${username}`} is blocked.` });
    return true;
  } catch (error) {
    toast({ tone: 'bad', message: error instanceof Error ? error.message : 'Couldn’t block them. Try again.' });
    return false;
  }
}

export async function unblockRunner(queryClient: QueryClient, username: string, name?: string) {
  try {
    await api(`/blocks/${encodeURIComponent(username)}`, { method: 'DELETE' });
    refreshHidden(queryClient);
    toast({ tone: 'ok', message: `${name ?? `@${username}`} is unblocked.` });
    return true;
  } catch (error) {
    toast({ tone: 'bad', message: error instanceof Error ? error.message : 'Couldn’t unblock them. Try again.' });
    return false;
  }
}

const styles = StyleSheet.create({
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, padding: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.ink3, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink },
});
