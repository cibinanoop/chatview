import { basename, formatBytes } from './media-matcher.js';
import { decodeTextBytes } from './whatsapp-parser.js';

const MAX_ENTRIES = 6000;
const MAX_ARCHIVE_SIZE = 500 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 750 * 1024 * 1024;
const MAX_SINGLE_FILE = 250 * 1024 * 1024;
const MAX_RATIO = 250;

function isUnsafePath(path) {
  const normalized = String(path).replace(/\\/g, '/');
  return normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some(part => part === '..' || part === '.');
}
function scoreTextFile(path, size) {
  const name = basename(path).toLowerCase();
  let score = Math.min(size / 1000, 200);
  if (/^(whatsapp )?chat\.txt$/.test(name)) score += 1000;
  if (/chat|conversation|message|whatsapp/.test(name)) score += 250;
  if (path.includes('/')) score += 8;
  return score;
}

export async function readWhatsAppZip(file, onProgress = () => {}) {
  if (!window.JSZip) throw new Error('The bundled ZIP engine did not load. Check that vendor/jszip.min.js is present.');
  onProgress(4, 'Validating ZIP archive…');
  if (Number(file.size || 0) > MAX_ARCHIVE_SIZE) throw new Error(`The compressed archive exceeds the ${formatBytes(MAX_ARCHIVE_SIZE)} safety limit.`);
  let zip;
  try {
    const zipBytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file;
    zip = await window.JSZip.loadAsync(zipBytes, { checkCRC32: false, createFolders: false });
  }
  catch (error) { throw new Error(`This ZIP could not be opened. It may be encrypted, incomplete or invalid. ${error.message || ''}`.trim()); }
  const names = Object.keys(zip.files);
  if (!names.length) throw new Error('The selected ZIP archive is empty.');
  if (names.length > MAX_ENTRIES) throw new Error(`This archive contains ${names.length.toLocaleString()} entries. The safety limit is ${MAX_ENTRIES.toLocaleString()}.`);
  const entries = [];
  const textFiles = [];
  let totalSize = 0;
  let scanned = 0;
  for (const path of names) {
    const item = zip.files[path];
    if (item.dir) continue;
    const originalPath = item.unsafeOriginalName || path;
    if (isUnsafePath(path) || isUnsafePath(originalPath)) throw new Error(`Unsafe archive path detected: ${originalPath}`);
    if (path.startsWith('__MACOSX/') || basename(path) === '.DS_Store') continue;
    const size = Number(item._data?.uncompressedSize || 0);
    const compressed = Number(item._data?.compressedSize || 0);
    if (size > MAX_SINGLE_FILE) throw new Error(`A file in this archive exceeds the ${formatBytes(MAX_SINGLE_FILE)} per-file safety limit.`);
    totalSize += size;
    if (totalSize > MAX_TOTAL_UNCOMPRESSED) throw new Error(`The expanded archive exceeds the ${formatBytes(MAX_TOTAL_UNCOMPRESSED)} safety limit.`);
    if (size > 1024 * 1024 && (compressed === 0 || size / compressed > MAX_RATIO)) throw new Error(`A suspicious compression ratio was detected for ${basename(path)}. The archive was not opened.`);
    const entry = { path, size, compressedSize: compressed, zipObject: item };
    entries.push(entry);
    if (/\.txt$/i.test(path)) textFiles.push(entry);
    scanned += 1;
    if (scanned % 100 === 0) onProgress(5 + Math.round(scanned / names.length * 18), `Inspecting archive · ${scanned.toLocaleString()} files`);
  }
  if (!textFiles.length) throw new Error('No .txt conversation file was found inside this ZIP. Export the chat again and include the text transcript.');
  textFiles.sort((a, b) => scoreTextFile(b.path, b.size) - scoreTextFile(a.path, a.size));
  const transcript = textFiles[0];
  onProgress(27, `Reading ${basename(transcript.path)}…`);
  const bytes = await transcript.zipObject.async('uint8array');
  const text = decodeTextBytes(bytes);
  onProgress(33, 'Conversation text extracted');
  return {
    zip,
    entries,
    transcriptPath: transcript.path,
    transcriptText: text,
    archiveSize: file.size,
    expandedSize: totalSize,
    candidateTextFiles: textFiles.map(entry => entry.path)
  };
}

export async function extractEntry(archive, path) {
  const entry = archive?.entries?.find(item => item.path === path);
  if (!entry) throw new Error('This attachment is not available in the current archive.');
  if (archive.workerArchive) {
    const blob = await archive.workerArchive.extract(path);
    return new Blob([blob], { type: mimeType(path) });
  }
  const blob = await entry.zipObject.async('blob');
  return new Blob([blob], { type: mimeType(path) });
}

export function mimeType(path) {
  const ext = String(path).split('.').pop().toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp', webm: 'video/webm', opus: 'audio/ogg; codecs=opus', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', amr: 'audio/amr', wav: 'audio/wav', pdf: 'application/pdf', txt: 'text/plain', vcf: 'text/vcard' })[ext] || 'application/octet-stream';
}
