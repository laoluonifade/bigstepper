import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
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
  const status = props.finished ? 'Finished' : props.pausedAt ? 'Paused' : props.title;
  const clock = (size: number) => (
    <Text
      timerInterval={{ lower: new Date(props.timerStart), upper: new Date(props.timerStart + 24 * 60 * 60 * 1000) }}
      countsDown={false}
      pauseTime={props.pausedAt ? new Date(props.pausedAt) : undefined}
      modifiers={[font({ size, weight: 'bold' }), monospacedDigit()]}
    />
  );

  return {
    banner: (
      <VStack spacing={8} modifiers={[padding({ all: 16 })]}>
        <HStack spacing={6}>
          <Image systemName={props.symbol as never} color={orange} />
          <Text modifiers={[font({ size: 15, weight: 'bold' })]}>{status}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(orange)]}>JUMP</Text>
        </HStack>
        <HStack spacing={12}>
          <VStack spacing={2} alignment="leading">
            {clock(26)}
            <Text modifiers={[font({ size: 12 }), foregroundStyle('#8A857B')]}>Time</Text>
          </VStack>
          <Spacer />
          <VStack spacing={2}>
            <Text modifiers={[font({ size: 34, weight: 'heavy' }), monospacedDigit()]}>{props.distance}</Text>
            <Text modifiers={[font({ size: 12 }), foregroundStyle('#8A857B')]}>Distance ({props.unit})</Text>
          </VStack>
          <Spacer />
          <VStack spacing={2} alignment="trailing">
            <Text modifiers={[font({ size: 26, weight: 'bold' }), monospacedDigit()]}>{props.pace}</Text>
            <Text modifiers={[font({ size: 12 }), foregroundStyle('#8A857B')]}>Pace ({props.paceUnit})</Text>
          </VStack>
        </HStack>
      </VStack>
    ),
    compactLeading: <Image systemName={props.symbol as never} color={orange} />,
    compactTrailing: <Text modifiers={[font({ size: 14, weight: 'bold' }), monospacedDigit(), foregroundStyle(volt)]}>{props.distance} {props.unit}</Text>,
    minimal: <Image systemName={props.symbol as never} color={orange} />,
    expandedLeading: (
      <VStack spacing={4} alignment="leading" modifiers={[padding({ leading: 6 })]}>
        <Image systemName={props.symbol as never} color={orange} />
        <Text modifiers={[font({ size: 13, weight: 'semibold' })]}>{status}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack spacing={2} alignment="trailing" modifiers={[padding({ trailing: 6 })]}>
        <Text modifiers={[font({ size: 26, weight: 'heavy' }), monospacedDigit(), foregroundStyle(volt)]}>{props.distance}</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle('#8A857B')]}>{props.unit}</Text>
      </VStack>
    ),
    expandedBottom: (
      <HStack modifiers={[padding({ horizontal: 6, bottom: 4 })]}>
        {clock(20)}
        <Spacer />
        <Text modifiers={[font({ size: 20, weight: 'bold' }), monospacedDigit()]}>{props.pace}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle('#8A857B')]}>{props.paceUnit}</Text>
      </HStack>
    ),
  };
};

export default createLiveActivity('RunActivity', RunActivity);
