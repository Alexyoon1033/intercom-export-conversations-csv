# ChatVault launch checks

## Production verification

Run `node --test tests/chatvault.test.mjs` and `node scripts/healthcheck-prod.mjs` from the repository root. Check the public store version separately from submitted builds and Git tags. A synthetic demo and a public endpoint probe each validate a different part of the workflow.

For live validation, use an approved workspace and start with a small date range. Compare conversation IDs, messages, notes, and skipped records. Save and verify each segment. Time the run, record browser and API versions, and check representative long conversations and attachments. Test ZIP separately because it buffers output. Ask support only for redacted diagnostics, error codes, and version information.

## November 25 follow-up

- [Gumroad payment settings](https://gumroad.com/settings/payments) and [payouts](https://gumroad.com/payouts). Check the Stripe verification status and whether the payout pause has cleared. Approval timing varies after the account owner submits the requested information. The displayed $100 threshold is for available payout balance.
- [YouTube Studio](https://studio.youtube.com). Check advanced feature eligibility. Once enabled, test the video description links and keep a visible plain domain.
- [Search Console](https://search.google.com/search-console). Record sitemap status and URL Inspection results for the landing, guide, and workstation. A live test or an accepted request does not prove indexing. If a request hits quota, check again later.

## December 7 checkpoint

Record date range and traffic sources, qualified visits, demo starts, store visits and installs, checkout visits, genuine purchases at the public Basic $29, Pro $79, and Agency $149 prices, verified live exports, refunds, fees, and support time. Identify unavailable counts explicitly. Keep test orders out of sales metrics.

Pilot one additional adapter after the payout pause clears, two independent paying customers finish live exports, and contribution is positive after fees, refunds, and support time. Choose Zendesk or Crisp based on customer demand and verify one real workflow. Diagnose discovery when traffic is too low to draw a conclusion. Review the demo-to-checkout path when qualified traffic is present without sales. Keep spend at zero during initial validation.

Keep sales, fees, refunds, and payout records from the outset for accounting.
