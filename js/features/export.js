import { state } from '../core/state.js';
import { extractEntry } from '../import/zip-reader.js';
import { showToast } from '../ui/notifications.js';

const $ = selector => document.querySelector(selector);
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function safeFilename(value) { return String(value || 'chatview-export').normalize('NFKD').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'chatview-export'; }
function toTranscript(messages) {
  return messages.map(message => {
    const stamp = new Date(message.timestamp).toLocaleString();
    const sender = message.sender ? `${message.sender}: ` : '';
    const files = message.attachments?.length ? `\n${message.attachments.map(item => `[${item.missing ? 'Missing attachment' : 'Attachment'}: ${item.name}]`).join('\n')}` : '';
    return `[${stamp}] ${sender}${message.content}${files}`;
  }).join('\n\n');
}
function selectedMessages() { return state.messages.filter(message => state.selectedMessages.has(message.id)); }
function saveText(content, suffix) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${safeFilename(state.chatName)}-${suffix}.txt`);
}

export function exportTranscript() { saveText(toTranscript(state.messages), 'transcript'); showToast('Transcript export prepared.', 'success'); }
export function exportSelected() {
  const messages = selectedMessages();
  if (!messages.length) { showToast('Select one or more messages first.', 'info'); return; }
  saveText(toTranscript(messages), 'selected-messages'); showToast(`${messages.length} selected messages exported.`, 'success');
}
export function exportBookmarks() {
  const messages = state.messages.filter(message => state.bookmarks.has(message.id));
  const payload = { chat: state.chatName, exportedAt: new Date().toISOString(), bookmarks: messages.map(message => ({ date: new Date(message.timestamp).toISOString(), sender: message.sender, content: message.content, attachments: message.attachments.map(item => item.name) })) };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${safeFilename(state.chatName)}-bookmarks.json`);
}
export function exportStatistics() {
  const stats = state.stats;
  if (!stats) return;
  const payload = { chat: state.chatName, exportedAt: new Date().toISOString(), totalMessages: stats.total, participants: stats.participants, media: stats.typeCounts, firstMessage: new Date(stats.first).toISOString(), lastMessage: new Date(stats.last).toISOString(), busiestDay: stats.busiestDay, busiestMonth: stats.busiestMonth, hourlyActivity: stats.byHour, activityByDay: Object.fromEntries(stats.byDay), activityByMonth: Object.fromEntries(stats.byMonth), averageMessagesPerDay: stats.avgPerDay, mostFrequentWords: stats.topWords };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${safeFilename(state.chatName)}-statistics.json`);
}
export async function exportMediaBundle() {
  if (!state.mediaItems.length) { showToast('There are no matched media files to export.', 'info'); return; }
  if (!window.JSZip) { showToast('The ZIP export engine is unavailable.', 'error'); return; }
  const button = document.querySelector('[data-export="media"]'); if (button) button.disabled = true;
  try {
    const zip = new window.JSZip();
    for (let index = 0; index < state.mediaItems.length; index++) {
      const item = state.mediaItems[index];
      const blob = await extractEntry(state.archive, item.path);
      const prefix = String(index + 1).padStart(4, '0');
      zip.file(`ChatView-Media/${prefix}-${item.name}`, blob);
      if (index % 8 === 0) showToast(`Preparing media bundle · ${index + 1}/${state.mediaItems.length}`, 'info', 1000);
    }
    const result = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } });
    downloadBlob(result, `${safeFilename(state.chatName)}-media.zip`);
    showToast(`Exported ${state.mediaItems.length} matched media files.`, 'success');
  } catch (error) { showToast(`Media export failed: ${error.message}`, 'error'); }
  finally { if (button) button.disabled = false; }
}
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function printTranscript() {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) { showToast('Allow pop-ups to print this transcript.', 'warning'); return; }
  try { popup.opener = null; } catch { /* Some browsers do not expose opener for a new tab. */ }
  const rows = state.messages.map(message => `<article><small>${escapeHTML(new Date(message.timestamp).toLocaleString())} · ${escapeHTML(message.sender || 'System')}</small><p>${escapeHTML(message.content).replace(/\n/g, '<br>')}</p>${(message.attachments || []).map(item => `<em>${item.missing ? 'Missing attachment' : 'Attachment'}: ${escapeHTML(item.name)}</em>`).join('')}</article>`).join('');
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(state.chatName)} — ChatView</title><style>body{font:13px/1.6 Arial,sans-serif;color:#222;max-width:850px;margin:35px auto;padding:0 20px}h1{font:28px Georgia,serif}header{border-bottom:1px solid #ddd;margin-bottom:25px;padding-bottom:15px}article{border-bottom:1px solid #eee;padding:10px 0;break-inside:avoid}small{color:#777}p{white-space:normal;margin:5px 0}em{display:block;color:#777;font-size:11px}@media print{body{margin:0 auto}}</style></head><body><header><h1>${escapeHTML(state.chatName)}</h1><p>Exported with ChatView · ${state.messages.length.toLocaleString()} messages</p></header>${rows}</body></html>`);
  popup.document.close(); popup.focus(); popup.print();
}

export function openExportMenu() {
  document.getElementById('exportMenu')?.remove();
  const button = $('#exportBtn'); const rect = button.getBoundingClientRect();
  const menu = document.createElement('div'); menu.id = 'exportMenu'; menu.className = 'context-menu export-menu';
  const options = [
    ['transcript', 'Export full transcript (.txt)'],
    ['selected', `Export selected messages (${state.selectedMessages.size})`],
    ['media', 'Download matched media (.zip)'],
    ['bookmarks', 'Export bookmarks (.json)'],
    ['stats', 'Export conversation statistics'],
    ['print', 'Print conversation']
  ];
  options.forEach(([key, label]) => {
    const item = document.createElement('button'); item.textContent = label; item.dataset.export = key;
    if (key === 'media' && !state.mediaItems.length) item.disabled = true;
    if (key === 'selected' && !state.selectedMessages.size) item.disabled = true;
    item.addEventListener('click', async () => {
      menu.remove();
      if (key === 'transcript') exportTranscript();
      if (key === 'selected') exportSelected();
      if (key === 'media') await exportMediaBundle();
      if (key === 'bookmarks') exportBookmarks();
      if (key === 'stats') exportStatistics();
      if (key === 'print') printTranscript();
    });
    menu.append(item);
  });
  menu.style.position = 'fixed'; menu.style.top = `${Math.min(window.innerHeight - 250, rect.bottom + 8)}px`; menu.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
  document.body.append(menu);
  requestAnimationFrame(() => {
    const close = event => { if (!menu.contains(event.target) && event.target !== button) { menu.remove(); document.removeEventListener('pointerdown', close); } };
    document.addEventListener('pointerdown', close);
  });
}
