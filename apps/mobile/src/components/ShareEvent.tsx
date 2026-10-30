import { formatDistance } from '@jump/shared/format';
import type { Unit } from '@jump/shared/types';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { ComponentRef, useRef, useState } from 'react';
import { Linking, PixelRatio, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { WEB_URL } from '@/lib/api';
import { EVENT_NOUN, posterTime, type ClubEvent } from '@/lib/club-events';
// Share pictures look the same whoever posts them, so they use the brand palette, not the theme's.
import { brand as colors, colors as theme } from '@/lib/theme';
import { CopyIcon, JumpLogo, LinkIcon, ShareIcon } from './icons';
import { BASE, PAD, shareStyles as styles } from './ShareCompetition';
import { Sheet } from './Sheet';
import { Sticker } from './Stickers';
import { Button, haptic, Txt } from './ui';

type CardFormat = 'story' | 'post';

/** The tallest the cover photo can be in each shape, so it fits the space above the pass. */
const PHOTO = { story: 150, post: 70 } as const;

/** The photo's size at its own shape inside the room it has; null when it would be too small to make out. */
function fitPhoto(ratio: number, width: number, height: number) {
  if (!(ratio > 0)) return null;
  let w = width;
  let h = w / ratio;
  if (h > height) { h = height; w = h * ratio; }
  return w < width * 0.3 || h < 40 ? null : { w, h };
}

/**
 * An event as a picture to post, in the competition card's sticker style: what and when, where, the cover
 * photo, and the short link to get a pass.
 */
function EventCard({ event, format, unit }: { event: ClubEvent; format: CardFormat; unit: Unit }) {
  const { w: W, h: H } = BASE[format];
  const story = format === 'story';
  const [day, time] = event.nextAt ? posterTime(event).split(', ') : ['Finished', ''];
  const repeat = event.repeat === 'once' ? '' : ` · ${event.repeat === 'weekly' ? 'weekly' : event.repeat === 'monthly' ? 'monthly' : 'repeats'}`;
  const chips = [event.distanceMetres ? formatDistance(event.distanceMetres, unit) : EVENT_NOUN[event.activity], event.attendeeCount ? `${event.attendeeCount} going` : 'Free pass'];
  const where = [event.venue, event.address].filter(Boolean).join(', ') || 'Meeting point to be confirmed';
  const slug = event.slug ?? event.id.slice(0, 8);
  // The photo keeps its own shape, never cropped: its proportions come in once it has loaded.
  const [ratio, setRatio] = useState(16 / 9);
  const photo = event.coverUrl ? fitPhoto(ratio, W - PAD * 2, PHOTO[format]) : null;
  return <View style={{ width: W, height: H, backgroundColor: colors.paper, overflow: 'hidden', paddingHorizontal: PAD, paddingTop: PAD }}>
    <JumpLogo height={14} color={colors.ink} />
    <Text style={[styles.title, { marginTop: story ? 24 : 12, fontSize: story ? 30 : 21, lineHeight: story ? 32 : 22, height: story ? 64 : 44 }]} numberOfLines={2} adjustsFontSizeToFit>{event.title}</Text>
    <View style={[styles.tag, { alignSelf: 'flex-start', marginTop: story ? 10 : 8 }]}><Text style={styles.tagText} numberOfLines={1}>{`${event.club.name} · ${EVENT_NOUN[event.activity]}`}</Text></View>

    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: story ? 22 : 12 }}>
      <Sticker p={colors} bg={event.club.accentColor || colors.track} tilt={-2} style={{ flex: 1.35, zIndex: 1, marginTop: 4 }}>
        <Text style={[styles.big, { color: colors.ink, fontSize: story ? 40 : 32, lineHeight: story ? 44 : 36 }]} numberOfLines={1} adjustsFontSizeToFit>{day.toUpperCase()}</Text>
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>{`${time}${repeat}`}</Text>
      </Sticker>
      <View style={{ flex: 1, marginLeft: -4, zIndex: 2 }}>
        {chips.map((text, index) => <Sticker key={index} p={colors} bg={colors.card} tilt={[3, -2][index]} padded={false} style={{ marginTop: index ? (story ? 6 : 3) : 0, marginLeft: index === 1 ? -8 : 0 }}>
          <Text style={[styles.chip, { paddingVertical: story ? 9 : 6 }]} numberOfLines={1} adjustsFontSizeToFit>{text}</Text>
        </Sticker>)}
      </View>
    </View>

    {/* Where: its own sticker with a pin, so a long place name wraps instead of being cut. */}
    <Sticker p={colors} bg={colors.card} tilt={-1} padded={false} style={{ marginTop: story ? 14 : 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: story ? 10 : 7 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.2, borderColor: colors.ink, backgroundColor: event.club.accentColor || colors.track, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={12} height={12} viewBox="0 0 24 24"><Path d="M12 22s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12Z" fill="none" stroke={colors.ink} strokeWidth={3} /><Path d="M14.6 10a2.6 2.6 0 1 1-5.2 0 2.6 2.6 0 0 1 5.2 0Z" fill="none" stroke={colors.ink} strokeWidth={3} /></Svg>
        </View>
        <Text style={{ flex: 1, fontFamily: styles.podiumName.fontFamily, fontSize: story ? 13 : 11.5, lineHeight: story ? 16 : 14, color: colors.ink }} numberOfLines={2} adjustsFontSizeToFit>{where}</Text>
      </View>
    </Sticker>

    {event.coverUrl && photo
      ? <Sticker p={colors} bg={colors.ink} tilt={1.5} padded={false} style={{ marginTop: story ? 18 : 10, alignSelf: 'center', width: photo.w }}>
        <Image source={{ uri: event.coverUrl }} style={{ width: photo.w, height: photo.h }} contentFit="contain"
          onLoad={(loaded) => { if (loaded.source.width && loaded.source.height) setRatio(loaded.source.width / loaded.source.height); }} />
      </Sticker>
      : <Sticker p={colors} bg={colors.card} tilt={1} style={{ marginTop: story ? 22 : 10 }}>
        <Text style={styles.empty}>Free to come along.</Text>
        <Text style={styles.label}>Get a pass · we’ll remind you</Text>
      </Sticker>}

    <View style={{ position: 'absolute', left: PAD, right: PAD, bottom: story ? 44 : 38 }}>
      <Sticker p={colors} bg={colors.ink} tilt={-1.5} padded={false}>
        <View style={[styles.code, { height: story ? 76 : 60 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.codeLabel}>Get your free pass</Text>
            <Text style={[styles.codeText, { fontSize: story ? 24 : 20 }]} numberOfLines={1} adjustsFontSizeToFit>{slug}</Text>
          </View>
          <View style={[styles.arrow, { width: story ? 44 : 38, height: story ? 44 : 38 }]}>
            <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M4 20 20 4M9 4h11v11" fill="none" stroke={colors.ink} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </View>
        </View>
      </Sticker>
    </View>
    <View style={{ position: 'absolute', left: PAD, right: PAD, bottom: PAD - 6 }}>
      <Text style={styles.footer} numberOfLines={1}>{`${WEB_URL.replace(/^https?:\/\//, '')}/events/${slug}`}</Text>
    </View>
  </View>;
}

/** A designed card of the event to post, plus one-tap links for WhatsApp and X. Mirrors the competition share. */
export function ShareEventSheet({ open, onOpenChange, event, unit }: { open: boolean; onOpenChange: (open: boolean) => void; event: ClubEvent; unit: Unit }) {
  const [format, setFormat] = useState<CardFormat>('story');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const card = useRef<ComponentRef<typeof View>>(null);
  const url = `${WEB_URL}/events/${event.slug ?? event.id}`;
  const caption = `${event.pass ? 'I’m going to' : 'Come to'} “${event.title}” with ${event.club.name}${event.venue ? ` at ${event.venue}` : ''}. Get a free pass on Jump`;
  const { w, h } = BASE[format];
  const preview = format === 'story' ? 0.62 : 0.82;

  async function share() {
    setBusy(true);
    setStatus(null);
    try {
      // iOS reads the size in points and renders at the screen's scale; Android reads pixels. Either way: 1080 px wide.
      const across = Platform.OS === 'ios' ? 1080 / PixelRatio.get() : 1080;
      const uri = await captureRef(card, { format: 'png', quality: 1, width: across, height: (across * h) / w, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: event.title, UTI: 'public.png' });
      else setStatus('Sharing isn’t available on this phone.');
    } catch {
      setStatus('Couldn’t make the card. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <Sheet open={open} onOpenChange={onOpenChange} title="Share this event">
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
      {([['story', 'Story', 'Instagram · WhatsApp status'], ['post', 'Post', 'X · chats · feed']] as const).map(([value, label, hint]) => <Pressable key={value} onPress={() => { haptic(); setFormat(value); }}
        accessibilityRole="tab" accessibilityState={{ selected: format === value }} style={[styles.format, format === value && { backgroundColor: theme.ink }]}>
        <Txt size={14} weight="bold" style={{ color: format === value ? theme.paper : theme.ink }}>{label}</Txt>
        <Txt size={11} style={{ color: format === value ? theme.paper : theme.ink3, opacity: format === value ? 0.7 : 1 }}>{hint}</Txt>
      </Pressable>)}
    </View>
    {/* The preview is the card itself, scaled down; the capture renders it full size. */}
    <View style={{ alignItems: 'center', marginTop: 16 }}>
      <View style={[styles.preview, { width: w * preview, height: h * preview }]}>
        <View style={{ transform: [{ scale: preview }], transformOrigin: 'top left' }}>
          <EventCard event={event} format={format} unit={unit} />
        </View>
      </View>
    </View>
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={card} collapsable={false}><EventCard event={event} format={format} unit={unit} /></View>
    </View>
    <Button full title={busy ? 'Making your card…' : 'Share card'} icon={<ShareIcon size={16} color={theme.onAccent} />} loading={busy} style={{ marginTop: 16 }} onPress={() => void share()} />
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <Button variant="secondary" size="sm" full style={{ flex: 1 }} title="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${caption} ${url}`)}`)} />
      <Button variant="secondary" size="sm" full style={{ flex: 1 }} title="X" onPress={() => void Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(url)}`)} />
    </View>
    <View style={styles.linkBox}>
      <LinkIcon size={16} color={theme.ink2} />
      <Text numberOfLines={1} style={styles.linkText}>{url.replace(/^https?:\/\//, '')}</Text>
      <Pressable onPress={() => void Clipboard.setStringAsync(url).then(() => { haptic('success'); setStatus('Link copied. Paste it in a link sticker or a chat.'); })}
        style={({ pressed }) => [styles.copyLink, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]} accessibilityRole="button" accessibilityLabel="Copy link">
        <CopyIcon size={14} color={colors.ink} /><Text style={styles.copyLinkText}>COPY LINK</Text>
      </Pressable>
    </View>
    <Pressable onPress={() => void Clipboard.setStringAsync(`${caption} ${url}`).then(() => { haptic('success'); setStatus('Caption and link copied.'); })} hitSlop={8} style={{ alignSelf: 'center', marginTop: 10 }} accessibilityRole="button">
      <Txt size={13} weight="semibold" color="ink2" style={{ textDecorationLine: 'underline' }}>Copy with a caption instead</Txt>
    </Pressable>
    <Txt size={status ? 13 : 12} color={status ? 'ink2' : 'ink3'} align="center" style={{ marginTop: 8 }}>{status ?? 'On Instagram, add a link sticker to your story so people can tap straight in.'}</Txt>
  </Sheet>;
}
