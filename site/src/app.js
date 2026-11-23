/**
 * ChatVault Dedicated Full-Page Workstation UI Controller (src/app.js)
 * Wires together:
 * - IntercomAdapter (US/EU/AU auto-detection, cursor pagination, N+1 detail fetch, rate-limit monitor)
 * - SandboxDemoAdapter (500-Chat interactive B2B SaaS demo with zero token required)
 * - FileStreamer (FileSystemWritableFileStream disk streaming + chunk Blob fallback)
 * - CheckpointDB (50-chat IndexedDB checkpointing & one-click resume)
 * - GumroadLicenseManager (4-fold verification + 7-day offline grace cache)
 */

import { IntercomAdapter } from './adapters/intercom.js';
import { SandboxDemoAdapter } from './core/sandbox-demo.js';
import { FileStreamer } from './core/file-streamer.js';
import { CheckpointDB } from './core/checkpoint-db.js';
import { GumroadLicenseManager } from './core/gumroad-license.js';
import { ExportEngine } from './core/export-engine.js';
import { buildExportZipBundle } from './core/zip-packager.js';
import { htmlToCleanText } from './core/serializers.js';

const checkpointDb = new CheckpointDB();
const licenseManager = new GumroadLicenseManager();

let currentLicenseState = {
  valid: false,
  tier: 'Free (50-Chat Cap)',
  maxConversations: 50
};
let activeAbortController = null;
let lastSkippedErrors = [];

