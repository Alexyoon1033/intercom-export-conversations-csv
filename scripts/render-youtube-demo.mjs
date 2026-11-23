import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { execFile } from 'node:child_process';

const rootDir = path.resolve('c:/YDW/AI/Antigravity/chatvault-intercom-exporter');
const siteDir = path.join(rootDir, 'site');
const outDir = path.join(rootDir, 'dist', 'youtube-demo');
fs.mkdirSync(outDir, { recursive: true });

const chromeBin = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

// Narration scenes matching YOUTUBE_DEMO_SCRIPT.md (~2m 15s crisp B2B engineering walkthrough)
const SCENES = [
  {
    id: 'scene1_hero',
    urlPath: '/index.html',
    caption: 'Intercom CSV Export Missing Message Text — Solved Locally',
    narration:
      "If you have ever exported conversations from Intercom's reporting dashboard, you already know the limitation. The built-in CSV export only gives you ticket metadata columns, like IDs, timestamps, and tags, without the actual customer messages, agent replies, or internal teammate notes. Today I will show you how to export complete conversation transcripts locally in your browser to Clean Excel CSV, NDJSON, or Obsidian Markdown using ChatVault, with zero backend servers."
  },
  {
    id: 'scene2_workstation_ready',
    urlPath: '/_demo_step2.html',
    caption: 'Dedicated Local Workstation & 500-Chat Sandbox Mode',
    narration:
      "ChatVault runs inside a dedicated browser tab so it never hits extension timeout limits. Even before creating an Intercom access token, you can test the exact output format with the built-in 500-conversation B2B support sandbox. Notice the direct-to-disk streaming option using File System Writable File Stream. It flushes every 50 conversations straight to your drive so browser memory stays under 30 megabytes even on 100,000 conversations."
  },
  {
    id: 'scene3_workstation_running',
    urlPath: '/_demo_step3.html',
    caption: 'Live Rate-Limit Guard & 50-Chat IndexedDB Checkpoints',
    narration:
      "Watch the live telemetry panel as conversations stream in. ChatVault monitors Intercom's X-RateLimit-Remaining header on every request. Whenever remaining calls drop below 20, it pauses automatically until the reset timestamp and recovers cleanly from HTTP 429 responses. Every 50 conversations, it saves your pagination cursor and completed IDs to IndexedDB, so if your laptop sleeps or Wi-Fi drops, you can resume from the exact ticket with one click."
  },
  {
    id: 'scene4_transcript_ledger',
    urlPath: '/_demo_step4.html',
    caption: 'Clean Excel CSV (UTF-8 BOM + 32K Guard) & Separated Internal Notes',
    narration:
      "Once finished, all 500 full transcripts are written cleanly to disk. Messy HTML tags like paragraph and break elements are stripped into readable plain text. Public customer replies are kept separate from amber-flagged internal teammate notes. Every CSV includes a UTF-8 byte order mark so Korean, Japanese, and European characters open cleanly in Microsoft Excel, along with a 32,000 character cell safety guard."
  },
  {
    id: 'scene5_token_and_cta',
    urlPath: '/_demo_step5.html',
    caption: '60-Second Read-Only Token Setup & Free 50-Chat Live Export',
    narration:
      "To export your own workspace, create a read-only Internal Integration token in Intercom Developer Hub with only Read Conversations enabled. Paste it in and click Verify Token. ChatVault automatically detects US, EU, and AU hosting regions, and zero bytes ever leave your browser. Try the 500-chat sandbox and export up to 50 live Intercom conversations completely free using the links in the description below."
  }
];

// Create scene HTML snapshots
const wsBase = fs.readFileSync(path.join(siteDir, 'workstation.html'), 'utf8');

// Scene 2: Workstation ready with sandbox button highlighted
const s2 = wsBase.replace(
  'id="runSandboxDemoBtn" class="btn btn-primary"',
  'id="runSandboxDemoBtn" class="btn btn-primary" style="outline: 3px solid #10b981; outline-offset: 3px;"'
);
fs.writeFileSync(path.join(siteDir, '_demo_step2.html'), s2, 'utf8');

