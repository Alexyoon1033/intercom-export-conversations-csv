/**
 * ChatVault Platform-Agnostic Export Coordinator Engine (90% Shared Core)
 * Connects any Platform Adapter (Intercom, Zendesk, Crisp, Help Scout, or Sandbox Demo)
 * with Serializers (Clean CSV, NDJSON, Obsidian Markdown), FileStreamer (Disk Streaming / Blob Fallback),
 * and CheckpointDB (50-conversation IndexedDB auto-checkpoint & resume).
 */

import {
  getCsvHeaderRow,
  conversationToCsvRows,
  conversationToNdjsonLine,
  conversationToMarkdown
} from './serializers.js';

import { formatSkippedErrors, maskConversation } from './export-privacy.js';

export const CHECKPOINT_BATCH_SIZE = 50;

export class ExportEngine {
  /**
   * @param {Object} options
   * @param {Object} options.adapter - Platform adapter implementing exportStream()
   * @param {Object} options.streamer - FileStreamer instance
   * @param {Object} options.checkpointDb - CheckpointDB instance
   * @param {'csv'|'jsonl'|'md'} [options.format='csv']
   * @param {'summary'|'detailed'} [options.csvMode='summary']
   * @param {number} [options.maxConversations=50]
   * @param {number} [options.checkpointInterval=50]
   * @param {string} [options.checkpointId='active_export']
   * @param {Function} [options.onProgress]
   * @param {Function} [options.onCheckpointSaved]
   */
  constructor(options = {}) {
    this.adapter = options.adapter;
    this.streamer = options.streamer;
    this.checkpointDb = options.checkpointDb;
    this.format = options.format || 'csv';
    this.csvMode = options.csvMode || 'summary';
    this.maxConversations = typeof options.maxConversations === 'number' ? options.maxConversations : 50;
    this.checkpointInterval = options.checkpointInterval || CHECKPOINT_BATCH_SIZE;
    this.checkpointId = options.checkpointId || 'active_export';
    this.filters = options.filters || {};
    this.deepExport = Boolean(options.deepExport);
    this.maskPatterns = Boolean(options.maskPatterns);
    this.bundleAttachmentsZip = Boolean(options.bundleAttachmentsZip) && !this.maskPatterns;
    this.fetchAttachmentFn = options.fetchAttachmentFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.onProgress = options.onProgress || (() => {});
    this.onCheckpointSaved = options.onCheckpointSaved || (() => {});
  }

  /**
   * Serializes a single conversation into the configured target format.
   */
  serializeConversation(conv) {
    if (this.format === 'jsonl') {
      return conversationToNdjsonLine(conv);
    }
    if (this.format === 'md') {
      return conversationToMarkdown(conv);
    }
    return conversationToCsvRows(conv, this.csvMode);
  }

