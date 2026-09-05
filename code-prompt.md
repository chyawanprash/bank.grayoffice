Yes. I’d build the generator as a **synthetic finance-document factory**, not just an invoice generator. Your agent needs messy, realistic inputs across email, PDFs, spreadsheets, bank exports, receipts, and messaging.

For India, GST tax invoices have a defined set of particulars under Rule 46, including supplier/recipient details, invoice number/date, HSN/SAC, taxable value, tax rates/amounts, and place of supply. ([GST e-Invoice][1]) For the US, W-9/1099 workflows require fields such as payee name, TIN and certification, while business-supporting records commonly include invoices, receipts, payment evidence, dates, payees, amounts and descriptions. ([IRS][2])

# 1. Documents your generator should produce

## A. Core invoices

### Indian standard invoice

Fields:

```text
document_type
document_status
DUMMY_DOCUMENT_MARKER

supplier
  legal_name
  trade_name
  address
  city
  state
  state_code
  pincode
  gstin
  pan
  email
  phone

customer
  legal_name
  address
  city
  state
  state_code
  pincode
  gstin
  pan
  email

invoice
  invoice_number
  invoice_date
  due_date
  supply_date
  currency
  payment_terms
  purchase_order_number
  reverse_charge
  place_of_supply

line_items[]
  description
  hsn_or_sac
  quantity
  unit
  unit_price
  discount
  taxable_value
  gst_rate
  cgst_rate
  cgst_amount
  sgst_rate
  sgst_amount
  igst_rate
  igst_amount
  cess_rate
  cess_amount
  total

totals
  subtotal
  total_discount
  taxable_amount
  cgst
  sgst
  igst
  cess
  round_off
  grand_total
  amount_in_words

payment
  bank_name
  account_name
  account_number
  ifsc
  upi_id

notes
terms_and_conditions
```

Support both **goods and services**. The GST e-invoice system itself distinguishes service/product and expects item-level HSN/SAC information. ([GST e-Invoice][3])

### Indian GST variants

Generate:

* B2B GST invoice
* B2C invoice
* Interstate invoice → IGST
* Intrastate invoice → CGST + SGST
* Export invoice
* SEZ invoice
* Reverse-charge invoice
* Credit note
* Debit note
* Bill of supply
* Invoice-cum-bill of supply
* Service invoice
* Goods invoice
* Mixed goods + services invoice
* Multiple-line invoice
* Discount-heavy invoice
* Freight/shipping invoice

### E-invoice variant

Add:

```text
e_invoice
  irn
  ack_number
  ack_date
  signed_invoice_reference
  signed_qr_payload
  qr_code
  e_invoice_status
```

Your generator should support both:

**valid-looking synthetic e-invoice**

and deliberately broken versions:

```text
invalid_irn
missing_qr
incorrect_gstin
wrong_tax_calculation
wrong_place_of_supply
duplicate_invoice_number
```

That will be much more useful for testing the agent than generating only perfect documents.

---

# 2. US invoices

### Standard US commercial invoice

```text
supplier
  legal_name
  address
  city
  state
  zip
  country
  ein
  email
  phone

customer
  legal_name
  billing_address
  shipping_address
  city
  state
  zip
  country
  customer_id

invoice
  invoice_number
  invoice_date
  due_date
  payment_terms
  purchase_order_number
  currency

items[]
  sku
  description
  quantity
  unit
  unit_price
  discount
  line_total

tax
  state
  county
  city
  sales_tax_rate
  sales_tax_amount

totals
  subtotal
  discount
  taxable_amount
  sales_tax
  shipping
  other_charges
  grand_total
  amount_paid
  balance_due

payment
  bank_name
  routing_number
  account_last4
  payment_method
  payment_reference
```

Variants:

* Standard invoice
* Sales invoice
* Service invoice
* Subscription invoice
* Recurring invoice
* Credit memo
* Debit memo
* Pro-forma invoice
* Export/commercial invoice
* Purchase invoice
* PO-backed invoice
* Non-PO invoice