// Scene 3: Mid-export at 250 / 500 with rate-limit guard active & checkpoint logs
const s3 = wsBase
  .replace('<strong id="statExportedCount" class="stat-value">0</strong>', '<strong id="statExportedCount" class="stat-value">250</strong>')
  .replace('<strong id="statTotalCount" class="stat-value">0</strong>', '<strong id="statTotalCount" class="stat-value">500</strong>')
  .replace('<strong id="statBytesWritten" class="stat-value">0 B</strong>', '<strong id="statBytesWritten" class="stat-value">371.4 KB</strong>')
  .replace('<span id="streamModePill" class="pill">Idle</span>', '<span id="streamModePill" class="pill" style="color:#10b981;border-color:rgba(16,185,129,0.4)">Direct-to-Disk Stream (&lt;30MB RAM)</span>')
  .replace('style="width: 0%"', 'style="width: 50%"')
  .replace('class="dot dot-ok"', 'class="dot dot-wait"')
  .replace(
    'X-RateLimit-Remaining monitor active (throttles automatically below 20 remaining calls)',
    'Rate-Limit Guard Active: X-RateLimit-Remaining=14 (<20 safety threshold) — Pausing 0.6s...'
  )
  .replace(
    '<div class="log-entry">[System] Workstation ready. Run the 500-chat sandbox export or verify an Intercom access token.</div>',
    `<div class="log-entry">[10:14:01] Starting 500-Chat Interactive Sandbox Demo (Format: CSV, Summary Mode)...</div>
     <div class="log-entry log-success">[10:14:02] IndexedDB Checkpoint saved (50 conversations flushed to disk).</div>
     <div class="log-entry log-success">[10:14:03] IndexedDB Checkpoint saved (150 conversations flushed to disk).</div>
     <div class="log-entry log-warn">[10:14:04] Rate-Limit Guard: Simulated Intercom X-RateLimit-Remaining=14 (<20) (waiting 600ms)</div>
     <div class="log-entry log-success">[10:14:05] IndexedDB Checkpoint saved (250 conversations flushed to disk).</div>`
  );
fs.writeFileSync(path.join(siteDir, '_demo_step3.html'), s3, 'utf8');

// Scene 4: Completed 500 / 500 with cleaned transcript ledger preview scrolled into view
const s4 = wsBase
  .replace('<strong id="statExportedCount" class="stat-value">0</strong>', '<strong id="statExportedCount" class="stat-value">500</strong>')
  .replace('<strong id="statTotalCount" class="stat-value">0</strong>', '<strong id="statTotalCount" class="stat-value">500</strong>')
  .replace('<strong id="statBytesWritten" class="stat-value">0 B</strong>', '<strong id="statBytesWritten" class="stat-value">742.9 KB</strong>')
  .replace('<span id="streamModePill" class="pill">Idle</span>', '<span id="streamModePill" class="pill" style="color:#10b981;border-color:rgba(16,185,129,0.4)">Completed &middot; 500/500</span>')
  .replace('style="width: 0%"', 'style="width: 100%"')
  .replace(
    '<div class="log-entry">[System] Workstation ready. Run the 500-chat sandbox export or verify an Intercom access token.</div>',
    `<div class="log-entry log-success">[10:14:05] IndexedDB Checkpoint saved (450 conversations flushed to disk).</div>
     <div class="log-entry log-success">[10:14:06] Export completed: 500 full conversation transcripts (742.9 KB) saved to chatvault-sandbox-500-demo.csv via disk-stream.</div>`
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
       <div class="preview-item-header">#950003 &middot; [Veloce Logistics] Annual invoice VAT reverse-charge update (EU &middot; open)</div>
       <div class="preview-msg">[USER] Ji-Hoon Park: Please add EU VAT ID SK2020998877 to invoice #INV-2026-1104 (한국어 UTF-8 테스트 / Slovenčina / 日本語).</div>
       <div class="preview-msg note">[INTERNAL NOTE] Alex Rivera: VIES VAT check passed. Reissuing zero-rated reverse-charge invoice PDF.</div>
     </div>`
  )
  .replace('<div class="sandbox-callout">', '<div class="sandbox-callout" style="display:none">');
fs.writeFileSync(path.join(siteDir, '_demo_step4.html'), s4, 'utf8');

// Scene 5: Read-only token verified in EU region + Pricing/CTA
const s5 = wsBase
  .replace('id="workspaceVerifyStatus" class="status-callout hidden"', 'id="workspaceVerifyStatus" class="status-callout status-ok"')
  .replace(
    '<div id="workspaceVerifyStatus" class="status-callout status-ok"></div>',
    '<div id="workspaceVerifyStatus" class="status-callout status-ok">Verified! Workspace: Acme EU Production (EU Region &middot; https://api.eu.intercom.io) &middot; Total Conversations: 18,420</div>'
  )
  .replace('placeholder="dG9r..."', 'value="dG9r_read_only_intercom_v2_11_token"')
  .replace('<option value="EU">EU (api.eu.intercom.io)</option>', '<option value="EU" selected>EU (api.eu.intercom.io)</option>');
fs.writeFileSync(path.join(siteDir, '_demo_step5.html'), s5, 'utf8');

const server = http.createServer((req, res) => {
  let u = req.url.split('?')[0];
  if (u === '/') u = '/index.html';
  let fp = path.join(siteDir, u);
  if (!fs.existsSync(fp) && fs.existsSync(fp + '.html')) fp = fp + '.html';
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const ext = path.extname(fp);
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png' }[ext] || 'text/plain';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(fs.readFileSync(fp));
});

await new Promise((resolve) => server.listen(8792, resolve));

function runAsync(bin, args, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${bin} failed: ${err.message}\n${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

async function capture1080p(url, outPath) {
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chatvault-yt-'));
  try {
    await runAsync(chromeBin, [
      '--headless=new',
      `--user-data-dir=${tmpProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1920,1080',
      `--screenshot=${outPath}`,
      url
    ], 25000);
  } finally {
    fs.rmSync(tmpProfile, { recursive: true, force: true });
  }
}

