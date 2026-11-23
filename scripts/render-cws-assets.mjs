import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { execFile } from 'node:child_process';

const rootDir = path.resolve('c:/YDW/AI/Antigravity/chatvault-intercom-exporter');
const siteDir = path.join(rootDir, 'site');
const distDir = path.join(rootDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });

// Temporary promo tile HTML (440x280) with clean unslopped graphite craft aesthetic
const promoHtmlPath = path.join(siteDir, '_promo-tile.html');
fs.writeFileSync(
  promoHtmlPath,
  `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 440px;
    height: 280px;
    overflow: hidden;
    background: #0f1012;
    color: #ededef;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    padding: 24px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border: 1px solid rgba(255,255,255,0.12);
  }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 14px; }
  .logo {
    width: 28px; height: 28px; border-radius: 6px;
    background: #1b1e22; border: 1px solid rgba(255,255,255,0.18);
    display: flex; align-items: center; justify-content: center;
    font-family: monospace; font-size: 12px;
  }
  .tag {
    font-family: monospace; font-size: 11px; color: #10b981;
    background: #15171a; border: 1px solid rgba(16,185,129,0.35);
    padding: 3px 8px; border-radius: 4px;
  }
  h1 { font-size: 20px; font-weight: 600; line-height: 1.28; color: #ededef; margin: 10px 0 6px; }
  p { font-size: 12.5px; color: #a0a4ab; line-height: 1.45; }
  .table-mini {
    background: #15171a;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    padding: 10px 12px;
    font-family: monospace;
    font-size: 11px;
    color: #a0a4ab;
    display: flex;
    justify-content: space-between;
  }
  .table-mini strong { color: #ededef; font-weight: 500; }
</style>
</head>
<body>
  <div class="top">
    <div class="brand"><span class="logo">CV</span><span>ChatVault Exporter</span></div>
    <span class="tag">API v2.11 &middot; Local</span>
  </div>
  <div>
    <h1>Full Conversation Transcript &amp; CSV Exporter</h1>
    <p>Stream customer replies and internal notes directly to disk as Clean Excel CSV, NDJSON, or Markdown. Compatible with Intercom.</p>
  </div>
  <div class="table-mini">
    <span>RAM: <strong>&lt;30 MB</strong></span>
    <span>Checkpoints: <strong>50 chats</strong></span>
    <span>UTF-8 BOM: <strong>Excel 32K</strong></span>
  </div>
</body>
</html>`,
  'utf8'
);

// Start local HTTP server
const server = http.createServer((req, res) => {
  let u = req.url.split('?')[0];
  if (u === '/') u = '/index.html';
  let fp = path.join(siteDir, u);
  if (!fs.existsSync(fp) && fs.existsSync(fp + '.html')) fp = fp + '.html';
  if (!fs.existsSync(fp)) {
    res.writeHead(404);
    res.end('404');
    return;
  }
  const ext = path.extname(fp);
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png' }[ext] || 'text/plain';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(fs.readFileSync(fp));
});

await new Promise((resolve) => server.listen(8791, resolve));