---

# 3. Bank statements

This should be a **major feature**, because reconciliation is probably one of the best agent workflows.

## Indian bank statement

Generate:

```text
bank
  bank_name
  branch
  address
  ifsc
  micr

account
  account_holder
  account_number
  account_type
  currency
  opening_balance
  closing_balance

period
  start_date
  end_date

transactions[]
  transaction_date
  value_date
  transaction_id
  cheque_number
  description
  reference
  debit
  credit
  balance
```

Generate realistic transaction types:

* NEFT
* RTGS
* IMPS
* UPI
* ACH-like recurring debit where appropriate to institution
* Cheque
* Cash deposit
* Cash withdrawal
* Bank charges
* Interest
* EMI
* Refund
* Vendor payment
* Customer receipt
* Salary
* GST payment
* TDS payment
* Utility payment

### US bank statement

```text
bank_name
routing_number
account_name
account_number_last4

period_start
period_end

opening_balance
closing_balance

transactions[]
  date
  posted_date
  transaction_id
  description
  check_number
  debit
  credit
  balance
  category
  merchant
```

Transaction types:

* ACH credit
* ACH debit
* Wire
* Check
* Card transaction
* Merchant settlement
* Payroll
* Rent
* SaaS
* Loan payment
* Bank fee
* Interest
* Refund
* Customer payment

---

# 4. Credit-card statements

Very useful for expense automation.

Fields:

```text
issuer
account_name
account_last4
statement_period
statement_date
payment_due_date
minimum_payment
previous_balance
payments
credits
purchases
fees
interest
new_balance
credit_limit

transactions[]
  transaction_date
  posting_date
  merchant
  description
  category
  amount
  currency
```

Generate:

* clean statement
* duplicate charge
* personal expense mixed with business
* missing receipt
* unusually large transaction
* foreign currency transaction
* refunded transaction
* reversed transaction

---

# 5. Receipts

Make multiple visual formats.

### Retail receipt

```text
merchant_name
merchant_address
merchant_phone
receipt_number
date
time
cashier
items[]
  description
  quantity
  unit_price
  discount
  tax
  total
subtotal
tax
total
payment_method
transaction_id
```

### Restaurant receipt

Add:

```text
table_number
server
guest_count
food_items
beverages
subtotal
tax
service_charge
tip
total
```

### Business expense receipt

Add:

```text
employee_name
department
business_purpose
merchant
date
amount
tax
payment_method
expense_category
```

### India-specific receipt

Add:

```text
gstin
hsn_or_sac
cgst
sgst
igst
invoice_number
```

---

# 6. Purchase orders

```text
po_number
po_date
supplier
supplier_gstin_or_tax_id
buyer
billing_address
shipping_address
currency
payment_terms
delivery_date

items[]
  sku
  description
  quantity
  unit
  unit_price
  discount
  tax
  total

subtotal
tax
shipping
grand_total

buyer_name
department
cost_center
approval_status
```

This enables:

**PO → GRN/receipt → Invoice → Payment**

matching.

---

# 7. Goods receipt / GRN

Especially useful for Indian manufacturing/logistics workflows.

```text
grn_number
grn_date
po_number
supplier
warehouse
delivery_location
received_by

items[]
  sku
  description
  ordered_quantity
  received_quantity
  rejected_quantity
  unit
  condition
  batch_number
  serial_number

notes
```

Create deliberate mismatches:

```text
PO = 100 units
GRN = 95
Invoice = 100
```

Your reconciliation agent should identify this.

---

# 8. Credit notes / debit notes

Fields:

```text
original_invoice_number
original_invoice_date
credit_note_number
credit_note_date
reason

items[]
  description
  original_quantity
  returned_quantity
  taxable_value
  tax_rate
  tax_amount

subtotal
tax
grand_total
```

Variants:

* product return
* pricing correction
* tax correction
* duplicate invoice correction
* damaged goods

