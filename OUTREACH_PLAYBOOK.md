# Organic Community & Migration Traffic Playbook (Non-Spam, High-Intent)

> **Golden Rule:** Never drop bare promo links on Reddit (`r/SaaS`, `r/CustomerSuccess`) or Quora where spam filters immediately shadowban or auto-collapse posts. Always lead with a **complete, genuinely helpful technical answer** explaining Intercom REST API v2.11 (`N+1` `conversation_parts`, `POST /conversations/search` filters, `X-RateLimit-Remaining` header backoff), and include only **1 plain reference link** to the open technical guide (`https://github.com/Alexyoon1033/intercom-export-conversations-csv`) or Security Factsheet (`https://chatvault-exporter.pages.dev/security-factsheet`).

---

## Target Communities & High-Intent Search Queries

1. **Intercom Community Forum (`community.intercom.com`)**
   - Queries: `"export full conversations csv"`, `"export message text"`, `"csv missing body"`, `"export internal notes"`
2. **Zendesk / Help Scout / HubSpot Community Forums**
   - Queries: `"migrating from intercom"`, `"export intercom history before canceling"`, `"intercom backup csv"`
3. **StackOverflow (`stackoverflow.com`)**
   - Queries: `[intercom] export conversations csv`, `[intercom] conversation_parts missing`
4. **IndieHackers / Hacker News ("Ask HN") / SaaS Ops Slack Communities**
   - Queries: `"intercom pricing increase alternative"`, `"leaving intercom backup"`

---

## Copy-Paste Technical Answer Templates (Zero-Spam, Engineer-to-Engineer Tone)

### Template 1: For "Why is Intercom's CSV export missing message text / internal notes?"
```text
Intercom's reporting CSV only exports ticket-level metadata because in REST API v2.11, the list endpoint (`GET /conversations?per_page=150`) only returns the opening `source.body`. Every customer reply, agent message, and internal note (`part_type: "note"`) lives inside `conversation_parts` (up to 500 parts per ticket) and requires an N+1 detail fetch (`GET /conversations/{id}?display_as=html`).

If you only need a specific date window or tag (instead of dumping 50k+ old tickets), route through `POST /conversations/search` with `created_at` epoch timestamps and `tag_ids`, then monitor `X-RateLimit-Remaining` (pause when `< 20` until `X-RateLimit-Reset`) so you don't get hit with HTTP 429 bans.

We documented the exact API v2.11 N+1 query payloads, rate-limit logic, and sample UTF-8 BOM CSV / NDJSON / Markdown outputs in this open guide (plus a 100% browser-local extractor with a free 50-chat export and 500-chat sandbox if you'd rather not maintain a script):
https://github.com/Alexyoon1033/intercom-export-conversations-csv
```

### Template 2: For "Migrating off Intercom (to Zendesk / Help Scout / Crisp) on a budget"
```text
If you don't want to pay $200-$500+ for an automated migration service just to archive your old Intercom history before canceling, you can pull your entire archive locally via Intercom API v2.11 using a read-only Internal Integration token (`Read conversations` + `Read contacts`).

Two pitfalls to watch out for if you script it yourself:
1. EU and AU workspaces return 401 against `api.intercom.io` — you must target `api.eu.intercom.io` or `api.au.intercom.io`.
2. Excel breaks rows if a long email thread cell exceeds 32,767 characters or lacks a UTF-8 BOM (`\uFEFF`), and concatenating 30k+ conversations in memory will OOM a browser tab unless you stream batches directly to disk.

Here is the open API v2.11 architecture breakdown + sample CSV/Markdown files (and a local browser tool with Search API date/tag filtering, IndexedDB resume checkpoints, and a 1-page GDPR Zero-Data Security Factsheet for InfoSec sign-off):
https://github.com/Alexyoon1033/intercom-export-conversations-csv
```
