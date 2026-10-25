import { Stack } from 'expo-router';
import { KycPanel } from '@/components/KycPanel';
import { PageHeader, Screen } from '@/components/ui';

/** Identity verification (BVN), on its own page: needed for payouts, reached from You and from Rewards. */
export default function IdentityScreen() {
  return <Screen>
    <Stack.Screen options={{ title: 'Identity verification' }} />
    <PageHeader eyebrow="You" title="Identity verification" description="Confirm who you are once, so prize money can be paid to a bank account in your name." />
    <KycPanel />
  </Screen>;
}