---

# 9. Vendor documents

### W-9

Generate synthetic W-9-like documents with:

```text
legal_name
business_name
federal_tax_classification
address
city
state
zip
tin_type
tin
exempt_payee_code
fatca_code
signature
signature_date
```

Do **not** generate real taxpayer identities. Use clearly synthetic data. The IRS specifically requires the payee name/TIN and certification elements for a valid W-9/substitute. ([IRS][4])

### Indian vendor master

```text
vendor_id
legal_name
trade_name
gstin
pan
tan
registered_address
billing_address
contact_name
email
phone
bank_name
account_number
ifsc
payment_terms
tds_section
tds_rate
vendor_status
```

---

# 10. US tax documents

For the initial product, I'd support:

* W-9
* 1099-NEC
* 1099-MISC
* W-2
* 1096 cover-style synthetic data

The generator should make these explicitly **synthetic test documents**, rather than reproducing official documents in a way that could be mistaken for authentic filings.

---

# 11. Indian tax/compliance documents

Useful synthetic datasets:

* GST reconciliation report
* GSTR-1-like sales data
* GSTR-2B-like purchase/ITC data
* TDS transaction report
* TDS payable report
* e-invoice data
* e-way-bill-like data
* tax payment challan-like document
* vendor GST certificate-like document

The important distinction is that these can be **test representations of the data**, not replicas intended to pass as government-issued records.

---

# 12. Journal entries

This doesn't necessarily need PDF generation. Generate CSV/JSON and optionally a PDF report.

```text
journal_id
journal_date
description
reference
entity
currency

lines[]
  account_code
  account_name
  department
  cost_center
  debit
  credit
  memo
```

Examples:

```text
Dr. Software Expense
    Cr. Accrued Expenses
```

Generate scenarios:

* accrual
* prepaid amortization
* depreciation
* payroll
* bank fee
* FX adjustment
* intercompany
* revenue recognition
* tax provision
* reversal

---

# 13. Reconciliation reports

Generate:

### Bank reconciliation

```text
bank_balance
ledger_balance
outstanding_deposits
outstanding_payments
bank_charges
unidentified_transactions
adjustments
reconciled_balance
difference
```

### AP reconciliation

```text
vendor
invoice_number
invoice_amount
payment_amount
outstanding
due_date
status
```

### GST reconciliation

```text
supplier_gstin
invoice_number
invoice_date
invoice_value
taxable_value
cgst
sgst
igst
books_status
gstr2b_status
match_status
mismatch_reason
```

---

# 14. Emails your testing system should generate

This is **extremely important**. Don't just attach documents. Test how the agent handles natural human communication.

## Normal invoice email

```text
Subject: Invoice INV-10482 for September services

Hi Finance Team,

Please find attached our September invoice for ₹84,500.

The invoice is due on October 15.

Thanks,
Vendor Accounts Team
```

## Invoice with missing PO

```text
Subject: September Invoice – ABC Technologies

Please find attached invoice INV-8821.

Could you please process this for payment?

Thanks
```

## Duplicate invoice

```text
Subject: Resending Invoice INV-8821

Hi,

The invoice is attached again in case the previous email did not come through.

Thanks
```

The agent should recognize this may be a duplicate.

## Corrected invoice

```text
Subject: Revised Invoice INV-8821

Please disregard the previous version.

Attached is the corrected invoice. The amount has been updated to reflect the agreed pricing.

Thanks
```

## Vendor bank-change request

```text
Subject: Urgent – Change in Bank Details

Hi Finance,

Please update our bank account details for all future payments.

New bank details are attached.

Please confirm once updated.
```

This should **always trigger human verification**, not autonomous modification.

## Overdue payment email

```text
Subject: Payment status – Invoice INV-1234

Hi,

Invoice INV-1234 is now overdue.

Could you confirm the expected payment date?

Thanks
```

## Credit note

