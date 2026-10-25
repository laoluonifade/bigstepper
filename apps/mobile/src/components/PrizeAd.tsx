import { ordinal } from '@jump/shared/format';
import type { ClubPrize, ClubPrizeTerms } from '@jump/shared/types';
import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { ArrowRightIcon } from './icons';
import { haptic, Txt } from './ui';

/** "https://" in front of a bare "brand.com", so it opens. */
const webUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/**
 * What's up for grabs, in one slim line the size of the Compete page's Strava note: the top prize (with
 * its photo, if there is one) and how many more. Tapping it opens the club's website in the browser.
 */
export function PrizeAds({ terms, clubName, website }: { terms: ClubPrizeTerms; clubName?: string; website?: string | null }) {
  const prizes = [...terms.prizes].sort((a, b) => a.position - b.position);
  const top = prizes[0];
  if (!top) return null;
  const more = prizes.length - 1;
  const place = (prize: ClubPrize) => (terms.selection === 'draw' ? 'prize draw' : prize.quantity > 1 ? `top ${prize.quantity}` : ordinal(prize.position));
  const open = website ? () => { haptic(); void Linking.openURL(webUrl(website)); } : undefined;
  return <Pressable disabled={!open} onPress={open} accessibilityRole={open ? 'link' : undefined} style={({ pressed }) => [styles.strip, pressed && { opacity: 0.8 }]}>
    {top.imageUrl ? <Image source={{ uri: top.imageUrl }} style={styles.photo} contentFit="cover" /> : null}
    <Txt size={13} leading={1.35} numberOfLines={2} style={{ flex: 1 }}>
      <Txt size={13} weight="bold">To be won: </Txt>
      {`${top.productName} (${place(top)})${more ? ` and ${more} more ${more === 1 ? 'prize' : 'prizes'}` : ''}${clubName ? ` from ${clubName}` : ''}.`}
    </Txt>
    {open && <ArrowRightIcon size={14} />}
  </Pressable>;
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.edge, backgroundColor: colors.card, paddingVertical: 8, paddingLeft: 8, paddingRight: 12 },
  photo: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.inkWash },
});
