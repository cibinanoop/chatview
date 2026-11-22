import { state } from '../core/state.js';
import { jumpToMessage } from '../chat/chat-manager.js';

const $ = selector => document.querySelector(selector);
let debounceTimer, worker = null, requestId = 0, searchGeneration = 0, pending = new Map(), indexedChatId = '';
let searchFilters = { from: '', to: '', participant: '' };
let displayedResults = [];
let selectedResultIndex = -1;

function getWorker() {
  if (worker || !('Worker' in window)) return worker;
  try {
    worker = new Worker(new URL('../workers/search-worker.js', import.meta.url), { type: 'module' });
    indexedChatId = '';
    worker.addEventListener('message', event => {
      const data = event.data || {};
      if (data.type === 'indexed') return;
      const resolve = pending.get(data.id);
      if (!resolve) return;
      pending.delete(data.id);
      if (data.error) resolve(null); else resolve(data.indices);
    });
    worker.addEventListener('error', () => { worker?.terminate(); worker = null; for (const resolve of pending.values()) resolve(null); pending.clear(); });
  } catch { worker = null; }
  return worker;
}

function indexMessages() {
  const instance = getWorker();
  if (!instance) return;
  indexedChatId = state.chatId;
  instance.postMessage({ type: 'index', messages: state.messages });
}

function matches(message, query, filter, index, options) {
  const attachments = message.attachments || [];
  if (filter === 'link' && !message.hasLink) return false;
  if (filter === 'system' && !message.isSystem) return false;
  if (['image','video','audio','document'].includes(filter) && !attachments.some(item => filter === 'document' ? ['document','file'].includes(item.kind) : item.kind === filter)) return false;
  if (options.from && message.date && message.date < options.from) return false;
  if (options.to && message.date && message.date > options.to) return false;
  if ((options.from || options.to) && !message.date) return false;
  if (options.participant && message.sender !== options.participant) return false;
  const haystack = `${message.content || ''}\n${message.sender || ''}\n${attachments.map(item => item.name).join('\n')}`.toLocaleLowerCase();
  return !query || haystack.includes(query);
}

export function searchMessages(query = '', filter = state.activeFilter, options = searchFilters) {
  const needle = query.trim().toLocaleLowerCase();
  const results = [];
  for (let index = 0; index < state.messages.length; index++) if (matches(state.messages[index], needle, filter, index, options)) results.push({ message: state.messages[index], index });
  return results;
}

function requestSearch(query, filter) {
  const instance = getWorker();
  const options = { ...searchFilters };
  if (!instance) return Promise.resolve(searchMessages(query, filter, options));
  if (indexedChatId !== state.chatId) indexMessages();
  const id = ++requestId;
  return new Promise(resolve => {
    pending.set(id, indices => resolve(indices === null ? searchMessages(query, filter, options) : indices.map(index => ({ message: state.messages[index], index })).filter(item => item.message)));
    instance.postMessage({ type: 'search', id, query, filter, ...options });
  });
}

function renderResults(results, query, filter) {
  const panel = $('#searchResults');
  if (!panel) return;
  displayedResults = results;
  if (selectedResultIndex >= results.length) selectedResultIndex = -1;
  if (!state.messages.length || (!query.trim() && filter === 'all' && !searchFilters.from && !searchFilters.to && !searchFilters.participant)) { panel.hidden = true; panel.replaceChildren(); return; }
  panel.hidden = false; panel.replaceChildren();
  const head = document.createElement('div'); head.className = 'search-results-head';
  const label = document.createElement('span'); label.textContent = `${results.length.toLocaleString()} ${query.trim() ? 'matches' : 'messages'}`;
  const controls = document.createElement('div'); controls.className = 'search-result-navigation';
  const position = document.createElement('span'); position.className = 'search-result-position'; position.textContent = selectedResultIndex < 0 ? `${results.length.toLocaleString()} found` : `${selectedResultIndex + 1} / ${results.length.toLocaleString()}`;
  const previous = document.createElement('button'); previous.type = 'button'; previous.dataset.resultNav = '-1'; previous.setAttribute('aria-label','Previous search result'); previous.textContent = '↑'; previous.disabled = !results.length;
  const next = document.createElement('button'); next.type = 'button'; next.dataset.resultNav = '1'; next.setAttribute('aria-label','Next search result'); next.textContent = '↓'; next.disabled = !results.length;
  const close = document.createElement('button'); close.className = 'text-button'; close.textContent = 'Clear'; close.addEventListener('click', clearSearch);
  controls.append(position, previous, next, close); head.append(label, controls); panel.append(head);
  if (!results.length) { const empty = document.createElement('div'); empty.className = 'empty-inline'; empty.textContent = 'No messages match these search filters.'; panel.append(empty); return; }
  const fragment = document.createDocumentFragment();
  for (const [resultIndex, { message }] of results.slice(0, 60).entries()) {
    const button = document.createElement('button'); button.className = `search-result${resultIndex === selectedResultIndex ? ' is-current' : ''}`; button.dataset.messageId = message.id; button.dataset.resultIndex = String(resultIndex); button.setAttribute('aria-current', resultIndex === selectedResultIndex ? 'true' : 'false');
    const meta = document.createElement('strong'); meta.textContent = `${message.sender || 'System'} · ${new Date(message.timestamp).toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' })}`;
    const body = document.createElement('span'); body.textContent = message.content || `[${message.type}]`;
    button.append(meta, body); fragment.append(button);
  }
  panel.append(fragment);
  if (results.length > 60) { const more = document.createElement('div'); more.className = 'empty-inline'; more.textContent = `Showing first 60 of ${results.length.toLocaleString()} results`; panel.append(more); }
}

