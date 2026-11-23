/**
 * ChatVault Memory-Safe File Streamer (OOM Defense)
 * Features:
 * - Primary engine: window.showSaveFilePicker() + handle.createWritable() (FileSystemWritableFileStream)
 *   Flushes chunks directly to disk every batch (e.g. 50 conversations) when the native file picker is available.
 * - Dual fallback: Chunk array -> new Blob(chunks, { type }) -> URL.createObjectURL download when File System Access API
 *   is unsupported or when user cancels the native save picker for small/demo exports.
 */

const MIME_MAP = {
  csv: { mime: 'text/csv;charset=utf-8', ext: '.csv', description: 'CSV File (Excel UTF-8)' },
  jsonl: { mime: 'application/x-ndjson;charset=utf-8', ext: '.jsonl', description: 'NDJSON / JSON Lines' },
  md: { mime: 'text/markdown;charset=utf-8', ext: '.md', description: 'Markdown Bundle' }
};

export class FileStreamer {
  /**
   * @param {Object} options
   * @param {'csv'|'jsonl'|'md'} [options.format='csv']
   * @param {string} [options.suggestedName]
   * @param {boolean} [options.preferDiskStream=true]
   * @param {Function} [options.showSaveFilePickerFn]
   */
  constructor(options = {}) {
    this.format = options.format || 'csv';
    this.meta = MIME_MAP[this.format] || MIME_MAP.csv;
    this.suggestedName = options.suggestedName || `chatvault-intercom-export-${new Date().toISOString().slice(0, 10)}${this.meta.ext}`;
    this.preferDiskStream = options.preferDiskStream !== false;
    this.showSaveFilePickerFn =
      options.showSaveFilePickerFn ||
      (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'
        ? window.showSaveFilePicker.bind(window)
        : null);

    this.mode = 'none'; // 'disk-stream' | 'memory-chunks'
    this.fileHandle = null;
    this.writableStream = null;
    this.chunks = [];
    this.pendingBuffer = [];
    this.bytesWritten = 0;
    this.isClosed = false;
  }

  /**
   * Initializes the output target. Attempts FileSystemWritableFileStream first; falls back to memory chunk array if unavailable or declined.
   */
  async open() {
    if (this.preferDiskStream && this.showSaveFilePickerFn) {
      try {
        this.fileHandle = await this.showSaveFilePickerFn({
          suggestedName: this.suggestedName,
          types: [
            {
              description: this.meta.description,
              accept: {
                [this.meta.mime.split(';')[0]]: [this.meta.ext]
              }
            }
          ]
        });
        this.writableStream = await this.fileHandle.createWritable();
        this.mode = 'disk-stream';
        return { mode: this.mode, fileName: this.fileHandle.name || this.suggestedName };
      } catch (err) {
        // Fallback smoothly to memory-chunks if user cancelled picker or browser blocked it
        this.mode = 'memory-chunks';
        this.writableStream = null;
      }
    } else {
      this.mode = 'memory-chunks';
    }

    return { mode: this.mode, fileName: this.suggestedName };
  }

  /**
   * Appends a string chunk to the current batch buffer.
   * @param {string} textChunk
   */
  async write(textChunk) {
    if (this.isClosed) {
      throw new Error('Cannot write to a closed FileStreamer.');
    }
    if (!textChunk) return;

    this.pendingBuffer.push(textChunk);
    this.bytesWritten += new TextEncoder().encode(textChunk).byteLength;
  }

  /**
   * Flushes pending buffer to disk (if disk-stream) or consolidates into chunk array (if memory-chunks) and clears pending buffer.
   */
  async flush() {
    if (this.pendingBuffer.length === 0) return;

    const batchPayload = this.pendingBuffer.join('');
    this.pendingBuffer.length = 0;

    if (this.mode === 'disk-stream' && this.writableStream) {
      await this.writableStream.write(batchPayload);
    } else {
      this.chunks.push(batchPayload);
    }
  }

  /**
   * Flushes remaining data and closes the stream (or triggers Blob download in fallback mode).
   * @param {Object} [options]
   * @param {boolean} [options.triggerBrowserDownload=true]
   */
  async close({ triggerBrowserDownload = true } = {}) {
    if (this.isClosed) return { mode: this.mode, bytesWritten: this.bytesWritten };

    await this.flush();
    this.isClosed = true;

    if (this.mode === 'disk-stream' && this.writableStream) {
      await this.writableStream.close();
      return {
        mode: this.mode,
        fileName: this.fileHandle?.name || this.suggestedName,
        bytesWritten: this.bytesWritten,
        getFile: () => this.fileHandle.getFile(),
        blob: null
      };
    }

    // Fallback mode: create chunked Blob
    const blob = new Blob(this.chunks, { type: this.meta.mime });

    if (triggerBrowserDownload && typeof document !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.suggestedName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 2500);
    }

    return {
      mode: this.mode,
      fileName: this.suggestedName,
      bytesWritten: this.bytesWritten,
      blob,
      getFile: () => blob,
      getText: () => this.chunks.join('')
    };
  }
}
