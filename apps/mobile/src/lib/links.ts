import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { WEB_URL } from './api';
import { colors } from './theme';

/** Web paths whose screen lives somewhere else in the app. Everything else keeps the web's path. */
const ALIASES: Array<[RegExp, string]> = [
  [/^\/$/, '/dashboard'],
  [/^\/settings(\/profile)?\/?$/, '/you'],
  [/^\/auth\/strava/, '/you'],
  // The entry balance merged into Rewards; old notifications still link to /wallet.
  [/^\/wallet\/?$/, '/rewards'],
];

/** Pages that stay on the web (legal text): opened in an in-app browser. */
const WEB_ONLY = /^\/(terms|privacy|safety)\/?$/;

/** The app route for a link the API or the web app made (notifications, shares, invites). */
export function appPath(link: string): string {
  const url = link.replace(/^https?:\/\/[^/]+/, '') || '/';
  for (const [pattern, target] of ALIASES) if (pattern.test(url.split('?')[0])) return target;
  return url;
}

/** Opens a Jump link: in the app when it has the screen, else the web page in an in-app browser. */
export function openLink(link: string) {
  const path = appPath(link);
  if (WEB_ONLY.test(path.split('?')[0])) {
    void openWeb(path);
    return;
  }
  router.push(path as Href);
}

export function openWeb(pathOrUrl: string) {
  const url = /^https?:/.test(pathOrUrl) ? pathOrUrl : `${WEB_URL}${pathOrUrl}`;
  return WebBrowser.openBrowserAsync(url, { controlsColor: colors.ink, toolbarColor: colors.paper, presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
}
