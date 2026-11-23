/**
 * ChatVault Intercom API v2.11 Adapter (v1.1.0 — Production Hardened)
 * New in v1.1.0:
 * - Intercom Search API (POST /conversations/search) with Start Date, End Date, Tag ID/Name, and State filtering
 * - Deep Export Enriched Data: Optional Contact/Company enrichment (GET /contacts/{id}) + Custom Attributes + Statistics (first response time, SLA)
 * - Production edge-case hardening: redacted messages, bot_intro / quick_reply / custom_action_started, null authors, missing nested fields
 * - Skipped errors export log (JSON) & Silent Continue fault-tolerant loop
 * - Multi-region US / EU / AU auto-detection preserved (essential — DO NOT remove EU/AU!)
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
   * @param {Function} [options.fetchFn]
   * @param {Function} [options.sleepFn]
   * @param {Function} [options.onRateLimitWait]
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
    this._contactCache = new Map();
    this._tagsCache = null;
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

          let totalCount = 0;
          try {
            const convRes = await this._rawRequest(
              `${candidate.baseUrl}/conversations?per_page=1`,
              { method: 'GET' },
              false
            );
            if (convRes.status === 200) {
              const convData = await convRes.json();
              totalCount = typeof convData?.total_count === 'number'
                ? convData.total_count
                : (Array.isArray(convData?.conversations) ? convData.conversations.length : 0);
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
   * Resolves a human-readable tag name (e.g., "billing") to its Intercom numeric tag ID via GET /tags.
   * If input is already numeric, returns it directly.
   */
  async resolveTagId(tagInput) {
    const cleaned = String(tagInput || '').trim();
    if (!cleaned) return null;
    if (/^\d+$/.test(cleaned)) return cleaned;

    if (!this._tagsCache) {
      try {
        const res = await this._rawRequest(`${this.baseUrl}/tags`, { method: 'GET' }, true);
        if (res.ok) {
          const data = await res.json();
          this._tagsCache = Array.isArray(data?.data) ? data.data : [];
        } else {
          this._tagsCache = [];
        }
      } catch (_) {
        this._tagsCache = [];
      }
    }

    const found = this._tagsCache.find(
      (t) => String(t?.name || '').toLowerCase() === cleaned.toLowerCase()
    );
    return found?.id ? String(found.id) : cleaned;
  }

  /**
   * Builds an Intercom v2.11 Search API query object from user-friendly filters.
   * @param {Object} filters
   * @param {string} [filters.startDate] - YYYY-MM-DD (inclusive)
   * @param {string} [filters.endDate] - YYYY-MM-DD (inclusive end-of-day)
   * @param {string} [filters.tagId] - Resolved tag ID
   * @param {string} [filters.state] - 'open' | 'closed' | 'snoozed' | ''
   */
  buildSearchQuery(filters = {}) {
    const conditions = [];

    if (filters.startDate) {
      const startEpoch = Math.floor(Date.parse(`${filters.startDate}T00:00:00Z`) / 1000);
      if (!Number.isNaN(startEpoch)) {
        conditions.push({ field: 'created_at', operator: '>=', value: startEpoch });
      }
    }

    if (filters.endDate) {
      const endEpoch = Math.floor(Date.parse(`${filters.endDate}T23:59:59Z`) / 1000);
      if (!Number.isNaN(endEpoch)) {
        conditions.push({ field: 'created_at', operator: '<=', value: endEpoch });
      }
    }

    if (filters.tagId) {
      conditions.push({ field: 'tag_ids', operator: '=', value: String(filters.tagId) });
    }

    if (filters.state && ['open', 'closed', 'snoozed'].includes(filters.state)) {
      conditions.push({ field: 'state', operator: '=', value: filters.state });
    }

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { operator: 'AND', value: conditions };
  }

  hasActiveFilters(filters = {}) {
    return Boolean(
      (filters.startDate && filters.startDate.trim()) ||
      (filters.endDate && filters.endDate.trim()) ||
      (filters.tag && filters.tag.trim()) ||
      (filters.state && filters.state.trim())
    );
  }

  /**
   * Lists a page of conversations using either GET /conversations (no filters) or POST /conversations/search (with filters).
   */
  async listConversationsPage({ startingAfter = null, perPage = 150, filters = {} } = {}) {
    if (this.hasActiveFilters(filters)) {
      const resolvedTagId = filters.tag ? await this.resolveTagId(filters.tag) : null;
      const queryObj = this.buildSearchQuery({
        startDate: filters.startDate,
        endDate: filters.endDate,
        tagId: resolvedTagId,
        state: filters.state
      });

      const payload = {
        query: queryObj,
        pagination: {
          per_page: Math.min(perPage, 150)
        }
      };
      if (startingAfter) {
        payload.pagination.starting_after = startingAfter;
      }

      const url = `${this.baseUrl}/conversations/search`;
      const res = await this._rawRequest(
        url,
        { method: 'POST', body: JSON.stringify(payload) },
        true
      );

      if (!res.ok) {
        throw new Error(`Failed to search conversations: HTTP ${res.status}`);
      }

      const data = await res.json();
      const conversations = Array.isArray(data?.conversations) ? data.conversations : [];
      const nextCursor = data?.pages?.next?.starting_after || null;
      const totalCount = typeof data?.total_count === 'number' ? data.total_count : conversations.length;

      return { conversations, nextCursor, totalCount, usedSearchApi: true };
    }

    const query = new URLSearchParams({ per_page: String(Math.min(perPage, 150)) });
    if (startingAfter) {
      query.set('starting_after', startingAfter);
    }

    const url = `${this.baseUrl}/conversations?${query.toString()}`;
    const res = await this._rawRequest(url, { method: 'GET' }, true);

    if (!res.ok) {
      throw new Error(`Failed to list conversations: HTTP ${res.status}`);
    }

    const data = await res.json();
    const conversations = Array.isArray(data?.conversations) ? data.conversations : [];
    const nextCursor = data?.pages?.next?.starting_after || null;
    const totalCount = typeof data?.total_count === 'number' ? data.total_count : conversations.length;

    return { conversations, nextCursor, totalCount, usedSearchApi: false };
  }

  /**
   * Optional Deep Export contact enrichment via GET /contacts/{id} with local memoization cache.
   */
  async fetchContactProfile(contactId) {
    const idStr = String(contactId || '').trim();
    if (!idStr) return null;
    if (this._contactCache.has(idStr)) {
      return this._contactCache.get(idStr);
    }

    try {
      const res = await this._rawRequest(`${this.baseUrl}/contacts/${encodeURIComponent(idStr)}`, { method: 'GET' }, true);
      if (!res.ok) {
        this._contactCache.set(idStr, null);
        return null;
      }
      const c = await res.json();
      const companyNames = Array.isArray(c?.companies?.data)
        ? c.companies.data.map((co) => co?.name || co?.id).filter(Boolean)
        : [];
      const enriched = {
        id: idStr,
        name: c?.name || '',
        email: c?.email || '',
        role: c?.role || '',
        companies: companyNames,
        customAttributes: c?.custom_attributes && typeof c.custom_attributes === 'object' ? c.custom_attributes : {}
      };
      this._contactCache.set(idStr, enriched);
      return enriched;
    } catch (_) {
      this._contactCache.set(idStr, null);
      return null;
    }
  }

  /**
   * Fetches full conversation detail by ID with optional Deep Export contact/company enrichment.
   * Returns { skipped: true } on 404/403 so batch runs never halt.
   */
  async fetchConversationDetail(conversationId, { deepExport = false } = {}) {
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
    let contactProfile = null;
    if (deepExport) {
      const primaryContactId = raw?.contacts?.contacts?.[0]?.id || raw?.source?.author?.id;
      if (primaryContactId) {
        contactProfile = await this.fetchContactProfile(primaryContactId);
      }
    }

    return {
      skipped: false,
      conversation: this.normalizeConversation(raw, contactProfile)
    };
  }

  /**
   * Hardened normalizer resistant to real-world Intercom edge cases:
   * - redacted messages (part.redacted === true or source.redacted === true)
   * - bot_intro, quick_reply, custom_action_started, null/missing author objects
   * - custom_attributes, companies, team_assignee_id, and SLA statistics
   */
  normalizeConversation(raw = {}, contactProfile = null) {
    const safeRaw = raw && typeof raw === 'object' ? raw : {};
    const id = String(safeRaw?.id ?? 'unknown');
    const title = safeRaw?.title || safeRaw?.source?.subject || '';
    const state = safeRaw?.state || 'unknown';
    const priority = safeRaw?.priority || 'not_priority';
    const createdAt = typeof safeRaw?.created_at === 'number'
      ? new Date(safeRaw.created_at * 1000).toISOString()
      : '';
    const updatedAt = typeof safeRaw?.updated_at === 'number'
      ? new Date(safeRaw.updated_at * 1000).toISOString()
      : '';

    const tags = Array.isArray(safeRaw?.tags?.tags)
      ? safeRaw.tags.tags.map((t) => t?.name).filter(Boolean)
      : [];

    const assignee = safeRaw?.admin_assignee_id
      ? String(safeRaw.admin_assignee_id)
      : (safeRaw?.teammate?.name || safeRaw?.assignee?.name || safeRaw?.assignee?.email || 'Unassigned');

    const teamAssignee = safeRaw?.team_assignee_id ? String(safeRaw.team_assignee_id) : '';

    const contactList = Array.isArray(safeRaw?.contacts?.contacts) ? safeRaw.contacts.contacts : [];
    const primaryContact = contactList[0] || safeRaw?.source?.author || {};
    const customerName = contactProfile?.name || primaryContact?.name || 'Unknown';
    const customerEmail = contactProfile?.email || primaryContact?.email || '';
    const customerId = primaryContact?.id ? String(primaryContact.id) : (contactProfile?.id || '');

    const companies = contactProfile?.companies?.length
      ? contactProfile.companies
      : (Array.isArray(safeRaw?.companies?.companies)
          ? safeRaw.companies.companies.map((c) => c?.name || c?.id).filter(Boolean)
          : []);

    const convCustomAttrs = safeRaw?.custom_attributes && typeof safeRaw.custom_attributes === 'object'
      ? safeRaw.custom_attributes
      : {};
    const mergedCustomAttributes = {
      ...(contactProfile?.customAttributes || {}),
      ...convCustomAttrs
    };

    const firstResponseSec = safeRaw?.statistics?.time_to_admin_reply ?? '';
    const timeToCloseSec = safeRaw?.statistics?.time_to_last_close ?? '';

    const messages = [];

    // Initial source message (defensive against null author / redacted body)
    if (safeRaw?.source && typeof safeRaw.source === 'object') {
      const srcAttachments = Array.isArray(safeRaw.source?.attachments)
        ? safeRaw.source.attachments.map((a) => a?.url || a?.name).filter(Boolean)
        : [];
      const srcAuthor = safeRaw.source?.author || {};
      const srcBody = safeRaw.source?.redacted
        ? '[REDACTED BY INTERCOM]'
        : (typeof safeRaw.source?.body === 'string' ? safeRaw.source.body : '');

      messages.push({
        partId: String(safeRaw.source?.id ?? `${id}_source`),
        partType: String(safeRaw.source?.type || 'conversation_initiation'),
        authorType: String(srcAuthor?.type || 'user'),
        authorName: String(srcAuthor?.name || customerName || 'Unknown'),
        authorEmail: String(srcAuthor?.email || customerEmail || ''),
        bodyHtml: srcBody,
        createdAt,
        isInternalNote: false,
        attachments: srcAttachments
      });
    }

    // Conversation parts (up to 500 per Intercom v2.11 API, resilient against bot/redacted/null authors)
    const rawParts = Array.isArray(safeRaw?.conversation_parts?.conversation_parts)
      ? safeRaw.conversation_parts.conversation_parts.slice(0, 500)
      : [];

    for (const part of rawParts) {
      if (!part || typeof part !== 'object') continue;
      const attachments = Array.isArray(part?.attachments)
        ? part.attachments.map((a) => a?.url || a?.name).filter(Boolean)
        : [];
      const partType = String(part?.part_type || 'comment');
      const isInternalNote = partType === 'note';
      const isRedacted = Boolean(part?.redacted);

      let bodyHtml = '';
      if (isRedacted) {
        bodyHtml = '[REDACTED MESSAGE]';
      } else if (typeof part?.body === 'string') {
        bodyHtml = part.body;
      } else if (part?.body && typeof part.body === 'object') {
        bodyHtml = JSON.stringify(part.body);
      }

      // Skip purely empty state-change notifications unless they are comments, notes, redacted, or have attachments
      if (!bodyHtml && attachments.length === 0 && partType !== 'comment' && partType !== 'note' && !isRedacted) {
        continue;
      }

      const authorObj = part?.author || {};
      const authorType = String(authorObj?.type || 'unknown');
      const authorName = String(
        authorObj?.name ||
        (authorType === 'bot' ? 'Intercom Bot' : authorType === 'admin' ? 'Teammate' : 'Unknown')
      );

      messages.push({
        partId: String(part?.id ?? ''),
        partType,
        authorType,
        authorName,
        authorEmail: String(authorObj?.email || ''),
        bodyHtml,
        createdAt: typeof part?.created_at === 'number'
          ? new Date(part.created_at * 1000).toISOString()
          : updatedAt,
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
      teamAssignee,
      customerId,
      customerName,
      customerEmail,
      companies,
      customAttributes: mergedCustomAttributes,
      firstResponseSec,
      timeToCloseSec,
      rating: safeRaw?.conversation_rating?.rating ?? '',
      ratingRemark: safeRaw?.conversation_rating?.remark ?? '',
      totalPartsCount: safeRaw?.conversation_parts?.total_count ?? messages.length,
      messages
    };
  }

  /**
   * High-level stream generator with Search API filters, Deep Export enrichment,
   * checkpoint resume, hard cap, and fault-tolerant 404/403 skipping.
   */
  async *exportStream(options = {}) {
    let cursor = options.startingAfter || null;
    const completedSet = new Set(options.completedIds || []);
    const maxConversations = typeof options.maxConversations === 'number' ? options.maxConversations : Infinity;
    const perPage = options.perPage || 150;
    const signal = options.signal || null;
    const filters = options.filters || {};
    const deepExport = Boolean(options.deepExport);

    let exportedCount = completedSet.size;
    const skippedErrors = [];

    while (exportedCount < maxConversations) {
      if (signal?.aborted) break;

      const page = await this.listConversationsPage({
        startingAfter: cursor,
        perPage: Math.min(perPage, 150),
        filters
      });

      if (!page.conversations || page.conversations.length === 0) {
        break;
      }

      for (const summary of page.conversations) {
        if (signal?.aborted || exportedCount >= maxConversations) break;

        const convId = String(summary?.id ?? '');
        if (!convId || completedSet.has(convId)) continue;

        try {
          const detailResult = await this.fetchConversationDetail(convId, { deepExport });
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
            usedSearchApi: page.usedSearchApi,
            skippedErrors: [...skippedErrors]
          };
        } catch (err) {
          // Silent continue on unexpected per-conversation malformed payload/network blip
          skippedErrors.push({
            id: convId,
            status: 'ERROR',
            reason: err?.message || 'Unexpected conversation fetch error',
            timestamp: new Date().toISOString()
          });
        }
      }

      if (!page.nextCursor || exportedCount >= maxConversations) break;
      cursor = page.nextCursor;
    }
  }
}
