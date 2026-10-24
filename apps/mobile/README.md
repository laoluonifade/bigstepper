# Jump mobile

The Jump app for iOS and Android, built with Expo (React Native). It has the same screens and rules as the
web app; the admin console stays on the web.

## How it fits with the web app

- **Shared code** lives in `@jump/shared` (`packages/shared`): types, formatting, scoring, competition rules,
  prizes, league maths, share-card data, countries, avatars and the API client. Both apps import it, so a rule
  changes in one place.
- **Screens** mirror the web's paths (`/competitions/[code]`, `/clubs/[id]`, `/runners/[username]` …), so links
  from notifications, emails and shares open the same thing in either app (`src/lib/links.ts`).
- **The design system** is the web's, rebuilt natively in `src/components/ui.tsx` and `src/lib/theme.ts`: the
  same colours, the Archivo cuts (normal, wide and narrow, bundled as static fonts in `assets/fonts`), hard
  offset shadows, buttons and cards.
- **Native where it matters**: the tab bar is the web's (`src/components/TabBar.tsx`, with the raised Run
  button), but screens push with native headers and back gestures, option lists use the iOS action sheet, dates use the
  system pickers, and maps are MapLibre with the web's OpenFreeMap style.

## Recording activities

`src/lib/recorder.ts` records walks, runs and rides with background location, so distance keeps counting with
the screen locked. Every fix is stored in SQLite (`src/lib/run-buffer.ts`) before it's uploaded, uploads are
idempotent, and a run in progress is picked up again after the app restarts. Steps come from the phone's
pedometer. Expo Go can't run background location, so it only measures while the app is open there.

## Run it

Background location, the map and secure storage need a development build; Expo Go won't do.

```bash
pnpm install                                                     # from the repo root
cd apps/mobile
npx eas-cli@latest build --profile development --platform ios    # or android; installs on your phone
pnpm start                                                       # then open the dev build
```

With Xcode or Android Studio installed you can instead run `pnpm ios` or `pnpm android` to build locally.
Point at a local API with `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:9090/v1 pnpm start`
(`EXPO_PUBLIC_WEB_URL` sets where shared links and legal pages point; it defaults to startajump.com).

## Check it

```bash
pnpm lint                                            # TypeScript
npx expo export --platform ios --platform android    # full Metro bundle for both platforms
npx expo-doctor                                      # SDK versions and config
```

## Ship it

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios       # App Store Connect / TestFlight
npx eas-cli@latest submit --platform android   # Google Play
```

Add native libraries with `npx expo install <pkg>` so versions match the SDK.

## Notes

- `tsconfig.json` maps `react` to this app's React 19 types, because the web app's React 18 types are hoisted
  in the workspace and would otherwise leak into library typings. Metro must not see that mapping, so the `@/`
  alias is resolved in `metro.config.js` and `experiments.tsconfigPaths` is off in `app.json`.
- Paystack checkout opens in the in-app browser; when it closes, the payment screen checks the saved reference
  with the API, as the web's return page does.
