import { readWhatsAppZip } from './zip-reader.js';
import { parseWhatsAppText, findAmbiguousDates, decodeTextBytes } from './whatsapp-parser.js';
import { matchMedia, basename } from './media-matcher.js';
import { state, notify, resetConversation } from '../core/state.js';
import { getSettings } from '../core/settings.js';
import { saveArchiveRecord } from '../core/storage.js';
import { calculateAnalyticsInWorker } from '../features/analytics.js';
import { loadArchiveBookmarks } from '../features/bookmarks.js';
import { showToast } from '../ui/notifications.js';
import { processZipInWorker, cancelWorkerImport } from './import-worker-client.js';

let cancelled = false;

export function cancelImport() { cancelled = true; cancelWorkerImport(); }
function progress(percent, message) {
  if (cancelled) throw new DOMException('Import cancelled.', 'AbortError');
  window.dispatchEvent(new CustomEvent('chatview:import-progress', { detail: { percent, message } }));
}
function createChatId(file) {
  if (file.chatViewChatId) return file.chatViewChatId;
  const raw = `${file.name}|${file.size}|${file.lastModified || 0}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) { hash ^= raw.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

export async function importFile(file) {
  if (!file) return;
  if (state.importBusy) { showToast('An import is already running.', 'info'); return; }
  state.importBusy = true;
  cancelled = false;
  window.dispatchEvent(new CustomEvent('chatview:import-start'));
  try {
    let archive = null, parsed = null, matching = null, archiveHandle = null, ambiguousDates = [];
    let transcript = '';
    let transcriptName = file.name;
    let entries = [];
    const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
    if (isZip) {
      progress(2, 'Opening local ZIP archive…');
      try {
        const result = await processZipInWorker(file, getSettings().dateFormat, progress);
        archive = result.archive; parsed = result.parsed; matching = result.matching; archiveHandle = result.archiveHandle;
        ambiguousDates = result.ambiguousDates || []; transcriptName = archive.transcriptName;
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        archive = await readWhatsAppZip(file, progress);
        transcript = archive.transcriptText;
        transcriptName = basename(archive.transcriptPath);
        entries = archive.entries.filter(entry => entry.path !== archive.transcriptPath);
      }
    } else if (/\.txt$/i.test(file.name) || file.type.startsWith('text/')) {
      progress(8, 'Reading transcript…');
      transcript = decodeTextBytes(new Uint8Array(await file.arrayBuffer()));
      progress(28, 'Transcript loaded');
    } else {
      throw new Error('Choose a WhatsApp ZIP export or a plain-text .txt transcript.');
    }
    if (!parsed && !transcript.trim()) throw new Error('The transcript is empty. No conversation messages were found.');
    if (!parsed) ambiguousDates = findAmbiguousDates(transcript);
    const dateFormat = getSettings().dateFormat;
    if (!parsed) {
      progress(38, 'Reconstructing messages and participants…');
      await new Promise(resolve => setTimeout(resolve, 0));
      parsed = parseWhatsAppText(transcript, { dateFormat });
    }
    if (!parsed.messages.length) throw new Error('No supported WhatsApp message timestamps were detected. Check the exported TXT format and date settings.');
    progress(62, `Parsed ${parsed.messages.length.toLocaleString()} messages`);
    await new Promise(resolve => setTimeout(resolve, 0));
    matching ||= { media: [], matchedPaths: new Set(), missing: 0, ambiguous: 0 };
    if (archive && !archiveHandle) matching = matchMedia(parsed.messages, entries);
    progress(83, 'Matching attachments to messages…');
    await new Promise(resolve => setTimeout(resolve, 0));
    const chatId = createChatId(file);
    const baseName = file.name.replace(/\.zip$|\.txt$/i, '').replace(/[_-]+/g, ' ').trim();
    const name = baseName || 'WhatsApp conversation';
    const archiveState = archive ? {
      name: file.name,
      transcriptName,
      transcriptPath: archive.transcriptPath,
      entries: archive.entries,
      zip: archiveHandle ? null : archive.zip,
      workerArchive: archiveHandle,
      blob: file,
      size: file.size,
      expandedSize: archive.expandedSize,
      urls: new Map(),
      chatId,
      candidateTextFiles: archive.candidateTextFiles
    } : {
      name: file.name,
      transcriptName,
      entries: [], zip: null, blob: null, size: file.size, expandedSize: file.size,
      urls: new Map(), chatId, candidateTextFiles: [file.name]
    };
    for (const oldUrl of state.archive?.urls?.values?.() || []) URL.revokeObjectURL(oldUrl);
    state.archive?.workerArchive?.dispose?.();
    resetConversation();
    state.archive = archiveState;
    state.messages = parsed.messages;
    state.participants = parsed.participants;
    state.chatName = name;
    state.chatId = chatId;
    state.mediaItems = matching.media;
    progress(91, 'Calculating local conversation insights…');
    state.stats = await calculateAnalyticsInWorker(state.messages, state.mediaItems, state.participants);
    state.bookmarks = await loadArchiveBookmarks(chatId);
    state.pins = new Set();
    progress(95, 'Preparing your conversation workspace…');
    if (getSettings().persistArchive && isZip) {
      try {
        await saveArchiveRecord(file, file.name, chatId);
        window.dispatchEvent(new CustomEvent('chatview:archive-saved'));
      } catch (error) {
        showToast(`Archive opened, but local save failed: ${error.message}`, 'warning');
      }
    }
    progress(100, 'Your conversation is ready');
    notify('imported');
    window.dispatchEvent(new CustomEvent('chatview:import-complete', { detail: { ambiguousDates, missing: matching.missing, ambiguous: matching.ambiguous, mediaCount: matching.media.length, transcriptName, isZip, invalidHeaders: parsed.invalidHeaders } }));
    showToast(`Imported ${parsed.messages.length.toLocaleString()} messages successfully.`, 'success');
  } catch (error) {
    if (error.name === 'AbortError') showToast('Import cancelled.', 'info');
    else showToast(error.message || 'The archive could not be imported.', 'error', 6500);
    window.dispatchEvent(new CustomEvent('chatview:import-error', { detail: error }));
  } finally {
    state.importBusy = false;
    window.dispatchEvent(new CustomEvent('chatview:import-finish'));
  }
}
