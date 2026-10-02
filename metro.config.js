// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle the on-device pose model (MoveNet) as an asset.
config.resolver.assetExts.push('tflite');

module.exports = config;
