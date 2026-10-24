import { REACTIONS, type Reaction } from '@jump/shared/reactions';
import type { AvatarStyle } from '@jump/shared/types';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type TextInputProps } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useProfile } from '@/lib/queries';
import { colors, fontFamily, GUTTER, radius, wideLabel } from '@/lib/theme';
import { CloseIcon } from './icons';
import { Avatar, haptic, Txt, type TextFieldRef } from './ui';

/** Explore and DMs, the two halves of Rant. */
export function RantTabs({ active, unread = 0 }: { active: 'explore' | 'dms'; unread?: number }) {
  return <View style={styles.tabs} accessibilityRole="tablist">
    {([{ value: 'explore', label: 'Explore', to: '/feed' }, { value: 'dms', label: 'DMs', to: '/messages' }] as const).map((tab) => {
      const on = active === tab.value;
      return <Pressable key={tab.value} onPress={() => !on && (tab.value === 'dms' ? router.push(tab.to) : router.navigate(tab.to))} accessibilityRole="tab" accessibilityState={{ selected: on }}
        style={[styles.tab, on && { borderBottomColor: colors.track }]}>
        <Text style={[wideLabel(12, 0), { color: on ? colors.ink : colors.ink3 }]}>{tab.label}</Text>
        {tab.value === 'dms' && unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text></View>}
      </Pressable>;
    })}
  </View>;
}

type Person = { username: string; displayName: string; avatarUrl: string | null; avatarStyle?: AvatarStyle; isMe?: boolean };

/** Same rule as the API: @ at a word start, 2–30 of a–z, 0–9 or _. */
const MENTION = /(^|[^a-z0-9_@])@([a-z0-9_]{2,30})\b/gi;

/** Text with @handles turned into profile links. Renders inside a parent <Text>. */
export function MentionText({ text, size = 15 }: { text: string; size?: number }) {
  const parts: Array<string | { username: string }> = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    const start = match.index! + match[1].length;
    parts.push(text.slice(last, start), { username: match[2] });
    last = start + match[2].length + 1;
  }
  parts.push(text.slice(last));
  return <Txt size={size} leading={1.4}>{parts.map((part, index) => typeof part === 'string'
    ? part
    : <Text key={index} suppressHighlighting onPress={() => router.push(`/runners/${part.username.toLowerCase()}`)} style={{ fontFamily: fontFamily('semibold'), color: colors.trackDeep }}>@{part.username}</Text>)}</Txt>;
}

/** The "@partial" being typed just before the caret, if any. */
function activeMention(value: string, caret: number) {
  const match = /(^|[^a-z0-9_@])@([a-z0-9_]{0,30})$/i.exec(value.slice(0, caret));
  return match ? { term: match[2], start: caret - match[2].length - 1 } : null;
}

/** A text input that suggests runners after "@" and inserts their handle. Suggestions show above or below it. */
export function MentionInput({ ref, value, onValueChange, placement = 'below', style, ...props }: Omit<TextInputProps, 'value' | 'onChangeText'> & {
  ref?: React.Ref<TextFieldRef>; value: string; onValueChange: (value: string) => void; placement?: 'above' | 'below';
}) {
  const profile = useProfile();
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const mention = activeMention(value, caret);
  const open = Boolean(mention) && dismissed !== mention?.start;
  const term = mention?.term ?? '';
  const following = useQuery({
    queryKey: ['connections', profile.data?.username, 'following'],
    queryFn: () => api<Person[]>(`/users/${encodeURIComponent(profile.data!.username)}/following`),
    enabled: open && Boolean(profile.data?.username),
    staleTime: 60_000,
  });
  const search = useQuery({ queryKey: ['runner-search', term], queryFn: () => api<Person[]>(`/users/search?q=${encodeURIComponent(term)}`), enabled: open && term.length >= 2, staleTime: 30_000 });
  const people = useMemo(() => {
    const source = term.length >= 2 ? search.data ?? [] : (following.data ?? []).filter((person) => person.username.startsWith(term.toLowerCase()));
    return source.filter((person) => !person.isMe && person.username !== profile.data?.username).slice(0, 6);
  }, [term, search.data, following.data, profile.data?.username]);
  // A selection we set is applied once, then the input owns its caret again.
  useEffect(() => { if (selection) { const timer = setTimeout(() => setSelection(undefined), 50); return () => clearTimeout(timer); } }, [selection]);

  function insert(person: Person) {
    if (!mention) return;
    haptic();
    const before = value.slice(0, mention.start);
    const after = value.slice(caret).replace(/^[a-z0-9_]*/i, '');
    onValueChange(`${before}@${person.username} ${after}`);
    const position = before.length + person.username.length + 2;
    setCaret(position);
    setSelection({ start: position, end: position });
  }

  const list = open && people.length > 0 ? <View style={[styles.suggestions, placement === 'above' ? { marginBottom: 6 } : { marginTop: 6 }]}>
    {people.map((person) => <Pressable key={person.username} onPress={() => insert(person)} style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.inkWash }]}>
      <Avatar name={person.displayName} src={person.avatarUrl} avatarStyle={person.avatarStyle} size={32} round />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight="semibold" numberOfLines={1}>{person.displayName}</Txt>
        <Txt size={12} color="ink3" numberOfLines={1}>@{person.username}</Txt>
      </View>
    </Pressable>)}
    <Pressable onPress={() => setDismissed(mention!.start)} style={styles.dismiss} hitSlop={6} accessibilityLabel="Hide suggestions"><CloseIcon size={14} color={colors.ink3} /></Pressable>
  </View> : null;

  return <View style={{ flex: 1, minWidth: 0 }}>
    {placement === 'above' && list}
    <TextInput
      ref={ref}
      {...props}
      value={value}
      selection={selection}
      onChangeText={onValueChange}
      onSelectionChange={(event) => setCaret(event.nativeEvent.selection.start)}
      placeholderTextColor={colors.ink3}
      selectionColor={colors.track}
      style={[{ fontFamily: fontFamily('regular'), color: colors.ink }, style]}
    />
    {placement === 'below' && list}
  </View>;
}

