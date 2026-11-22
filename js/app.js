import { state, resetConversation } from './core/state.js';
import { loadSettings, getSettings, updateSetting, resetSettings } from './core/settings.js';
import { listArchiveRecords, loadArchiveRecord, deleteArchiveRecord, deleteSavedArchive, clearRecords, saveArchiveRecord, renameArchiveRecord } from './core/storage.js';
import { importFile, cancelImport } from './import/import-manager.js';
import { setupConversationScrolling, renderConversation, updateWorkspaceUI, setupAvatarControls, setupDateNavigation, jumpToMessage } from './chat/chat-manager.js';
import { setupSearch } from './search/search-engine.js';
import { setupMediaViewer, openMediaGallery } from './media/media-viewer.js';
import { openExportMenu } from './features/export.js';
import { toggleBookmark, togglePin, saveBookmarks } from './features/bookmarks.js';
import { setupIntelligencePanel } from './features/intelligence-panel.js';
import { showToast } from './ui/notifications.js';

const $ = selector => document.querySelector(selector);
let contextMessage = null;

function openImport(type = 'zip') {
  if (type === 'txt') $('#txtInput').click();
  else $('#zipInput').click();
}
function loadDemoArchive() {
  const sample = [
    '14/11/26, 9:04 am - Alex: Morning! I made a small plan for the weekend.',
    '14/11/26, 9:07 am - Sam: Nice. Saturday morning works for me.',
    '14/11/26, 9:10 am - Alex: There is a new cafÃ© near the river. https://example.com/cafe',
    '14/11/26, 9:12 am - Sam: That sounds good. I can bring the camera.',
    '14/11/26, 9:15 am - Alex: Great â€” let us meet there at 10:30.',
    '14/11/26, 9:17 am - Sam: Confirmed. See you then!',
    '15/11/26, 7:42 pm - Alex: The photos came out beautifully.',
    '15/11/26, 7:46 pm - Sam: Thanks! I will share the album tomorrow.',
    '16/11/26, 8:03 am - Alex: Have a good week ðŸ™‚',
    '16/11/26, 8:05 am - Sam: You too!'
  ].join('\n');
  const file = new File([sample], 'ChatView-Demo.txt', { type: 'text/plain' });
  importFile(file).then(() => showToast('This is a fictional sample conversation. Your own archives remain on your device.', 'info', 6000));
}

function setupImportControls() {
  ['#importZipBtn', '#topImportBtn', '#welcomeImportBtn'].forEach(selector => $(selector)?.addEventListener('click', () => openImport('zip')));
  ['#importTxtBtn', '#welcomeTxtBtn'].forEach(selector => $(selector)?.addEventListener('click', () => openImport('txt')));
  $('#welcomeDemoBtn')?.addEventListener('click', loadDemoArchive);
  $('#zipInput').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importFile(file); event.target.value = ''; });
  $('#txtInput').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importFile(file); event.target.value = ''; });
  const surface = $('#chatSurface');
  ['dragenter', 'dragover'].forEach(name => surface.addEventListener(name, event => { event.preventDefault(); $('#dropOverlay').classList.add('is-visible'); }));
  ['dragleave', 'drop'].forEach(name => surface.addEventListener(name, event => { event.preventDefault(); if (name === 'drop') { const file = event.dataTransfer?.files?.[0]; if (file) importFile(file); } $('#dropOverlay').classList.remove('is-visible'); }));
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', event => { if (!surface.contains(event.target)) event.preventDefault(); });
}

function showProcessing() {
  $('#processingOverlay').hidden = false;
  $('#progressBar').style.width = '0%';
  $('#progressPercent').textContent = '0%';
  $('#progressLabel').textContent = 'Startingâ€¦';
  $('#processingTitle').textContent = 'Preparing your archive';
  $('#processingMessage').textContent = 'Reading the selected file securely on this device.';
}
function setupImportEvents() {
  window.addEventListener('chatview:import-start', showProcessing);
  window.addEventListener('chatview:import-progress', event => {
    const { percent, message } = event.detail;
    $('#progressBar').style.width = `${percent}%`;
    $('#progressPercent').textContent = `${percent}%`;
    $('#progressLabel').textContent = message;
    $('#processingTitle').textContent = percent >= 100 ? 'Archive ready' : 'Reconstructing your conversation';
    $('#processingMessage').textContent = 'Everything is processed locally. Your messages are never uploaded.';
  });
  window.addEventListener('chatview:import-complete', async event => {
    const { ambiguousDates, missing, ambiguous, mediaCount, transcriptName, invalidHeaders } = event.detail;
    renderConversation();
    updateWorkspaceUI();
    populateSelfParticipant();
    syncSettingsControls();
    updateStorageStatus();
    if (ambiguousDates?.length && getSettings().dateFormat === 'auto') showToast('Some dates are ambiguous. Set DD/MM or MM/DD in Preferences to interpret them explicitly.', 'warning', 6500);
    if (missing) showToast(`${missing} attachment reference(s) could not be matched${ambiguous ? `; ${ambiguous} had duplicate filenames` : ''}. Unmatched files were left unassociated.`, 'warning', 6500);
    if (!mediaCount) showToast('No attachments were matched. A TXT-only export is still fully searchable.', 'info', 5000);
    if (invalidHeaders) showToast(`${invalidHeaders} timestamp-like line(s) were not recognised. Check date settings if messages appear incomplete.`, 'warning', 6000);
    $('#processingOverlay').hidden = true;
  });
  window.addEventListener('chatview:import-error', () => { $('#processingOverlay').hidden = true; });
  window.addEventListener('chatview:import-finish', () => { setTimeout(() => { $('#processingOverlay').hidden = true; }, 200); });
  $('#cancelImportBtn').addEventListener('click', cancelImport);
}