  /**
   * Runs the export stream from scratch or resumes from a saved checkpoint.
   * @param {Object} [options]
   * @param {Object|null} [options.resumeSnapshot] - Checkpoint snapshot from CheckpointDB
   * @param {AbortSignal} [options.signal]
   * @param {boolean} [options.triggerBrowserDownload=true]
   * @param {boolean} [options.clearCheckpointOnComplete=true]
   */
  async run(options = {}) {
    const resumeSnapshot = options.resumeSnapshot || null;
    const signal = options.signal || null;
    const runSettings = options.runSettings || null;
    const triggerBrowserDownload = options.triggerBrowserDownload !== false;
    const clearCheckpointOnComplete = options.clearCheckpointOnComplete !== false;

    const openResult = await this.streamer.open();
    // An incomplete segment may not be resumed after an unexpected tab close.
    if (resumeSnapshot?.readyToResume && this.checkpointDb) {
      await this.checkpointDb.saveCheckpoint({ ...resumeSnapshot, readyToResume: false }, this.checkpointId);
    }

    // Write CSV header row with UTF-8 BOM at start of file
    if (this.format === 'csv') {
      await this.streamer.write(getCsvHeaderRow(this.csvMode, true));
    } else if (this.format === 'md') {
      const mdBanner = `# ChatVault Conversation Transcript Export\n- **Exported At:** ${new Date().toISOString()}\n\n---\n\n`;
      await this.streamer.write(mdBanner);
    }

    const completedIds = new Set(resumeSnapshot?.completedIds || []);
    const startingAfter = resumeSnapshot?.startingAfter || null;
    let lastCursor = startingAfter;
    let exportedCount = completedIds.size;
    let totalCount = resumeSnapshot?.totalCount || 0;
    let skippedErrors = Array.isArray(resumeSnapshot?.skippedErrors) ? [...resumeSnapshot.skippedErrors] : [];
    let batchCounter = 0;
    const samplePreview = [];
    const earlierSkipped = skippedErrors;
    const segmentErrors = [];
    let segmentConversations = 0;
    let segmentMessages = 0;
    let segmentNotes = 0;

    const stream = this.adapter.exportStream({
      startingAfter,
      completedIds,
      maxConversations: this.maxConversations,
      filters: this.filters,
      deepExport: this.deepExport,
      onSkipped: (error) => segmentErrors.push(error),
      signal
    });

    const attachmentManifest = [];

    for await (const item of stream) {
      const conversation = this.maskPatterns ? maskConversation(item.conversation) : item.conversation;
      const serialized = this.serializeConversation(conversation);
      await this.streamer.write(serialized);
      segmentConversations++;
      for (const message of conversation.messages || []) {
        segmentMessages++;
        if (message.isInternalNote) segmentNotes++;
      }

      if (this.bundleAttachmentsZip && Array.isArray(conversation.messages)) {
        for (const msg of conversation.messages) {
          if (Array.isArray(msg.attachments)) {
            for (const url of msg.attachments) {
              attachmentManifest.push({
                conversationId: conversation.id,
                partId: msg.partId,
                url
              });
            }
          }
        }
      }

      completedIds.add(conversation.id);
      exportedCount = item.exportedCount;
      totalCount = item.totalCount || totalCount;
      lastCursor = item.cursor || lastCursor;
      skippedErrors = [...earlierSkipped, ...(item.skippedErrors || segmentErrors)];
      batchCounter++;

      if (samplePreview.length < 5) {
        samplePreview.push(conversation);
      }

      this.onProgress({
        exportedCount,
        totalCount,
        bytesWritten: this.streamer.bytesWritten,
        streamMode: openResult.mode,
        skippedCount: skippedErrors.length,
        latestConversation: conversation
      });

      // Flush to disk & save IndexedDB checkpoint every 50 conversations
      if (batchCounter >= this.checkpointInterval) {
        await this.streamer.flush();
        if (this.checkpointDb) {
          const saved = await this.checkpointDb.saveCheckpoint(
            {
              platform: conversation.platform || 'intercom',
              region: conversation.region || 'US',
              format: this.format,
              csvMode: this.csvMode,
              startingAfter: lastCursor,
              completedIds: Array.from(completedIds),
              exportedCount,
              totalCount,
              skippedErrors: formatSkippedErrors(skippedErrors, this.maskPatterns),
              runSettings,
              readyToResume: false
            },
            this.checkpointId
          );
          this.onCheckpointSaved(saved);
        }
        batchCounter = 0;
      }
    }

    if (segmentErrors.length) skippedErrors = [...earlierSkipped, ...segmentErrors];

    // Final flush & close
    const closeResult = await this.streamer.close({ triggerBrowserDownload });

    const aborted = Boolean(signal?.aborted);
    if (aborted && this.checkpointDb) {
      // Save interrupted checkpoint so user can resume immediately
      const saved = await this.checkpointDb.saveCheckpoint(
        {
          platform: 'intercom',
          format: this.format,
          csvMode: this.csvMode,
          startingAfter: lastCursor,
          completedIds: Array.from(completedIds),
          exportedCount,
          totalCount,
          skippedErrors: formatSkippedErrors(skippedErrors, this.maskPatterns),
          runSettings,
          readyToResume: Boolean(runSettings && !runSettings.bundleZip && (runSettings.isSandbox || runSettings.workspaceId && runSettings.workspaceId !== 'unknown'))
        },
        this.checkpointId
      );
      this.onCheckpointSaved(saved);
    } else if (!aborted && clearCheckpointOnComplete && this.checkpointDb) {
      await this.checkpointDb.clearCheckpoint(this.checkpointId);
    }

    return {
      aborted,
      resumed: Boolean(resumeSnapshot),
      segmentConversations,
      segmentMessages,
      segmentNotes,
      segmentSkipped: skippedErrors.length - earlierSkipped.length,
      exportedCount,
      totalCount,
      skippedErrors,
      attachmentManifest,
      bytesWritten: closeResult.bytesWritten,
      fileName: closeResult.fileName,
      streamMode: closeResult.mode,
      samplePreview,
      getFile: closeResult.getFile,
      getText: closeResult.getText
    };
  }
}
