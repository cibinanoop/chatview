# Architecture

ChatView is a static, client-side ES-module application. The GitHub Pages host serves HTML, CSS, JavaScript, SVG assets and a local JSZip distribution; it does not receive imported archives.

## Import pipeline

1. `zip-reader.js` opens the ZIP with the bundled JSZip 3.10.1 implementation.
2. Archive entries are scanned and checked for path traversal, file-count, per-file size, expanded-size and compression-ratio limits.
3. The highest-scoring transcript `.txt` candidate is decoded (UTF-8 / UTF-16, with a Windows-1252 fallback).
4. `whatsapp-parser.js` recognises timestamped message headers and appends continuation lines to the current message.
5. `media-matcher.js` extracts explicit attachment filenames and matches exact normalised basenames. Duplicate and missing matches are recorded; fuzzy matches are intentionally not attempted.
6. `import-manager.js` publishes the reconstructed conversation to the application state.

## Runtime modules

- `core/state.js`: in-memory application state and change notifications.
- `core/settings.js`: theme, wallpaper, date preference, local avatars and reader preferences.
- `core/storage.js`: optional IndexedDB archive storage and bookmark records.
- `chat/`: message DOM construction, incremental history loading, participant details and timeline navigation.
- `search/`: sender/content search and media/system filters.
- `media/`: on-demand extraction to Blob URLs and the media viewer.
- `features/`: local archive analytics, bookmarks, transcript/media/statistics exports.
- `ui/`: non-blocking toast notifications.

## Large conversation handling

Only a window of messages is present in the DOM at once. ChatView begins with the newest 180 messages and loads older batches when the reader reaches the top. The full parsed message metadata remains in memory to support search, statistics and exact timeline jumps.

Media blobs are extracted from the in-memory ZIP only when a preview is requested. Blob URLs are cached for the active archive and revoked when that archive is replaced or the workspace is reset.

## Extension points

The message object is intentionally extensible. Keep parsing and UI metadata separate; do not store rendered HTML in the archive model. New import formats should produce the same message schema and attachment references so that search, analytics and exports remain format-independent.
