import { Stack } from 'expo-router';
import { GlobalBoard } from '@/components/GlobalBoard';

export default function LeaderboardScreen() {
  return <>
    <Stack.Screen options={{ title: 'Leaderboard' }} />
    <GlobalBoard />
  </>;
}
