// Web Crypto digests require a contiguous buffer. Bound the extra allocation.
export const MAX_AUDIT_HASH_BYTES = 32 * 1024 * 1024;

export async function createExportAudit(result, { sandbox, masked } = {}) {
  let checksum = 'Unavailable (transcript bytes could not be read)';
  try {
    if (result.bytesWritten > MAX_AUDIT_HASH_BYTES) {
      checksum = 'Omitted (transcript exceeds the 32 MiB in-browser hash limit)';
    } else {
      const file = await result.getFile?.();
      if (file && file.size === result.bytesWritten && file.size <= MAX_AUDIT_HASH_BYTES) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      }
    }
  } catch {
    // A browser may refuse to reopen a disk file. Keep the counts available.
  }

  return [
    'ChatVault export audit',
    `Generated (UTC): ${new Date().toISOString()}`,
    `Source: ${sandbox ? 'Synthetic sandbox' : 'Intercom workspace'}`,
    `Status: ${result.aborted ? 'Paused (partial output)' : 'Finished requested run (subject to filters, export cap and source availability)'}`,
    `Segment: ${result.resumed ? 'Resumed output only' : 'Initial output'}`,
    `Conversation detail attempts in this segment: ${result.segmentConversations + result.segmentSkipped}`,
    `Conversations written in this segment: ${result.segmentConversations}`,
    `Conversations skipped in this segment: ${result.segmentSkipped}`,
    `Message records processed in this segment: ${result.segmentMessages}`,
    `Internal note records processed in this segment: ${result.segmentNotes}`,
    `Transcript bytes: ${result.bytesWritten}`,
    `Transcript SHA-256: ${checksum}`,
    `Pattern masking: ${masked ? 'On (review output before sharing)' : 'Off'}`,
    'Counts describe records processed by ChatVault. Retries and list requests are excluded.',
    'The checksum covers transcript bytes, excluding the audit itself and any ZIP container.',
    'A checksum can verify file consistency. Compare against source records to assess completeness.',
    ''
  ].join('\n');
}
