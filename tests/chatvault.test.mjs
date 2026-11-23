/**
 * ChatVault Comprehensive Automated Unit & Integration Test Suite (Step 5 Verification)
 * Verifies all 19 architectural defenses:
 * 1. HTML cleanup, Excel UTF-8 BOM (\uFEFF), 32,000-character Excel cell overflow protection, RFC 4180 CSV double-quote escaping
 * 2. Intercom API v2.11 multi-region auto-detection (US -> EU -> AU), cursor pagination (starting_after),
 *    HTTP 429 Retry-After backoff, X-RateLimit-Remaining < 20 throttling, and 404/403 fault-tolerant skipping
 * 3. Gumroad 4-fold license verification (success && !refunded && !disputed && !chargebacked), 7-day offline cache,
 *    and 5xx server outage automatic 7-day grace extension for verified customers
 * 4. IndexedDB checkpoint persistence every 50 conversations & seamless interrupted export Resume integrity
 * 5. 500-Chat Interactive Sandbox Demo Mode & Direct-to-Disk FileSystemWritableFileStream + Blob fallback
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UTF8_BOM,
  EXCEL_SAFE_CELL_LIMIT,
  htmlToCleanText,
  enforceExcelCellLimit,
  escapeCsvCell,
  getCsvHeaderRow,
  conversationToCsvRows,
  conversationToNdjsonLine,
  conversationToMarkdown
} from '../src/core/serializers.js';

import { IntercomAdapter } from '../src/adapters/intercom.js';
import { GumroadLicenseManager } from '../src/core/gumroad-license.js';
import { CheckpointDB } from '../src/core/checkpoint-db.js';
import { FileStreamer } from '../src/core/file-streamer.js';
import { SandboxDemoAdapter } from '../src/core/sandbox-demo.js';
import { ExportEngine } from '../src/core/export-engine.js';
import { buildExportZipBundle } from '../src/core/zip-packager.js';

test('Suite 1: HTML sanitization, Excel UTF-8 BOM, 32,000-char cell guard, and RFC 4180 CSV escaping', async (t) => {
  await t.test('htmlToCleanText converts <p>, <br>, <a>, <li>, and HTML entities cleanly', () => {
    const dirtyHtml =
      '<p>Hello &amp; welcome!</p><p>Line 1<br/>Line 2 with &quot;quotes&quot; and &#39;apostrophes&#39;.</p>' +
      '<ul><li>Item A</li><li>Check <a href="https://example.com/docs">API Docs</a></li></ul>';
    const clean = htmlToCleanText(dirtyHtml);

    assert.ok(clean.includes('Hello & welcome!'));
    assert.ok(clean.includes('Line 1\nLine 2 with "quotes" and \'apostrophes\'.'));
    assert.ok(clean.includes('• Item A'));
    assert.ok(clean.includes('• Check API Docs (https://example.com/docs)'));
    assert.ok(!clean.includes('<p>'));
    assert.ok(!clean.includes('</ul>'));
  });

  await t.test('getCsvHeaderRow includes UTF-8 BOM (\\uFEFF) for Excel multi-language safety', () => {
    const summaryHeader = getCsvHeaderRow('summary', true);
    assert.ok(summaryHeader.startsWith(UTF8_BOM));
    assert.ok(summaryHeader.includes('conversation_id,platform,region'));
    assert.ok(summaryHeader.includes('full_transcript,internal_notes_transcript'));

    const detailedHeader = getCsvHeaderRow('detailed', true);
    assert.ok(detailedHeader.startsWith(UTF8_BOM));
    assert.ok(detailedHeader.includes('part_id,part_index,part_type,is_internal_note'));
  });

  await t.test('enforceExcelCellLimit & escapeCsvCell protect against >32,000 char Excel cell corruption and escape RFC 4180 quotes/newlines', () => {
    const hugeString = 'A'.repeat(45000);
    const guarded = enforceExcelCellLimit(hugeString);
    assert.equal(guarded.length, EXCEL_SAFE_CELL_LIMIT);
    assert.ok(guarded.endsWith('[TRUNCATED FOR EXCEL 32K CELL LIMIT]'));

    const trickyCell = 'Hello, "World"\nSecond line with Korean: 한글 테스트';
    const escaped = escapeCsvCell(trickyCell);
    assert.equal(escaped, '"Hello, ""World""\nSecond line with Korean: 한글 테스트"');
  });

  await t.test('conversationToCsvRows (summary & detailed), NDJSON, and Obsidian Markdown serialize accurately', () => {
    const sampleConv = {
      id: '9001',
      platform: 'intercom',
      region: 'EU',
      title: 'SAML Issue',
      state: 'closed',
      priority: 'priority',
      createdAt: '2026-11-22T10:00:00.000Z',
      updatedAt: '2026-11-22T10:15:00.000Z',
      tags: ['enterprise', 'sso'],
      assignee: 'Sarah',
      customerId: 'c_1',
      customerName: 'Elena',
      customerEmail: 'elena@acme.io',
      rating: 5,
      ratingRemark: 'Great!',
      messages: [
        {
          partId: 'p1',
          partType: 'conversation_initiation',
          authorType: 'user',
          authorName: 'Elena',
          authorEmail: 'elena@acme.io',
          bodyHtml: '<p>Need help with "SAML", please!</p>',
          createdAt: '2026-11-22T10:00:00.000Z',
          isInternalNote: false,
          attachments: ['https://files.acme.io/log.txt']
        },
        {
          partId: 'p2',
          partType: 'note',
          authorType: 'admin',
          authorName: 'Sarah',
          authorEmail: 'sarah@support.io',
          bodyHtml: '<p>Internal secret note</p>',
          createdAt: '2026-11-22T10:05:00.000Z',
          isInternalNote: true,
          attachments: []
        }
      ]
    };

    const summaryCsv = conversationToCsvRows(sampleConv, 'summary');
    assert.ok(summaryCsv.includes('9001,intercom,EU,closed,priority'));
    assert.ok(summaryCsv.includes('Need help with ""SAML"", please!'));
    assert.ok(summaryCsv.includes('Internal secret note'));

    const detailedCsv = conversationToCsvRows(sampleConv, 'detailed');
    const lines = detailedCsv.trim().split('\r\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes(',false,'));
    assert.ok(lines[1].includes(',true,'));

    const ndjson = conversationToNdjsonLine(sampleConv);
    const parsed = JSON.parse(ndjson);
    assert.equal(parsed.id, '9001');
    assert.equal(parsed.messages[0].bodyText, 'Need help with "SAML", please!');

    const md = conversationToMarkdown(sampleConv);
    assert.ok(md.includes('ticket_id: "9001"'));
    assert.ok(md.includes('### [INTERNAL NOTE] Sarah'));
  });
});

test('Suite 2: Intercom API v2.11 Adapter — Multi-Region Detection, Cursor Pagination, 429 Retry, Rate-Limit Throttling & 404/403 Skip', async (t) => {
  await t.test('Auto-detects EU region when US returns 401 and EU returns 200', async () => {
    const mockFetch = async (url) => {
      if (url.startsWith('https://api.intercom.io/me')) {
        return { status: 401, ok: false, headers: new Map() };
      }
      if (url.startsWith('https://api.eu.intercom.io/me')) {
        return {
          status: 200,
          ok: true,
          headers: new Map(),
          json: async () => ({ app: { name: 'EU FinTech Workspace', id_code: 'eu_123' }, email: 'admin@eu.io' })
        };
      }
      if (url.startsWith('https://api.eu.intercom.io/conversations?per_page=1')) {
        return {
          status: 200,
          ok: true,
          headers: new Map(),
          json: async () => ({ total_count: 1420, conversations: [{ id: '1' }] })
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const adapter = new IntercomAdapter({
      token: 'dG9r_eu_test',
      region: 'AUTO',
      fetchFn: mockFetch
    });

    const detected = await adapter.verifyAndDetectRegion();
    assert.equal(detected.region, 'EU');
    assert.equal(detected.workspaceName, 'EU FinTech Workspace');
    assert.equal(detected.totalCount, 1420);
  });

  await t.test('Handles cursor pagination, X-RateLimit-Remaining < 20 throttling, HTTP 429 Retry-After, and skips 404/403 tickets without halting', async () => {
    const sleepCalls = [];
    const rateLimitEvents = [];
    let conv102Attempts = 0;

    const makeHeaders = (mapObj) => ({
      get: (k) => {
        const foundKey = Object.keys(mapObj).find((key) => key.toLowerCase() === k.toLowerCase());
        return foundKey ? String(mapObj[foundKey]) : null;
      }
    });

    const mockFetch = async (url) => {
      // Page 1 of conversations list
      if (url === 'https://api.intercom.io/conversations?per_page=150') {
        return {
          status: 200,
          ok: true,
          headers: makeHeaders({ 'X-RateLimit-Remaining': '85' }),
          json: async () => ({
            total_count: 4,
            conversations: [{ id: '101' }, { id: '404_deleted' }],
            pages: { next: { starting_after: 'cursor_page_2' } }
          })
        };
      }

      // Page 2 of conversations list (triggers low X-RateLimit-Remaining = 12 < 20)
      if (url === 'https://api.intercom.io/conversations?per_page=150&starting_after=cursor_page_2') {
        return {
          status: 200,
          ok: true,
          headers: makeHeaders({ 'X-RateLimit-Remaining': '12', 'X-RateLimit-Reset': '2' }),
          json: async () => ({
            total_count: 4,
            conversations: [{ id: '403_restricted' }, { id: '102' }],
            pages: {}
          })
        };
      }

      // Conversation 101 detail -> normal 200
      if (url.includes('/conversations/101')) {
        return {
          status: 200,
          ok: true,
          headers: makeHeaders({ 'X-RateLimit-Remaining': '84' }),
          json: async () => ({
            id: '101',
            state: 'closed',
            created_at: 1700000000,
            updated_at: 1700000600,
            source: { id: 's101', body: '<p>First ticket</p>', author: { type: 'user', name: 'Alice' } },
            conversation_parts: {
              conversation_parts: [
                { id: 'p101', part_type: 'comment', body: '<p>Agent reply</p>', author: { type: 'admin', name: 'Bob' }, created_at: 1700000300 }
              ]
            }
          })
        };
      }

      // Conversation 404_deleted -> returns 404
      if (url.includes('/conversations/404_deleted')) {
        return {
          status: 404,
          ok: false,
          headers: makeHeaders({ 'X-RateLimit-Remaining': '83' })
        };
      }

      // Conversation 403_restricted -> returns 403
      if (url.includes('/conversations/403_restricted')) {
        return {
          status: 403,
          ok: false,
          headers: makeHeaders({ 'X-RateLimit-Remaining': '80' })
        };
      }

      // Conversation 102 -> returns 429 first time, then 200
      if (url.includes('/conversations/102')) {
        conv102Attempts++;
        if (conv102Attempts === 1) {
          return {
            status: 429,
            ok: false,
            headers: makeHeaders({ 'Retry-After': '3', 'X-RateLimit-Remaining': '0' })
          };
        }
        return {
          status: 200,
          ok: true,
          headers: makeHeaders({ 'X-RateLimit-Remaining': '180' }),
          json: async () => ({
            id: '102',
            state: 'open',
            created_at: 1700001000,
            updated_at: 1700001600,
            source: { id: 's102', body: '<p>Second valid ticket after 429 retry</p>', author: { type: 'user', name: 'Charlie' } },
            conversation_parts: { conversation_parts: [] }
          })
        };
      }

      throw new Error(`Unhandled mock URL: ${url}`);
    };

    const adapter = new IntercomAdapter({
      token: 'dG9r_us_test',
      region: 'US',
      fetchFn: mockFetch,
      sleepFn: async (ms) => {
        sleepCalls.push(ms);
      },
      onRateLimitWait: (evt) => {
        rateLimitEvents.push(evt);
      }
    });

    const exported = [];
    let finalSkipped = [];
    for await (const item of adapter.exportStream()) {
      exported.push(item.conversation);
      finalSkipped = item.skippedErrors;
    }

    assert.equal(exported.length, 2);
    assert.equal(exported[0].id, '101');
    assert.equal(exported[1].id, '102');

    // Verify 404 and 403 were cleanly recorded in skippedErrors without crashing
    assert.equal(finalSkipped.length, 2);
    assert.equal(finalSkipped[0].id, '404_deleted');
    assert.equal(finalSkipped[0].status, 404);
    assert.equal(finalSkipped[1].id, '403_restricted');
    assert.equal(finalSkipped[1].status, 403);

    // Verify both X-RateLimit-Remaining (<20) and HTTP 429 triggered rate-limit waits
    assert.equal(rateLimitEvents.length, 2);
    assert.ok(rateLimitEvents.some((e) => e.reason.includes('X-RateLimit-Remaining is low')));
    assert.ok(rateLimitEvents.some((e) => e.reason.includes('HTTP 429')));
    assert.equal(sleepCalls.length, 2);
  });
});

test('Suite 3: Gumroad 4-Fold License Verification + 7-Day Cache + 5xx Outage Grace Extension', async (t) => {
  await t.test('Approves valid license and blocks refunded, disputed, or chargebacked keys', async () => {
    let mockPayload = {};
    let currentTime = 1_700_000_000_000;

    const manager = new GumroadLicenseManager({
      nowFn: () => currentTime,
      fetchFn: async () => ({
        status: 200,
        ok: true,
        json: async () => mockPayload
      })
    });

    // 1. Valid 3-Tier Licenses (Basic $29, Pro $79, Agency $149)
    mockPayload = {
      success: true,
      uses: 1,
      purchase: {
        email: 'buyer@company.io',
        sale_id: 'sale_01',
        refunded: false,
        disputed: false,
        chargebacked: false,
        variants: 'Basic',
        price: 2900
      }
    };
    const resBasic = await manager.verifyLicenseKey('BASIC-KEY-29');
    assert.equal(resBasic.valid, true);
    assert.equal(resBasic.tier, 'Basic ($29)');

    mockPayload = {
      success: true,
      uses: 1,
      purchase: {
        email: 'pro@company.io',
        sale_id: 'sale_02',
        refunded: false,
        disputed: false,
        chargebacked: false,
        variants: 'Pro',
        price: 7900
      }
    };
    const resValid = await manager.verifyLicenseKey('VALID-KEY-79');
    assert.equal(resValid.valid, true);
    assert.equal(resValid.tier, 'Pro ($79)');

    // 2. Refunded key -> blocked immediately
    mockPayload = {
      success: true,
      purchase: { refunded: true, disputed: false, chargebacked: false }
    };
    const resRefunded = await manager.verifyLicenseKey('REFUNDED-KEY');
    assert.equal(resRefunded.valid, false);
    assert.ok(resRefunded.reason.includes('refunded'));

    // 3. Disputed key -> blocked immediately
    mockPayload = {
      success: true,
      purchase: { refunded: false, disputed: true, chargebacked: false }
    };
    const resDisputed = await manager.verifyLicenseKey('DISPUTED-KEY');
    assert.equal(resDisputed.valid, false);
    assert.ok(resDisputed.reason.includes('dispute'));

    // 4. Chargebacked key -> blocked immediately
    mockPayload = {
      success: true,
      purchase: { refunded: false, disputed: false, chargebacked: true }
    };
    const resChargebacked = await manager.verifyLicenseKey('CHARGEBACK-KEY');
    assert.equal(resChargebacked.valid, false);
    assert.ok(resChargebacked.reason.includes('chargebacked'));
  });

  await t.test('Extends 7-day offline grace period when a previously verified customer encounters a Gumroad 5xx outage', async () => {
    let currentTime = 1_700_000_000_000;
    let shouldFail503 = false;

    const manager = new GumroadLicenseManager({
      nowFn: () => currentTime,
      fetchFn: async () => {
        if (shouldFail503) {
          return { status: 503, ok: false };
        }
        return {
          status: 200,
          ok: true,
          json: async () => ({
            success: true,
            uses: 2,
            purchase: {
              email: 'agency@partner.io',
              refunded: false,
              disputed: false,
              chargebacked: false,
              variants: 'Agency'
            }
          })
        };
      }
    });

    // Initial verification succeeds
    const initial = await manager.verifyLicenseKey('AGENCY-PRO-KEY');
    assert.equal(initial.valid, true);
    assert.equal(initial.tier, 'Agency ($149)');

    // Advance 8 days (past 7-day cache) and simulate Gumroad HTTP 503 outage
    currentTime += 8 * 24 * 60 * 60 * 1000;
    shouldFail503 = true;

    const statusDuringOutage = await manager.getLicenseStatus();
    assert.equal(statusDuringOutage.valid, true);
    assert.equal(statusDuringOutage.graceExtended, true);
    assert.equal(statusDuringOutage.maxConversations, Infinity);
  });
});

test('Suite 4: IndexedDB Checkpoint Save/Resume Integrity & 500-Chat Sandbox Streaming', async (t) => {
  await t.test('Pauses mid-export at 120 chats, saves checkpoint at 50-chat intervals, and resumes seamlessly to 500 chats without duplicates', async () => {
    const checkpointDb = new CheckpointDB();
    const abortController = new AbortController();

    const sandboxAdapter1 = new SandboxDemoAdapter({
      totalDemoCount: 500,
      simulateRateLimitPause: false,
      sleepFn: async () => {}
    });

    const streamer1 = new FileStreamer({
      format: 'jsonl',
      preferDiskStream: false
    });

    const savedCheckpoints = [];
    const engine1 = new ExportEngine({
      adapter: sandboxAdapter1,
      streamer: streamer1,
      checkpointDb,
      format: 'jsonl',
      maxConversations: 500,
      checkpointInterval: 50,
      onProgress: ({ exportedCount }) => {
        if (exportedCount === 120) {
          abortController.abort();
        }
      },
      onCheckpointSaved: (snap) => {
        savedCheckpoints.push(snap.exportedCount);
      }
    });

    const part1Result = await engine1.run({
      signal: abortController.signal,
      triggerBrowserDownload: false
    });

    assert.equal(part1Result.aborted, true);
    assert.equal(part1Result.exportedCount, 120);
    // Checkpoints should have been saved at 50, 100, and 120 (on abort)
    assert.deepEqual(savedCheckpoints, [50, 100, 120]);

    const loadedCheckpoint = await checkpointDb.loadCheckpoint('active_export');
    assert.ok(loadedCheckpoint);
    assert.equal(loadedCheckpoint.exportedCount, 120);
    assert.equal(loadedCheckpoint.completedIds.length, 120);

    // Resume from checkpoint (120 -> 500)
    const sandboxAdapter2 = new SandboxDemoAdapter({
      totalDemoCount: 500,
      simulateRateLimitPause: false,
      sleepFn: async () => {}
    });
    const streamer2 = new FileStreamer({
      format: 'jsonl',
      preferDiskStream: false
    });

    const engine2 = new ExportEngine({
      adapter: sandboxAdapter2,
      streamer: streamer2,
      checkpointDb,
      format: 'jsonl',
      maxConversations: 500,
      checkpointInterval: 50
    });

    const part2Result = await engine2.run({
      resumeSnapshot: loadedCheckpoint,
      triggerBrowserDownload: false
    });

    assert.equal(part2Result.aborted, false);
    assert.equal(part2Result.exportedCount, 500);

    // Checkpoint is cleared automatically upon 100% completion
    const afterCompleteCheckpoint = await checkpointDb.loadCheckpoint('active_export');
    assert.equal(afterCompleteCheckpoint, null);

    // Verify total unique lines across part 1 (120 lines) + part 2 (380 lines) = 500 unique conversations
    const lines1 = part1Result.getText().trim().split('\n');
    const lines2 = part2Result.getText().trim().split('\n');
    assert.equal(lines1.length, 120);
    assert.equal(lines2.length, 380);

    const allIds = new Set([...lines1, ...lines2].map((l) => JSON.parse(l).id));
    assert.equal(allIds.size, 500);
  });

  await t.test('Direct-to-Disk FileSystemWritableFileStream flushes batches every 50 conversations', async () => {
    const writtenDiskChunks = [];
    let streamClosed = false;

    const mockShowSaveFilePicker = async () => ({
      name: 'direct-disk-test.csv',
      createWritable: async () => ({
        write: async (chunk) => {
          writtenDiskChunks.push(chunk);
        },
        close: async () => {
          streamClosed = true;
        }
      })
    });

    const streamer = new FileStreamer({
      format: 'csv',
      preferDiskStream: true,
      showSaveFilePickerFn: mockShowSaveFilePicker
    });

    const sandboxAdapter = new SandboxDemoAdapter({
      totalDemoCount: 500,
      simulateRateLimitPause: false,
      sleepFn: async () => {}
    });

    const engine = new ExportEngine({
      adapter: sandboxAdapter,
      streamer,
      checkpointDb: new CheckpointDB(),
      format: 'csv',
      csvMode: 'summary',
      maxConversations: 50, // Free mode 50-chat hard cap test
      checkpointInterval: 25
    });

    const result = await engine.run({ triggerBrowserDownload: false });
    assert.equal(result.streamMode, 'disk-stream');
    assert.equal(result.exportedCount, 50);
    assert.equal(streamClosed, true);
    assert.ok(writtenDiskChunks.length >= 2);
    assert.ok(writtenDiskChunks[0].startsWith(UTF8_BOM));
  });
});

test('Suite 5: v1.1.0 Upgrades — Search API Filtering, Deep Export Contact Enrichment, Redacted/Null Edge Cases & Zero-Dependency Local ZIP', async (t) => {
  await t.test('Routes date/tag/state filters to POST /conversations/search and resolves tag name via GET /tags', async () => {
    const capturedRequests = [];

    const mockFetch = async (url, init) => {
      capturedRequests.push({ url, method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : null });

      if (url === 'https://api.intercom.io/tags') {
        return {
          status: 200,
          ok: true,
          headers: new Map(),
          json: async () => ({ data: [{ id: '98765', name: 'billing' }] })
        };
      }

      if (url === 'https://api.intercom.io/conversations/search') {
        return {
          status: 200,
          ok: true,
          headers: new Map(),
          json: async () => ({
            total_count: 1,
            conversations: [{ id: '777' }],
            pages: {}
          })
        };
      }

      if (url.includes('/conversations/777')) {
        return {
          status: 200,
          ok: true,
          headers: new Map(),
          json: async () => ({
            id: '777',
            state: 'closed',
            created_at: 1760000000,
            updated_at: 1760000900,
            team_assignee_id: 'team_billing',
            statistics: { time_to_admin_reply: 145, time_to_last_close: 900 },
            contacts: { contacts: [{ id: 'cnt_99' }] },
            custom_attributes: { ticket_tier: 'enterprise' },
            source: { id: 's777', body: '<p>Refund inquiry</p>', author: null, redacted: false },
            conversation_parts: {
              conversation_parts: [
                { id: 'p_redacted', part_type: 'comment', redacted: true, body: null, author: null, created_at: 1760000200 },
                { id: 'p_bot', part_type: 'bot_intro', body: '<p>Automated greeting</p>', author: { type: 'bot' }, created_at: 1760000250 }
              ]
            }
          })
        };
      }

      if (url === 'https://api.intercom.io/contacts/cnt_99') {
        return {
          status: 200,
          ok: true,
          headers: new Map(),
          json: async () => ({
            id: 'cnt_99',
            name: 'Dana Mercer',
            email: 'dana@acme.io',
            companies: { data: [{ id: 'co_1', name: 'Acme Corp' }] },
            custom_attributes: { plan: 'enterprise_annual' }
          })
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const adapter = new IntercomAdapter({ token: 'dG9r_search', region: 'US', fetchFn: mockFetch });
    const results = [];
    for await (const item of adapter.exportStream({
      filters: { startDate: '2026-10-01', endDate: '2026-10-31', tag: 'billing', state: 'closed' },
      deepExport: true
    })) {
      results.push(item);
    }

    assert.equal(results.length, 1);
    assert.equal(results[0].usedSearchApi, true);

    const searchCall = capturedRequests.find((r) => r.url.endsWith('/conversations/search'));
    assert.ok(searchCall);
    assert.equal(searchCall.method, 'POST');
    assert.equal(searchCall.body.query.operator, 'AND');
    assert.ok(searchCall.body.query.value.some((c) => c.field === 'tag_ids' && c.value === '98765'));
    assert.ok(searchCall.body.query.value.some((c) => c.field === 'state' && c.value === 'closed'));

    // Verify Deep Export enrichment & defensive redacted/null author handling
    const conv = results[0].conversation;
    assert.equal(conv.customerName, 'Dana Mercer');
    assert.deepEqual(conv.companies, ['Acme Corp']);
    assert.equal(conv.customAttributes.plan, 'enterprise_annual');
    assert.equal(conv.customAttributes.ticket_tier, 'enterprise');
    assert.equal(conv.firstResponseSec, 145);
    assert.ok(conv.messages.some((m) => m.bodyHtml === '[REDACTED MESSAGE]'));
    assert.ok(conv.messages.some((m) => m.authorName === 'Intercom Bot'));
  });

  await t.test('SandboxDemoAdapter applies tag and state filters accurately', async () => {
    const adapter = new SandboxDemoAdapter({ totalDemoCount: 100, simulateRateLimitPause: false, sleepFn: async () => {} });
    const filtered = [];
    for await (const item of adapter.exportStream({ filters: { tag: 'eu-vat', state: 'open' } })) {
      filtered.push(item.conversation);
    }
    assert.ok(filtered.length > 0 && filtered.length < 100);
    assert.ok(filtered.every((c) => c.state === 'open' && c.tags.includes('eu-vat')));
  });

  await t.test('buildExportZipBundle packages compressed DEFLATE archive via locally bundled JSZip v3.10.1 including attachment binaries', async () => {
    const bundle = await buildExportZipBundle({
      transcriptFileName: 'transcripts.csv',
      transcriptContent: UTF8_BOM + 'id,body\r\n1,"hello world"\r\n',
      skippedErrors: [{ id: '404_x', status: 404 }],
      attachmentManifest: [{ conversationId: '1', partId: 'p1', url: 'https://files.example.com/report.txt' }],
      downloadAttachmentBinaries: true,
      fetchFn: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode('attachment-file-bytes').buffer
      })
    });

    // Verify PK\x03\x04 ZIP header & attachment downloaded count
    assert.equal(bundle.uint8[0], 0x50);
    assert.equal(bundle.uint8[1], 0x4b);
    assert.equal(bundle.uint8[2], 0x03);
    assert.equal(bundle.uint8[3], 0x04);
    assert.equal(bundle.downloadedAttachmentsCount, 1);
    assert.equal(bundle.failedAttachmentsCount, 0);
    assert.ok(bundle.size > 100);
  });
});
