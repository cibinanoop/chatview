import { state } from '../core/state.js';
import { attachmentURL } from '../chat/message-renderer.js';
import { jumpToMessage } from '../chat/chat-manager.js';
import { formatBytes } from '../import/media-matcher.js';
import { showToast } from '../ui/notifications.js';

const $ = selector => document.querySelector(selector);
let viewerIndex = -1;
let zoom = 1;
let activeURL = null;

function mediaIndex(attachment) {
  const found = state.mediaItems.findIndex(item => item.path === attachment.path);
  return found >= 0 ? found : 0;
}
function messageFor(item) { return state.messages[item?.messageIndex] || state.messages.find(message => message.id === item?.messageId); }

export async function openMedia(attachment) {
  if (!attachment || attachment.missing) return;
  viewerIndex = mediaIndex(attachment);
  await renderViewer();
  $('#mediaModal').hidden = false;
  document.body.classList.add('modal-open');
}

async function renderViewer() {
  const item = state.mediaItems[viewerIndex];
  if (!item) return;
  const message = messageFor(item);
  const stage = $('#mediaViewerContent');
  stage.replaceChildren();
  zoom = 1;
  $('#zoomInBtn').disabled = item.kind !== 'image';
  $('#zoomOutBtn').disabled = item.kind !== 'image';
  $('#viewerFileName').textContent = item.name;
  $('#viewerFileMeta').textContent = `${item.kind.toUpperCase()} · ${formatBytes(item.size)} · ${new Date(item.timestamp).toLocaleString()}`;
  $('#viewerFileType').textContent = item.kind.toUpperCase();
  $('#viewerCaption').textContent = message?.sender ? `Shared by ${message.sender}` : 'Attachment preview';
  $('#viewerMessageContext').textContent = message ? `${new Date(message.timestamp).toLocaleString()} · Open message in conversation` : '';
  $('#viewerMessageContext').dataset.messageId = message?.id || '';
  $('#viewerPosition').textContent = `${viewerIndex + 1} / ${state.mediaItems.length}`;
  $('#viewerPrev').disabled = viewerIndex <= 0;
  $('#viewerNext').disabled = viewerIndex >= state.mediaItems.length - 1;
  try {
    activeURL = await attachmentURL(item);
    if (!activeURL) throw new Error('Attachment unavailable');
    if (item.kind === 'image') {
      const image = document.createElement('img'); image.src = activeURL; image.alt = item.name; image.draggable = false; stage.append(image);
    } else if (item.kind === 'video') {
      const video = document.createElement('video'); video.src = activeURL; video.controls = true; video.autoplay = false; video.playsInline = true; video.preload = 'metadata'; stage.append(video);
      const note = document.createElement('div'); note.className = 'unsupported-box'; note.textContent = 'If playback is unavailable, this video codec may not be supported by the current browser.'; stage.append(note);
    } else if (item.kind === 'audio') {
      const wrap = document.createElement('div'); wrap.className = 'viewer-audio-wrap';
      const icon = document.createElement('div'); icon.className = 'empty-orb'; icon.innerHTML = '<svg><use href="#i-mic"/></svg>';
      const title = document.createElement('strong'); title.className = 'viewer-audio-title'; title.textContent = item.name;
      const audio = document.createElement('audio'); audio.src = activeURL; audio.controls = true; audio.preload = 'metadata'; audio.style.width = 'min(520px, 80vw)';
      const speedWrap = document.createElement('label'); speedWrap.className = 'viewer-speed'; speedWrap.textContent = 'Playback speed ';
      const speed = document.createElement('select'); speed.innerHTML = '<option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option>';
      speed.addEventListener('change', () => { audio.playbackRate = Number(speed.value); });
      speedWrap.append(speed); wrap.append(icon, title, audio, speedWrap); stage.append(wrap);
    } else if (item.name.toLowerCase().endsWith('.pdf')) {
      const frame = document.createElement('iframe'); frame.src = activeURL; frame.title = item.name; stage.append(frame);
    } else if (/\.(txt|csv|vcf)$/i.test(item.name)) {
      const frame = document.createElement('iframe'); frame.src = activeURL; frame.title = item.name; stage.append(frame);
    } else {
      const box = document.createElement('div'); box.className = 'unsupported-box';
      box.innerHTML = '<svg><use href="#i-file"/></svg><strong>Preview is not available</strong><p>This file type can still be downloaded and opened with an application on your device.</p>';
      stage.append(box);
    }
  } catch (error) {
    const box = document.createElement('div'); box.className = 'unsupported-box';
    const strong = document.createElement('strong'); strong.textContent = 'Could not load this attachment';
    const text = document.createElement('p'); text.textContent = error.message;
    box.append(strong, text); stage.append(box);
  }
}

