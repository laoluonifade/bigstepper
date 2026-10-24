const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The `@/` alias, resolved here rather than from tsconfig paths: tsconfig also maps `react` to its React 19
// types for the type checker (the web app's React 18 types are hoisted in the workspace), and Metro must
// not see that mapping.
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const aliased = moduleName.startsWith('@/assets/')
    ? path.join(__dirname, 'assets', moduleName.slice('@/assets/'.length))
    : moduleName.startsWith('@/') ? path.join(__dirname, 'src', moduleName.slice(2)) : moduleName;
  return (resolve ?? context.resolveRequest)(context, aliased, platform);
};

module.exports = config;
