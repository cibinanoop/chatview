const KEY = 'chatview.preferences.v2';
const defaults = {
  theme: 'light',
  wallpaper: 'linen',
  dateFormat: 'auto',
  selfParticipant: '',
  persistArchive: false,
  compact: false,
  avatars: {},
  groupAvatar: null
};
let current = { ...defaults };

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    current = { ...defaults, ...saved, avatars: saved.avatars || {} };
  } catch {
    current = { ...defaults };
  }
  applySettings();
  return current;
}
export function getSettings() { return current; }
export function updateSetting(key, value) {
  current = { ...current, [key]: value };
  persist();
  applySettings();
  window.dispatchEvent(new CustomEvent('chatview:settings', { detail: { key, value, settings: current } }));
}
export function updateAvatar(name, dataUrl) {
  current.avatars = { ...current.avatars, [name]: dataUrl };
  persist();
}
export function updateGroupAvatar(dataUrl) {
  current.groupAvatar = dataUrl;
  persist();
}
export function resetSettings() {
  current = { ...defaults };
  persist();
  applySettings();
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* Browser storage may be disabled or full. */ }
}
export function applySettings() {
  const theme = current.theme === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : current.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.wallpaper = current.wallpaper;
  document.body.classList.toggle('compact-mode', Boolean(current.compact));
}