function syncSettingsControls() {
  const settings = getSettings();
  $('#themeSelect').value = settings.theme;
  $('#wallpaperSelect').value = settings.wallpaper;
  $('#dateFormatSelect').value = settings.dateFormat;
  $('#persistArchiveToggle').checked = settings.persistArchive;
  $('#persistArchiveToggle').disabled = !state.archive?.zip;
  $('#compactToggle').checked = settings.compact;
  $('#selfParticipantSelect').value = settings.selfParticipant || '';
}
function populateSelfParticipant() {
  const select = $('#selfParticipantSelect');
  const current = getSettings().selfParticipant || '';
  select.replaceChildren();
  const none = document.createElement('option'); none.value = ''; none.textContent = 'Not assigned'; select.append(none);
  for (const participant of state.participants) {
    const option = document.createElement('option'); option.value = participant.name; option.textContent = participant.name; select.append(option);
  }
  select.value = state.participants.some(item => item.name === current) ? current : '';
}

function openSettings() { syncSettingsControls(); $('#settingsModal').hidden = false; }
function closeModal(id) { const modal = document.getElementById(id); if (modal) modal.hidden = true; }
function setupSettings() {
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsModal').addEventListener('click', event => { if (event.target.id === 'settingsModal') closeModal('settingsModal'); });
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    updateSetting('theme', next); $('#themeSelect').value = next;
  });
  $('#themeSelect').addEventListener('change', event => updateSetting('theme', event.target.value));
  $('#wallpaperSelect').addEventListener('change', event => updateSetting('wallpaper', event.target.value));
  $('#dateFormatSelect').addEventListener('change', event => updateSetting('dateFormat', event.target.value));
  $('#compactToggle').addEventListener('change', event => updateSetting('compact', event.target.checked));
  $('#selfParticipantSelect').addEventListener('change', event => {
    updateSetting('selfParticipant', event.target.value);
    renderConversation({ toBottom: false });
  });
  $('#persistArchiveToggle').addEventListener('change', async event => {
    updateSetting('persistArchive', event.target.checked);
    if (event.target.checked && state.archive?.blob) {
      try { await saveArchiveRecord(state.archive.blob, state.archive.name, state.chatId); showToast('Archive saved in this browser profile.', 'success'); }
      catch (error) { showToast(`Could not save archive: ${error.message}`, 'error'); event.target.checked = false; updateSetting('persistArchive', false); }
    } else if (!event.target.checked) {
      showToast('This session remains open. Your saved chats stay in the local library until you remove them.', 'info');
    }
    updateStorageStatus();
  });
  $('#clearSavedArchiveBtn').addEventListener('click', async () => {
    try { await deleteSavedArchive(); showToast('Saved chat library cleared from this browser.', 'success'); updateStorageStatus(); }
    catch (error) { showToast(error.message, 'error'); }
  });
  $('#resetAppBtn').addEventListener('click', async () => {
    if (!confirm('Reset ChatView and delete all locally stored ChatView data in this browser? This cannot be undone.')) return;
    disposeCurrentArchive();
    try { await clearRecords(); } catch { /* Continue resetting visible workspace if storage is unavailable. */ }
    resetSettings(); resetConversation();
    $('#messagesList').replaceChildren(); $('#searchResults').hidden = true; $('#searchInput').value = '';
    updateWorkspaceUI(); updateStorageStatus(); syncSettingsControls(); closeModal('settingsModal');
    showToast('Workspace reset. All ChatView IndexedDB records were cleared.', 'success');
  });
  $('#storageInfoBtn').addEventListener('click', () => showToast('Imported conversations stay in memory unless â€œRestore archive on this deviceâ€ is enabled. The optional saved ZIP is stored in this browser profile only.', 'info', 6000));
}

