/**
 * ChatVault Intercom API v2.11 Adapter
 * Features:
 * - Auto-detection across US (api.intercom.io), EU (api.eu.intercom.io), and AU (api.au.intercom.io)
 * - Cursor pagination (pages.next.starting_after) with per_page=150
 * - N+1 conversation detail fetching (up to 500 conversation_parts)
 * - Header-based Rate Limiter (X-RateLimit-Remaining < 20 -> wait until X-RateLimit-Reset)
 * - HTTP 429 Retry-After + Exponential Backoff
 * - Fault-tolerant loop: skips 404/403 deleted/restricted conversations and logs them in skipped_errors
 */

export const INTERCOM_REGIONS = [
  { id: 'US', label: 'US (api.intercom.io)', baseUrl: 'https://api.intercom.io' },
  { id: 'EU', label: 'EU (api.eu.intercom.io)', baseUrl: 'https://api.eu.intercom.io' },
  { id: 'AU', label: 'AU (api.au.intercom.io)', baseUrl: 'https://api.au.intercom.io' }
];

export const INTERCOM_API_VERSION = '2.11';

export class IntercomAdapter {
  /**
   * @param {Object} options
   * @param {string} options.token - Intercom Access Token
   * @param {string} [options.region] - 'US' | 'EU' | 'AU' | 'AUTO'
   * @param {Function} [options.fetchFn] - Custom fetch implementation (for unit tests / sandbox)
   * @param {Function} [options.sleepFn] - Custom sleep implementation (ms) => Promise
   * @param {Function} [options.onRateLimitWait] - Callback ({ remaining, resetAt, waitMs, reason }) => void
   */
  constructor(options = {}) {
    this.token = (options.token || '').trim();
    this.region = options.region || 'AUTO';
    this.baseUrl = this._resolveBaseUrl(this.region);
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.sleepFn = options.sleepFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onRateLimitWait = options.onRateLimitWait || (() => {});
    this.rateLimitThreshold = typeof options.rateLimitThreshold === 'number' ? options.rateLimitThreshold : 20;
    this.maxRetries = typeof options.maxRetries === 'number' ? options.maxRetries : 4;
  }

