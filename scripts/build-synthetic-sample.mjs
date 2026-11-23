import { writeFileSync, mkdirSync } from 'node:fs';
import { getCsvHeaderRow, conversationToCsvRows } from '../src/core/serializers.js';

const conversation = {
  id: '950001',
  state: 'closed',
  tags: ['SSO'],
  messages: [
    { authorName: 'Customer', bodyHtml: 'SSO stopped working after our certificate rotation.' },
    { authorName: 'Support', bodyHtml: 'We refreshed the cached certificate. Please try again.' },
    { authorName: 'Support', isInternalNote: true, bodyHtml: 'Confirm the new certificate is active before closing.' }
  ]
};

const directory = new URL('../site/samples/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL('chatvault-transcript-sample.csv', directory), getCsvHeaderRow() + conversationToCsvRows(conversation));
