const fs = require('node:fs');
const path = require('node:path');

// fs.watch can report a watched directory itself as a Windows \\?\ path
// when it is removed. Joining that absolute path to dir produces ENOENT,
// and the fallback watcher then fails to close the removed directory's handle.
function normalizeWatcherPath(directory, reported, paths) {
  const prefix = String.fromCharCode(92, 92, 63, 92);
  if (reported.startsWith(prefix + 'UNC' + paths.sep)) {
    reported = paths.sep + paths.sep + reported.slice(8);
  } else if (reported.startsWith(prefix)) {
    reported = reported.slice(4);
  }
  const absolute = paths.isAbsolute(reported) ? reported : paths.resolve(directory, reported);
  const relative = paths.relative(directory, absolute);
  if (relative === '..' || relative.startsWith('..' + paths.sep) || paths.isAbsolute(relative)) return null;
  return relative;
}

function applyPatch() {
  if (process.platform !== 'win32') return;
  const entry = require.resolve('@expo/metro-file-map');
  const version = JSON.parse(fs.readFileSync(path.join(path.dirname(entry), '../package.json'), 'utf8')).version;
  if (version !== '58.0.5') throw new Error('Metro 버전이 변경되었습니다. Windows watcher 보완의 필요성과 호환성을 검토하세요.');
  const target = path.join(path.dirname(entry), 'watchers/FallbackWatcher.js');
  const marker = '// CLOSET: normalize Windows namespace watcher events.';
  const source = fs.readFileSync(target, 'utf8');
  const anchor = '*/ async #processChange(dir, event, file) {';
  if (source.split(anchor).length !== 2) throw new Error('Metro watcher 원본을 확인하지 못했습니다.');
  const normalization = `${marker}\n        const normalizedFile = (${normalizeWatcherPath.toString()})(dir, file, _path().default);\n        if (normalizedFile === null) return;\n        file = normalizedFile;`;
  let patched = source.includes(marker) ? source : source.replace(anchor, `${anchor}\n        ${normalization}`);
  const rootMarker = '// CLOSET: an existing watch root needs no recursive rescan.';
  if (!patched.includes(rootMarker)) {
    const directoryAnchor = 'if (stat.isDirectory()) {';
    const position = patched.indexOf(directoryAnchor, patched.indexOf(anchor));
    if (position === -1) throw new Error('Metro directory event 처리를 찾지 못했습니다.');
    const end = position + directoryAnchor.length;
    patched = patched.slice(0, end) + `\n                ${rootMarker}\n                if (file === '') return;` + patched.slice(end);
  }
  if (patched === source) return;
  fs.writeFileSync(target, patched);
  console.log('Windows Metro 파일 감시 경로 처리를 보완했습니다.');
}

module.exports = { normalizeWatcherPath };
if (require.main === module) applyPatch();
