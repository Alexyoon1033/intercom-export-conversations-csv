/**
 * ChatVault Crisp REST API v1 Adapter (Horizontal Replication Plug-in #3)
 * Conforms to the exact same normalizeConversation() and exportStream() interface as IntercomAdapter.
 */

export class CrispAdapter {
  /**
   * @param {Object} options
   * @param {string} options.websiteId - Crisp Website ID
   * @param {string} options.identifier - Crisp Plugin Token Identifier
   * @param {string} options.key - Crisp Plugin Token Key
   * @param {Function} [options.fetchFn]
   */
  constructor(options = {}) {
    this.websiteId = (options.websiteId || '').trim();
    this.identifier = (options.identifier || '').trim();
    this.key = (options.key || '').trim();
    this.baseUrl = 'https://api.crisp.chat/v1';
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  }

  _headers() {
    const auth = btoa(`${this.identifier}:${this.key}`);
    return {
      'Authorization': `Basic ${auth}`,
      'X-Crisp-Tier': 'plugin',
      'Accept': 'application/json'
    };
  }

  normalizeConversation(session, messages = []) {
    const sessionId = String(session.session_id || '');
    return {
      id: sessionId,
      platform: 'crisp',
      region: 'GLOBAL',
      title: session.meta?.subject || `Crisp Session ${sessionId}`,
      state: session.state || 'resolved',
      priority: 'normal',
      createdAt: session.created_at ? new Date(session.created_at).toISOString() : '',
      updatedAt: session.updated_at ? new Date(session.updated_at).toISOString() : '',
      tags: Array.isArray(session.meta?.segments) ? session.meta.segments : [],
      assignee: session.assigned?.user_id || '',
      customerId: sessionId,
      customerName: session.meta?.nickname || 'Visitor',
      customerEmail: session.meta?.email || '',
      rating: '',
      ratingRemark: '',
      totalPartsCount: messages.length,
      messages: messages.map((m, idx) => ({
        partId: String(m.fingerprint || `${sessionId}_${idx}`),
        partType: m.type === 'note' ? 'note' : 'comment',
        authorType: m.from === 'operator' ? 'admin' : 'user',
        authorName: m.user?.nickname || (m.from === 'operator' ? 'Operator' : 'Visitor'),
        authorEmail: '',
        bodyHtml: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''),
        createdAt: m.timestamp ? new Date(m.timestamp).toISOString() : '',
        isInternalNote: m.type === 'note',
        attachments: []
      }))
    };
  }
}
