import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsAppText, decodeTextBytes, findAmbiguousDates } from '../js/import/whatsapp-parser.js';

 test('parses a 12-hour WhatsApp export and preserves Unicode', () => {
  const source = '14/11/26, 9:04 pm - Arun: Hello ✨\n14/11/26, 9:05 pm - Meera 🌿: നമസ്കാരം';
  const result = parseWhatsAppText(source);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].sender, 'Arun');
  assert.equal(result.messages[0].content, 'Hello ✨');
  assert.equal(result.messages[1].content, 'നമസ്കാരം');
  const first = new Date(result.messages[0].timestamp);
  assert.equal(first.getHours(), 21);
  assert.equal(first.getDate(), 14);
});

test('parses 24-hour timestamps and multiline messages', () => {
  const source = '14-11-2026, 21:09 - Arun: first line\nsecond line\nthird line\n14-11-2026, 21:10 - Meera: next';
  const result = parseWhatsAppText(source);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].content, 'first line\nsecond line\nthird line');
  assert.equal(new Date(result.messages[0].timestamp).getHours(), 21);
});

test('supports month-first dates when explicitly configured', () => {
  const source = '03/04/2026, 8:15 am - Alex: test';
  const dmy = parseWhatsAppText(source, { dateFormat: 'dmy' }).messages[0];
  const mdy = parseWhatsAppText(source, { dateFormat: 'mdy' }).messages[0];
  assert.equal(new Date(dmy.timestamp).getMonth(), 3);
  assert.equal(new Date(mdy.timestamp).getMonth(), 2);
  assert.deepEqual(findAmbiguousDates(source), ['03/04/2026']);
});

test('recognises iOS bracket headers and system events', () => {
  const source = '[11/14/26, 9:10 PM] Meera: bracketed\n11/14/26, 9:11 pm - Arun joined using this group link';
  const result = parseWhatsAppText(source, { dateFormat: 'mdy' });
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].sender, 'Meera');
  assert.equal(result.messages[1].isSystem, true);
});

test('decodes UTF-16LE BOM text', () => {
  const text = 'Hello Malayalam നമസ്കാരം';
  const encoded = new Uint8Array(2 + text.length * 2);
  encoded[0] = 0xff; encoded[1] = 0xfe;
  for (let i = 0; i < text.length; i++) { encoded[2 + i * 2] = text.charCodeAt(i) & 255; encoded[3 + i * 2] = text.charCodeAt(i) >> 8; }
  assert.equal(decodeTextBytes(encoded), text);
});

test('ignores preamble and returns sender statistics', () => {
  const source = 'Exported chat with Alice\n\n14/11/26, 9:00 pm - Alice: hello\n14/11/26, 9:01 pm - Bob: hi\n14/11/26, 9:02 pm - Alice: bye';
  const result = parseWhatsAppText(source);
  assert.equal(result.messages.length, 3);
  assert.deepEqual(result.participants.map(item => [item.name, item.count]), [['Alice', 2], ['Bob', 1]]);
});

test('matches media only by exact normalised filename and flags duplicate basenames', async () => {
  const { matchMedia } = await import('../js/import/media-matcher.js');
  const source = '14/11/26, 9:04 pm - Arun: IMG-20261114-WA0001.JPG (file attached)\n14/11/26, 9:05 pm - Meera: IMG-20261114-WA0002.jpg (file attached)';
  const messages = parseWhatsAppText(source).messages;
  const result = matchMedia(messages, [
    { path: 'media/IMG-20261114-WA0001.jpg', size: 20 },
    { path: 'one/IMG-20261114-WA0002.jpg', size: 21 },
    { path: 'two/IMG-20261114-WA0002.jpg', size: 22 }
  ]);
  assert.equal(result.media.length, 1);
  assert.equal(messages[0].attachments[0].missing, false);
  assert.equal(messages[1].attachments[0].missing, true);
  assert.equal(result.ambiguous, 1);
});

test('does not treat an image URL as a local attachment filename', async () => {
  const { matchMedia } = await import('../js/import/media-matcher.js');
  const messages = parseWhatsAppText('14/11/26, 9:04 pm - Arun: https://example.com/photo.jpg').messages;
  const result = matchMedia(messages, [{ path: 'photo.jpg', size: 100 }]);
  assert.equal(result.media.length, 0);
  assert.equal(messages[0].attachments.length, 0);
});

test('recognises longer office document extensions without truncating them', async () => {
  const { matchMedia } = await import('../js/import/media-matcher.js');
  const messages = parseWhatsAppText('14/11/26, 9:04 pm - Arun: Proposal.docx (file attached)').messages;
  const result = matchMedia(messages, [{ path: 'docs/Proposal.docx', size: 1234 }]);
  assert.equal(result.media.length, 1);
  assert.equal(result.media[0].kind, 'document');
  assert.equal(result.media[0].name, 'Proposal.docx');
});

test('does not merge messages into the previous one when the chosen date format is invalid', () => {
  const source = '14/11/26, 9:04 pm - Alice: first\n15/11/26, 9:05 pm - Bob: second';
  const result = parseWhatsAppText(source, { dateFormat: 'mdy' });
  assert.equal(result.messages.length, 0);
  assert.equal(result.invalidHeaders, 2);
});
