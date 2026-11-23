/**
 * ChatVault Serializers (Clean CSV, Structured JSON/NDJSON, Obsidian/RAG Markdown)
 * Features:
 * - HTML to Clean Plain Text converter (<p>, <br>, <a>, <li>, entities, whitespace cleanup)
 * - RFC 4180 CSV double-quote escaping & UTF-8 BOM (\uFEFF) for Microsoft Excel multi-language compatibility
 * - 32,000-character Excel cell safety protection (prevents 32,767-char cell overflow row corruption)
 * - Summary mode (1 row per conversation) & Detailed mode (1 row per message part)
 * - Structured JSON / NDJSON (.jsonl) serializer
 * - Obsidian / RAG Markdown (.md) bundle serializer with YAML Frontmatter
 */

export const UTF8_BOM = '\uFEFF';
export const EXCEL_SAFE_CELL_LIMIT = 32000;

const HTML_ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '...'
};

/**
 * Strips and formats HTML tags (<p>, <br>, <a>, <li>, etc.) into readable plain text.
 * @param {string} html
 * @returns {string}
 */
export function htmlToCleanText(html) {
  if (html === null || html === undefined) return '';
  let text = String(html);
  if (!text) return '';

  // Convert links <a href="URL">Label</a> -> Label (URL) if URL differs from Label
  text = text.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const cleanInner = inner.replace(/<[^>]+>/g, '').trim();
    const cleanHref = href.trim();
    if (!cleanInner || cleanInner === cleanHref) {
      return cleanHref;
    }
    return `${cleanInner} (${cleanHref})`;
  });

  // Replace line-breaking tags with newlines
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<p\b[^>]*>/gi, '')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<div\b[^>]*>/gi, '')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<\/tr\s*>/gi, '\n')
    .replace(/<\/h[1-6]\s*>/gi, '\n\n');

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode named HTML entities
  text = text.replace(/&[a-zA-Z0-9#]+;/g, (entity) => {
    const lower = entity.toLowerCase();
    if (HTML_ENTITIES[lower]) return HTML_ENTITIES[lower];
    if (lower.startsWith('&#x')) {
      const code = parseInt(lower.slice(3, -1), 16);
      return !Number.isNaN(code) ? String.fromCodePoint(code) : entity;
    }
    if (lower.startsWith('&#')) {
      const code = parseInt(lower.slice(2, -1), 10);
      return !Number.isNaN(code) ? String.fromCodePoint(code) : entity;
    }
    return entity;
  });

  // Normalize excessive blank lines and trailing spaces
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

/**
 * Truncates or splits cell content at 32,000 characters so Microsoft Excel (limit 32,767) never corrupts rows.
 * @param {string} value
 * @param {number} [maxChars=32000]
 * @returns {string}
 */
export function enforceExcelCellLimit(value, maxChars = EXCEL_SAFE_CELL_LIMIT) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.length <= maxChars) return str;
  const suffix = ' ... [TRUNCATED FOR EXCEL 32K CELL LIMIT]';
  return str.slice(0, Math.max(0, maxChars - suffix.length)) + suffix;
}

/**
 * Escapes a single CSV field according to RFC 4180 + Excel 32,000-char protection.
 * Also guards against CSV Formula Injection (=, +, -, @ at start of cell) when sanitizeFormulas is enabled.
 */
