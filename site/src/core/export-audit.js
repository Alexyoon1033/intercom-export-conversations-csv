import { sha256 } from '../libs/noble-hashes/sha2.js';
import { bytesToHex } from '../libs/noble-hashes/utils.js';

const HASH_CHUNK_BYTES = 1024 * 1024;

async function hashFile(file) {
  const hash = sha256.create();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
    const chunk = await file.slice(offset, offset + HASH_CHUNK_BYTES).arrayBuffer();
    hash.update(new Uint8Array(chunk));
  }
  return bytesToHex(hash.digest());
}

export async function createExportAudit(result, { sandbox, masked } = {}) {
  let checksum = 'Unavailable (transcript bytes could not be read)';
  try {
    const file = await result.getFile?.();
    if (file && file.size === result.bytesWritten) checksum = await hashFile(file);
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
