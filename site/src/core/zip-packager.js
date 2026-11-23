/**
 * ChatVault Local ZIP Packager (Powered by locally bundled official JSZip v3.10.1)
 * - Uses battle-tested JSZip (src/libs/jszip.min.js) with DEFLATE compression for huge archives
 * - Zero external CDN/remote code (100% Chrome MV3 compliant)
 * - Packages transcripts (.csv / .jsonl / .md), skipped_errors.json, attachments_manifest.json,
 *   and optional downloaded attachment binaries (best-effort CORS/fetch with graceful fallback).
 */

/**
 * Resolves the locally bundled JSZip constructor (browser global window.JSZip or Node.js CJS load in tests).
 */
export async function loadLocalJSZip() {
  if (typeof globalThis !== 'undefined' && typeof globalThis.JSZip === 'function') {
    return globalThis.JSZip;
  }
  // Node.js unit test environment fallback: dynamically load the exact local bundled file
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    return require('../libs/jszip.min.js');
  }
  throw new Error('Local JSZip library (src/libs/jszip.min.js) is not loaded.');
}

/**
 * Packages exported transcripts, audit logs, and attachment manifest (plus optional fetched binaries) into a compressed ZIP Blob/Uint8Array.
 *
 * @param {Object} options
 * @param {string} options.transcriptFileName
 * @param {string} options.transcriptContent
 * @param {Array} [options.skippedErrors=[]]
 * @param {Array} [options.attachmentManifest=[]]
 * @param {Object} [options.metadata={}]
 * @param {boolean} [options.downloadAttachmentBinaries=false]
 * @param {Function} [options.fetchFn]
 * @param {number} [options.maxBinaryBytes=25*1024*1024] - Safety cap (25 MB) for browser memory during binary bundling
 */
export async function buildExportZipBundle(options = {}) {
  const JSZip = await loadLocalJSZip();
  const zip = new JSZip();

  zip.file(options.transcriptFileName || 'chatvault-transcripts.csv', options.transcriptContent || '');
  zip.file('skipped_errors.json', JSON.stringify(options.skippedErrors || [], null, 2));
  if (options.auditText) zip.file('export_audit_report.txt', options.auditText);

  const downloadedAttachments = [];
  const failedAttachments = [];
  let totalBinaryBytes = 0;
  const maxBinaryBytes = typeof options.maxBinaryBytes === 'number' ? options.maxBinaryBytes : 25 * 1024 * 1024;
  const fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);

  if (options.downloadAttachmentBinaries && fetchFn && Array.isArray(options.attachmentManifest)) {
    const attFolder = zip.folder('attachments');
    for (let i = 0; i < options.attachmentManifest.length; i++) {
      const item = options.attachmentManifest[i];
      if (!item?.url) continue;
      if (totalBinaryBytes >= maxBinaryBytes) {
        failedAttachments.push({ ...item, reason: 'Skipped: exceeded 25 MB local binary safety cap' });
        continue;
      }

      try {
        const res = await fetchFn(item.url);
        if (!res.ok) {
          failedAttachments.push({ ...item, reason: `HTTP ${res.status}` });
          continue;
        }
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        if (totalBinaryBytes + bytes.byteLength > maxBinaryBytes) {
          failedAttachments.push({ ...item, reason: 'Skipped: would exceed 25 MB local binary safety cap' });
          continue;
        }

        const safeUrlName = String(item.url.split('?')[0].split('/').pop() || `file_${i + 1}`)
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .slice(0, 80);
        const zipRelPath = `${item.conversationId || 'unknown'}/${i + 1}_${safeUrlName}`;
        attFolder.file(zipRelPath, bytes);
        totalBinaryBytes += bytes.byteLength;
        downloadedAttachments.push({ ...item, zipPath: `attachments/${zipRelPath}`, bytes: bytes.byteLength });
      } catch (err) {
        failedAttachments.push({ ...item, reason: err?.message || 'CORS or network error' });
      }
    }
  }

  zip.file(
    'attachments_manifest.json',
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        ...(options.metadata || {}),
        totalAttachmentLinks: (options.attachmentManifest || []).length,
        downloadedCount: downloadedAttachments.length,
        failedCount: failedAttachments.length,
        downloaded: downloadedAttachments,
        failed: failedAttachments,
        allLinks: options.attachmentManifest || []
      },
      null,
      2
    )
  );

  const uint8 = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const blob = typeof Blob !== 'undefined' ? new Blob([uint8], { type: 'application/zip' }) : null;

  return {
    uint8,
    blob,
    size: uint8.byteLength,
    downloadedAttachmentsCount: downloadedAttachments.length,
    failedAttachmentsCount: failedAttachments.length
  };
}