/**
 * A slim pill of reactions over a dimmed screen, near where it was asked for, with an optional menu
 * underneath (message actions). Tap outside to close.
 */
export function ReactionPicker({ open, onClose, current, onPick, y, menu }: {
  open: boolean; onClose: () => void; current?: Reaction | string | null; onPick: (reaction: Reaction | null) => void;
  /** Screen y of what was pressed, so the pill opens beside it. */
  y?: number;
  menu?: Array<{ label: string; icon: ReactNode; onSelect: () => void; danger?: boolean }>;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menuHeight = menu?.length ? menu.length * 44 + 16 : 0;
  const top = Math.min(Math.max((y ?? height / 2) - 70, insets.top + 8), height - insets.bottom - 70 - menuHeight);
  return <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close">
      <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,18,0.25)' }]} />
    </Pressable>
    <View style={{ position: 'absolute', top, left: GUTTER, right: GUTTER }} pointerEvents="box-none">
      <Animated.View entering={ZoomIn.duration(180)} style={styles.pill}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 6, paddingVertical: 4 }}>
          {REACTIONS.map((reaction) => <Pressable key={reaction.value} onPress={() => { haptic(); onPick(current === reaction.value ? null : reaction.value); }} accessibilityRole="button" accessibilityLabel={reaction.label} accessibilityState={{ selected: current === reaction.value }}
            style={({ pressed }) => [styles.emoji, current === reaction.value && { backgroundColor: 'rgba(18,18,18,0.08)' }, pressed && { transform: [{ scale: 1.25 }] }]}>
            <Text style={{ fontSize: 24 }}>{reaction.emoji}</Text>
          </Pressable>)}
        </ScrollView>
      </Animated.View>
      {menu?.length ? <Animated.View entering={FadeIn.duration(180)} style={styles.menu}>
        {menu.map((item, index) => <Pressable key={item.label} onPress={() => { onClose(); item.onSelect(); }} style={({ pressed }) => [styles.menuItem, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, pressed && { backgroundColor: colors.inkWash }]}>
          <Txt size={15} color={item.danger ? 'bad' : 'ink'}>{item.label}</Txt>
          {item.icon}
        </Pressable>)}
      </Animated.View> : null}
    </View>
  </Modal>;
}

/** A photo opened full screen; tap anywhere to close. */
export function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={Boolean(uri)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <Pressable style={{ flex: 1, backgroundColor: 'rgba(18,18,18,0.92)', justifyContent: 'center' }} onPress={onClose} accessibilityLabel="Close photo">
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '80%' }} contentFit="contain" /> : null}
      <View style={[styles.closePhoto, { top: insets.top + 12 }]}><CloseIcon size={20} color={colors.paper} /></View>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: colors.line },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent', marginBottom: -1.5 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.bad, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontFamily: fontFamily('bold'), fontSize: 10, color: colors.paper },
  suggestions: { borderRadius: radius['2xl'], borderWidth: 1, borderColor: 'rgba(220,215,204,0.7)', backgroundColor: colors.card, padding: 4 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.xl, paddingHorizontal: 8, paddingVertical: 6 },
  dismiss: { position: 'absolute', top: 6, right: 6, padding: 4 },
  pill: { alignSelf: 'center', maxWidth: '100%', borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(220,215,204,0.7)', backgroundColor: colors.card, shadowColor: colors.ink, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  emoji: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  menu: { alignSelf: 'center', width: 220, marginTop: 8, borderRadius: radius['2xl'], borderWidth: 1, borderColor: 'rgba(220,215,204,0.7)', backgroundColor: colors.card, overflow: 'hidden', elevation: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 44 },
  closePhoto: { position: 'absolute', right: GUTTER, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(242,239,232,0.15)', alignItems: 'center', justifyContent: 'center' },
});
