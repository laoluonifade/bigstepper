import type { Club, ClubRole } from '@jump/shared/types';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { ClubLogo } from './ClubLogo';
import { ArrowRightIcon, LockIcon } from './icons';
import { FieldLabel, haptic, Txt, VerifiedTick } from './ui';

export type ClubSummary = Pick<Club, 'id' | 'slug' | 'name' | 'description' | 'logoUrl' | 'accentColor' | 'location' | 'privacy' | 'memberCount' | 'followerCount' | 'following' | 'verified'> & { myRole: ClubRole | null };

/** Colours a club can wear: the Jump palette. */
export const ACCENTS = ['#FF5A1F', '#E4FF3A', '#8B7CF6', '#5EE0C1', '#FF8FB1', '#FFC53D', '#6FB7FF', '#121212'];
export const ROLE_LABEL: Record<ClubRole, string> = { owner: 'Owner', admin: 'Manager', member: 'Member' };
export const isManager = (role: ClubRole | null | undefined) => role === 'owner' || role === 'admin';

/** Dark text on light colours, light text on dark ones. */
export function onAccent(hex = '#FF5A1F') {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? colors.ink : colors.paper;
}

/** Accepts `my-club`, `/my-club` or a pasted club link and returns the handle. */
export function clubHandle(value: string) {
  return value.trim().toLowerCase().replace(/^.*\/clubs\//, '').replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '');
}

export function ClubCard({ club }: { club: ClubSummary }) {
  const meta = [`${club.followerCount ?? 0} ${club.followerCount === 1 ? 'follower' : 'followers'}`, club.location, club.myRole && club.myRole !== 'member' ? ROLE_LABEL[club.myRole] : !club.myRole && club.following ? 'Following' : null].filter(Boolean).join(' · ');
  return <Pressable onPress={() => { haptic(); router.push(`/clubs/${club.slug}`); }} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={club.name}>
    <View style={[styles.accent, { backgroundColor: club.accentColor ?? '#FF5A1F' }]} />
    <ClubLogo club={club} size={44} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt size={15} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{club.name}</Txt>
        {club.verified ? <VerifiedTick /> : null}
        {club.privacy === 'invite' ? <LockIcon size={12} color={colors.ink3} /> : null}
      </View>
      <Txt size={12} color="ink2" numberOfLines={1} style={{ marginTop: 2 }}>{meta}</Txt>
    </View>
    <ArrowRightIcon size={16} color={colors.ink3} />
  </Pressable>;
}

export function PrivacyChoice({ value, onChange }: { value: 'open' | 'invite'; onChange: (value: 'open' | 'invite') => void }) {
  return <View>
    <FieldLabel label="Who can join" />
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
      {([['open', 'Open', 'Anyone with the page can join.'], ['invite', 'Invite-only', 'Only people with your invite link.']] as const).map(([option, title, body]) => {
        const active = value === option;
        return <Pressable key={option} onPress={() => { haptic(); onChange(option); }} accessibilityRole="radio" accessibilityState={{ checked: active }} style={[styles.choice, active && { borderColor: colors.ink, backgroundColor: colors.ink }]}>
          <Txt size={13} weight="bold" color={active ? 'paper' : 'ink'}>{title}</Txt>
          <Txt size={12} leading={1.35} style={{ marginTop: 2, color: active ? colors.onInkMuted : colors.ink2 }}>{body}</Txt>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  choice: { flex: 1, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, padding: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, padding: 12 },
  accent: { width: 6, height: 48, borderRadius: 3 },
});
