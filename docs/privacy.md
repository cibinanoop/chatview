# Privacy and local storage

## Processing model

The browser reads the ZIP selected by the user. Parsing, attachment matching, search, analytics, media preview and exports happen in the browser. The application contains no backend endpoint, analytics SDK, advertisement library, login flow or remote media host.

The static site may be served by GitHub Pages, but the imported archive is not sent to GitHub Pages. The browser's service worker caches only application shell assets from the same origin. It does not cache the user's imported conversation or media.

## Optional archive persistence

By default, the imported archive remains in memory for the current page session. When **Restore archive on this device** is enabled, ChatView stores the original ZIP as a Blob in IndexedDB for the current browser profile. The app can then restore the saved ZIP on a later visit.

This is local browser storage, not encrypted cloud storage. Anyone with access to the same unlocked browser profile may be able to access that stored archive. Disable persistence and use **Delete saved archive** or **Reset workspace** on a shared device.

## Imported archive safety

- ZIP entry names are checked for absolute paths and `..` / `.` path components.
- Entry count, expanded size, single-file size and suspicious compression ratios have limits.
- Archive files are never written to a server or extracted to the device filesystem.
- Archive-provided text is inserted as text nodes; ChatView does not execute scripts or HTML from imported messages.
- Media is exposed as local Blob URLs for browser preview and download.

## Browser storage controls

Browser settings can clear IndexedDB and local storage for the site. Clearing site data removes ChatView's saved archive, bookmarks and preferences. A browser private/incognito session usually clears its local data when the session ends.
