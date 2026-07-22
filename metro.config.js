const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('html')) {
  config.resolver.assetExts.push('html');
}
// Prefer loading HTML as an asset URI (not a giant JS string) for Android WebView.
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== 'html');

module.exports = config;
