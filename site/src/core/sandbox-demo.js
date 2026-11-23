/**
 * ChatVault 500-Chat Interactive Sandbox Demo Mode
 * Generates 500 realistic B2B SaaS customer support conversations with:
 * - Multi-turn customer inquiries & teammate replies
 * - Internal teammate notes (part_type === 'note')
 * - Rich HTML formatting (<p>, <br>, <a>, <ul>/<li>, entities)
 * - Attachment metadata URLs
 * - Tags, priority, ratings, and simulated Rate-Limit header throttling
 * Runs 100% locally with zero API token required so users can test Excel CSV / NDJSON / Obsidian Markdown quality in 3 seconds,
 * and allows recording the 3-minute YouTube product demo at €0 cost.
 */

const SAMPLE_COMPANIES = [
  { name: 'Acme Cloud Ops', domain: 'acmecloud.io' },
  { name: 'Northstar FinTech', domain: 'northstarhq.com' },
  { name: 'Veloce Logistics', domain: 'velocelogistics.eu' },
  { name: 'Kinetix AI Labs', domain: 'kinetix.ai' },
  { name: 'BluePeak Health', domain: 'bluepeakhealth.org' },
  { name: 'Synthetix Data', domain: 'synthetixdata.co' },
  { name: 'Aurum Payments', domain: 'aurumpay.com' },
  { name: 'Stratos DevTools', domain: 'stratos.dev' }
];

const SAMPLE_CUSTOMERS = [
  'Elena Rostova',
  'Marcus Vance',
  'Ji-Hoon Park',
  'Sophie Laurent',
  'Liam O’Connor',
  'Priya Nair',
  'Tobias Lindqvist',
  'Hannah Abbott'
];

const SAMPLE_TEAMMATES = [
  { name: 'Sarah Jenkins (Tier-2 Support)', email: 'sarah.j@chatvault-demo.io' },
  { name: 'David Kim (Solutions Engineer)', email: 'david.k@chatvault-demo.io' },
  { name: 'Alex Rivera (Billing & Ops)', email: 'alex.r@chatvault-demo.io' },
  { name: 'Clara Rossi (Customer Success)', email: 'clara.r@chatvault-demo.io' }
];