function closeViewer() {
  $('#mediaModal').hidden = true;
  document.body.classList.remove('modal-open');
  $('#mediaViewerContent').replaceChildren();
}
function stepViewer(direction) {
  const next = viewerIndex + direction;
  if (next < 0 || next >= state.mediaItems.length) return;
  viewerIndex = next;
  renderViewer();
}
function setZoom(value) {
  zoom = Math.min(4, Math.max(.5, value));
  const image = $('#mediaViewerContent img');
  if (image) image.style.transform = `scale(${zoom})`;
}
function downloadCurrent() {
  const item = state.mediaItems[viewerIndex];
  if (!item || !activeURL) return;
  const a = document.createElement('a'); a.href = activeURL; a.download = item.name; document.body.append(a); a.click(); a.remove();
}

export function setupMediaViewer() {
  $('#closeMediaBtn')?.addEventListener('click', closeViewer);
  $('#mediaModal')?.addEventListener('click', event => { if (event.target.id === 'mediaModal') closeViewer(); });
  $('#viewerPrev')?.addEventListener('click', () => stepViewer(-1));
  $('#viewerNext')?.addEventListener('click', () => stepViewer(1));
  $('#zoomInBtn')?.addEventListener('click', () => setZoom(zoom + .25));
  $('#zoomOutBtn')?.addEventListener('click', () => setZoom(zoom - .25));
  $('#downloadMediaBtn')?.addEventListener('click', downloadCurrent);
  $('#fullscreenMediaBtn')?.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('#mediaModal').requestFullscreen?.();
    } catch { showToast('Fullscreen mode is not available in this browser.', 'info'); }
  });
  $('#viewerMessageContext')?.addEventListener('click', event => {
    const id = event.currentTarget.dataset.messageId;
    if (!id) return;
    closeViewer(); jumpToMessage(id);
  });
  $('#mediaViewerContent')?.addEventListener('wheel', event => {
    if (!$('#mediaViewerContent img')) return;
    event.preventDefault(); setZoom(zoom + (event.deltaY < 0 ? .1 : -.1));
  }, { passive: false });
  window.addEventListener('keydown', event => {
    if ($('#mediaModal').hidden) return;
    if (event.key === 'Escape') closeViewer();
    if (event.key === 'ArrowLeft') stepViewer(-1);
    if (event.key === 'ArrowRight') stepViewer(1);
  });
  window.addEventListener('chatview:open-media', event => openMedia(event.detail.attachment));
}

function renderGalleryItems(grid, filter, query, countLabel, criteria = {}) {
  const q = query.trim().toLocaleLowerCase();
  const filtered = state.mediaItems.filter(item => {
    if (filter !== 'all' && !(filter === 'document' ? item.kind === 'document' || item.kind === 'file' : item.kind === filter)) return false;
    if (criteria.participant && (item.sender || messageFor(item)?.sender) !== criteria.participant) return false;
    const date = new Date(item.timestamp || 0).toISOString().slice(0, 10);
    if (criteria.from && date < criteria.from) return false;
    if (criteria.to && date > criteria.to) return false;
    if (!q) return true;
    const message = messageFor(item);
    return `${item.name} ${message?.sender || ''} ${message?.content || ''}`.toLocaleLowerCase().includes(q);
  });
  countLabel.textContent = `${filtered.length} of ${state.mediaItems.length} matched attachments${criteria.timeline ? ' · newest first' : ''}`;
  grid.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('div'); empty.className = 'gallery-empty';
    empty.textContent = q ? 'No media matches that search.' : 'No attachments in this category.'; grid.append(empty); return;
  }
  const items = criteria.timeline ? [...filtered].sort((a, b) => b.timestamp - a.timestamp) : filtered;
  let lastDay = '';
  for (const item of items) {
    const day = new Date(item.timestamp || 0).toISOString().slice(0, 10);
    if (criteria.timeline && day !== lastDay) {
      const divider = document.createElement('div'); divider.className = 'gallery-day-divider'; divider.textContent = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); grid.append(divider); lastDay = day;
    }
    const tile = document.createElement('button'); tile.className = 'gallery-tile'; tile.type = 'button';
    tile.setAttribute('aria-label', `Open ${item.kind}: ${item.name}`); tile.title = item.name;
    if (item.kind === 'image') {
      const image = document.createElement('img'); image.loading = 'lazy'; image.alt = item.name; tile.append(image);
      attachmentURL(item).then(url => { if (url && image.isConnected) image.src = url; }).catch(() => tile.classList.add('media-load-failed'));
    } else {
      const icon = document.createElement('span'); icon.className = 'attachment-file-icon';
      icon.innerHTML = `<svg><use href="#${item.kind === 'video' ? 'i-video' : item.kind === 'audio' ? 'i-mic' : 'i-file'}"/></svg>`;
      tile.append(icon);
    }
    const caption = document.createElement('span'); caption.className = 'gallery-caption'; caption.textContent = item.name;
    const meta = document.createElement('small'); meta.textContent = `${item.kind} · ${item.sender || messageFor(item)?.sender || 'Shared'} · ${new Date(item.timestamp).toLocaleDateString()}`;
    const detail = document.createElement('div'); detail.className = 'gallery-item-meta'; detail.append(caption, meta); tile.append(detail);
    tile.addEventListener('click', () => { document.getElementById('galleryOverlay')?.remove(); openMedia(item); });
    grid.append(tile);
  }
}