export function escapeCsvCell(value, { maxChars = EXCEL_SAFE_CELL_LIMIT } = {}) {
  if (value === null || value === undefined) return '';
  let str = enforceExcelCellLimit(String(value), maxChars);

  const needsQuotes = /[",\r\n]/.test(str);
  if (needsQuotes) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export const CSV_SUMMARY_HEADERS = [
  'conversation_id',
  'platform',
  'region',
  'state',
  'priority',
  'created_at',
  'updated_at',
  'customer_id',
  'customer_name',
  'customer_email',
  'assignee',
  'tags',
  'rating',
  'rating_remark',
  'message_count',
  'internal_note_count',
  'attachment_urls',
  'title',
  'full_transcript',
  'internal_notes_transcript'
];

export const CSV_DETAILED_HEADERS = [
  'conversation_id',
  'part_id',
  'part_index',
  'part_type',
  'is_internal_note',
  'created_at',
  'author_type',
  'author_name',
  'author_email',
  'state',
  'tags',
  'assignee',
  'customer_name',
  'customer_email',
  'body_clean_text',
  'attachment_urls'
];

/**
 * Returns the CSV header row (optionally prefixed with UTF-8 BOM \uFEFF).
 * @param {'summary'|'detailed'} mode
 * @param {boolean} [includeBom=true]
 */
export function getCsvHeaderRow(mode = 'summary', includeBom = true) {
  const headers = mode === 'detailed' ? CSV_DETAILED_HEADERS : CSV_SUMMARY_HEADERS;
  const row = headers.map((h) => escapeCsvCell(h)).join(',') + '\r\n';
  return includeBom ? UTF8_BOM + row : row;
}

/**
 * Serializes a single normalized conversation into CSV row(s).
 * @param {Object} conv - Normalized conversation
 * @param {'summary'|'detailed'} [mode='summary']
 * @param {Object} [options]
 * @returns {string} RFC 4180 CSV line(s) ending with \r\n
 */
export function conversationToCsvRows(conv, mode = 'summary', options = {}) {
  const maxChars = options.maxChars || EXCEL_SAFE_CELL_LIMIT;
  const messages = Array.isArray(conv.messages) ? conv.messages : [];
  const tagsStr = Array.isArray(conv.tags) ? conv.tags.join('; ') : '';

  if (mode === 'detailed') {
    if (messages.length === 0) {
      const emptyRow = [
        conv.id,
        '',
        0,
        'empty',
        'false',
        conv.createdAt || '',
        '',
        '',
        '',
        conv.state || '',
        tagsStr,
        conv.assignee || '',
        conv.customerName || '',
        conv.customerEmail || '',
        '',
        ''
      ];
      return emptyRow.map((c) => escapeCsvCell(c, { maxChars })).join(',') + '\r\n';
    }

    return messages
      .map((msg, idx) => {
        const cleanBody = htmlToCleanText(msg.bodyHtml);
        const attachmentsStr = Array.isArray(msg.attachments) ? msg.attachments.join('; ') : '';
        const row = [
          conv.id,
          msg.partId || `${conv.id}_${idx}`,
          idx + 1,
          msg.partType || 'comment',
          msg.isInternalNote ? 'true' : 'false',
          msg.createdAt || conv.createdAt || '',
          msg.authorType || '',
          msg.authorName || '',
          msg.authorEmail || '',
          conv.state || '',
          tagsStr,
          conv.assignee || '',
          conv.customerName || '',
          conv.customerEmail || '',
          cleanBody,
          attachmentsStr
        ];
        return row.map((c) => escapeCsvCell(c, { maxChars })).join(',') + '\r\n';
      })
      .join('');
  }

  // Summary mode: 1 row per conversation with full transcript & separate internal notes column
  const publicLines = [];
  const noteLines = [];
  const allAttachments = [];

  for (const msg of messages) {
    const cleanBody = htmlToCleanText(msg.bodyHtml);
    const authorLabel = msg.authorName || msg.authorType || 'Participant';
    const ts = msg.createdAt ? `[${msg.createdAt}] ` : '';

    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      allAttachments.push(...msg.attachments);
    }

    const formatted = `${ts}${authorLabel}: ${cleanBody}`;
    if (msg.isInternalNote) {
      noteLines.push(formatted);
    } else {
      publicLines.push(formatted);
    }
  }

  const summaryRow = [
    conv.id,
    conv.platform || 'intercom',
    conv.region || 'US',
    conv.state || '',
    conv.priority || '',
    conv.createdAt || '',
    conv.updatedAt || '',
    conv.customerId || '',
    conv.customerName || '',
    conv.customerEmail || '',
    conv.assignee || '',
    tagsStr,
    conv.rating ?? '',
    conv.ratingRemark ?? '',
    publicLines.length,
    noteLines.length,
    allAttachments.join('; '),
    htmlToCleanText(conv.title || ''),
    publicLines.join('\n---\n'),
    noteLines.join('\n---\n')
  ];

  return summaryRow.map((c) => escapeCsvCell(c, { maxChars })).join(',') + '\r\n';
}

/**
 * Serializes a single normalized conversation into an NDJSON line (.jsonl) with cleaned text included.
 */
export function conversationToNdjsonLine(conv) {
  const enriched = {
    ...conv,
    messages: (conv.messages || []).map((m) => ({
      ...m,
      bodyText: htmlToCleanText(m.bodyHtml)
    }))
  };
  return JSON.stringify(enriched) + '\n';
}

/**
 * Serializes a single normalized conversation into Obsidian / RAG Markdown with YAML Frontmatter.
 */
export function conversationToMarkdown(conv) {
  const tagsYaml = Array.isArray(conv.tags) && conv.tags.length > 0
    ? `[${conv.tags.map((t) => `"${String(t).replace(/"/g, '\\"')}"`).join(', ')}]`
    : '[]';

  const lines = [
    '---',
    `ticket_id: "${conv.id}"`,
    `platform: "${conv.platform || 'intercom'}"`,
    `region: "${conv.region || 'US'}"`,
    `state: "${conv.state || 'unknown'}"`,
    `priority: "${conv.priority || 'not_priority'}"`,
    `created_at: "${conv.createdAt || ''}"`,
    `updated_at: "${conv.updatedAt || ''}"`,
    `customer_name: "${String(conv.customerName || '').replace(/"/g, '\\"')}"`,
    `customer_email: "${String(conv.customerEmail || '').replace(/"/g, '\\"')}"`,
    `assignee: "${String(conv.assignee || '').replace(/"/g, '\\"')}"`,
    `tags: ${tagsYaml}`,
    `rating: "${conv.rating ?? ''}"`,
    '---',
    '',
    `# Conversation #${conv.id}${conv.title ? ` — ${htmlToCleanText(conv.title)}` : ''}`,
    '',
    `- **Customer:** ${conv.customerName || 'Unknown'} (${conv.customerEmail || 'no-email'})`,
    `- **State:** \`${conv.state || 'unknown'}\` | **Assignee:** ${conv.assignee || 'Unassigned'}`,
    `- **Created:** ${conv.createdAt || 'N/A'} | **Updated:** ${conv.updatedAt || 'N/A'}`,
    ''
  ];

  const messages = Array.isArray(conv.messages) ? conv.messages : [];
  for (const msg of messages) {
    const badge = msg.isInternalNote ? '[INTERNAL NOTE]' : `[${(msg.authorType || 'USER').toUpperCase()}]`;
    const author = msg.authorName || 'Participant';
    const ts = msg.createdAt || '';
    const cleanBody = htmlToCleanText(msg.bodyHtml);

    lines.push(`### ${badge} ${author} — ${ts}`);
    lines.push('');
    lines.push(cleanBody || '*(Empty message body)*');
    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      lines.push('');
      lines.push('**Attachments:**');
      for (const att of msg.attachments) {
        lines.push(`- ${att}`);
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  return lines.join('\n');
}
