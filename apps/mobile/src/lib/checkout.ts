import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { colors } from './theme';

/**
 * Paystack checkout in the in-app browser. Paystack returns to the web's /payments/return page, which the
 * runner closes; the app then checks the saved reference itself, since only the server's status counts.
 */
export async function openCheckout(authorizationUrl: string) {
  await WebBrowser.openBrowserAsync(authorizationUrl, {
    controlsColor: colors.ink,
    toolbarColor: colors.paper,
    dismissButtonStyle: 'done',
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
  router.push('/payments/return');
}
