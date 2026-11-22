const HEADER = /^\u200e?\[?(\d{1,4}[./-]\d{1,2}[./-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)\]?(?:\s+-\s+|\s+)(.*)$/i;
const ATTACHMENT_EXT = '(?:jpe?g|png|gif|webp|mp4|mov|3gp|opus|ogg|mp3|m4a|aac|amr|pdf|docx?|xlsx?|pptx?|txt|vcf|zip|rar)';
const SYSTEM_HINTS = /^(?:messages and calls are end-to-end encrypted|you created this group|you were added|you left|this message was deleted|missed voice call|missed video call|security code changed)/i;

export function decodeTextBytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.length >= 2 && view[0] === 0xff && view[1] === 0xfe) return new TextDecoder('utf-16le').decode(view.subarray(2));
  if (view.length >= 2 && view[0] === 0xfe && view[1] === 0xff) return new TextDecoder('utf-16be').decode(view.subarray(2));
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) return new TextDecoder('utf-8').decode(view.subarray(3));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(view); }
  catch { return new TextDecoder('windows-1252').decode(view); }
}

function parseDate(dateString, format = 'auto') {
  const parts = dateString.split(/[./-]/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  let year, month, day;
  if (String(dateString.split(/[./-]/)[0]).length === 4) {
    [year, month, day] = parts;
  } else {
    let [a, b, c] = parts;
    year = c < 100 ? (c >= 70 ? 1900 + c : 2000 + c) : c;
    let actualFormat = format;
    if (actualFormat === 'auto') {
      if (a > 12 && b <= 12) actualFormat = 'dmy';
      else if (b > 12 && a <= 12) actualFormat = 'mdy';
      else actualFormat = 'dmy';
    }
    if (actualFormat === 'mdy') { month = a; day = b; }
    else { day = a; month = b; }
  }
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function parseTime(timeString) {
  const match = timeString.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const meridiem = match[4]?.toLowerCase();
  if (minute > 59 || second > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  }
  if (hour > 23) return null;
  return { hour, minute, second };
}

function parseHeader(line, dateFormat) {
  const match = line.match(HEADER);
  if (!match) return null;
  const date = parseDate(match[1], dateFormat);
  const time = parseTime(match[2]);
  if (!date || !time) return null;
  const timestamp = new Date(date.year, date.month - 1, date.day, time.hour, time.minute, time.second, 0).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return { timestamp, rest: match[3], date: `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}` };
}

function splitSender(rest) {
  const colon = rest.indexOf(':');
  if (colon > 0 && colon < 90) {
    const candidate = rest.slice(0, colon).trim();
    if (candidate && !candidate.includes('://')) return { sender: candidate, content: rest.slice(colon + 1).replace(/^\s/, ''), isSystem: false };
  }
  return { sender: null, content: rest, isSystem: true };
}

function classifyContent(content, isSystem) {
  if (isSystem || SYSTEM_HINTS.test(content.trim())) return 'system';
  if (/https?:\/\/|www\./i.test(content)) return 'link';
  if (/<Media omitted>|<attached:|\(file attached\)/i.test(content)) return 'media';
  return 'text';
}

export function parseWhatsAppText(rawText, options = {}) {
  const dateFormat = options.dateFormat || 'auto';
  const text = String(rawText ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const messages = [];
  let current = null;
  let invalidHeaders = 0;
  for (const line of lines) {
    const headerCandidate = line.match(HEADER);
    const parsed = parseHeader(line, dateFormat);
    if (parsed) {
      if (current) messages.push(finalize(current, messages.length));
      const split = splitSender(parsed.rest);
      current = {
        timestamp: parsed.timestamp,
        date: parsed.date,
        sender: split.sender,
        content: split.content,
        isSystem: split.isSystem,
        rawTime: line.match(HEADER)?.[2] || ''
      };
    } else if (headerCandidate) {
      // Do not swallow a malformed or misconfigured timestamp into the previous message.
      invalidHeaders += 1;
      if (current) { messages.push(finalize(current, messages.length)); current = null; }
    } else if (current) {
      current.content += `\n${line}`;
    } else if (line.trim()) {
      // Ignore preamble lines until a valid timestamped message is found.
      if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(line)) invalidHeaders += 1;
    }
  }
  if (current) messages.push(finalize(current, messages.length));
  const participants = new Map();
  for (const message of messages) {
    if (message.sender) participants.set(message.sender, (participants.get(message.sender) || 0) + 1);
  }
  const orderedParticipants = [...participants.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { messages, participants: orderedParticipants, invalidHeaders, lineCount: lines.length };
}

function finalize(item, index) {
  const content = item.content.replace(/\u200e/g, '').trimEnd();
  const type = classifyContent(content, item.isSystem);
  const d = new Date(item.timestamp);
  return {
    id: `m-${index}-${item.timestamp.toString(36)}`,
    index,
    timestamp: item.timestamp,
    date: item.date,
    time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    sender: item.sender,
    content,
    type,
    attachments: [],
    isSystem: item.isSystem,
    isMediaMessage: type === 'media',
    hasLink: /https?:\/\/|www\./i.test(content)
  };
}

export function getDateRange(messages) {
  if (!messages.length) return { first: null, last: null };
  return { first: messages[0].timestamp, last: messages[messages.length - 1].timestamp };
}

export function findAmbiguousDates(rawText) {
  const ambiguous = new Set();
  for (const line of String(rawText).split(/\r?\n/)) {
    const match = line.match(HEADER);
    if (!match) continue;
    const [a, b] = match[1].split(/[./-]/).map(Number);
    const firstToken = match[1].split(/[./-]/)[0];
    if (firstToken.length !== 4 && a <= 12 && b <= 12 && a !== b) ambiguous.add(match[1]);
    if (ambiguous.size >= 8) break;
  }
  return [...ambiguous];
}
