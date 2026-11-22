const DB_NAME = 'chatview-local-v2';
const DB_VERSION = 1;
const ARCHIVE_PREFIX = 'archive:';
let dbPromise;

function openDB() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records', { keyPath: 'key' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local storage.'));
    request.onblocked = () => reject(new Error('Local storage is blocked by another tab.'));
  });
  return dbPromise;
}

export async function putRecord(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').put({ key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error || new Error('Could not save locally.'));
  });
}
export async function getRecord(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('records', 'readonly').objectStore('records').get(key);
    request.onsuccess = () => resolve(request.result?.value ?? null); request.onerror = () => reject(request.error || new Error('Could not read local data.'));
  });
}
export async function deleteRecord(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').delete(key);
    tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error || new Error('Could not delete local data.'));
  });
}
export async function clearRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').clear();
    tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error || new Error('Could not clear local data.'));
  });
}
async function allRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('records', 'readonly').objectStore('records').getAll();
    request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error || new Error('Could not list local archives.'));
  });
}
export async function listArchiveRecords() {
  const records = await allRecords();
  return records.filter(row => row.key.startsWith(ARCHIVE_PREFIX) || row.key === 'saved-archive').map(row => {
    const value = row.value || {};
    return { key: row.key, chatId: value.chatId || (row.key === 'saved-archive' ? 'legacy' : row.key.slice(ARCHIVE_PREFIX.length)) || 'legacy', name: value.name || value.transcriptName || 'Saved conversation', size: value.size || value.blob?.size || 0, savedAt: value.savedAt || row.updatedAt || 0, type: value.type || 'application/zip' };
  }).sort((a, b) => b.savedAt - a.savedAt);
}
export async function hasSavedArchive() { try { return (await listArchiveRecords()).length > 0; } catch { return false; } }
export async function saveArchiveRecord(file, name, chatId = null) {
  const key = `${ARCHIVE_PREFIX}${chatId || `${Date.now()}`}`;
  return putRecord(key, { blob: file, name, chatId, size: file.size, savedAt: Date.now(), type: file.type || 'application/zip' });
}
export async function renameArchiveRecord(chatId, name) {
  const key = chatId === 'legacy' ? 'saved-archive' : `${ARCHIVE_PREFIX}${chatId}`;
  const record = await getRecord(key);
  if (!record) throw new Error('This saved chat is no longer available.');
  record.name = String(name).trim().slice(0, 100) || record.name;
  return putRecord(key, record);
}
export async function loadArchiveRecord(chatId = null) {
  if (chatId === 'legacy') return getRecord('saved-archive');
  if (chatId) return getRecord(`${ARCHIVE_PREFIX}${chatId}`);
  const records = await allRecords();
  const found = records.filter(row => row.key.startsWith(ARCHIVE_PREFIX)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  return found?.value || getRecord('saved-archive');
}

export async function deleteArchiveRecord(chatId) {
  const record = (await listArchiveRecords()).find(item => item.chatId === chatId);
  if (!record) return false;
  return deleteRecord(record.key);
}
export async function deleteSavedArchive(chatId = null) {
  if (chatId) return deleteArchiveRecord(chatId);
  const records = await listArchiveRecords();
  await Promise.all(records.map(record => deleteRecord(record.key)));
}
