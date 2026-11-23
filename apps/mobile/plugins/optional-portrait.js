// `orientation: "portrait"` makes Google Play treat android.hardware.screen.portrait as required, which hides the
// app from tablets, Chromebooks and XR headsets. Declaring it optional keeps the portrait lock but not the filter.
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURE = 'android.hardware.screen.portrait';

module.exports = (config) => withAndroidManifest(config, (mod) => {
  const manifest = mod.modResults.manifest;
  const features = (manifest['uses-feature'] ?? []).filter((feature) => feature.$['android:name'] !== FEATURE);
  manifest['uses-feature'] = [...features, { $: { 'android:name': FEATURE, 'android:required': 'false' } }];
  return mod;
});
