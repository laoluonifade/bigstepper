// app.json holds the config; this only adds what depends on the environment.
const { existsSync } = require('node:fs');
const { join } = require('node:path');

module.exports = ({ config }) => {
  // Android push goes through Firebase Cloud Messaging, which needs the app's google-services.json. Until
  // it's added, Android builds without it (pushes just don't arrive there).
  if (existsSync(join(__dirname, 'google-services.json'))) {
    config.android = { ...config.android, googleServicesFile: './google-services.json' };
  }
  // "Continue with Google" needs the iOS client's reversed id as a URL scheme at build time. Without the
  // client id the plugin is left out and the app hides the Google button.
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (iosClientId) {
    const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
    config.plugins = [...(config.plugins ?? []), ['@react-native-google-signin/google-signin', { iosUrlScheme }]];
  }
  return config;
};
