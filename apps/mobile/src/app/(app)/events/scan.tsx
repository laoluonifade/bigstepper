import { useQuery, useQueryClient } from '@tanstack/react-query';
import { requireOptionalNativeModule } from 'expo';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, CloseIcon } from '@/components/icons';
import { Avatar, Button, haptic, Txt } from '@/components/ui';
import { api, post } from '@/lib/api';
import { eventKey, type ClubEvent, type Guest } from '@/lib/club-events';
import { brand, fontFamily, mono, radius, score, wideLabel } from '@/lib/theme';

/** Builds from before scanning shipped have no camera module: there the screen explains instead of crashing. */
const Camera: typeof import('expo-camera') | null = requireOptionalNativeModule('ExpoCamera') ? require('expo-camera') : null;

const PASS = /^JMP-[A-Z0-9]{6}$/;
const SAME_CODE_MS = 3_000;
type Result = { tone: 'in' | 'again' | 'bad'; title: string; body?: string; guest?: Guest };
type GuestList = { nextAt: string | null; guests: Guest[] };

/**
 * The host's door scanner: point the camera at a pass and it checks them in for the next session. Each
 * scan says who it was (or what's wrong) and the camera keeps going, so a queue moves quickly.
 */
export default function ScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const event = useQuery({ queryKey: eventKey(id), queryFn: () => api<ClubEvent>(`/events/${id}`) });
  const listKey = ['club-event', id, 'guests'];
  const list = useQuery({ queryKey: listKey, queryFn: () => api<GuestList>(`/events/${id}/guests`) });
  const [result, setResult] = useState<Result | null>(null);
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number } | null>(null);
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (next: Result) => {
    setResult(next);
    haptic(next.tone === 'in' ? 'success' : 'warning');
    if (clear.current) clearTimeout(clear.current);
    clear.current = setTimeout(() => setResult(null), 3_500);
  };

  async function scanned(raw: string) {
    const code = raw.trim().toUpperCase();
    if (busy.current || (last.current?.code === code && Date.now() - last.current.at < SAME_CODE_MS)) return;
    last.current = { code, at: Date.now() };
    if (!PASS.test(code)) { show({ tone: 'bad', title: 'Not a Jump pass', body: 'Ask them to open their pass on the event page.' }); return; }
    const guest = list.data?.guests.find((row) => row.passCode === code);
    if (guest?.checkedIn) { show({ tone: 'again', title: `${guest.displayName ?? 'They'} already checked in`, body: code, guest }); return; }
    busy.current = true;
    try {
      const done = await post<{ userId: string }>(`/events/${id}/check-in`, { code });
      queryClient.setQueryData<GuestList>(listKey, (data) => data && { ...data, guests: data.guests.map((row) => (row.userId === done.userId ? { ...row, checkedIn: true } : row)) });
      const who = guest ?? list.data?.guests.find((row) => row.userId === done.userId);
      show({ tone: 'in', title: `${who?.displayName ?? 'Runner'} is in`, body: code, guest: who });
      if (!who) void list.refetch();
    } catch (error) {
      show({ tone: 'bad', title: error instanceof Error ? error.message : 'Couldn’t check them in', body: code });
    } finally {
      busy.current = false;
    }
  }

  const guests = list.data?.guests ?? [];
  const inCount = guests.filter((guest) => guest.checkedIn).length;
  const top = <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
    <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close scanner" style={styles.close}><CloseIcon size={20} color={brand.paper} /></Pressable>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[wideLabel(11), { color: brand.volt }]}>Scan passes</Text>
      <Txt size={15} weight="bold" numberOfLines={1} style={{ color: brand.paper }}>{event.data?.title ?? ' '}</Txt>
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={[score(24), { color: brand.paper }]}>{`${inCount}/${guests.length}`}</Text>
      <Text style={[wideLabel(9), { color: 'rgba(242,239,232,0.6)' }]}>Checked in</Text>
    </View>
  </View>;

  return <View style={{ flex: 1, backgroundColor: '#000' }}>
    <Stack.Screen options={{ headerShown: false }} />
    <StatusBar style="light" />
    {Camera ? <Scanner camera={Camera} onScan={(code) => void scanned(code)} /> : <View style={styles.center}>
      <Txt size={17} weight="bold" align="center" style={{ color: brand.paper }}>Update Jump to scan passes</Txt>
      <Txt size={14} align="center" style={{ color: 'rgba(242,239,232,0.7)', marginTop: 8 }}>This version of the app can’t use the camera yet. Until you update, check people in from the guest list by name or code.</Txt>
    </View>}
    {top}
    {result ? <Animated.View key={`${result.title}-${result.body}`} entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)}
      style={[styles.result, { bottom: insets.bottom + 24 }, result.tone === 'in' ? { backgroundColor: brand.volt } : result.tone === 'again' ? { backgroundColor: '#FFC53D' } : { backgroundColor: '#FF5C4D' }]}>
      {result.guest ? <Avatar name={result.guest.displayName} src={result.guest.avatarUrl} avatarStyle={result.guest.avatarStyle} size={44} round />
        : <View style={styles.resultIcon}>{result.tone === 'in' ? <CheckIcon size={22} color={brand.ink} /> : <CloseIcon size={22} color={brand.ink} />}</View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={17} weight="extrabold" numberOfLines={2} style={{ color: brand.ink }}>{result.title}</Txt>
        {result.body ? <Text style={{ fontFamily: PASS.test(result.body) ? mono : fontFamily('medium'), fontSize: 13, color: brand.ink, marginTop: 2 }}>{result.body}</Text> : null}
      </View>
      {result.tone === 'in' ? <CheckIcon size={26} color={brand.ink} /> : null}
    </Animated.View> : null}
  </View>;
}

