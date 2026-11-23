/**
 * ChatVault Gumroad 4-Fold License Verification & 7-Day Offline Grace Cache
 * Features:
 * - POST https://api.gumroad.com/v2/licenses/verify
 * - Strict 4-fold check: data.success === true && !data.purchase.refunded && !data.purchase.disputed && !data.purchase.chargebacked
 * - 7-day offline cache in chrome.storage.local (with background re-verification every 7 days to block refund abuse)
 * - Fault-tolerant 5xx / network outage grace extension: if a previously verified license encounters a Gumroad 5xx or network outage,
 *   automatically extends the local grace period by 7 days so paying customers are never locked out.
 */

import { classifyLicense } from './license-entitlements.js';

export const GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';
export const DEFAULT_PRODUCT_ID = 'xHRLb6ag8tx-PqVSO1E_Vw==';
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const STORAGE_KEY = 'chatvault_license_state';

export class GumroadLicenseManager {
  /**
   * @param {Object} options
   * @param {string} [options.productId]
   * @param {Function} [options.fetchFn]
   * @param {Object} [options.storage] - chrome.storage.local compatible object ({ get, set, remove })
   * @param {Function} [options.nowFn]
   */
  constructor(options = {}) {
    this.productId = options.productId || DEFAULT_PRODUCT_ID;
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.nowFn = options.nowFn || (() => Date.now());
    this.storage = options.storage || this._resolveDefaultStorage();
  }

  _resolveDefaultStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return {
        get: (key) =>
          new Promise((resolve) => {
            chrome.storage.local.get([key], (res) => resolve(res ? res[key] : null));
          }),
        set: (key, val) =>
          new Promise((resolve) => {
            chrome.storage.local.set({ [key]: val }, () => resolve(true));
          }),
        remove: (key) =>
          new Promise((resolve) => {
            chrome.storage.local.remove([key], () => resolve(true));
          })
      };
    }

    // Fallback to localStorage or in-memory map
    const mem = new Map();
    return {
      get: async (key) => {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        }
        return mem.get(key) || null;
      },
      set: async (key, val) => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, JSON.stringify(val));
          return true;
        }
        mem.set(key, val);
        return true;
      },
      remove: async (key) => {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
          return true;
        }
        mem.delete(key);
        return true;
      }
    };
  }

  /**
   * Evaluates a raw Gumroad API response payload with the strict 4-fold check.
   * @param {Object} data
   */
  evaluateGumroadPayload(data) {
    if (!data || data.success !== true || !data.purchase) {
      return {
        valid: false,
        reason: data?.message || 'Invalid license key or purchase record not found.'
      };
    }

    const p = data.purchase;
    if (p.refunded === true) {
      return { valid: false, reason: 'This license key has been refunded and is no longer active.' };
    }
    if (p.disputed === true) {
      return { valid: false, reason: 'This license key is under payment dispute and cannot be used.' };
    }
    if (p.chargebacked === true) {
      return { valid: false, reason: 'This license key was chargebacked and has been revoked.' };
    }

    const classification = classifyLicense(p);

    return {
      valid: true,
      ...classification,
      email: p.email || '',
      saleId: p.sale_id || p.id || '',
      uses: typeof data.uses === 'number' ? data.uses : 1,
      reason: 'Active license verified.'
    };
  }

  /**
   * Verifies a license key against Gumroad API v2 and persists the 7-day offline cache.
   * If a previously verified user hits a 5xx server error or network outage, extends grace period by 7 days.
   * @param {string} licenseKey
   * @param {Object} [options]
   * @param {boolean} [options.incrementUsesCount=false]
   */
  async verifyLicenseKey(licenseKey, { incrementUsesCount = false } = {}) {
    const cleanKey = String(licenseKey || '').trim();
    if (!cleanKey) {
      return { valid: false, tier: 'Free (50-Chat Cap)', reason: 'License key is empty.' };
    }

    const existingState = await this.storage.get(STORAGE_KEY);
    const now = this.nowFn();

    try {
      const bodyParams = new URLSearchParams({
        product_id: this.productId,
        license_key: cleanKey,
        increment_uses_count: incrementUsesCount ? 'true' : 'false'
      });

      const response = await this.fetchFn(GUMROAD_VERIFY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: bodyParams.toString()
      });

      // Check for Gumroad 5xx server outage
      if (response.status >= 500) {
        throw new Error(`Gumroad server error HTTP ${response.status}`);
      }

      const data = await response.json();
      const evalResult = this.evaluateGumroadPayload(data);

      if (evalResult.valid) {
        const stateRecord = {
          valid: true,
          licenseKey: cleanKey,
          tier: evalResult.tier,
          plan: evalResult.plan,
          email: evalResult.email,
          saleId: evalResult.saleId,
          verifiedAt: now,
          graceExpiresAt: now + SEVEN_DAYS_MS,
          everVerified: true
        };
        await this.storage.set(STORAGE_KEY, stateRecord);
        return {
          ...stateRecord,
          reason: evalResult.reason,
          fromCache: false
        };
      } else {
        // Explicit revocation (refunded / disputed / chargebacked / invalid) -> clear cache immediately
        if (existingState?.licenseKey === cleanKey) await this.storage.remove(STORAGE_KEY);
        return {
          valid: false,
          tier: 'Free (50-Chat Cap)',
          reason: evalResult.reason,
          fromCache: false
        };
      }
    } catch (networkOrServerError) {
      // Fault-tolerant grace extension for previously verified customers during Gumroad 5xx/offline outage
      if (
        existingState &&
        existingState.everVerified === true &&
        existingState.licenseKey === cleanKey
      ) {
        const extendedState = {
          ...existingState,
          valid: true,
          graceExpiresAt: now + SEVEN_DAYS_MS,
          lastOfflineExtensionAt: now
        };
        await this.storage.set(STORAGE_KEY, extendedState);
        return {
          ...extendedState,
          reason: 'Gumroad server unreachable (5xx/offline) — 7-day offline grace period automatically extended for verified customer.',
          fromCache: true,
          graceExtended: true
        };
      }

      return {
        valid: false,
        tier: 'Free (50-Chat Cap)',
        reason: `Could not reach Gumroad verification server: ${networkOrServerError.message}`,
        fromCache: false
      };
    }
  }

  /**
   * Checks current license status on startup.
   * Uses local cache if within 7-day grace window; triggers background re-verification if 7 days have elapsed.
   */
  async getLicenseStatus({ forceReverify = false } = {}) {
    const cached = await this.storage.get(STORAGE_KEY);
    if (!cached || !cached.licenseKey || !cached.valid) {
      return {
        valid: false,
        tier: 'Free (50-Chat Cap)',
        maxConversations: 50,
        reason: 'No active paid license. Free tier allows up to 50 full conversation transcripts.'
      };
    }

    const now = this.nowFn();
    if (!forceReverify && cached.graceExpiresAt && now < cached.graceExpiresAt) {
      return {
        ...cached,
        maxConversations: Infinity,
        fromCache: true,
        reason: 'License active (cached within 7-day verification window).'
      };
    }

    // 7 days expired -> re-verify with Gumroad (handles 5xx gracefully via verifyLicenseKey)
    const refreshed = await this.verifyLicenseKey(cached.licenseKey, { incrementUsesCount: false });
    return {
      ...refreshed,
      maxConversations: refreshed.valid ? Infinity : 50
    };
  }

  async clearLicense() {
    await this.storage.remove(STORAGE_KEY);
    return {
      valid: false,
      tier: 'Free (50-Chat Cap)',
      maxConversations: 50
    };
  }
}
