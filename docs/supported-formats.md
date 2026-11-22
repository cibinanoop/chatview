# Supported formats

## Import

| Input | Support |
| --- | --- |
| WhatsApp ZIP export | Direct import; transcript found recursively |
| WhatsApp TXT transcript | Direct import; no media payload |
| UTF-8 / UTF-16 text | BOM-aware decoding |
| 12-hour / 24-hour time | Supported |
| DD/MM/YY, DD/MM/YYYY, MM/DD/YYYY | Supported; ambiguous dates can be set in Preferences |
| Multiline messages, emoji, Malayalam | Preserved as Unicode text |

## Attachment categories

| Category | Extensions | Preview |
| --- | --- | --- |
| Images | JPG, JPEG, PNG, GIF, WebP; HEIC/HEIF may depend on browser | Inline thumbnail and viewer |
| Video | MP4, MOV, 3GP, M4V, WebM | Browser-native video controls |
| Audio | OPUS, OGG, MP3, M4A, AAC, AMR, WAV, 3GA | Browser-native audio controls; codec-dependent |
| Documents | PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, VCF, ZIP, RAR, CSV | PDF/text preview where possible; download otherwise |

A media file is associated only when an attachment filename is explicitly present in the transcript and exactly matches one archive entry by normalised basename. When multiple archive entries share the same basename, the match is marked ambiguous and not attached.

## Known WhatsApp export omissions

Some WhatsApp exports contain placeholders such as “Media omitted” or “This message was deleted” without the original file name or payload. ChatView cannot recover those files. Browser codec support may also vary for formats such as AMR, OPUS, HEIC and MOV.
