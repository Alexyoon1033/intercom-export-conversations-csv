/**
 * ChatVault Zero-Dependency Local ZIP Builder (STORE method, RFC 1951/PKZIP compliant)
 * Packages text transcripts (CSV / NDJSON / Markdown), skipped_errors.json, and optional Deep Export
 * attachment binaries into a single local .zip archive without loading any external CDN/remote script
 * (100% Chrome Web Store MV3 Remote-Code-Free compliant).
 */

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export class LocalZipBuilder {
  constructor() {
    this.entries = [];
    this.encoder = new TextEncoder();
  }

  /**
   * Adds a UTF-8 text or Uint8Array binary file to the archive.
   * @param {string} filePath - Relative path inside the ZIP (e.g. 'transcripts.csv' or 'attachments/950001/log.txt')
   * @param {string|Uint8Array|ArrayBuffer} content
   */
  addFile(filePath, content) {
    const cleanPath = String(filePath).replace(/^\/+/, '').replace(/\\/g, '/');
    let dataBytes;
    if (typeof content === 'string') {
      dataBytes = this.encoder.encode(content);
    } else if (content instanceof Uint8Array) {
      dataBytes = content;
    } else if (content instanceof ArrayBuffer) {
      dataBytes = new Uint8Array(content);
    } else {
      dataBytes = this.encoder.encode(String(content ?? ''));
    }

    this.entries.push({
      nameBytes: this.encoder.encode(cleanPath),
      dataBytes,
      crc32: computeCrc32(dataBytes)
    });
  }

  /**
   * Builds and returns the complete ZIP archive as a Uint8Array (zero compression STORE for instant browser speed & minimal memory).
   */
  buildUint8Array() {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of this.entries) {
      const { nameBytes, dataBytes, crc32 } = entry;
      const size = dataBytes.length;

      // Local file header (30 bytes + filename)
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true); // Local file header signature
      lv.setUint16(4, 20, true); // Version needed
      lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
      lv.setUint16(8, 0, true); // Compression method: 0 (STORE)
      lv.setUint16(10, 0, true); // Mod time
      lv.setUint16(12, 0, true); // Mod date
      lv.setUint32(14, crc32, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader, dataBytes);

      // Central directory header (46 bytes + filename)
      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true); // Central file header signature
      cv.setUint16(4, 20, true); // Version made by
      cv.setUint16(6, 20, true); // Version needed
      cv.setUint16(8, 0x0800, true); // UTF-8 flag
      cv.setUint16(10, 0, true); // Compression method: STORE
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc32, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true); // Relative offset of local header
      centralHeader.set(nameBytes, 46);

      centralParts.push(centralHeader);
      offset += localHeader.length + dataBytes.length;
    }

    const centralDirOffset = offset;
    let centralDirSize = 0;
    for (const part of centralParts) {
      centralDirSize += part.length;
    }

    // End of central directory record (22 bytes)
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, this.entries.length, true);
    ev.setUint16(10, this.entries.length, true);
    ev.setUint32(12, centralDirSize, true);
    ev.setUint32(16, centralDirOffset, true);
    ev.setUint16(20, 0, true);

    const totalSize = centralDirOffset + centralDirSize + eocd.length;
    const output = new Uint8Array(totalSize);
    let pos = 0;
    for (const part of localParts) {
      output.set(part, pos);
      pos += part.length;
    }
    for (const part of centralParts) {
      output.set(part, pos);
      pos += part.length;
    }
    output.set(eocd, pos);

    return output;
  }

  buildBlob() {
    return new Blob([this.buildUint8Array()], { type: 'application/zip' });
  }
}
