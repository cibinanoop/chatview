import { calculateAnalytics } from '../features/analytics.js';
self.addEventListener('message', event => {
  const { id, messages, mediaItems, participants } = event.data || {};
  try { self.postMessage({ id, stats: calculateAnalytics(messages || [], mediaItems || [], participants || []) }); }
  catch (error) { self.postMessage({ id, error: error.message || 'Could not calculate conversation insights.' }); }
});
