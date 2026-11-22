import { putRecord, getRecord } from '../core/storage.js';
const keyFor = id => `bookmarks-${id}`;

export async function loadArchiveBookmarks(archiveId) {
  try {
    const record = await getRecord(keyFor(archiveId));
    return new Set(record || []);
  } catch { return new Set(); }
}
export async function saveBookmarks(archiveId, bookmarks) {
  if (!archiveId) return;
  try { await putRecord(keyFor(archiveId), [...bookmarks]); }
  catch { /* Bookmarks remain active for this session if storage is unavailable. */ }
}
export function toggleBookmark(messageId, state) {
  if (state.bookmarks.has(messageId)) state.bookmarks.delete(messageId);
  else state.bookmarks.add(messageId);
  saveBookmarks(state.chatId, state.bookmarks);
}
export function togglePin(messageId, state) {
  if (state.pins.has(messageId)) state.pins.delete(messageId);
  else state.pins.add(messageId);
}
