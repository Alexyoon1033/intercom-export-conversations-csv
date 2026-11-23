/**
 * ChatVault Zendesk Support API v2 Adapter (Horizontal Replication Plug-in #2)
 * Conforms to the exact same normalizeConversation() and exportStream() interface as IntercomAdapter
 * so the 90% shared ChatVault Core Engine (FileStreamer, CheckpointDB, Serializers, GumroadLicenseManager) works out-of-the-box.
 */

export class ZendeskAdapter {
  /**
   * @param {Object} options
   * @param {string} options.subdomain - e.g. 'acme' for https://acme.zendesk.com
   * @param {string} options.email - Admin/Agent email
   * @param {string} options.apiToken - Zendesk API token
   * @param {Function} [options.fetchFn]
   * @param {Function} [options.sleepFn]
   */
  constructor(options = {}) {
    this.subdomain = (options.subdomain || '').trim().replace(/\.zendesk\.com$/i, '');
    this.email = (options.email || '').trim();
    this.apiToken = (options.apiToken || '').trim();
    this.baseUrl = `https://${this.subdomain}.zendesk.com/api/v2`;
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.sleepFn = options.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  _headers() {
    const credentials = btoa(`${this.email}/token:${this.apiToken}`);
    return {
      'Authorization': `Basic ${credentials}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  normalizeConversation(ticket, comments = []) {
    return {
      id: String(ticket.id),
      platform: 'zendesk',
      region: this.subdomain,
      title: ticket.subject || '',
      state: ticket.status || 'open',
      priority: ticket.priority || 'normal',
      createdAt: ticket.created_at || '',
      updatedAt: ticket.updated_at || '',
      tags: Array.isArray(ticket.tags) ? ticket.tags : [],
      assignee: ticket.assignee_id ? String(ticket.assignee_id) : '',
      customerId: ticket.requester_id ? String(ticket.requester_id) : '',
      customerName: ticket.requester?.name || 'Requester',
      customerEmail: ticket.requester?.email || '',
      rating: ticket.satisfaction_rating?.score || '',
      ratingRemark: ticket.satisfaction_rating?.comment || '',
      totalPartsCount: comments.length,
      messages: comments.map((c, idx) => ({
        partId: String(c.id || `${ticket.id}_${idx}`),
        partType: c.public === false ? 'note' : 'comment',
        authorType: c.author_id === ticket.requester_id ? 'user' : 'admin',
        authorName: c.author_name || (c.author_id ? `User #${c.author_id}` : 'Participant'),
        authorEmail: '',
        bodyHtml: c.html_body || c.body || '',
        createdAt: c.created_at || ticket.created_at || '',
        isInternalNote: c.public === false,
        attachments: Array.isArray(c.attachments) ? c.attachments.map((a) => a.content_url).filter(Boolean) : []
      }))
    };
  }
}
