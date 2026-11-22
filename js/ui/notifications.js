const icons = { success: 'i-check', error: 'i-info', warning: 'i-info', info: 'i-spark' };
export function showToast(message, type = 'info', duration = 3200) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const toast = document.createElement('div'); toast.className = `toast ${type}`;
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.innerHTML = `<use href="#${icons[type] || icons.info}"/>`;
  const text = document.createElement('span'); text.textContent = message;
  toast.append(icon, text); stack.append(toast);
  setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 240); }, duration);
}
