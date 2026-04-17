const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Ignore transient hidden package-manager folders under node_modules so Metro
// does not try to crawl entries that disappear mid-scan on Windows.
config.resolver.blockList = [
  new RegExp(
    `${path
      .resolve(__dirname, 'node_modules')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\\\/](?:@[^\\\\/]+[\\\\/])?\\.[^\\\\/]+(?:[\\\\/].*)?$`
  ),
];

module.exports = config;
