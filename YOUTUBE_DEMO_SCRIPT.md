# YouTube 3-Minute Demo Recording Script (Step 8 Inbound Funnel)

- **Recommended Title:** `How to Export Full Intercom Conversations & Message Text to CSV (No 300-Limit, 100% Local)`
- **Target URL to Screen-Record:** `https://chatvault-exporter.pages.dev/workstation` (or the installed Chrome Extension tab)
- **Total Runtime:** ~2m 45s – 3m 00s (0€ cost, 0 real customer PII exposed)

---

## Scene-by-Scene Script

### 0:00 – 0:25 | The Problem (Show Intercom's Missing Text Limitation)
- **Screen:** Open `https://chatvault-exporter.pages.dev/` (Asymmetric split hero showing the `full_transcript` vs `internal_notes_transcript` ledger table).
- **Narration:**
  > "If you have ever exported conversations from Intercom's reporting dashboard, you already know the issue: the built-in CSV export only gives you metadata columns—ticket IDs, timestamps, tags—without the actual customer messages, agent replies, or internal notes. Today I will show you how to export complete conversation transcripts locally in your browser to Clean Excel CSV, NDJSON, or Obsidian Markdown without writing scripts or uploading customer data to any third-party server."

### 0:25 – 1:15 | Live 500-Chat Export Demo (No Token Required)
- **Screen:** Click **"Open workstation & 500-chat sandbox"** (`https://chatvault-exporter.pages.dev/workstation`).
- **Action:**
  1. Show the **Output format** dropdown (`Clean CSV — Summary Mode / Detailed Mode`, `Structured NDJSON`, `Obsidian / RAG Markdown`).
  2. Point to **"Stream directly to disk (`FileSystemWritableFileStream`)"** explaining that every 50 conversations flush straight to disk so RAM stays under 30 MB even on 100,000+ chats.
  3. Click **"Run 500-chat sandbox export"**.
- **Narration:**
  > "Before you even create an Intercom token, you can test the exact output structure using the built-in 500-conversation B2B sandbox dataset. Watch the telemetry panel on the right: it tracks exported chats, bytes written, automatically saves an IndexedDB checkpoint every 50 conversations so you can resume if your Wi-Fi drops, and automatically pauses when Intercom's `X-RateLimit-Remaining` header drops below 20."

### 1:15 – 2:00 | Inspecting the Clean Excel CSV & Separated Internal Notes
- **Screen:** Scroll down to **"4. Cleaned transcript ledger preview"** and open the downloaded `chatvault-sandbox-500-demo-*.csv` in Microsoft Excel (or VS Code / Google Sheets).
- **Action:** Highlight:
  1. Zero raw `<p>` / `<br>` HTML tags.
  2. Public `full_transcript` cleanly separated from `internal_notes_transcript`.
  3. Multi-language UTF-8 characters (`한국어`, `Slovenčina`, `日本語`) opening without garbled symbols thanks to the UTF-8 BOM (`\uFEFF`) and 32,000-character Excel cell guard.

### 2:00 – 2:35 | Connecting a Live Intercom Workspace in 60 Seconds (US / EU / AU)
- **Screen:** Show **"1. Intercom API v2.11 connection"** and the **"Read-only token setup (60s)"** panel.
- **Narration:**
  > "To export your own workspace, create a read-only Internal Integration token in Intercom Developer Hub with only Read Conversations and Read Admins enabled. Paste it here and click Verify Token—ChatVault automatically detects whether your workspace is hosted in the US, EU, or AU region. Zero bytes are ever sent to any developer server."

### 2:35 – 2:55 | Free 50-Chat Trial & Call to Action
- **Narration:**
  > "You can try the 500-chat sandbox right now and export up to 50 live conversations from your own Intercom workspace completely free to verify 100% compatibility. All links to the Chrome extension, web workstation, and GitHub API v2.11 technical guide are in the description below."

---

## YouTube Description Box (Copy-Paste Ready)

```text
Export 100% full Intercom conversation transcripts, customer replies, and internal teammate notes directly to disk as Clean Excel CSV, NDJSON (.jsonl), or Obsidian/RAG Markdown (.md) — running 100% locally in your browser with zero backend servers.

Links:
• Live Web Workstation & 500-Chat Sandbox (No Token Needed): https://chatvault-exporter.pages.dev/workstation
• Chrome Web Store Extension: https://chromewebstore.google.com/detail/ejjialbdkhkphnlappeoiblihcmpkhmd
• Intercom API v2.11 Technical Guide: https://chatvault-exporter.pages.dev/guide-missing-message-text
• Pro License ($49 Standard / $129 Agency, One-Time): https://ydwizzle.gumroad.com/l/intercom-exporter
• Privacy Policy (Zero-Server Local Execution): https://chatvault-exporter.pages.dev/privacy

Disclaimer: Independent third-party utility. Not affiliated with, endorsed, or sponsored by Intercom, Inc.
```
