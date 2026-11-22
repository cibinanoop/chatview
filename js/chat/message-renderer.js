import { state } from '../core/state.js';
import { getSettings } from '../core/settings.js';
import { extractEntry, mimeType } from '../import/zip-reader.js';
import { formatBytes } from '../import/media-matcher.js';

export async function attachmentURL(attachment) {
  if (!state.archive || attachment.missing || !attachment.path) return null;
  if (state.archive.urls.has(attachment.path)) return state.archive.urls.get(attachment.path);
  const blob = await extractEntry(state.archive, attachment.path);
  const url = URL.createObjectURL(blob);
  state.archive.urls.set(attachment.path, url);
  return url;
}

function initials(name = '') { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?'; }
function avatarFor(name) {
  const data = getSettings().avatars?.[name];
  if (data) return `<not-used>`;
  return initials(name);
}
function appendMessageText(container, content) {
  const regex = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/giu;
  let last = 0;
  let match;
  while ((match = regex.exec(content))) {
    container.append(document.createTextNode(content.slice(last, match.index)));
    const anchor = document.createElement('a');
    const raw = match[0].replace(/[),.!?]+$/, '');
    anchor.textContent = raw;
    anchor.href = raw.startsWith('www.') ? `https://${raw}` : raw;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    container.append(anchor);
    container.append(document.createTextNode(match[0].slice(raw.length)));
    last = regex.lastIndex;
  }
  container.append(document.createTextNode(content.slice(last)));
}

function createAudioWave() {
  const wave = document.createElement('span');
  wave.className = 'audio-wave';
  for (let i = 0; i < 24; i++) {
    const bar = document.createElement('i');
    bar.style.setProperty('--h', `${4 + ((i * 7 + 3) % 13)}px`);
    wave.append(bar);
  }
  return wave;
}