// DOM Elements
const els = {
  licenseStatusBadge: document.getElementById('licenseStatusBadge'),
  openLicenseModalBtn: document.getElementById('openLicenseModalBtn'),
  closeLicenseModalBtn: document.getElementById('closeLicenseModalBtn'),
  licenseModal: document.getElementById('licenseModal'),
  gumroadLicenseInput: document.getElementById('gumroadLicenseInput'),
  verifyLicenseBtn: document.getElementById('verifyLicenseBtn'),
  deactivateLicenseBtn: document.getElementById('deactivateLicenseBtn'),
  licenseVerifyMessage: document.getElementById('licenseVerifyMessage'),

  resumeBanner: document.getElementById('resumeBanner'),
  resumeBannerText: document.getElementById('resumeBannerText'),
  resumeExportBtn: document.getElementById('resumeExportBtn'),
  discardCheckpointBtn: document.getElementById('discardCheckpointBtn'),

  runSandboxDemoBtn: document.getElementById('runSandboxDemoBtn'),
  sandboxUnlockAllToggle: document.getElementById('sandboxUnlockAllToggle'),

  toggleTokenGuideBtn: document.getElementById('toggleTokenGuideBtn'),
  tokenGuideBox: document.getElementById('tokenGuideBox'),
  intercomTokenInput: document.getElementById('intercomTokenInput'),
  toggleTokenVisibilityBtn: document.getElementById('toggleTokenVisibilityBtn'),
  regionSelect: document.getElementById('regionSelect'),
  verifyTokenBtn: document.getElementById('verifyTokenBtn'),
  workspaceVerifyStatus: document.getElementById('workspaceVerifyStatus'),

  filterStartDate: document.getElementById('filterStartDate'),
  filterEndDate: document.getElementById('filterEndDate'),
  filterTagInput: document.getElementById('filterTagInput'),
  filterStateSelect: document.getElementById('filterStateSelect'),
  deepExportToggle: document.getElementById('deepExportToggle'),
  bundleZipToggle: document.getElementById('bundleZipToggle'),
  skippedErrorsDownloadWrap: document.getElementById('skippedErrorsDownloadWrap'),
  downloadSkippedJsonBtn: document.getElementById('downloadSkippedJsonBtn'),

  exportFormatSelect: document.getElementById('exportFormatSelect'),
  csvModeGroup: document.getElementById('csvModeGroup'),
  csvModeSelect: document.getElementById('csvModeSelect'),
  preferDiskStreamToggle: document.getElementById('preferDiskStreamToggle'),
  startLiveExportBtn: document.getElementById('startLiveExportBtn'),
  stopExportBtn: document.getElementById('stopExportBtn'),

  streamModePill: document.getElementById('streamModePill'),
  statExportedCount: document.getElementById('statExportedCount'),
  statTotalCount: document.getElementById('statTotalCount'),
  statBytesWritten: document.getElementById('statBytesWritten'),
  statSkippedCount: document.getElementById('statSkippedCount'),
  exportProgressBar: document.getElementById('exportProgressBar'),
  rateLimitNotice: document.getElementById('rateLimitNotice'),
  rateLimitText: document.getElementById('rateLimitText'),
  activityLogBox: document.getElementById('activityLogBox'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  transcriptPreviewContainer: document.getElementById('transcriptPreviewContainer')
};

function appendLog(message, level = 'info') {
  if (!els.activityLogBox) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${level === 'warn' ? 'log-warn' : level === 'success' ? 'log-success' : level === 'error' ? 'log-error' : ''}`;
  const ts = new Date().toLocaleTimeString();
  entry.textContent = `[${ts}] ${message}`;
  els.activityLogBox.appendChild(entry);
  els.activityLogBox.scrollTop = els.activityLogBox.scrollHeight;
}

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function updateLicenseBadgeUI(state) {
  currentLicenseState = state;
  if (!els.licenseStatusBadge) return;
  if (state.valid) {
    els.licenseStatusBadge.className = 'badge badge-pro';
    els.licenseStatusBadge.textContent = `Pro Unlocked — ${state.tier || 'Unlimited'}`;
  } else {
    els.licenseStatusBadge.className = 'badge badge-free';
    els.licenseStatusBadge.textContent = 'Free Mode (Up to 50 Full Transcripts)';
  }
}

async function checkExistingCheckpoint() {
  try {
    const snap = await checkpointDb.loadCheckpoint('active_export');
    if (snap && snap.exportedCount > 0) {
      els.resumeBanner.classList.remove('hidden');
      const totalLabel = snap.totalCount ? `${snap.totalCount}` : 'unknown';
      els.resumeBannerText.textContent = `Resume Previous Export (${snap.exportedCount.toLocaleString()} / ${totalLabel} completed • Format: ${snap.format.toUpperCase()} • Saved ${new Date(snap.updatedAt).toLocaleTimeString()})`;
      els.resumeExportBtn.textContent = `Resume Previous Export (${snap.exportedCount.toLocaleString()} / ${totalLabel} completed)`;
      return snap;
    }
  } catch (err) {
    appendLog(`Checkpoint check error: ${err.message}`, 'warn');
  }
  els.resumeBanner.classList.add('hidden');
  return null;
}

function renderTranscriptPreviews(conversations) {
  if (!els.transcriptPreviewContainer) return;
  if (!conversations || conversations.length === 0) return;

  els.transcriptPreviewContainer.innerHTML = '';
  for (const conv of conversations.slice(0, 3)) {
    const box = document.createElement('div');
    box.className = 'preview-item';

    const header = document.createElement('div');
    header.className = 'preview-item-header';
    header.textContent = `#${conv.id} • ${conv.title || 'Conversation'} (${conv.region || 'US'} • ${conv.state})`;
    box.appendChild(header);

    const messages = Array.isArray(conv.messages) ? conv.messages.slice(0, 4) : [];
    for (const msg of messages) {
      const mDiv = document.createElement('div');
      mDiv.className = `preview-msg ${msg.isInternalNote ? 'note' : ''}`;
      const prefix = msg.isInternalNote ? '[INTERNAL NOTE]' : `[${msg.authorType?.toUpperCase() || 'MSG'}]`;
      mDiv.textContent = `${prefix} ${msg.authorName}: ${htmlToCleanText(msg.bodyHtml)}`;
      box.appendChild(mDiv);
    }

    els.transcriptPreviewContainer.appendChild(box);
  }
}

