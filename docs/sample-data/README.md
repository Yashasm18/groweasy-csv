# Sample Data — the acceptance corpus

Four realistic CSVs to **build and self-test against** (Blueprint Inviolable Rule 5). After every backend change, run all four through `/api/import` and eyeball the output. Each file deliberately stresses different parts of the pipeline. Expected behaviors below are the acceptance criteria — if the output doesn't match, the fix is usually in `validator.ts` or `PROMPT_ENGINEERING.md`, not elsewhere.

## 1. `facebook_leads_export.csv` — Facebook Lead Ads style
- Comma-delimited, **ISO 8601 dates with timezone** (`2026-06-15T10:23:45+0530` → `new Date()` parses fine).
- Weird-but-common headers (`full_name`, `phone_number`, `what_is_your_budget?`).
- Phones with `+91`, spaces, dashes, and a bare `919...` → country-code split.
- `campaign_name` references projects ("Eden Park", "Sarjapur Plots", "Meridian Tower") → `data_source` should map for those, **blank for "General Retargeting"** (don't over-guess).
- `platform` (ig/fb) and `what_is_your_budget?` don't map to a field → into `crm_note`/`description`.
- Rows 1003 (no email) and 1004 (no phone) each still have the other → **kept**.
- **Expected:** 8 rows, 8 parsed, 0 skipped.

## 2. `google_ads_leads.csv` — Google Ads lead form style
- **Semicolon-delimited** (tests delimiter auto-detection — ROADBLOCKS §C2).
- **DD/MM/YYYY HH:MM dates** (tests §D2 — the LLM should normalize to ISO or the validator blanks invalid).
- Leading-zero phones (`09811223344`) and a `+91 90080 12345` → normalize + split.
- `Lead Status` is free text → enum: "Interested - call back"→`GOOD_LEAD_FOLLOW_UP`, "No answer"/"Switched off"→`DID_NOT_CONNECT`, "Wrong number"/"Not interested"→`BAD_LEAD`, "Booked - token paid"→`SALE_DONE`.
- `Ad Group` hints projects (Sarjapur/Meridian/Eden) → `data_source` when confident.
- Row GA-505 has no email but a phone → **kept**.
- **Expected:** 8 rows, 8 parsed, 0 skipped.

## 3. `realestate_crm_dump.csv` — real-estate CRM export
- Clean comma CSV with **quoted remarks containing commas** (tests §C1 — never hand-split).
- `Project` → `data_source` (Eden Park→`eden_park`, Varah Swamy→`varah_swamy`, Meridian Tower→`meridian_tower`, Sarjapur Plots→`sarjapur_plots`).
- `Possession` → `possession_time`; `Assigned To` → `lead_owner`; `Remarks` → `crm_note`.
- `Status` free text → enum (Hot/Follow up/Callback/Interested→`GOOD_LEAD_FOLLOW_UP`, "Did not pick up"→`DID_NOT_CONNECT`, "Sale done"→`SALE_DONE`, "Not interested"→`BAD_LEAD`).
- **Last row "Anonymous Walkin" has no email and no phone → SKIPPED** with reason "no email or mobile".
- **Expected:** 8 rows, 7 parsed, **1 skipped**.

## 4. `messy_edgecases.csv` — the torture test (run this most)
Comma CSV with cryptic headers (`Cust Nm`, `e mail`, `Mob`, `Alt Contact`). Row-by-row expectations:
1. **Anil Kapoor** — 3 emails in one cell (`;` and `,` separated) → first is `email`, other two → `crm_note` ("Other emails: …"); 2 phones (`/` separated) → first is mobile, second → `crm_note`; quoted note with a comma stays intact.
2. **Just A Name** — no email, no phone → **SKIPPED**.
3. **Beena Thomas** — Excel serial date `45890` (LLM converts or validator blanks); leading-zero phone `09811122233`; `Source: leads on demand` → `leads_on_demand`; "not reachable" → `DID_NOT_CONNECT`.
4. **Harish Rao** — epoch-ms date `1749974400000`; phone `919812345678` (country code embedded, no `+`) → split `91` + `9812345678`; "closed won" → `SALE_DONE`; "Eden Park" → `eden_park`.
5. **Sara Ali** — **embedded newline inside the quoted note** → must be escaped to `\n`; "DND do not call" → `BAD_LEAD`; email only, no phone → **kept**.
6. **Manoj Nair** — 2 emails (comma) → first + overflow; spaced `+91 98765 43210`; ambiguous text date "June 20 2026"; "meridian tower" → `meridian_tower`.
7. **Farhan Qureshi** — primary `Mob` empty but `Alt Contact` has a number → phone found via the alt column (validator scans all cells); no email but phone → **kept**.
8. **José Fernández** — accented unicode name (UTF-8); no status signal → `crm_status: ""` (don't force a value).

- **Expected:** 8 rows, **7 parsed, 1 skipped** (row 2). Every kept row has all 15 keys, valid or blank `created_at`, clamped enums, and no raw newlines in any value.

---

**Note:** these are synthetic — invented names, emails, and numbers for testing only. They are the **only** lead data that belongs in the repo; never commit real customer CSVs.