function attachmentCard(attachment) {
  const card = document.createElement('div');
  card.className = `message-attachment ${attachment.kind === 'audio' ? 'voice-note-card' : ''}`;
  card.dataset.attachmentId = attachment.id;
  if (attachment.missing) {
    card.classList.add('missing-attachment'); card.setAttribute('aria-disabled', 'true');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.innerHTML = '<use href="#i-info"></use>';
    const box = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = 'Attachment unavailable';
    const small = document.createElement('small'); small.textContent = attachment.name; box.append(strong, small); card.append(icon, box); return card;
  }
  if (attachment.kind === 'image') {
    card.setAttribute('role', 'button'); card.tabIndex = 0; card.setAttribute('aria-label', `Open image ${attachment.name}`);
    const image = document.createElement('img'); image.className = 'attachment-image'; image.alt = attachment.name; image.loading = 'lazy'; image.dataset.mediaPath = attachment.path; card.append(image);
    const label = document.createElement('div'); label.className = 'attachment-image-caption'; label.textContent = attachment.name; card.append(label);
  } else if (attachment.kind === 'video') {
    const video = document.createElement('video'); video.className = 'attachment-video'; video.preload = 'metadata'; video.playsInline = true; video.controls = true; video.dataset.mediaPath = attachment.path; card.append(video);
    const label = document.createElement('div'); label.className = 'attachment-file';
    const icon = document.createElement('span'); icon.className = 'attachment-file-icon'; icon.innerHTML = '<svg><use href="#i-play"/></svg>';
    const copy = document.createElement('span'); const name = document.createElement('strong'); name.textContent = attachment.name;
    const meta = document.createElement('small'); meta.textContent = `${formatBytes(attachment.size)} · Video`; copy.append(name, meta); label.append(icon, copy); card.append(label);
  } else if (attachment.kind === 'audio') {
    const audio = document.createElement('audio'); audio.preload = 'metadata'; audio.dataset.mediaPath = attachment.path; audio.hidden = true; card.append(audio);
    const controls = document.createElement('div'); controls.className = 'voice-note-controls'; controls.dataset.inlineAudio = '';
    const play = document.createElement('button'); play.type = 'button'; play.className = 'audio-play'; play.setAttribute('aria-label', 'Play voice note'); play.innerHTML = '<svg><use href="#i-play"/></svg>';
    const detail = document.createElement('div'); detail.className = 'voice-note-detail';
    const progress = document.createElement('input'); progress.className = 'voice-note-progress'; progress.type = 'range'; progress.min = '0'; progress.max = '1000'; progress.value = '0'; progress.setAttribute('aria-label', 'Seek voice note');
    const timing = document.createElement('div'); timing.className = 'voice-note-timing';
    const current = document.createElement('span'); current.textContent = '0:00';
    const duration = document.createElement('span'); duration.textContent = '—:—'; timing.append(current, duration);
    const name = document.createElement('div'); name.className = 'voice-note-name'; name.textContent = attachment.name;
    detail.append(progress, timing, name);
    const speed = document.createElement('button'); speed.type = 'button'; speed.className = 'voice-note-speed'; speed.textContent = '1×'; speed.setAttribute('aria-label', 'Change playback speed');
    const open = document.createElement('button'); open.type = 'button'; open.className = 'voice-note-open'; open.dataset.openAudio = ''; open.title = 'Open full audio player'; open.setAttribute('aria-label', 'Open full audio player'); open.innerHTML = '<svg><use href="#i-maximize"/></svg>';
    controls.append(play, detail, speed, open); card.append(controls);
    const clock = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '—:—';
    let rateIndex = 0; const rates = [1, 1.5, 2];
    play.addEventListener('click', async event => { event.stopPropagation(); try { if (audio.paused) await audio.play(); else audio.pause(); } catch { play.setAttribute('aria-label', 'Playback unavailable in this browser'); } });
    audio.addEventListener('play', () => { document.querySelectorAll('.voice-note-card audio').forEach(other => { if (other !== audio) other.pause(); }); play.innerHTML = '<svg><use href="#i-pause"/></svg>'; play.setAttribute('aria-label', 'Pause voice note'); card.classList.add('is-playing'); });
    audio.addEventListener('pause', () => { play.innerHTML = '<svg><use href="#i-play"/></svg>'; play.setAttribute('aria-label', 'Play voice note'); card.classList.remove('is-playing'); });
    audio.addEventListener('loadedmetadata', () => { progress.disabled = !Number.isFinite(audio.duration); duration.textContent = clock(audio.duration); });
    audio.addEventListener('timeupdate', () => { current.textContent = clock(audio.currentTime); if (Number.isFinite(audio.duration) && audio.duration) progress.value = String(Math.round(audio.currentTime / audio.duration * 1000)); });
    audio.addEventListener('ended', () => { audio.currentTime = 0; });
    progress.addEventListener('click', event => event.stopPropagation());
    progress.addEventListener('input', event => { event.stopPropagation(); if (Number.isFinite(audio.duration)) audio.currentTime = Number(progress.value) / 1000 * audio.duration; });
    speed.addEventListener('click', event => { event.stopPropagation(); rateIndex = (rateIndex + 1) % rates.length; audio.playbackRate = rates[rateIndex]; speed.textContent = `${rates[rateIndex]}×`; });
  } else {
    card.setAttribute('role', 'button'); card.tabIndex = 0; card.setAttribute('aria-label', `Open document ${attachment.name}`);
    const wrap = document.createElement('div'); wrap.className = 'attachment-file';
    const icon = document.createElement('span'); icon.className = 'attachment-file-icon'; icon.innerHTML = '<svg><use href="#i-file"/></svg>';
    const info = document.createElement('span'); const title = document.createElement('strong'); title.textContent = attachment.name;
    const meta = document.createElement('small'); meta.textContent = `${formatBytes(attachment.size)} · ${mimeType(attachment.path).split('/')[1] || 'File'}`;
    info.append(title, meta); wrap.append(icon, info); card.append(wrap);
  }
  return card;
}