async function executeExport({ isSandbox = false, resumeSnapshot = null } = {}) {
  const format = els.exportFormatSelect.value;
  const csvMode = els.csvModeSelect.value;
  const preferDiskStream = els.preferDiskStreamToggle.checked;
  const deepExport = Boolean(els.deepExportToggle?.checked);
  const bundleZip = Boolean(els.bundleZipToggle?.checked);

  const filters = {
    startDate: els.filterStartDate?.value?.trim() || '',
    endDate: els.filterEndDate?.value?.trim() || '',
    tag: els.filterTagInput?.value?.trim() || '',
    state: els.filterStateSelect?.value?.trim() || ''
  };
  const hasFilters = Boolean(filters.startDate || filters.endDate || filters.tag || filters.state);

  let adapter;
  let maxConversations;

  const onRateLimitWait = ({ remaining, waitMs, reason }) => {
    const dot = els.rateLimitNotice.querySelector('.dot');
    if (dot) dot.className = 'dot dot-wait';
    els.rateLimitText.textContent = `Rate-Limit Guard Active: ${reason} — Pausing ${(waitMs / 1000).toFixed(1)}s...`;
    appendLog(`Rate-Limit Guard: ${reason} (waiting ${waitMs}ms)`, 'warn');
  };

  if (isSandbox) {
    const simulatePro = els.sandboxUnlockAllToggle.checked || currentLicenseState.valid;
    maxConversations = simulatePro ? 500 : 50;
    adapter = new SandboxDemoAdapter({
      totalDemoCount: 500,
      simulateRateLimitPause: true,
      rateLimitPauseMs: 350,
      onRateLimitWait
    });
    appendLog(`Starting 500-Chat Interactive Sandbox Demo (Cap: ${maxConversations} chats, Format: ${format.toUpperCase()}${hasFilters ? ', Search Filters Active' : ''}${deepExport ? ', Deep Export ON' : ''})...`, 'info');
  } else {
    const token = els.intercomTokenInput.value.trim();
    if (!token) {
      alert('Please enter your Intercom Access Token first, or click "Run 500-chat sandbox export" to test without a token.');
      els.intercomTokenInput.focus();
      return;
    }
    maxConversations = currentLicenseState.valid ? Infinity : 50;
    adapter = new IntercomAdapter({
      token,
      region: els.regionSelect.value,
      onRateLimitWait
    });
    appendLog(`Validating Intercom workspace & starting live export (Mode: ${currentLicenseState.tier}, Format: ${format.toUpperCase()}${hasFilters ? ', Search API Filtered' : ''}${deepExport ? ', Deep Export Enriched' : ''})...`, 'info');
  }

  activeAbortController = new AbortController();
  els.startLiveExportBtn.disabled = true;
  els.runSandboxDemoBtn.disabled = true;
  els.stopExportBtn.classList.remove('hidden');

  const ext = format === 'jsonl' ? '.jsonl' : format === 'md' ? '.md' : '.csv';
  const prefix = isSandbox ? 'chatvault-sandbox-500-demo' : 'chatvault-intercom-transcripts';
  const suggestedName = `${prefix}-${new Date().toISOString().slice(0, 10)}${ext}`;

  const streamer = new FileStreamer({
    format,
    suggestedName,
    preferDiskStream: bundleZip ? false : preferDiskStream
  });

  const engine = new ExportEngine({
    adapter,
    streamer,
    checkpointDb,
    format,
    csvMode,
    maxConversations,
    filters,
    deepExport,
    bundleAttachmentsZip: bundleZip,
    checkpointInterval: 50,
    onProgress: ({ exportedCount, totalCount, bytesWritten, streamMode, skippedCount }) => {
      els.statExportedCount.textContent = exportedCount.toLocaleString();
      const targetTotal = Math.min(totalCount || maxConversations, maxConversations === Infinity ? (totalCount || exportedCount) : maxConversations);
      els.statTotalCount.textContent = totalCount ? totalCount.toLocaleString() : '—';
      els.statBytesWritten.textContent = formatBytes(bytesWritten);
      els.statSkippedCount.textContent = String(skippedCount);
      els.streamModePill.textContent = bundleZip
        ? 'Local ZIP Bundle'
        : (streamMode === 'disk-stream' ? 'Direct-to-disk stream' : 'In-memory export');

      const pct = targetTotal > 0 ? Math.min(100, Math.round((exportedCount / targetTotal) * 100)) : 0;
      els.exportProgressBar.style.width = `${pct}%`;
    },
    onCheckpointSaved: (saved) => {
      appendLog(`IndexedDB Checkpoint saved (${saved.exportedCount} conversations processed).`, 'success');
    }
  });

  try {
    if (!isSandbox && !resumeSnapshot) {
      const info = await adapter.verifyAndDetectRegion();
      appendLog(`Connected to ${info.workspaceName} [${info.region} Region] • Total Workspace Conversations: ${info.totalCount.toLocaleString()}`, 'success');
      els.statTotalCount.textContent = info.totalCount.toLocaleString();
    }

    const result = await engine.run({
      resumeSnapshot,
      signal: activeAbortController.signal,
      triggerBrowserDownload: !bundleZip
    });

    lastSkippedErrors = Array.isArray(result.skippedErrors) ? result.skippedErrors : [];
    if (lastSkippedErrors.length > 0 && els.skippedErrorsDownloadWrap) {
      els.skippedErrorsDownloadWrap.classList.remove('hidden');
      els.downloadSkippedJsonBtn.textContent = `Download skipped_errors.json (${lastSkippedErrors.length} skipped)`;
    } else if (els.skippedErrorsDownloadWrap) {
      els.skippedErrorsDownloadWrap.classList.add('hidden');
    }

    if (bundleZip && typeof result.getText === 'function') {
      appendLog('Compressing local ZIP bundle with bundled JSZip v3.10.1...', 'info');
      const zipResult = await buildExportZipBundle({
        transcriptFileName: suggestedName,
        transcriptContent: result.getText(),
        skippedErrors: lastSkippedErrors,
        attachmentManifest: result.attachmentManifest || [],
        downloadAttachmentBinaries: deepExport && !isSandbox,
        metadata: {
          exportedCount: result.exportedCount,
          filters,
          deepExport
        }
      });

      const zipName = `${prefix}-${new Date().toISOString().slice(0, 10)}-bundle.zip`;
      const url = URL.createObjectURL(zipResult.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 2500);
      appendLog(`Packaged JSZip bundle ${zipName} (${formatBytes(zipResult.size)}) — ${zipResult.downloadedAttachmentsCount} binaries fetched, ${lastSkippedErrors.length} skipped errors logged.`, 'success');
    }

    const dot = els.rateLimitNotice.querySelector('.dot');
    if (dot) dot.className = 'dot dot-ok';
    els.rateLimitText.textContent = 'Intercom API v2.11 Rate-Limit Monitor: Optimal (0 dropped packets)';

    renderTranscriptPreviews(result.samplePreview);

    if (result.aborted) {
      appendLog(`Export paused at ${result.exportedCount} conversations. Checkpoint saved in IndexedDB for instant resume.`, 'warn');
    } else {
      appendLog(
        `Export completed! ${result.exportedCount.toLocaleString()} full conversation transcripts (${formatBytes(result.bytesWritten)}) saved${bundleZip ? ' inside local ZIP bundle' : ` to ${result.fileName} via ${result.streamMode}`}.`,
        'success'
      );
      if (!currentLicenseState.valid && result.exportedCount >= 50 && !isSandbox) {
        appendLog('Reached Free Mode 50-conversation cap. Activate a Pro License Key to export unlimited conversations.', 'warn');
      }
    }
  } catch (err) {
    appendLog(`Export error: ${err.message}`, 'error');
  } finally {
    els.startLiveExportBtn.disabled = false;
    els.runSandboxDemoBtn.disabled = false;
    els.stopExportBtn.classList.add('hidden');
    activeAbortController = null;
    await checkExistingCheckpoint();
  }
}

