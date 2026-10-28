import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { onAccent } from '@/components/clubs';
import { durationLabel, EVENT_NOUN, posterTime, repeatRule, type ClubEvent } from '@/lib/club-events';
import { brand, colors, fontFamily, mono, radius, score, wideLabel } from '@/lib/theme';
import { Sheet } from './Sheet';
import { Button } from './ui';

/** A QR code drawn as one SVG path: dark squares on white, with the quiet zone scanners need. */
export function QrCode({ value, size }: { value: string; size: number }) {
  const { d, count } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(value);
    code.make();
    const modules = code.getModuleCount();
    let path = '';
    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) if (code.isDark(row, col)) path += `M${col + 2} ${row + 2}h1v1h-1z`;
    }
    return { d: path, count: modules + 4 };
  }, [value]);
  return <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} accessibilityLabel={`QR code for ${value}`}>
    <Rect width={count} height={count} fill="#FFFFFF" />
    <Path d={d} fill="#121212" />
  </Svg>;
}

/** The notches and dashed tear line across a ticket. */
function Perforation({ color }: { color: string }) {
  return <View style={styles.perforation}>
    <View style={[styles.notch, { left: -12, backgroundColor: color }]} />
    <View style={styles.tear} />
    <View style={[styles.notch, { right: -12, backgroundColor: color }]} />
  </View>;
}

/**
 * Someone's pass to an event, like a ticket: the club's colour band with what it is, when and where,
 * a tear line, then their name, pass code and a QR the host can check in. Stamped once they're in.
 */
export function EventPass({ event, holder, behind = brand.paper }: { event: ClubEvent; holder: string; behind?: string }) {
  const pass = event.pass;
  const accent = event.club.accentColor || '#FF5A1F';
  const ink = onAccent(accent);
  if (!pass) return null;
  return <View style={styles.ticket}>
    <View style={[styles.band, { backgroundColor: accent }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[wideLabel(11), { color: ink }]}>{`${event.club.name} · Pass`}</Text>
        <Text style={[wideLabel(11), { color: ink }]}>{EVENT_NOUN[event.activity]}</Text>
      </View>
      <Text style={[styles.title, { color: ink }]} numberOfLines={2}>{event.title}</Text>
      <View style={styles.facts}>
        <View style={{ flex: 1.2 }}><Text style={[styles.factLabel, { color: ink }]}>Next</Text><Text style={[styles.factValue, { color: ink }]} numberOfLines={1}>{posterTime(event)}</Text></View>
        <View style={{ flex: 1 }}><Text style={[styles.factLabel, { color: ink }]}>Lasts</Text><Text style={[styles.factValue, { color: ink }]}>{durationLabel(event.durationMinutes)}</Text></View>
      </View>
      <View style={{ marginTop: 10 }}>
        <Text style={[styles.factLabel, { color: ink }]}>Where</Text>
        <Text style={[styles.factValue, { color: ink }]} numberOfLines={2}>{event.venue}</Text>
      </View>
    </View>
    <Perforation color={behind} />
    <View style={styles.stub}>
      <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
        <View><Text style={styles.stubLabel}>Pass holder</Text><Text style={styles.holder} numberOfLines={1}>{holder}</Text></View>
        <View><Text style={styles.stubLabel}>Pass code</Text><Text style={styles.code} selectable>{pass.code}</Text></View>
        <Text style={styles.small} numberOfLines={2}>{event.repeat === 'once' ? 'Show this at the start.' : `${repeatRule(event)}. One pass for every session.`}</Text>
      </View>
      <View style={styles.qr}><QrCode value={pass.code} size={112} /></View>
      {pass.checkedIn ? <View style={styles.stamp} pointerEvents="none"><Text style={[score(26), { color: brand.ink }]}>CHECKED IN</Text></View> : null}
    </View>
  </View>;
}

/** The pass, big, in a sheet: what you show at the start line. */
export function PassSheet({ open, onOpenChange, event, holder }: { open: boolean; onOpenChange: (open: boolean) => void; event: ClubEvent; holder: string }) {
  return <Sheet open={open} onOpenChange={onOpenChange} title="Your pass" description="Show this to the host when you arrive. They’ll check you in with the code or the QR."
    footer={<Button full variant="dark" title="Done" onPress={() => onOpenChange(false)} />}>
    <EventPass event={event} holder={holder} behind={colors.card} />
  </Sheet>;
}

const styles = StyleSheet.create({
  ticket: { borderRadius: radius['2xl'], borderWidth: 2, borderColor: brand.ink, backgroundColor: brand.card, overflow: 'hidden' },
  band: { padding: 16, paddingBottom: 18 },
  title: { fontFamily: fontFamily('black', 'wide'), fontSize: 24, lineHeight: 27, letterSpacing: -0.3, marginTop: 10, textTransform: 'uppercase' },
  facts: { flexDirection: 'row', gap: 12, marginTop: 14 },
  factLabel: { fontFamily: fontFamily('bold', 'wide'), fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.75 },
  factValue: { fontFamily: fontFamily('bold'), fontSize: 15, marginTop: 2 },
  perforation: { height: 24, justifyContent: 'center', backgroundColor: brand.card },
  notch: { position: 'absolute', top: 0, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: brand.ink },
  tear: { marginHorizontal: 18, borderTopWidth: 2, borderStyle: 'dashed', borderColor: brand.ink3 },
  stub: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 16, backgroundColor: brand.card },
  stubLabel: { fontFamily: fontFamily('bold', 'wide'), fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', color: brand.ink3 },
  holder: { fontFamily: fontFamily('extrabold'), fontSize: 17, color: brand.ink, marginTop: 2 },
  code: { fontFamily: mono, fontSize: 20, letterSpacing: 1.5, color: brand.ink, marginTop: 2 },
  small: { fontFamily: fontFamily('regular'), fontSize: 12, lineHeight: 16, color: brand.ink2 },
  qr: { padding: 4, borderRadius: radius.md, borderWidth: 1.5, borderColor: brand.ink, backgroundColor: '#FFFFFF' },
  stamp: { position: 'absolute', right: 18, top: 30, transform: [{ rotate: '-12deg' }], borderWidth: 3, borderColor: brand.ink, borderRadius: radius.md, backgroundColor: brand.volt, paddingHorizontal: 10, paddingVertical: 2, opacity: 0.95 },
});