const chromeBin = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function captureScreenshot(url, outPath, width, height) {
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chatvault-chrome-'));
  try {
    await new Promise((resolve, reject) => {
      execFile(
        chromeBin,
        [
          '--headless=new',
          `--user-data-dir=${tmpProfile}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          `--window-size=${width},${height}`,
          `--screenshot=${outPath}`,
          url
        ],
        { timeout: 20000 },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`Chrome capture failed for ${url}: ${err.message}\n${stderr}`));
          } else {
            resolve();
          }
        }
      );
    });
    console.log(`Captured ${outPath} (${fs.statSync(outPath).size} bytes)`);
  } finally {
    fs.rmSync(tmpProfile, { recursive: true, force: true });
  }
}

// Create a pre-populated demo state version of workstation for Screenshot #1 so the screenshot shows 500/500 exported & real transcript ledger rows!
const populatedWsPath = path.join(siteDir, '_workstation-populated.html');
let wsSource = fs.readFileSync(path.join(siteDir, 'workstation.html'), 'utf8');
wsSource = wsSource
  .replace('<strong id="statExportedCount" class="stat-value">0</strong>', '<strong id="statExportedCount" class="stat-value">500</strong>')
  .replace('<strong id="statTotalCount" class="stat-value">0</strong>', '<strong id="statTotalCount" class="stat-value">500</strong>')
  .replace('<strong id="statBytesWritten" class="stat-value">0 B</strong>', '<strong id="statBytesWritten" class="stat-value">742.9 KB</strong>')
  .replace('<span id="streamModePill" class="pill">Idle</span>', '<span id="streamModePill" class="pill" style="color:#10b981;border-color:rgba(16,185,129,0.35)">Direct-to-Disk Stream (&lt;30MB RAM)</span>')
  .replace('style="width: 0%"', 'style="width: 100%"')
  .replace(
    '<div class="log-entry">[System] Workstation ready. Run the 500-chat sandbox export or verify an Intercom access token.</div>',
    `<div class="log-entry">[10:14:01] Connected to B2B SaaS Workspace [EU Region] &middot; Total Conversations: 500</div>
     <div class="log-entry log-success">[10:14:02] IndexedDB Checkpoint saved (150 conversations flushed to disk).</div>
     <div class="log-entry log-warn">[10:14:03] Rate-Limit Guard: X-RateLimit-Remaining=14 (&lt;20 threshold) &middot; Paused 600ms</div>
     <div class="log-entry log-success">[10:14:04] IndexedDB Checkpoint saved (450 conversations flushed to disk).</div>
     <div class="log-entry log-success">[10:14:05] Export completed: 500 full conversation transcripts (742.9 KB) saved to chatvault-intercom-transcripts.csv.</div>`
  )
  .replace(
    '<p class="empty-preview-hint">Run the 500-chat sandbox or a live export to inspect cleaned conversation threads, internal notes, and metadata.</p>',
    `<div class="preview-item">
       <div class="preview-item-header">#950001 &middot; [Acme Cloud Ops] SSO SAML 2.0 assertion error after Okta cert rotation (EU &middot; closed)</div>
       <div class="preview-msg">[USER] Elena Rostova: We rotated our Okta signing certificate this morning and 45 users in our EU workspace are getting SAML_SIGNATURE_MISMATCH.</div>
       <div class="preview-msg note">[INTERNAL NOTE] Sarah Jenkins: Checked tenant eu-west-8841. Cached X.509 cert points to old SHA-1 thumbprint. Flushing Redis SAML cache now.</div>
       <div class="preview-msg">[ADMIN] Sarah Jenkins: I located your workspace and flushed the cached X.509 certificate fingerprint on our SAML gateway.</div>
     </div>
     <div class="preview-item">
       <div class="preview-item-header">#950002 &middot; [Northstar FinTech] Webhook payload retry policy &amp; HTTP 429 rate limit (US &middot; closed)</div>
       <div class="preview-msg">[USER] Marcus Vance: Our ingestion worker occasionally returns HTTP 502 during deploy windows. How many times does your webhook dispatcher retry?</div>
       <div class="preview-msg note">[INTERNAL NOTE] David Kim: Customer is on Growth Annual plan (Workspace #4491). 0 dropped events in the last 24h.</div>
     </div>`
  );
fs.writeFileSync(populatedWsPath, wsSource, 'utf8');

try {
  // 1. Primary 1280x800 Screenshot: Live Workstation with 500/500 Completed Telemetry & Cleaned Transcript Ledger
  await captureScreenshot(
    'http://127.0.0.1:8791/_workstation-populated.html',
    path.join(distDir, 'cws-screenshot-1280x800.png'),
    1280,
    800
  );

  // 2. Secondary 1280x800 Screenshot: Asymmetric Split Hero & Live CSV Transcript Ledger Table
  await captureScreenshot(
    'http://127.0.0.1:8791/index.html',
    path.join(distDir, 'cws-screenshot-2-ledger-1280x800.png'),
    1280,
    800
  );

  // 3. 440x280 Small Promo Tile
  await captureScreenshot(
    'http://127.0.0.1:8791/_promo-tile.html',
    path.join(distDir, 'cws-promo-440x280.png'),
    440,
    280
  );
} finally {
  server.close();
  if (fs.existsSync(promoHtmlPath)) fs.unlinkSync(promoHtmlPath);
  if (fs.existsSync(populatedWsPath)) fs.unlinkSync(populatedWsPath);
}