export function openMediaGallery() {
  if (!state.mediaItems.length) { showToast('No matched media in this archive.', 'info'); return; }
  const existing = document.getElementById('galleryOverlay');
  if (existing) { existing.remove(); return; }
  const overlay = document.createElement('div'); overlay.className = 'media-gallery-overlay'; overlay.id = 'galleryOverlay';
  const panel = document.createElement('aside'); panel.className = 'gallery-panel';
  const header = document.createElement('div'); header.className = 'inspector-header';
  const heading = document.createElement('div'); heading.innerHTML = '<span class="eyebrow">SHARED IN THIS CHAT</span><h2>Media, links & files</h2>';
  const close = document.createElement('button'); close.className = 'icon-button'; close.innerHTML = '<svg><use href="#i-close"/></svg>'; close.setAttribute('aria-label', 'Close gallery'); close.addEventListener('click', () => overlay.remove());
  header.append(heading, close);
  const search = document.createElement('input'); search.type = 'search'; search.className = 'gallery-search'; search.placeholder = 'Find media by name or message'; search.setAttribute('aria-label', 'Search shared media');
  const refine = document.createElement('div'); refine.className = 'gallery-refine';
  const participant = document.createElement('select'); participant.className = 'gallery-refine-select'; participant.setAttribute('aria-label', 'Filter media by participant');
  participant.add(new Option('All participants', '')); state.participants.forEach(person => participant.add(new Option(person.name, person.name)));
  const from = document.createElement('input'); from.type = 'date'; from.className = 'gallery-date-filter'; from.setAttribute('aria-label', 'Media shared from date');
  const to = document.createElement('input'); to.type = 'date'; to.className = 'gallery-date-filter'; to.setAttribute('aria-label', 'Media shared through date');
  const timeline = document.createElement('button'); timeline.type = 'button'; timeline.className = 'gallery-filter'; timeline.textContent = 'Timeline'; timeline.setAttribute('aria-pressed','false');
  const criteria = { participant: '', from: '', to: '', timeline: false };
  const updateGallery = () => renderGalleryItems(grid, active, search.value, count, criteria);
  participant.addEventListener('change', () => { criteria.participant = participant.value; updateGallery(); });
  from.addEventListener('change', () => { criteria.from = from.value; updateGallery(); });
  to.addEventListener('change', () => { criteria.to = to.value; updateGallery(); });
  timeline.addEventListener('click', () => { criteria.timeline = !criteria.timeline; timeline.setAttribute('aria-pressed', String(criteria.timeline)); timeline.classList.toggle('is-active', criteria.timeline); updateGallery(); });
  refine.append(participant, from, to, timeline);
  const filters = document.createElement('div'); filters.className = 'gallery-filters';
  const grid = document.createElement('div'); grid.className = 'gallery-grid';
  const count = document.createElement('div'); count.className = 'gallery-count';
  let active = 'all';
  const kinds = [['all','All'],['image','Photos'],['video','Videos'],['audio','Audio'],['document','Documents']];
  for (const [kind, label] of kinds) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `gallery-filter${kind === active ? ' is-active' : ''}`;
    button.dataset.kind = kind; button.textContent = `${label}${kind === 'all' ? ` (${state.mediaItems.length})` : ` (${state.mediaItems.filter(item => kind === 'document' ? item.kind === 'document' || item.kind === 'file' : item.kind === kind).length})`}`;
    button.addEventListener('click', () => {
      active = kind; filters.querySelectorAll('button').forEach(el => el.classList.toggle('is-active', el === button));
      updateGallery();
    });
    filters.append(button);
  }
  search.addEventListener('input', updateGallery);
  panel.append(header, search, refine, filters, count, grid); overlay.append(panel);
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  updateGallery();
}
