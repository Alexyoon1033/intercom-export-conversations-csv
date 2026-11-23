# ChatVault 1.2.2 seller checklist and copy

Update the store listing, extension file and customer-facing product copy together. Test the new license variant with a zero-charge seller test purchase before offering it to buyers.

1. Confirm that the current Chrome Web Store review is resolved. Submit the 1.2.2 ZIP and confirm the public listing actually serves 1.2.2 before offering the new Core Basic terms.
2. Add a separate Gumroad version named **Basic (Core export)** at $29. Keep the prior Basic version name and customer access intact. Never rename a legacy variant to the new name. In a zero-charge seller test, verify that the API returns the new version name, and confirm that an existing Basic key still retains prior features. Keep the current terms if either check fails.
3. Update the files and key blocks for the active versions using the same verified archive. Confirm the Pro and Agency key mapping with seller tests. Keep old customer entitlements and available files intact.
4. Match Gumroad copy to the public landing page and record the deployed commit and versions. Use the production endpoint check and the live browser flow after deployment.

## Display copy

- **Basic (Core export) · $29 one-time.** Archive your Intercom conversations to CSV, NDJSON or Markdown. Save to disk on supported browsers and pause a standard export to continue in a new file. A paid key removes the 50-conversation trial cap.
- **Pro · $79 one-time.** Everything in Core Basic, plus date, tag and state filters, contact enrichment, optional masking, ZIP bundles and a SHA-256 audit report.
- **Agency · $149 one-time.** The Pro export tools for agency client work under the seller's agency license terms. Verify the applicable license terms before publishing client-use claims.
- Try a 500-conversation synthetic sandbox or export up to 50 live conversations with the extension. Existing licenses retain their features. Gumroad emails the receipt and license key. Select Generate invoice if you need an invoice.
