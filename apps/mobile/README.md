# Jump mobile

Expo (React Native) app for iOS and Android. Shares types, formatting, the API client and the
GPS measuring algorithm with the web app through `@jump/shared` (`packages/shared`).

## Run it

Background location and secure storage need a development build; Expo Go won't do.

```bash
pnpm install                              # from the repo root
cd apps/mobile
npx eas-cli@latest build --profile development --platform ios   # once, installs on your phone
pnpm start                                # then open the dev build
```

With Xcode installed you can instead run `pnpm ios` to build locally.
Point at a local API with `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:9090/v1 pnpm start`.

## Ship it

```bash
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --platform ios     # uploads to App Store Connect / TestFlight
```

Add native libraries with `npx expo install <pkg>` so versions match the SDK.