const SAMPLE_TOPICS = [
  {
    subject: 'SSO SAML 2.0 assertion error after Okta certificate rotation',
    tags: ['sso-saml', 'enterprise', 'security'],
    priority: 'priority',
    state: 'closed',
    customerOpeningHtml:
      '<p>Hi Support Team,</p><p>We rotated our Okta signing certificate this morning and now 45 users in our EU workspace are getting <code>SAML_SIGNATURE_MISMATCH</code> when logging in.</p><p>Here is our metadata reference: <a href="https://status.example.com/sso-guide">Okta SAML Metadata</a>.<br>Can you help us verify the fingerprint urgently?</p>',
    internalNoteHtml:
      '<p><strong>[Internal Escalation Note]</strong> Checked tenant ID <code>eu-west-8841</code>. Their cached X.509 cert still points to the old SHA-1 thumbprint. Flushing Redis SAML cache now.</p>',
    agentReplyHtml:
      '<p>Hi there! Thanks for reaching out.</p><p>I located your workspace and flushed the cached X.509 certificate fingerprint on our SAML gateway. Could you please ask one affected user to test an IdP-initiated login now?</p><ul><li>Clear browser session cookies</li><li>Re-launch from Okta tile</li></ul>',
    customerFollowupHtml:
      '<p>Tested with 3 engineers across Frankfurt and Dublin — login works immediately now! Thank you for the fast turnaround.</p>',
    agentClosingHtml:
      '<p>Glad to hear everyone is back in! I have also enabled automatic metadata polling for your tenant so future certificate rotations sync seamlessly.</p>'
  },
  {
    subject: 'Webhook payload retry policy & HTTP 429 rate limit clarification',
    tags: ['api-v2', 'webhooks', 'developer'],
    priority: 'not_priority',
    state: 'closed',
    customerOpeningHtml:
      '<p>Hello,</p><p>Our ingestion worker occasionally returns <code>HTTP 502</code> during deployment windows. How many times does your webhook dispatcher retry before marking an endpoint disabled?</p>',
    internalNoteHtml:
      '<p>Customer is on the Growth Annual plan (Workspace #4491). Checking webhook telemetry logs — 0 dropped events in the last 24h.</p>',
    agentReplyHtml:
      '<p>Great question! Our webhook delivery engine uses exponential backoff up to <strong>7 retries over 6 hours</strong> (1m, 5m, 15m, 30m, 1h, 2h, 2h).</p><p>You can inspect delivery attempts in <a href="https://developers.example.com/webhooks">Developer Hub &rarr; Webhooks</a>.</p>',
    customerFollowupHtml:
      '<p>That 6-hour window easily covers our 90-second rolling deploys. Appreciate the clear documentation link!</p>',
    agentClosingHtml:
      '<p>Anytime! Let us know if you need webhook signature verification examples in Node.js or Python.</p>'
  },
  {
    subject: 'Annual invoice VAT reverse-charge update (Slovakia / EU VAT ID)',
    tags: ['billing', 'eu-vat', 'invoice'],
    priority: 'not_priority',
    state: 'open',
    customerOpeningHtml:
      '<p>Dobrý deň / Hello,</p><p>Could you please add our EU VAT ID (SK2020998877) to invoice #INV-2026-1104 and reissue it under the EU reverse-charge mechanism?</p><p>Also testing multi-language UTF-8 characters for Excel CSV export: 한국어 상담 내역 정상 출력 테스트 / Slovenčina / 日本語.</p>',
    internalNoteHtml:
      '<p>Verified VIES VAT number validity. Preparing revised zero-rated reverse-charge PDF invoice in Stripe Billing.</p>',
    agentReplyHtml:
      '<p>Hello! We have validated your VIES VAT number and reissued invoice <strong>#INV-2026-1104-REV1</strong> with 0% VAT (EU Reverse Charge applied).</p><p>The updated PDF is attached below for your accounting records.</p>',
    customerFollowupHtml:
      '<p>Received the updated PDF and forwarded it to our finance team. All set!</p>',
    agentClosingHtml:
      '<p>Wonderful — your VAT ID is now permanently saved for all future renewals.</p>'
  },
  {
    subject: 'CSV export truncating at 300 rows & missing full conversation transcript bodies',
    tags: ['data-export', 'csv', 'compliance-audit'],
    priority: 'priority',
    state: 'closed',
    customerOpeningHtml:
      '<p>We need to export 18,400 customer support conversations including full message text and internal notes for our Q4 SOC2 &amp; RAG AI training audit.</p><p>The built-in dashboard CSV export only gives metadata columns (no message bodies!) and caps UI searches. How can we get a clean CSV with every reply?</p>',
    internalNoteHtml:
      '<p>Standard UI export only exports ticket metadata. Recommending the local API v2.11 cursor pagination &amp; N+1 transcript streamer workflow.</p>',
    agentReplyHtml:
      '<p>Because each conversation contains up to 500 nested <code>conversation_parts</code>, full transcript extraction requires iterating through the REST API v2.11 with cursor pagination (<code>starting_after</code>) and streaming directly to disk.</p>',
    customerFollowupHtml:
      '<p>Using ChatVault Exporter in a dedicated tab streamed all 18,400 transcripts directly to disk with <30MB RAM and preserved UTF-8 BOM for Excel. Problem solved!</p>',
    agentClosingHtml:
      '<p>Awesome to hear! Enjoy the clean CSV, NDJSON, and Obsidian Markdown outputs.</p>'
  }
];

/**
 * Generates a deterministic synthetic normalized conversation for index `i` (1..500).
 * @param {number} index 1-based index
 * @returns {Object} Normalized conversation matching IntercomAdapter output
 */
