# ChatVault: Intercom Conversation Transcript & CSV Exporter (API v2.11 Guide & Local Workstation)

> **Disclaimer:** Independent third-party utility and technical reference. Not affiliated with, endorsed, or sponsored by Intercom, Inc.

Intercom's dashboard CSV export outputs ticket metadata columns (conversation ID, timestamps, assignee, tag names, SLA timers) without customer messages, agent replies, or internal teammate notes.

This repository documents the **Intercom REST API v2.11 N+1 cursor pagination model**, the **10-second rate-limit header protocol**, real **sample exports (Excel UTF-8 BOM CSV, Detailed CSV, NDJSON, Obsidian Markdown)** in [`/samples`](./samples), and links to the **100% local browser workstation**.

- **Live Web Workstation & 500-Chat Interactive Sandbox (No Token Required):** https://chatvault-exporter.pages.dev/workstation
- **Full Technical Article:** https://chatvault-exporter.pages.dev/guide-missing-message-text
- **Chrome Web Store Extension:** https://chromewebstore.google.com/detail/ejjialbdkhkphnlappeoiblihcmpkhmd
- **Privacy Policy (Zero-Server Architecture):** https://chatvault-exporter.pages.dev/privacy

---

## 1. Why the List Endpoint Omits Conversation Threads (`N+1` Architecture)

In Intercom REST API `v2.11`, `GET /conversations?per_page=150` returns summary records that include only the opening `source.body`. Subsequent customer replies, teammate responses, and internal notes live inside `conversation_parts.conversation_parts` (up to **500 parts per ticket**), requiring a detail request per conversation ID:

```http
# Step A: Paginate conversation summaries using starting_after cursor
GET https://api.intercom.io/conversations?per_page=150&starting_after={cursor}
Authorization: Bearer <READ_ONLY_TOKEN>
Intercom-Version: 2.11
Accept: application/json

# Step B: Fetch full transcript and internal notes per conversation ID
GET https://api.intercom.io/conversations/{conversation_id}?display_as=html
Authorization: Bearer <READ_ONLY_TOKEN>
Intercom-Version: 2.11
```

### Regional API Gateways (US, EU, AU)
- **US:** `https://api.intercom.io`
- **EU:** `https://api.eu.intercom.io`
- **AU:** `https://api.au.intercom.io`

---

## 2. Rate-Limit Control & Failure Modes at 10,000+ Tickets

- **Header-driven throttling:** Inspect `X-RateLimit-Remaining` on every response. When it drops below `20`, pause until `X-RateLimit-Reset` (UNIX epoch seconds).
- **HTTP 429 recovery:** Honor `Retry-After` seconds with exponential backoff.
- **Fault-tolerant 404/403 skipping:** Log deleted (`404`) or restricted (`403`) conversations in `skipped_errors` instead of aborting the batch.
- **Browser OOM defense:** Concatenating 30,000+ HTML transcripts into a single JS string or Blob hits V8's UTF-16 heap ceiling. ChatVault flushes every 50 conversations directly to disk via `FileSystemWritableFileStream` (`<30 MB` RAM ceiling) and persists the active `starting_after` cursor to `IndexedDB`.
- **Excel 32,767-char cell overflow & UTF-8 BOM:** Strip HTML tags (`<p>`, `<br>`, `<a>`, `<li>`), truncate single cells at `32,000` characters, escape per RFC 4180, and prefix UTF-8 BOM (`\uFEFF`) so multi-language text opens cleanly in Microsoft Excel.

---

## 3. Sample Output Files

- [`samples/sample-intercom-25-chats-summary.csv`](./samples/sample-intercom-25-chats-summary.csv) — 1 row per conversation (`full_transcript` + dedicated `internal_notes_transcript` column)
- [`samples/sample-intercom-10-chats-detailed-parts.csv`](./samples/sample-intercom-10-chats-detailed-parts.csv) — 1 row per message part, reply, or internal note
- [`samples/sample-intercom-10-chats.jsonl`](./samples/sample-intercom-10-chats.jsonl) — Structured NDJSON with both raw HTML and cleaned plain text
- [`samples/sample-intercom-10-chats-obsidian-rag.md`](./samples/sample-intercom-10-chats-obsidian-rag.md) — Obsidian / RAG Markdown with YAML frontmatter

---

## 4. Local Unit & Integration Tests

```bash
node --test tests/chatvault.test.mjs
```

All 14 automated tests cover HTML sanitization, UTF-8 BOM, 32,000-character cell guards, US/EU/AU auto-detection, cursor pagination, HTTP 429 backoff, 404/403 skipping, Gumroad 4-fold license verification + 5xx outage grace extension, and IndexedDB checkpoint save/resume integrity.
