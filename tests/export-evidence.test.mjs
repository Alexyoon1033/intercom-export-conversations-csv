import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SandboxDemoAdapter } from '../src/core/sandbox-demo.js';

import { IntercomAdapter } from '../src/adapters/intercom.js';
import { CheckpointDB } from '../src/core/checkpoint-db.js';
import { createExportAudit } from '../src/core/export-audit.js';
import { classifyLicense, getExportEntitlements, requiresAdvancedExport } from '../src/core/license-entitlements.js';
import { ExportEngine } from '../src/core/export-engine.js';
import { formatSkippedErrors } from '../src/core/export-privacy.js';
import { FileStreamer } from '../src/core/file-streamer.js';
import { buildExportZipBundle, loadLocalJSZip } from '../src/core/zip-packager.js';

const conversation = {
  id: 'demo1',
  customerEmail: 'customer@example.test',
  title: 'Contact customer&#64;example.test',
  customAttributes: { phone: 421901234567, billing: ['4111 1111 1111 1111'] },
  messages: [
    { bodyHtml: '<p>Call +421 (901) 234-567 or contact customer&#x40;example.test</p><img src="https://example.test/private.png">', attachments: ['https://example.test/private.png'] },
    { isInternalNote: true, bodyHtml: 'Card 4111-1111-1111-1111' }
  ]
};

function mockIntercom(ids) {
  const adapter = new IntercomAdapter();
  adapter.listConversationsPage = async () => ({ conversations: ids.map(id => ({ id })), totalCount: ids.length });
  adapter.fetchConversationDetail = async (id) => id === 'demo1'
    ? { conversation }
    : { skipped: true, id, status: 403, reason: 'private reason customer@example.test' };
  return adapter;
}

test('masked CSV, NDJSON and Markdown exports cover preview and omit attachments and identifiers from error logs', async () => {
  for (const format of ['csv', 'jsonl', 'md']) {
    const engine = new ExportEngine({
      adapter: mockIntercom(['demo1', 'restricted']),
      streamer: new FileStreamer({ format, preferDiskStream: false }),
      format, maskPatterns: true, bundleAttachmentsZip: true
    });
    const result = await engine.run({ triggerBrowserDownload: false });
    const transcript = result.getText();
    assert.match(transcript, /\[REDACTED_EMAIL\]/);
    assert.match(transcript, /\[REDACTED_PHONE\]/);
    assert.match(transcript, /\[REDACTED_CARD\]/);
    assert.doesNotMatch(transcript + JSON.stringify(result.samplePreview), /example\.test|private\.png|421901234567|4111[- ]1111/);
    assert.deepEqual(result.attachmentManifest, []);
    assert.deepEqual(formatSkippedErrors(result.skippedErrors, true), [{ status: 403 }]);
    assert.equal(result.segmentConversations, 1);
    assert.equal(result.segmentSkipped, 1);
    assert.equal(result.segmentMessages, 2);
    assert.equal(result.segmentNotes, 1);
  }
  assert.equal(conversation.customerEmail, 'customer@example.test');
});

test('audit uses exact transcript bytes, preserves trailing and all-skipped records, and travels inside ZIP', async () => {
  const options = { triggerBrowserDownload: false };
  const result = await new ExportEngine({
    adapter: mockIntercom(['demo1', 'restricted']),
    streamer: new FileStreamer({ preferDiskStream: false })
  }).run(options);
  const contents = result.getText();
  const hash = createHash('sha256').update(contents).digest('hex');
  const audit = await createExportAudit(result, { sandbox: true });
  assert.ok(audit.includes(hash));
  assert.match(audit, /Conversation detail attempts in this segment: 2/);
  assert.match(audit, /Internal note records processed in this segment: 1/);
  const bundle = await buildExportZipBundle({ transcriptContent: contents, auditText: audit });
  const zip = await (await loadLocalJSZip()).loadAsync(bundle.uint8);
  assert.equal(await zip.file('export_audit_report.txt').async('string'), audit);
  assert.equal(createHash('sha256').update(await zip.file('chatvault-transcripts.csv').async('uint8array')).digest('hex'), hash);

  const skipped = await new ExportEngine({
    adapter: mockIntercom(['restricted']),
    streamer: new FileStreamer({ preferDiskStream: false })
  }).run(options);
  assert.equal(skipped.segmentSkipped, 1);
  assert.equal(skipped.segmentConversations, 0);
  const wrongSize = await createExportAudit({ ...result, bytesWritten: result.bytesWritten + 1 });
  assert.match(wrongSize, /Unavailable/);
});

test('hashes a 50 MiB transcript in bounded chunks', async () => {
  const oneMiB = new Uint8Array(1024 * 1024).fill(0x61);
  const file = new Blob(Array(50).fill(oneMiB));
  const expected = createHash('sha256');
  for (let index = 0; index < 50; index++) expected.update(oneMiB);
  let readCount = 0;
  const report = await createExportAudit({
    bytesWritten: file.size,
    getFile: () => ({
      size: file.size,
      slice(start, end) {
        assert.ok(end - start <= 1024 * 1024);
        readCount++;
        return file.slice(start, end);
      }
    })
  });
  assert.equal(readCount, 50);
  assert.ok(report.includes(expected.digest('hex')));
});

