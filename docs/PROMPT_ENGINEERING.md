# PROMPT ENGINEERING — The Extraction Core

> **This is the single most graded part of the assignment** ("AI Prompt Engineering: field extraction accuracy, intelligent mapping, messy/ambiguous data handling"). Everything here goes into `backend/src/prompts/extraction.ts`. The philosophy: **the LLM proposes, `validator.ts` disposes.** Ask the model for excellent output, but never depend on it — every rule here is also enforced deterministically downstream (see `deep_dives/01`). Belt and suspenders.

---

## 1. Design principles

1. **Give the model the original headers.** The whole task is mapping arbitrary columns → a fixed schema. Send each row as `{ "rowIndex": n, "cells": { "<Original Header>": "<value>", ... } }` so the model sees the source column names it must map *from*. Never pre-map or rename before sending.
2. **Force structure.** Use Gemini's `responseSchema` + `responseMimeType: "application/json"` so output is schema-valid JSON, not prose. Enums are declared in the schema so the model is nudged to the allowed values.
3. **`temperature: 0`.** This is extraction, not creativity. Deterministic, repeatable mapping.
4. **Echo `rowIndex`.** Join results to inputs by `rowIndex`, never by position (rows can be dropped/reordered — see ROADBLOCKS §B5).
5. **Batch.** 20 rows per call (`BATCH_SIZE`). Bounds output tokens, latency, and rate-limit exposure.
6. **Absent → `""`.** Instruct: never invent data; unknown fields are empty strings. Hallucinated data is the enemy of an extraction tool.
7. **Redundancy on purpose.** The prompt asks for the same rules the validator enforces (email/phone-first, enum clamping, date validity, note consolidation). If the model gets it right, great; if not, code fixes it. Both layers exist.

---

## 2. The system instruction (drop-in text)

```
You are a precise CRM data-extraction engine. You receive a batch of raw lead rows
from an arbitrary CSV (columns and formats vary wildly across sources — Facebook
exports, Google Ads, Excel sheets, real-estate CRMs). For EACH input row, output
one JSON object mapping it into this EXACT 15-field schema:

created_at, name, email, country_code, mobile_without_country_code, company, city,
state, country, lead_owner, crm_status, crm_note, data_source, possession_time,
description

Return a JSON array with one object per input row, echoing the row's "rowIndex".

RULES (follow exactly):
1. Never invent data. If a field is not present in the row, use "" (empty string).
   Every object must contain all 15 keys.
2. Map intelligently by MEANING, not exact header text. Examples of intent:
   - name: "Full Name", "Customer", "Lead Name", "Contact Person" → name
   - email: any email address column → email
   - phone: "Mobile", "Phone", "Cell", "WhatsApp", "Contact No" → the phone
   - company: "Company", "Organisation", "Firm" → company
   - notes: "Remarks", "Comments", "Notes", "Feedback", "Follow up" → crm_note
3. Phone handling: split the primary phone into country_code (digits only, no "+")
   and mobile_without_country_code (national number, no leading 0). If country code
   is not indicated, leave country_code "".
4. Multiple emails in the row: put the FIRST in email; append the others to crm_note
   as "Other emails: a@x.com, b@y.com". Same for multiple phone numbers:
   "Other phones: ...".
5. created_at: output as ISO "YYYY-MM-DD" if a date is present and parseable; if you
   cannot produce a valid date, use "". (The row's context is India — prefer
   day/month/year when ambiguous.)
6. crm_status: choose EXACTLY ONE of:
   GOOD_LEAD_FOLLOW_UP | DID_NOT_CONNECT | BAD_LEAD | SALE_DONE
   Guidance: interested / will call back / follow up / hot → GOOD_LEAD_FOLLOW_UP;
   no answer / unreachable / switched off / busy → DID_NOT_CONNECT;
   not interested / wrong number / junk / do not disturb → BAD_LEAD;
   booked / closed / purchased / sale done / won → SALE_DONE.
   If there is genuinely no status signal, use "".
7. data_source: choose EXACTLY ONE of:
   leads_on_demand | meridian_tower | eden_park | varah_swamy | sarjapur_plots
   ONLY when the row clearly references that source/project (by name or obvious code).
   If you are not confident, use "" — a wrong source is worse than a blank one.
8. crm_note: consolidate ALL leftover useful information here — remarks/comments/
   follow-up text, the extra emails/phones from rule 4, and any columns that do not
   map to a schema field — so no source information is lost. Keep it readable, e.g.
   "Remarks: ... | Other emails: ... | Budget: ...".
9. possession_time: real-estate possession/ready-to-move timeframe if present, else "".
10. Escape any line breaks inside a value as the two characters \n so each value is a
    single clean line.

Output JSON ONLY, matching the provided schema. No explanations, no markdown.
```

---

## 3. The response schema (Gemini structured output)

