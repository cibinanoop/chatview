const STOP_WORDS = new Set(['the','and','for','you','that','this','with','are','was','but','not','have','your','what','when','where','how','all','can','will','just','from','they','them','then','there','here','its','our','out','get','got','had','has','did','does','dont','like','about','okay','ok','yes','yeah','too','very','into','one','now','im','i','me','my','we','he','she','it','to','of','in','is','a','an','on','at','as','be','or','if','so','no','do','up','by','am','pm','re','ve','ll','d','s','t','ആണ്','ഇത്','അത്','എന്ന്','എന്നാൽ','ഞാൻ','നിങ്ങൾ','അവൻ','അവൾ','അവർ','ഒരു','ഉണ്ട്','ഇല്ല','എന്ത്','എങ്ങനെ','ഇവിടെ','അവിടെ','എന്റെ','നമ്മൾ','കൂടെ','പിന്നെ','വളരെ']);

export function calculateAnalytics(messages, mediaItems = [], participants = []) {
  if (!messages.length) return null;
  const bySender = new Map(), senderLength = new Map(), byDay = new Map(), byMonth = new Map(), words = new Map(), links = new Map();
  const byHour = Array(24).fill(0), byWeekday = Array(7).fill(0);
  let longest = null, totalLength = 0, datedMessages = 0;
  const perParticipantMedia = new Map();

  for (const message of messages) {
    if (message.sender) {
      bySender.set(message.sender, (bySender.get(message.sender) || 0) + 1);
      senderLength.set(message.sender, (senderLength.get(message.sender) || 0) + (message.content || '').length);
    }
    const date = new Date(message.timestamp);
    if (Number.isFinite(date.getTime())) {
      byHour[date.getHours()]++;
      byWeekday[date.getDay()]++;
    }
    if (message.date) {
      datedMessages++;
      byDay.set(message.date, (byDay.get(message.date) || 0) + 1);
      const month = message.date.slice(0, 7);
      if (month) byMonth.set(month, (byMonth.get(month) || 0) + 1);
    }
    const content = message.content || '';
    totalLength += content.length;
    if (!message.isSystem && (!longest || content.length > longest.length)) longest = { length: content.length, sender: message.sender || '', preview: content.slice(0, 180), timestamp: message.timestamp, messageId: message.id };
    const tokens = content.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
    for (const token of tokens) if (!STOP_WORDS.has(token) && !/^\d+$/u.test(token)) words.set(token, (words.get(token) || 0) + 1);
    for (const match of content.matchAll(/https?:\/\/([^/\s?#]+)/giu)) {
      const domain = match[1].replace(/^www\./i, '').toLocaleLowerCase();
      links.set(domain, (links.get(domain) || 0) + 1);
    }
  }

  for (const item of mediaItems) {
    const message = messages[item.messageIndex];
    if (!message?.sender) continue;
    const row = perParticipantMedia.get(message.sender) || { image: 0, video: 0, audio: 0, document: 0, total: 0 };
    row[item.kind] = (row[item.kind] || 0) + 1;
    row.total++;
    perParticipantMedia.set(message.sender, row);
  }

  const top = map => [...map.entries()].sort((a, b) => b[1] - a[1]);
  const busiestDay = top(byDay)[0], busiestMonth = top(byMonth)[0], busiestWeekday = Math.max(...byWeekday);
  const weekdayIndex = byWeekday.indexOf(busiestWeekday);
  const typeCounts = { image: 0, video: 0, audio: 0, document: 0, file: 0 };
  for (const item of mediaItems) typeCounts[item.kind] = (typeCounts[item.kind] || 0) + 1;
  const orderedMonths = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  const monthlySeries = orderedMonths.slice(-18).map(([month, count]) => ({ month, count }));
  const first = messages[0].timestamp, last = messages[messages.length - 1].timestamp;
  const dateSpan = Math.max(0, Math.round((last - first) / 86400000));
  const activeDays = byDay.size;

  return {
    total: messages.length,
    participants: [...bySender.entries()].map(([name, count]) => ({ name, count, media: perParticipantMedia.get(name) || { image: 0, video: 0, audio: 0, document: 0, total: 0 }, averageLength: Math.round((senderLength.get(name) || 0) / Math.max(1, count)) })).sort((a, b) => b.count - a.count),
    byHour, byWeekday, byDay, byMonth, monthlySeries,
    busiestDay: busiestDay ? { date: busiestDay[0], count: busiestDay[1] } : null,
    busiestMonth: busiestMonth ? { month: busiestMonth[0], count: busiestMonth[1] } : null,
    busiestWeekday: weekdayIndex >= 0 ? { day: new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(2024, 0, 7 + weekdayIndex)), count: busiestWeekday } : null,
    longest,
    topWords: top(words).slice(0, 12),
    topDomains: top(links).slice(0, 8),
    typeCounts,
    first, last, dateSpan, activeDays,
    avgPerDay: activeDays ? messages.length / activeDays : messages.length,
    averageMessageLength: Math.round(totalLength / messages.length),
    peakHour: byHour.indexOf(Math.max(...byHour)),
    datedMessages
  };
}

let analyticsWorker = null;
let analyticsRequest = 0;
const analyticsPending = new Map();

export function calculateAnalyticsInWorker(messages, mediaItems = [], participants = []) {
  if (!('Worker' in globalThis)) return Promise.resolve().then(() => calculateAnalytics(messages, mediaItems, participants));
  try { analyticsWorker ||= new Worker(new URL('../workers/analytics-worker.js', import.meta.url), { type: 'module' }); }
  catch { return Promise.resolve().then(() => calculateAnalytics(messages, mediaItems, participants)); }
  if (!analyticsWorker.onmessage) {
    analyticsWorker.onmessage = event => {
      const { id, stats, error } = event.data || {};
      const resolve = analyticsPending.get(id);
      if (!resolve) return;
      analyticsPending.delete(id);
      resolve(error ? null : stats);
    };
    analyticsWorker.onerror = () => {
      analyticsWorker?.terminate(); analyticsWorker = null;
      for (const resolve of analyticsPending.values()) resolve(null);
      analyticsPending.clear();
    };
  }
  const id = ++analyticsRequest;
  return new Promise(resolve => {
    analyticsPending.set(id, result => resolve(result ?? calculateAnalytics(messages, mediaItems, participants)));
    analyticsWorker.postMessage({ id, messages, mediaItems, participants });
  });
}
