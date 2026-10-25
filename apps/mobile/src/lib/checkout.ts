import { router } from 'expo-router';
import { Linking } from 'react-native';

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