export function generateSyntheticConversation(index) {
  const company = SAMPLE_COMPANIES[index % SAMPLE_COMPANIES.length];
  const customerName = SAMPLE_CUSTOMERS[index % SAMPLE_CUSTOMERS.length];
  const teammate = SAMPLE_TEAMMATES[index % SAMPLE_TEAMMATES.length];
  const topic = SAMPLE_TOPICS[index % SAMPLE_TOPICS.length];

  const convId = String(950000 + index);
  const baseEpochMs = Date.UTC(2026, 9, 1, 8, 0, 0) + index * 3600 * 1000;
  const createdIso = new Date(baseEpochMs).toISOString();
  const noteIso = new Date(baseEpochMs + 5 * 60 * 1000).toISOString();
  const reply1Iso = new Date(baseEpochMs + 12 * 60 * 1000).toISOString();
  const followupIso = new Date(baseEpochMs + 28 * 60 * 1000).toISOString();
  const closingIso = new Date(baseEpochMs + 35 * 60 * 1000).toISOString();

  const slug = customerName.toLowerCase().replace(/[^a-z0-9]/g, '.');
  const customerEmail = `${slug}@${company.domain}`;

  return {
    id: convId,
    platform: 'intercom',
    region: index % 3 === 0 ? 'EU' : (index % 7 === 0 ? 'AU' : 'US'),
    title: `[${company.name}] ${topic.subject} (#${index})`,
    state: topic.state,
    priority: topic.priority,
    createdAt: createdIso,
    updatedAt: closingIso,
    tags: [...topic.tags, `batch-${Math.ceil(index / 50)}`],
    assignee: teammate.name,
    customerId: `usr_${70000 + index}`,
    customerName: `${customerName} (${company.name})`,
    customerEmail,
    rating: (index % 5 === 0) ? 4 : 5,
    ratingRemark: 'Fast, technical, and accurate resolution!',
    totalPartsCount: 5,
    messages: [
      {
        partId: `${convId}_src`,
        partType: 'conversation_initiation',
        authorType: 'user',
        authorName: customerName,
        authorEmail: customerEmail,
        bodyHtml: topic.customerOpeningHtml,
        createdAt: createdIso,
        isInternalNote: false,
        attachments: index % 4 === 0 ? [`https://files.example.com/tickets/${convId}/diagnostic-log.txt`] : []
      },
      {
        partId: `${convId}_note_1`,
        partType: 'note',
        authorType: 'admin',
        authorName: teammate.name,
        authorEmail: teammate.email,
        bodyHtml: topic.internalNoteHtml,
        createdAt: noteIso,
        isInternalNote: true,
        attachments: []
      },
      {
        partId: `${convId}_reply_1`,
        partType: 'comment',
        authorType: 'admin',
        authorName: teammate.name,
        authorEmail: teammate.email,
        bodyHtml: topic.agentReplyHtml,
        createdAt: reply1Iso,
        isInternalNote: false,
        attachments: index % 3 === 0 ? [`https://files.example.com/tickets/${convId}/revised-config.json`] : []
      },
      {
        partId: `${convId}_followup_1`,
        partType: 'comment',
        authorType: 'user',
        authorName: customerName,
        authorEmail: customerEmail,
        bodyHtml: topic.customerFollowupHtml,
        createdAt: followupIso,
        isInternalNote: false,
        attachments: []
      },
      {
        partId: `${convId}_close_1`,
        partType: 'comment',
        authorType: 'admin',
        authorName: teammate.name,
        authorEmail: teammate.email,
        bodyHtml: topic.agentClosingHtml,
        createdAt: closingIso,
        isInternalNote: false,
        attachments: []
      }
    ]
  };
}

/**
 * Sandbox Demo Adapter that mirrors IntercomAdapter's exportStream interface
 * and simulates realistic rate-limit header pacing so users can see the full 500-chat workflow in ~3-5 seconds.
 */
export class SandboxDemoAdapter {
  constructor(options = {}) {
    this.totalDemoCount = options.totalDemoCount || 500;
    this.simulateRateLimitPause = options.simulateRateLimitPause !== false;
    this.rateLimitPauseMs = typeof options.rateLimitPauseMs === 'number' ? options.rateLimitPauseMs : 600;
    this.sleepFn = options.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.onRateLimitWait = options.onRateLimitWait || (() => {});
  }

  async verifyAndDetectRegion() {
    return {
      ok: true,
      region: 'US',
      baseUrl: 'sandbox://demo.intercom.local',
      workspaceName: 'B2B SaaS Sandbox Demo Workspace (500 Chats)',
      workspaceId: 'sandbox_demo_500',
      adminEmail: 'demo-admin@chatvault.local',
      totalCount: this.totalDemoCount
    };
  }

  async *exportStream(options = {}) {
    const completedSet = new Set(options.completedIds || []);
    const maxConversations = typeof options.maxConversations === 'number'
      ? Math.min(options.maxConversations, this.totalDemoCount)
      : this.totalDemoCount;
    const signal = options.signal || null;

    let exportedCount = completedSet.size;
    const skippedErrors = [];

    for (let i = 1; i <= this.totalDemoCount; i++) {
      if (signal?.aborted || exportedCount >= maxConversations) {
        break;
      }

      const conv = generateSyntheticConversation(i);
      if (completedSet.has(conv.id)) {
        continue;
      }

      // Simulate a brief rate-limit throttle notification at conversation #150 and #350
      if (this.simulateRateLimitPause && (i === 150 || i === 350)) {
        this.onRateLimitWait({
          remaining: 14,
          resetAt: Date.now() + this.rateLimitPauseMs,
          waitMs: this.rateLimitPauseMs,
          reason: `Simulated Intercom X-RateLimit-Remaining=14 (<20 safety threshold)`
        });
        await this.sleepFn(this.rateLimitPauseMs);
      } else if (i % 25 === 0) {
        await this.sleepFn(15);
      }

      completedSet.add(conv.id);
      exportedCount++;

      yield {
        conversation: conv,
        cursor: `sandbox_cursor_${i - 1}`,
        nextCursor: i < this.totalDemoCount ? `sandbox_cursor_${i}` : null,
        exportedCount,
        totalCount: this.totalDemoCount,
        skippedErrors
      };
    }
  }
}