/** The live camera with a square to aim at, once the host has allowed the camera. */
function Scanner({ camera, onScan }: { camera: typeof import('expo-camera'); onScan: (code: string) => void }) {
  const { CameraView, useCameraPermissions } = camera;
  const [permission, request] = useCameraPermissions();
  if (!permission) return <View style={{ flex: 1 }} />;
  if (!permission.granted) {
    return <View style={styles.center}>
      <Txt size={17} weight="bold" align="center" style={{ color: brand.paper }}>Allow the camera to scan passes</Txt>
      <Txt size={14} align="center" style={{ color: 'rgba(242,239,232,0.7)', marginTop: 8, marginBottom: 20 }}>Jump only uses it while this scanner is open.</Txt>
      {permission.canAskAgain ? <Button variant="volt" title="Allow camera" onPress={() => void request()} /> : <Button variant="volt" title="Open Settings" onPress={() => void Linking.openSettings()} />}
    </View>;
  }
  return <View style={{ flex: 1 }}>
    <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(scan) => onScan(scan.data)} />
    <View style={styles.aim} pointerEvents="none">
      <View style={styles.frame}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => <View key={corner} style={[styles.corner, styles[corner]]} />)}
      </View>
      <Txt size={14} weight="semibold" align="center" style={{ color: brand.paper, marginTop: 20 }}>Point at the QR code on their pass</Txt>
    </View>
  </View>;
}

const CORNER = 34;
const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: 'rgba(0,0,0,0.55)' },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(242,239,232,0.15)', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  aim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: brand.volt },
  tl: { left: 0, top: 0, borderLeftWidth: 5, borderTopWidth: 5, borderTopLeftRadius: 14 },
  tr: { right: 0, top: 0, borderRightWidth: 5, borderTopWidth: 5, borderTopRightRadius: 14 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 5, borderBottomWidth: 5, borderBottomLeftRadius: 14 },
  br: { right: 0, bottom: 0, borderRightWidth: 5, borderBottomWidth: 5, borderBottomRightRadius: 14 },
  result: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius['2xl'], borderWidth: 2, borderColor: brand.ink, padding: 14 },
  resultIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(18,18,18,0.12)', alignItems: 'center', justifyContent: 'center' },
});