  _resolveBaseUrl(regionId) {
    const found = INTERCOM_REGIONS.find((r) => r.id === regionId);
    return found ? found.baseUrl : INTERCOM_REGIONS[0].baseUrl;
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Intercom-Version': INTERCOM_API_VERSION
    };
  }

  /**
   * Auto-detect workspace region (US -> EU -> AU) and retrieve workspace metadata + total conversation count.
   */
  async verifyAndDetectRegion() {
    if (!this.token) {
      throw new Error('Intercom Access Token is required.');
    }

    const candidates = this.region && this.region !== 'AUTO'
      ? INTERCOM_REGIONS.filter((r) => r.id === this.region)
      : INTERCOM_REGIONS;

    let lastError = null;

    for (const candidate of candidates) {
      try {
        const meRes = await this._rawRequest(`${candidate.baseUrl}/me`, { method: 'GET' }, false);
        if (meRes.status === 200) {
          const meData = await meRes.json();
          this.region = candidate.id;
          this.baseUrl = candidate.baseUrl;

          // Fetch total conversation count with per_page=1
          let totalCount = 0;
          try {
            const convRes = await this._rawRequest(
              `${candidate.baseUrl}/conversations?per_page=1`,
              { method: 'GET' },
              false
            );
            if (convRes.status === 200) {
              const convData = await convRes.json();
              totalCount = typeof convData.total_count === 'number'
                ? convData.total_count
                : (convData.conversations ? convData.conversations.length : 0);
            }
          } catch (_) {
            // Ignore count fallback failure
          }

          return {
            ok: true,
            region: candidate.id,
            baseUrl: candidate.baseUrl,
            workspaceName: meData?.app?.name || meData?.name || 'Intercom Workspace',
            workspaceId: meData?.app?.id_code || meData?.id || 'unknown',
            adminEmail: meData?.email || '',
            totalCount
          };
        }

        if (meRes.status === 401 || meRes.status === 403) {
          lastError = new Error(`Authentication failed (${meRes.status}) on ${candidate.id} region.`);
        } else {
          lastError = new Error(`Unexpected status ${meRes.status} on ${candidate.id} region.`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Could not verify Intercom token across US, EU, or AU regions.');
  }

  /**
   * Executes an HTTP request with Rate-Limit header inspection and 429 exponential backoff.
   */
  async _rawRequest(url, init = {}, handleRateLimit = true) {
    let attempt = 0;

    while (true) {
      const response = await this.fetchFn(url, {
        ...init,
        headers: {
          ...this._headers(),
          ...(init.headers || {})
        }
      });

      if (response.status === 429) {
        attempt++;
        if (attempt > this.maxRetries) {
          throw new Error(`HTTP 429 Rate Limit exceeded after ${this.maxRetries} retries.`);
        }

        const retryAfterHeader = response.headers?.get?.('Retry-After') || response.headers?.get?.('retry-after');
        const resetHeader = response.headers?.get?.('X-RateLimit-Reset') || response.headers?.get?.('x-ratelimit-reset');
        let waitMs = 0;

        if (retryAfterHeader && !Number.isNaN(Number(retryAfterHeader))) {
          waitMs = Math.max(1000, Number(retryAfterHeader) * 1000);
        } else if (resetHeader && !Number.isNaN(Number(resetHeader))) {
          const resetUnixMs = Number(resetHeader) * 1000;
          waitMs = Math.max(1000, resetUnixMs - Date.now() + 250);
        } else {
          waitMs = Math.min(30000, 1000 * Math.pow(2, attempt));
        }

        this.onRateLimitWait({
          remaining: 0,
          resetAt: Date.now() + waitMs,
          waitMs,
          reason: `HTTP 429 Too Many Requests (Retry #${attempt})`
        });

        await this.sleepFn(waitMs);
        continue;
      }

      if (handleRateLimit) {
        await this._inspectRateLimitHeaders(response);
      }

      return response;
    }
  }

  async _inspectRateLimitHeaders(response) {
    if (!response || !response.headers || typeof response.headers.get !== 'function') return;

    const remainingRaw = response.headers.get('X-RateLimit-Remaining') ?? response.headers.get('x-ratelimit-remaining');
    const resetRaw = response.headers.get('X-RateLimit-Reset') ?? response.headers.get('x-ratelimit-reset');

    if (remainingRaw !== null && remainingRaw !== undefined && remainingRaw !== '') {
      const remaining = Number(remainingRaw);
      if (!Number.isNaN(remaining) && remaining < this.rateLimitThreshold) {
        let waitMs = 2000;
        let resetAt = Date.now() + waitMs;

        if (resetRaw !== null && resetRaw !== undefined && !Number.isNaN(Number(resetRaw))) {
          const resetVal = Number(resetRaw);
          // Support both UNIX epoch seconds and delta seconds
          const resetUnixMs = resetVal > 1e9 ? resetVal * 1000 : Date.now() + resetVal * 1000;
          waitMs = Math.max(500, resetUnixMs - Date.now() + 200);
          resetAt = resetUnixMs;
        }

        this.onRateLimitWait({
          remaining,
          resetAt,
          waitMs,
          reason: `X-RateLimit-Remaining is low (${remaining} < ${this.rateLimitThreshold})`
        });

        await this.sleepFn(waitMs);
      }
    }
  }

  /**
   * Fetch a single page of conversation summaries.
   * @param {Object} params
   * @param {string|null} [params.startingAfter]
   * @param {number} [params.perPage=150]
   */
  async listConversationsPage({ startingAfter = null, perPage = 150 } = {}) {
    const query = new URLSearchParams({ per_page: String(perPage) });
    if (startingAfter) {
      query.set('starting_after', startingAfter);
    }

    const url = `${this.baseUrl}/conversations?${query.toString()}`;
    const res = await this._rawRequest(url, { method: 'GET' }, true);

    if (!res.ok) {
      throw new Error(`Failed to list conversations: HTTP ${res.status}`);
    }

    const data = await res.json();
    const conversations = Array.isArray(data.conversations) ? data.conversations : [];
    const nextCursor = data?.pages?.next?.starting_after || null;
    const totalCount = typeof data.total_count === 'number' ? data.total_count : conversations.length;

    return {
      conversations,
      nextCursor,
      totalCount
    };
  }

  /**
   * Fetch full conversation detail by ID (GET /conversations/{id}).
   * Returns { skipped: true, status, id, reason } on 404 or 403 so the batch loop never halts.
   */
  async fetchConversationDetail(conversationId) {
    const url = `${this.baseUrl}/conversations/${encodeURIComponent(conversationId)}?display_as=html`;
    const res = await this._rawRequest(url, { method: 'GET' }, true);

    if (res.status === 404 || res.status === 403) {
      return {
        skipped: true,
        id: String(conversationId),
        status: res.status,
        reason: res.status === 404 ? 'Conversation not found / deleted (404)' : 'Access restricted (403)'
      };
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch conversation ${conversationId}: HTTP ${res.status}`);
    }

    const raw = await res.json();
    return {
      skipped: false,
      conversation: this.normalizeConversation(raw)
    };
  }

  /**
   * Normalizes an Intercom v2.11 conversation object into ChatVault's platform-agnostic schema.
   */
  normalizeConversation(raw) {
    const id = String(raw.id || '');
    const title = raw.title || raw.source?.subject || '';
    const state = raw.state || 'unknown';
    const priority = raw.priority || 'not_priority';
    const createdAt = raw.created_at ? new Date(raw.created_at * 1000).toISOString() : '';
    const updatedAt = raw.updated_at ? new Date(raw.updated_at * 1000).toISOString() : '';

    const tags = Array.isArray(raw.tags?.tags)
      ? raw.tags.tags.map((t) => t.name).filter(Boolean)
      : [];

    const assignee = raw.admin_assignee_id
      ? String(raw.admin_assignee_id)
      : (raw.teammate?.name || raw.assignee?.name || raw.assignee?.email || '');

    const contactList = Array.isArray(raw.contacts?.contacts) ? raw.contacts.contacts : [];
    const primaryContact = contactList[0] || raw.source?.author || {};
    const customerName = primaryContact.name || '';
    const customerEmail = primaryContact.email || '';
    const customerId = primaryContact.id ? String(primaryContact.id) : '';

    const messages = [];

    // Initial source message
    if (raw.source) {
      const srcAttachments = Array.isArray(raw.source.attachments)
        ? raw.source.attachments.map((a) => a.url || a.name).filter(Boolean)
        : [];
      messages.push({
        partId: String(raw.source.id || `${id}_source`),
        partType: raw.source.type || 'conversation_initiation',
        authorType: raw.source.author?.type || 'user',
        authorName: raw.source.author?.name || customerName || 'Customer',
        authorEmail: raw.source.author?.email || customerEmail || '',
        bodyHtml: raw.source.body || '',
        createdAt,
        isInternalNote: false,
        attachments: srcAttachments
      });
    }

    // Conversation parts (up to 500 per Intercom v2.11 API)
    const rawParts = Array.isArray(raw.conversation_parts?.conversation_parts)
      ? raw.conversation_parts.conversation_parts.slice(0, 500)
      : [];

    for (const part of rawParts) {
      const attachments = Array.isArray(part.attachments)
        ? part.attachments.map((a) => a.url || a.name).filter(Boolean)
        : [];
      const partType = part.part_type || 'comment';
      const isInternalNote = partType === 'note';

      // Skip empty assignment/state notification parts with no body or attachments
      if (!part.body && attachments.length === 0 && partType !== 'comment' && partType !== 'note') {
        continue;
      }

      messages.push({
        partId: String(part.id || ''),
        partType,
        authorType: part.author?.type || 'admin',
        authorName: part.author?.name || (part.author?.type === 'admin' ? 'Teammate' : 'Customer'),
        authorEmail: part.author?.email || '',
        bodyHtml: part.body || '',
        createdAt: part.created_at ? new Date(part.created_at * 1000).toISOString() : updatedAt,
        isInternalNote,
        attachments
      });
    }

    return {
      id,
      platform: 'intercom',
      region: this.region,
      title,
      state,
      priority,
      createdAt,
      updatedAt,
      tags,
      assignee,
      customerId,
      customerName,
      customerEmail,
      rating: raw.conversation_rating?.rating ?? '',
      ratingRemark: raw.conversation_rating?.remark ?? '',
      totalPartsCount: raw.conversation_parts?.total_count ?? messages.length,
      messages
    };
  }

  /**
   * High-level generator that yields normalized conversations with checkpoint support,
   * hard cap (e.g., 50 in free tier), and fault-tolerant 404/403 skipping.
   *
   * @param {Object} options
   * @param {string|null} [options.startingAfter] - Resume cursor
   * @param {Set<string>|Array<string>} [options.completedIds] - Already exported conversation IDs
   * @param {number} [options.maxConversations=Infinity] - Hard cap (50 for Free mode, Infinity for Pro)
   * @param {number} [options.perPage=150]
   * @param {AbortSignal} [options.signal]
   * @param {Function} [options.onProgress]
   */
  async *exportStream(options = {}) {
    let cursor = options.startingAfter || null;
    const completedSet = new Set(options.completedIds || []);
    const maxConversations = typeof options.maxConversations === 'number' ? options.maxConversations : Infinity;
    const perPage = options.perPage || 150;
    const signal = options.signal || null;

    let exportedCount = completedSet.size;
    const skippedErrors = [];

    while (exportedCount < maxConversations) {
      if (signal?.aborted) {
        break;
      }

      const page = await this.listConversationsPage({
        startingAfter: cursor,
        perPage: Math.min(perPage, 150)
      });

      if (!page.conversations || page.conversations.length === 0) {
        break;
      }

      for (const summary of page.conversations) {
        if (signal?.aborted || exportedCount >= maxConversations) {
          break;
        }

        const convId = String(summary.id);
        if (completedSet.has(convId)) {
          continue;
        }

        const detailResult = await this.fetchConversationDetail(convId);
        if (detailResult.skipped) {
          skippedErrors.push({
            id: detailResult.id,
            status: detailResult.status,
            reason: detailResult.reason,
            timestamp: new Date().toISOString()
          });
          continue;
        }

        completedSet.add(convId);
        exportedCount++;

        yield {
          conversation: detailResult.conversation,
          cursor,
          nextCursor: page.nextCursor,
          exportedCount,
          totalCount: page.totalCount,
          skippedErrors: [...skippedErrors]
        };
      }

      if (!page.nextCursor || exportedCount >= maxConversations) {
        break;
      }
      cursor = page.nextCursor;
    }
  }
}
