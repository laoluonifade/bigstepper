import { router } from 'expo-router';
import { formatMoney } from '@jump/shared/format';
import { Linking } from 'react-native';
import { confirm } from './dialog';

/**
 * Paystack checkout in the phone's own browser (Safari or Chrome), not inside the app: the payment
 * happens on the web. Paystack returns to the web's /payments/return page, which sends the runner back
 * here; meanwhile the app's Payments screen is already open and checks the saved reference itself, since
 * only the server's status counts.
 */
export async function openCheckout(authorizationUrl: string) {
  router.push('/payments/return');
  await Linking.openURL(authorizationUrl);
}

/**
 * The summary before the app hands off to the browser: what they're paying, for what, and that Paystack
 * opens outside Jump. Only Continue leaves the app. Ask before creating the payment, so backing out
 * leaves nothing pending.
 */
export function confirmCheckout({ amountKobo, purpose }: { amountKobo: number; purpose: string }) {
  return confirm({
    title: `You’re about to pay ${formatMoney(amountKobo)}`,
    message: `${purpose}. You’ll pay securely on Paystack in your browser.`,
    cancelLabel: 'Not now',
    confirmLabel: 'Continue to Paystack',
  });
}
