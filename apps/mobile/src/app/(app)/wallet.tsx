import { Redirect } from 'expo-router';

/** The entry balance lives on Rewards now; old links (notifications, payments) land there. */
export default function WalletScreen() {
  return <Redirect href="/rewards" />;
}