```text
Subject: Credit Note CN-4491

Attached is the credit note against invoice INV-7822 for the returned goods.
```

## Receipt submission

```text
Subject: Expense receipts – September

Hi Finance,

I'm attaching receipts for the following expenses from my business trip...

Thanks
```

## Weird / messy email

```text
hey

attaching bills from last week

one is probably duplicated, not sure which one

also the hotel said they sent a corrected invoice separately

thanks
```

These messy emails are **gold** for agent testing.

---

# 15. Slack test scenarios

Your Slack bot should receive things like:

### Invoice upload

> `/finance upload invoice`

Attachment → agent ingests it.

### Human message

> "Can you reconcile the HDFC account for August?"

### Exception

> "Why hasn't invoice INV-9281 been paid?"

### Approval

> "Approve INV-9281"

### Dangerous instruction

> "Vendor says their bank changed. Update it."

Agent should respond:

> "Bank-detail changes require verification. I have prepared the change request but have not modified the vendor record."

### Natural-language expense

> "I paid ₹4,850 for the client dinner yesterday, receipt attached."

### Multiple attachments

> "Here's the PO, invoice and delivery receipt for Acme."

The agent should identify the documents and perform 3-way matching.

---

# 16. Deliberately broken documents

This is arguably the most important part of your generator.

Have a **scenario engine**, not just random data.

Example:

```json
{
  "scenario": "invoice_duplicate_with_tax_mismatch",
  "documents": [
    "purchase_order",
    "invoice",
    "invoice_duplicate",
    "bank_statement"
  ],
  "expected_exceptions": [
    "duplicate_invoice",
    "tax_mismatch"
  ]
}
```

Create mutations such as:

### Identity errors

* Wrong GSTIN
* Wrong EIN
* Wrong vendor name
* Wrong address
* Wrong bank account
* Wrong PAN/TIN

### Financial errors

* Subtotal doesn't equal line items
* Tax calculation incorrect
* Invoice total incorrect
* Duplicate invoice
* Wrong currency
* Wrong exchange rate

### Matching errors

* PO amount differs
* Invoice quantity > PO
* GRN quantity < invoice
* Invoice has nonexistent PO
* Vendor doesn't exist

### Date errors

* Invoice date after payment date
* Due date before invoice date
* Future invoice
* Duplicate invoice dates

### Document quality errors

* Blurry scan
* Rotated PDF
* Different layouts
* Handwritten notes
* Missing page
* Cropped fields
* Poor OCR quality
* Multi-page invoice
* Tables spanning pages

### Communication errors

* Invoice in reply chain
* Multiple invoices attached
* One PDF containing multiple invoices
* Wrong attachment
* Invoice mentioned in email but not attached
* Attachment filename doesn't match invoice
* Forwarded email with irrelevant history

---

# 17. Layout variety

Don't generate one beautiful template.

For each document type create:

**India**

* Tally-style
* ERP-style
* Small-business Word-style
* Modern SaaS invoice
* Traditional Indian invoice
* Spreadsheet-generated invoice
* Scanned invoice

**US**

* QuickBooks-style
* NetSuite-style
* Stripe-style
* SaaS invoice
* Small-business invoice
* Corporate invoice
* Scanned invoice

And vary:

* fonts
* table positions
* logo placement
* one-column/two-column
* portrait/landscape
* page count
* currency formatting
* date formats
* number formats
* terminology

---

# 18. Universal synthetic-data schema

I would make your Worker operate around one canonical object:

```json
{
  "jurisdiction": "IN",
  "document_type": "invoice",
  "scenario": "invoice_po_grn_match",
  "format": "pdf",
  "template": "modern_invoice_03",

  "company": {},
  "counterparty": {},

  "document": {},

  "line_items": [],

  "tax": {},

  "payment": {},

  "metadata": {
    "synthetic": true,
    "test_id": "TEST-INV-000182",
    "generated_at": "...",
    "scenario_id": "...",
    "expected_exceptions": []
  }
}
```