async function updateStorageStatus() {
  const archives = await listArchiveRecords().catch(() => []);
  const sizes = await navigator.storage?.estimate?.().catch?.(() => null);
  const used = sizes?.usage ? ` · ${(sizes.usage / 1048576).toFixed(1)} MB site storage` : '';
  const warning = sizes?.quota && sizes.usage / sizes.quota >= 0.85 ? ' · storage nearly full' : '';
  $('#storageStatus').textContent = (archives.length ? `${archives.length} saved chat${archives.length === 1 ? '' : 's'} on this device` : 'No saved chats') + used + warning;
  renderArchiveLibrary(archives);
}

function renderArchiveLibrary(archives) {
  const root = $('#archiveLibrary');
  if (!root) return;
  root.replaceChildren();
  if (!archives.length) return;
  const title = document.createElement('div'); title.className = 'archive-library-title'; title.textContent = `SAVED CHATS Â· ${archives.length}`; root.append(title);
  for (const item of archives) {
    const row = document.createElement('div'); row.className = 'saved-archive-row';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'saved-archive-open';
    const name = document.createElement('strong'); name.textContent = item.name.replace(/\.zip$/i, '').replace(/[_-]+/g, ' ');
    const meta = document.createElement('small'); meta.textContent = `${(item.size / 1048576).toFixed(item.size > 1048576 ? 1 : 2)} MB Â· saved ${new Date(item.savedAt).toLocaleDateString()}`;
    open.append(name, meta);
    open.addEventListener('click', async () => {
      try {
        const record = await loadArchiveRecord(item.chatId);
        if (!record?.blob) { showToast('This saved chat is no longer available.', 'warning'); await updateStorageStatus(); return; }
        const file = new File([record.blob], record.name || item.name || 'saved-chat.zip', { type: record.type || 'application/zip', lastModified: record.savedAt || item.savedAt || Date.now() });
        file.chatViewChatId = record.chatId || item.chatId;
        importFile(file);
      } catch (error) { showToast(`Could not open saved chat: ${error.message}`, 'error'); }
    });
    const rename = document.createElement('button'); rename.type = 'button'; rename.className = 'saved-archive-rename'; rename.textContent = 'Rename'; rename.title = `Rename ${item.name}`; rename.setAttribute('aria-label', `Rename ${item.name}`);
    rename.addEventListener('click', async () => {
      const proposed = window.prompt('Choose a display name for this saved chat', item.name.replace(/\.zip$/i, ''));
      if (!proposed?.trim()) return;
      try { await renameArchiveRecord(item.chatId, proposed.trim()); await updateStorageStatus(); showToast('Saved chat renamed on this device.', 'success'); }
      catch (error) { showToast(`Could not rename saved chat: ${error.message}`, 'error'); }
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'saved-archive-delete'; remove.textContent = 'Ã—'; remove.title = `Remove ${item.name} from this device`; remove.setAttribute('aria-label', `Remove ${item.name} from this device`);
    remove.addEventListener('click', async () => {
      if (!confirm(`Remove â€œ${item.name}â€ from this device?`)) return;
      try { await deleteArchiveRecord(item.chatId); await updateStorageStatus(); showToast('Saved chat removed from this device.', 'success'); }
      catch (error) { showToast(`Could not remove saved chat: ${error.message}`, 'error'); }
    });
    row.append(open, rename, remove); root.append(row);
  }
}

async function offerRestore() { await updateStorageStatus(); }

function disposeCurrentArchive() {
  state.archive?.workerArchive?.dispose?.();
  for (const url of state.archive?.urls?.values?.() || []) URL.revokeObjectURL(url);
  if (state.archive?.urls) state.archive.urls.clear();
}

function setupLayoutControls() {
  const inspectorBreakpoint = window.matchMedia('(max-width: 850px)');
  if (inspectorBreakpoint.matches) $('#contentGrid').classList.add('inspector-hidden');
  inspectorBreakpoint.addEventListener?.('change', event => $('#contentGrid').classList.toggle('inspector-hidden', event.matches));
  $('#infoToggleBtn').addEventListener('click', () => $('#contentGrid').classList.toggle('inspector-hidden'));
  $('#closeInspector').addEventListener('click', () => $('#contentGrid').classList.add('inspector-hidden'));
  $('#mediaGalleryBtn').addEventListener('click', openMediaGallery);
  $('#viewAllMediaBtn').addEventListener('click', openMediaGallery);
  $('#exportBtn').addEventListener('click', openExportMenu);
  $('#openSidebar').addEventListener('click', () => { $('#sidebar').classList.add('mobile-open'); $('#mobileBackdrop').classList.add('is-visible'); });
  $('#closeSidebar').addEventListener('click', closeSidebar);
  $('#mobileBackdrop').addEventListener('click', closeSidebar);
}
function closeSidebar() { $('#sidebar').classList.remove('mobile-open'); $('#mobileBackdrop').classList.remove('is-visible'); }

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.append(textarea); textarea.select();
  const ok = document.execCommand('copy'); textarea.remove();
  if (!ok) throw new Error('Copy is not available in this browser context.');
  return Promise.resolve();
}
function showContextMenu({ x, y, message }) {
  contextMessage = message;
  const menu = $('#contextMenu');
  $('#contextOpenMedia').hidden = !message?.attachments?.some(item => !item.missing);
  menu.hidden = false;
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 230))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - 235))}px`;
}
function hideContextMenu() { $('#contextMenu').hidden = true; contextMessage = null; }
function setupContextMenu() {
  window.addEventListener('chatview:context-menu', event => showContextMenu(event.detail));
  document.addEventListener('pointerdown', event => { if (!event.target.closest('#contextMenu')) hideContextMenu(); });
  $('#contextMenu').addEventListener('click', async event => {
    const button = event.target.closest('[data-action]'); if (!button || !contextMessage) return;
    const message = contextMessage;
    try {
      switch (button.dataset.action) {
        case 'copy': await copyText(message.content); showToast('Message copied.', 'success'); break;
        case 'copy-meta': await copyText(`[${new Date(message.timestamp).toLocaleString()}] ${message.sender || 'System'}: ${message.content}`); showToast('Message and details copied.', 'success'); break;
        case 'bookmark': toggleBookmark(message.id, state); await saveBookmarks(state.chatId, state.bookmarks); document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`)?.classList.toggle('is-bookmarked', state.bookmarks.has(message.id)); showToast(state.bookmarks.has(message.id) ? 'Message bookmarked.' : 'Bookmark removed.', 'success'); break;
        case 'pin': togglePin(message.id, state); document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`)?.classList.toggle('is-pinned', state.pins.has(message.id)); showToast(state.pins.has(message.id) ? 'Pinned in ChatView.' : 'Pin removed.', 'success'); break;
        case 'select':
          if (state.selectedMessages.has(message.id)) state.selectedMessages.delete(message.id); else state.selectedMessages.add(message.id);
          document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`)?.classList.toggle('is-selected', state.selectedMessages.has(message.id));
          showToast(`${state.selectedMessages.size} message(s) selected. Use Export to save them.`, 'success'); break;
        case 'open-media': {
          const attachment = message.attachments.find(item => !item.missing);
          if (attachment) window.dispatchEvent(new CustomEvent('chatview:open-media', { detail: { attachment, message } }));
          break;
        }
      }
    } catch (error) { showToast(error.message, 'error'); }
    hideContextMenu();
  });
}