Declared in `prompts/extraction.ts` and passed as `config.responseSchema`. Conceptually (use the SDK's `Type`/schema builder; verify the exact enum/format keys against the current SDK — see ROADBLOCKS §B0):

```jsonc
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "rowIndex": { "type": "integer" },
      "created_at": { "type": "string" },
      "name": { "type": "string" },
      "email": { "type": "string" },
      "country_code": { "type": "string" },
      "mobile_without_country_code": { "type": "string" },
      "company": { "type": "string" },
      "city": { "type": "string" },
      "state": { "type": "string" },
      "country": { "type": "string" },
      "lead_owner": { "type": "string" },
      "crm_status": {
        "type": "string",
        "enum": ["GOOD_LEAD_FOLLOW_UP","DID_NOT_CONNECT","BAD_LEAD","SALE_DONE",""]
      },
      "crm_note": { "type": "string" },
      "data_source": {
        "type": "string",
        "enum": ["leads_on_demand","meridian_tower","eden_park","varah_swamy","sarjapur_plots",""]
      },
      "possession_time": { "type": "string" },
      "description": { "type": "string" }
    },
    "required": ["rowIndex","name","email","country_code","mobile_without_country_code",
                 "crm_status","crm_note","data_source"]
  }
}
```
> If the current Gemini SDK rejects `""` inside an `enum`, drop the empty string from the schema enum and rely on the **validator** to blank invalid/missing values (it does this anyway). The schema is a nudge; the validator is the guarantee. Keep `required` short so the model isn't forced to fabricate optional fields.

---

## 4. Few-shot examples (include 2–3 in the prompt)

Put these as a worked `input → output` pair block before the real batch. They teach the model the hard cases far better than instructions alone.

### Example A — weird headers, multiple emails, free-text status
**Input row:**
```json
{ "rowIndex": 0, "cells": {
  "Cust Full Nm": "  Ramesh Kumar ",
  "E-mail id": "ramesh@gmail.com; ramesh.k@work.com",
  "Mob No.": "+91 98765 43210",
  "Firm": "Kumar Traders",
  "Remark": "Interested, asked to call back next week",
  "Src": "Eden Park enquiry"
}}
```
**Expected output object:**
```json
{ "rowIndex": 0, "created_at": "", "name": "Ramesh Kumar",
  "email": "ramesh@gmail.com", "country_code": "91",
  "mobile_without_country_code": "9876543210", "company": "Kumar Traders",
  "city": "", "state": "", "country": "", "lead_owner": "",
  "crm_status": "GOOD_LEAD_FOLLOW_UP",
  "crm_note": "Remarks: Interested, asked to call back next week | Other emails: ramesh.k@work.com",
  "data_source": "eden_park", "possession_time": "", "description": "" }
```

### Example B — real-estate row, possession, no clear source, only a phone
**Input row:**
```json
{ "rowIndex": 1, "cells": {
  "Name": "Anita S",
  "Contact": "9123456789",
  "Requirement": "2BHK, ready to move in 6 months",
  "Status": "Not reachable - tried twice",
  "City": "Bengaluru"
}}
```
**Expected output object:**
```json
{ "rowIndex": 1, "created_at": "", "name": "Anita S", "email": "",
  "country_code": "", "mobile_without_country_code": "9123456789",
  "company": "", "city": "Bengaluru", "state": "", "country": "",
  "lead_owner": "", "crm_status": "DID_NOT_CONNECT",
  "crm_note": "Requirement: 2BHK", "data_source": "",
  "possession_time": "6 months", "description": "2BHK, ready to move in 6 months" }
```
*(Note: no email but a mobile is present → this row is KEPT. If it had neither, the validator would skip it — the model still outputs it; the skip is a code decision.)*

### Example C — a row that will be SKIPPED downstream (no email, no phone)
**Input row:**
```json
{ "rowIndex": 2, "cells": { "Name": "Walk-in enquiry", "Notes": "left brochure" }}
```
**Expected output object** (model still maps it; `validator.ts` drops it as "no email or mobile"):
```json
{ "rowIndex": 2, "created_at": "", "name": "Walk-in enquiry", "email": "",
  "country_code": "", "mobile_without_country_code": "", "company": "", "city": "",
  "state": "", "country": "", "lead_owner": "", "crm_status": "",
  "crm_note": "Notes: left brochure", "data_source": "", "possession_time": "",
  "description": "" }
```

---

## 5. User-message assembly (per batch)

```
<the system instruction from §2>

Here are worked examples:
<Example A input/output>
<Example B input/output>
<Example C input/output>

Now map this batch. Return one object per row, echoing rowIndex:
<JSON.stringify(batchRows)>
```
Keep examples static (cached mentally by the model); only the final batch array changes.

---

## 6. Tuning & failure guidance
- **Accuracy low on a source?** Add one few-shot example resembling that source's headers. Two good examples beat ten instruction lines.
- **Model over-fills `data_source`?** Strengthen rule 7 + add a "no confident source → `""`" example (Example B does this). Validator clamps anyway.
- **Enum drift** (`"Good Lead"` instead of `GOOD_LEAD_FOLLOW_UP`)? The validator normalizes case/spaces/underscores and maps common phrasings; keep the enum in the schema as a nudge.
- **JSON errors / truncation?** See ROADBLOCKS §B4 — smaller batch, defensive parse, retry.
- **Don't over-prompt.** If the prompt balloons past ~2 pages, you're compensating for something the validator should own. Move guarantees to code.

---

*The prompt's job is a strong first draft of each record. `validator.ts` is what makes the output correct and safe. Build both; trust only the second.*