export function hydrateAttachmentElements(root) {
  for (const element of root.querySelectorAll('[data-media-path]')) {
    const path = element.dataset.mediaPath;
    const attachment = state.mediaItems.find(item => item.path === path);
    if (!attachment) continue;
    attachmentURL(attachment).then(url => {
      if (!url || !element.isConnected) return;
      if (element.tagName === 'IMG') element.src = url;
      else if (element.tagName === 'VIDEO') { element.poster = ''; element.src = url; }
      else if (element.tagName === 'AUDIO') { element.src = url; element.load(); }
    }).catch(() => { element.closest('.message-attachment')?.classList.add('media-load-failed'); });
  }
}

export function createDateDivider(date) {
  const wrap = document.createElement('div');
  wrap.className = 'date-divider';
  const span = document.createElement('span');
  const d = new Date(`${date}T12:00:00`);
  span.textContent = Number.isNaN(d.getTime()) ? date : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  wrap.append(span);
  return wrap;
}

export function renderMessage(message, previous = null) {
  const row = document.createElement('article');
  const settings = getSettings();
  const self = settings.selfParticipant || '';
  const outgoing = Boolean(self && message.sender === self && !message.isSystem);
  const grouped = previous && previous.sender === message.sender && previous.date === message.date && !previous.isSystem && !message.isSystem && (message.timestamp - previous.timestamp) < 5 * 60 * 1000;
  row.className = `message-row ${message.isSystem ? 'system' : outgoing ? 'outgoing' : 'incoming'}${state.bookmarks.has(message.id) ? ' is-bookmarked' : ''}${state.pins.has(message.id) ? ' is-pinned' : ''}${state.selectedMessages.has(message.id) ? ' is-selected' : ''}`;
  row.dataset.messageId = message.id;
  if (message.isSystem) {
    const pill = document.createElement('div'); pill.className = 'message-system-pill';
    appendMessageText(pill, message.content || 'System event'); row.append(pill); return row;
  }
  if (!outgoing && !grouped) {
    const avatar = document.createElement('div'); avatar.className = 'message-gutter-avatar';
    const avatarData = settings.avatars?.[message.sender];
    if (avatarData) { const img = document.createElement('img'); img.src = avatarData; img.alt = ''; avatar.append(img); }
    else avatar.textContent = initials(message.sender);
    row.append(avatar);
  } else if (!outgoing) {
    const spacer = document.createElement('div'); spacer.className = 'message-gutter-avatar'; spacer.style.visibility = 'hidden'; row.append(spacer);
  } else {
    const spacer = document.createElement('div'); spacer.className = 'message-gutter-avatar'; spacer.style.visibility = 'hidden'; row.append(spacer);
  }
  const bubble = document.createElement('div'); bubble.className = 'message-bubble';
  if (!outgoing && !grouped && state.participants.length > 2) {
    const sender = document.createElement('div'); sender.className = 'message-sender'; sender.textContent = message.sender || 'Unknown'; bubble.append(sender);
  }
  const body = document.createElement('div'); body.className = 'message-text'; appendMessageText(body, message.content); bubble.append(body);
  for (const attachment of message.attachments || []) bubble.append(attachmentCard(attachment));
  const meta = document.createElement('div'); meta.className = 'message-meta';
  const time = document.createElement('span'); time.textContent = new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); meta.append(time);
  bubble.append(meta);
  const actions = document.createElement('div'); actions.className = 'message-actions';
  const bookmark = document.createElement('button'); bookmark.className = 'bookmark-action'; bookmark.dataset.action = 'bookmark'; bookmark.title = 'Bookmark'; bookmark.innerHTML = '<svg><use href="#i-star"/></svg>';
  const pin = document.createElement('button'); pin.className = 'pin-action'; pin.dataset.action = 'pin'; pin.title = 'Pin in ChatView'; pin.innerHTML = '<svg><use href="#i-pin"/></svg>';
  actions.append(bookmark, pin); bubble.append(actions);
  row.append(bubble);
  return row;
}
