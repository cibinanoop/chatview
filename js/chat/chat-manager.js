import { state, notify } from '../core/state.js';
import { getSettings, updateAvatar, updateGroupAvatar } from '../core/settings.js';
import { renderMessage, createDateDivider, hydrateAttachmentElements } from './message-renderer.js';
import { toggleBookmark, togglePin, saveBookmarks } from '../features/bookmarks.js';
import { formatBytes } from '../import/media-matcher.js';
import { showToast } from '../ui/notifications.js';

const $ = selector => document.querySelector(selector);
let windowStart = 0;
let windowEnd = 0;
let searchHighlightTimer = 0;
const CHUNK_SIZE = 180;

function initials(name = '') { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?'; }
function dateLabel(timestamp, options = {}) { return timestamp ? new Date(timestamp).toLocaleDateString([], options) : '—'; }
function shortNumber(value) { return Intl.NumberFormat(undefined, { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value); }

function buildChunk(start, end) {
  const fragment = document.createDocumentFragment();
  let previous = start > 0 ? state.messages[start - 1] : null;
  for (let i = start; i < end; i++) {
    const message = state.messages[i];
    if (!previous || previous.date !== message.date) fragment.append(createDateDivider(message.date));
    const row = renderMessage(message, previous);
    row.dataset.messageIndex = String(i);
    fragment.append(row);
    previous = message;
  }
  return fragment;
}

function makeOlderControl() {
  if (windowStart <= 0) return null;
  const button = document.createElement('button');
  button.className = 'load-older';
  button.type = 'button';
  button.dataset.action = 'load-older';
  button.innerHTML = '<svg><use href="#i-clock"/></svg><span>Load earlier messages</span>';
  return button;
}

export function renderConversation({ focusIndex = null, toBottom = true } = {}) {
  const list = $('#messagesList');
  const viewport = $('#conversationViewport');
  if (!list || !viewport) return;
  if (!state.messages.length) return;
  if (focusIndex !== null) {
    windowStart = Math.max(0, focusIndex - 65);
    windowEnd = Math.min(state.messages.length, Math.max(windowStart + CHUNK_SIZE, focusIndex + 100));
    windowEnd = Math.min(state.messages.length, windowEnd);
  } else {
    windowEnd = state.messages.length;
    windowStart = Math.max(0, windowEnd - CHUNK_SIZE);
  }
  list.replaceChildren();
  const older = makeOlderControl();
  if (older) list.append(older);
  list.append(buildChunk(windowStart, windowEnd));
  hydrateAttachmentElements(list);
  $('#welcomeScreen').hidden = true;
  viewport.hidden = false;
  $('#conversationStatus').hidden = false;
  $('#statusText').textContent = `${state.messages.length.toLocaleString()} messages · ${state.mediaItems.length.toLocaleString()} matched attachments`;
  $('#statusCount').textContent = `Showing ${windowStart + 1}–${windowEnd}`;
  if (toBottom && focusIndex === null) viewport.scrollTop = viewport.scrollHeight;
  else if (focusIndex !== null) requestAnimationFrame(() => document.querySelector(`[data-message-index="${focusIndex}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  updateScrollButton();
}

export function loadOlderMessages() {
  if (windowStart <= 0) return;
  const list = $('#messagesList');
  const viewport = $('#conversationViewport');
  const newStart = Math.max(0, windowStart - CHUNK_SIZE);
  const previousHeight = viewport.scrollHeight;
  const fragment = document.createDocumentFragment();
  const older = makeOlderControl();
  if (older && newStart > 0) fragment.append(older);
  fragment.append(buildChunk(newStart, windowStart));
  const existingOlder = list.querySelector('.load-older');
  existingOlder?.remove();
  list.prepend(fragment);
  const delta = viewport.scrollHeight - previousHeight;
  viewport.scrollTop += delta;
  windowStart = newStart;
  hydrateAttachmentElements(list);
  $('#statusCount').textContent = `Showing ${windowStart + 1}–${windowEnd}`;
}

export function jumpToMessage(messageId, searchTerm = '') {
  const index = state.messages.findIndex(message => message.id === messageId);
  if (index < 0) return;
  state.currentMessageIndex = index;
  const viewport = $('#conversationViewport');
  if (viewport?.hidden || index < windowStart || index >= windowEnd) renderConversation({ focusIndex: index, toBottom: false });
  const locateAndScroll = attempt => {
    const row = [...document.querySelectorAll('.message-row[data-message-id]')].find(item => item.dataset.messageId === String(messageId));
    if (!row) {
      if (attempt === 0) renderConversation({ focusIndex: index, toBottom: false });
      if (attempt < 4) requestAnimationFrame(() => locateAndScroll(attempt + 1));
      return;
    }
    document.querySelectorAll('.message-row.search-highlight').forEach(item => item.classList.remove('search-highlight'));
    document.querySelectorAll('mark.search-term-match').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent || '')));
    row.classList.remove('search-highlight');
    const needle = searchTerm.trim().toLocaleLowerCase();
    if (needle) for (const textRoot of row.querySelectorAll('.message-text')) {
      const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
      const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const source = node.nodeValue || '', position = source.toLocaleLowerCase().indexOf(needle);
        if (position < 0) continue;
        const fragment = document.createDocumentFragment(); fragment.append(document.createTextNode(source.slice(0, position)));
        const mark = document.createElement('mark'); mark.className = 'search-term-match'; mark.textContent = source.slice(position, position + needle.length);
        fragment.append(mark, document.createTextNode(source.slice(position + needle.length))); node.parentNode?.replaceChild(fragment, node);
      }
    }
    void row.offsetWidth;
    row.classList.add('search-highlight');
    const scrollArea = $('#conversationViewport');
    if (scrollArea) {
      const viewportRect = scrollArea.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const top = scrollArea.scrollTop + rowRect.top - viewportRect.top - (scrollArea.clientHeight - rowRect.height) / 2;
      const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth';
      if (typeof scrollArea.scrollTo === 'function') scrollArea.scrollTo({ top, behavior });
      else scrollArea.scrollTop = top;
    } else row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.clearTimeout(searchHighlightTimer);
    searchHighlightTimer = window.setTimeout(() => {
      row.classList.remove('search-highlight');
      row.querySelectorAll('mark.search-term-match').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent || '')));
    }, 3200);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => locateAndScroll(0)));
}

function updateScrollButton() {
  const viewport = $('#conversationViewport');
  const button = $('#scrollLatest');
  if (!viewport || !button) return;
  const far = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 280;
  button.classList.toggle('is-visible', far);
}

export function setupConversationScrolling() {
  const viewport = $('#conversationViewport');
  viewport?.addEventListener('scroll', () => {
    updateScrollButton();
    if (viewport.scrollTop < 80 && windowStart > 0) loadOlderMessages();
  }, { passive: true });
  $('#scrollLatest')?.addEventListener('click', () => { viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' }); });
  $('#messagesList')?.addEventListener('click', async event => {
    const action = event.target.closest('[data-action]');
    if (action?.dataset.action === 'load-older') { loadOlderMessages(); return; }
    const row = event.target.closest('.message-row');
    if (!row) return;
    const message = state.messages[Number(row.dataset.messageIndex)];
    if (!message) return;
    if (action?.dataset.action === 'bookmark') {
      toggleBookmark(message.id, state); row.classList.toggle('is-bookmarked', state.bookmarks.has(message.id));
      saveBookmarks(state.chatId, state.bookmarks); return;
    }
    if (action?.dataset.action === 'pin') {
      togglePin(message.id, state); row.classList.toggle('is-pinned', state.pins.has(message.id));
      showToast(state.pins.has(message.id) ? 'Pinned in ChatView.' : 'Pin removed.', 'success'); return;
    }
    const attachmentButton = event.target.closest('[data-attachment-id]');
    if (attachmentButton) {
      const attachment = message.attachments.find(item => item.id === attachmentButton.dataset.attachmentId);
      if (event.target.closest('[data-open-audio]') && attachment && !attachment.missing) { window.dispatchEvent(new CustomEvent('chatview:open-media', { detail: { attachment, message } })); return; }
      if (event.target.closest('video,[data-inline-audio]')) return;
      if (attachment && !attachment.missing) window.dispatchEvent(new CustomEvent('chatview:open-media', { detail: { attachment, message } }));
    }
  });
  $('#messagesList')?.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const card = event.target.closest('.message-attachment[role="button"]');
    if (!card) return;
    event.preventDefault();
    const row = card.closest('.message-row');
    const message = state.messages[Number(row?.dataset.messageIndex)];
    const attachment = message?.attachments.find(item => item.id === card.dataset.attachmentId);
    if (attachment && !attachment.missing) window.dispatchEvent(new CustomEvent('chatview:open-media', { detail: { attachment, message } }));
  });

  $('#messagesList')?.addEventListener('contextmenu', event => {
    const row = event.target.closest('.message-row');
    if (!row || row.classList.contains('system')) return;
    event.preventDefault();
    const message = state.messages[Number(row.dataset.messageIndex)];
    window.dispatchEvent(new CustomEvent('chatview:context-menu', { detail: { x: event.clientX, y: event.clientY, message } }));
  });
  let pressTimer;
  let pressTarget;
  $('#messagesList')?.addEventListener('touchstart', event => {
    const row = event.target.closest('.message-row');
    if (!row) return;
    pressTarget = row;
    pressTimer = setTimeout(() => {
      const message = state.messages[Number(pressTarget?.dataset.messageIndex)];
      if (message) window.dispatchEvent(new CustomEvent('chatview:context-menu', { detail: { x: 18, y: Math.min(window.innerHeight - 230, event.touches[0]?.clientY || 200), message } }));
    }, 550);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(name => $('#messagesList')?.addEventListener(name, () => clearTimeout(pressTimer), { passive: true }));
}

export function updateWorkspaceUI() {
  const hasArchive = state.messages.length > 0;
  $('#exportBtn').disabled = !hasArchive;
  $('#mediaGalleryBtn').disabled = !hasArchive || !state.mediaItems.length;
  $('#chatTitle').textContent = hasArchive ? state.chatName : 'Your conversations, beautifully preserved.';
  $('#breadcrumbTitle').textContent = hasArchive ? state.chatName : 'No archive open';
  const first = state.messages[0]?.timestamp;
  const last = state.messages.at(-1)?.timestamp;
  $('#chatSubtitle').textContent = hasArchive
    ? `${state.participants.length} participants · ${state.messages.length.toLocaleString()} messages · ${dateLabel(first, { day: 'numeric', month: 'short', year: 'numeric' })} — ${dateLabel(last, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Import a WhatsApp export to begin exploring';
  $('#sidebarMessageCount').textContent = hasArchive ? shortNumber(state.messages.length) : '—';
  $('#footerStatus').textContent = hasArchive ? `${state.archive?.name || 'Transcript'} · ready` : 'Waiting for an archive';
  $('#welcomeScreen').hidden = hasArchive;
  $('#conversationViewport').hidden = !hasArchive;
  $('#conversationStatus').hidden = !hasArchive;
  $('#inspectorEmpty').hidden = hasArchive;
  $('#inspectorContent').hidden = !hasArchive;
  if (!hasArchive) return;
  const settings = getSettings();
  const groupAvatar = settings.groupAvatar;
  const avatar = $('#chatAvatar');
  avatar.innerHTML = '';
  if (groupAvatar) { const img = document.createElement('img'); img.src = groupAvatar; img.alt = ''; avatar.append(img); }
  else avatar.textContent = initials(state.chatName);
  const sideAvatar = $('#inspectorAvatar');
  sideAvatar.innerHTML = '';
  if (groupAvatar) { const img = document.createElement('img'); img.src = groupAvatar; img.alt = ''; sideAvatar.append(img); }
  else sideAvatar.textContent = initials(state.chatName);
  $('#inspectorChatName').textContent = state.chatName;
  $('#inspectorParticipants').textContent = `${state.participants.length} ${state.participants.length === 1 ? 'participant' : 'participants'}`;
  $('#statMessages').textContent = shortNumber(state.messages.length);
  $('#statAttachments').textContent = shortNumber(state.mediaItems.length);
  $('#statFirst').textContent = dateLabel(first, { day: 'numeric', month: 'short', year: '2-digit' });
  $('#statLast').textContent = dateLabel(last, { day: 'numeric', month: 'short', year: '2-digit' });
  $('#participantCount').textContent = state.participants.length;
  renderParticipants();
  renderMediaMini();
  renderActivity();
  renderInsights();
}

function renderParticipants() {
  const container = $('#participantList');
  container.replaceChildren();
  const total = state.messages.length || 1;
  for (const participant of state.participants.slice(0, 9)) {
    const row = document.createElement('div'); row.className = 'participant-row';
    const avatar = document.createElement('div'); avatar.className = 'participant-avatar';
    const data = getSettings().avatars?.[participant.name];
    if (data) { const img = document.createElement('img'); img.src = data; img.alt = ''; avatar.append(img); }
    else avatar.textContent = initials(participant.name);
    const meta = document.createElement('div'); meta.className = 'participant-meta';
    const name = document.createElement('strong'); name.textContent = participant.name;
    const count = document.createElement('span'); count.textContent = `${participant.count.toLocaleString()} messages`;
    meta.append(name, count);
    const share = document.createElement('span'); share.className = 'participant-share'; share.textContent = `${Math.round(participant.count / total * 100)}%`;
    const change = document.createElement('button'); change.className = 'icon-button tiny'; change.title = 'Assign participant avatar'; change.innerHTML = '<svg><use href="#i-more"/></svg>'; change.dataset.avatarParticipant = participant.name;
    row.append(avatar, meta, share, change); container.append(row);
  }
  if (state.participants.length > 9) { const more = document.createElement('div'); more.className = 'empty-inline'; more.textContent = `+ ${state.participants.length - 9} more participants`; container.append(more); }
}

function renderMediaMini() {
  const grid = $('#mediaMiniGrid'); grid.replaceChildren();
  const counts = $('#mediaCounts'); counts.replaceChildren();
  const media = state.mediaItems.slice(0, 8);
  for (const item of media) {
    const button = document.createElement('button'); button.className = 'media-mini'; button.title = item.name;
    if (item.kind === 'image') {
      const img = document.createElement('img'); img.alt = item.name; img.loading = 'lazy';
      const mediaMessage = state.messages[item.messageIndex];
      button.append(img);
      import('./message-renderer.js').then(module => module.attachmentURL(mediaMessage.attachments.find(a => a.path === item.path))).then(url => { if (url && img.isConnected) img.src = url; }).catch(() => {});
    } else {
      const span = document.createElement('span'); span.innerHTML = `<svg><use href="#${item.kind === 'video' ? 'i-video' : item.kind === 'audio' ? 'i-mic' : 'i-file'}"/></svg>`; button.append(span);
    }
    button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('chatview:open-media', { detail: { attachment: item, message: state.messages[item.messageIndex] } })));
    grid.append(button);
  }
  if (!media.length) { const empty = document.createElement('div'); empty.className = 'empty-inline'; empty.textContent = 'No matched attachments'; grid.append(empty); }
  const kindLabels = [['image', 'Photos'], ['video', 'Videos'], ['audio', 'Audio'], ['document', 'Documents']];
  for (const [kind, label] of kindLabels) {
    const count = state.mediaItems.filter(item => item.kind === kind).length;
    if (!count) continue;
    const pill = document.createElement('span'); pill.className = 'media-count-pill'; pill.textContent = `${count} ${label}`; counts.append(pill);
  }
}

function renderActivity() {
  const container = $('#activityBars'); container.replaceChildren();
  const hourly = state.stats?.byHour || Array(24).fill(0);
  const bins = Array.from({ length: 12 }, (_, i) => hourly[i * 2] + hourly[i * 2 + 1]);
  const max = Math.max(1, ...bins);
  bins.forEach((count, index) => {
    const bar = document.createElement('div'); bar.className = 'activity-bar';
    bar.style.height = `${Math.max(5, count / max * 100)}%`;
    bar.title = `${index * 2}:00–${index * 2 + 2}:00 · ${count} messages`;
    container.append(bar);
  });
}

function renderAdvancedInsights(stats) {
  const root = $('#advancedInsights');
  root.replaceChildren();
  if (!stats) return;
  const summary = document.createElement('div'); summary.className = 'insight-summary-grid';
  const cards = [
    ['Active days', stats.activeDays.toLocaleString()],
    ['Avg. messages / active day', stats.activeDays ? stats.avgPerDay.toFixed(1) : '—'],
    ['Avg. message length', `${stats.averageMessageLength} chars`],
    ['Peak hour', `${String(stats.peakHour).padStart(2, '0')}:00`]
  ];
  for (const [label, value] of cards) {
    const card = document.createElement('div'); card.className = 'insight-summary-card';
    const title = document.createElement('span'); title.textContent = label;
    const number = document.createElement('strong'); number.textContent = value;
    card.append(title, number); summary.append(card);
  }
  root.append(summary);

  const heatSection = document.createElement('section'); heatSection.className = 'advanced-chart-section';
  const heatTitle = document.createElement('h4'); heatTitle.textContent = 'Daily activity over the last year'; heatSection.append(heatTitle);
  const heatmap = document.createElement('div'); heatmap.className = 'activity-heatmap';
  const daily = stats.byDay instanceof Map ? stats.byDay : new Map(Object.entries(stats.byDay || {}));
  const lastDay = new Date(stats.last); lastDay.setHours(12, 0, 0, 0);
  const startDay = new Date(lastDay); startDay.setDate(startDay.getDate() - 364 - lastDay.getDay());
  const maxDay = Math.max(1, ...daily.values());
  for (let offset = 0; offset < 371; offset++) {
    const date = new Date(startDay); date.setDate(startDay.getDate() + offset);
    const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const count = daily.get(iso) || 0;
    const cell = document.createElement('button'); cell.type = 'button'; cell.className = `heat-cell level-${count ? Math.min(4, Math.ceil(count / maxDay * 4)) : 0}`;
    cell.title = `${iso}: ${count.toLocaleString()} messages`; cell.setAttribute('aria-label', cell.title); cell.disabled = !count; heatmap.append(cell);
    if (count) cell.addEventListener('click', () => { const message = state.messages.find(item => item.date === iso); if (message) jumpToMessage(message.id); });
  }
  const heatMeta = document.createElement('div'); heatMeta.className = 'heatmap-meta'; heatMeta.textContent = `${stats.activeDays.toLocaleString()} active days · ${stats.datedMessages.toLocaleString()} dated messages`;
  heatSection.append(heatmap, heatMeta); root.append(heatSection);

  const weekdaySection = document.createElement('section'); weekdaySection.className = 'advanced-chart-section';
  const weekdayTitle = document.createElement('h4'); weekdayTitle.textContent = 'Messages by weekday'; weekdaySection.append(weekdayTitle);
  const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const week = document.createElement('div'); week.className = 'weekday-bars'; const weekMax = Math.max(1, ...stats.byWeekday);
  stats.byWeekday.forEach((value, i) => {
    const col = document.createElement('button'); col.type = 'button'; col.className = 'weekday-col'; col.title = `${weekdayNames[i]}: ${value.toLocaleString()} messages — open a matching message`;
    const bar = document.createElement('i'); bar.style.height = `${Math.max(3, value / weekMax * 100)}%`; bar.title = `${weekdayNames[i]}: ${value.toLocaleString()} messages`;
    const label = document.createElement('span'); label.textContent = weekdayNames[i]; col.append(bar, label); week.append(col);
    col.addEventListener('click', () => { const message = state.messages.find(m => m.date && new Date(`${m.date}T12:00:00`).getDay() === i); if (message) jumpToMessage(message.id); });
  });
  weekdaySection.append(week); root.append(weekdaySection);

  if (stats.monthlySeries.length) {
    const section = document.createElement('section'); section.className = 'advanced-chart-section';
    const title = document.createElement('h4'); title.textContent = 'Monthly activity'; section.append(title);
    const chart = document.createElement('div'); chart.className = 'month-bars'; const max = Math.max(1, ...stats.monthlySeries.map(x => x.count));
    for (const item of stats.monthlySeries) {
      const col = document.createElement('button'); col.type = 'button'; col.className = 'month-col'; col.title = `${item.month}: ${item.count.toLocaleString()} messages — open this month`;
      const bar = document.createElement('i'); bar.style.height = `${Math.max(3, item.count / max * 100)}%`;
      const label = document.createElement('span'); label.textContent = item.month.slice(5); col.append(bar, label); chart.append(col);
      col.addEventListener('click', () => { const message = state.messages.find(m => m.date?.startsWith(item.month)); if (message) jumpToMessage(message.id); });
    }
    section.append(chart); root.append(section);
  }

  const tableSection = document.createElement('section'); tableSection.className = 'advanced-chart-section';
  const title = document.createElement('h4'); title.textContent = 'Participant activity'; tableSection.append(title);
  const table = document.createElement('div'); table.className = 'participant-insight-table';
  for (const person of stats.participants.slice(0, 12)) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'participant-insight-row'; row.title = `Search messages from ${person.name}`;
    const name = document.createElement('span'); name.className = 'participant-insight-name'; name.textContent = person.name;
    const messages = document.createElement('span'); messages.textContent = `${person.count.toLocaleString()} msgs`;
    const media = document.createElement('span'); media.textContent = `${person.media.total.toLocaleString()} media`;
    const share = document.createElement('i'); share.className = 'participant-share-track'; const fill = document.createElement('b'); fill.style.width = `${Math.max(2, person.count / Math.max(1, stats.total) * 100)}%`; share.append(fill);
    row.append(name, messages, media, share); table.append(row);
    row.addEventListener('click', () => { const input = $('#searchInput'); input.value = person.name; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); });
  }
  tableSection.append(table); root.append(tableSection);

  if (stats.topWords.length) {
    const section = document.createElement('section'); section.className = 'advanced-chart-section';
    const title = document.createElement('h4'); title.textContent = 'Frequently used words'; section.append(title);
    const words = document.createElement('div'); words.className = 'insight-word-cloud';
    for (const [word, count] of stats.topWords) { const chip = document.createElement('button'); chip.type = 'button'; chip.textContent = `${word} · ${count}`; chip.title = `Search for ${word}`; chip.addEventListener('click', () => { const input = $('#searchInput'); input.value = word; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }); words.append(chip); }
    section.append(words); root.append(section);
  }
  if (stats.topDomains.length) {
    const section = document.createElement('section'); section.className = 'advanced-chart-section';
    const title = document.createElement('h4'); title.textContent = 'Shared link domains'; section.append(title);
    const list = document.createElement('div'); list.className = 'insight-domain-list';
    for (const [domain, count] of stats.topDomains) { const item = document.createElement('span'); item.textContent = `${domain} (${count})`; list.append(item); }
    section.append(list); root.append(section);
  }
  const note = document.createElement('p'); note.className = 'analytics-note'; note.textContent = 'Counts are calculated from this export on your device. They describe message activity and are not conclusions about participants.'; root.append(note);
}

function renderInsights() {
  const container = $('#quickInsights'); container.replaceChildren();
  const stats = state.stats;
  if (!stats) return;
  renderAdvancedInsights(stats);
  const items = [];
  if (stats.busiestDay) items.push(['i-calendar', `Busiest day was <strong>${dateLabel(new Date(`${stats.busiestDay.date}T12:00:00`).getTime(), { day: 'numeric', month: 'short', year: 'numeric' })}</strong> with ${stats.busiestDay.count.toLocaleString()} messages.`]);
  if (stats.busiestMonth) items.push(['i-spark', `Most active month: <strong>${stats.busiestMonth.month}</strong> (${stats.busiestMonth.count.toLocaleString()} messages).`]);
  if (stats.busiestWeekday) items.push(['i-calendar', `Most active weekday: <strong>${stats.busiestWeekday.day}</strong> (${stats.busiestWeekday.count.toLocaleString()} messages).`]);
  if (stats.longest) items.push(['i-message', `Longest message: <strong>${stats.longest.length.toLocaleString()} characters</strong>${stats.longest.sender ? ` from ${escapeText(stats.longest.sender)}` : ''}.`]);
  if (stats.topWords.length) items.push(['i-spark', `Frequent words: <strong>${stats.topWords.slice(0, 3).map(([word]) => escapeText(word)).join(', ')}</strong>.`]);
  for (const [icon, html] of items) {
    const row = document.createElement('div'); row.className = 'insight-item';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.innerHTML = `<use href="#${icon}"/>`;
    const text = document.createElement('span'); text.innerHTML = html;
    row.append(svg, text); container.append(row);
  }
}

function escapeText(text) { return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

export function setupAvatarControls() {
  $('#chatAvatar')?.addEventListener('click', () => chooseAvatar(null));
  $('#participantList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-avatar-participant]');
    if (button) chooseAvatar(button.dataset.avatarParticipant);
  });
}
function chooseAvatar(participant) {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
  input.addEventListener('change', () => {
    const file = input.files?.[0]; if (!file) return;
    if (file.size > 3 * 1024 * 1024) { showToast('Choose an image smaller than 3 MB.', 'warning'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (participant) updateAvatar(participant, reader.result); else updateGroupAvatar(reader.result);
      updateWorkspaceUI();
      renderConversation({ toBottom: false });
      showToast('Avatar updated on this device.', 'success');
    };
    reader.readAsDataURL(file);
  });
  input.click();
}

export function setupDateNavigation() {
  $('#jumpDateBtn')?.addEventListener('click', () => {
    if (!state.messages.length) return;
    const dateInput = $('#jumpDateInput');
    dateInput.min = state.messages[0].date;
    dateInput.max = state.messages.at(-1).date;
    dateInput.value = state.messages.at(-1).date;
    $('#dateRangeHint').textContent = `Archive range: ${dateInput.min} to ${dateInput.max}`;
    $('#dateModal').hidden = false;
  });
  $('#confirmJumpDateBtn')?.addEventListener('click', () => {
    const target = $('#jumpDateInput').value;
    if (!target) return;
    let best = 0; let bestDistance = Infinity;
    const targetTime = new Date(`${target}T12:00:00`).getTime();
    state.messages.forEach((message, index) => {
      const distance = Math.abs(message.timestamp - targetTime);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    $('#dateModal').hidden = true;
    jumpToMessage(state.messages[best].id);
  });
}
