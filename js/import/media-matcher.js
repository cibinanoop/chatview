const EXTENSIONS = {
  image: new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']),
  video: new Set(['mp4', 'mov', '3gp', 'm4v', 'webm']),
  audio: new Set(['opus', 'ogg', 'mp3', 'm4a', 'aac', 'amr', 'wav', '3ga']),
  document: new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'vcf', 'zip', 'rar', 'csv'])
};
const FILE_EXTENSIONS = [...new Set([...EXTENSIONS.image, ...EXTENSIONS.video, ...EXTENSIONS.audio, ...EXTENSIONS.document])].sort((a, b) => b.length - a.length);
const FILE_PATTERN = new RegExp(`(?:[^\\s<>"']+\\.(${FILE_EXTENSIONS.join('|')}))`, 'ig');

export function fileKind(filename) {
  const ext = String(filename).split('.').pop().toLowerCase();
  for (const [kind, set] of Object.entries(EXTENSIONS)) if (set.has(ext)) return kind;
  return 'file';
}
export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i++) { value /= 1024; unit = units[i]; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}
export function basename(path) { return String(path).split(/[\\/]/).pop() || String(path); }
export function normalizeFilename(name) {
  return basename(name).normalize('NFC').trim().toLocaleLowerCase().replace(/[\u200e\u200f]/g, '');
}

function attachmentNames(content) {
  const names = new Set();
  const attached = /<attached:\s*([^>]+)>/gi;
  let match;
  while ((match = attached.exec(content))) names.add(basename(match[1].trim().replace(/^['"]|['"]$/g, '')));
  const contentWithoutUrls = content.replace(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/giu, ' ');
  FILE_PATTERN.lastIndex = 0;
  while ((match = FILE_PATTERN.exec(contentWithoutUrls))) names.add(basename(match[0].replace(/[),.;]+$/, '')));
  return [...names].filter(Boolean);
}

export function matchMedia(messages, zipEntries) {
  const index = new Map();
  for (const entry of zipEntries) {
    const key = normalizeFilename(entry.path);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entry);
  }
  const media = [];
  const matchedPaths = new Set();
  let missing = 0;
  let ambiguous = 0;
  for (const message of messages) {
    const candidates = attachmentNames(message.content);
    const attachments = [];
    for (const candidate of candidates) {
      const matches = index.get(normalizeFilename(candidate)) || [];
      if (matches.length === 1) {
        const entry = matches[0];
        const attachment = {
          id: `a-${media.length}`,
          path: entry.path,
          name: basename(entry.path),
          kind: fileKind(entry.path),
          size: entry.size || 0,
          missing: false
        };
        attachments.push(attachment);
        media.push({ ...attachment, messageId: message.id, messageIndex: message.index, timestamp: message.timestamp, sender: message.sender, content: message.content });
        matchedPaths.add(entry.path);
      } else if (matches.length > 1) {
        ambiguous += 1;
        attachments.push({ id: `missing-${message.id}-${attachments.length}`, name: candidate, kind: fileKind(candidate), missing: true, reason: 'ambiguous' });
        missing += 1;
      } else {
        attachments.push({ id: `missing-${message.id}-${attachments.length}`, name: candidate, kind: fileKind(candidate), missing: true, reason: 'not-found' });
        missing += 1;
      }
    }
    if (!attachments.length && /<Media omitted>|\(file attached\)/i.test(message.content)) {
      attachments.push({ id: `missing-${message.id}-placeholder`, name: 'Attachment not identified', kind: 'file', missing: true, reason: 'no-filename' });
      missing += 1;
    }
    message.attachments = attachments;
    message.isMediaMessage = attachments.length > 0;
    const identified = attachments.find(item => item.kind !== 'file');
    if (identified) message.type = identified.kind;
    else if (attachments.some(item => !item.missing)) message.type = 'document';
  }
  return { media, matchedPaths, missing, ambiguous };
}