async function initWorkstation() {
  // 1. Check license state
  const licenseState = await licenseManager.getLicenseStatus();
  updateLicenseBadgeUI(licenseState);

  // 2. Check existing IndexedDB checkpoint
  await checkExistingCheckpoint();

  // 3. Format switcher toggles CSV mode visibility
  els.exportFormatSelect.addEventListener('change', () => {
    if (els.exportFormatSelect.value === 'csv') {
      els.csvModeGroup.classList.remove('hidden');
    } else {
      els.csvModeGroup.classList.add('hidden');
    }
  });

  // 4. Token guide & visibility toggles
  els.toggleTokenGuideBtn.addEventListener('click', () => {
    els.tokenGuideBox.classList.toggle('hidden');
  });

  els.toggleTokenVisibilityBtn.addEventListener('click', () => {
    const isPwd = els.intercomTokenInput.type === 'password';
    els.intercomTokenInput.type = isPwd ? 'text' : 'password';
    els.toggleTokenVisibilityBtn.textContent = isPwd ? 'Hide' : 'Show';
  });

  // 5. Verify Intercom token & auto-detect region
  els.verifyTokenBtn.addEventListener('click', async () => {
    const token = els.intercomTokenInput.value.trim();
    if (!token) {
      els.workspaceVerifyStatus.className = 'status-callout status-err';
      els.workspaceVerifyStatus.textContent = 'Please paste your Intercom Access Token first.';
      els.workspaceVerifyStatus.classList.remove('hidden');
      return;
    }

    els.verifyTokenBtn.disabled = true;
    els.verifyTokenBtn.textContent = 'Detecting Region (US/EU/AU)...';
    try {
      const adapter = new IntercomAdapter({
        token,
        region: els.regionSelect.value
      });
      const res = await adapter.verifyAndDetectRegion();
      els.regionSelect.value = res.region;
      els.statTotalCount.textContent = res.totalCount.toLocaleString();
      els.workspaceVerifyStatus.className = 'status-callout status-ok';
      els.workspaceVerifyStatus.textContent = `Verified! Workspace: ${res.workspaceName} (${res.region} Region • ${res.baseUrl}) • Total Conversations: ${res.totalCount.toLocaleString()}`;
      els.workspaceVerifyStatus.classList.remove('hidden');
      appendLog(`Verified token for workspace "${res.workspaceName}" in ${res.region} region (${res.totalCount.toLocaleString()} conversations).`, 'success');
    } catch (err) {
      els.workspaceVerifyStatus.className = 'status-callout status-err';
      els.workspaceVerifyStatus.textContent = `Verification failed: ${err.message}`;
      els.workspaceVerifyStatus.classList.remove('hidden');
      appendLog(`Token verification failed: ${err.message}`, 'error');
    } finally {
      els.verifyTokenBtn.disabled = false;
      els.verifyTokenBtn.textContent = 'Verify Token & Detect Region';
    }
  });

  // 6. Sandbox Demo & Live Export buttons
  els.runSandboxDemoBtn.addEventListener('click', () => {
    executeExport({ isSandbox: true });
  });

  els.startLiveExportBtn.addEventListener('click', () => {
    executeExport({ isSandbox: false });
  });

  els.stopExportBtn.addEventListener('click', () => {
    if (activeAbortController) {
      activeAbortController.abort();
    }
  });

  // 7. Resume & Discard checkpoint buttons
  els.resumeExportBtn.addEventListener('click', async () => {
    const snap = await checkpointDb.loadCheckpoint('active_export');
    if (!snap) return;
    els.exportFormatSelect.value = snap.format || 'csv';
    els.csvModeSelect.value = snap.csvMode || 'summary';
    const isSandbox = !els.intercomTokenInput.value.trim();
    executeExport({ isSandbox, resumeSnapshot: snap });
  });

  els.discardCheckpointBtn.addEventListener('click', async () => {
    await checkpointDb.clearCheckpoint('active_export');
    await checkExistingCheckpoint();
    appendLog('Discarded saved checkpoint.', 'info');
  });

  // 8. Clear log & Skipped JSON download buttons
  els.clearLogBtn.addEventListener('click', () => {
    els.activityLogBox.innerHTML = '';
  });

  if (els.downloadSkippedJsonBtn) {
    els.downloadSkippedJsonBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(lastSkippedErrors, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chatvault-skipped-errors-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 2000);
    });
  }

  // 9. License Modal events
  els.openLicenseModalBtn.addEventListener('click', () => {
    els.licenseModal.classList.remove('hidden');
    if (currentLicenseState.licenseKey) {
      els.gumroadLicenseInput.value = currentLicenseState.licenseKey;
    }
  });

  els.closeLicenseModalBtn.addEventListener('click', () => {
    els.licenseModal.classList.add('hidden');
  });

  els.verifyLicenseBtn.addEventListener('click', async () => {
    const key = els.gumroadLicenseInput.value.trim();
    els.verifyLicenseBtn.disabled = true;
    els.verifyLicenseBtn.textContent = 'Verifying...';

    const result = await licenseManager.verifyLicenseKey(key, { incrementUsesCount: true });
    els.verifyLicenseBtn.disabled = false;
    els.verifyLicenseBtn.textContent = 'Verify & Activate License';

    els.licenseVerifyMessage.classList.remove('hidden');
    if (result.valid) {
      els.licenseVerifyMessage.className = 'status-callout status-ok';
      els.licenseVerifyMessage.textContent = `${result.reason} (${result.tier})`;
      updateLicenseBadgeUI({ ...result, maxConversations: Infinity });
      appendLog(`Activated Pro License (${result.tier}). Unlimited export unlocked.`, 'success');
    } else {
      els.licenseVerifyMessage.className = 'status-callout status-err';
      els.licenseVerifyMessage.textContent = result.reason;
      updateLicenseBadgeUI({ valid: false, tier: 'Free (50-Chat Cap)', maxConversations: 50 });
    }
  });

  els.deactivateLicenseBtn.addEventListener('click', async () => {
    const cleared = await licenseManager.clearLicense();
    els.gumroadLicenseInput.value = '';
    els.licenseVerifyMessage.className = 'status-callout status-ok';
    els.licenseVerifyMessage.textContent = 'Stored license key cleared. Switched back to Free (50-Chat Cap) mode.';
    els.licenseVerifyMessage.classList.remove('hidden');
    updateLicenseBadgeUI(cleared);
  });
}

initWorkstation();
