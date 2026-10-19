# Partnership system source documents

This folder keeps the source material needed to maintain the relay trainer
inside the repository, independently of chat attachments or temporary files.

| Source | Retained original | Searchable version |
|---|---|---|
| Dappleton Collaboration (3) | [main-notes.docx](main-notes.docx) | [Paragraphs P0001 onwards](main-notes.txt) |
| Reordering Opener’s Rebid | [reordering-openers-rebid.docx](reordering-openers-rebid.docx) | [Paragraphs R0001 onwards](reordering-openers-rebid.txt) |
| Phil’s 30 July minor-relay email | [Email content and source map](july-relay-email.md) | Same Markdown transcription |

The Word files are unchanged originals. The email was supplied as six
screenshots in **Practice relay bidding**; the retained transcription separates
literal rules from derived bid tables and interpretation. The original email
file and its screenshots are not available in the current workspace. No email
headers or dates beyond those visible in that source have been invented.

The reordering document supplements the main notes and controls the rebid
auctions it explicitly revises. The July email replaces the corresponding
older Bourke/fourth-suit sections. Subsequent explicit partnership clarifications
take precedence over either document. Conflicts and practice-only policies are
recorded in the implementation source reviews, rather than edited into an
original document.

Paragraph identifiers count blank paragraphs so existing P/R references remain
stable. Searchable extracts omit trailing paragraph whitespace and use LF line
endings. Run `python scripts/extract-system-notes.py` from the repository root to
refresh extracts and [manifest.json](manifest.json), which records file sizes
and SHA-256 hashes. This script does not alter the originals.

Implementation reviews: [main source review](../relay-source-review.md),
[club source map](../relay-club-source.md),
[advanced relays](../relay-advanced-source.md), and
[reordered rebids](../relay-reordering-source.md).

For readable bid tables start at the [system-table index](../relay-system/README.md).
The [coverage file](../relay-system/coverage.md) identifies implemented entries,
practice policies and remaining source transcription.