function setupKeyboard() {
  window.addEventListener('keydown', event => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
    if ((event.ctrlKey || event.metaKey) && event.key === ',') { event.preventDefault(); openSettings(); }
    if (editing) return;
    if (event.key === 'Home' && state.messages.length) { event.preventDefault(); jumpToMessage(state.messages[0].id); }
    if (event.key === 'End' && state.messages.length) { event.preventDefault(); jumpToMessage(state.messages.at(-1).id); }
    if (event.key === 'Escape') {
      hideContextMenu(); closeSidebar();
      ['settingsModal', 'dateModal', 'mediaModal'].forEach(closeModal);
      document.getElementById('galleryOverlay')?.remove();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && state.selectedMessages.size) {
      event.preventDefault();
      const text = state.messages.filter(message => state.selectedMessages.has(message.id)).map(message => `${message.sender || 'System'}: ${message.content}`).join('\n\n');
      copyText(text).then(() => showToast('Selected messages copied.', 'success')).catch(error => showToast(error.message, 'error'));
    }
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
}

function init() {
  loadSettings();
  syncSettingsControls();
  updateWorkspaceUI();
  setupImportControls();
  setupImportEvents();
  setupSettings();
  setupLayoutControls();
  setupContextMenu();
  setupKeyboard();
  setupSearch();
  setupIntelligencePanel();
  setupConversationScrolling();
  setupMediaViewer();
  setupAvatarControls();
  setupDateNavigation();
  updateStorageStatus();
  offerRestore();
  registerServiceWorker();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (getSettings().theme === 'system') loadSettings(); });
  }
}

init();


