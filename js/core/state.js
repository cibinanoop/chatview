export const state = {
  archive: null,
  messages: [],
  participants: [],
  chatName: '',
  chatId: '',
  activeFilter: 'all',
  searchQuery: '',
  searchResults: [],
  selectedMessages: new Set(),
  bookmarks: new Set(),
  pins: new Set(),
  currentMessageIndex: -1,
  currentViewerIndex: -1,
  mediaItems: [],
  importBusy: false,
  readingIndex: -1,
  stats: null
};

const listeners = new Set();
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function notify(change = 'state') {
  for (const listener of listeners) listener(change, state);
}
export function resetConversation() {
  state.archive = null;
  state.messages = [];
  state.participants = [];
  state.chatName = '';
  state.chatId = '';
  state.activeFilter = 'all';
  state.searchQuery = '';
  state.searchResults = [];
  state.selectedMessages = new Set();
  state.bookmarks = new Set();
  state.pins = new Set();
  state.currentMessageIndex = -1;
  state.currentViewerIndex = -1;
  state.mediaItems = [];
  state.readingIndex = -1;
  state.stats = null;
  notify('reset');
}