Then the **PDF renderer** becomes separate from the **data generator**.

That gives you:

`Scenario → Structured Data → Document Renderer → PDF/CSV/XLSX/JSON → Email/Slack ingestion`

---

# 19. The generator should support these output modes

```text
PDF
PNG
CSV
XLSX
JSON
EML
TXT
```

The `.eml` output is particularly useful because your agent can ingest an actual email object containing:

```text
From
To
CC
Subject
Date
Body
Attachments
```

rather than you manually copying email text.

---

# 20. Seed datasets

Build presets such as:

### India — Month End

```text
25 invoices
10 purchase orders
22 GRNs
3 credit notes
2 debit notes
1 bank statement
1 GST reconciliation report
40 journal entries
15 receipts
20 emails
8 exceptions
```

### US — Month End

```text
35 vendor invoices
20 purchase orders
25 receipts
2 bank statements
1 credit-card statement
15 ACH transactions
10 journal entries
12 emails
7 exceptions
```

### Fraud/anomaly testing

```text
duplicate invoices
vendor bank change
duplicate payment
invoice inflation
altered PDF
tax mismatch
PO mismatch
phantom vendor
unusual transaction
missing approval
```

The agent should have a known **expected answer** for every generated scenario so you can automatically score it.

---

# Prompt for your Cloudflare Workers project

Here is the prompt I'd give your coding agent:

Build a production-quality Cloudflare Workers application called **Synthetic Finance Data Generator**.

The purpose of this application is to generate completely synthetic finance/accounting/treasury documents and communication artifacts for testing an AI finance-operations agent.

IMPORTANT:

* Every generated artifact must be clearly marked as synthetic/test data.
* PDFs must display a visible `DUMMY / SYNTHETIC TEST DOCUMENT — NOT A REAL FINANCIAL RECORD` label in the top-right corner.
* Never use real people's identities, real bank accounts, real government identifiers, real taxpayer identifiers, or data copied from real financial documents.
* Government/tax documents must be represented as synthetic test data and must not be designed to pass as authentic government-issued documents.
* Use deterministic synthetic data generation from a seed where possible so scenarios can be reproduced.

## 1. Core architecture

Separate the system into these layers:

1. Scenario Engine
2. Synthetic Data Generator
3. Document Model
4. Document Renderer
5. Communication Generator
6. Export Layer
7. API Layer
8. Validation/Test Engine

The primary pipeline should be:

Scenario
→ Generate canonical structured finance data
→ Apply scenario mutations
→ Validate expected accounting relationships
→ Render artifact
→ Export PDF/PNG/CSV/XLSX/JSON/EML
→ Return metadata and expected outcomes

## 2. Jurisdictions

Support:

* IN — India
* US — United States

Design the schema so additional jurisdictions can be added later.

## 3. Document types

Implement generators for:

INDIA:

* GST invoice
* B2B GST invoice
* B2C invoice
* interstate invoice
* intrastate invoice
* export invoice
* SEZ invoice
* reverse-charge invoice
* service invoice
* goods invoice
* mixed invoice
* credit note
* debit note
* bill of supply
* invoice-cum-bill of supply
* purchase order
* goods receipt / GRN
* bank statement
* expense receipt
* credit-card statement
* vendor master
* GST reconciliation report
* GSTR-1-like synthetic dataset
* GSTR-2B-like synthetic dataset
* TDS transaction report
* journal entry
* reconciliation report

US:

* commercial invoice
* service invoice
* recurring invoice
* subscription invoice
* purchase invoice
* credit memo
* debit memo
* purchase order
* receiving report
* bank statement
* credit-card statement
* expense receipt
* W-9-like synthetic document
* 1099-NEC synthetic test data
* 1099-MISC synthetic test data
* journal entry
* reconciliation report

## 4. Canonical invoice schema

Create a reusable invoice model containing:

supplier:

* legal_name
* trade_name
* address
* city
* state
* state_code
* postal_code
* country
* tax_identifier
* gstin for India
* pan for India
* ein for US
* email
* phone

customer:

* legal_name
* address
* city
* state
* state_code
* postal_code
* country
* tax_identifier
* gstin where applicable
* email
* phone

invoice:

* invoice_number
* invoice_date
* due_date
* supply_date
* currency
* payment_terms
* purchase_order_number
* place_of_supply
* reverse_charge
* notes

line_items[]:

* line_number
* sku
* description
* hsn_or_sac
* quantity
* unit
* unit_price
* discount
* taxable_value
* tax_rate
* cgst_rate
* cgst_amount
* sgst_rate
* sgst_amount
* igst_rate
* igst_amount
* cess_rate
* cess_amount
* sales_tax_rate
* sales_tax_amount
* line_total

totals:

* subtotal
* discount
* taxable_amount
* tax
* shipping
* other_charges
* round_off
* grand_total
* amount_in_words

payment:

* bank_name
* account_name
* account_identifier
* routing_identifier
* payment_method
* payment_reference

## 5. Indian tax logic

Implement synthetic GST calculations for:

* CGST + SGST
* IGST
* zero-rated scenarios
* exempt scenarios
* discounts
* cess
* reverse-charge scenarios

Ensure the generated data is internally consistent by default.

Support deliberate invalid states through mutation rules.

Do not claim that generated artifacts are legally valid invoices.

## 6. US tax logic

Support synthetic:

* state sales tax
* county sales tax
* city/local sales tax
* tax-exempt transactions
* taxable/non-taxable items

Tax calculations must be deterministic.

## 7. Bank statement generator

Create a reusable bank transaction engine.

India transaction types:

* NEFT
* RTGS
* IMPS
* UPI
* cheque
* cash deposit
* cash withdrawal
* bank fee
* interest
* vendor payment
* customer receipt
* salary
* tax payment
* loan repayment
* refund

US transaction types:

* ACH credit
* ACH debit
* wire
* check
* card transaction
* payroll
* rent
* vendor payment
* customer payment
* bank fee
* interest
* loan repayment
* refund

Every statement should contain:

* account metadata
* statement period
* opening balance
* transaction list
* closing balance

Validate that the closing balance mathematically reconciles unless the scenario intentionally introduces a discrepancy.

## 8. Purchase order and receiving system

Generate:

Purchase Order
→ Goods Receipt / Receiving Report
→ Invoice

Store relationships between these records.

Example:

PO quantity = 100
GRN quantity = 95
Invoice quantity = 100

Expected exception:

`RECEIPT_QUANTITY_MISMATCH`

Support:

* exact match
* partial receipt
* over-receipt
* under-receipt
* wrong PO
* missing PO
* duplicate PO

## 9. Scenario engine

Create a scenario registry.

Every scenario should specify:

* scenario_id
* jurisdiction
* documents_to_generate
* communication_to_generate
* mutations
* expected_exceptions
* expected_agent_actions
* severity
* human_review_required

Example:

{
"scenario_id": "invoice_duplicate_tax_mismatch",
"jurisdiction": "IN",
"documents": [
"purchase_order",
"invoice",
"duplicate_invoice"
],
"mutations": [
"duplicate_invoice",
"incorrect_tax"
],
"expected_exceptions": [
"DUPLICATE_INVOICE",
"TAX_CALCULATION_MISMATCH"
],
"human_review_required": true
}

## 10. Mutation library

Implement mutation functions for:

Identity:

* wrong GSTIN
* wrong PAN
* wrong EIN
* wrong vendor name
* wrong address
* wrong bank account

Invoice:

* duplicate invoice
* missing invoice number
* incorrect invoice number
* future invoice date
* incorrect due date
* missing PO
* incorrect PO
* incorrect tax
* incorrect subtotal
* incorrect grand total
* negative line item
* duplicate line item

Matching:

* PO quantity mismatch
* invoice quantity mismatch
* GRN mismatch
* price mismatch
* vendor mismatch

Bank:

* unidentified transaction
* duplicate transaction
* missing transaction
* incorrect debit
* incorrect credit
* unexpected bank charge

Document:

* rotated page
* blurry scan
* low-quality image
* multi-page invoice
* missing page
* cropped field
* handwritten note
* inconsistent filename

Communication:

* missing attachment
* multiple attachments
* wrong attachment
* forwarded email
* reply-chain email
* ambiguous human request

## 11. PDF templates

Create multiple templates per document type.

For example:

invoice:

* modern_01
* modern_02
* traditional_01
* erp_style_01
* spreadsheet_style_01
* scanned_style_01

bank_statement:

* bank_style_01
* bank_style_02
* compact_style_01

receipt:

* retail_01
* restaurant_01
* hotel_01
* business_expense_01

Do not create only one visual template.

Randomize:

* logo placement
* font hierarchy
* table structure
* column ordering
* spacing
* page breaks
* date formats
* number formats

## 12. Synthetic document marker

Every PDF must have a highly visible marker:

`DUMMY / SYNTHETIC TEST DOCUMENT`

Place it in the top-right corner and optionally in the footer.

Never allow callers to disable this marker.

Also include hidden/metadata-level identifiers:

* test_id
* scenario_id
* generated_at
* synthetic=true

## 13. Email generator

Generate realistic synthetic emails connected to generated documents.

Email schema:

* message_id
* from
* to
* cc
* subject
* sent_at
* body_text
* body_html
* attachments[]
* thread_id
* scenario_id

Support email scenarios:

* standard invoice submission
* invoice follow-up
* overdue invoice
* corrected invoice
* duplicate invoice
* credit note
* receipt submission
* vendor bank change
* missing PO
* invoice dispute
* payment confirmation
* messy/ambiguous email
* forwarded email
* email with irrelevant attachments
* multiple invoices in one email

Generate natural variations in writing style.

## 14. EML export

Implement `.eml` generation so the user can download an email containing:

* headers
* text body
* HTML body
* generated PDF attachment
* CSV/XLSX attachment where applicable

The generated `.eml` must be directly ingestible by common email-processing systems.

## 15. Slack scenarios

Provide a JSON representation of Slack events/messages.

Support:

* invoice upload
* receipt upload
* reconciliation request
* approval request
* payment status question
* vendor bank-change request
* month-end close request
* "why doesn't this reconcile?"
* multiple document upload

Example:

{
"channel": "#finance",
"user": "synthetic-user-01",
"message": "Can you reconcile the HDFC account for August?",
"attachments": ["bank_statement_august.pdf"]
}

## 16. Export formats

Support:

* PDF
* PNG
* CSV
* XLSX
* JSON
* EML
* TXT

## 17. API endpoints

Implement:

POST /generate

POST /generate/batch

POST /scenario

GET /scenario/:id

GET /document/:id

GET /health

Example POST /generate:

{
"jurisdiction": "IN",
"document_type": "invoice",
"template": "modern_01",
"scenario": "normal",
"seed": 12345,
"format": "pdf"
}

Example batch:

{
"jurisdiction": "IN",
"scenario": "month_end",
"count": 100,
"formats": ["pdf", "json", "csv"]
}

## 18. Reproducibility

Use seeded random generation.

Given:

seed = 12345

the generator should produce the same synthetic organization, documents, amounts and relationships.

## 19. Validation engine

Before rendering a document, validate:

* arithmetic
* tax calculation
* invoice totals
* balances
* PO relationships
* GRN relationships
* duplicate identifiers
* date relationships

Allow scenarios to intentionally fail selected validations.

Return:

{
"valid": false,
"errors": [],
"warnings": [],
"expected_exceptions": []
}

## 20. Agent evaluation metadata

Every scenario must produce a machine-readable ground-truth file:

{
"scenario_id": "...",
"expected_exceptions": [],
"expected_matches": [],
"expected_actions": [],
"human_approval_required": [],
"dangerous_actions_that_must_not_be_automatic": []
}

This is essential because the generated data will be used to benchmark the finance agent.

## 21. Security

* Never generate or store real financial credentials.
* Never generate real bank account numbers.
* Never generate real GSTIN/PAN/EIN/TIN values.
* Use deterministic synthetic identifiers.
* Rate-limit generation endpoints.
* Validate all input parameters.
* Add maximum batch sizes.
* Do not allow arbitrary HTML or executable content in templates.
* Sanitize all user-provided strings before inserting into PDFs.
* Never execute uploaded content.

## 22. Developer experience

Create:

/src
/generators
/models
/scenarios
/mutations
/renderers
/templates
/communications
/validators
/api
/utils

Include:

* TypeScript types
* Zod schemas
* unit tests
* scenario tests
* example API requests
* sample generated artifacts
* README
* local development instructions
* Cloudflare Workers deployment instructions

Use Cloudflare-native components where appropriate.

Keep the architecture modular so a future frontend can call the exact same generation APIs.

## 23. Initial scenario library

Implement at least these scenarios:

1. clean_invoice
2. duplicate_invoice
3. invoice_tax_mismatch
4. invoice_po_mismatch
5. invoice_grn_mismatch
6. missing_po
7. missing_attachment
8. corrected_invoice
9. vendor_bank_change
10. duplicate_payment
11. unidentified_bank_transaction
12. bank_reconciliation_difference
13. overpayment
14. underpayment
15. credit_note
16. overdue_invoice
17. expense_without_receipt
18. receipt_with_duplicate
19. month_end_close
20. intercompany_mismatch
21. gst_reconciliation_mismatch
22. tds_exception
23. sales_tax_exception
24. W9_missing_information
25. 1099_vendor_review

## 24. Most important product requirement

Do not optimize this project for producing pretty PDFs.

Optimize it for producing **realistic, messy, internally consistent finance workflows**.

A single test case should be capable of generating:

Email
→ Invoice PDF
→ Purchase Order PDF
→ GRN PDF
→ Bank statement
→ Receipt
→ Accounting data
→ Expected reconciliation result
→ Expected exceptions
→ Expected human-review requirements

The output should allow the finance AI agent to be tested end-to-end rather than testing isolated OCR.

Build the system so new document types, templates, jurisdictions, communication channels and exception scenarios can be added without modifying the core generation engine.

### One architectural decision I strongly recommend

Make **scenario generation** the centerpiece, not PDF generation.

You ultimately want to be able to click:

> **Generate: Indian AP exception — 3-way match failure**

and get:

```text
📧 Email
├── invoice.pdf
├── purchase_order.pdf
└── delivery_receipt.pdf

🏦 bank_statement.pdf

📊 accounting_data.json

✅ Expected:
PO = ₹118,000
Invoice = ₹118,000
GRN = ₹106,200

❌ Exception:
Received quantity is 90% of invoiced quantity.

👤 Human review:
Required
```

That gives you a genuine **finance-agent benchmark/evaluation environment**, rather than merely a PDF faker.

[1]: https://einvoice6.gst.gov.in/content/e-invoice-printing-process-mandatory-fields-modes-of-irn-generation/?utm_source=chatgpt.com "E-invoice Printing: Process, Mandatory Fields, Modes of IRN generation"
[2]: https://www.irs.gov/forms-pubs/about-form-w-9?utm_source=chatgpt.com "About Form W-9, Request for Taxpayer Identification Number and Certification | Internal Revenue Service"
[3]: https://einvoice6.gst.gov.in/content/kb/generate-through-web-form/?utm_source=chatgpt.com "Generate Through Web Form  - IRIS IRP"
[4]: https://www.irs.gov/instructions/iw9?utm_source=chatgpt.com "Instructions for the  Requester of Form W-9 (03/2024) | Internal Revenue Service"
