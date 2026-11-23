# ChatVault Launch Audit & Day 14 (2026-12-07) Operations Checklist

## 1. Automated Healthcheck Command
Run anytime to verify all 11 live production surfaces (Cloudflare Pages, Sitemap, Google Verification, Gumroad Product + License API, GitHub README, YouTube Demo):

```powershell
node c:\YDW\AI\Antigravity\chatvault-intercom-exporter\scripts\healthcheck-prod.mjs
```

---

## 2. User-Only Verification Actions (Requires Owner ID / Biometrics)

### A. Gumroad / Stripe Payout Verification (Highest Priority)
- **URL:** `https://gumroad.com/settings/payments`
- **Action:** Click **Complete pending verification requirements via Stripe** and submit matching legal name, date of birth, Slovakia address, and government ID (passport or Slovak residence permit).
- **Post-Submission Verification:** Check `https://gumroad.com/payouts` after 24–72 hours to confirm the banner `"Your payouts are currently paused by Stripe"` disappears.
- **Note:** Gumroad only pays out once available balance reaches `$100` (no upfront deposit required).

### B. YouTube Channel Advanced Features (Clickable External Links)
- **URL:** `https://studio.youtube.com` → **Settings → Channel → Feature eligibility → Advanced features**
- **Action:** Complete Video Verification or Valid ID Verification (or wait for channel history) so the 5 URLs in `https://youtu.be/pGLCiM-GZbg` become clickable blue links.
- *(Interim mitigation already live: line 1 of the video description now reads `Try the free demo at chatvault-exporter.pages.dev`.)*

### C. Google Search Console Sitemap & Indexing Follow-Up (Check in 24–48h)
- **URL:** `https://search.google.com/search-console` (`https://chatvault-exporter.pages.dev`)
- **Action:**
  1. Open **Sitemaps** and verify `sitemap.xml` transitions from `Couldn't fetch` to `Success` (4 discovered pages).
  2. Once daily URL inspection quota resets tomorrow, request indexing for:
     - `https://chatvault-exporter.pages.dev/`
     - `https://chatvault-exporter.pages.dev/guide-missing-message-text`
     - `https://chatvault-exporter.pages.dev/workstation`

---

## 3. Day 14 (2026-12-07) Conservative Go / No-Go Decision Gate

Evaluate on **2026-12-07** using real production metrics (Chrome Web Store Dashboard, Gumroad Sales/Payouts, Search Console, GitHub Insights, YouTube Studio):

- **GO Signal (Expand to 1 Platform First — Zendesk OR Crisp, NOT both at once):**
  1. Stripe payout pause is **completely resolved**.
  2. At least **2 independent paying customers** have purchased (`$49` or `$129`) and completed real exports without unresolved refund/support issues.
  3. Net profit after Gumroad fees, refunds, and support time is positive.
  - **Next Action on GO:** Clone the 90% shared core engine with `src/adapters/zendesk.js` (`$0` extra store registration fee) and validate Product #2 alone before building Product #3 (`src/adapters/crisp.js`).

- **HOLD / STOP Signal:**
  - If `<2` independent paying customers by 2026-12-07, spend `€0` on paid ads or extra features. Keep the live organic funnel running passively and record learnings.

---

## 4. Tax & Accounting Reserve Rule (Slovakia)
- From the first Gumroad EUR payout into your Slovak IBAN, set aside **25% of net profit** into a dedicated tax reserve for annual Slovak personal income tax (`Daňové priznanie`). Evaluate `živnosť` registration only if recurring monthly revenue scales consistently.
