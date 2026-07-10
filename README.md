# GrowEasy AI CSV Importer

An AI-powered CSV importer: upload **any** CRM lead CSV (Facebook export, Google Ads, Excel, real-estate CRM dump — no fixed columns), and it intelligently maps every row into a standard **15-field CRM schema** using an LLM, validates and cleans the result deterministically, and shows it through a 4-step web UI.

**Approach in one line:** *LLM-led, code-guarded* — the LLM does the semantic mapping (arbitrary columns → schema, free text → enums); deterministic code owns the guarantees (validation, enum clamping, the skip rule, multi-email/phone consolidation, date checks).

> This repository currently sits at its **pre-build blueprint state**: the specification docs and directory scaffold are in place; the `backend/` and `frontend/` apps are created in the build phases. Read `MASTER_BLUEPRINT.md` top-to-bottom and build **one full phase per session**.

## What this project does
1. Accepts any valid CSV, no fixed column assumptions (drag-drop or file picker).
2. Previews the raw data in a scrollable, sticky-header table — no AI yet.
3. On confirm, sends rows to an LLM **in batches** for intelligent field mapping.
4. Validates every record deterministically: enforces the two enums, the skip rule (no email & no mobile → skipped), first-email/phone-wins with extras rolled into `crm_note`, `new Date()` date validity, and `\n` escaping.
5. Returns and displays parsed records + skipped records + totals.

## The 15 fields
`created_at, name, email, country_code, mobile_without_country_code, company, city, state, country, lead_owner, crm_status, crm_note, data_source, possession_time, description`
- `crm_status` ∈ `{GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE}` or `""`.
- `data_source` ∈ `{leads_on_demand, meridian_tower, eden_park, varah_swamy, sarjapur_plots}` or `""` (blank when unsure).

## Stack
Next.js (App Router) + TypeScript + Tailwind on the frontend · Node.js + Express + TypeScript on the backend · Google Gemini for field mapping (behind a swappable `LlmProvider`) · PapaParse for CSV.

## How to work this repo (for the building agent)
Build **one full phase per session**, respecting the gates in `MASTER_BLUEPRINT.md` Part IV:
```
Phase 0 Foundation → 1 CSV Parsing → 2 Extraction Core (the graded heart)
      → 3 Frontend (4-step wizard) → 4 UX/progress/dark-mode → 5 Bonuses → 6 Deploy & Submit
```
**Build the backend extraction core (Phases 0–2) and prove it on the four `docs/sample-data/` CSVs before building any UI.** A plain UI over a correct extractor passes; a beautiful UI over a broken one fails.

At the start of each session, paste the session prompt from `MASTER_BLUEPRINT.md` → "HOW TO USE THIS DOCUMENT".

## Documents
| File | Purpose |
|---|---|
| `MASTER_BLUEPRINT.md` | The full build spec: ground rules, locked decisions, technical reference, phase-by-phase program with acceptance criteria. **Start here.** |
| `docs/ROADBLOCKS.md` | Every realistic failure mode and its fix. **Read the moment anything breaks.** |
| `docs/PROMPT_ENGINEERING.md` | The extraction prompt, response schema, and few-shot examples — the graded core. |
| `docs/deep_dives/01_..._Backend_Extraction_Pipeline.md` | Parser, LLM client, extractor, validator, full API contract, SSE. |
| `docs/deep_dives/02_..._Frontend_Workflow.md` | The 4 steps, state machine, tables, progress, dark mode. |
| `docs/deep_dives/03_..._Deployment_and_Submission.md` | Vercel + Render, env vars, cold-start, README, the submission email. |
| `docs/PROGRESS.md` | Session-by-session build log — update every session. |
| `docs/sample-data/` | Four realistic CSVs to build and self-test against. |

## Deliverables (the assignment)
A publicly hosted app URL + a public GitHub repo URL + a README, emailed to **varun@groweasy.ai**, position stated (Intern / Full-Time). **Deadline: 12 July 2026.**

> Once built and deployed, the "How to work this repo" section above is replaced by the public-facing setup + live-demo README described in `docs/deep_dives/03` Phase 6.
