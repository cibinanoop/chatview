# ChatView — WhatsApp TXT Chat Reader

A static, browser-only webpage that turns a WhatsApp **Export chat → Without media** `.txt` file into a familiar WhatsApp-style, read-only conversation.

## Files

- `index.html` — page structure
- `styles.css` — responsive chat interface and dark theme
- `app.js` — TXT parser, message rendering, search and clipboard actions

## Run locally

Open `index.html` in a modern browser, then choose your exported `.txt` file. No server, build process, account, or API key is needed.

## Publish on GitHub Pages

1. Create a new GitHub repository.
2. Upload `index.html`, `styles.css`, `app.js`, and `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select `main` and `/ (root)`, then save.
6. Open the published Pages URL. Select your TXT file from the page.

## Features

- WhatsApp-inspired incoming/outgoing message bubbles.
- Supports Unicode text, including Malayalam.
- Parses common WhatsApp date formats (`dd/mm/yy` and `dd-mm-yyyy`), 12-hour and 24-hour time.
- Handles multi-line messages.
- Search across message text and participant names.
- Click a message to copy it; use **Copy chat** for the complete conversation.
- Select which participant represents “you” under the three-dot chat options.
- Responsive layout and optional dark mode.
- File contents are read locally in your browser; the site does not upload or store the chat.

## Notes and limitations

- The webpage is a **read-only viewer**, not a WhatsApp client. It cannot send messages or restore a conversation into WhatsApp.
- Export the chat as a `.txt` file. Media attachments are represented by WhatsApp placeholder text; the original media files are not embedded.
- The default outgoing participant is initially set to the last participant found. Change it using the three-dot menu if needed.
- WhatsApp export formats can vary by phone language and app version. If your export uses a different date format, the parser may need a small adjustment.
- For privacy, use a device and browser you trust. The file is processed in the page and is not sent to a server.

## Privacy

This project contains no analytics, remote scripts, external fonts, or network requests. GitHub Pages hosts only the static webpage files. The TXT conversation is selected and processed on the visitor's own device.
