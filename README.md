# Synthetic Finance Data Generator

A Cloudflare Worker that generates **completely synthetic** finance/accounting
documents and communication artifacts (invoices, purchase orders, GRNs, bank
and credit-card statements, receipts, tax docs, emails, Slack events) for
testing an AI finance-operations agent end to end.

Every artifact is clearly marked synthetic: PDFs carry a visible
`DUMMY / SYNTHETIC TEST DOCUMENT` marker (top-right, non-removable), and every
document's `metadata` includes `synthetic: true`. No real people, companies,
bank accounts, or government identifiers are ever generated.

Scaffolded from the [Cloudflare `workers-builds-notifications-template`](https://github.com/cloudflare/templates/tree/main/workers-builds-notifications-template)
(wrangler/TypeScript/vitest setup + static asset serving), with the
build-notification logic replaced entirely by this generator. See
[code-prompt.md](./code-prompt.md) for the full product spec this implements.

## Architecture

```
Scenario Registry (25 benchmark scenarios)
   -> Synthetic Data Generator   (src/generators/*  - seeded RNG, IN + US)
   -> Mutation Library           (src/mutations.ts  - identity/tax/matching/bank/doc/comm)
   -> Validation Engine          (src/validators.ts - arithmetic, tax, 3-way match)
   -> Document Renderer          (src/renderers/*   - PDF/PNG/CSV/XLSX/JSON/TXT)
   -> Communications             (src/communications.ts - email/.eml, Slack events)
   -> API Layer                  (src/api.ts + src/index.ts)
```

One canonical schema per document family (`src/types.ts`) is shared across
every jurisdiction/variant, so the renderer, validators and mutation library
stay generic instead of needing one bespoke implementation per document type.

### Document types

**India:** GST/B2C/interstate/intrastate/export/SEZ/reverse-charge invoices,
bill of supply, credit/debit notes, purchase orders, GRNs, bank statements,
expense receipts, vendor master, GSTR-1/2B-like datasets, GST reconciliation
reports, TDS reports, journal entries.

**US:** commercial/service/recurring/subscription invoices, credit/debit
memos, purchase orders, receiving reports, bank + credit-card statements,
expense receipts, W-9, 1099-NEC/MISC, journal entries.

### Scenario engine

The centerpiece: `POST /scenario` runs one of 25 registered scenarios
(`GET /scenario` lists them) and returns a full bundle — linked documents,
emails, Slack events — plus **machine-readable ground truth** to score an
agent against: `expected_exceptions`, `expected_matches`,
`expected_actions`, `human_approval_required`, and
`dangerous_actions_that_must_not_be_automatic`. Everything is seeded, so the
same `scenario_id` + `jurisdiction` + `seed` always reproduces the same
bundle.

The flagship scenario is `invoice_grn_mismatch`: a linked
Purchase Order -> GRN -> Invoice chain where the received quantity falls
short, exactly like the spec's `PO=100 / GRN=95 / Invoice=100` example.

## API

| Endpoint | Purpose |
|---|---|
| `POST /generate` | Generate a single document (`jurisdiction`, `document_type`, `format`, optional `scenario`/`seed`/`template`) |
| `POST /generate/batch` | Generate up to 200 documents/scenario runs at once |
| `POST /scenario` | Run a named scenario, store it, return the full ground-truth bundle |
| `GET /scenario` | List available scenarios |
| `GET /scenario/:run_id` | Retrieve a previously run scenario bundle |
| `GET /document/:test_id?format=pdf` | Retrieve/re-render a previously generated document |
| `GET /health` | Health check |

Example:

```bash
curl -X POST https://<your-worker>/generate \
  -H 'content-type: application/json' \
  -d '{"jurisdiction":"IN","document_type":"gst_invoice","format":"pdf","seed":12345}'

curl -X POST https://<your-worker>/scenario \
  -H 'content-type: application/json' \
  -d '{"scenario_id":"invoice_grn_mismatch","jurisdiction":"IN"}'
```

Passing `"scenario"` on `/generate` as one of the mutation ids in
`src/mutations.ts` (e.g. `"incorrect_tax"`, `"wrong_gstin"`) applies that
single mutation to the generated document; `/scenario` and `/generate/batch`
with a registered `scenario_id` run the full scenario engine instead.

## Local development

```bash
npm install
npm run dev      # wrangler dev, http://localhost:8787
npm test         # vitest, runs against the real Workers runtime (miniflare)
npm run deploy   # wrangler deploy
```

This project uses a KV namespace (binding `DOCS`) to store generated
documents/scenario runs for later retrieval. Create your own and update
`wrangler.jsonc`:

```bash
npx wrangler kv namespace create DOCS
```

## Known limitations (by design — see `ponytail:` comments in source)

- **PNG export** is a from-scratch bitmap-font + minimal PNG encoder (no
  canvas/headless browser available in Workers), so it's a readable data
  summary, not a pixel-accurate render of the PDF layout.
- **PDF templates** are one parameterized layout engine with a handful of
  style variants (`modern`/`traditional`/`erp_style`/`spreadsheet_style`/
  `scanned_style`), not a distinct bespoke template per document type.
- **Rate limiting** is a coarse per-minute KV counter, not accurate under
  concurrent bursts — swap for a Durable Object counter if abuse becomes real.
- The `xlsx` npm package has two known advisories (prototype pollution /
  ReDoS) in its *parsing* path; this project only ever *writes* xlsx files
  from generated data, never parses untrusted input, so exposure is minimal.

Everything above has a clear upgrade path and is intentionally scoped this
way rather than half-built — extend by adding one generator/mutation/template
following the existing pattern.
