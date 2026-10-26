// app.json holds the config; this only adds what depends on the environment.
module.exports = ({ config }) => {
  // "Continue with Google" needs the iOS client's reversed id as a URL scheme at build time. Without the
  // client id the plugin is left out and the app hides the Google button.
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (iosClientId) {
    const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
    config.plugins = [...(config.plugins ?? []), ['@react-native-google-signin/google-signin', { iosUrlScheme }]];
  }
  return config;
};
