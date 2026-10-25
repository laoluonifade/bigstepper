import { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, display, fontFamily, GUTTER, radius } from '@/lib/theme';
import { JumpLogo } from './icons';
import { Eyebrow, Txt } from './ui';

/** The web's AuthLayout on a phone: the wordmark, then the form centred in what's left. */
export function AuthScreen({ children }: { children: ReactNode }) {
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top', 'bottom']}>
    {/* Both platforms pad for the keyboard: Android draws edge to edge, so the window no longer shrinks for it. */}
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <JumpLogo height={26} />
        <View style={styles.form}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function AuthHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <View style={{ marginBottom: 28 }}>
    <Eyebrow style={{ marginBottom: 8 }}>{eyebrow}</Eyebrow>
    <Text style={display(32)} accessibilityRole="header">{title}</Text>
    {children ? typeof children === 'string' ? <Txt size={15} color="ink2" leading={1.55} style={{ marginTop: 12 }}>{children}</Txt> : <View style={{ marginTop: 12 }}>{children}</View> : null}
  </View>;
}

export function OrDivider() {
  return <View style={styles.or} importantForAccessibility="no-hide-descendants">
    <View style={styles.orLine} />
    <Txt size={13} color="ink3">or</Txt>
    <View style={styles.orLine} />
  </View>;
}

const STRAVA_REVIEW_MESSAGE = 'Not available at the moment. We’re working to increase our limits, and our request is under review by Strava.';

/** Strava sign-in, paused while Strava reviews Jump's connection limits (as on the web). */
export function StravaButton({ label = 'Continue with Strava' }: { label?: string }) {
  return <View>
    <View style={styles.strava} accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={label}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill={colors.white}><Path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></Svg>
      <Text style={styles.stravaText}>{label}</Text>
    </View>
    <Txt size={12} color="ink3" align="center" leading={1.5} style={{ marginTop: 8 }}>{STRAVA_REVIEW_MESSAGE}</Txt>
  </View>;
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, paddingHorizontal: GUTTER + 4, paddingTop: 12, paddingBottom: 32 },
  form: { flex: 1, justifyContent: 'center', paddingVertical: 32, width: '100%', maxWidth: 420, alignSelf: 'center' },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  strava: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: radius.base, backgroundColor: '#FC5200', opacity: 0.6 },
  stravaText: { fontFamily: fontFamily('bold', 'wide'), fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.white },
});
