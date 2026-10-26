import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, background, clipShape, font, foregroundStyle, frame, monospacedDigit, padding, resizable } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

/** What the lock screen and Dynamic Island show for a run, walk or ride in progress. */
export type RunActivityProps = {
  /** "Run", "Walk" or "Ride". */
  title: string;
  /** SF Symbol for the activity. */
  symbol: string;
  /** "2.41" */
  distance: string;
  /** "km" or "mi" */
  unit: string;
  /** "6:12" or "18.4" */
  pace: string;
  /** "/km" or "km/h" */
  paceUnit: string;
  /** When the moving clock reads zero (ms): now minus moving time, so the timer ticks by itself. */
  timerStart: number;
  /** When paused (ms): the timer freezes here. */
  pausedAt: number | null;
  finished: boolean;
  /** The Jump wordmark, a file in the app group the widget can read; null shows the word instead. */
  logo: string | null;
};

/**
 * Jump's Live Activity, like Strava's: time ticking on its own, distance and pace, on the lock screen
 * and in the Dynamic Island, so a run in progress is always one glance away, app open or not.
 * Runs in the widget runtime: no hooks, imports or outside values inside, only these props.
 */
const RunActivity = (props: RunActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const orange = environment.isLuminanceReduced ? '#FFFFFF' : '#FF4D12';
  const volt = environment.isLuminanceReduced ? '#FFFFFF' : '#E4FF3A';
  const paper = '#F2EFE8';
  const muted = '#8A857B';
  const moving = !props.finished && !props.pausedAt;
  const status = props.finished ? 'Finished' : props.pausedAt ? 'Paused' : props.title;
  const clock = (size: number) => (
    <Text
      timerInterval={{ lower: new Date(props.timerStart), upper: new Date(props.timerStart + 24 * 60 * 60 * 1000) }}
      countsDown={false}
      pauseTime={props.pausedAt ? new Date(props.pausedAt) : undefined}
      modifiers={[font({ size, weight: 'bold' }), monospacedDigit(), foregroundStyle(paper)]}
    />
  );
  // The wordmark, 266:102.5. Pausing and resuming happen in the app; the card only shows the run.
  const logo = (height: number) => props.logo
    ? <Image uiImage={props.logo} modifiers={[resizable(), frame({ width: (height * 266.4) / 102.5, height })]} />
    : <Text modifiers={[font({ size: height * 0.8, weight: 'heavy' }), foregroundStyle(paper)]}>JUMP</Text>;
  const label = (text: string) => <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(muted)]}>{text.toUpperCase()}</Text>;

  return {
    banner: (
      <VStack spacing={12} modifiers={[padding({ all: 16 }), activityBackgroundTint('#121212')]}>
        <HStack spacing={6}>
          <HStack spacing={5} modifiers={[padding({ horizontal: 10, vertical: 5 }), background(moving ? volt : '#3C3A36'), clipShape('capsule')]}>
            <Image systemName={props.symbol as never} color={moving ? '#121212' : paper} size={12} />
            <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(moving ? '#121212' : paper)]}>{status}</Text>
          </HStack>
          <Spacer />
          {logo(20)}
        </HStack>
        <HStack spacing={12}>
          <VStack spacing={2} alignment="leading">
            {clock(28)}
            {label('Time')}
          </VStack>
          <Spacer />
          <VStack spacing={2}>
            <Text modifiers={[font({ size: 36, weight: 'heavy' }), monospacedDigit(), foregroundStyle(volt)]}>{props.distance}</Text>
            {label(props.unit)}
          </VStack>
          <Spacer />
          <VStack spacing={2} alignment="trailing">
            <Text modifiers={[font({ size: 28, weight: 'bold' }), monospacedDigit(), foregroundStyle(paper)]}>{props.pace}</Text>
            {label(`Pace ${props.paceUnit}`)}
          </VStack>
        </HStack>
      </VStack>
    ),
    compactLeading: logo(13),
    compactTrailing: <Text modifiers={[font({ size: 14, weight: 'bold' }), monospacedDigit(), foregroundStyle(volt)]}>{props.distance} {props.unit}</Text>,
    minimal: <Image systemName={props.symbol as never} color={orange} />,
    expandedLeading: (
      <VStack spacing={4} alignment="leading" modifiers={[padding({ leading: 6 })]}>
        {logo(16)}
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(moving ? volt : paper)]}>{status}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack spacing={2} alignment="trailing" modifiers={[padding({ trailing: 6 })]}>
        <Text modifiers={[font({ size: 26, weight: 'heavy' }), monospacedDigit(), foregroundStyle(volt)]}>{props.distance}</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>{props.unit}</Text>
      </VStack>
    ),
    expandedBottom: (
      <HStack modifiers={[padding({ horizontal: 6, bottom: 4 })]}>
        {clock(20)}
        <Spacer />
        <Text modifiers={[font({ size: 20, weight: 'bold' }), monospacedDigit()]}>{props.pace}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>{props.paceUnit}</Text>
      </HStack>
    ),
  };
};

export default createLiveActivity('RunActivity', RunActivity);
