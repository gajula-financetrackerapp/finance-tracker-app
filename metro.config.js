const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('html')) {
  config.resolver.assetExts.push('html');
}
// Locale packs as assets (not inlined into the JS bundle) — faster Expo Go "Loading from…"
if (!config.resolver.assetExts.includes('i18n')) {
  config.resolver.assetExts.push('i18n');
}
// Prefer loading HTML as an asset URI (not a giant JS string) for Android WebView.
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== 'html');

// Faster startup: move requires to the point of use.
config.transformer = config.transformer || {};
config.transformer.inlineRequires = true;

module.exports = config;