try {
  const segmentPaths = [];
  for (const scene of SCENES) {
    const imgPath = path.join(outDir, `${scene.id}.png`);
    const audioPath = path.join(outDir, `${scene.id}.wav`);
    const segPath = path.join(outDir, `${scene.id}.mp4`);

    console.log(`Rendering 1080p frame for ${scene.id}...`);
    await capture1080p(`http://127.0.0.1:8792${scene.urlPath}`, imgPath);

    console.log(`Synthesizing voiceover for ${scene.id} via Windows SAPI5...`);
    const psScript = [
      'Add-Type -AssemblyName System.Speech;',
      '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
      '$enVoice = ($synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "en-*" } | Select-Object -First 1);',
      'if ($enVoice) { $synth.SelectVoice($enVoice.VoiceInfo.Name); }',
      '$synth.Rate = 1;',
      `$synth.SetOutputToWaveFile('${audioPath.replace(/'/g, "''")}');`,
      `$synth.Speak('${scene.narration.replace(/'/g, "''")}');`,
      '$synth.Dispose();'
    ].join(' ');
    await runAsync('powershell', ['-NoProfile', '-Command', psScript], 30000);

    console.log(`Encoding MP4 segment for ${scene.id} via ffmpeg...`);
    await runAsync('ffmpeg', [
      '-y',
      '-loop', '1',
      '-i', imgPath,
      '-i', audioPath,
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      segPath
    ], 60000);

    segmentPaths.push(segPath);
  }

  const concatListPath = path.join(outDir, 'concat.txt');
  fs.writeFileSync(
    concatListPath,
    segmentPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
    'utf8'
  );

  const finalVideoPath = path.join(rootDir, 'dist', 'ChatVault-Intercom-Exporter-Demo-1080p.mp4');
  console.log(`Concatenating final 1080p YouTube demo video -> ${finalVideoPath}...`);
  await runAsync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    finalVideoPath
  ], 60000);

  const stat = fs.statSync(finalVideoPath);
  console.log(`SUCCESS: Generated ${finalVideoPath} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
} finally {
  server.close();
  for (const tmp of ['_demo_step2.html', '_demo_step3.html', '_demo_step4.html', '_demo_step5.html']) {
    const p = path.join(siteDir, tmp);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
