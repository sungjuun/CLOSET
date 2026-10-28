const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Export/fixture churn can flood Windows' fallback watcher. None of these
// directories contains application modules. Keep Expo's existing exclusions.
const generated = ['dist', 'test-results', 'coverage', '.git', 'supabase/.temp', 'supabase/.branches', 'node_modules/.vitest-cache', 'node_modules/.cache'];
const previous = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
  ...generated.map((directory) => new RegExp(`^${escape(path.join(__dirname, directory))}(?:[/\\\\]|$)`)),
];

module.exports = config;