test('only the new verified Core Basic variant loses advanced features', () => {
  for (const purchase of [
    { variants: 'Basic', price: 2900 }, { variants: 'Pro', price: 0 },
    { variants: 'Standard', price: 4900 }, { variants: 'Agency', price: 3900 },
    { price: 2900 }, { variants: 'unknown' }
  ]) {
    assert.deepEqual(getExportEntitlements({ valid: true, ...classifyLicense(purchase) }), {
      advanced: true, maxConversations: Infinity
    });
  }
  assert.equal(classifyLicense({ variants: 'Basic (Core export)', price: 14900 }).plan, 'basic');
  assert.deepEqual(getExportEntitlements({ valid: true, plan: 'basic' }), { advanced: false, maxConversations: Infinity });
  assert.deepEqual(getExportEntitlements({ valid: true, tier: 'Basic ($29)' }), { advanced: true, maxConversations: Infinity });
  assert.deepEqual(getExportEntitlements({ valid: false }), { advanced: false, maxConversations: 50 });
  assert.deepEqual(getExportEntitlements(null, true), { advanced: true, maxConversations: 500 });
  assert.equal(requiresAdvancedExport({ filters: { state: 'closed' } }), true);
  assert.equal(requiresAdvancedExport({ bundleZip: true }), true);
  assert.equal(requiresAdvancedExport({ maskPatterns: true }), true);
  assert.equal(requiresAdvancedExport({ deepExport: true }), true);
  assert.equal(requiresAdvancedExport({ filters: { state: '' } }), false);
});

test('a controlled pause saves settings and the next segment counts its own output', async () => {
  const controller = new AbortController();
  const db = new CheckpointDB();
  const settings = { isSandbox: true, maskPatterns: true, filters: { tag: 'test' } };
  const engine = new ExportEngine({
    adapter: mockIntercom(['demo1', 'restricted']),
    streamer: new FileStreamer({ preferDiskStream: false }),
    checkpointDb: db,
    maskPatterns: true,
    onProgress: () => controller.abort()
  });
  const stopped = await engine.run({ signal: controller.signal, runSettings: settings, triggerBrowserDownload: false });
  const checkpoint = await db.loadCheckpoint('active_export');
  assert.equal(stopped.aborted, true);
  assert.equal(checkpoint.readyToResume, true);
  assert.deepEqual(checkpoint.runSettings, settings);

  const next = await new ExportEngine({
    adapter: mockIntercom(['demo1', 'restricted']),
    streamer: new FileStreamer({ preferDiskStream: false }),
    checkpointDb: db,
    maskPatterns: true
  }).run({ resumeSnapshot: checkpoint, runSettings: settings, triggerBrowserDownload: false });
  assert.equal(next.resumed, true);
  assert.equal(next.segmentConversations, 0);
  assert.equal(next.exportedCount, 1);
  assert.equal(next.segmentSkipped, 1);
  assert.match(await createExportAudit(stopped), /Paused \(partial output\)/);
});

test('500-record masked sandbox completes with stable counts and a hash', async () => {
  const result = await new ExportEngine({
    adapter: new SandboxDemoAdapter({ totalDemoCount: 500 }),
    streamer: new FileStreamer({ preferDiskStream: false }),
    maskPatterns: true, maxConversations: 500
  }).run({ triggerBrowserDownload: false });
  assert.equal(result.segmentConversations, 500);
  assert.equal(result.segmentSkipped, 0);
  assert.match(await createExportAudit(result, { sandbox: true, masked: true }), /Transcript SHA-256: [a-f0-9]{64}/);
});

test('customer-input cost comparison responds to valid inputs and ignores invalid estimates', () => {
  const fields = {
    estimatedHours: { value: '4', valueAsNumber: 4, validity: { valid: true } },
    hourlyRate: { value: '85', valueAsNumber: 85, validity: { valid: true } },
    migrationQuote: { value: '600', valueAsNumber: 600, validity: { valid: true } },
    costEstimateResult: { textContent: '' },
    costEstimate: { addEventListener: (event, listener) => {
      assert.equal(event, 'input');
      fields.onInput = listener;
    } }
  };
  runInNewContext(readFileSync(new URL('../site/src/cost-estimate.js', import.meta.url), 'utf8'), {
    document: { getElementById: id => fields[id] }
  });
  fields.onInput();
  assert.equal(fields.costEstimateResult.textContent, 'Your estimated internal labor: $340.00. Your alternative quote: $600.00.');
  fields.hourlyRate.validity.valid = false;
  fields.migrationQuote.value = '';
  fields.onInput();
  assert.equal(fields.costEstimateResult.textContent, 'Enter your own estimates to compare costs.');
});