function selectResult(index) {
  if (!displayedResults.length) return;
  selectedResultIndex = (index + displayedResults.length) % displayedResults.length;
  const result = displayedResults[selectedResultIndex];
  if (!result) return;
  const button = $('#searchResults')?.querySelector(`[data-result-index="${selectedResultIndex}"]`);
  button?.scrollIntoView({ block: 'nearest' });
  $('#searchResults')?.querySelectorAll('.search-result').forEach(item => {
    const selected = Number(item.dataset.resultIndex) === selectedResultIndex;
    item.classList.toggle('is-current', selected); item.setAttribute('aria-current', String(selected));
  });
  const position = $('#searchResults .search-result-position');
  if (position) position.textContent = `${selectedResultIndex + 1} / ${displayedResults.length.toLocaleString()}`;
  jumpToMessage(result.message.id, $('#searchInput')?.value || '');
}

export async function runSearch() {
  clearTimeout(debounceTimer);
  selectedResultIndex = -1;
  debounceTimer = setTimeout(async () => {
    const generation = ++searchGeneration;
    const query = $('#searchInput')?.value || '';
    state.searchQuery = query;
    const results = await requestSearch(query, state.activeFilter);
    if (generation !== searchGeneration) return;
    state.searchResults = results.map(item => item.message.id);
    renderResults(results, query, state.activeFilter);
  }, 120);
}

function clearSearch() {
  $('#searchInput').value = ''; $('#searchFrom').value = ''; $('#searchTo').value = ''; $('#searchParticipant').value = '';
  searchFilters = { from: '', to: '', participant: '' }; state.searchQuery = ''; state.activeFilter = 'all';
  document.querySelectorAll('.filter-chip').forEach(item => item.classList.toggle('is-active', item.dataset.filter === 'all'));
  runSearch();
}

function populateParticipants() {
  const select = $('#searchParticipant');
  if (!select) return;
  const previous = select.value;
  select.replaceChildren(new Option('Any participant', ''));
  state.participants.forEach(person => select.add(new Option(person.name, person.name)));
  if (state.participants.some(person => person.name === previous)) select.value = previous;
}

export function setupSearch() {
  $('#searchInput')?.addEventListener('input', runSearch);
  $('#searchFilterToggle')?.addEventListener('click', () => {
    const panel = $('#searchFilters'); panel.hidden = !panel.hidden;
    $('#searchFilterToggle').setAttribute('aria-expanded', String(!panel.hidden));
  });
  $('#searchResults')?.addEventListener('click', event => {
    const navigation = event.target.closest('[data-result-nav]');
    if (navigation) {
      const direction = Number(navigation.dataset.resultNav);
      selectResult(selectedResultIndex < 0 ? (direction > 0 ? 0 : displayedResults.length - 1) : selectedResultIndex + direction);
      return;
    }
    const result = event.target.closest('[data-message-id]');
    if (result) { selectedResultIndex = Number(result.dataset.resultIndex); selectResult(selectedResultIndex); }
  });
  $('#filterList')?.addEventListener('click', async event => {
    const chip = event.target.closest('[data-filter]'); if (!chip) return;
    state.activeFilter = chip.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach(item => item.classList.toggle('is-active', item === chip));
    await runSearch();
  });
  ['searchFrom','searchTo','searchParticipant'].forEach(id => $(`#${id}`)?.addEventListener('change', event => {
    searchFilters = { from: $('#searchFrom').value, to: $('#searchTo').value, participant: $('#searchParticipant').value };
    if (searchFilters.from && searchFilters.to && searchFilters.from > searchFilters.to) { [searchFilters.from, searchFilters.to] = [searchFilters.to, searchFilters.from]; $('#searchFrom').value = searchFilters.from; $('#searchTo').value = searchFilters.to; }
    runSearch();
  }));
  $('#clearSearchFilters')?.addEventListener('click', clearSearch);
  window.addEventListener('chatview:import-complete', () => { indexMessages(); populateParticipants(); searchFilters = { from: '', to: '', participant: '' }; });
  window.addEventListener('chatview:reset', () => { indexedChatId = ''; searchFilters = { from: '', to: '', participant: '' }; populateParticipants(); });
  window.addEventListener('keydown', event => {
    const target = event.target, editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); $('#searchInput')?.focus(); $('#searchInput')?.select(); }
    if (event.key === 'Escape' && !editing) { clearSearch(); $('#searchResults').hidden = true; }
  });
}
