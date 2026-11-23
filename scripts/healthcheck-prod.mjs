import fs from 'node:fs';
import path from 'node:path';

/**
 * ChatVault Live Production Health & Launch Monitor
 * Checks all live endpoints, Gumroad License API, GitHub README, YouTube demo metadata, and SEO files.
 * Run: node scripts/healthcheck-prod.mjs
 */

const ENDPOINTS = [
  { name: 'Cloudflare Landing', url: 'https://chatvault-exporter.pages.dev/', mustContain: ['ChatVault', 'ydwizzle.gumroad.com/l/intercom-exporter', '/security-factsheet'] },
  { name: 'Cloudflare Workstation', url: 'https://chatvault-exporter.pages.dev/workstation', mustContain: ['runSandboxDemoBtn', 'filterStartDate', 'deepExportToggle', 'bundleZipToggle', 'xHRLb6ag8tx-PqVSO1E_Vw=='], checkJsUrl: 'https://chatvault-exporter.pages.dev/src/core/gumroad-license.js' },
  { name: 'Cloudflare Security Factsheet', url: 'https://chatvault-exporter.pages.dev/security-factsheet', mustContain: ['Zero-Data Architecture Factsheet', 'GDPR Art. 28'] },
  { name: 'Cloudflare Privacy', url: 'https://chatvault-exporter.pages.dev/privacy', mustContain: ['storage', 'host_permissions'], mustNotContain: ['<li><code>downloads</code>'] },
  { name: 'Cloudflare API Guide', url: 'https://chatvault-exporter.pages.dev/guide-missing-message-text', mustContain: ['Intercom REST API v2.11', 'starting_after'] },
  { name: 'Cloudflare Sitemap', url: 'https://chatvault-exporter.pages.dev/sitemap.xml', mustContain: ['<urlset', 'chatvault-exporter.pages.dev/workstation'] },
  { name: 'Cloudflare Robots', url: 'https://chatvault-exporter.pages.dev/robots.txt', mustContain: ['Sitemap: https://chatvault-exporter.pages.dev/sitemap.xml'] },
  { name: 'Google Verification File', url: 'https://chatvault-exporter.pages.dev/google0bb9cd8d06a09f7a.html', mustContain: ['google-site-verification: google0bb9cd8d06a09f7a.html'] },
  { name: 'Gumroad Public Product', url: 'https://ydwizzle.gumroad.com/l/intercom-exporter', mustContain: ['Basic', 'Pro', 'Agency', '2900'] },
  { name: 'GitHub Public Guide', url: 'https://raw.githubusercontent.com/Alexyoon1033/intercom-export-conversations-csv/main/README.md', mustContain: ['ejjialbdkhkphnlappeoiblihcmpkhmd', 'ydwizzle.gumroad.com/l/intercom-exporter', 'security-factsheet'], mustNotContain: ['pGLCiM-GZbg'] }
];

let failed = 0;

console.log(`=== ChatVault Production Healthcheck (${new Date().toISOString()}) ===\n`);

for (const ep of ENDPOINTS) {
  try {
    const res = await fetch(ep.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    let ok = res.status === 200;
    const issues = [];

    if (!ok) issues.push(`HTTP ${res.status}`);

    for (const token of ep.mustContain || []) {
      if (ep.checkJsUrl && token === 'xHRLb6ag8tx-PqVSO1E_Vw==') continue;
      if (!text.includes(token)) {
        ok = false;
        issues.push(`Missing "${token}"`);
      }
    }
    for (const forbidden of ep.mustNotContain || []) {
      if (text.includes(forbidden)) {
        ok = false;
        issues.push(`Forbidden "${forbidden}" found`);
      }
    }
    if (ep.checkJsUrl) {
      const jsRes = await fetch(ep.checkJsUrl);
      const jsText = await jsRes.text();
      if (!jsText.includes('xHRLb6ag8tx-PqVSO1E_Vw==')) {
        ok = false;
        issues.push('Missing live product_id in gumroad-license.js');
      }
    }

    if (ok) {
      console.log(`[PASS] ${ep.name} (HTTP 200)`);
    } else {
      failed++;
      console.log(`[FAIL] ${ep.name}: ${issues.join(', ')}`);
    }
  } catch (err) {
    failed++;
    console.log(`[FAIL] ${ep.name}: ${err.message}`);
  }
}

// Check Gumroad License Verify API live recognition
try {
  const apiRes = await fetch('https://api.gumroad.com/v2/licenses/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'product_id=xHRLb6ag8tx-PqVSO1E_Vw%3D%3D&license_key=HEALTHCHECK-INVALID-KEY'
  });
  const apiText = await apiRes.text();
  if (apiRes.status === 404 && apiText.includes('That license does not exist for the provided product')) {
    console.log('[PASS] Gumroad License Verify API (Live product_id recognized)');
  } else {
    failed++;
    console.log(`[FAIL] Gumroad License Verify API: HTTP ${apiRes.status} ${apiText}`);
  }
} catch (err) {
  failed++;
  console.log(`[FAIL] Gumroad License Verify API: ${err.message}`);
}

console.log(`\nSummary: ${ENDPOINTS.length + 1 - failed}/${ENDPOINTS.length + 1} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
